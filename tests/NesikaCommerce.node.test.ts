import type { IDataObject } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { NesikaCommerce } from '../nodes/NesikaCommerce/NesikaCommerce.node';
import {
	createExecuteContext,
	pendingJob,
	succeededJob,
	type ContextOptions,
} from './execute-context';

const node = new NesikaCommerce();

async function run(options: ContextOptions) {
	const { context, requests } = createExecuteContext(options);
	const output = await node.execute.call(context);
	return { items: output[0], requests };
}

describe('submitting a call', () => {
	it('submits asynchronously and asks for an inline wait', async () => {
		const { requests } = await run({
			parameters: { resource: 'product', operation: 'search', query: 'air fryer 5l black' },
			responses: [{ statusCode: 200, body: { candidates: [] } }],
		});

		expect(requests).toHaveLength(1);
		expect(requests[0].method).toBe('POST');
		expect(requests[0].url).toBe('https://api.nesika.ai/api/v1/commerce/search-products');
		expect(requests[0].headers?.Prefer).toBe('respond-async, wait=25');
		expect(requests[0].body).toEqual({ query: 'air fryer 5l black', market: 'AU' });
	});

	it('sends one idempotency key per item, and repeats it on a retry', async () => {
		const first = await run({
			parameters: { resource: 'product', operation: 'search', query: 'kettle' },
			responses: [{ statusCode: 200, body: { candidates: [] } }],
		});
		const retry = await run({
			parameters: { resource: 'product', operation: 'search', query: 'kettle' },
			responses: [{ statusCode: 200, body: { candidates: [] } }],
		});

		const key = first.requests[0].headers?.['Idempotency-Key'] as string;
		expect(key).toBe('n8n-exec-1-Nesika Commerce-0');
		expect(retry.requests[0].headers?.['Idempotency-Key']).toBe(key);
	});

	it('trims a trailing slash from the credential base URL', async () => {
		const { requests } = await run({
			parameters: { resource: 'product', operation: 'search', query: 'kettle' },
			responses: [{ statusCode: 200, body: { candidates: [] } }],
			baseUrl: 'https://api.nesika.ai/api/v1///',
		});

		expect(requests[0].url).toBe('https://api.nesika.ai/api/v1/commerce/search-products');
	});
});

describe('waiting for a job', () => {
	it('polls until the job succeeds, then returns one item per result', async () => {
		const { items, requests } = await run({
			parameters: { resource: 'product', operation: 'search', query: 'air fryer' },
			responses: [
				{ statusCode: 202, body: pendingJob() },
				{ statusCode: 202, body: { ...pendingJob(), poll_after_ms: 1 } },
				{
					statusCode: 200,
					body: succeededJob({
						candidates: [{ merchant_id: 'BigW', price: 99 }, { merchant_id: 'Kmart', price: 89 }],
					}),
				},
			],
		});

		expect(requests.map((request) => request.method)).toEqual(['POST', 'GET', 'GET']);
		expect(requests[1].url).toBe('https://api.nesika.ai/api/v1/commerce/jobs/job-1');
		expect(items).toHaveLength(2);
		expect(items[0].json).toEqual({ merchant_id: 'BigW', price: 99 });
		expect(items[1].json).toEqual({ merchant_id: 'Kmart', price: 89 });
	});

	it('returns the whole response when asked to', async () => {
		const response = { candidates: [{ merchant_id: 'BigW' }], status: 'complete' };
		const { items } = await run({
			parameters: {
				resource: 'product',
				operation: 'search',
				query: 'air fryer',
				jobOptions: { output: 'response' },
			},
			responses: [{ statusCode: 200, body: response }],
		});

		expect(items).toHaveLength(1);
		expect(items[0].json).toEqual({ ...response, nesika: {} });
	});

	it('returns the job straight away when Wait for Result is off', async () => {
		const { items, requests } = await run({
			parameters: {
				resource: 'product',
				operation: 'search',
				query: 'air fryer',
				jobOptions: { waitForCompletion: false },
			},
			responses: [{ statusCode: 202, body: pendingJob() }],
		});

		expect(requests).toHaveLength(1);
		expect(items[0].json).toMatchObject({ job_id: 'job-1', status: 'pending' });
	});

	it('reports what the call cost, from the usage headers and the job', async () => {
		const { items } = await run({
			parameters: {
				resource: 'product',
				operation: 'search',
				query: 'air fryer',
				jobOptions: { output: 'response' },
			},
			responses: [
				{
					statusCode: 202,
					body: pendingJob(),
					headers: {
						'x-usage-datapoints-consumed': '5',
						'x-nesika-usage-used': '120',
						'x-nesika-usage-remaining': '880',
					},
				},
				{ statusCode: 200, body: succeededJob({ candidates: [] }) },
			],
		});

		expect(items[0].json.nesika).toEqual({
			dataPointsCharged: 5,
			dataPointsUsedThisPeriod: 120,
			dataPointsRemaining: 880,
			jobId: 'job-1',
		});
	});

	it('keeps an empty result list as one item', async () => {
		const { items } = await run({
			parameters: { resource: 'product', operation: 'search', query: 'air fryer' },
			responses: [{ statusCode: 200, body: { candidates: [], status: 'no_match' } }],
		});

		expect(items).toHaveLength(1);
		expect(items[0].json).toEqual({ candidates: [], status: 'no_match', nesika: {} });
	});
});

