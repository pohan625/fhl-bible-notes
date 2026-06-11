const fs = require('fs');
const path = require('path');

const LAST_UPDATED_RE = /const LAST_UPDATED_DATE = '([^']+)';/;
const DISPLAY_DATE_RE = /^\d{4}\/\d{1,2}\/\d{1,2}$/;

function updateTemplateLastUpdatedDate(templatePath, nextDate) {
  if (!DISPLAY_DATE_RE.test(nextDate)) {
    throw new Error('Expected date in YYYY/M/D format');
  }

  const template = fs.readFileSync(templatePath, 'utf8');
  const match = template.match(LAST_UPDATED_RE);
  if (!match) {
    throw new Error('Could not find LAST_UPDATED_DATE in ' + templatePath);
  }

  const previousDate = match[1];
  const updated = template.replace(LAST_UPDATED_RE, "const LAST_UPDATED_DATE = '" + nextDate + "';");
  fs.writeFileSync(templatePath, updated);

  return { previousDate, nextDate };
}

if (require.main === module) {
  const nextDate = process.argv[2];
  const templatePath = process.argv[3] || path.join(__dirname, 'template.html');

  if (!nextDate) {
    console.error('Usage: node build/update-last-updated-date.js YYYY/M/D [template-path]');
    process.exit(1);
  }

  try {
    const result = updateTemplateLastUpdatedDate(templatePath, nextDate);
    console.log('Updated LAST_UPDATED_DATE from ' + result.previousDate + ' to ' + result.nextDate);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { updateTemplateLastUpdatedDate };
