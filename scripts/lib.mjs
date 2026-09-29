import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");
export const POSTS_DIR = path.join(ROOT, "content", "posts");
export const FEED_PATH = path.join(ROOT, "content", "feed.json");
export const FIELDS_PATH = path.join(ROOT, "content", "fields.json");
export const LLM_PATH = path.join(ROOT, "config", "llm.json");

export const POST_KEYS = [
  "id",
  "field",
  "title",
  "hook",
  "body",
  "deeper",
  "example",
  "sources",
  "authorAgent",
  "created",
  "status",
  "review",
];
export const REVIEW_KEYS = [
  "reviewer",
  "confidence",
  "notes",
  "corrections",
  "unverifiedClaims",
  "reviewedAt",
];
export const STATUSES = ["draft", "reviewed", "published", "rejected"];

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function canonicalPost(post) {
  const out = {};
  for (const key of POST_KEYS) {
    if (Object.prototype.hasOwnProperty.call(post, key) && post[key] !== undefined) {
      out[key] = post[key];
    }
  }
  if (Array.isArray(out.sources)) {
    out.sources = out.sources.map((source) => ({ title: source.title, url: source.url }));
  }
  if (out.review && typeof out.review === "object") {
    const review = {};
    for (const key of REVIEW_KEYS) {
      if (Object.prototype.hasOwnProperty.call(out.review, key) && out.review[key] !== undefined) {
        review[key] = out.review[key];
      }
    }
    out.review = review;
  }
  return out;
}

export function mixKey(id) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function publishedFeedPosts(posts) {
  return posts
    .filter((post) => post.status === "published" && !post.__parseError)
    .map((post) => canonicalPost(post))
    .sort((a, b) => mixKey(a.id) - mixKey(b.id) || a.id.localeCompare(b.id));
}

export function feedDocument(posts) {
  const published = publishedFeedPosts(posts);
  return { version: 1, count: published.length, posts: published };
}

export async function loadFields() {
  const raw = JSON.parse(await readFile(FIELDS_PATH, "utf8"));
  if (!raw || !Array.isArray(raw.fields)) {
    throw new Error("content/fields.json must contain a fields array");
  }
  return raw.fields;
}

export async function loadPosts() {
  let names = [];
  try {
    names = (await readdir(POSTS_DIR)).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const posts = [];
  for (const name of names) {
    const text = await readFile(path.join(POSTS_DIR, name), "utf8");
    try {
      const json = JSON.parse(text);
      json.__file = name;
      posts.push(json);
    } catch (error) {
      posts.push({ __file: name, __parseError: error.message });
    }
  }
  return posts;
}

export async function loadLlmConfig() {
  const raw = JSON.parse(await readFile(LLM_PATH, "utf8"));
  return raw;
}

export function resolveModel(config, role) {
  const roleEnv = role === "author" ? process.env.LLM_AUTHOR_MODEL : process.env.LLM_REVIEWER_MODEL;
  const roleCfg = role === "author" ? config.authorModel : config.reviewerModel;
  return roleEnv || roleCfg || process.env.LLM_MODEL || config.model;
}

export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function extractJson(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Model output did not contain a JSON object");
  }
  return JSON.parse(body.slice(start, end + 1));
}

function isDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function lengthError(errors, label, value, min, max) {
  if (typeof value !== "string") {
    errors.push(`${label} must be a string`);
    return;
  }
  const size = value.trim().length;
  if (size < min) errors.push(`${label} is too short (${size} < ${min})`);
  if (size > max) errors.push(`${label} is too long (${size} > ${max})`);
}

