import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { vi } from 'vitest';

export interface RecordedRequest {
	method: string;
	url: string;
	body?: IDataObject;
	headers?: IDataObject;
}

export interface StubbedResponse {
	statusCode: number;
	body: IDataObject;
}

export interface ContextOptions {
	/** Node parameters, keyed exactly as the node reads them. */
	parameters: IDataObject;
	/** One stubbed HTTP answer per call the node makes, in order. */
	responses: StubbedResponse[];
	itemCount?: number;
	continueOnFail?: boolean;
	baseUrl?: string;
}

export interface TestContext {
	context: IExecuteFunctions;
	requests: RecordedRequest[];
}

/**
 * Builds the slice of `IExecuteFunctions` the Nesika Commerce node uses, so a test can run
 * `execute` without an n8n instance.
 */
export function createExecuteContext(options: ContextOptions): TestContext {
	const requests: RecordedRequest[] = [];
	const responses = [...options.responses];
	const itemCount = options.itemCount ?? 1;

	const httpRequestWithAuthentication = vi.fn(
		async (_credentialName: string, requestOptions: RecordedRequest) => {
			requests.push(requestOptions);
			const next = responses.shift();
			if (!next) {
				throw new Error(`No stubbed response left for ${requestOptions.url}`);
			}
			return { statusCode: next.statusCode, body: next.body };
		},
	);

	const context = {
		getInputData: () => Array.from({ length: itemCount }, () => ({ json: {} })),
		getNodeParameter: (name: string, _itemIndex: number, fallback?: unknown) =>
			name in options.parameters ? options.parameters[name] : fallback,
		getCredentials: async () => ({
			apiKey: 'nes_test',
			baseUrl: options.baseUrl ?? 'https://api.nesika.ai/api/v1/',
		}),
		getNode: () => ({ name: 'Nesika Commerce', type: 'nesikaCommerce', typeVersion: 1 }),
		getExecutionId: () => 'exec-1',
		continueOnFail: () => options.continueOnFail ?? false,
		helpers: { httpRequestWithAuthentication },
	} as unknown as IExecuteFunctions;

	return { context, requests };
}

/** A finished job as the poll route reports it. */
export function succeededJob(result: IDataObject): IDataObject {
	return {
		job_id: 'job-1',
		status: 'succeeded',
		operation: 'search_products',
		units_charged: 5,
		result,
	};
}

/** A pending job. `poll_after_ms` is 1 so tests do not really wait. */
export function pendingJob(): IDataObject {
	return { job_id: 'job-1', status: 'pending', poll_after_ms: 1 };
}
