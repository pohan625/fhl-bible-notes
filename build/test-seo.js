'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  buildRouteManifest,
  getSeoMetadata,
  routeOutputPath,
} = require('./site');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8'));
const routes = buildRouteManifest(data);
const indexable = routes.filter((route) => route.indexable);

assert.strictEqual(data.books.length, 66, 'Expected all 66 Bible books');
assert.strictEqual(routes.filter((route) => route.screen === 'read').length, 1189, 'Expected all 1,189 chapters');

const canonicals = new Set();
const titles = new Set();
for (const route of routes) {
  const outputPath = routeOutputPath(PUBLIC_DIR, route);
  assert.ok(fs.existsSync(outputPath), `Missing static route: ${route.path}`);
  const html = fs.readFileSync(outputPath, 'utf8');
  const seo = getSeoMetadata(route, data);
  assert.ok(!html.includes('__BIBLE_DATA__') && !html.includes('__POSTHOG_SNIPPET__'), `Unresolved placeholder: ${route.path}`);
  assert.ok(html.includes(`<title>${seo.title}</title>`), `Wrong title: ${route.path}`);
  assert.ok(html.includes('<meta name="description" content="'), `Missing description: ${route.path}`);
  assert.ok(html.includes(`<link rel="canonical" href="${seo.canonical}">`), `Wrong canonical: ${route.path}`);
  assert.strictEqual((html.match(/<h1\b/g) || []).length, 1, `Expected one h1: ${route.path}`);
  assert.ok(html.includes('<main'), `Missing main landmark: ${route.path}`);
  assert.ok(html.includes('type="application/ld+json"'), `Missing JSON-LD: ${route.path}`);
  if (route.indexable) {
    assert.ok(!canonicals.has(seo.canonical), `Duplicate canonical: ${seo.canonical}`);
    assert.ok(!titles.has(seo.title), `Duplicate title: ${seo.title}`);
    canonicals.add(seo.canonical);
    titles.add(seo.title);
  } else {
    assert.ok(html.includes('name="robots" content="noindex,follow"'), `Expected noindex: ${route.path}`);
  }
  if (route.screen === 'read') {
    const source = (data.chapters[route.book] || {})[String(route.chapter)] || '';
    assert.ok(source.trim(), `Chapter has no source content: ${route.path}`);
    assert.ok(html.includes('class="chapter-body commentary-body"'), `Missing chapter body: ${route.path}`);
  }
}

const sitemap = fs.readFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), 'utf8');
const sitemapUrls = new Set(Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1].replace(/&amp;/g, '&')));
assert.strictEqual(sitemapUrls.size, indexable.length, 'Sitemap URL count must match indexable routes');
for (const route of indexable) assert.ok(sitemapUrls.has(getSeoMetadata(route, data).canonical), `Sitemap missing ${route.path}`);
assert.ok(!sitemap.includes('/search'), 'Search page must not be in sitemap');

const robots = fs.readFileSync(path.join(PUBLIC_DIR, 'robots.txt'), 'utf8');
assert.ok(robots.startsWith('User-agent: *\nAllow: /'), 'robots.txt must be plain crawler directives');
assert.ok(robots.includes('Sitemap: https://biblestudy.tw/sitemap.xml'), 'robots.txt must reference canonical sitemap');

const notFound = fs.readFileSync(path.join(PUBLIC_DIR, '404.html'), 'utf8');
assert.ok(notFound.includes('noindex,follow'), '404 must be noindex');
assert.ok(!notFound.includes('rel="canonical"'), '404 must not canonicalize to the home page');
assert.ok(!fs.existsSync(path.join(PUBLIC_DIR, 'offline.html')), 'PWA is the only offline mode');

const sw = fs.readFileSync(path.join(PUBLIC_DIR, 'service-worker.js'), 'utf8');
new vm.Script(sw, { filename: 'service-worker.js' });
const precacheMatch = sw.match(/const PRECACHE_URLS = (\[[\s\S]*?\]);/);
assert.ok(precacheMatch, 'Service worker precache manifest is missing');
const precache = JSON.parse(precacheMatch[1]);
for (const url of precache) {
  if (url === '/') continue;
  const pathname = new URL(url, 'https://biblestudy.tw').pathname;
  assert.ok(fs.existsSync(path.join(PUBLIC_DIR, pathname.replace(/^\//, ''))), `Precache asset missing: ${url}`);
}
assert.ok(sw.includes("request.mode === 'navigate'"), 'Service worker must provide navigation fallback');
assert.ok(sw.includes("url.origin !== self.location.origin"), 'Service worker must ignore third-party requests');
assert.ok(sw.includes('const VALID_PATHS = new Set('), 'Service worker must distinguish valid routes from real 404s');
assert.ok(sw.includes("status: 404"), 'Service worker must preserve unknown-route 404 behavior offline');

const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else files.push(fullPath);
  }
}
walk(PUBLIC_DIR);
for (const file of files) {
  assert.ok(fs.statSync(file).size <= 25 * 1024 * 1024, `Cloudflare 25 MiB limit exceeded: ${file}`);
}

const appAsset = files.find((file) => /\/assets\/app\.[a-f0-9]+\.js$/.test(file));
assert.ok(appAsset, 'Versioned app JavaScript is missing');
const appJs = fs.readFileSync(appAsset, 'utf8');
new vm.Script(appJs, { filename: path.basename(appAsset) });
assert.ok(appJs.includes('function routeLink('), 'SPA must expose crawlable route links');
assert.ok(appJs.includes('function applyRouteMetadata('), 'SPA must update route metadata');
assert.ok(appJs.includes('function registerPwa('), 'SPA must register the PWA');
const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'site.webmanifest'), 'utf8'));
assert.deepStrictEqual({ id: manifest.id, start_url: manifest.start_url, scope: manifest.scope, display: manifest.display }, {
  id: '/', start_url: '/', scope: '/', display: 'standalone',
});

console.log(`SEO/PWA verification passed: ${routes.length} routes, ${indexable.length} sitemap URLs, ${files.length} files`);
