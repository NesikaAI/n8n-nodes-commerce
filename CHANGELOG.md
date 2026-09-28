# Changelog

## 0.1.3

- README fix only. The Operations heading said four operations while five were documented,
  because Get Job arrived in 0.1.2 and the heading was missed. The node itself is unchanged.

## 0.1.2

- New **Get Job** operation. It collects a job started earlier with Wait for Result turned off,
  and it costs nothing. A finished job is shaped exactly like the operation that started it, and
  one still running comes back as it stands.
- The operation list is now in alphabetical order, which is n8n's convention.

## 0.1.1

- Published from GitHub Actions with a provenance statement, which n8n requires for a verified
  node. 0.1.0 was published by hand to create the package, so it carries none.
- No change to what the node does.

## 0.1.0

First release.

- One **Nesika Commerce** node with four operations: Search, Resolve, Find Offers and Deep
  Search, against the Nesika Commerce API.
- Every call runs as an asynchronous job. The node submits it, waits up to 25 seconds inline,
  then polls until the job finishes, so a call that takes minutes still returns a result.
- The `Idempotency-Key` header comes from the n8n execution id, node name and item index, so an
  n8n retry replays the first call instead of paying for a second one.
- Market takes any ISO 3166-1 country code, and `UK` is sent as `GB`.
- Retailers takes any retailer website, or one of the named retailer ids.
- With Output set to Whole Response, each item reports what the call cost and what the account
  has left.
- Usable as a tool by n8n's AI Agent node.
