# 聖經註釋 App — Build Pipeline

This folder turns raw commentary data from the FHL JSON API into a single
self-contained offline web app.

## Pipeline

```
            (network)
fetch.js  ───────────►  source/sc_api_dump.json
                                 │
                                 ▼
                          extract.js  ───►  build/data.json
                                 │
                  ┌──────────────┴──────────────┐
                  ▼                             ▼
              build.js                       handoff.js
                  │                             │
                  ▼                             ▼
        public/index.html              design/design-handoff.html
       (offline app, ~10 MB)         (lightweight design build)
```

## Files

| File | Role |
|---|---|
| `fetch.js` | Hits `bible.fhl.net/api/sc.php` (book=3 信望愛站註釋) for all 66 books and writes the raw API dump. ~12 minutes, idempotent / resume-safe. |
| `extract.js` | Parses `source/sc_api_dump.json`, splits each book into author preface / intros / chapter map, normalises soft-wraps, and writes `data.json`. |
| `data.json` | Structured commentary data — 66 books, 1189 chapters, ~10 MB. |
| `template.html` | The app itself: HTML + CSS + JS, with a single `__BIBLE_DATA__` placeholder. |
| `build.js` | Injects `data.json` into `template.html` → produces `/public/index.html` (the production offline app). |
| `handoff.js` | Builds a lightweight `/design/design-handoff.html` (~170 KB) for re-importing into design tools. |

## Build commands

The fastest way is via the npm scripts (see `package.json`):

```bash
npm run fetch              # pull commentary; resume mode (skips complete books)
npm run fetch:force        # pull commentary; force-refetch every book
npm run extract            # parse dump → data.json
npm run rebuild            # extract → build → handoff (skip fetch)
npm run refresh-and-diff   # full refresh: backup, force-fetch, diff vs prev, rebuild
```

Or call the scripts directly:

```bash
# 1. (Re-)download all commentary text from the FHL API. ~22 minutes for a full
#    fetch; resumes automatically if interrupted. Pass --force to ignore the
#    resume check and re-fetch every book (use this when refreshing content —
#    sc.php has no Last-Modified header so this is the only way to detect
#    upstream updates).
node build/fetch.js [--force]

# 2. Re-extract structured data from the dump. Fast (~1 second).
node build/extract.js

# 3. Produce the full offline app at /public/index.html (~10 MB). This is what
#    end users open on their phone.
node build/build.js

# 4. Produce the lightweight design-handoff build at /design/design-handoff.html.
#    Use this when iterating on visuals in Claude Design or similar tools.
node build/handoff.js
```

If you only changed `template.html` (UI/CSS) you can skip steps 1 & 2 — just
run `npm run rebuild` (or `node build/build.js` if you also want to skip
handoff).

## Refreshing content from upstream

`sc.php` returns no caching/version headers, so detecting upstream updates
requires fetching everything and diffing. `npm run refresh-and-diff` automates
this: it backs up `source/sc_api_dump.json` to `sc_api_dump.prev.json`,
force-fetches all 66 books (~22 min), prints which books / chapters / prefaces
changed, and rebuilds `public/index.html`. To revert if a refresh introduces a
problem:

```bash
cp source/sc_api_dump.prev.json source/sc_api_dump.json
npm run rebuild
```

There's no "smart" mode that pulls only changed content — the API doesn't
expose enough metadata for that. Suggested cadence: every 6-12 months, or
when a notable upstream announcement appears.

## Why a JSON-API source

Earlier versions of this app derived their data from a snapshot of
`a2z.fhl.net/php/pcom.php` — the rendered HTML chapter view. That source
silently destroys structural markup at render time:

- `#路 3:23-38|`  →  `路 3:23-38`        (the `#…|` sentinel is gone)
- `SNG05207`     →  `SG 5207`             (Strong number split with a literal space)

Switching to `sc.php` (the JSON API) gives us the canonical raw text including
those markers, so the renderer can:

- Style cross-references distinctly (`.xref`) — and someday make them tappable
- Style Strong numbers (`.strong`) — and someday link them to the original-language dictionary
- Detect chapter:verse ranges precisely

The extra parsing work happens at render time inside `template.html`'s
`renderInline()` — see the comment block there for the tokenizer rules.

## Round-trip with a design tool

When you want to evolve the visuals (new screens, layout changes, theme
tweaks):

1. **Export for design tool**: `node build/handoff.js` → `design-handoff.html`.
2. **Iterate on the design**: open `design-handoff.html` in Claude Design (or
   wherever) and make changes. The file is small enough (~170 KB) for the tool
   to handle; sample data covers every screen state including the empty state.
3. **Bring changes back**: copy the updated HTML/CSS/JS and merge into
   `build/template.html`. **Keep the `__BIBLE_DATA__` placeholder intact** —
   it's how `build.js` knows where to inject the real commentary.
4. **Repack production**: `node build/build.js` → updated `public/index.html`
   with full commentary text.

## Data injection point

`template.html` contains exactly one literal placeholder:

```js
const DATA = __BIBLE_DATA__;
```

