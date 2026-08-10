/* === Data injected at build time === */
const DATA = window.__BIBLE_DATA__;

/* === Book groupings (matching the design's categories) === */
const OT_BOOKS = [
  '創世記', '出埃及記', '利未記', '民數記', '申命記',
  '約書亞記', '士師記', '路得記', '撒母耳記上', '撒母耳記下',
  '列王紀上', '列王紀下', '歷代志上', '歷代志下', '以斯拉記',
  '尼希米記', '以斯帖記', '約伯記', '詩篇', '箴言',
  '傳道書', '雅歌', '以賽亞書', '耶利米書', '耶利米哀歌',
  '以西結書', '但以理書', '何西阿書', '約珥書', '阿摩司書',
  '俄巴底亞書', '約拿書', '彌迦書', '那鴻書', '哈巴谷書',
  '西番雅書', '哈該書', '撒迦利亞書', '瑪拉基書'
];
const NT_BOOKS = [
  '馬太福音', '馬可福音', '路加福音', '約翰福音', '使徒行傳',
  '羅馬書', '哥林多前書', '哥林多後書', '加拉太書', '以弗所書',
  '腓立比書', '歌羅西書', '帖撒羅尼迦前書', '帖撒羅尼迦後書', '提摩太前書',
  '提摩太後書', '提多書', '腓利門書', '希伯來書', '雅各書',
  '彼得前書', '彼得後書', '約翰一書', '約翰二書', '約翰三書',
  '猶大書', '啟示錄'
];

const OT_CATEGORIES = [
  { label: '摩西五經', books: ['創世記', '出埃及記', '利未記', '民數記', '申命記'] },
  { label: '歷史書', books: ['約書亞記', '士師記', '路得記', '撒母耳記上', '撒母耳記下', '列王紀上', '列王紀下', '歷代志上', '歷代志下', '以斯拉記', '尼希米記', '以斯帖記'] },
  { label: '詩歌書', books: ['約伯記', '詩篇', '箴言', '傳道書', '雅歌'] },
  { label: '大先知書', books: ['以賽亞書', '耶利米書', '耶利米哀歌', '以西結書', '但以理書'] },
  { label: '小先知書', books: ['何西阿書', '約珥書', '阿摩司書', '俄巴底亞書', '約拿書', '彌迦書', '那鴻書', '哈巴谷書', '西番雅書', '哈該書', '撒迦利亞書', '瑪拉基書'] }
];
const NT_CATEGORIES = [
  { label: '福音書', books: ['馬太福音', '馬可福音', '路加福音', '約翰福音'] },
  { label: '使徒行傳', books: ['使徒行傳'] },
  { label: '保羅書信', books: ['羅馬書', '哥林多前書', '哥林多後書', '加拉太書', '以弗所書', '腓立比書', '歌羅西書', '帖撒羅尼迦前書', '帖撒羅尼迦後書', '提摩太前書', '提摩太後書', '提多書', '腓利門書'] },
  { label: '普通書信', books: ['希伯來書', '雅各書', '彼得前書', '彼得後書', '約翰一書', '約翰二書', '約翰三書', '猶大書'] },
  { label: '啟示錄', books: ['啟示錄'] }
];

const BOOK_INDEX = {};
for (const b of DATA.books) BOOK_INDEX[b.name] = b;

const LAST_UPDATED_DATE = '2026/8/9';

/* === Full-text search ===
 * Plain `String.indexOf` scan over every chapter's commentary text. The whole
 * corpus is ~10 MB of CJK text in memory; a linear pass takes ~50–150 ms on a
 * modern phone, which is fine behind a 160 ms input debounce. Returns up to
 * `limit` hits, each with an HTML snippet around the first match (with the
 * query highlighted via <mark>). HTML-escapes the snippet so source text
 * cannot inject markup.
 */