describe('building request bodies', () => {
	it('maps search options and the work budget onto API field names', async () => {
		const { requests } = await run({
			parameters: {
				resource: 'product',
				operation: 'search',
				query: 'air fryer',
				market: 'AU',
				options: {
					merchantIds: ['BigW', 'kogan.com'],
					categoryTerms: 'kitchen, appliances',
					priceMinimum: 50,
					priceMaximum: 200,
					priceCurrency: 'AUD',
				},
				workBudget: { max_results: 5, deadline_seconds: 120 },
			},
			responses: [{ statusCode: 200, body: { candidates: [] } }],
		});

		expect(requests[0].body).toEqual({
			query: 'air fryer',
			market: 'AU',
			merchant_ids: ['BigW', 'kogan.com'],
			category_terms: ['kitchen', 'appliances'],
			price: { minimum: 50, maximum: 200, currency: 'AUD' },
			budget: { max_results: 5, deadline_seconds: 120 },
		});
	});

	it('sends a resolve call by URL with its extra identifiers', async () => {
		const { requests } = await run({
			parameters: {
				resource: 'product',
				operation: 'resolve',
				resolveBy: 'url',
				url: 'https://www.bigw.com.au/product/example/p/123',
				market: 'GB',
				resolveOptions: {
					merchantId: 'johnlewis.com',
					identifiers: { gtin: '09300675024235', model: 'WH-1000XM5', sku: '' },
				},
			},
			responses: [{ statusCode: 200, body: { identity: { canonical_id: 'abc' } } }],
		});

		expect(requests[0].url).toBe('https://api.nesika.ai/api/v1/commerce/resolve-product');
		expect(requests[0].body).toEqual({
			url: 'https://www.bigw.com.au/product/example/p/123',
			market: 'GB',
			merchant_id: 'johnlewis.com',
			gtin: '09300675024235',
			model: 'WH-1000XM5',
		});
	});

	it('puts the product name and identifiers inside identity for Find Offers', async () => {
		const { requests } = await run({
			parameters: {
				resource: 'product',
				operation: 'findOffers',
				productName: 'Sony WH-1000XM5 Black',
				identity: { gtin: '09300675024235', brand: 'Sony', description: '' },
			},
			responses: [{ statusCode: 200, body: { offers: [] } }],
		});

		expect(requests[0].body).toEqual({
			market: 'AU',
			identity: {
				canonical_name: 'Sony WH-1000XM5 Black',
				gtin: '09300675024235',
				brand: 'Sony',
			},
		});
	});

	it('sends any country code, and turns UK into GB', async () => {
		const { requests } = await run({
			parameters: {
				resource: 'product',
				operation: 'search',
				query: 'air fryer',
				market: ' uk ',
			},
			responses: [{ statusCode: 200, body: { candidates: [] } }],
		});

		expect(requests[0].body).toEqual({ query: 'air fryer', market: 'GB' });
	});

	it('drops blank retailers a user left behind', async () => {
		const { requests } = await run({
			parameters: {
				resource: 'product',
				operation: 'search',
				query: 'air fryer',
				options: { merchantIds: ['  ', 'johnlewis.com', ''] },
			},
			responses: [{ statusCode: 200, body: { candidates: [] } }],
		});

		expect(requests[0].body).toEqual({
			query: 'air fryer',
			market: 'AU',
			merchant_ids: ['johnlewis.com'],
		});
	});

	it('sends reason and query for a Deep Search', async () => {
		const { requests } = await run({
			parameters: {
				resource: 'product',
				operation: 'deepSearch',
				deepSearchBy: 'query',
				query: 'sony headphones',
				reason: 'need shipping cost',
			},
			responses: [{ statusCode: 200, body: { results: [] } }],
		});

		expect(requests[0].url).toBe('https://api.nesika.ai/api/v1/commerce/deep-search');
		expect(requests[0].body).toEqual({
			query: 'sony headphones',
			market: 'AU',
			reason: 'need shipping cost',
		});
	});

	it('sends a market even when the user never touches the field', async () => {
		// 0.1.3 only sent a market if the user opened Options and added it, and Nesika refuses
		// any Commerce request without one. Every operation failed on invalid_request.
		for (const operation of ['search', 'resolve', 'findOffers', 'deepSearch']) {
			const { requests } = await run({
				parameters: {
					resource: 'product',
					operation,
					query: 'air fryer',
					reason: 'need shipping cost',
					deepSearchBy: 'query',
					resolveBy: 'title',
					title: 'philips airfryer',
					productName: 'philips airfryer',
				},
				responses: [{ statusCode: 200, body: {} }],
			});
			expect(requests[0].body).toMatchObject({ market: 'AU' });
		}
	});

	it('splits a replayed call the same way as a fresh one', async () => {
		// Reusing an idempotency key makes Nesika answer 200 with the first job, result and all,
		// instead of 202. Returning that envelope handed the workflow one item of job metadata
		// where a fresh call hands it the products.
		const { items } = await run({
			parameters: { resource: 'product', operation: 'search', query: 'air fryer' },
			responses: [
				{
					statusCode: 200,
					body: {
						job_id: 'job_replayed',
						status: 'succeeded',
						operation: 'search_products',
						result: { candidates: [{ title: 'one' }, { title: 'two' }] },
					},
				},
			],
		});

		expect(items).toHaveLength(2);
		expect(items[0].json).toMatchObject({ title: 'one' });
		expect(items[1].json).toMatchObject({ title: 'two' });
	});

	it('refuses a Find Offers call that names no product', async () => {
		await expect(
			run({
				parameters: { resource: 'product', operation: 'findOffers', productName: '  ' },
				responses: [],
			}),
		).rejects.toThrow('Name the product before running this operation');
	});
});

