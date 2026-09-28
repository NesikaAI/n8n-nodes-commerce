import type { INodeProperties } from 'n8n-workflow';

/**
 * Retailer names the API knows. Any retailer website works too, so this list is help text
 * rather than a closed set.
 */
const NAMED_RETAILERS =
	'"BigW", "Kmart", "BunningsWarehouse", "Coles", "Woolworths", "ChemistWarehouse" or "TheRejectShop"';

const ALL_OPERATIONS = ['search', 'resolve', 'findOffers', 'deepSearch'];

/** Operations that accept the shared market, retailer, category and price filters. */
const MARKET_WIDE_OPERATIONS = ['search', 'findOffers', 'deepSearch'];

export const nesikaCommerceProperties: INodeProperties[] = [
	{
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: [{ name: 'Product', value: 'product' }],
		default: 'product',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['product'] } },
		options: [
			{
				name: 'Search',
				value: 'search',
				description: 'Find products across retailers from a shopping phrase. Costs 5 data points.',
				action: 'Search products across retailers',
			},
			{
				name: 'Resolve',
				value: 'resolve',
				description: 'Turn a messy product title or URL into one confirmed product identity. Costs 3 data points.',
				action: 'Resolve a product identity',
			},
			{
				name: 'Find Offers',
				value: 'findOffers',
				description: 'Get current prices and availability for a known product. Costs 5 data points.',
				action: 'Find offers for a product',
			},
			{
				name: 'Deep Search',
				value: 'deepSearch',
				description: 'Research one missing fact about a product across retailers. Costs 10 data points.',
				action: 'Run a deep product search',
			},
		],
		default: 'search',
	},

	// ---------------------------------------------------------------- Search
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'noise cancelling headphones under $400',
		description: 'Shopping request in plain words. Keep colour, capacity and size words: they are part of the query, not noise.',
		displayOptions: { show: { resource: ['product'], operation: ['search'] } },
	},

	// --------------------------------------------------------------- Resolve
	{
		displayName: 'Identify By',
		name: 'resolveBy',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Product Title', value: 'title' },
			{ name: 'Product Page URL', value: 'url' },
		],
		default: 'title',
		description: 'Which input describes the product. A URL gives the most reliable answer.',
		displayOptions: { show: { resource: ['product'], operation: ['resolve'] } },
	},
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'Sony WH-1000XM5 Wireless Headphones Black',
		description: 'Product title or name, however messy',
		displayOptions: {
			show: { resource: ['product'], operation: ['resolve'], resolveBy: ['title'] },
		},
	},
	{
		displayName: 'Product URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://www.johnlewis.com/example/p123456',
		description: 'Product page URL at any public retailer website. This is the strongest input, because the page is read directly and the search stage is skipped.',
		displayOptions: {
			show: { resource: ['product'], operation: ['resolve'], resolveBy: ['url'] },
		},
	},

	// ---------------------------------------------- Find Offers / Deep Search
	{
		displayName: 'Search By',
		name: 'deepSearchBy',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Query', value: 'query' },
			{ name: 'Known Product', value: 'product' },
		],
		default: 'query',
		description: 'Whether to research a shopping phrase or a product you already identified',
		displayOptions: { show: { resource: ['product'], operation: ['deepSearch'] } },
	},
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'Sony WH-1000XM5 headphones',
		description: 'Product query in plain words',
		displayOptions: {
			show: { resource: ['product'], operation: ['deepSearch'], deepSearchBy: ['query'] },
		},
	},
	{
		displayName: 'Reason',
		name: 'reason',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'need shipping cost',
		description:
			'The fact you are missing. Keyword matched, not read by a language model, so phrase it plainly. Recognised focuses: price, availability, retailers, identity, shipping',
		displayOptions: { show: { resource: ['product'], operation: ['deepSearch'] } },
	},
	{
		displayName: 'Product Name',
		name: 'productName',
		type: 'string',
		default: '',
		placeholder: 'Sony WH-1000XM5 Wireless Headphones Black',
		description: 'Full product name. Leave empty only when you supply an identifier under Product Identifiers instead.',
		displayOptions: {
			show: { resource: ['product'], operation: ['findOffers'] },
		},
	},
	{
		displayName: 'Product Name',
		name: 'productName',
		type: 'string',
		default: '',
		placeholder: 'Sony WH-1000XM5 Wireless Headphones Black',
		description: 'Full product name. Leave empty only when you supply an identifier under Product Identifiers instead.',
		displayOptions: {
			show: { resource: ['product'], operation: ['deepSearch'], deepSearchBy: ['product'] },
		},
	},
	{
		displayName: 'Product Identifiers',
		name: 'identity',
		type: 'collection',
		placeholder: 'Add Identifier',
		default: {},
		description: 'Stronger ways to name the product. A GTIN gives the most reliable match.',
		displayOptions: {
			show: { resource: ['product'], operation: ['findOffers'] },
		},
		options: [
			{
				displayName: 'Brand',
				name: 'brand',
				type: 'string',
				default: '',
				description: 'Brand or manufacturer, for example "Sony"',
			},
			{
				displayName: 'Canonical ID',
				name: 'canonical_id',
				type: 'string',
				default: '',
				description: 'Identifier returned by an earlier Resolve operation. Pass it back unchanged.',
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'Free text description, used as supporting evidence',
			},
			{
				displayName: 'GTIN',
				name: 'gtin',
				type: 'string',
				default: '',
				description: 'GTIN, EAN or UPC: 8, 12, 13 or 14 digits',
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'string',
				default: '',
				description: 'Manufacturer model number, for example "WH-1000XM5"',
			},
			{
				displayName: 'Product Page URL',
				name: 'source_url',
				type: 'string',
				default: '',
				description: 'URL this product came from',
			},
			{
				displayName: 'SKU',
				name: 'sku',
				type: 'string',
				default: '',
				description: 'Retailer stock keeping unit. It only matches inside that retailer.',
			},
			{
				displayName: 'Variant',
				name: 'variant',
				type: 'string',
				default: '',
				description: 'Colour, capacity or size that separates this product from a sibling',
			},
		],
	},
	{
		displayName: 'Product Identifiers',
		name: 'identity',
		type: 'collection',
		placeholder: 'Add Identifier',
		default: {},
		description: 'Stronger ways to name the product. A GTIN gives the most reliable match.',
		displayOptions: {
			show: { resource: ['product'], operation: ['deepSearch'], deepSearchBy: ['product'] },
		},
		options: [
			{
				displayName: 'Brand',
				name: 'brand',
				type: 'string',
				default: '',
				description: 'Brand or manufacturer, for example "Sony"',
			},
			{
				displayName: 'Canonical ID',
				name: 'canonical_id',
				type: 'string',
				default: '',
				description: 'Identifier returned by an earlier Resolve operation. Pass it back unchanged.',
			},
			{
				displayName: 'GTIN',
				name: 'gtin',
				type: 'string',
				default: '',
				description: 'GTIN, EAN or UPC: 8, 12, 13 or 14 digits',
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'string',
				default: '',
				description: 'Manufacturer model number, for example "WH-1000XM5"',
			},
			{
				displayName: 'Product Page URL',
				name: 'source_url',
				type: 'string',
				default: '',
				description: 'URL this product came from',
			},
			{
				displayName: 'SKU',
				name: 'sku',
				type: 'string',
				default: '',
				description: 'Retailer stock keeping unit. It only matches inside that retailer.',
			},
			{
				displayName: 'Variant',
				name: 'variant',
				type: 'string',
				default: '',
				description: 'Colour, capacity or size that separates this product from a sibling',
			},
		],
	},

	// ------------------------------------------------------- Shared options
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['product'], operation: MARKET_WIDE_OPERATIONS } },
		options: [
			{
				displayName: 'Category Terms',
				name: 'categoryTerms',
				type: 'string',
				default: '',
				placeholder: 'headphones, audio',
				description: 'Comma-separated words that narrow the search',
			},
			{
				displayName: 'Market',
				name: 'market',
				type: 'string',
				default: 'AU',
				placeholder: 'AU',
				description:
					'Country whose retailers Nesika searches, as a two letter ISO 3166-1 code, for example "AU", "GB", "US", "DE" or "JP". Any country code works. Write "UK" and the node sends "GB", because "UK" is not a country code and the API refuses it.',
			},
			{
				displayName: 'Maximum Price',
				name: 'priceMaximum',
				type: 'number',
				default: 0,
				description: 'Highest acceptable price. Needs Price Currency as well.',
			},
			{
				displayName: 'Minimum Price',
				name: 'priceMinimum',
				type: 'number',
				default: 0,
				description: 'Lowest acceptable price. Needs Price Currency as well.',
			},
			{
				displayName: 'Price Currency',
				name: 'priceCurrency',
				type: 'string',
				default: 'AUD',
				description: 'Currency code for the price bounds, for example "AUD"',
			},
			{
				displayName: 'Retailers',
				name: 'merchantIds',
				type: 'string',
				typeOptions: { multipleValues: true, multipleValueButtonText: 'Add Retailer' },
				default: [],
				placeholder: 'kogan.com',
				description:
					`Check these retailers only, up to eight. Each value is a retailer website such as "kogan.com", or a name the API knows: ${NAMED_RETAILERS}. Leave it empty to let one web search pick the retailers. Search ignores this field and says so in the response evidence, because market wide discovery cannot filter by retailer.`,
			},
		],
	},
	{
		displayName: 'Options',
		name: 'resolveOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['product'], operation: ['resolve'] } },
		options: [
			{
				displayName: 'Market',
				name: 'market',
				type: 'string',
				default: 'AU',
				placeholder: 'AU',
				description:
					'Country whose retailers Nesika searches, as a two letter ISO 3166-1 code, for example "AU", "GB" or "US". Write "UK" and the node sends "GB".',
			},
			{
				displayName: 'Retailer',
				name: 'merchantId',
				type: 'string',
				default: '',
				placeholder: 'kogan.com',
				description:
					`Resolve inside one retailer only. Use a retailer website such as "kogan.com", or a name the API knows: ${NAMED_RETAILERS}. When you also give a Product URL, that URL must be on this retailer.`,
			},
			{
				displayName: 'Additional Identifiers',
				name: 'identifiers',
				type: 'collection',
				placeholder: 'Add Identifier',
				default: {},
				options: [
					{
						displayName: 'Barcode',
						name: 'barcode',
						type: 'string',
						default: '',
						description: 'Barcode digits when they are not a valid GTIN',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						typeOptions: { rows: 3 },
						default: '',
						description: 'Free text description, used as supporting evidence',
					},
					{
						displayName: 'GTIN',
						name: 'gtin',
						type: 'string',
						default: '',
						description: 'GTIN, EAN or UPC: 8, 12, 13 or 14 digits',
					},
					{
						displayName: 'Model',
						name: 'model',
						type: 'string',
						default: '',
						description: 'Manufacturer model number, for example "WH-1000XM5"',
					},
					{
						displayName: 'SKU',
						name: 'sku',
						type: 'string',
						default: '',
						description: 'Retailer stock keeping unit',
					},
				],
			},
		],
	},
	{
		displayName: 'Work Budget',
		name: 'workBudget',
		type: 'collection',
		placeholder: 'Add Budget Limit',
		default: {},
		description: 'Ceilings on how much work the call may do. They do not change the data point price, which is fixed per operation.',
		displayOptions: { show: { resource: ['product'], operation: ALL_OPERATIONS } },
		options: [
			{
				displayName: 'Deadline (Seconds)',
				name: 'deadline_seconds',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 540 },
				default: 540,
				description:
					'Wall clock budget for the whole operation. The node runs every call as a job, so the whole budget is usable.',
			},
			{
				displayName: 'Max Candidates',
				name: 'max_candidates',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 20 },
				default: 12,
				description: 'Candidates considered for detailed work. Usually the real ceiling.',
			},
			{
				displayName: 'Max Extractions',
				name: 'max_extractions',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 20 },
				default: 8,
				description: 'Detailed product page reads. This is the expensive stage, so exhausting it is the usual reason a result looks incomplete.',
			},
			{
				displayName: 'Max Pages',
				name: 'max_pages',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 25 },
				default: 12,
				description: 'Page resolution and extraction operations allowed',
			},
			{
				displayName: 'Max Results',
				name: 'max_results',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 50 },
				default: 20,
				description: 'Results or offers returned. Lower caps usually bind first.',
			},
			{
				displayName: 'Max Retailers',
				name: 'max_merchants',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 8 },
				default: 6,
				description:
					'Retailers to search. Without the Retailers option, this many retailer websites are taken from one web search, most relevant first.',
			},
		],
	},
	{
		displayName: 'Job Handling',
		name: 'jobOptions',
		type: 'collection',
		placeholder: 'Add Setting',
		default: {},
		description: 'Nesika runs every call as a job. The node submits it, waits, then returns the result.',
		displayOptions: { show: { resource: ['product'], operation: ALL_OPERATIONS } },
		options: [
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				description: 'Repeating a call with the same key returns the stored result and costs nothing. Leave empty to let the node build one per item from the execution ID.',
			},
			{
				displayName: 'Output',
				name: 'output',
				type: 'options',
				options: [
					{
						name: 'One Item per Result',
						value: 'results',
						description: 'Split the results list into separate n8n items',
					},
					{
						name: 'Whole Response',
						value: 'response',
						description: 'Return one item holding the full response, including evidence',
					},
				],
				default: 'results',
			},
			{
				displayName: 'Timeout (Seconds)',
				name: 'maxWaitSeconds',
				type: 'number',
				typeOptions: { minValue: 30, maxValue: 900 },
				default: 900,
				description: 'How long to keep waiting for the job. Nesika abandons a job after 15 minutes and returns the data points.',
			},
			{
				displayName: 'Wait for Result',
				name: 'waitForCompletion',
				type: 'boolean',
				default: true,
				description: 'Whether to wait for the finished result. Turn this off to return the job straight away and poll it yourself later.',
			},
		],
	},
];