`build.js` and `handoff.js` both replace that string token verbatim with a
JSON literal. **Don't quote it** in the template (`"__BIBLE_DATA__"` would
break — JSON injection wraps the value itself in `{}`/`[]`).

The injected `DATA` object has this shape:

```ts
{
  books: Array<{
    name: string;        // "創世記", "馬太福音", ...
    code: string;        // "Gen", "Matt", ...
    testament: 'OT' | 'NT';
    chapterCount: number;
    hasIntro: boolean;
    hasAuthor: boolean;
  }>;
  authorPrefaces: { [bookName]: string | null };
  intros:         { [bookName]: Array<{ title: string; body: string }> };
  chapters:       { [bookName]: { [chapterNum: string]: string } };
}
```

The static book list / category groupings (`OT_BOOKS`, `NT_BOOKS`,
`OT_CATEGORIES`, `NT_CATEGORIES`) are hard-coded in `template.html` — they're
display order, not data, so they don't go through the injection.

## Visual tokens

All theme values live as CSS custom properties on `:root` in `template.html`:

```css
:root {
  --bg:            #F7F0E3;   /* page background — warm parchment */
  --card-bg:       #FFFFFF;
  --text:          #1A1008;   /* primary headings */
  --text-soft:     #2A1F12;   /* body copy */
  --sub:           rgba(26, 16, 8, 0.45);  /* muted labels, captions */
  --border:        rgba(0, 0, 0, 0.06);
  --divider:       rgba(0, 0, 0, 0.06);
  --tab-bg:        rgba(0, 0, 0, 0.06);
  --tab-active-bg: #FFFFFF;
  --search-bg:     rgba(0, 0, 0, 0.07);
  --accent:        #7B2D3E;   /* burgundy accent — links, H1, tag bg, etc. */
  --accent-light:  #F5E8EA;   /* tag background */
  --accent-strong: #5e1d2d;
}
```

Re-skinning the app should just need edits to these values. Larger structural
changes (typography scale, spacing, radii) are inline in the CSS rules below
`:root`.

### Typography hierarchy

The chapter reading screen uses semantic line-classes — these are the design
levers for font hierarchy:

| Class | Source marker | Default style |
|---|---|---|
| `.ln-h1` | `壹、貳、參…` | 1.2em, 700, accent color |
| `.ln-h2` | `一、二、三…` | 1.1em, 700, primary text |
| `.ln-h3` | `（一）（二）…` | 1.02em, 700 |
| `.ln-h4` | `1. 2. …` or `甲、乙、…` | 1em, 700 |
| `.ln-h5` | `(1) (2) …` or `A. a. …` | 600 weight |
| `.ln-bullet` | `●` (word/term definition) | regular paragraph |
| `.ln-thought` | `◎` (commentary / reflection) | regular paragraph |
| `.ln-ref` | `○` (cross-reference) | 0.92em, muted color |
| `.ln-note` | `☆ ★` (special notes) | accent color, 600 |
| `.ln-body` | uncategorized | regular |

In addition, two **inline** classes are applied within any line by
`renderInline()`:

| Class | Source marker | Default style |
|---|---|---|
| `.xref` | `#路 3:23-38\|` | accent color, no-wrap |
| `.strong` | `SNG05207` / `SNH03091` | smaller, muted |

The intro page uses a separate, intentionally flat renderer (see
`renderIntroLines`) — every item is a regular paragraph with the same weight,
because `（一）（二）` in an intro section is enumeration, not heading
hierarchy. The burgundy "tag" header on each section already conveys the only
heading level needed there.

## Data extraction notes

`extract.js` is the structural parser. The corpus from the API is plain
commentary text with implicit conventions: whitespace indentation, section
markers (`壹、`, `一、`, `（一）`, `1.`, `●`/`○`/`◎`/`☆`), and embedded
references (`#…|`, `SN[GH]\d{5}`). Two things worth knowing:

1. **Section split** — `extract.js` separates each book's `preBook` text into
   (a) the `/* … */` author preface, (b) the title-line strip, (c) the intro
   sections (parsed by `parseIntro`), and finally chapters which are taken
   pre-split from the API. Chapters are no longer reconstructed via
   verse-count heuristics — `fetch.js` already separates them.
2. **Soft-wrap unwrap** — the API source uses fixed-width line wrapping;
   `unwrapParagraphs` and `unwrapBodyText` detect continuation lines (lines
   starting with body characters rather than a structural marker) and merge
   them back into the parent logical line so what reaches the renderer is one
   paragraph per line.

### Cross-chapter segments

Some segments span multiple chapters (e.g. `傳道書 5:8 to 6:12`, `約翰福音
13:31 to 14:31`). The API exposes them as a single record with a multi-chapter
`title`. `fetch.js` parses the title with a regex (`(\d+)章\d+節 到 (\d+)章\d+節`)
and stores the same `com_text` under every chapter the segment covers — that's
how `chapters[6]` of 傳道書 ends up populated even though the API's `next` link
jumps over it.

If a future re-fetch loses this logic, expect random "empty chapter" pages.