export function validatePost(post, { filename, fields }) {
  const errors = [];
  if (!post || typeof post !== "object" || Array.isArray(post)) {
    return ["post must be an object"];
  }
  if (post.__parseError) {
    return [`${filename}: invalid JSON (${post.__parseError})`];
  }
  for (const key of Object.keys(post)) {
    if (key.startsWith("__")) continue;
    if (!POST_KEYS.includes(key)) errors.push(`unknown field ${key}`);
  }
  if (typeof post.id !== "string" || !ID_RE.test(post.id)) {
    errors.push("id must be a lowercase slug");
  } else if (filename && filename !== `${post.id}.json`) {
    errors.push(`filename ${filename} must match id ${post.id}`);
  }
  const field = fields.find((item) => item.id === post.field);
  if (!field) errors.push(`unknown field ${post.field}`);
  else if (post.authorAgent !== field.agent) {
    errors.push(`authorAgent ${post.authorAgent} does not match ${field.agent} for ${post.field}`);
  }
  lengthError(errors, "title", post.title, 3, 140);
  lengthError(errors, "hook", post.hook, 40, 320);
  lengthError(errors, "body", post.body, 400, 3500);
  lengthError(errors, "deeper", post.deeper, 400, 5000);
  lengthError(errors, "example", post.example, 180, 3500);
  if (!isDate(post.created)) errors.push("created must be YYYY-MM-DD");
  if (!STATUSES.includes(post.status)) errors.push(`status must be one of ${STATUSES.join(", ")}`);

  if (!Array.isArray(post.sources)) {
    errors.push("sources must be an array");
  } else {
    const minSources = post.status === "published" || post.status === "reviewed" ? 2 : 1;
    if (post.sources.length < minSources) errors.push(`need at least ${minSources} sources`);
    if (post.sources.length > 6) errors.push("at most 6 sources");
    post.sources.forEach((source, index) => {
      if (!source || typeof source !== "object") {
        errors.push(`sources[${index}] must be an object`);
        return;
      }
      for (const key of Object.keys(source)) {
        if (key !== "title" && key !== "url") errors.push(`sources[${index}] has unknown field ${key}`);
      }
      lengthError(errors, `sources[${index}].title`, source.title, 3, 200);
      if (typeof source.url !== "string" || !isHttpsUrl(source.url)) {
        errors.push(`sources[${index}].url must be an https URL`);
      }
    });
  }

  const needsReview = post.status === "reviewed" || post.status === "published" || post.status === "rejected";
  if (needsReview && (post.review === undefined || post.review === null)) {
    errors.push("review is required unless status is draft");
  }
  if (post.review !== undefined && post.review !== null) {
    if (typeof post.review !== "object" || Array.isArray(post.review)) {
      errors.push("review must be an object");
    } else {
      for (const key of Object.keys(post.review)) {
        if (!REVIEW_KEYS.includes(key)) errors.push(`review.${key} is not a known field`);
      }
      for (const key of REVIEW_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(post.review, key)) errors.push(`review.${key} is required`);
      }
      if (typeof post.review.reviewer !== "string" || !post.review.reviewer.trim()) {
        errors.push("review.reviewer is required");
      }
      if (typeof post.review.confidence !== "number" || !Number.isFinite(post.review.confidence) || post.review.confidence < 0 || post.review.confidence > 1) {
        errors.push("review.confidence must be a number from 0 to 1");
      }
      lengthError(errors, "review.notes", post.review.notes, 40, 4000);
      if (!Array.isArray(post.review.corrections) || post.review.corrections.some((item) => typeof item !== "string" || !item.trim())) {
        errors.push("review.corrections must be an array of strings");
      }
      if (!Array.isArray(post.review.unverifiedClaims) || post.review.unverifiedClaims.some((item) => typeof item !== "string" || !item.trim())) {
        errors.push("review.unverifiedClaims must be an array of strings");
      } else if ((post.status === "published" || post.status === "reviewed") && post.review.unverifiedClaims.length > 0) {
        errors.push("published and reviewed posts cannot list unverified claims");
      }
      if (!isDate(post.review.reviewedAt)) errors.push("review.reviewedAt must be YYYY-MM-DD");
    }
  }
  return errors;
}

