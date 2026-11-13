import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."),
  out = resolve(root, "dist");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const entry of [
  "index.html",
  "astral3d.js",
  "astral3d.css",
  "src",
  "vendor",
])
  await cp(resolve(root, entry), resolve(out, entry), { recursive: true });
await writeFile(resolve(out, ".nojekyll"), "");
const html = await readFile(resolve(out, "index.html"), "utf8");
if (/(?:src|href)="\//.test(html))
  throw Error("Use relative paths for GitHub Pages.");
console.log("Static build ready in dist/. No CDN or runtime server required.");
