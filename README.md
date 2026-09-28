# n8n-nodes-commerce

An [n8n](https://n8n.io) community node for the Nesika Commerce API. It searches retailer
product listings, turns a messy product title into one confirmed identity, and reads current
prices, all from inside an n8n workflow.

Nesika Commerce reads retailer sites live on each call. It does not query a stored price
database, and it does not use a language model to guess a match.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) ·
[How long a call takes](#how-long-a-call-takes) · [What you are charged](#what-you-are-charged) ·
[Coverage](#coverage) · [Example workflow](#example-workflow)

## Installation

Self-hosted n8n, from the editor:

1. Open **Settings > Community Nodes** and select **Install**.
2. Enter `@nesika-ai/n8n-nodes-commerce`.
3. Agree to the risk notice and select **Install**.

Self-hosted n8n, from the command line:

```sh
cd ~/.n8n/nodes
npm install @nesika-ai/n8n-nodes-commerce
```

Restart n8n afterwards. The node then appears in the node panel as **Nesika Commerce**.

## Credentials

The node needs a Nesika Developer Project API key.

1. Sign in at [nesika.ai](https://www.nesika.ai/console/) and open **Developers**.
2. Create a project, then create a Commerce API key.
3. In n8n, create a **Nesika Commerce API** credential and paste the key.

Leave **Base URL** at `https://api.nesika.ai/api/v1` unless Nesika support gives you another
URL. The credential sends the key in the `X-API-Key` header. Selecting **Test** reads a job id
that cannot exist, which costs nothing and proves the key works.

## Operations

All four operations sit on one resource, **Product**.

### Search

Finds products across retailers from a shopping phrase.

Write the query the way a shopper would, and keep words such as colour, capacity and size.
Those words are part of the query, not noise.

Returns one item per candidate product, each with the retailer, the product page and the
price seen during discovery.

### Resolve

Turns a product title or a product page URL into one confirmed identity.

A URL is the strongest input, because the page is read directly. Matching uses exact
identifiers only, which means a shared GTIN or a retailer product id. When two candidates
cannot be separated, the response `status` is `ambiguous` and the alternatives come back with
notes explaining why.

Pass the returned `canonical_id` into **Find Offers** to price the same product later.

### Find Offers

Reads current prices and availability for a product you can already name.

Fill in **Product Name**, or add a stronger identifier under **Product Identifiers**. A GTIN
or a model number gives materially better matching than a name alone. Returns one item per
offer.

### Deep Search

Researches one missing fact about a product across retailers.

**Reason** is required and states the fact you need, for example `need shipping cost`. The
text is keyword matched, not read by a language model, so phrase it plainly. Recognised
focuses are price, availability, retailers, identity and shipping. Anything else falls back
to a general search.

Deep Search reaches the same retailers as Find Offers for twice the price, so reach for it
only when Find Offers has left a real gap.

### Get Job

Collects a job you started earlier with **Wait for Result** turned off. It costs nothing.

Give it the `job_id` the earlier call returned. A finished job comes back shaped exactly like
the operation that started it, so a collected Search splits into one item per product. A job
that is still running comes back as it stands, so a workflow can wait and ask again. Nesika
keeps a job and its result for 24 hours.

## How long a call takes

Commerce calls are slow by the standards of most APIs, because each one reads retailer pages
while you wait. Most calls take from about half a minute to a few minutes. Naming retailers
under **Retailers** makes a call slower, because each named retailer is searched in turn:
Find Offers runs at roughly one minute with no retailer named and closer to three minutes with
several named.

The node handles this for you. It submits the call as a job, waits, and returns the finished
result as one output item. n8n has no per-node time limit by default, so a long call is fine.

Two settings under **Job Handling** change that behaviour:

- **Timeout (Seconds)** is how long the node keeps waiting. The default is 900, which is the
  point at which Nesika abandons a job and returns your data points.
- **Wait for Result**, when turned off, returns the job envelope straight away. Collect it later
  with the **Get Job** operation, which is free, or from another workflow.

The node sends an idempotency key built from the execution id, the node name and the item
index. An n8n retry therefore replays the first call and costs nothing extra. Set your own
key under **Job Handling** if you want to control that.

## What you are charged

Nesika bills data points, at a fixed rate per operation:

| Operation | Data points |
|---|---|
| Resolve | 3 |
| Search | 5 |
| Find Offers | 5 |
| Deep Search | 10 |

A failed call and a repeated call with the same idempotency key are both free. The **Work
Budget** settings bound how much work a call does, but they never change the price.

Set **Output** under **Job Handling** to "Whole Response" and the item carries a `nesika`
object holding what the call cost and what the account has left: `dataPointsCharged`,
`dataPointsUsedThisPeriod`, `dataPointsRemaining` and the `jobId`. Use it to watch spend from
inside a workflow.

New accounts receive 1,000 free data points once. That grant does not renew, so a workflow
that runs every hour will use it up. Check your plan before you put a Nesika node on a short
schedule.

## Coverage

**Markets.** Set **Market** to any two-letter ISO 3166-1 country code, such as `AU`, `GB`,
`US`, `DE` or `JP`. The default is `AU`. A code that is not a country, such as `EU`, is
refused with the error code `unsupported_market`. `UK` is not a country code either, so the
node sends `GB` when you write `UK`.

**Retailers.** Leave **Retailers** empty and one web search picks the retailers for you,
across the open web. Fill it in to check named retailers only, up to eight. Each entry is
either a retailer website, such as `kogan.com` or `johnlewis.com`, or one of the names the API
knows: `BigW`, `Kmart`, `BunningsWarehouse`, `Coles`, `Woolworths`, `ChemistWarehouse` and
`TheRejectShop`. A name the API does not know comes back as `unsupported_merchant`, so use the
website instead.

Search cannot filter by retailer, because discovery runs across the whole market. When you set
**Retailers** on a Search, the response reports that the filter was not applied instead of
quietly dropping results.

## Example workflow

This workflow searches for a product every morning and writes the results to a sheet. Copy
the JSON, then paste it onto an n8n canvas.

```json
{
  "name": "Daily product prices",
  "nodes": [
    {
      "parameters": { "rule": { "interval": [{ "triggerAtHour": 7 }] } },
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [0, 0],
      "name": "Every morning"
    },
    {
      "parameters": {
        "resource": "product",
        "operation": "search",
        "query": "sony wh-1000xm5 headphones black",
        "options": { "market": "AU", "categoryTerms": "headphones" }
      },
      "type": "@nesika-ai/n8n-nodes-commerce.nesikaCommerce",
      "typeVersion": 1,
      "position": [220, 0],
      "name": "Nesika Commerce"
    }
  ],
  "connections": {
    "Every morning": {
      "main": [[{ "node": "Nesika Commerce", "type": "main", "index": 0 }]]
    }
  }
}
```

Add your credential to the Nesika Commerce node after pasting, then run the workflow once to
see the output shape.

## Using the node with an AI agent

The node is marked usable as a tool, so you can attach it to an n8n AI Agent node. Pin the
fields you want fixed and leave the rest for the model to fill in. Remember that every tool
call the agent makes costs data points.

## Development

```sh
npm install
npm run dev     # runs a local n8n with this node loaded
npm run lint
npm run build
npm test
```

`npm run dev` opens n8n at http://localhost:5678 with the node already installed.

## Licence

[MIT](LICENSE)
