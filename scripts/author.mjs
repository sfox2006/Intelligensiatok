import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  POSTS_DIR,
  ROOT,
  callLlm,
  extractJson,
  llmKeyPresent,
  loadFields,
  loadLlmConfig,
  loadPosts,
  resolveModel,
  slugify,
  stringifyPost,
  todayUtc,
  validatePost,
} from "./lib.mjs";

const dryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "true";
const fieldFlag = flagValue("--field") || process.env.FIELD || "";

function flagValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

function pickField(fields, posts, requested) {
  if (requested) {
    const field = fields.find((item) => item.id === requested);
    if (!field) throw new Error(`Unknown field ${requested}`);
    return field;
  }
  const counts = new Map(fields.map((field) => [field.id, 0]));
  for (const post of posts) {
    if (post.__parseError || post.status === "rejected" || !counts.has(post.field)) continue;
    counts.set(post.field, counts.get(post.field) + 1);
  }
  const min = Math.min(...counts.values());
  const candidates = fields.filter((field) => counts.get(field.id) === min);
  const index = new Date().getUTCDate() % candidates.length;
  return candidates[index];
}

if (!llmKeyPresent()) {
  console.log("LLM_API_KEY is not set. No draft was written. Add the secret, or put a draft JSON file in content/posts/ by hand.");
  process.exit(0);
}

const config = await loadLlmConfig();
const fields = await loadFields();
const posts = await loadPosts();
const perRun = Math.max(1, Math.min(3, Number(process.env.AUTHOR_POSTS_PER_RUN || config.authorPostsPerRun || 1)));
const field = pickField(fields, posts, fieldFlag);
const persona = await readFile(path.join(ROOT, "agents", "authors", `${field.agent}.md`), "utf8");
const existing = posts
  .filter((post) => !post.__parseError)
  .map((post) => `- ${post.id}: ${post.title} [${post.field}, ${post.status}]`)
  .join("\n");

const system = `${persona}

You write one Intelligensiatok post as a single JSON object. Hard rules:
- Output JSON only. No markdown fences, no commentary.
- Cite only sources you are highly confident exist. Prefer a primary text, a standard textbook or encyclopedia entry, and a stable https URL.
- Never invent a URL, a page number, a quotation, or a statistic. If you are not sure a source exists, do not cite it.
- Two or three sources. Each source is {"title","url"} and the URL must start with https://.
- Teach the idea. State the assumption that does the work and the usual overclaim to avoid.
- status must be "draft". Do not include a review object.
- id is a new lowercase slug not already in the list below.
- field must be "${field.id}". authorAgent must be "${field.agent}".
- created will be overwritten. Use today's date anyway: ${todayUtc()}.
`;

const user = `Write one new published-quality draft for the field "${field.label}" (${field.id}).

Do not repeat these existing posts:
${existing || "(none yet)"}

Shape:
{
  "id": "kebab-case-slug",
  "field": "${field.id}",
  "title": "Plain title",
  "hook": "40 to 320 characters.",
  "body": "Two paragraphs separated by a blank line. At least 400 characters.",
  "deeper": "Caveats and context. At least 400 characters.",
  "example": "A worked example. At least 180 characters.",
  "sources": [
    {"title": "Specific source title", "url": "https://..."},
    {"title": "Second source title", "url": "https://..."}
  ],
  "authorAgent": "${field.agent}",
  "created": "${todayUtc()}",
  "status": "draft"
}`;

const model = resolveModel(config, "author");
const taken = new Set(posts.map((post) => post.id).filter(Boolean));
let lastError = "";
let draft = null;
for (let attempt = 1; attempt <= 2; attempt += 1) {
  const response = await callLlm({
    system,
    user: lastError ? `${user}\n\nYour previous output failed: ${lastError}\nReturn corrected JSON only.` : user,
    model,
    temperature: 0.7,
    maxTokens: 3500,
  });
  if (!response.ok) {
    console.error(response.error || response.reason);
    process.exit(1);
  }
  try {
    draft = extractJson(response.text);
    draft.id = slugify(draft.id || draft.title || "draft") || `${field.id}-note`;
    let suffix = 2;
    const base = draft.id;
    while (taken.has(draft.id)) {
      draft.id = `${base}-${suffix}`;
      suffix += 1;
    }
    draft.field = field.id;
    draft.authorAgent = field.agent;
    draft.created = todayUtc();
    draft.status = "draft";
    delete draft.review;
    const problems = validatePost(draft, { filename: `${draft.id}.json`, fields });
    if (problems.length) throw new Error(problems.join("; "));
    lastError = "";
    break;
  } catch (error) {
    lastError = error.message;
    draft = null;
  }
}
if (!draft) {
  console.error(lastError || "The model did not return a draft.");
  process.exit(1);
}
if (perRun > 1) {
  console.log(`authorPostsPerRun is ${perRun}; this run writes one draft. Run the script again for another.`);
}

const file = path.join(POSTS_DIR, `${draft.id}.json`);
if (dryRun) {
  console.log(stringifyPost(draft));
  console.log(`Dry run. Would write ${path.relative(ROOT, file)}`);
  process.exit(0);
}
await writeFile(file, stringifyPost(draft));
console.log(`Wrote draft ${draft.id} (${field.id}) using ${model}. It is not in the feed until a reviewer publishes it.`);
