'use strict';
/**
 * Fidelity test: every scroll expression in the original bundle must round-trip
 * through the config descriptor with identical numeric results, across every
 * device/viewport combination the original expressions branch on.
 */
const { test, eq, ok, throws, setFile } = require('./harness');
const { parseExpr, evalExpr, resolvePos } = require('../positions');
const { readStoryArrays } = require('../story');
const { SRC } = require('../paths');

setFile('positions');

const SECTIONS = [100, 150, 300, 300, 200, 300, 500, 200, 80, 80,
  170, 190, 280, 50, 50, 100, 140, 560, 200, 280];
const sectionSum = (k) => SECTIONS.slice(0, k + 1).reduce((a, b) => a + b, 0);

const CTXS = [];
for (const isMobile of [false, true]) {
  for (const isTablet of [false, true]) {
    for (const innerHeight of [1080, 800]) {
      CTXS.push({ sectionSum, isMobile, isTablet, innerHeight });
    }
  }
}

test('positions: parseExpr handles every documented term shape', () => {
  eq(parseExpr('e(16)+110+0+(t.value,0)'), { s: 16, base: 110 });
  eq(parseExpr('e(16)+140+(a?6:0)+(t.value?7:0)'), { s: 16, base: 140, mobile: 6, tablet: 7 });
  eq(parseExpr('e(0)-50/n+(a?30:0)'), { s: 0, half: -50, mobile: 30 });
  eq(parseExpr('e(5)+220/n+50/n'), { s: 5, half: 270 });
  eq(parseExpr('e(6)-240/n+50/n'), { s: 6, half: -190 });
  eq(parseExpr('e(11)+220-(l.value<850?40:0)'), { s: 11, base: 220, short: -40 });
  eq(parseExpr('e(15)+225-(a?50:0)-(t.value?70:0)'), { s: 15, base: 225, mobile: -50, tablet: -70 });
  eq(parseExpr('e(11)+100+60'), { s: 11, base: 160 });
});

test('positions: every original expression round-trips numerically', () => {
  const arrays = readStoryArrays(SRC.page);
  let checked = 0;
  for (const [name, arr] of Object.entries(arrays)) {
    arr.items.forEach((item, i) => {
      for (const key of ['scrollStart', 'scrollEnd', 'scrollStart2', 'scrollEnd2']) {
        const raw = item[key];
        if (raw === undefined) continue;
        const d = parseExpr(raw);
        for (const ctx of CTXS) {
          const a = evalExpr(raw, ctx);
          const b = resolvePos(d, ctx);
          if (a !== b) {
            throw new Error(
              `${name}[${i}].${key} = "${raw}"  mobile=${ctx.isMobile} ` +
              `tablet=${ctx.isTablet} h=${ctx.innerHeight}: original ${a} != descriptor ${b}`);
          }
          checked++;
        }
      }
    });
  }
  ok(checked >= 24 * 2 * CTXS.length, `expected many checks, got ${checked}`);
});

test('positions: unsupported terms throw instead of silently dropping', () => {
  throws(() => parseExpr('e(3)+someVar'), /unsupported scroll term/);
  throws(() => parseExpr('120+30'), /no e\(section\) term/);
  throws(() => parseExpr('e(1)+e(2)'), /two e\(\) terms/);
});
