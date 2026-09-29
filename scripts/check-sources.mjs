import { loadPosts, checkUrl } from "./lib.mjs";

const strict = process.argv.includes("--strict");
const posts = await loadPosts();
const urls = new Map();
for (const post of posts) {
  if (post.__parseError || !Array.isArray(post.sources)) continue;
  if (post.status === "rejected") continue;
  for (const source of post.sources) {
    if (typeof source.url === "string" && !urls.has(source.url)) urls.set(source.url, []);
    if (typeof source.url === "string") urls.get(source.url).push(post.id || post.__file);
  }
}

let hardFailures = 0;
let warnings = 0;
const entries = [...urls.keys()];
console.log(`Checking ${entries.length} source URLs...`);
for (const url of entries) {
  const result = await checkUrl(url);
  if (result.ok) {
    console.log(`ok   ${result.status}  ${url}`);
  } else if (result.inconclusive) {
    warnings += 1;
    console.log(`warn ${result.status || result.error}  ${url}`);
  } else {
    hardFailures += 1;
    console.log(`FAIL ${result.status}  ${url}  (${urls.get(url).join(", ")})`);
  }
}
console.log(`Done. ${hardFailures} hard failures, ${warnings} inconclusive.`);
if (hardFailures && strict) process.exit(1);