const SNIPPET_RADIUS = 28;
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
function makeSnippet(text, idx, qLen) {
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(text.length, idx + qLen + SNIPPET_RADIUS);
  const before = (start > 0 ? '…' : '') + text.slice(start, idx);
  const hit = text.slice(idx, idx + qLen);
  const after = text.slice(idx + qLen, end) + (end < text.length ? '…' : '');
  // Collapse newlines/whitespace so the snippet reads as a single line.
  const norm = (s) => s.replace(/\s+/g, ' ');
  return escapeHtml(norm(before)) +
    '<mark>' + escapeHtml(norm(hit)) + '</mark>' +
    escapeHtml(norm(after));
}
function searchFullText(query, limit) {
  const q = query.trim();
  if (!q) return [];
  const qLen = q.length;
  const hits = [];
  // Walk in canonical book order so results group naturally.
  const order = [...OT_BOOKS, ...NT_BOOKS];
  for (const book of order) {
    const chs = DATA.chapters[book];
    if (!chs) continue;
    const meta = BOOK_INDEX[book];
    const total = (meta && meta.chapterCount) || Object.keys(chs).length;
    for (let i = 1; i <= total; i++) {
      const text = chs[String(i)];
      if (!text) continue;
      const idx = text.indexOf(q);
      if (idx < 0) continue;
      hits.push({ book, chapter: i, snippet: makeSnippet(text, idx, qLen) });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}

/* === Routing via History API ===
 * Old hash links (e.g. /#book/創世記) are migrated to /book/創世記 on load so
 * shared/bookmarked URLs keep working. Requires SPA fallback on the host
 * (Cloudflare Pages: public/_redirects).
 */
if (location.hash && location.hash.length > 1) {
  const legacy = location.hash.slice(1);
  history.replaceState({}, '', '/' + legacy + location.search);
}
function readRoute() {
  const path = location.pathname.replace(/^\/+|\/+$/g, '');
  if (!path) return { screen: 'home' };
  const parts = path.split('/').map(decodeURIComponent);
  if (parts[0] === 'search') return { screen: 'search' };
  if (parts[0] === 'about') return { screen: 'about' };
  if (parts[0] === 'book' && parts[1]) return { screen: 'book', book: parts[1] };
  if (parts[0] === 'intro' && parts[1]) return { screen: 'intro', book: parts[1], view: parts[2] || 'background' };
  if (parts[0] === 'read' && parts[1] && parts[2]) return { screen: 'read', book: parts[1], chapter: parseInt(parts[2], 10) };
  return { screen: 'home' };
}
function buildPath(route) {
  if (route.screen === 'search') return '/search';
  if (route.screen === 'about') return '/about';
  if (route.screen === 'book') return '/book/' + encodeURIComponent(route.book);
  if (route.screen === 'intro') return '/intro/' + encodeURIComponent(route.book) + '/' + (route.view || 'background');
  if (route.screen === 'read') return '/read/' + encodeURIComponent(route.book) + '/' + route.chapter;
  return '/';
}
const SITE_ORIGIN = 'https://biblestudy.tw';
const SITE_NAME = '信望愛聖經註釋';
const DEFAULT_DESCRIPTION = '免費查閱新舊約 66 卷、1,189 章信望愛聖經註釋，包含書卷背景、作者序、逐章釋經、原文編號與經文交叉參照。';
function seoExcerpt(value) {
  const text = String(value || '')
    .replace(/#([^|\n]+)\|/g, '$1')
    .replace(/SN[GH]\d{5}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return DEFAULT_DESCRIPTION;
  return text.length <= 120 ? text : text.slice(0, 120).replace(/[，、；：\s]+$/, '') + '…';
}
function clientSeo(route) {
  let title = '信望愛聖經註釋｜66卷逐章查經資料';
  let description = DEFAULT_DESCRIPTION;
  let robots = route.screen === 'search' ? 'noindex,follow' : 'index,follow,max-image-preview:large';
  if (route.screen === 'about') {
    title = '關於本站｜' + SITE_NAME;
    description = '了解信望愛聖經註釋的資料來源、開發者、開源專案與 iPhone PWA 離線使用方式。';
  } else if (route.screen === 'search') {
    title = '全文搜尋｜' + SITE_NAME;
    description = '搜尋全部 66 卷、1,189 章聖經註釋內容。';
  } else if (route.screen === 'book') {
    const meta = BOOK_INDEX[route.book];
    title = route.book + '註釋｜逐章查經與背景資料｜' + SITE_NAME;
    description = route.book + '完整聖經註釋，共 ' + (meta ? meta.chapterCount : '') + ' 章，包含書卷背景、作者序與逐章釋經資料。';
  } else if (route.screen === 'intro') {
    const author = route.view === 'author';
    title = route.book + (author ? '作者序' : '背景資料') + '｜' + SITE_NAME;
    description = seoExcerpt(author
      ? DATA.authorPrefaces[route.book]
      : (DATA.intros[route.book] || []).map((section) => (section.title || '') + ' ' + (section.body || '')).join('\n'));
  } else if (route.screen === 'read') {
    title = route.book + '第' + route.chapter + '章註釋｜' + SITE_NAME;
    description = seoExcerpt((DATA.chapters[route.book] || {})[String(route.chapter)]);
  }
  const pathname = buildPath(route);
  const canonical = new URL(pathname, SITE_ORIGIN).href;
  const crumbs = [{ name: '首頁', path: '/' }];
  if (route.book) crumbs.push({ name: route.book, path: '/book/' + encodeURIComponent(route.book) });
  if (route.screen === 'intro') crumbs.push({ name: route.view === 'author' ? '作者序' : '背景資料', path: pathname });
  if (route.screen === 'read') crumbs.push({ name: '第 ' + route.chapter + ' 章', path: pathname });
  if (route.screen === 'about') crumbs.push({ name: '關於', path: pathname });
  const graph = [];
  if (route.screen === 'home') {
    graph.push({ '@type': 'WebSite', '@id': SITE_ORIGIN + '/#website', url: SITE_ORIGIN + '/', name: SITE_NAME, description, inLanguage: 'zh-TW' });
  } else if (route.screen !== 'search') {
    graph.push({ '@type': 'WebPage', '@id': canonical + '#webpage', url: canonical, name: title, description, inLanguage: 'zh-TW', isPartOf: { '@id': SITE_ORIGIN + '/#website' } });
    if (crumbs.length > 1) graph.push({ '@type': 'BreadcrumbList', itemListElement: crumbs.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: new URL(item.path, SITE_ORIGIN).href })) });
  }
  return { title, description, robots, canonical, graph };
}
function setMeta(selector, attribute, value) {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement(selector.startsWith('link') ? 'link' : 'meta');
    const nameMatch = selector.match(/\[name="([^"]+)"\]/);
    const propertyMatch = selector.match(/\[property="([^"]+)"\]/);
    const relMatch = selector.match(/\[rel="([^"]+)"\]/);
    if (nameMatch) node.setAttribute('name', nameMatch[1]);
    if (propertyMatch) node.setAttribute('property', propertyMatch[1]);
    if (relMatch) node.setAttribute('rel', relMatch[1]);
    document.head.appendChild(node);
  }
  node.setAttribute(attribute, value);
}
function applyRouteMetadata(route) {
  const seo = clientSeo(route);
  document.title = seo.title;
  setMeta('meta[name="description"]', 'content', seo.description);
  setMeta('meta[name="robots"]', 'content', seo.robots);
  setMeta('link[rel="canonical"]', 'href', seo.canonical);
  setMeta('meta[property="og:title"]', 'content', seo.title);
  setMeta('meta[property="og:description"]', 'content', seo.description);
  setMeta('meta[property="og:url"]', 'content', seo.canonical);
  setMeta('meta[property="og:type"]', 'content', route.screen === 'home' ? 'website' : 'article');
  setMeta('meta[name="twitter:title"]', 'content', seo.title);
  setMeta('meta[name="twitter:description"]', 'content', seo.description);
  let jsonLd = document.getElementById('route-jsonld');
  if (!jsonLd) {
    jsonLd = document.createElement('script');
    jsonLd.id = 'route-jsonld';
    jsonLd.type = 'application/ld+json';
    document.head.appendChild(jsonLd);
  }
  jsonLd.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': seo.graph });
}
function trackPageview() {
  if (window.dataLayer) {
    window.dataLayer.push({ event: 'spa_pageview', page_path: location.pathname, page_title: document.title });
  }
  captureEvent('$pageview', routeTrackingProperties(readRoute()));
}
function go(route) {
  const path = buildPath(route);
  if (location.pathname !== path) {
    history.pushState({}, '', path);
    render();
    trackPageview();
  }
}

/* === State === */
const state = {
  homeTab: localStorage.getItem('home-tab') || 'nt',
  homeSearch: '',
  homeScroll: 0,
  fullSearchQuery: '',
  fullSearchScroll: 0,
  lastSearchTracked: '',
  fontSize: parseInt(localStorage.getItem('reading-font') || '17', 10),
  showFontControls: false,
};

function captureEvent(name, properties) {
  try {
    if (window.posthog && typeof window.posthog.capture === 'function') {
      window.posthog.capture(name, properties || {});
    }
  } catch (_err) {
    // Analytics must never interrupt reading.
  }
}

