const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { updateTemplateLastUpdatedDate } = require('./update-last-updated-date');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'last-updated-'));
const templatePath = path.join(tmpDir, 'template.html');

fs.writeFileSync(
  templatePath,
  [
    '<script>',
    "const LAST_UPDATED_DATE = '2026/6/11';",
    "const OTHER_VALUE = '2026/6/11';",
    '</script>',
    '',
  ].join('\n')
);

const result = updateTemplateLastUpdatedDate(templatePath, '2026/6/14');
const updated = fs.readFileSync(templatePath, 'utf8');

assert.strictEqual(result.previousDate, '2026/6/11');
assert.strictEqual(result.nextDate, '2026/6/14');
assert.ok(updated.includes("const LAST_UPDATED_DATE = '2026/6/14';"));
assert.ok(updated.includes("const OTHER_VALUE = '2026/6/11';"));

assert.throws(
  () => updateTemplateLastUpdatedDate(templatePath, '2026-06-14'),
  /Expected date in YYYY\/M\/D format/
);

console.log('update-last-updated-date tests passed');
