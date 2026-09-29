import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  POSTS_DIR,
  ROOT,
  callLlm,
  checkUrl,
  extractJson,
  llmKeyPresent,
  loadFields,
  loadLlmConfig,
  loadPosts,
  resolveModel,
  stringifyPost,
  todayUtc,
  validatePost,
} from "./lib.mjs";

const dryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "true";
const only = flagValue("--file") || process.env.REVIEW_FILE || "";

function flagValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

function asStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
}

const config = await loadLlmConfig();
const threshold = Number(process.env.PUBLISH_CONFIDENCE || config.publishConfidence || 0.75);
const limit = Number(process.env.REVIEWER_POSTS_PER_RUN || config.reviewerPostsPerRun || 5);
const fields = await loadFields();
const posts = await loadPosts();
const persona = await readFile(path.join(ROOT, "agents", "reviewer.md"), "utf8");
let drafts = posts.filter((post) => post.status === "draft" && !post.__parseError);
if (only) {
  const base = path.basename(only);
  drafts = posts.filter((post) => post.__file === base || post.id === only.replace(/\.json$/, ""));
}
drafts = drafts.slice(0, limit);
if (drafts.length === 0) {
  console.log("No drafts to review.");
  process.exit(0);
}

if (!llmKeyPresent()) {
  console.log("LLM_API_KEY is not set. Drafts were left unchanged. Review them by hand, or set the secret and run again.");
  process.exit(0);
}

const model = resolveModel(config, "reviewer");
let failures = 0;