function routeTrackingProperties(route) {
  const props = {
    path: location.pathname,
    screen: route.screen,
  };
  if (route.book) {
    const meta = BOOK_INDEX[route.book];
    props.book = route.book;
    if (meta) props.testament = meta.testament;
  }
  if (route.chapter) props.chapter = route.chapter;
  if (route.view) props.view = route.view;
  return props;
}

function bookTrackingProperties(book, extra) {
  const meta = BOOK_INDEX[book];
  return Object.assign({
    book,
    testament: meta ? meta.testament : undefined,
    chapter_count: meta ? meta.chapterCount : undefined,
  }, extra || {});
}

/* === Text transforms ===
 * `nb()` keeps scripture references (CJK book abbreviation + space + verse range)
 * as a single unbreakable unit by swapping the space for U+00A0 NBSP. Without
 * this, mobile browsers happily break "撒下 7:11-16" at the space, splitting
 * the reference across two lines.
 */
const nb = (text) => {
  if (!text) return '';
  // Scripture-reference glue. Match a 1–3 char CJK book abbreviation followed
  // by whitespace + a digit-style reference (e.g. "1", "1:1", "1:1-2", "1:1-2:3",
  // "1:1,5", "1:1~3"). The space between abbreviation and number is replaced with
  // U+00A0 NBSP and any internal whitespace inside the range is collapsed away,
  // so the whole reference cannot break across two lines on a narrow screen.
  return text.replace(
    /([\u3400-\u9fff]{1,3})([ \t\u3000]+)(\d{1,3}(?::\d{1,3})?(?:\s*[\-,\uFF0C\u2013~\uFF5E]\s*\d{1,3}(?::\d{1,3})?)*)/g,
    (_m, abbr, _ws, ref) => abbr + ' ' + ref.replace(/\s+/g, '')
  );
};

/* === Inline markup tokenizer ===
 * The raw API text from bible.fhl.net/api/sc.php embeds two kinds of markup
 * inline with the body text:
 *
 *   #太 19:23-24;可 10:24-25|   →  scripture cross-reference (between # and |)
 *   SNG05207 / SNH03091          →  Greek/Hebrew Strong number (literal token)
 *
 * Render them as styled <span>s rather than stripping the markers. This keeps
 * the option to make them tappable (jump to passage / open dictionary) later
 * without re-fetching: the original tokens survive in `data.json`.
 *
 * Returns a flat array of strings + DOM nodes that el() will append in order.
 * Plain text segments still go through nb() so multi-character book
 * abbreviations + verse ranges stay un-breakable on narrow screens.
 */
const INLINE_MARKUP_RE = /#([^|\n]+)\||SN[GH]\d{5}/g;
const renderInline = (text) => {
  if (!text) return [];
  const out = [];
  let lastIndex = 0;
  let m;
  INLINE_MARKUP_RE.lastIndex = 0;
  while ((m = INLINE_MARKUP_RE.exec(text)) !== null) {
    if (m.index > lastIndex) {
      out.push(nb(text.slice(lastIndex, m.index)));
    }
    if (m[0].charCodeAt(0) === 35 /* '#' */) {
      // Cross-reference; m[1] is the captured ref content (no # or |).
      out.push(el('span', { class: 'xref' }, nb(m[1])));
    } else {
      // Strong number — emit verbatim, distinct font.
      out.push(el('span', { class: 'strong' }, m[0]));
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    out.push(nb(text.slice(lastIndex)));
  }
  return out;
};

/* === Commentary body renderer ===
 * The source text uses fixed-width whitespace indentation (typically 2 spaces
 * per nesting level) which works on a desktop monitor but eats too much screen
 * width on a phone. Instead of rendering literal indentation, we:
 *   1. Compute the chapter's minimum leading-whitespace count so the chapter
 *      starts at depth 0 regardless of where it sits in the source's section
 *      hierarchy (e.g. Matthew 2 starts at "  三、" — that 2-space prefix is
 *      considered the chapter's baseline and stripped).
 *   2. For each non-blank line, derive a depth = floor((lead - min) / 2),
 *      capped at 6, and render as a <div.body-line> with proportional
 *      padding-left in `em`s (so the indent scales with the user's font-size).
 *   3. Blank source lines become <div.body-spacer> for visual separation.
 *   4. Pass each line's content through nb() to keep scripture references on
 *      one line.
 */
const DEPTH_EM = 0.7; // padding-left per nesting level, in em
const renderCommentaryLines = (text) => {
  if (!text) return [];
  // Classify each line by its leading marker so we can render with semantic
  // typography (heading sizes, accent colors, muted refs) instead of literal
  // whitespace indentation. This produces a much cleaner reading layout on
  // narrow phone screens.
  const classify = (raw) => {
    const t = raw.replace(/^[\s\u3000]+/, '');
    if (!t) return null;
    if (/^[\u58F9\u8CB3\u53C3\u8086\u4F0D\u9678\u67D2\u634C\u7396\u62FE]\u3001/.test(t)) return { kind: 'h1', text: t };
    if (/^[\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D\u5341\u767E\u5343]+\u3001/.test(t)) return { kind: 'h2', text: t };
    if (/^[\uFF08(][\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D\u5341\u767E\u5343\u7532\u4E59\u4E19\u4E01]+[\uFF09)]/.test(t)) return { kind: 'h3', text: t };
    if (/^\d+\.[^\d:]/.test(t)) return { kind: 'h4', text: t };
    if (/^[\u7532\u4E59\u4E19\u4E01\u620A\u5DF1\u5E9A\u8F9B\u58EC\u7678]\u3001/.test(t)) return { kind: 'h4', text: t };
    if (/^\(\s*\d+\s*\)/.test(t)) return { kind: 'h5', text: t };
    if (/^[A-Za-z]\./.test(t)) return { kind: 'h5', text: t };
    if (/^\u25CF/.test(t)) return { kind: 'bullet', text: t };
    if (/^\u25CE/.test(t)) return { kind: 'thought', text: t };
    if (/^\u25CB/.test(t)) return { kind: 'ref', text: t };
    if (/^[\u2606\u2605]/.test(t)) return { kind: 'note', text: t };
    return { kind: 'body', text: t };
  };
  const out = [];
  let prev = null;
  for (const raw of text.split('\n')) {
    const cls = classify(raw);
    if (!cls) {
      // Blank line — light spacer; collapse runs of blanks.
      if (prev !== 'spacer') out.push(el('div', { class: 'body-spacer' }));
      prev = 'spacer';
      continue;
    }
    const headingLevels = { h1: 2, h2: 3, h3: 4, h4: 5, h5: 6 };
    const tag = headingLevels[cls.kind] ? 'h' + headingLevels[cls.kind] : 'p';
    out.push(el(tag, { class: 'ln ln-' + cls.kind }, renderInline(cls.text)));
    prev = cls.kind;
  }
  // Trim trailing spacer if any.
  while (out.length && out[out.length - 1].className === 'body-spacer') out.pop();
  return out;
};

/* === Intro-section body renderer ===
 * The intro page already conveys top-level structure via burgundy "tag"
 * headers (零、背景 / 一、作者 / …). Inside each section, content is just
 * an enumerated list of points — `（一）/（二）/1./2.` are numbering, NOT
 * sub-headings. So we render every line as a regular body paragraph with
 * leading whitespace stripped (so it reads cleanly on mobile) and a small
 * gap between items. No bold/heading typography here, by design — that's
 * what makes this distinct from the chapter renderer.
 */
const renderIntroLines = (text) => {
  if (!text) return [];
  const out = [];
  let prevBlank = true;
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') {
      if (!prevBlank) out.push(el('div', { class: 'body-spacer' }));
      prevBlank = true;
      continue;
    }
    const stripped = raw.replace(/^[\s　]+/, '');
    out.push(el('div', { class: 'intro-line' }, renderInline(stripped)));
    prevBlank = false;
  }
  while (out.length && out[out.length - 1].className === 'body-spacer') out.pop();
  return out;
};

