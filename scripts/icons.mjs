// Rasterise public/icon.svg (the doodle mark) into the PNG icons that the manifest and the layout name.
// Run: node scripts/icons.mjs
import { readFileSync } from "node:fs";
import sharp from "sharp";   // installed with next (its image optimiser); not a dependency of the app

const svg = readFileSync("public/icon.svg", "utf8");
const art = svg.slice(svg.indexOf("/>") + 2, svg.lastIndexOf("</svg>"));   // the drawing without its rounded background
// Full-bleed lime; the drawing at 68% sits inside the maskable safe zone (the middle 80%).
const fullBleed = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#c8ff00"/>` +
  `<g transform="translate(${256 * (1 - scale)} ${256 * (1 - scale)}) scale(${scale})">${art}</g></svg>`;

const png = (src, size, file) => sharp(Buffer.from(src)).resize(size, size).png().toFile(`public/${file}`);
await Promise.all([
  png(svg, 192, "icons/icon-192.png"),
  png(svg, 512, "icons/icon-512.png"),
  png(fullBleed(0.68), 512, "icons/icon-maskable-512.png"),
  png(fullBleed(0.9), 180, "apple-touch-icon.png"),   // iOS rounds the corners itself
]);
console.log("icons written");
