// Verifies that every local href/src in the site's HTML files resolves to a real file.
// Run: node _tests/link-check.js
const fs = require("fs");
const path = require("path");

const SITE = path.join(__dirname, "..", "X-store");
const files = fs.readdirSync(SITE).filter((f) => f.endsWith(".html"));

let broken = 0;
let checked = 0;

files.forEach((file) => {
    const html = fs.readFileSync(path.join(SITE, file), "utf8");
    const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
    refs.forEach((ref) => {
        if (/^(https?:|mailto:|#|data:)/.test(ref)) return;
        const clean = ref.split("#")[0].split("?")[0];
        if (!clean) return;
        checked++;
        if (!fs.existsSync(path.join(SITE, clean))) {
            broken++;
            console.log("BROKEN  " + file + " -> " + ref);
        }
    });
});

console.log("\nlink-check: " + checked + " local refs checked, " + broken + " broken");
process.exit(broken === 0 ? 0 : 1);