/* === Font-size toolbar (shared by Reading / Intro / Preface screens) ===
 * `bodies` is an array of elements whose font-size we want to control. Returns
 * { toggleBtn, controlsBar } so callers can mount them however the layout
 * needs. The toolbar reflects and updates the global `state.fontSize`, so the
 * size stays consistent when navigating between chapter and intro/preface.
 */
function buildFontToolbar(bodies) {
  let visible = !!state.showFontControls;
  const controls = el('div', {
    class: 'font-controls',
    style: { display: visible ? 'flex' : 'none' },
  });
  const valSpan = el('span', { style: { color: 'var(--text)' } }, String(state.fontSize));
  const apply = (v) => {
    v = Math.max(14, Math.min(24, v));
    const changed = v !== state.fontSize;
    state.fontSize = v;
    localStorage.setItem('reading-font', String(v));
    valSpan.textContent = String(v);
    for (const b of bodies) if (b) b.style.fontSize = v + 'px';
    if (changed) captureEvent('reading_font_size_changed', { font_size: v });
  };
  const minus = el('button', { onclick: () => apply(state.fontSize - 1) }, '-');
  const plus = el('button', { onclick: () => apply(state.fontSize + 1) }, '+');
  const stepper = el('div', { class: 'stepper' }, minus, valSpan, plus);
  controls.appendChild(el('span', null, '字體大小'));
  controls.appendChild(stepper);

  const toggleBtn = el('button', {
    class: 'icon-btn font-toggle-btn',
    onclick: () => {
      visible = !visible;
      state.showFontControls = visible;
      controls.style.display = visible ? 'flex' : 'none';
    },
  });
  toggleBtn.appendChild(icon('textSize'));

  return { toggleBtn, controls };
}

/* === Tiny DOM helpers === */
function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') node.innerHTML = v;
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function routeLink(route, attrs, ...children) {
  const options = Object.assign({}, attrs || {});
  const originalClick = options.onclick;
  options.href = buildPath(route);
  options.onclick = (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (originalClick) originalClick(event);
    go(route);
  };
  return el('a', options, ...children);
}

const ICONS = {
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  close: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  chevronLeft: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevronRight: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  person: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  notes: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  textSize: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none"><text x="1.5" y="18" font-size="11" fill="currentColor" font-family="sans-serif" font-weight="500">A</text><text x="10" y="20" font-size="16" fill="currentColor" font-family="sans-serif" font-weight="700">A</text></svg>',
  book: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 5a2 2 0 0 1 2-2h11v16H6a2 2 0 0 0-2 2V5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M17 3v16M4 19a2 2 0 0 0 2 2h12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  searchTab: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.7"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
};

function icon(name, klass) {
  const span = document.createElement('span');
  span.className = 'icon ' + (klass || '');
  span.style.display = 'inline-flex';
  span.innerHTML = ICONS[name] || '';
  return span;
}

/* === Bottom tab bar (註釋 / 搜尋) ===
 * Shown only on the two top-level screens (home / search). Detail screens
 * — book / intro / read — keep their own back button instead, to maximise
 * vertical reading space on phones.
 */
function renderTabBar(active) {
  const bar = el('div', { class: 'tab-bar' });
  const tabs = [
    { key: 'home', label: '註釋', icon: 'book', target: { screen: 'home' } },
    { key: 'search', label: '搜尋', icon: 'searchTab', target: { screen: 'search' } },
  ];
  for (const t of tabs) {
    const btn = routeLink(t.target, {
      class: 'tab-bar-btn' + (t.key === active ? ' active' : ''),
      onclick: () => {
        if (t.key !== active) {
          captureEvent('bottom_tab_selected', { tab: t.key });
        }
      },
    });
    btn.appendChild(icon(t.icon));
    btn.appendChild(el('div', null, t.label));
    bar.appendChild(btn);
  }
  return bar;
}

