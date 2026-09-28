import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class NesikaCommerceApi implements ICredentialType {
	name = 'nesikaCommerceApi';

	displayName = 'Nesika Commerce API';

	documentationUrl =
		'https://github.com/NesikaAI/n8n-nodes-commerce?tab=readme-ov-file#credentials';

	icon: Icon = {
		light: 'file:../nodes/NesikaCommerce/nesika.svg',
		dark: 'file:../nodes/NesikaCommerce/nesika.dark.svg',
	};

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Developer Project API key. Create one in the Nesika console under Developers, then copy the whole value.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.nesika.ai/api/v1',
			required: true,
			description:
				'Root URL of the Nesika API. Keep the default unless Nesika support gives you another URL.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	/**
	 * Checks the key by reading a job id that cannot exist.
	 *
	 * Every Commerce operation costs data points, and reading a job costs nothing, so this is
	 * the free way to prove a key works. A working key gets `404 job_not_found`, which is why
	 * the check ignores the status code and reads the body instead. A key Nesika does not
	 * accept gets `unauthorized`, and a key without Commerce access gets `insufficient_scope`.
	 */
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/commerce/jobs/n8n-credential-check',
			method: 'GET',
			ignoreHttpStatusErrors: true,
		},
		rules: [
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'error_code',
					value: 'unauthorized',
					message: 'Nesika did not accept this API key. Check that you copied all of it.',
				},
			},
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'error_code',
					value: 'insufficient_scope',
					message:
						'This key cannot use Commerce. Create a Developer Project key with Commerce access in the Nesika console.',
				},
			},
		],
	};
}
