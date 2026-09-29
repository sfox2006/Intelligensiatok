import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { ROOT, canonicalPost, stringifyPost } from "./lib.mjs";

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/import-saved.mjs <export.json>");
  process.exit(1);
}

const raw = JSON.parse(await readFile(path.resolve(input), "utf8"));
const posts = Array.isArray(raw) ? raw : raw.posts;
if (!Array.isArray(posts) || posts.length === 0) {
  console.error("The file needs a posts array, or it needs to be an array of posts.");
  process.exit(1);
}

const savedDir = path.join(ROOT, "saved");
await mkdir(savedDir, { recursive: true });
const written = [];
for (const post of posts) {
  if (!post || typeof post.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.id)) {
    console.error("Skipped an entry with no slug id.");
    continue;
  }
  const file = path.join(savedDir, `${post.id}.json`);
  await writeFile(file, stringifyPost(canonicalPost(post)));
  written.push(post.id);
}

let manifest = { posts: [] };
try {
  manifest = JSON.parse(await readFile(path.join(savedDir, "manifest.json"), "utf8"));
} catch {
  manifest = { posts: [] };
}
const known = new Set(Array.isArray(manifest.posts) ? manifest.posts : []);
for (const id of written) known.add(id);
const next = {
  importedAt: new Date().toISOString(),
  posts: [...known].sort(),
};
await writeFile(path.join(savedDir, "manifest.json"), `${JSON.stringify(next, null, 2)}\n`);
console.log(`Wrote ${written.length} post${written.length === 1 ? "" : "s"} to saved/.`);
console.log("Review the diff, then commit it if you want this repository to keep them.");