describe('errors', () => {
	const refusal: IDataObject = {
		success: false,
		error_code: 'unsupported_merchant',
		message: 'That retailer is not supported.',
		invalid_fields: ['url'],
	};

	it('reports the API error code and message', async () => {
		await expect(
			run({
				parameters: { resource: 'product', operation: 'search', query: 'air fryer' },
				responses: [{ statusCode: 400, body: refusal }],
			}),
		).rejects.toThrow(/unsupported_merchant/);
	});

	it('explains an out-of-credit answer from the metering layer', async () => {
		await expect(
			run({
				parameters: { resource: 'product', operation: 'search', query: 'air fryer' },
				responses: [
					{
						statusCode: 402,
						body: { error: { errorCode: 'quota_exhausted', message: 'No data points remain.' } },
					},
				],
			}),
		).rejects.toThrow(/no data points left/i);
	});

	it('explains an expired job', async () => {
		await expect(
			run({
				parameters: { resource: 'product', operation: 'search', query: 'air fryer' },
				responses: [
					{ statusCode: 202, body: pendingJob() },
					{ statusCode: 410, body: { success: false, error_code: 'job_expired', message: 'Gone.' } },
				],
			}),
		).rejects.toThrow(/kept for 24 hours/);
	});

	it('reports a failed job with the error the job carries', async () => {
		await expect(
			run({
				parameters: { resource: 'product', operation: 'search', query: 'air fryer' },
				responses: [
					{ statusCode: 202, body: pendingJob() },
					{
						statusCode: 200,
						body: { job_id: 'job-1', status: 'failed', units_charged: 0, error: refusal },
					},
				],
			}),
		).rejects.toThrow(/no data points were charged/);
	});

	it('stops waiting once the timeout passes and names the job', async () => {
		await expect(
			run({
				parameters: {
					resource: 'product',
					operation: 'search',
					query: 'air fryer',
					jobOptions: { maxWaitSeconds: 0 },
				},
				responses: [{ statusCode: 202, body: pendingJob() }],
			}),
		).rejects.toThrow(/did not finish within 0 seconds/);
	});

	it('passes the error on as an item when Continue On Fail is set', async () => {
		const { items } = await run({
			parameters: { resource: 'product', operation: 'search', query: 'air fryer' },
			responses: [{ statusCode: 400, body: refusal }],
			continueOnFail: true,
		});

		expect(items).toHaveLength(1);
		expect(items[0].json.error).toContain('That retailer is not supported.');
	});
});

