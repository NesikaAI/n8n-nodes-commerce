import type { IDataObject, IExecuteFunctions, IHttpRequestMethods } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

export const CREDENTIAL_NAME = 'nesikaCommerceApi';

/** The longest an asynchronous submission waits inline before the API hands back a job. */
const SUBMIT_WAIT_SECONDS = 25;

/** Fallback gap between polls when the API does not state one. */
const DEFAULT_POLL_MS = 5000;

export interface CommerceResponse {
	statusCode: number;
	body: IDataObject;
	headers: IDataObject;
}

/** What the call cost and what the account has left, as the API reports it in headers. */
export interface CommerceUsage extends IDataObject {
	dataPointsCharged?: number;
	dataPointsUsedThisPeriod?: number;
	dataPointsRemaining?: number;
}

/** The job envelope the API returns for an asynchronous submission. */
export interface CommerceJob extends IDataObject {
	job_id: string;
	status: string;
	poll_after_ms?: number;
	result?: IDataObject;
	error?: IDataObject;
}

export function trimBaseUrl(baseUrl: string): string {
	return baseUrl.trim().replace(/\/+$/, '');
}

async function request(
	context: IExecuteFunctions,
	method: IHttpRequestMethods,
	url: string,
	options: { body?: IDataObject; headers?: IDataObject } = {},
): Promise<CommerceResponse> {
	const response = (await context.helpers.httpRequestWithAuthentication.call(
		context,
		CREDENTIAL_NAME,
		{
			method,
			url,
			body: options.body,
			headers: { Accept: 'application/json', ...options.headers },
			json: true,
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
		},
	)) as { statusCode: number; body: unknown; headers?: IDataObject };

	return {
		statusCode: response.statusCode,
		body: (response.body ?? {}) as IDataObject,
		headers: response.headers ?? {},
	};
}

