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
	)) as { statusCode: number; body: unknown };

	return {
		statusCode: response.statusCode,
		body: (response.body ?? {}) as IDataObject,
	};
}

/** Turns an error body from the Commerce API into the message a workflow author reads. */
function describeError(body: IDataObject, statusCode: number): string {
	const envelope = (body.error as IDataObject | undefined) ?? body;
	const code = envelope.error_code as string | undefined;
	const message = envelope.message as string | undefined;
	const fields = envelope.invalid_fields as string[] | undefined;
	const parts = [message ?? `The Nesika Commerce API answered ${statusCode}.`];
	if (code) {
		parts.push(`Error code: ${code}.`);
	}
	if (fields?.length) {
		parts.push(`Fields: ${fields.join(', ')}.`);
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
 * Submits one Commerce operation as a job and waits for its result.
 *
 * The API takes up to 250 seconds for some operations, which is longer than the Nesika
 * gateway keeps a connection open. Submitting with `Prefer: respond-async` avoids that:
 * the API answers with a job, and this function polls until the job finishes.
 */
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
): Promise<{ response: IDataObject; job?: CommerceJob }> {
	const { baseUrl, path, body, idempotencyKey, itemIndex } = parameters;

	const submission = await request(context, 'POST', `${baseUrl}${path}`, {
		body,
		headers: {
			'Idempotency-Key': idempotencyKey,
			Prefer: `respond-async, wait=${SUBMIT_WAIT_SECONDS}`,
		},
	});

	// The job finished inside the inline wait, so the body is already the result.
	if (submission.statusCode === 200) {
		return { response: submission.body };
	}

	if (submission.statusCode !== 202) {
		throw apiError(context, submission.body, submission.statusCode, itemIndex);
	}

	const job = submission.body as CommerceJob;
	if (!parameters.waitForCompletion) {
		return { response: job, job };
	}

	return { response: await pollJob(context, { ...parameters, job }), job };
}

async function pollJob(
	context: IExecuteFunctions,
	parameters: {
		baseUrl: string;
		job: CommerceJob;
		maxWaitSeconds: number;
		itemIndex: number;
	},
): Promise<IDataObject> {
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
			return finished.result;
		}

		throw apiError(context, finished, 200, itemIndex);
	}
}