export async function validateLibrary() {
  const fields = await loadFields();
  const posts = await loadPosts();
  const errors = [];
  const ids = new Set();
  const fieldIds = new Set();
  for (const field of fields) {
    if (!field || typeof field.id !== "string" || !ID_RE.test(field.id)) {
      errors.push("a field id is missing or not a slug");
      continue;
    }
    if (fieldIds.has(field.id)) errors.push(`duplicate field id ${field.id}`);
    fieldIds.add(field.id);
    if (typeof field.label !== "string" || !field.label.trim()) errors.push(`${field.id} needs a label`);
    if (typeof field.agent !== "string" || !field.agent.trim()) errors.push(`${field.id} needs an agent`);
    else {
      try {
        await readFile(path.join(ROOT, "agents", "authors", `${field.agent}.md`), "utf8");
      } catch {
        errors.push(`missing agents/authors/${field.agent}.md for field ${field.id}`);
      }
    }
  }
  try {
    await readFile(path.join(ROOT, "agents", "reviewer.md"), "utf8");
  } catch {
    errors.push("missing agents/reviewer.md");
  }

  for (const post of posts) {
    const fileErrors = validatePost(post, { filename: post.__file, fields });
    for (const error of fileErrors) errors.push(`${post.__file}: ${error}`);
    if (post.id) {
      if (ids.has(post.id)) errors.push(`duplicate id ${post.id}`);
      ids.add(post.id);
    }
  }

  const publishedByField = new Map(fields.map((field) => [field.id, 0]));
  for (const post of posts) {
    if (post.status === "published" && publishedByField.has(post.field)) {
      publishedByField.set(post.field, publishedByField.get(post.field) + 1);
    }
  }
  for (const field of fields) {
    if (field.allowEmpty) continue;
    if ((publishedByField.get(field.id) || 0) < 1) {
      errors.push(`field ${field.id} has no published post (set allowEmpty, or publish one)`);
    }
  }

  let feed = null;
  try {
    feed = JSON.parse(await readFile(FEED_PATH, "utf8"));
  } catch (error) {
    errors.push(`content/feed.json: ${error.message}`);
  }
  if (feed) {
    const expected = feedDocument(posts.filter((post) => !post.__parseError));
    if (feed.version !== 1) errors.push("content/feed.json version must be 1");
    if (feed.count !== expected.count) {
      errors.push(`content/feed.json count is ${feed.count}, expected ${expected.count}`);
    }
    if (JSON.stringify(feed.posts) !== JSON.stringify(expected.posts)) {
      errors.push("content/feed.json is out of date. Run node scripts/build-index.mjs");
    }
    const stray = (feed.posts || []).filter((post) => post.status !== "published");
    if (stray.length) errors.push("content/feed.json contains a post that is not published");
  }

  const publishedCount = posts.filter((post) => post.status === "published").length;
  return { errors, publishedCount, postCount: posts.length, fields: fields.length };
}

export async function writeFeedFile() {
  const posts = await loadPosts();
  const document = feedDocument(posts.filter((post) => !post.__parseError));
  const next = `${JSON.stringify(document, null, 2)}\n`;
  let current = "";
  try {
    current = await readFile(FEED_PATH, "utf8");
  } catch {
    current = "";
  }
  if (current === next) return { changed: false, count: document.count };
  await writeFile(FEED_PATH, next);
  return { changed: true, count: document.count };
}

export async function checkUrl(url) {
  const timeout = AbortSignal.timeout(20000);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: timeout,
      headers: {
        "user-agent": "intelligensiatok-reviewer/1.0",
        accept: "text/html,application/pdf,application/xhtml+xml,*/*",
      },
    });
    const status = response.status;
    if (status === 401 || status === 403 || status === 429 || status >= 500) {
      return { url, ok: false, inconclusive: true, status };
    }
    if (status >= 200 && status < 400) return { url, ok: true, inconclusive: false, status };
    return { url, ok: false, inconclusive: false, status };
  } catch (error) {
    return { url, ok: false, inconclusive: true, status: 0, error: error.name || String(error) };
  }
}

export function llmKeyPresent() {
  return Boolean(apiKey());
}

function apiKey() {
  return process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || "";
}

function redact(text, key) {
  let out = String(text || "");
  if (key) out = out.split(key).join("REDACTED");
  return out.replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-REDACTED");
}

export async function callLlm({ system, user, model, temperature = 0.4, maxTokens = 4000 }) {
  const config = await loadLlmConfig();
  const key = apiKey();
  if (!key) return { ok: false, reason: "no-key" };
  const provider = (process.env.LLM_PROVIDER || config.provider || "openai").toLowerCase();
  const chosen = model || resolveModel(config, "author");
  try {
    if (provider === "anthropic") {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: AbortSignal.timeout(120000),
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: chosen,
          max_tokens: maxTokens,
          temperature,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(`Anthropic ${response.status}: ${redact(body, key).slice(0, 500)}`);
      }
      const parsed = JSON.parse(body);
      const text = (parsed.content || []).map((block) => block.text || "").join("\n");
      return { ok: true, text, model: chosen, provider };
    }

    const base = (process.env.LLM_BASE_URL || config.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(120000),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: chosen,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`LLM ${response.status}: ${redact(body, key).slice(0, 500)}`);
    }
    const parsed = JSON.parse(body);
    const text = parsed.choices?.[0]?.message?.content || "";
    return { ok: true, text, model: chosen, provider };
  } catch (error) {
    return { ok: false, reason: "error", error: redact(error.message, key) };
  }
}

export function stringifyPost(post) {
  return `${JSON.stringify(canonicalPost(post), null, 2)}\n`;
}
