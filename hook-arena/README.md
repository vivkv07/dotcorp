# Hook Arena

Paste 3 to 20 headlines, email subject lines, social hooks, product names or
taglines. Every pair is judged head to head in both orders by
[Jev](https://typesafe.ai), TypeSafe AI's System One decision model. A
Bradley-Terry model turns the calibrated pair probabilities into a ranking,
and a separate yes/no judgment flags clickbait per line.

A 20-candidate ranking is 400 typed judgments. It costs about $0.001 in Jev
tokens and returns in a few seconds.

## Why this is a good one-day product

- **Jev-shaped.** Ranking by exhaustive pairwise comparison is exactly the
  kind of thing a text-generating model cannot do cheaply. Jev returns
  probabilities, not prose, at $0.042 per million input tokens.
- **Zero-cost stack.** One Cloudflare Worker serves the page and the API.
  Cloudflare's free tier covers a launch; Jev tokens are a rounding error.
- **Built-in distribution.** The Jev ecosystem is a week old and has its own
  directory ([madewithjev.com](https://madewithjev.com)) and awesome list.
  A polished single-purpose tool gets listed for free.
- **Clear upgrade path.** Free: 3 rankings a day, 8 candidates. Pro: $9 a
  month for 300 a day, 20 candidates, and API access with the license key.

See [LAUNCH.md](LAUNCH.md) for the hour-by-hour plan.

## Layout

```
hook-arena/
  src/rank.js       pure tournament logic (question building, Bradley-Terry)
  src/worker.js     Cloudflare Worker: /api/rank, /api/license, providers, quotas
  public/           static app (index.html, app.js, style.css)
  test/             node:test suites, run with a fake Jev provider
  wrangler.toml     Worker + static assets config
```

## Run locally

```bash
cd hook-arena
npm install
cp .dev.vars.example .dev.vars   # add one provider key
npm run dev                      # http://localhost:8787
npm test
```

## Jev providers

The Worker picks a provider from whichever secret is set, or from
`JEV_PROVIDER` if you want to force one.

| Provider | Secrets | Waitlist |
|---|---|---|
| OpenRouter | `OPENROUTER_API_KEY` | No |
| Cloudflare Workers AI (REST) | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | No |
| TypeSafe direct | `TYPESAFE_API_KEY` | Yes |

OpenRouter is the fastest way to be live today. Request shape is the same
System One contract for all three: `{ model, state, questions }` in and
`{ answers, usage }` out.

## Deploy

```bash
npx wrangler login
npx wrangler kv namespace create ARENA_KV      # paste the id into wrangler.toml
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler deploy
```

Without the KV binding the Worker still runs, but the free-tier daily quota
and license cache are off. That is fine for local development only.

## Payments

Pro is sold as a Lemon Squeezy subscription with license keys enabled.
Lemon Squeezy is a merchant of record, so it handles GST, VAT and payouts
for an India-based seller with no company paperwork.

1. Create a product, enable "License keys", set the price to $9/month.
2. Copy the checkout URL into `CHECKOUT_URL` in `public/app.js`.
3. Set `LEMONSQUEEZY_STORE_ID` in `wrangler.toml` so keys from other stores
   are rejected.

The Worker validates keys against the public
`licenses/validate` endpoint, which needs no secret, and caches the result
in KV for a day. Buyers paste the key once; it is stored in their browser
and sent as `X-License-Key`.

## API (Pro)

```bash
curl -X POST https://YOUR-DOMAIN/api/rank \
  -H "Content-Type: application/json" \
  -H "X-License-Key: YOUR-KEY" \
  -d '{"candidates":["A","B","C"],"audience":"indie founders","format":"subject","goal":"open"}'
```

Response: `rows` (ranked, with `winRate`, `strength`, `clickbaitRisk`),
`matrix` (P(row beats column)), `margin` (P(#1 beats #2)) and `meta`
(judgments, tokens, cost, latency, tier, remaining quota).
