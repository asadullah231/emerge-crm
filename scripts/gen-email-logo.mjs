/**
 * One-off asset generator: rasterise the official EmergeTech mark (app/icon.svg)
 * to a PNG for use in transactional emails, where SVG is not reliably rendered
 * (Gmail/Outlook block it). Output is committed; this script is only re-run when
 * the mark changes.
 *
 * Requires the dev tool (not a runtime dep):
 *   pnpm add -D -w @resvg/resvg-js
 *   node scripts/gen-email-logo.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const svg = readFileSync("apps/web/src/app/icon.svg", "utf8");
const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 240 } });
const png = resvg.render().asPng();
mkdirSync("apps/web/public/email", { recursive: true });
writeFileSync("apps/web/public/email/emergetech-logo.png", png);
console.log(`wrote apps/web/public/email/emergetech-logo.png (${png.length} bytes)`);