for (const post of drafts) {
  console.log(`Checking sources for ${post.id}`);
  const sourceResults = [];
  for (const source of post.sources || []) {
    if (!source || typeof source.url !== "string") continue;
    sourceResults.push(await checkUrl(source.url));
  }

  const system = `${persona}

You are the sceptical reviewer for Intelligensiatok. Return one JSON object and nothing else.
Never invent a source, a URL, a quotation, or a number. If you cannot substantiate a claim from a source you know is real, list it in unverifiedClaims and set status to "rejected".
A source you only half-remember is not good enough. An unverified claim means rejection, not a hedge.
You may correct the prose when you are sure. Put each correction in corrections as a sentence.
Do not raise confidence to sound helpful. confidence is a number from 0 to 1.
status is "published", "reviewed", or "rejected".
- published: every claim is supported, every URL is a real source you can stand behind, confidence is at least ${threshold}, unverifiedClaims is empty.
- reviewed: the prose looks sound and the sources are real, but you would want a human to confirm before it is shown, or confidence is below ${threshold}.
- rejected: a source is missing, a URL looks invented, or a claim is not supported.

JSON shape:
{
  "status": "published",
  "confidence": 0.8,
  "notes": "What you checked and what you refused to claim.",
  "corrections": [],
  "unverifiedClaims": [],
  "revised": {
    "title": "...",
    "hook": "...",
    "body": "...",
    "deeper": "...",
    "example": "...",
    "sources": [{"title": "...", "url": "https://..."}]
  }
}`;

  const user = `Review this draft. Automated URL check results are attached. 404 or 410 means the URL was not found. 401, 403, 429, or a timeout is inconclusive: the page may exist but this client could not read it. Inconclusive is not substantiation. Do not publish a post on an inconclusive fetch.

URL checks:
${JSON.stringify(sourceResults, null, 2)}

Draft:
${JSON.stringify({
  id: post.id,
  field: post.field,
  title: post.title,
  hook: post.hook,
  body: post.body,
  deeper: post.deeper,
  example: post.example,
  sources: post.sources,
  authorAgent: post.authorAgent,
  created: post.created,
}, null, 2)}`;

  let modelResult = null;
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await callLlm({
      system,
      user: lastError ? `${user}\n\nPrevious output failed: ${lastError}\nReturn JSON only.` : user,
      model,
      temperature: 0.1,
      maxTokens: 4500,
    });
    if (!response.ok) {
      console.error(response.error || response.reason);
      failures += 1;
      modelResult = null;
      break;
    }
    try {
      modelResult = extractJson(response.text);
      break;
    } catch (error) {
      lastError = error.message;
      modelResult = null;
    }
  }
  if (!modelResult) {
    console.error(`Could not parse a review for ${post.id}. Left unchanged.`);
    failures += 1;
    continue;
  }

  const revised = modelResult.revised && typeof modelResult.revised === "object" ? modelResult.revised : {};
  const proposedSources = Array.isArray(revised.sources) && revised.sources.length ? revised.sources : post.sources;
  const finalChecks = [];
  for (const source of proposedSources) {
    if (!source || typeof source.url !== "string") continue;
    const prior = sourceResults.find((item) => item.url === source.url);
    finalChecks.push(prior || (await checkUrl(source.url)));
  }
  const hardFail = finalChecks.filter((item) => !item.ok && !item.inconclusive);
  const inconclusive = finalChecks.filter((item) => item.inconclusive);
  let unverified = asStringList(modelResult.unverifiedClaims);
  const corrections = asStringList(modelResult.corrections);
  const notes = [];
  if (typeof modelResult.notes === "string" && modelResult.notes.trim()) notes.push(modelResult.notes.trim());
  let status = modelResult.status;
  const confidence = Number(modelResult.confidence);

  if (hardFail.length) {
    status = "rejected";
    for (const item of hardFail) unverified.push(`Source URL was not found (${item.status}): ${item.url}`);
    notes.push("Rejected because at least one cited URL could not be found. A missing page is not a source.");
  }
  if (unverified.length) status = "rejected";
  if (!Number.isFinite(confidence)) {
    status = "rejected";
    notes.push("Rejected because the review did not include a numeric confidence.");
  } else if (status === "published" && confidence < threshold) {
    status = confidence >= 0.5 ? "reviewed" : "rejected";
    notes.push(`Not published: confidence ${confidence} is below ${threshold}.`);
  }
  if (inconclusive.length && status !== "rejected") {
    if (status === "published") status = "reviewed";
    notes.push("Held for a human check: at least one source URL could not be fetched (blocked or timed out), so it is not yet substantiated.");
  }
  if (status !== "published" && status !== "reviewed" && status !== "rejected") {
    status = "rejected";
    notes.push("Rejected because the review status was not recognised.");
  }
  if ((status === "published" || status === "reviewed") && unverified.length) status = "rejected";

  const next = {
    id: post.id,
    field: post.field,
    title: post.title,
    hook: post.hook,
    body: post.body,
    deeper: post.deeper,
    example: post.example,
    sources: post.sources,
    authorAgent: post.authorAgent,
    created: post.created,
    status,
    review: {
      reviewer: "reviewer",
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
      notes: notes.join(" "),
      corrections,
      unverifiedClaims: status === "rejected" ? unverified : [],
      reviewedAt: todayUtc(),
    },
  };

  if (status === "published" || status === "reviewed") {
    for (const key of ["title", "hook", "body", "deeper", "example"]) {
      if (typeof revised[key] === "string" && revised[key].trim()) next[key] = revised[key].trim();
    }
    if (Array.isArray(proposedSources) && proposedSources.length) next.sources = proposedSources;
  }

  if (next.review.notes.trim().length < 40) {
    next.review.notes = `${next.review.notes} The draft was not cleared for the feed.`.trim();
  }
  const errors = validatePost(next, { filename: `${next.id}.json`, fields });
  if (errors.length) {
    console.error(`Review of ${post.id} failed schema validation and was not written:`);
    for (const error of errors) console.error(`- ${error}`);
    failures += 1;
    continue;
  }
  if (dryRun) {
    console.log(stringifyPost(next));
    continue;
  }
  await writeFile(path.join(POSTS_DIR, `${next.id}.json`), stringifyPost(next));
  console.log(`${next.id} → ${next.status} (confidence ${next.review.confidence})`);
}

if (failures) process.exit(1);
