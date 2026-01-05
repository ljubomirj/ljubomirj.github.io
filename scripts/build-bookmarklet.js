const fs = require('fs');
const { spawnSync } = require('child_process');

const SRC_FILE = 'twitter-LJ-posts-archive-bookmarklet.js';
const OUT_FILE = 'twitter-LJ-posts-archive-bookmarklet.txt';

const src = fs.readFileSync(SRC_FILE, 'utf8');
const before = src.split('/* CREATE_BOOKMARKLET_COPY')[0];
const body = before.replace(/^javascript:\s*/i, '').trim();

function minifyPreserveStrings(code) {
  let out = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  let prevSpace = false;

  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        if (!prevSpace) {
          out += ' ';
          prevSpace = true;
        }
      }
      i += 1;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (inSingle || inDouble || inTemplate) {
      out += ch;
      if (ch === '\\') {
        if (i + 1 < code.length) {
          out += code[i + 1];
          i += 2;
          continue;
        }
      }
      if (inSingle && ch === "'") inSingle = false;
      else if (inDouble && ch === '"') inDouble = false;
      else if (inTemplate && ch === '`') inTemplate = false;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }

    if (/\s/.test(ch)) {
      if (!prevSpace) {
        out += ' ';
        prevSpace = true;
      }
      i += 1;
      continue;
    }

    if (ch === "'") inSingle = true;
    else if (ch === '"') inDouble = true;
    else if (ch === '`') inTemplate = true;

    out += ch;
    prevSpace = false;
    i += 1;
  }

  return out.trim();
}

const min = minifyPreserveStrings(body);
const one = 'javascript:' + min;

fs.writeFileSync(OUT_FILE, one);
try {
  spawnSync('pbcopy', { input: one });
} catch (e) {
  // Ignore clipboard failures on non-macOS.
}

console.log(`Copied to clipboard and saved to ${OUT_FILE}`);
console.log('Length:', one.length);
console.log('Preview:', one.slice(0, 120) + ' ... ' + one.slice(-40));
