// Refresh-and-diff: re-fetch from sc.php, diff against the previous dump,
// then rebuild the app. Run via `npm run refresh-and-diff`.
//
// Why this exists:
//   bible.fhl.net/api/sc.php has no Last-Modified / ETag header, so the only
//   way to detect upstream updates is to fetch everything and compare against
//   the previous snapshot. This script automates the bookkeeping so refreshing
//   is a single command instead of a four-step incantation.
//
// Steps:
//   1. Backup the existing source/sc_api_dump.json → sc_api_dump.prev.json.
//   2. Run `fetch.js --force` to re-fetch all 66 books (~22 minutes).
//   3. Diff old vs new — print which books / chapters changed, which preBook
//      sections changed.
//   4. Run extract.js → build.js → handoff.js so public/index.html and
//      design/design-handoff.html are up to date.
//
// Recovery: if fetch.js fails partway through, the existing dump file may be
// in a partial state. The .prev.json backup is your fallback — copy it back
// over sc_api_dump.json and re-run the script.

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DUMP_PATH = path.join(ROOT, 'source', 'sc_api_dump.json');
const PREV_PATH = path.join(ROOT, 'source', 'sc_api_dump.prev.json');

function run(name, args = []) {
  console.log(`\n▶ ${name} ${args.join(' ')}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, name), ...args], {
    stdio: 'inherit',
    cwd: ROOT,
  });
  if (r.status !== 0) {
    console.error(`\n✗ ${name} failed (exit ${r.status}). Aborting.`);
    process.exit(r.status || 1);
  }
}

function loadJson(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.error(`Failed to parse ${p}: ${err.message}`);
    return null;
  }
}

function diffDumps(prev, next) {
  const changes = {
    addedBooks: [],
    removedBooks: [],
    changedBooks: [],          // [{ name, prefaceChanged: bool, changedChapters: [chap, ...] }]
    unchangedBookCount: 0,
  };
  const prevBooks = (prev && prev.books) || {};
  const nextBooks = (next && next.books) || {};
  for (const name of Object.keys(nextBooks)) {
    if (!prevBooks[name]) {
      changes.addedBooks.push(name);
      continue;
    }
    const a = prevBooks[name];
    const b = nextBooks[name];
    const prefaceChanged = (a.preBook || '') !== (b.preBook || '');
    const aChapters = a.chapters || {};
    const bChapters = b.chapters || {};
    const allKeys = new Set([...Object.keys(aChapters), ...Object.keys(bChapters)]);
    const changedChapters = [];
    for (const k of allKeys) {
      if (aChapters[k] !== bChapters[k]) changedChapters.push(Number(k));
    }
    changedChapters.sort((x, y) => x - y);
    if (prefaceChanged || changedChapters.length > 0) {
      changes.changedBooks.push({ name, prefaceChanged, changedChapters });
    } else {
      changes.unchangedBookCount++;
    }
  }
  for (const name of Object.keys(prevBooks)) {
    if (!nextBooks[name]) changes.removedBooks.push(name);
  }
  return changes;
}

function printDiff(changes) {
  console.log('\n=== Diff vs previous dump ===');
  if (changes.addedBooks.length === 0 &&
      changes.removedBooks.length === 0 &&
      changes.changedBooks.length === 0) {
    console.log(`✓ No content changes detected (${changes.unchangedBookCount} books unchanged)`);
    return false;
  }
  if (changes.addedBooks.length > 0) {
    console.log(`+ ${changes.addedBooks.length} book(s) added:`);
    for (const n of changes.addedBooks) console.log(`    + ${n}`);
  }
  if (changes.removedBooks.length > 0) {
    console.log(`- ${changes.removedBooks.length} book(s) removed:`);
    for (const n of changes.removedBooks) console.log(`    - ${n}`);
  }
  if (changes.changedBooks.length > 0) {
    console.log(`~ ${changes.changedBooks.length} book(s) changed:`);
    for (const c of changes.changedBooks) {
      const parts = [];
      if (c.prefaceChanged) parts.push('preBook (preface/intros)');
      if (c.changedChapters.length > 0) {
        const chs = c.changedChapters.length > 12
          ? c.changedChapters.slice(0, 12).join(', ') + ', …'
          : c.changedChapters.join(', ');
        parts.push(`ch ${chs}`);
      }
      console.log(`    ~ ${c.name}: ${parts.join('; ')}`);
    }
  }
  console.log(`(${changes.unchangedBookCount} unchanged)`);
  return true;
}

async function main() {
  // 1. Backup the existing dump (if any).
  if (fs.existsSync(DUMP_PATH)) {
    fs.copyFileSync(DUMP_PATH, PREV_PATH);
    const stat = fs.statSync(PREV_PATH);
    console.log(`📦 Backed up current dump → ${path.relative(ROOT, PREV_PATH)} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  } else {
    console.log('ℹ No existing dump to back up — first-time fetch.');
  }

  // 2. Force re-fetch.
  run('fetch.js', ['--force']);

  // 3. Diff.
  const prev = loadJson(PREV_PATH);
  const next = loadJson(DUMP_PATH);
  const changes = diffDumps(prev, next);
  const hasChanges = printDiff(changes);

  // 4. Always rebuild — even if "no content changed", a code-side update to
  //    extract.js or template.html might still want a fresh public/index.html.
  run('extract.js');
  run('build.js');
  run('handoff.js');

  console.log('\n=== Refresh complete ===');
  if (hasChanges) {
    console.log('Content changed — review `git diff public/index.html` and commit when satisfied.');
    console.log('To revert: cp source/sc_api_dump.prev.json source/sc_api_dump.json && npm run rebuild');
  } else {
    console.log('No upstream content changes; build artifacts regenerated anyway.');
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
