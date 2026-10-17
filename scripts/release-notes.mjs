// Prints the GitHub Release body for a version: its CHANGELOG.md section, then an Install block.
// Run: node scripts/release-notes.mjs 1.2.0 [--tags=1.2,1,latest]
// --tags lists the floating tags docker-publish.yml gave the image as well as the version.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const IMAGE = 'ghcr.io/demo-hub/libre-closet';

const args = process.argv.slice(2);
const tags = (args.find((a) => a.startsWith('--tags='))?.slice(7) ?? '')
  .split(',')
  .filter(Boolean);
const version = args.find((a) => !a.startsWith('--'))?.replace(/^v/, '');

function fail(message) {
  // ::error:: shows as an annotation on the workflow run.
  console.error(`::error::${message}`);
  process.exit(1);
}

if (
  !version ||
  !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version) ||
  args.some((a) => a.startsWith('--') && !a.startsWith('--tags='))
) {
  fail(
    `Usage: node scripts/release-notes.mjs X.Y.Z [--tags=X.Y,X,latest] (got "${args.join(' ')}")`,
  );
}

const lines = readFileSync(
  join(import.meta.dirname, '..', 'CHANGELOG.md'),
  'utf8',
).split('\n');

// Headings are "## [1.2.0] - 2026-10-15" or, in older entries, "## 0.5.0 - 2026-06-26".
const headingVersion = (line) =>
  line
    .slice(3)
    .trim()
    .split(/\s/)[0]
    .replace(/^\[(.*)\]$/, '$1');
const start = lines.findIndex(
  (line) => line.startsWith('## ') && headingVersion(line) === version,
);
if (start === -1)
  fail(
    `CHANGELOG.md has no "## [${version}]" section. Add it before tagging v${version}.`,
  );

let end = lines.findIndex(
  (line, i) => i > start && /^## |^\[[^\]]+\]: /.test(line),
);
if (end === -1) end = lines.length;

const section = lines
  .slice(start + 1, end)
  .map((line) => line.replace(/^#### /, '### '))
  .join('\n')
  .trim();
if (!section) fail(`The CHANGELOG.md section for ${version} is empty.`);

const list = (items) =>
  items
    .map((t) => `\`${t}\``)
    .join(', ')
    .replace(/, ([^,]*)$/, ' and $1');

console.log(`${section}

### Install

\`\`\`bash
docker pull ${IMAGE}:${version}
\`\`\`

The image is built for amd64 and arm64${tags.length ? `, and is also tagged ${list(tags)}` : ''}.`);
