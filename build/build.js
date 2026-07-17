'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  SITE_ORIGIN,
  buildRouteManifest,
  encodePath,
  escapeHtml,
  getSeoMetadata,
  renderStaticRoute,
  routeOutputPath,
  sitemapXml,
} = require('./site');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const ASSET_DIR = path.join(PUBLIC_DIR, 'assets');
const TEMPLATE_PATH = path.join(__dirname, 'template.html');
const DATA_PATH = path.join(__dirname, 'data.json');

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function buildAssetManifest(outputs) {
  const manifest = {};
  for (const [name, content] of Object.entries(outputs)) {
    const extension = path.extname(name);
    const stem = name.slice(0, -extension.length);
    manifest[name] = `/assets/${stem}.${hash(content)}${extension}`;
  }
  return manifest;
}

function posthogSnippet() {
  const key = process.env.POSTHOG_KEY || process.env.POSTHOG_PROJECT_API_KEY || '';
  const host = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';
  if (!key) return '';
  return `<script>
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister getFeatureFlag isFeatureEnabled onFeatureFlags identify reset captureException".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init(${JSON.stringify(key)}, { api_host: ${JSON.stringify(host)}, defaults: '2026-01-30', capture_pageview: false });
</script>`;
}

function analyticsHead() {
  return `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-N69Z6PCK');</script>
<!-- End Google Tag Manager -->
<script defer src="https://cloud.umami.is/script.js" data-website-id="e0206ccb-506a-4da6-9718-b81de2de26e8"></script>
${posthogSnippet()}`;
}

