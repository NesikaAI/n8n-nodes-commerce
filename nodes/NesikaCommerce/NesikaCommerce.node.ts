import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { nesikaCommerceProperties } from './properties';
import { CREDENTIAL_NAME, runOperation, trimBaseUrl } from './transport';

/** Where each operation posts, and which response field holds its list of results. */
const OPERATIONS: Record<string, { path: string; resultsField?: string }> = {
	search: { path: '/commerce/search-products', resultsField: 'candidates' },
	resolve: { path: '/commerce/resolve-product' },
	findOffers: { path: '/commerce/find-offers', resultsField: 'offers' },
	deepSearch: { path: '/commerce/deep-search', resultsField: 'results' },
};

const IDENTITY_FIELDS = [
	'canonical_id',
	'canonical_name',
	'variant',
	'model',
	'sku',
	'barcode',
	'gtin',
	'brand',
	'description',
	'source_url',
];

/** Keeps only the entries a user actually filled in. */
function withoutEmptyValues(values: IDataObject): IDataObject {
	const result: IDataObject = {};
	for (const [key, value] of Object.entries(values)) {
		if (value === undefined || value === null || value === '') {
			continue;
		}
		if (Array.isArray(value) && value.length === 0) {
			continue;
		}
		result[key] = value;
	}
	return result;
}

function splitTerms(value: string): string[] {
	return value
		.split(',')
		.map((term) => term.trim())
		.filter((term) => term.length > 0);
}

/**
 * Normalises a market code. The API takes any ISO 3166-1 alpha-2 country code and refuses
 * anything that is not a country, so "UK" becomes "GB" rather than an error the user has to
 * work out for themselves.
 */
function normaliseMarket(value: unknown): string | undefined {
	if (typeof value !== 'string' || value.trim() === '') {
		return undefined;
	}
	const code = value.trim().toUpperCase();
	return code === 'UK' ? 'GB' : code;
}

/** Drops blank entries a user left behind in a repeated field. */
function cleanList(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
		.filter((entry) => entry.length > 0);
}

/** Builds the market, retailer, category and price fields the wide operations share. */
function buildSharedFields(options: IDataObject): IDataObject {
	const fields: IDataObject = {};
	const market = normaliseMarket(options.market);
	if (market) {
		fields.market = market;
	}
	const retailers = cleanList(options.merchantIds);
	if (retailers.length > 0) {
		fields.merchant_ids = retailers;
	}
	if (typeof options.categoryTerms === 'string' && options.categoryTerms.trim() !== '') {
		fields.category_terms = splitTerms(options.categoryTerms);
	}

	const price: IDataObject = {};
	if (typeof options.priceMinimum === 'number' && options.priceMinimum > 0) {
		price.minimum = options.priceMinimum;
	}
	if (typeof options.priceMaximum === 'number' && options.priceMaximum > 0) {
		price.maximum = options.priceMaximum;
	}
	if (Object.keys(price).length > 0) {
		price.currency = (options.priceCurrency as string | undefined) ?? 'AUD';
		fields.price = price;
	}

	return fields;
}

function buildIdentity(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): IDataObject {
	const identity = withoutEmptyValues(
		context.getNodeParameter('identity', itemIndex, {}) as IDataObject,
	);
	const productName = context.getNodeParameter('productName', itemIndex, '') as string;
	if (productName.trim() !== '') {
		identity.canonical_name = productName.trim();
	}

	const named = IDENTITY_FIELDS.some((field) => identity[field] !== undefined);
	if (!named) {
		throw new NodeOperationError(
			context.getNode(),
			'Name the product before running this operation.',
			{
				itemIndex,
				description:
					operation === 'findOffers'
						? 'Fill in Product Name, or add an identifier such as GTIN or Model under Product Identifiers.'
						: 'Fill in Product Name, or add an identifier under Product Identifiers, or switch Search By to Query.',
			},
		);
	}

	return identity;
}

