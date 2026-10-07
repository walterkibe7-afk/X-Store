const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname);
const destDir = path.join(__dirname, 'dist');

const exclude = [
    'dist',
    'node_modules',
    '.git',
    'build.js',
    'package.json',
    'package-lock.json',
    'wrangler.toml',
    'migrations',
    'functions',
    'x-store/functions',
    '_tools',
    '_tests',
    'X-store.rar',
    '.gitignore'
];

function shouldExclude(name) {
    return exclude.some(e => name === e || name.startsWith(e + path.sep));
}

function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    const relSrc = path.relative(__dirname, src);
    
    if (shouldExclude(relSrc)) {
        return;
    }

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

console.log('Building to dist...');
try {
    // Fresh wipe when nothing holds dist open (e.g. CI). A running
    // `wrangler dev` locks the folder on Windows, so fall back to an
    // in-place overwrite which watchers tolerate.
    if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true });
    }
} catch (e) {
    console.log('dist is locked (dev server running?) - overwriting in place instead.');
}
copyRecursive(srcDir, destDir);
console.log('Build complete!');