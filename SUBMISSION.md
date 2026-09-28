# Creator Portal submission

Draft of what to enter at https://creators.n8n.io/nodes. Review before sending, because the
listing text is customer-facing and repeats the claims in #1331 and the pricing pages.

## Package

| Field | Value |
|---|---|
| npm package | `@nesika-ai/n8n-nodes-commerce` |
| Repository | https://github.com/NesikaAI/n8n-nodes-commerce |
| Licence | MIT |
| Maintainer | Raphael Schwalb, raphael@nesikaai.com |
| Service | Nesika Commerce API, https://www.nesika.ai |

## Short description

Search online retailers for products, confirm a product's identity, and read current prices and
stock, live from retailer websites.

## Longer description

Nesika Commerce reads retailer websites on each call rather than serving a stored price
database, and it matches products on exact identifiers rather than guessing with a language
model.

The node offers four operations on one **Product** resource:

- **Search** finds products across retailers from a shopping phrase.
- **Resolve** turns a messy product title or a product page URL into one confirmed identity.
- **Find Offers** reads current prices, shipping and stock for a product you can name.
- **Deep Search** researches one missing fact, such as shipping cost, across retailers.

Calls take from about half a minute to several minutes, because each one reads retailer pages
while you wait. The node handles that: it submits the call as a job, waits, polls, and returns
the finished result as normal n8n items. The node is also usable as a tool by the AI Agent node.

Nesika bills data points per call, fixed per operation. With **Output** set to Whole Response,
each item reports what the call cost and what the account has left.

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
| Published from GitHub Actions with provenance | Yes, from 0.1.1. `npx @n8n/scan-community-package @nesika-ai/n8n-nodes-commerce` passes |
| Linter passes | `npm run lint` with n8n's cloud rules passes |
| No environment variables, no file access | The node reads node parameters and the credential only |
| README with usage, examples, auth | Yes, including a copy-paste example workflow |
| English only | Yes |

## Before sending

- [ ] Confirm the wording about coverage against #1331, so the listing does not claim more than
      the product delivers.
- [ ] Confirm the data point costs quoted in the README match the current price list.
- [ ] Decide whether a free-tier note belongs in the listing, given that the 1,000 free data
      points do not renew.