/* === Screens === */
function renderHome() {
  const screen = el('main', { class: 'screen' });

  // Header
  const header = el('div', { class: 'header' });
  const titleRow = el('div', { class: 'home-title-row' });
  titleRow.appendChild(el('h1', { class: 'h1' }, '信望愛聖經註釋'));
  titleRow.appendChild(routeLink({ screen: 'about' }, {
    class: 'about-entry-btn',
    onclick: () => {
      captureEvent('about_opened', { source: 'home_header' });
    },
  }, '關於'));
  header.appendChild(el('div', { class: 'title-block' }, titleRow));

  // Search (book names only — full-text search lives in the dedicated 搜尋 tab)
  const searchInput = el('input', {
    type: 'search',
    placeholder: '搜尋書卷（跨舊約新約）...',
    value: state.homeSearch,
    oninput: (e) => { state.homeSearch = e.target.value; renderCategories(); },
  });
  const clearBtn = el('button', {
    class: 'icon-btn',
    style: { display: state.homeSearch ? 'inline-flex' : 'none', color: 'var(--sub)' },
    onclick: () => { state.homeSearch = ''; searchInput.value = ''; clearBtn.style.display = 'none'; renderCategories(); },
  });
  clearBtn.appendChild(icon('close'));
  const searchBox = el('div', { class: 'search' }, icon('search'), searchInput, clearBtn);
  header.appendChild(searchBox);

  // Tabs
  const otBtn = el('button', { class: 'tab-btn' + (state.homeTab === 'ot' ? ' active' : ''), onclick: () => setTab('ot') }, '舊約');
  const ntBtn = el('button', { class: 'tab-btn' + (state.homeTab === 'nt' ? ' active' : ''), onclick: () => setTab('nt') }, '新約');
  const tabRow = el('div', { class: 'tab-row' }, otBtn, ntBtn);
  header.appendChild(tabRow);

  function setTab(t) {
    state.homeTab = t;
    localStorage.setItem('home-tab', t);
    otBtn.classList.toggle('active', t === 'ot');
    ntBtn.classList.toggle('active', t === 'nt');
    renderCategories();
  }

  screen.appendChild(header);

  // Scroller
  const scroller = el('div', { class: 'scroller' });
  const list = el('div');
  scroller.appendChild(list);
  screen.appendChild(scroller);

  function renderCategories() {
    list.innerHTML = '';
    clearBtn.style.display = state.homeSearch ? 'inline-flex' : 'none';
    const cats = state.homeSearch
      ? [...OT_CATEGORIES, ...NT_CATEGORIES]
      : (state.homeTab === 'ot' ? OT_CATEGORIES : NT_CATEGORIES);
    const q = state.homeSearch.trim();
    let any = false;
    for (const cat of cats) {
      const books = cat.books.filter((b) => !q || b.includes(q));
      if (books.length === 0) continue;
      any = true;
      const block = el('div', { class: 'cat-block' });
      block.appendChild(el('div', { class: 'cat-head' },
        el('div', { class: 'cat-tag' }, cat.label),
        el('div', { class: 'cat-rule' }),
        el('div', { class: 'cat-count' }, books.length + '卷')
      ));
      const grid = el('div', { class: 'book-grid' });
      for (const book of books) {
        grid.appendChild(routeLink({ screen: 'book', book }, {
          class: 'book-card',
          onclick: () => {
            captureEvent('bible_book_selected', bookTrackingProperties(book, {
              source: state.homeSearch ? 'home_search' : 'book_list',
            }));
          },
        }, book));
      }
      block.appendChild(grid);
      list.appendChild(block);
    }
    if (!any) {
      list.appendChild(el('div', { class: 'empty' }, '找不到符合的書卷。'));
    } else {
      list.appendChild(el('div', { class: 'home-updated-at' }, '最後更新：' + LAST_UPDATED_DATE));
    }
  }

  renderCategories();

  // Restore scroll on this screen.
  requestAnimationFrame(() => { scroller.scrollTop = state.homeScroll; });
  scroller.addEventListener('scroll', () => { state.homeScroll = scroller.scrollTop; });

  // Bottom tab bar (註釋 / 搜尋) hidden until full-text search is improved.
  // To re-enable: screen.appendChild(renderTabBar('home'));
  return screen;
}

function renderAbout() {
  const screen = el('main', { class: 'screen' });

  const header = el('div', {
    class: 'header',
    style: { borderBottom: '1px solid var(--divider)', paddingBottom: '14px' },
  });
  const back = routeLink({ screen: 'home' }, { class: 'back-btn' });
  back.appendChild(icon('chevronLeft'));
  back.appendChild(document.createTextNode('返回'));
  header.appendChild(back);
  header.appendChild(el('h1', { class: 'h1' }, '關於'));
  header.appendChild(el('div', { class: 'accent-rule' }));
  screen.appendChild(header);

  const scroller = el('div', { class: 'scroller', style: { padding: '20px 20px 24px' } });

  function section(tag, ...cards) {
    const sec = el('div', { class: 'about-section' });
    const head = el('div', { class: 'about-section-head' });
    head.appendChild(el('div', { class: 'about-section-tag' }, tag));
    head.appendChild(el('div', { class: 'about-section-rule' }));
    sec.appendChild(head);
    for (const c of cards) sec.appendChild(c);
    return sec;
  }

  // 資料來源
  const srcCard = el('div', { class: 'about-card' });
  srcCard.appendChild(el('div', { class: 'about-card-title' }, '信望愛信仰與聖經資源中心'));
  srcCard.appendChild(el('a', {
    class: 'about-card-link',
    href: 'https://bible.fhl.net/index.html',
    target: '_blank',
    rel: 'noopener noreferrer',
  }, 'bible.fhl.net ↗'));
  srcCard.appendChild(el('div', { class: 'about-card-body' },
    '本網站／App 的聖經專卷註釋內容，全部來自信望愛全球資訊網提供的聖經工具，至今仍持續不斷更新內容，感謝編輯團隊與網站維護者多年的心血付出。並感謝信望愛開放資料的授權，讓本網站／App 得以實現。'
  ));
  scroller.appendChild(section('資料來源', srcCard));

  // 奉獻支持
  const donateCard = el('div', { class: 'about-card' });
  donateCard.appendChild(el('div', { class: 'about-card-body' },
    '信望愛的資料免費提供給所有人使用，若您得到幫助，歡迎奉獻支持，讓這份工作得以持續。'
  ));
  donateCard.appendChild(el('button', {
    class: 'donate-btn',
    onclick: () => {
      captureEvent('external_link_opened', { link: 'fhl_donation', source: 'about' });
      window.open('https://www.fhl.net/nbg/fhl/fhl6.html', '_blank');
    },
  }, '♥ 前往信望愛捐款頁面'));
  scroller.appendChild(section('奉獻支持', donateCard));

  // PWA / iPhone offline instructions
  const pwaCard = el('div', { class: 'about-card' });
  pwaCard.appendChild(el('div', { class: 'about-card-title' }, '加入 iPhone 主畫面，離線閱讀'));
  pwaCard.appendChild(el('div', { class: 'about-card-body' },
    '首次完成離線資料下載後，即使沒有網路，也能從主畫面開啟本網站、搜尋並閱讀全部註釋。'
  ));
  pwaCard.appendChild(el('ol', { class: 'pwa-install-steps' },
    el('li', null, '使用 Safari 開啟 biblestudy.tw'),
    el('li', null, '點選「分享」→「加入主畫面」'),
    el('li', null, '開啟「作為 Web App 打開」，再點選「加入」')
  ));
  const pwaCapability = el('div', { class: 'pwa-capability' },
    navigator.serviceWorker && navigator.serviceWorker.controller
      ? '✓ 此裝置已啟用離線閱讀'
      : '首次載入完成後，網站會準備離線資料'
  );
  pwaCard.appendChild(pwaCapability);
  scroller.appendChild(section('離線閱讀', pwaCard));

  // 開發者
  const devCard = el('div', { class: 'about-card' });
  const devRow = el('div', { class: 'dev-row' });
  devRow.appendChild(el('div', { class: 'dev-avatar' }, 'P'));
  const devInfo = el('div', { class: 'dev-info' });
  devInfo.appendChild(el('div', { class: 'dev-name' }, 'Po-Han Huang'));
  devInfo.appendChild(el('div', { class: 'dev-email' }, 'pohan625@gmail.com'));
  devRow.appendChild(devInfo);
  devCard.appendChild(devRow);
  devCard.appendChild(el('div', { class: 'dev-note' }, '本網站／App 為個人開發專案，與信望愛全球資訊網並無隸屬關係。若有任何建議，歡迎來信。'));

  const ghPill = el('button', {
    class: 'github-pill',
    onclick: () => {
      captureEvent('external_link_opened', { link: 'github_repository', source: 'about' });
      window.open('https://github.com/pohan625/fhl-bible-notes', '_blank');
    },
  });
  const ghIcon = document.createElement('span');
  ghIcon.style.display = 'inline-flex';
  ghIcon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/></svg>';
  ghPill.appendChild(ghIcon);
  const ghLabel = el('div', { class: 'github-pill-label' });
  ghLabel.appendChild(el('div', { class: 'github-pill-title' }, '原始碼完全開源'));
  ghLabel.appendChild(el('div', { class: 'github-pill-sub' }, 'github.com/pohan625/fhl-bible-notes'));
  ghPill.appendChild(ghLabel);
  const chevR = document.createElement('span');
  chevR.style.display = 'inline-flex';
  chevR.style.color = 'var(--sub)';
  chevR.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  ghPill.appendChild(chevR);
  devCard.appendChild(ghPill);
  scroller.appendChild(section('開發者', devCard));

  screen.appendChild(scroller);
  return screen;
}

