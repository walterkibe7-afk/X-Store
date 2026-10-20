const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname);
const destDir = path.join(__dirname, 'dist');

const exclude = [
    'dist',
    'node_modules',
    '.git',
    '.kilo',
    '.wrangler',
    'x-store',
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
    '.gitignore',
    'BACKEND_HANDOFF.md',
    'AGENT_FIXES_FROM_VIDEOS.md',
    'OAUTH_SETUP.md',
    // Local video/VO production assets (only consumed by _tools scripts,
    // never referenced by any page) - ~12 MB of binaries, never ship.
    'assets/vo',
    'assets/promo'
];

function shouldExclude(name) {
    if (name === '' || name === '.') return false;
    const lower = name.toLowerCase();
    const base = name.split(/[\\/]/).pop() || name;
    // Junk / debug artefacts that must never ship to dist
    if (/\.bin$/i.test(base)) return true;
    if (/^_/.test(base)) return true;
    if (/^test_.*\.json$/i.test(base)) return true;
    if (/^headers_.*\.txt$/i.test(base)) return true;
    if (/^body_.*\.bin$/i.test(base)) return true;
    if (/\.log$/i.test(base)) return true;
    if (/^x-store\.rar$/i.test(base)) return true;
    // Full-size source hero (2.7MB) is never referenced; only resized
    // hero-bg-800/1200/1920 + hero-slot-400 ship to dist.
    if (/^hero-bg\.jpg$/i.test(base)) return true;
    return exclude.some(e => {
        const el = e.toLowerCase().replace(/\//g, path.sep);
        return lower === el || lower.startsWith(el + path.sep.toLowerCase());
    });
}

function minifyJS(code) {
    // esbuild minifies safely (regex would break https:// and literals).
    // Falls back to verbatim if esbuild is unavailable (CI without devDeps).
    try {
        const esbuild = require('esbuild');
        return esbuild.transformSync(code, { minify: true, target: 'es2019' }).code;
    } catch (e) {
        return code;
    }
}

function minifyCSS(code) {
    return code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s*([{};:])\s*/g, '$1')
        .trim();
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
        if (src.endsWith('.js')) {
            const code = fs.readFileSync(src, 'utf8');
            fs.writeFileSync(dest, minifyJS(code));
        } else if (src.endsWith('.css')) {
            const code = fs.readFileSync(src, 'utf8');
            fs.writeFileSync(dest, minifyCSS(code));
        } else {
            fs.copyFileSync(src, dest);
        }
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