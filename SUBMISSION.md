# Creator Portal submission

What to enter at https://creators.n8n.io/nodes. The form itself asks only for the npm package
URL and two confirmations, so the text below is here for the fields the form may add and for
whatever a reviewer asks during the review.

## Package

| Field | Value |
|---|---|
| npm package | `@nesika-ai/n8n-nodes-commerce` |
| npm URL | https://www.npmjs.com/package/@nesika-ai/n8n-nodes-commerce |
| Repository | https://github.com/NesikaAI/n8n-nodes-commerce |
| Published version | 0.1.2 |
| Licence | MIT |
| Maintainer | Raphael Schwalb, raphael@nesikaai.com |
| Service | Nesika Commerce API, https://www.nesika.ai |

## Short description

Search retailers worldwide for products, confirm a product's identity, and read current prices
and stock, live from retailer websites.

## Longer description

Nesika Commerce reads retailer websites on each call rather than serving a stored price
database, and it matches products on exact identifiers rather than guessing with a language
model. It searches the open web, so it is not limited to a fixed list of retailers or to one
country.

The node offers five operations on one **Product** resource:

- **Search** finds products across retailers from a shopping phrase.
- **Resolve** turns a messy product title or a product page URL into one confirmed identity.
- **Find Offers** reads current prices, shipping and stock for a product you can name.
- **Deep Search** researches one missing fact, such as shipping cost, across retailers.
- **Get Job** collects a call that was started earlier without waiting. It is free.

Calls take from about half a minute to several minutes, because each one reads retailer pages
while you wait. The node handles that: it submits the call as a job, waits, polls, and returns
the finished result as normal n8n items. The node is also usable as a tool by the AI Agent node.

Set **Market** to any two-letter ISO 3166-1 country code. Leave **Retailers** empty and one web
search picks the retailers, or name up to eight retailer websites to check those only.

## What it costs

Nesika bills data points, at a fixed rate per operation: Resolve 3, Search 5, Find Offers 5,
Deep Search 10. Get Job is free, as is a failed call and a replay of the same idempotency key.
With **Output** set to Whole Response, each item reports what the call cost and what the
account has left.

New accounts receive 1,000 free data points once. That grant does not renew, which the README
says plainly, so nobody puts a paid call on an hourly schedule by accident.

## Credentials

A Nesika Developer Project API key, created in the Nesika console, sent as the `X-API-Key`
header. The credential's test reads a job id that cannot exist, which costs nothing and proves
the key works.

## Checks that n8n's guidelines ask for

| Requirement | State |
|---|---|
| Not an existing node, one service per package | Only node for the Nesika Commerce API |
| Public repository matching the npm page | Yes, with the same maintainer on both |
| MIT licence | Yes |
| No runtime dependencies | None. Peer and dev only |
| Published from GitHub Actions with provenance | Yes, from 0.1.1. `npx @n8n/scan-community-package @nesika-ai/n8n-nodes-commerce` passes on 0.1.2 |
| Linter passes | `npm run lint` with n8n's cloud rules passes |
| No environment variables, no file access | The node reads node parameters and the credential only |
| README with usage, examples, auth | Yes, including a copy-paste example workflow |
| English only | Yes |

## Decisions made before sending

- **Coverage wording**: describe it as any market and the open web, which is what the API accepts today. Australia is where coverage is measured, and the listing does not say so.
- **Costs**: quote the per-operation data point costs, matching what the Zapier steps already
  tell customers. A price change means a new release of the README and of this text.
- **Free grant**: mention the 1,000 free data points and that they do not renew.
