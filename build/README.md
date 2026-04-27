# 聖經註釋 App — Build Pipeline

This folder turns the source-data file (`fhl_bible_offline/index.html`, ~11 MB
of literal commentary text from a2z.fhl.net) into a single self-contained
offline web app.

## Files

| File | Role |
|---|---|
| `extract.js` | Parses the source HTML, splits each book into author preface / intro / chapter map, and writes `data.json`. |
| `data.json` | Structured commentary data — 66 books, 1189 chapters, ~9.7 MB. |
| `template.html` | The app itself: HTML + CSS + JS, with a single `__BIBLE_DATA__` placeholder. |
| `build.js` | Injects `data.json` into `template.html` → produces `/index.html` (the production offline app). |
| `handoff.js` | Builds a lightweight `/design-handoff.html` (~170 KB) for re-importing into design tools. |

## Build commands

```bash
# 1. Re-extract data from the original commentary source. Only needed if you
#    update fhl_bible_offline/index.html.
node build/extract.js

# 2. Produce the full offline app at /index.html (~9.7 MB). This is what end
#    users open on their phone.
node build/build.js

# 3. Produce the lightweight design-handoff build at /design-handoff.html.
#    Use this when iterating on visuals in Claude Design or similar tools.
node build/handoff.js
```

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
4. **Repack production**: `node build/build.js` → updated `index.html` with
   full commentary text.

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

The intro page uses a separate, intentionally flat renderer (see
`renderIntroLines`) — every item is a regular paragraph with the same weight,
because `（一）（二）` in an intro section is enumeration, not heading
hierarchy. The burgundy "tag" header on each section already conveys the only
heading level needed there.

## Data extraction notes

`extract.js` is the most heuristic part of the pipeline. The corpus is a
single literal text file with implicit structure (whitespace indentation +
section markers + verse-range references). Two algorithms worth knowing:

1. **Chapter assignment** — for each paragraph after the chapter content
   begins, the parser counts verse references (`\d+:\d+`) and assigns the
   paragraph to the chapter with the highest reference count, with a
   "prefer-forward, never-backwards" tie-break to handle cross-references
   into earlier chapters. Section headers explicitly carrying a verse range
   (e.g. `（七）建造祭壇 38:1-8`) override the count-based logic.
2. **Soft-wrap unwrap** — the source uses fixed-width line wrapping; the
   parser detects continuation lines (lines starting with body characters
   rather than a structural marker) and merges them back into the parent
   logical line, so what reaches the renderer is one paragraph per line.

If new books are added to the source or formatting conventions change, this
is where breakage is most likely to surface.
