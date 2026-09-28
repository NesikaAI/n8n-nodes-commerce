# Changelog

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