function renderHead(route, data, assetManifest) {
  const seo = getSeoMetadata(route, data);
  const jsonLd = JSON.stringify(seo.jsonLd).replace(/</g, '\\u003c');
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="聖經註釋">
<title>${escapeHtml(seo.title)}</title>
<meta name="description" content="${escapeHtml(seo.description)}">
<meta name="robots" content="${seo.robots}">
${seo.canonical ? `<link rel="canonical" href="${seo.canonical}">` : ''}
<meta property="og:locale" content="zh_TW">
<meta property="og:site_name" content="信望愛聖經註釋">
<meta property="og:type" content="${seo.ogType}">
<meta property="og:title" content="${escapeHtml(seo.title)}">
<meta property="og:description" content="${escapeHtml(seo.description)}">
${seo.canonical ? `<meta property="og:url" content="${seo.canonical}">` : ''}
<meta property="og:image" content="${seo.image}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(seo.title)}">
<meta name="twitter:description" content="${escapeHtml(seo.description)}">
<meta name="twitter:image" content="${seo.image}">
<script type="application/ld+json" id="route-jsonld">${jsonLd}</script>
<link rel="icon" href="/icons/favicon.ico?v=5-split" sizes="any">
<link rel="icon" href="/icons/favicon.svg?v=5-split" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/app-icon-180.png?v=5-split">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#7B2D3E">
<link rel="stylesheet" href="${assetManifest['app.css']}">
${analyticsHead()}`;
}

function renderPage(route, data, assetManifest, version) {
  return `<!DOCTYPE html>
<html lang="zh-TW"><head>
${renderHead(route, data, assetManifest)}
</head><body>
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-N69Z6PCK" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<div id="app">${renderStaticRoute(route, data)}</div>
<div id="pwa-status" class="pwa-status" role="status" aria-live="polite" hidden></div>
<script>window.__PWA_CONFIG__=${JSON.stringify({ version, serviceWorkerUrl: '/service-worker.js' })};</script>
<script defer src="${assetManifest['bible-data.js']}"></script>
<script defer src="${assetManifest['app.js']}"></script>
</body></html>\n`;
}

function serviceWorkerSource(version, assetManifest, routes) {
  const precache = [
    '/',
    '/site.webmanifest',
    assetManifest['app.css'],
    assetManifest['app.js'],
    assetManifest['bible-data.js'],
    '/icons/app-icon-180.png?v=5-split',
    '/icons/app-icon-192.png?v=5-split',
    '/icons/app-icon-512.png?v=5-split',
    '/icons/favicon.svg?v=5-split',
  ];
  return `'use strict';
const CACHE_NAME = ${JSON.stringify(`fhl-bible-${version}`)};
const PRECACHE_URLS = ${JSON.stringify(precache, null, 2)};
const VALID_PATHS = new Set(${JSON.stringify(routes.map((route) => encodePath(route.path)))});

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('fhl-bible-') && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) client.postMessage({ type: 'OFFLINE_READY', version: ${JSON.stringify(version)} });
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const isValidRoute = VALID_PATHS.has(url.pathname);
      try {
        const response = await fetch(request);
        if (response.ok || !isValidRoute) return response;
      } catch (_error) {
        // Valid offline routes fall through to the cached app shell below.
      }
      if (isValidRoute) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('/')) || Response.error();
      }
      return new Response('<!doctype html><html lang="zh-TW"><title>找不到頁面</title><h1>找不到頁面</h1><a href="/">返回首頁</a></html>', {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' },
      });
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    return fetch(request);
  })());
});
`;
}

function cleanGeneratedOutput() {
  for (const entry of ['assets', 'book', 'intro', 'read']) {
    fs.rmSync(path.join(PUBLIC_DIR, entry), { recursive: true, force: true });
  }
  for (const entry of ['about.html', 'search.html', '404.html', 'robots.txt', 'sitemap.xml', 'service-worker.js']) {
    fs.rmSync(path.join(PUBLIC_DIR, entry), { force: true });
  }
}

function main() {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const dataText = fs.readFileSync(DATA_PATH, 'utf8');
  const data = JSON.parse(dataText);
  const styleMatch = template.match(/<style>([\s\S]*?)<\/style>/);
  const appMatch = template.match(/<script>\s*(\/\* === Data injected at build time === \*\/[\s\S]*?)<\/script>\s*<\/body>/);
  if (!styleMatch || !appMatch) throw new Error('Could not extract app CSS/JS from build/template.html');
  if (!appMatch[1].includes('const DATA = __BIBLE_DATA__;')) throw new Error('App script is missing __BIBLE_DATA__');

  const appCss = `${styleMatch[1].trim()}\n`;
  const appJs = `${appMatch[1].replace('const DATA = __BIBLE_DATA__;', 'const DATA = window.__BIBLE_DATA__;').trim()}\n`;
  const dataJs = `window.__BIBLE_DATA__=${dataText.trim()};\n`;
  const outputs = { 'app.css': appCss, 'app.js': appJs, 'bible-data.js': dataJs };
  const assetManifest = buildAssetManifest(outputs);
  const versionSeed = [
    ...Object.entries(outputs).map(([name, content]) => name + hash(content)),
    fs.readFileSync(__filename, 'utf8'),
    fs.readFileSync(path.join(__dirname, 'site.js'), 'utf8'),
    fs.readFileSync(path.join(PUBLIC_DIR, 'site.webmanifest'), 'utf8'),
  ].join('|');
  const version = hash(versionSeed);
  const routes = buildRouteManifest(data);

  cleanGeneratedOutput();
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  for (const [name, content] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(PUBLIC_DIR, assetManifest[name].replace(/^\//, '')), content);
  }
  for (const route of routes) {
    const outputPath = routeOutputPath(PUBLIC_DIR, route);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, renderPage(route, data, assetManifest, version));
  }

  const notFound = { screen: 'not-found', path: '/404', indexable: false };
  const notFoundHtml = `<!DOCTYPE html><html lang="zh-TW"><head>${renderHead(notFound, data, assetManifest)}</head><body><div id="app">${renderStaticRoute(notFound, data)}</div></body></html>\n`;
  fs.writeFileSync(path.join(PUBLIC_DIR, '404.html'), notFoundHtml);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemapXml(routes, data));
  fs.writeFileSync(path.join(PUBLIC_DIR, 'service-worker.js'), serviceWorkerSource(version, assetManifest, routes));

  const size = fs.statSync(path.join(PUBLIC_DIR, assetManifest['bible-data.js'].replace(/^\//, ''))).size;
  console.log(`Built ${routes.length} routes, ${Object.keys(outputs).length} shared assets, version ${version}`);
  console.log(`Bible data asset: ${(size / 1024 / 1024).toFixed(2)} MB`);
}

if (require.main === module) main();

module.exports = { buildAssetManifest, main };
