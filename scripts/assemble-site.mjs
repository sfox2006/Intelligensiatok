import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./lib.mjs";

const site = path.join(ROOT, "_site");
await rm(site, { recursive: true, force: true });
await mkdir(path.join(site, "content"), { recursive: true });
await mkdir(path.join(site, "icons"), { recursive: true });

for (const file of ["index.html", "app.css", "app.js", "sw.js", "manifest.webmanifest", ".nojekyll"]) {
  await cp(path.join(ROOT, file), path.join(site, file));
}
await cp(path.join(ROOT, "content", "feed.json"), path.join(site, "content", "feed.json"));
await cp(path.join(ROOT, "content", "fields.json"), path.join(site, "content", "fields.json"));
for (const name of await readdir(path.join(ROOT, "icons"))) {
  await cp(path.join(ROOT, "icons", name), path.join(site, "icons", name));
}
console.log("Assembled _site/ for GitHub Pages.");