function renderSearch() {
  const screen = el('main', { class: 'screen' });

  const header = el('div', { class: 'header' });
  header.appendChild(el('div', { class: 'title-block' },
    el('h1', { class: 'h1' }, '全文搜尋')
  ));

  const searchInput = el('input', {
    type: 'search',
    placeholder: '輸入關鍵字（如「以馬內利」）...',
    value: state.fullSearchQuery,
    oninput: (e) => {
      state.fullSearchQuery = e.target.value;
      clearBtn.style.display = state.fullSearchQuery ? 'inline-flex' : 'none';
      scheduleRender();
    },
  });
  const clearBtn = el('button', {
    class: 'icon-btn',
    style: { display: state.fullSearchQuery ? 'inline-flex' : 'none', color: 'var(--sub)' },
    onclick: () => {
      state.fullSearchQuery = '';
      searchInput.value = '';
      clearBtn.style.display = 'none';
      renderResults();
      searchInput.focus();
    },
  });
  clearBtn.appendChild(icon('close'));
  header.appendChild(el('div', { class: 'search' }, icon('search'), searchInput, clearBtn));
  screen.appendChild(header);

  const scroller = el('div', { class: 'scroller' });
  const list = el('div');
  scroller.appendChild(list);
  screen.appendChild(scroller);

  // Debounce so typing stays responsive on the ~10 MB corpus.
  let renderTimer = null;
  function scheduleRender() {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(() => { renderTimer = null; renderResults(); }, 160);
  }

  function renderResults() {
    list.innerHTML = '';
    const q = state.fullSearchQuery.trim();
    if (!q) {
      list.appendChild(el('div', { class: 'search-screen-empty' },
        '輸入關鍵字以搜尋全部章節註釋',
        el('br'),
        el('span', { style: { fontSize: '12px', opacity: '0.7' } }, '至少輸入 2 個字')
      ));
      return;
    }
    if (q.length < 2) {
      list.appendChild(el('div', { class: 'search-screen-empty' }, '請至少輸入 2 個字'));
      return;
    }
    const hits = searchFullText(q, 200);
    const searchKey = q + ':' + hits.length;
    if (state.lastSearchTracked !== searchKey) {
      state.lastSearchTracked = searchKey;
      captureEvent('full_text_search_performed', {
        query_length: q.length,
        result_count: hits.length,
        result_limit_reached: hits.length >= 200,
      });
    }
    const head = el('div', { class: 'search-results-head' },
      el('div', { class: 'search-results-title' }, '搜尋結果'),
      el('div', { class: 'search-results-count' },
        hits.length === 0 ? '無符合' :
        (hits.length >= 200 ? '前 200 筆' : '共 ' + hits.length + ' 筆'))
    );
    list.appendChild(head);
    if (hits.length === 0) return;
    const wrap = el('div', { class: 'search-results' });
    for (const h of hits) {
      const card = routeLink({ screen: 'read', book: h.book, chapter: h.chapter }, {
        class: 'search-result',
        onclick: () => {
          captureEvent('commentary_chapter_opened', bookTrackingProperties(h.book, {
            chapter: h.chapter,
            source: 'full_text_search_result',
          }));
        },
      });
      card.appendChild(el('div', { class: 'search-result-loc' },
        h.book,
        el('span', { class: 'chapter-tag' }, '第 ' + h.chapter + ' 章')
      ));
      card.appendChild(el('div', { class: 'search-result-snippet', html: h.snippet }));
      wrap.appendChild(card);
    }
    list.appendChild(wrap);
  }

  renderResults();

  // Restore scroll position when switching back to this tab.
  requestAnimationFrame(() => { scroller.scrollTop = state.fullSearchScroll; });
  scroller.addEventListener('scroll', () => { state.fullSearchScroll = scroller.scrollTop; });

  // Auto-focus when arriving with no prior query, so user can start typing.
  if (!state.fullSearchQuery) {
    requestAnimationFrame(() => searchInput.focus());
  }

  screen.appendChild(renderTabBar('search'));
  return screen;
}