function readNumber(headers: IDataObject, name: string): number | undefined {
	const value = headers[name] ?? headers[name.toLowerCase()];
	const parsed = Number(value);
	return typeof value === 'undefined' || Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Reads the usage headers the API sends on every Commerce answer, so a workflow can see what
 * a run cost without a second call.
 */
export function readUsage(response: CommerceResponse): CommerceUsage {
	const usage: CommerceUsage = {
		dataPointsCharged: readNumber(response.headers, 'x-usage-datapoints-consumed'),
		dataPointsUsedThisPeriod: readNumber(response.headers, 'x-nesika-usage-used'),
		dataPointsRemaining: readNumber(response.headers, 'x-nesika-usage-remaining'),
	};
	for (const key of Object.keys(usage)) {
		if (usage[key] === undefined) {
			delete usage[key];
		}
	}
	return usage;
}

interface ReadError {
	code?: string;
	message?: string;
	fields: string[];
}

/**
 * Reads whichever error shape came back.
 *
 * The Commerce routes answer with a flat body: `error_code`, `message` and `invalid_fields`.
 * The metering layer in front of them, which handles payment and rate limits, answers with the
 * older nested shape: `error.errorCode` and `error.message`. A finished job carries the flat
 * Commerce error under `error`.
 */
function readError(body: IDataObject): ReadError {
	const nested = body.error as IDataObject | undefined;
	const source = nested && typeof nested === 'object' ? nested : body;
	const code = (source.error_code ?? source.errorCode) as string | undefined;
	const fields = Array.isArray(source.invalid_fields) ? (source.invalid_fields as string[]) : [];
	return { code, message: source.message as string | undefined, fields };
}

/** Says what a caller can do about each answer, in the same terms as the Zapier integration. */
function explainStatus(statusCode: number, code?: string): string | undefined {
	if (statusCode === 401) {
		return 'Nesika did not accept the API key. Open the credential and paste a current key from the Nesika console.';
	}
	if (statusCode === 402) {
		return 'The account has no data points left, so nothing ran and nothing was charged. Add data points in the Nesika console, then run the workflow again.';
	}
	if (statusCode === 403) {
		return code === 'insufficient_scope'
			? 'This key cannot use Commerce. Create a Developer Project key with Commerce access.'
			: undefined;
	}
	if (statusCode === 429) {
		return code === 'quota_exceeded'
			? 'The account has reached its monthly request limit. Check usage in the Nesika console.'
			: 'Nesika is receiving too many requests from this account. Wait, then run the workflow again.';
	}
	if (statusCode === 404 || statusCode === 410) {
		return 'Nesika no longer holds this job, because a job and its result are kept for 24 hours. Run the workflow again to repeat the call.';
	}
	if (statusCode >= 500) {
		return 'Nesika is temporarily unavailable. Nothing was charged. Run the workflow again in a few minutes.';
	}
	return undefined;
}

/** Turns an error body from the Commerce API into the message a workflow author reads. */
function describeError(body: IDataObject, statusCode: number): string {
	const { code, message, fields } = readError(body);
	const parts = [message ?? `The Nesika Commerce API answered ${statusCode}.`];
	if (code) {
		parts.push(`Error code: ${code}.`);
	}
	if (fields.length > 0) {
		parts.push(`Fields: ${fields.join(', ')}.`);
	}
	const advice = explainStatus(statusCode, code);
	if (advice) {
		parts.push(advice);
	}
	if (body.status === 'failed' && body.units_charged === 0) {
		parts.push('The job failed, so no data points were charged.');
	}
	return parts.join(' ');
}

export function apiError(
	context: IExecuteFunctions,
	body: IDataObject,
	statusCode: number,
	itemIndex: number,
): NodeApiError {
	return new NodeApiError(
		context.getNode(),
		body as never,
		{
			message: describeError(body, statusCode),
			httpCode: String(statusCode),
			itemIndex,
		},
	);
}

/**
 * Reads one job by its id. Reading is free, so a workflow can collect a job it started
 * earlier without paying again. A job that is still running comes back as it stands.
 */
export async function getJob(
	context: IExecuteFunctions,
	parameters: { baseUrl: string; jobId: string; itemIndex: number },
): Promise<{ job: CommerceJob; usage: CommerceUsage }> {
	const { baseUrl, jobId, itemIndex } = parameters;
	const response = await request(
		context,
		'GET',
		`${baseUrl}/commerce/jobs/${encodeURIComponent(jobId)}`,
	);

	if (response.statusCode !== 200 && response.statusCode !== 202) {
		throw apiError(context, response.body, response.statusCode, itemIndex);
	}

	return { job: response.body as CommerceJob, usage: readUsage(response) };
}

/**
 * Submits one Commerce operation as a job and waits for its result.
 *
 * The API takes up to 250 seconds for some operations, which is longer than the Nesika
 * gateway keeps a connection open. Submitting with `Prefer: respond-async` avoids that:
 * the API answers with a job, and this function polls until the job finishes.
 */
/** Recognises a Commerce job envelope, which carries a job id and a status. */
function asJob(body: IDataObject): CommerceJob | undefined {
	return typeof body.job_id === 'string' && typeof body.status === 'string'
		? (body as CommerceJob)
		: undefined;
}

export async function runOperation(
	context: IExecuteFunctions,
	parameters: {
		baseUrl: string;
		path: string;
		body: IDataObject;
		idempotencyKey: string;
		waitForCompletion: boolean;
		maxWaitSeconds: number;
		itemIndex: number;
	},
): Promise<{ response: IDataObject; job?: CommerceJob; usage: CommerceUsage }> {
	const { baseUrl, path, body, idempotencyKey, itemIndex } = parameters;

	const submission = await request(context, 'POST', `${baseUrl}${path}`, {
		body,
		headers: {
			'Idempotency-Key': idempotencyKey,
			Prefer: `respond-async, wait=${SUBMIT_WAIT_SECONDS}`,
		},
	});

	// A 200 means the work is already done: either the job finished inside the inline wait, or
	// this idempotency key was used before and Nesika replayed the first answer for free. Both
	// come back as a job envelope, so unwrap it. Returning the envelope here would hand the
	// workflow one item of job metadata where a fresh call hands it the products.
	if (submission.statusCode === 200) {
		const body = submission.body;
		const finishedJob = asJob(body);
		if (!finishedJob) {
			return { response: body, usage: readUsage(submission) };
		}
		if (finishedJob.status === 'succeeded' && finishedJob.result) {
			return { response: finishedJob.result, job: finishedJob, usage: readUsage(submission) };
		}
		if (!parameters.waitForCompletion) {
			return { response: finishedJob, job: finishedJob, usage: readUsage(submission) };
		}
		const settled = await pollJob(context, { ...parameters, job: finishedJob });
		return { response: settled.result, job: settled.job, usage: readUsage(submission) };
	}

	if (submission.statusCode !== 202) {
		throw apiError(context, submission.body, submission.statusCode, itemIndex);
	}

	const job = submission.body as CommerceJob;
	const usage = readUsage(submission);
	if (!parameters.waitForCompletion) {
		return { response: job, job, usage };
	}

	const finished = await pollJob(context, { ...parameters, job });
	return { response: finished.result, job: finished.job, usage };
}

async function pollJob(
	context: IExecuteFunctions,
	parameters: {
		baseUrl: string;
		job: CommerceJob;
		maxWaitSeconds: number;
		itemIndex: number;
	},
): Promise<{ result: IDataObject; job: CommerceJob }> {
	const { baseUrl, job, itemIndex } = parameters;
	const pollUrl = `${baseUrl}/commerce/jobs/${encodeURIComponent(job.job_id)}`;
	const giveUpAt = Date.now() + parameters.maxWaitSeconds * 1000;
	let waitMs = job.poll_after_ms ?? DEFAULT_POLL_MS;

	while (true) {
		if (Date.now() + waitMs > giveUpAt) {
			throw new NodeOperationError(
				context.getNode(),
				`The job did not finish within ${parameters.maxWaitSeconds} seconds.`,
				{
					itemIndex,
					description: `Job ${job.job_id} is still running. Nesika keeps it for 24 hours, so you can read it later from ${pollUrl}. Data points are charged only when a job succeeds.`,
				},
			);
		}

		await sleep(waitMs);
		const poll = await request(context, 'GET', pollUrl);

		if (poll.statusCode === 202) {
			waitMs = (poll.body.poll_after_ms as number | undefined) ?? DEFAULT_POLL_MS;
			continue;
		}

		if (poll.statusCode !== 200) {
			throw apiError(context, poll.body, poll.statusCode, itemIndex);
		}

		const finished = poll.body as CommerceJob;
		if (finished.status === 'succeeded' && finished.result) {
			return { result: finished.result, job: finished };
		}

		throw apiError(context, finished, 200, itemIndex);
	}
}