describe('collecting a job later', () => {
	it('reads the job and splits a finished search into items', async () => {
		const { items, requests } = await run({
			parameters: { resource: 'product', operation: 'getJob', jobId: 'job_abc' },
			responses: [
				{
					statusCode: 200,
					body: {
						job_id: 'job_abc',
						status: 'succeeded',
						operation: 'search_products',
						units_charged: 5,
						result: { candidates: [{ merchant_id: 'BigW' }, { merchant_id: 'Kmart' }] },
					},
				},
			],
		});

		expect(requests).toHaveLength(1);
		expect(requests[0].method).toBe('GET');
		expect(requests[0].url).toBe('https://api.nesika.ai/api/v1/commerce/jobs/job_abc');
		expect(items).toHaveLength(2);
		expect(items[0].json).toEqual({ merchant_id: 'BigW' });
	});

	it('returns a job that is still running, so a workflow can ask again', async () => {
		const { items } = await run({
			parameters: { resource: 'product', operation: 'getJob', jobId: 'job_abc' },
			responses: [{ statusCode: 202, body: pendingJob() }],
		});

		expect(items).toHaveLength(1);
		expect(items[0].json).toMatchObject({ job_id: 'job-1', status: 'pending' });
	});

	it('raises a failed job as an error', async () => {
		await expect(
			run({
				parameters: { resource: 'product', operation: 'getJob', jobId: 'job_abc' },
				responses: [
					{
						statusCode: 200,
						body: {
							job_id: 'job_abc',
							status: 'failed',
							units_charged: 0,
							error: { error_code: 'job_timed_out', message: 'Nesika ran out of time.' },
						},
					},
				],
			}),
		).rejects.toThrow(/no data points were charged/);
	});

	it('explains a job that is gone', async () => {
		await expect(
			run({
				parameters: { resource: 'product', operation: 'getJob', jobId: 'job_abc' },
				responses: [
					{ statusCode: 410, body: { success: false, error_code: 'job_expired', message: 'Gone.' } },
				],
			}),
		).rejects.toThrow(/kept for 24 hours/);
	});

	it('refuses an empty job id before calling the API', async () => {
		await expect(
			run({
				parameters: { resource: 'product', operation: 'getJob', jobId: '   ' },
				responses: [],
			}),
		).rejects.toThrow('Job ID is empty.');
	});
});