function renderBook(book) {
  const meta = BOOK_INDEX[book];
  if (!meta) return renderHome();
  const screen = el('main', { class: 'screen' });

  const header = el('div', { class: 'header' });
  const back = routeLink({ screen: 'home' }, { class: 'back-btn' });
  back.appendChild(icon('chevronLeft'));
  back.appendChild(document.createTextNode('書卷'));
  header.appendChild(back);
  header.appendChild(el('div', { class: 'kicker' }, '選擇章節'));
  header.appendChild(el('h1', { class: 'h1 lg' }, book));
  header.appendChild(el('div', { class: 'subline' }, '共 ' + meta.chapterCount + ' 章'));
  screen.appendChild(header);

  const scroller = el('div', { class: 'scroller', style: { paddingLeft: '0', paddingRight: '0' } });

  // Intro cards
  const intros = DATA.intros[book] || [];
  const preface = DATA.authorPrefaces[book];
  const hasIntro = intros.length > 0;
  if (preface || hasIntro) {
    const cards = el('div', { class: 'intro-cards' });
    if (preface) {
      const card = routeLink({ screen: 'intro', book, view: 'author' }, {
        class: 'intro-card',
        onclick: () => {
          captureEvent('book_intro_opened', bookTrackingProperties(book, {
            view: 'author',
            source: 'book_screen',
          }));
        },
      });
      const ic = el('div', { class: 'intro-card-icon' });
      ic.appendChild(icon('person'));
      card.appendChild(ic);
      card.appendChild(el('div', { class: 'intro-card-text' },
        el('div', { class: 'intro-card-title' }, '註釋作者前言'),
        el('div', { class: 'intro-card-sub' }, '查經工作背景說明')
      ));
      const arrow = el('span', { class: 'intro-card-arrow' });
      arrow.appendChild(icon('chevronRight'));
      card.appendChild(arrow);
      cards.appendChild(card);
    }
    if (hasIntro) {
      const card = routeLink({ screen: 'intro', book, view: 'background' }, {
        class: 'intro-card',
        onclick: () => {
          captureEvent('book_intro_opened', bookTrackingProperties(book, {
            view: 'background',
            source: 'book_screen',
          }));
        },
      });
      const ic = el('div', { class: 'intro-card-icon solid' });
      ic.appendChild(icon('notes'));
      card.appendChild(ic);
      card.appendChild(el('div', { class: 'intro-card-text' },
        el('div', { class: 'intro-card-title' }, '查經背景資料'),
        el('div', { class: 'intro-card-sub' }, '書卷背景、作者、寫作年代、考古')
      ));
      const arrow = el('span', { class: 'intro-card-arrow' });
      arrow.appendChild(icon('chevronRight'));
      card.appendChild(arrow);
      cards.appendChild(card);
    }
    scroller.appendChild(cards);
  }

  // Chapter grid
  const grid = el('div', { class: 'chapter-grid' });
  for (let i = 1; i <= meta.chapterCount; i++) {
    grid.appendChild(routeLink({ screen: 'read', book, chapter: i }, {
      class: 'chapter-card',
      onclick: () => {
        captureEvent('commentary_chapter_opened', bookTrackingProperties(book, {
          chapter: i,
          source: 'chapter_grid',
        }));
      },
    }, String(i)));
  }
  scroller.appendChild(grid);

  screen.appendChild(scroller);
  return screen;
}

function renderIntro(book, view) {
  const meta = BOOK_INDEX[book];
  if (!meta) return renderHome();
  const screen = el('main', { class: 'screen' });

  const header = el('div', { class: 'header', style: { borderBottom: '1px solid var(--divider)', paddingBottom: '14px' } });

  // Top row: back button + (later) font-size toggle.
  const topRow = el('div', { class: 'reading-toolbar' });
  const back = routeLink({ screen: 'book', book }, { class: 'back-btn', style: { marginBottom: '0' } });
  back.appendChild(icon('chevronLeft'));
  back.appendChild(document.createTextNode(book));
  topRow.appendChild(back);
  const tools = el('div', { class: 'tool-row' });
  topRow.appendChild(tools);
  header.appendChild(topRow);
  const fontControlsSlot = el('div');
  header.appendChild(fontControlsSlot);

  const isAuthor = view === 'author';
  header.appendChild(el('div', { class: 'kicker', style: { marginTop: '14px' } }, isAuthor ? '查經工作背景說明' : '查經背景資料'));
  header.appendChild(el('h1', { class: 'h1 md' }, isAuthor ? '作者序' : (book + '簡介')));
  header.appendChild(el('div', { class: 'accent-rule' }));

  // Body content (built first so we can wire it to the font-size toolbar).
  const scroller = el('div', { class: 'scroller', style: { padding: '20px 22px 32px' } });
  const fontBodies = [];

  if (isAuthor) {
    const preface = DATA.authorPrefaces[book];
    if (!preface) {
      scroller.appendChild(el('div', { class: 'empty' }, '暫無作者序'));
    } else {
      const body = el('div', { class: 'preface-body', style: { fontSize: state.fontSize + 'px' } }, nb(preface));
      fontBodies.push(body);
      scroller.appendChild(body);
    }
  } else {
    const intros = DATA.intros[book] || [];
    if (intros.length === 0) {
      scroller.appendChild(el('div', { class: 'empty' }, '此書卷暫無背景資料'));
    } else {
      for (const sec of intros) {
        if (!sec.body) {
          // Section with title only — render as a divider with the title.
          if (!sec.title) continue;
          const div = el('div', { class: 'intro-section intro-empty-divider' });
          const head = el('div', { class: 'intro-section-head' });
          head.appendChild(el('h2', {
            class: 'intro-section-tag',
            style: { opacity: '0.7' },
          }, truncTitle(sec.title)));
          head.appendChild(el('div', { class: 'intro-section-rule' }));
          div.appendChild(head);
          scroller.appendChild(div);
          continue;
        }
        const sect = el('div', { class: 'intro-section' });
        if (sec.title) {
          const head = el('div', { class: 'intro-section-head' });
          head.appendChild(el('h2', { class: 'intro-section-tag' }, truncTitle(sec.title)));
          head.appendChild(el('div', { class: 'intro-section-rule' }));
          sect.appendChild(head);
        }
        const body = el('div', { class: 'intro-section-body', style: { fontSize: state.fontSize + 'px' } });
        for (const node of renderIntroLines(sec.body)) body.appendChild(node);
        fontBodies.push(body);
        sect.appendChild(body);
        scroller.appendChild(sect);
      }
    }
  }

  // Mount the font-size toolbar (visible only when the page has scalable text).
  if (fontBodies.length > 0) {
    const fontTb = buildFontToolbar(fontBodies);
    tools.appendChild(fontTb.toggleBtn);
    fontControlsSlot.appendChild(fontTb.controls);
  }

  screen.appendChild(header);
  screen.appendChild(scroller);
  return screen;
}

