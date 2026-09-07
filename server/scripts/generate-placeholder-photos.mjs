// One-off generator for the 20 placeholder Tamir photos (D-08).
//
// The real Tamir photo set is not yet in the repo. This script emits 20
// distinct, minimal, self-contained SVG images so every other Phase 4 plan
// (photo pool selection, round assignment, the UI's <img> tags) has a real
// on-disk photo set to work against. Once the real photos exist, this
// directory is a drop-in swap and this script is no longer needed at
// runtime — it is kept committed only so the placeholder count or palette
// can be regenerated later if needed.
//
// Run with: node server/scripts/generate-placeholder-photos.mjs

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../../client/public/tamir-photos");

const PHOTO_COUNT = 20;

function svgFor(n) {
  const hue = (n - 1) * 18; // sweeps evenly around the color wheel across 20 files
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <rect x="0" y="0" width="400" height="400" fill="hsl(${hue}, 70%, 45%)" />
  <text x="200" y="200" font-family="sans-serif" font-size="160" fill="white" text-anchor="middle" dominant-baseline="middle">${n}</text>
</svg>
`;
}

for (let n = 1; n <= PHOTO_COUNT; n += 1) {
  const filename = `${String(n).padStart(2, "0")}.svg`;
  const filePath = path.join(OUTPUT_DIR, filename);
  writeFileSync(filePath, svgFor(n), "utf8");
  console.log(`wrote ${filePath}`);
}
