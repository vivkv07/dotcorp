# Hook Arena: the one-day launch plan

Goal for the day: live URL, first payment link working, listed in two Jev
directories, one post out to your own audience.

## Hour by hour

| Time | Do | Done when |
|---|---|---|
| 0:00 | Create an OpenRouter key (no waitlist). Run `npm run dev`, paste five real headlines, confirm a ranking comes back. | You see a ranking with cost and latency in the summary line. |
| 0:45 | `wrangler login`, create the KV namespace, set the secret, `wrangler deploy`. | The `workers.dev` URL ranks headlines. |
| 1:30 | Buy a domain or use a subdomain you own. Add a custom domain in the Worker settings. | HTTPS URL on your domain works. |
| 2:00 | Lemon Squeezy: store, product "Hook Arena Pro", $9/month subscription, license keys on. Paste checkout URL into `app.js`, set `LEMONSQUEEZY_STORE_ID`, redeploy. | Buy it yourself in test mode, paste the key, the Pro badge activates and 9+ candidates work. |
| 3:00 | Replace the placeholder candidates in `index.html` with five of your own best-performing LinkedIn hooks. Run them. Screenshot the result. | Screenshot saved. |
| 3:30 | Submit to madewithjev.com (there is a submit form) and open a PR to `kraayenjon/awesome-jev` under Applications. | Both submitted. |
| 4:30 | Write the launch post (below). Publish on LinkedIn, then a short Substack note. | Published. |
| 5:30 | Post "Show HN: Hook Arena, rank headlines with 400 Jev judgments for a tenth of a cent". Reply to every comment for two hours. | Posted. |
| Evening | Watch the Worker logs and the Lemon Squeezy dashboard. Fix anything that broke. | First paying user, or a list of what to fix tomorrow. |

## Pricing logic

Cost of goods is close to zero: a 20-candidate Pro ranking costs about
$0.001 in Jev tokens, so 300 a day is $0.30 a day worst case against $9 a
month. This is a core offer in the $30 to $500 a year band: no sales calls,
sells itself from a link, and builds a list of buyers who care about
content performance.

Two levers if you want more:

- **Credits pack** at $19 for 200 rankings for people who refuse
  subscriptions.
- **Team plan** at $29/month with 3 keys and CSV export, once anyone asks.

## What makes it different

Say this in every post:

1. It never writes a headline. It only judges yours. That is the whole
   pitch: you keep your voice, the arena keeps you honest.
2. Every pair, both orders. Position bias cancels out. A single
   "rank these" prompt to a chat model cannot claim that.
3. Calibrated numbers. "Winner beats runner-up 71% of the time" is an
   actual probability, not a vibe.
4. Cheap enough to be free. 400 judgments for a tenth of a cent.

## Launch post (LinkedIn, ~150 words)

> I used to A/B test headlines by posting them and waiting a week.
>
> This weekend I built Hook Arena. Paste up to 20 hooks. Every pair goes
> head to head, in both orders, judged by Jev, TypeSafe's new decision
> model that returns calibrated probabilities instead of paragraphs.
>
> A 20-headline tournament is 400 judgments. It took 2.4 seconds and cost
> $0.0011.
>
> It does not write headlines. It only ranks yours, with a win margin and a
> clickbait flag per line.
>
> Free for 3 rankings a day. Link in comments.
>
> The interesting part for the data engineers here: this is the first model
> I have used where "run 400 evaluations per request" is a reasonable
> default. Batch judgment as a primitive changes what you can build in a
> weekend.

## Follow-up content (feeds the flywheel)

- Substack: "I ranked my 50 most-read Medium headlines with a Jev
  tournament. Here is what the model rewards." (Run it, publish the
  matrix.)
- LinkedIn: "The Bradley-Terry model in 12 lines of JavaScript." (Link the
  repo file.)
- Substack: "What a System One model is, explained for data engineers."

## Metrics to watch in week one

- Rankings per day (Worker analytics).
- Free-to-Pro conversion. Target 1 to 2 percent of people who hit the quota
  wall.
- Where the 402s come from: the 8-candidate cap or the 3-a-day cap. That
  tells you which limit to tune.