function truncTitle(t) {
  // Strip trailing colon and clip overlong titles for the inline tag.
  const s = (t || '').replace(/[：:]\s*$/, '').trim();
  return s.length > 16 ? s.slice(0, 16) + '…' : s;
}

function renderRead(book, chapter) {
  const meta = BOOK_INDEX[book];
  if (!meta) return renderHome();
  const screen = el('main', { class: 'screen' });

  const header = el('div', { class: 'header', style: { borderBottom: '1px solid var(--divider)', paddingBottom: '14px' } });

  const text = (DATA.chapters[book] || {})[String(chapter)] || '';
  const bodyText = el('div', { class: 'chapter-body commentary-body', style: { fontSize: state.fontSize + 'px' } });
  for (const node of renderCommentaryLines(text || '')) bodyText.appendChild(node);

  const fontTb = buildFontToolbar([bodyText]);

  const toolbar = el('div', { class: 'reading-toolbar' });
  const back = routeLink({ screen: 'book', book }, { class: 'back-btn', style: { marginBottom: '0' } });
  back.appendChild(icon('chevronLeft'));
  back.appendChild(document.createTextNode(book));
  toolbar.appendChild(back);
  toolbar.appendChild(el('div', { class: 'tool-row' }, fontTb.toggleBtn));
  header.appendChild(toolbar);
  header.appendChild(fontTb.controls);

  screen.appendChild(header);

  // Body
  const scroller = el('div', { class: 'scroller', style: { padding: '24px 22px 96px' } });
  scroller.appendChild(el('div', { class: 'chapter-title-block' },
    el('div', { class: 'kicker' }, '第 ' + chapter + ' 章'),
    el('h1', { class: 'h1 md' }, book + ' 第 ' + chapter + ' 章'),
    el('div', { class: 'accent-rule' })
  ));
  if (!text) {
    scroller.appendChild(el('div', { class: 'empty' },
      '本章暫無註釋內容。',
      el('br'),
      el('span', { style: { fontSize: '14px', opacity: '0.6' } }, '「你的話是我腳前的燈，是我路上的光。」 詩篇 119:105')
    ));
  } else {
    scroller.appendChild(bodyText);
  }

  screen.appendChild(scroller);

  // Persistent bottom chapter nav bar
  const navBar = el('div', { class: 'chapter-nav-bar' });

  const chevL = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const chevR = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const prevAttrs = {
    class: 'nav-btn', title: '上一章',
    onclick: () => {
      captureEvent('commentary_chapter_opened', bookTrackingProperties(book, {
        chapter: chapter - 1,
        source: 'chapter_nav_previous',
      }));
    },
  };
  const prevBtn = chapter > 1
    ? routeLink({ screen: 'read', book, chapter: chapter - 1 }, prevAttrs)
    : el('span', { class: 'nav-btn', title: '上一章', 'aria-disabled': 'true' });
  prevBtn.innerHTML = chevL;

  const nextAttrs = {
    class: 'nav-btn', title: '下一章',
    onclick: () => {
      captureEvent('commentary_chapter_opened', bookTrackingProperties(book, {
        chapter: chapter + 1,
        source: 'chapter_nav_next',
      }));
    },
  };
  const nextBtn = chapter < meta.chapterCount
    ? routeLink({ screen: 'read', book, chapter: chapter + 1 }, nextAttrs)
    : el('span', { class: 'nav-btn', title: '下一章', 'aria-disabled': 'true' });
  nextBtn.innerHTML = chevR;

  const center = el('div', { class: 'nav-center' });
  center.appendChild(el('div', { class: 'nav-chapter' }, '第 ' + chapter + ' 章'));
  center.appendChild(el('div', { class: 'nav-book' }, book + '　' + chapter + ' / ' + meta.chapterCount));

  navBar.appendChild(prevBtn);
  navBar.appendChild(center);
  navBar.appendChild(nextBtn);
  screen.appendChild(navBar);

  // Scroll body to top on chapter change.
  requestAnimationFrame(() => { scroller.scrollTop = 0; });
  return screen;
}

/* === Render dispatch === */
function render() {
  const route = readRoute();
  applyRouteMetadata(route);
  const root = document.getElementById('app');
  root.innerHTML = '';
  let screen;
  if (route.screen === 'search') screen = renderSearch();
  else if (route.screen === 'about') screen = renderAbout();
  else if (route.screen === 'book') screen = renderBook(route.book);
  else if (route.screen === 'intro') screen = renderIntro(route.book, route.view);
  else if (route.screen === 'read') screen = renderRead(route.book, route.chapter);
  else screen = renderHome();
  root.appendChild(screen);
  window.scrollTo(0, 0);
}

function showPwaStatus(message, actionLabel, action, autoHide) {
  let status = document.getElementById('pwa-status');
  if (!status) {
    status = el('div', { id: 'pwa-status', class: 'pwa-status', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(status);
  }
  status.innerHTML = '';
  status.hidden = false;
  status.appendChild(el('span', null, message));
  if (actionLabel && action) status.appendChild(el('button', { onclick: action }, actionLabel));
  if (autoHide) setTimeout(() => { status.hidden = true; }, autoHide);
}

function registerPwa() {
  const config = window.__PWA_CONFIG__;
  if (!config || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  let reloadForUpdate = false;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(config.serviceWorkerUrl, { scope: '/' });
      const offerUpdate = (worker) => showPwaStatus('有新版註釋可用。', '重新載入', () => {
        reloadForUpdate = true;
        worker.postMessage({ type: 'SKIP_WAITING' });
      });
      if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
          if (worker.state === 'redundant' && !navigator.serviceWorker.controller) {
            showPwaStatus('離線資料下載失敗，線上閱讀仍可正常使用。', '重試', () => location.reload());
            captureEvent('pwa_offline_setup_failed', { message: 'service_worker_install_redundant' });
          }
        });
      });
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'OFFLINE_READY') {
          showPwaStatus('已可離線使用全部聖經註釋。', null, null, 6000);
        }
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadForUpdate) location.reload();
      });
    } catch (error) {
      showPwaStatus('離線資料下載失敗，線上閱讀仍可正常使用。', '重試', () => location.reload());
      captureEvent('pwa_offline_setup_failed', { message: String(error && error.message || error) });
    }
  });
}

window.addEventListener('popstate', () => { render(); trackPageview(); });
render();
trackPageview();
registerPwa();
