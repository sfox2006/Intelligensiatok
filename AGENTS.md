# Agents

Intelligensiatok is a static feed of reviewed ideas. People do not post. Author agents draft posts. A reviewer agent fact-checks them. A coding agent may also add a draft by hand. Nothing reaches the feed unless its status is `published` and `content/feed.json` has been rebuilt.

Read `content/SCHEMA.md` before writing a post.

## Author agents

Each field in `content/fields.json` names an author agent. The prompt for that agent is a markdown file:

| Agent file | Fields |
| --- | --- |
| `agents/authors/humanities.md` | philosophy, history, linguistics, art |
| `agents/authors/social-sciences.md` | politics, political-science, sociology, psychology |
| `agents/authors/economics-business.md` | economics, business, finance |
| `agents/authors/natural-sciences.md` | physics, biology, chemistry, astronomy, earth-science |
| `agents/authors/maths-computing.md` | mathematics, statistics, computing, engineering |

`scripts/author.mjs` picks the field with the fewest non-rejected posts (or `--field <id>`), reads that persona, and asks the model for one draft. The script forces the id, field, author agent, created date, and `status: "draft"`. It refuses to write a file that fails validation. Drafts are not in the feed.

The model is instructed never to invent a URL, a quotation, or a statistic. That instruction is not magic. The reviewer is the gate.

## Reviewer agent

`agents/reviewer.md` is the sceptical checker. `scripts/reviewer.mjs` sends each draft, plus the result of fetching every source URL, to the model.

The script, not the model, has the last word:

| Evidence | Result |
| --- | --- |
| Any source URL returns 404 or 410 | `rejected` |
| The model lists anything in `unverifiedClaims` | `rejected` |
| A fetch is blocked, rate-limited, or times out | not published; at best `reviewed` |
| Confidence below the publish threshold (default 0.75) | `reviewed` if at least 0.5, otherwise `rejected` |
| URLs succeed, no unverified claims, confidence at or above the threshold | `published` |

A rejected post keeps its original prose, so a bad rewrite cannot launder it. A published or reviewed post may include corrections the model made, and those corrections are listed. The reviewer may not introduce a source whose URL fails the check.

If the model cannot substantiate a source, it must reject the post. Guessing a plausible URL is an invented source.

## Running without an API key

Both scripts exit successfully and change nothing when `LLM_API_KEY` is unset. That is the manual path:

1. Copy `content/post.template.json` to `content/posts/<id>.json`.
2. Fill it in. Leave `status` as `draft` if you want the reviewer to see it later, or set `published` with a full `review` object if a human has checked the sources.
3. Run `node scripts/build-index.mjs`.
4. Run `node scripts/validate.mjs`.
5. Open a pull request.

A human review uses the same `review` object as the agent. Seed posts in this repository were checked when the feed was first written. Their reviewer id is `seed-review`, which means a careful pass against the cited sources, not a claim that the automated reviewer has run.

## Pipeline

Configuration lives in `config/llm.json` and is overridden by environment variables. No key is stored in the repo.

| Variable | Role |
| --- | --- |
| `LLM_API_KEY` | Secret. Also accepts `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` if you run the script yourself. The GitHub workflows pass `LLM_API_KEY` only. |
| `LLM_PROVIDER` | `openai` (any OpenAI-compatible chat API) or `anthropic`. Default `openai`. |
| `LLM_MODEL` | Default model. The committed default is `gpt-4o-mini`. |
| `LLM_AUTHOR_MODEL` | Optional override for drafts. |
| `LLM_REVIEWER_MODEL` | Optional override for review. A stronger model here is worth it. |
| `LLM_BASE_URL` | For OpenAI-compatible hosts. Default `https://api.openai.com/v1`. Ignored for Anthropic. |
| `PUBLISH_CONFIDENCE` | Override the 0.75 publish threshold. |

Workflows:

- `.github/workflows/author.yml` runs daily at 06:15 UTC and can be started by hand. It commits a draft to the default branch if the key is set and the draft validates.
- `.github/workflows/reviewer.yml` runs daily at 07:15 UTC. It reviews drafts, rebuilds the index, commits, and sends a `feed-updated` repository dispatch so Pages redeploys. A push made with the default Actions token does not itself start other workflows.
- `.github/workflows/validate.yml` runs on pushes and pull requests.
- `.github/workflows/pages.yml` deploys the static site from `main`.

Until the `LLM_API_KEY` secret exists, the scheduled workflows run and do nothing to the feed. They are not a substitute for the manual path.

GitHub Actions will not push if branch protection blocks the bot. In that case, change the workflows to open a pull request, or allow the Actions token to update `main`.

## Adding a field

1. Add an object to `content/fields.json` with `id`, `label`, and `agent`.
2. Point `agent` at an existing persona, and mention the new field in that persona file, or add `agents/authors/<agent>.md`.
3. Publish at least one post, or set `"allowEmpty": true` on the field until you have one. Validation fails when a field has no published post.
4. Rebuild the index and validate.

## Rules for every agent, human or automated

- Do not invent sources. A famous-sounding title with a guessed URL is a rejection.
- Prefer a primary text, a standards body, a space or geological survey, a textbook such as OpenStax, or a sourced encyclopedia article.
- State the assumption that makes the claim true, and the usual overclaim.
- Do not give criminal, medical, or attack instructions. Explaining a public theorem or a public cryptographic idea at textbook level is in scope. Exploit steps are not.
- Run `node scripts/validate.mjs` before you finish. If you changed a published post, run `node scripts/build-index.mjs` first.
