'use strict';

const path = require('path');

const SITE_ORIGIN = (process.env.SITE_ORIGIN || 'https://biblestudy.tw').replace(/\/$/, '');
const SITE_NAME = '信望愛聖經註釋';
const DEFAULT_DESCRIPTION = '免費查閱新舊約 66 卷、1,189 章信望愛聖經註釋，包含書卷背景、作者序、逐章釋經、原文編號與經文交叉參照。';

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function encodePath(pathname) {
  if (pathname === '/') return '/';
  return pathname.split('/').map((part, index) => index === 0 ? '' : encodeURIComponent(part)).join('/');
}

function absoluteUrl(pathname) {
  return SITE_ORIGIN + encodePath(pathname);
}

function routeOutputPath(publicDir, route) {
  if (route.path === '/') return path.join(publicDir, 'index.html');
  const parts = route.path.replace(/^\//, '').split('/');
  const filename = parts.pop() + '.html';
  return path.join(publicDir, ...parts, filename);
}

function cleanText(value) {
  return String(value || '')
    .replace(/#([^|\n]+)\|/g, '$1')
    .replace(/SN[GH]\d{5}/g, '')
    .replace(/^[\s\u3000]*[壹貳參肆伍陸柒捌玖拾一二三四五六七八九十百千甲乙丙丁]+[、．.]\s*/gm, '')
    .replace(/^[\s\u3000]*[●◎○☆★（(][^\n）)]*[）)]?\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function excerpt(value, min = 80, max = 120) {
  const text = cleanText(value);
  if (!text) return DEFAULT_DESCRIPTION;
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const sentenceEnd = Math.max(slice.lastIndexOf('。'), slice.lastIndexOf('！'), slice.lastIndexOf('？'));
  return (sentenceEnd >= min ? slice.slice(0, sentenceEnd + 1) : slice.replace(/[，、；：\s]+$/, '') + '…');
}

function buildRouteManifest(data) {
  const routes = [
    { screen: 'home', path: '/', indexable: true },
    { screen: 'about', path: '/about', indexable: true },
    { screen: 'search', path: '/search', indexable: false },
  ];

  for (const book of data.books) {
    routes.push({ screen: 'book', path: `/book/${book.name}`, book: book.name, indexable: true });
    if ((data.authorPrefaces[book.name] || '').trim()) {
      routes.push({ screen: 'intro', path: `/intro/${book.name}/author`, book: book.name, view: 'author', indexable: true });
    }
    if ((data.intros[book.name] || []).some((section) => (section.body || section.title || '').trim())) {
      routes.push({ screen: 'intro', path: `/intro/${book.name}/background`, book: book.name, view: 'background', indexable: true });
    }
    for (let chapter = 1; chapter <= book.chapterCount; chapter++) {
      routes.push({ screen: 'read', path: `/read/${book.name}/${chapter}`, book: book.name, chapter, indexable: true });
    }
  }
  return routes;
}

function getRouteSource(route, data) {
  if (route.screen === 'read') return (data.chapters[route.book] || {})[String(route.chapter)] || '';
  if (route.screen === 'intro' && route.view === 'author') return data.authorPrefaces[route.book] || '';
  if (route.screen === 'intro') return (data.intros[route.book] || []).map((section) => `${section.title || ''} ${section.body || ''}`).join('\n');
  return '';
}

function breadcrumbsFor(route) {
  const items = [{ name: '首頁', path: '/' }];
  if (route.book) items.push({ name: route.book, path: `/book/${route.book}` });
  if (route.screen === 'intro') items.push({ name: route.view === 'author' ? '作者序' : '背景資料', path: route.path });
  if (route.screen === 'read') items.push({ name: `第 ${route.chapter} 章`, path: route.path });
  if (route.screen === 'about') items.push({ name: '關於', path: route.path });
  return items;
}

function getSeoMetadata(route, data) {
  let title = `信望愛聖經註釋｜66卷逐章查經資料`;
  let description = DEFAULT_DESCRIPTION;
  let robots = route.indexable === false ? 'noindex,follow' : 'index,follow,max-image-preview:large';

  if (route.screen === 'about') {
    title = `關於本站｜${SITE_NAME}`;
    description = '了解信望愛聖經註釋的資料來源、開發者、開源專案與 iPhone PWA 離線使用方式。';
  } else if (route.screen === 'search') {
    title = `全文搜尋｜${SITE_NAME}`;
    description = '搜尋全部 66 卷、1,189 章聖經註釋內容。';
  } else if (route.screen === 'book') {
    const book = data.books.find((item) => item.name === route.book);
    title = `${route.book}註釋｜逐章查經與背景資料｜${SITE_NAME}`;
    description = `${route.book}完整聖經註釋，共 ${book ? book.chapterCount : ''} 章，包含書卷背景、作者序與逐章釋經資料。`;
  } else if (route.screen === 'intro') {
    const label = route.view === 'author' ? '作者序' : '背景資料';
    title = `${route.book}${label}｜${SITE_NAME}`;
    description = excerpt(getRouteSource(route, data));
  } else if (route.screen === 'read') {
    title = `${route.book}第${route.chapter}章註釋｜${SITE_NAME}`;
    description = excerpt(getRouteSource(route, data));
  } else if (route.screen === 'not-found') {
    title = `找不到頁面｜${SITE_NAME}`;
    description = '此頁面不存在，請返回信望愛聖經註釋首頁。';
    robots = 'noindex,follow';
  }

  const canonical = route.screen === 'not-found' ? null : absoluteUrl(route.path);
  const breadcrumbs = breadcrumbsFor(route);
  const graph = [];
  if (route.screen === 'home') {
    graph.push({
      '@type': 'WebSite',
      '@id': `${SITE_ORIGIN}/#website`,
      url: `${SITE_ORIGIN}/`,
      name: SITE_NAME,
      description,
      inLanguage: 'zh-TW',
    });
  } else if (route.indexable !== false && route.screen !== 'not-found') {
    graph.push({
      '@type': 'WebPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: title,
      description,
      inLanguage: 'zh-TW',
      isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
    });
    if (breadcrumbs.length > 1) {
      graph.push({
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbs.map((item, index) => ({
          '@type': 'ListItem', position: index + 1, name: item.name, item: absoluteUrl(item.path),
        })),
      });
    }
  }

  return {
    title,
    description,
    robots,
    canonical,
    ogType: route.screen === 'home' ? 'website' : 'article',
    image: `${SITE_ORIGIN}/icons/app-icon-512.png?v=5-split`,
    jsonLd: { '@context': 'https://schema.org', '@graph': graph },
  };
}

function renderInlineHtml(value) {
  const text = String(value || '');
  let output = '';
  let index = 0;
  const regex = /#([^|\n]+)\||SN[GH]\d{5}/g;
  let match;
  while ((match = regex.exec(text))) {
    output += escapeHtml(text.slice(index, match.index));
    output += match[0][0] === '#'
      ? `<span class="xref">${escapeHtml(match[1])}</span>`
      : `<span class="strong">${escapeHtml(match[0])}</span>`;
    index = match.index + match[0].length;
  }
  return output + escapeHtml(text.slice(index));
}

function classifyCommentary(raw) {
  const text = raw.replace(/^[\s\u3000]+/, '');
  if (!text) return null;
  if (/^[壹貳參肆伍陸柒捌玖拾]、/.test(text)) return { level: 2, kind: 'h1', text };
  if (/^[一二三四五六七八九十百千]+、/.test(text)) return { level: 3, kind: 'h2', text };
  if (/^[（(][一二三四五六七八九十百千甲乙丙丁]+[）)]/.test(text)) return { level: 4, kind: 'h3', text };
  if (/^\d+\.[^\d:]/.test(text) || /^[甲乙丙丁戊己庚辛壬癸]、/.test(text)) return { level: 5, kind: 'h4', text };
  if (/^\(\s*\d+\s*\)/.test(text) || /^[A-Za-z]\./.test(text)) return { level: 6, kind: 'h5', text };
  if (/^●/.test(text)) return { kind: 'bullet', text };
  if (/^◎/.test(text)) return { kind: 'thought', text };
  if (/^○/.test(text)) return { kind: 'ref', text };
  if (/^[☆★]/.test(text)) return { kind: 'note', text };
  return { kind: 'body', text };
}

function renderCommentaryHtml(value) {
  const output = [];
  let spacer = false;
  for (const raw of String(value || '').split('\n')) {
    const item = classifyCommentary(raw);
    if (!item) {
      if (!spacer) output.push('<div class="body-spacer" aria-hidden="true"></div>');
      spacer = true;
      continue;
    }
    spacer = false;
    const content = renderInlineHtml(item.text);
    output.push(item.level
      ? `<h${item.level} class="ln ln-${item.kind}">${content}</h${item.level}>`
      : `<p class="ln ln-${item.kind}">${content}</p>`);
  }
  while (output[output.length - 1] && output[output.length - 1].includes('body-spacer')) output.pop();
  return output.join('\n');
}

function renderBreadcrumbs(route) {
  const items = breadcrumbsFor(route);
  if (items.length < 2) return '';
  return `<nav class="seo-breadcrumbs" aria-label="麵包屑">${items.map((item, index) => {
    const label = escapeHtml(item.name);
    return index === items.length - 1
      ? `<span aria-current="page">${label}</span>`
      : `<a href="${encodePath(item.path)}">${label}</a>`;
  }).join('<span aria-hidden="true">›</span>')}</nav>`;
}

function renderStaticRoute(route, data) {
  if (route.screen === 'home') {
    const testament = (value, label) => `<section class="seo-book-section"><h2>${label}</h2><ul>${data.books
      .filter((book) => book.testament === value)
      .map((book) => `<li><a href="${encodePath(`/book/${book.name}`)}">${escapeHtml(book.name)}</a></li>`).join('')}</ul></section>`;
    return `<main class="screen static-shell"><header class="header"><h1 class="h1">${SITE_NAME}</h1><p>${DEFAULT_DESCRIPTION}</p></header><div class="scroller">${testament('OT', '舊約聖經')}${testament('NT', '新約聖經')}</div></main>`;
  }

  if (route.screen === 'book') {
    const meta = data.books.find((book) => book.name === route.book);
    const links = [];
    if ((data.authorPrefaces[route.book] || '').trim()) links.push(`<a class="intro-card" href="${encodePath(`/intro/${route.book}/author`)}">註釋作者前言</a>`);
    if ((data.intros[route.book] || []).length) links.push(`<a class="intro-card" href="${encodePath(`/intro/${route.book}/background`)}">查經背景資料</a>`);
    const chapters = Array.from({ length: meta.chapterCount }, (_, index) => index + 1)
      .map((chapter) => `<a class="chapter-card" href="${encodePath(`/read/${route.book}/${chapter}`)}">${chapter}</a>`).join('');
    return `<main class="screen static-shell">${renderBreadcrumbs(route)}<header class="header"><h1 class="h1 lg">${escapeHtml(route.book)}</h1><p>共 ${meta.chapterCount} 章</p></header><div class="scroller"><div class="intro-cards">${links.join('')}</div><nav class="chapter-grid" aria-label="章節">${chapters}</nav></div></main>`;
  }

  if (route.screen === 'intro') {
    const author = route.view === 'author';
    let content = '';
    if (author) {
      content = String(data.authorPrefaces[route.book] || '').split(/\n{2,}/).filter(Boolean).map((paragraph) => `<p>${renderInlineHtml(paragraph)}</p>`).join('');
    } else {
      content = (data.intros[route.book] || []).map((section) => `<section class="intro-section"><h2>${escapeHtml(section.title || '背景資料')}</h2>${String(section.body || '').split('\n').filter((line) => line.trim()).map((line) => `<p>${renderInlineHtml(line.trim())}</p>`).join('')}</section>`).join('');
    }
    const label = author ? '作者序' : `${route.book}簡介`;
    return `<main class="screen static-shell">${renderBreadcrumbs(route)}<article class="scroller seo-article"><h1 class="h1 md">${escapeHtml(label)}</h1>${content}</article></main>`;
  }

  if (route.screen === 'read') {
    const text = (data.chapters[route.book] || {})[String(route.chapter)] || '';
    return `<main class="screen static-shell">${renderBreadcrumbs(route)}<article class="scroller seo-article"><h1 class="h1 md">${escapeHtml(route.book)} 第 ${route.chapter} 章</h1><div class="chapter-body commentary-body">${renderCommentaryHtml(text)}</div></article></main>`;
  }

  if (route.screen === 'about') {
    return `<main class="screen static-shell">${renderBreadcrumbs(route)}<article class="scroller seo-article"><h1 class="h1">關於</h1><section><h2>資料來源</h2><p>本網站的聖經專卷註釋內容來自<a href="https://bible.fhl.net/index.html">信望愛信仰與聖經資源中心</a>。</p></section><section><h2>加入 iPhone 主畫面</h2><p>使用 Safari 開啟本站，點選分享、加入主畫面，並開啟「作為 Web App 打開」。首次完成離線資料下載後，即可在沒有網路時閱讀與搜尋。</p></section></article></main>`;
  }

  if (route.screen === 'search') {
    return `<main class="screen static-shell"><header class="header"><h1 class="h1">全文搜尋</h1></header><div class="scroller"><p>啟用 JavaScript 後即可搜尋全部章節註釋。</p><p><a href="/">返回首頁</a></p></div></main>`;
  }

  return `<main class="screen static-shell"><article class="scroller seo-article"><h1 class="h1">找不到頁面</h1><p>此頁面不存在。</p><p><a href="/">返回首頁</a></p></article></main>`;
}

function sitemapXml(routes, data) {
  const lastmod = data.sourceUpdatedAt ? new Date(data.sourceUpdatedAt).toISOString().slice(0, 10) : null;
  const urls = routes.filter((route) => route.indexable).map((route) => [
    '  <url>',
    `    <loc>${escapeHtml(absoluteUrl(route.path))}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : '',
    '  </url>',
  ].filter(Boolean).join('\n'));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

module.exports = {
  SITE_ORIGIN,
  SITE_NAME,
  DEFAULT_DESCRIPTION,
  absoluteUrl,
  buildRouteManifest,
  encodePath,
  escapeHtml,
  getSeoMetadata,
  renderStaticRoute,
  routeOutputPath,
  sitemapXml,
};
