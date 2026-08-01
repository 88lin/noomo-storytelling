'use strict';
/**
 * Every anchor's `find` string must occur in its source file exactly `expect`
 * times. This is the test that keeps the patch table honest: the original
 * config.js in this repo "worked" only because nothing verified that its
 * replacements ever matched anything.
 */
const fs = require('fs');
const { test, eq, ok, setFile } = require('./harness');
const { SRC } = require('../paths');
const { buildAnchors } = require('../anchors');
const { normalizeSite } = require('../assets');

setFile('anchors');

const site = normalizeSite(require('../../config/site'));

const files = {
  html: fs.readFileSync(SRC.html, 'utf8'),
  page: fs.readFileSync(SRC.page, 'utf8'),
  engine: fs.readFileSync(SRC.engine, 'utf8'),
};

function countOf(hay, needle) {
  let n = 0;
  let i = hay.indexOf(needle);
  while (i !== -1) { n += 1; i = hay.indexOf(needle, i + needle.length); }
  return n;
}

const anchors = buildAnchors(site);

test('anchors: table is non-trivial', () => {
  ok(anchors.length >= 40, `only ${anchors.length} anchors`);
});

for (const a of anchors) {
  test(`anchors: ${a.file}:${a.key} x${a.expect}`, () => {
    eq(countOf(files[a.file], a.find), a.expect,
      `find=${JSON.stringify(a.find.slice(0, 100))}`);
  });
}

test('anchors: no find-string is contained in another for the same file', () => {
  for (const a of anchors) {
    for (const b of anchors) {
      if (a === b || a.file !== b.file || a.find === b.find) continue;
      ok(!b.find.includes(a.find),
        `${a.key} find is contained in ${b.key} find (${a.file})`);
    }
  }
});

test('anchors: applying the table leaves no original string behind', () => {
  const out = { ...files };
  for (const a of anchors) out[a.file] = out[a.file].split(a.find).join(a.replace);
  for (const a of anchors) {
    if (a.find === a.replace) continue;
    eq(countOf(out[a.file], a.find), 0, `${a.key} survived the patch`);
  }
});