function buildBody(context: IExecuteFunctions, itemIndex: number, operation: string): IDataObject {
	const budget = withoutEmptyValues(
		context.getNodeParameter('workBudget', itemIndex, {}) as IDataObject,
	);
	const body: IDataObject = {};

	if (operation === 'resolve') {
		const options = context.getNodeParameter('resolveOptions', itemIndex, {}) as IDataObject;
		const identifiers = withoutEmptyValues((options.identifiers as IDataObject) ?? {});
		Object.assign(body, identifiers);

		const market = normaliseMarket(options.market);
		if (market) {
			body.market = market;
		}
		const retailer = typeof options.merchantId === 'string' ? options.merchantId.trim() : '';
		if (retailer !== '') {
			body.merchant_id = retailer;
		}

		const resolveBy = context.getNodeParameter('resolveBy', itemIndex) as string;
		const value = (context.getNodeParameter(resolveBy, itemIndex, '') as string).trim();
		if (value === '') {
			throw new NodeOperationError(
				context.getNode(),
				resolveBy === 'url' ? 'Product URL is empty.' : 'Title is empty.',
				{ itemIndex },
			);
		}
		body[resolveBy] = value;
	} else {
		const options = context.getNodeParameter('options', itemIndex, {}) as IDataObject;
		Object.assign(body, buildSharedFields(options));

		if (operation === 'search') {
			body.query = context.getNodeParameter('query', itemIndex) as string;
		}

		if (operation === 'findOffers') {
			body.identity = buildIdentity(context, itemIndex, operation);
		}

		if (operation === 'deepSearch') {
			body.reason = context.getNodeParameter('reason', itemIndex) as string;
			const searchBy = context.getNodeParameter('deepSearchBy', itemIndex) as string;
			if (searchBy === 'query') {
				body.query = context.getNodeParameter('query', itemIndex) as string;
			} else {
				body.product = buildIdentity(context, itemIndex, operation);
			}
		}
	}

	if (Object.keys(budget).length > 0) {
		body.budget = budget;
	}

	return body;
}

/**
 * Builds the value of the `Idempotency-Key` header, which the API requires.
 *
 * The key is the same on every attempt of the same item in the same execution, so an n8n
 * retry replays the first call instead of paying for a second one. It changes between
 * executions, so a scheduled workflow gets fresh data each run.
 */
function buildIdempotencyKey(context: IExecuteFunctions, itemIndex: number): string {
	const raw = `n8n-${context.getExecutionId()}-${context.getNode().name}-${itemIndex}`;
	// The API refuses a key that holds a comma or a control character, and caps it at 128.
	const safe = Array.from(raw, (character) => {
		const code = character.charCodeAt(0);
		return character === ',' || code < 0x20 || code === 0x7f ? '-' : character;
	}).join('');
	return safe.slice(0, 128);
}

export class NesikaCommerce implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Nesika Commerce',
		name: 'nesikaCommerce',
		icon: { light: 'file:nesika.svg', dark: 'file:nesika.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Search retailer products, resolve product identities and read live prices',
		defaults: { name: 'Nesika Commerce' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'nesikaCommerceApi',
				required: true,
			},
		],
		properties: nesikaCommerceProperties,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const output: INodeExecutionData[] = [];
		const credentials = await this.getCredentials(CREDENTIAL_NAME);
		const baseUrl = trimBaseUrl(credentials.baseUrl as string);

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				const endpoint = OPERATIONS[operation];
				if (!endpoint) {
					throw new NodeOperationError(this.getNode(), `Unknown operation "${operation}".`, {
						itemIndex,
					});
				}

				const jobOptions = this.getNodeParameter('jobOptions', itemIndex, {}) as IDataObject;
				const waitForCompletion = (jobOptions.waitForCompletion as boolean | undefined) ?? true;
				const userKey = ((jobOptions.idempotencyKey as string | undefined) ?? '').trim();

				const { response, job, usage } = await runOperation(this, {
					baseUrl,
					path: endpoint.path,
					body: buildBody(this, itemIndex, operation),
					idempotencyKey: userKey === '' ? buildIdempotencyKey(this, itemIndex) : userKey,
					waitForCompletion,
					maxWaitSeconds: (jobOptions.maxWaitSeconds as number | undefined) ?? 900,
					itemIndex,
				});

				const outputMode = (jobOptions.output as string | undefined) ?? 'results';
				// What the call cost belongs with the whole response, not repeated on every result.
				const nesika: IDataObject = { ...usage };
				if (job?.job_id) {
					nesika.jobId = job.job_id;
					if (typeof job.units_charged === 'number') {
						nesika.dataPointsCharged = job.units_charged;
					}
				}
				const results = endpoint.resultsField
					? (response[endpoint.resultsField] as IDataObject[] | undefined)
					: undefined;

				if (!waitForCompletion || outputMode === 'response' || results === undefined) {
					output.push({
						json: { ...response, nesika },
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				if (results.length === 0) {
					output.push({
						json: { ...response, [endpoint.resultsField as string]: [], nesika },
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				for (const result of results) {
					output.push({ json: result, pairedItem: { item: itemIndex } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					output.push({
						json: { error: (error as Error).message },
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				// Errors raised inside this node already say what went wrong and at which item.
				// Anything else is wrapped so a workflow author still sees the item it came from.
				throw error instanceof NodeApiError || error instanceof NodeOperationError
					? error
					: new NodeOperationError(this.getNode(), error as Error, { itemIndex });
			}
		}

		return [output];
	}
}
