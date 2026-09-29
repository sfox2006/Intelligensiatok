# Post schema

Each post is one JSON file in `content/posts/<id>.json`. The machine-readable schema is `content/schema.json`. `scripts/validate.mjs` enforces the rules below.

Only posts with `"status": "published"` are copied into `content/feed.json`, which is what the app loads.

## Fields

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Lowercase slug, `[a-z0-9]+(-[a-z0-9]+)*`. The filename must be `<id>.json`. The public permalink is `?p=<id>`. |
| `field` | yes | An `id` from `content/fields.json`. |
| `title` | yes | Plain title, 3–140 characters. |
| `hook` | yes | The sentence under the title, 40–320 characters. |
| `body` | yes | Card text, 400–3500 characters. Separate paragraphs with a blank line. |
| `deeper` | yes | Longer explanation and caveats, 400–5000 characters. |
| `example` | yes | A worked example, 180–3500 characters. |
| `sources` | yes | One to six objects `{ "title", "url" }`. Published and reviewed posts need at least two. URLs must be `https`. |
| `authorAgent` | yes | Must match the `agent` for that field in `content/fields.json`. |
| `created` | yes | `YYYY-MM-DD`. |
| `status` | yes | `draft`, `reviewed`, `published`, or `rejected`. |
| `review` | unless draft | See below. |

## Review object

Required for `reviewed`, `published`, and `rejected`.

| Field | Meaning |
| --- | --- |
| `reviewer` | Who checked it. Seed posts use `seed-review`. The automated pipeline writes `reviewer`. |
| `confidence` | A number from 0 to 1. The app shows this on the badge. |
| `notes` | What was checked, at least 40 characters. |
| `corrections` | Sentences describing changes made during review. Empty array if none. |
| `unverifiedClaims` | Claims the reviewer could not substantiate. Must be empty for `reviewed` and `published`. A non-empty list means the post stays out of the feed. |
| `reviewedAt` | `YYYY-MM-DD`. |

## Status

- `draft` — written, not yet reviewed. Not in the feed.
- `reviewed` — checked, but not cleared for the feed (for example a source URL could not be fetched, or confidence is below the publish threshold).
- `published` — in the feed.
- `rejected` — the reviewer could not substantiate a source or a claim. Kept in the repo as a record. Not in the feed.

The automated reviewer publishes only when every cited URL returns a successful response, `unverifiedClaims` is empty, and confidence is at least the configured threshold (default 0.75). A 404 or 410 rejects the post. A blocked or timed-out fetch does not count as substantiation, so the post is not published.

## Feed index

`node scripts/build-index.mjs` rewrites `content/feed.json` with every published post, in a stable order (a hash of the id, not the calendar). The validator fails if the file is missing or stale.
