const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'x-store');
const destDir = path.join(__dirname, 'dist');

function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        const entries = fs.readdirSync(src);
        for (const entry of entries) {
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

console.log('Building x-store to dist...');
if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true });
}
copyRecursive(srcDir, destDir);
console.log('Build complete!');