import { writeFeedFile } from "./lib.mjs";

const check = process.argv.includes("--check");
const result = await writeFeedFile();
if (check && result.changed) {
  console.error("content/feed.json was out of date.");
  process.exit(1);
}
console.log(`${result.changed ? "Wrote" : "Already current"} content/feed.json (${result.count} published posts).`);
