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

	// Every Commerce operation costs data points, so the check reads the project identity
	// instead. That route is free, and it answers only for a Developer Project key, which is
	// the kind Commerce needs.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/identity/developer-project',
			method: 'GET',
		},
	};
}
