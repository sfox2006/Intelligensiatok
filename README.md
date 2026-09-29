# Intelligensiatok

A vertical feed of ideas, one full screen at a time. Every card is written by a field agent, checked against its sources, and shown only if that review published it. The shelf covers philosophy, economics, politics, the sciences, mathematics, history, art, and the fields between them.

The app is a static site. Nothing here needs a server beyond a file host.

**Phone and desktop address, once GitHub Pages is enabled:** [https://sfox2006.github.io/Intelligensiatok/](https://sfox2006.github.io/Intelligensiatok/)

## Use it on your phone

1. Open the Pages address in Safari or Chrome. The site becomes available after this repository’s default branch has run the Pages workflow. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. The workflow file is `.github/workflows/pages.yml`.
2. Install it. In Safari: Share, then **Add to Home Screen**. In Chrome: the browser menu, then **Install app** or **Add to Home Screen**.
3. Scroll. Each card is one idea. **Go deeper** opens a longer note, a worked example, the sources, and the review: a confidence rating, what was checked, and any correction.
4. **Subjects** filters the shelf. **Save** keeps a card on this device. **Share** uses the system share sheet, or copies a stable link if sharing is unavailable. A link looks like `https://sfox2006.github.io/Intelligensiatok/?p=comparative-advantage` and opens that card.

The badge is the review, not a decoration. A confidence under 75% is marked so you read the notes before you trust the card. Seed cards were checked against the cited pages when the feed was written (`reviewer` is `seed-review`). Later cards can be checked by the reviewer agent described in `AGENTS.md`.

After one online visit, the service worker keeps the app shell and the feed for offline reading.

### Keys

On a keyboard: J and K or the arrow keys move between cards. F saves, D opens the deeper note, C copies the link, A opens subjects, T toggles light and dark, Escape closes a panel. The theme is dark unless you switch it.

## Run it locally

```bash
node scripts/build-index.mjs
node scripts/validate.mjs
python3 -m http.server 8080
```

Open `http://localhost:8080`. Opening `index.html` as a file will not do; the feed is fetched, and the service worker needs a proper origin.

Node 20 or newer is enough. There are no package dependencies. `npm test` is not required; `npm run validate` runs the same checks as CI.

## Favourites, and the `saved/` folder

Saving writes to this browser only (`localStorage`). The site has no account and no token, so it cannot commit to GitHub on its own. That is deliberate: a static app that could push to the repository would have to ship a secret.

From **Subjects** you can:

- **Export JSON**, a file the importer understands.
- **Export Markdown**, for reading or for a notebook.
- **Import**, to load an export into this browser, including on another device.
- **Clear saved**, which forgets them on this device only.

To keep a copy in the repository:

```bash
node scripts/import-saved.mjs ~/Downloads/intelligensiatok-saved.json
```

That writes one JSON file per post under `saved/`, plus `saved/manifest.json`. Review the diff and commit it if you want the copy here. Posts in `saved/` are not the feed. If the repository is public, a committed export is public. Leaving them in the browser is the private option.

Tradeoffs, briefly. Browser storage survives reloads and works offline, and it disappears if you clear site data or switch devices. A downloaded file is portable and needs no account. Committing `saved/` gives you history and a backup, at the cost of a manual step and, on a public repo, privacy. A live sync would need a backend and a secret. This app does not have either.

## How a post gets onto the shelf

Posts live in `content/posts/<id>.json`. The schema is in `content/SCHEMA.md` and `content/schema.json`. Status is `draft`, `reviewed`, `published`, or `rejected`. The feed index, `content/feed.json`, contains only `published` posts. Rebuild it with `node scripts/build-index.mjs`. CI fails if the index is stale or a post breaks the schema.

Two ways to add one:

- **By hand or by a coding agent.** Copy `content/post.template.json`, fill it in, cite real `https` sources, and either leave it as a draft or attach a `review` and mark it `published` after you have checked them. Open a pull request. `.github/workflows/validate.yml` runs the validator.
- **By the scheduled agents.** Author personas live in `agents/authors/`. The reviewer persona is `agents/reviewer.md`. The daily workflows are `.github/workflows/author.yml` (06:15 UTC) and `.github/workflows/reviewer.yml` (07:15 UTC). They no-op until the API secret is set. Details, including the rule that a source the reviewer cannot substantiate forces a rejection, are in `AGENTS.md`.

The reviewer fetches each source URL. A 404 or 410 rejects the post. A blocked or timed-out fetch is not treated as confirmation, so the post is not published on that evidence alone. The model is told not to invent a citation. The script enforces the status rules even if the model is confident anyway.

## Set the API key

In the GitHub repository: **Settings → Secrets and variables → Actions → New repository secret**. Name it `LLM_API_KEY`. Put the provider key there. Do not commit it.

Optional **variables** (not secrets), also under Actions:

| Variable | Purpose |
| --- | --- |
| `LLM_PROVIDER` | `openai` or `anthropic`. Default `openai`. Anything other than `anthropic` is called as an OpenAI-compatible chat API. |
| `LLM_MODEL` | Default model. The file default is `gpt-4o-mini`. |
| `LLM_AUTHOR_MODEL` | Override for drafts only. |
| `LLM_REVIEWER_MODEL` | Override for the reviewer. Prefer a stronger model here. |
| `LLM_BASE_URL` | Base URL for an OpenAI-compatible host, without a trailing path beyond `/v1`. |
| `PUBLISH_CONFIDENCE` | Number from 0 to 1. Default `0.75`. |

Anthropic example: set the secret to the Anthropic key, and set `LLM_PROVIDER` to `anthropic` and `LLM_MODEL` to the model you want. The base URL variable is ignored for Anthropic.

You can run the same scripts locally:

```bash
export LLM_API_KEY=...
export LLM_PROVIDER=openai
node scripts/author.mjs --field economics
node scripts/reviewer.mjs
node scripts/build-index.mjs
```

`--dry-run` prints and does not write. With no key, both scripts exit without changing files.

Scheduled workflows will not start other workflows when they push with the default token. The reviewer workflow sends a repository dispatch (`feed-updated`) so Pages still redeploys. If branch protection rejects the push, the feed will not update until that is allowed or the workflows are pointed at a pull request.

`node scripts/check-sources.mjs` fetches every cited URL and reports failures. It is not required in CI, because some good hosts block automated clients; `--strict` exits non-zero on a real 404.

## Add a field or an author

1. Add `{ "id", "label", "agent" }` to `content/fields.json`. Use a slug for `id`.
2. Reuse an agent in `agents/authors/`, and mention the new field in that file, or create `agents/authors/<agent>.md` and point `agent` at that name.
3. Add a published post, or set `"allowEmpty": true` on the field until one exists. The validator requires every field to have a published post unless you opt out.
4. Run `node scripts/build-index.mjs` and `node scripts/validate.mjs`.

## Layout

```
index.html, app.css, app.js, sw.js, manifest.webmanifest
content/posts/*.json      one post per file
content/feed.json         generated index of published posts
content/fields.json       subjects and which agent writes them
agents/authors/*.md       author personas
agents/reviewer.md        reviewer persona
scripts/                  validate, index, author, reviewer, import
.github/workflows/        validate, Pages, author, reviewer
saved/                    optional committed exports, not the feed
```

## Licence of the sources

The cards are original explanations. The sources they cite belong to their authors and publishers. Follow those links rather than treating a card as a substitute for the paper or the book.
