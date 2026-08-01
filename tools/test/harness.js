'use strict';
/** Minimal zero-dependency test harness. */
const results = [];
let currentFile = '';

function setFile(f) { currentFile = f; }

function test(name, fn) {
  try {
    fn();
    results.push({ ok: true, name, file: currentFile });
  } catch (err) {
    results.push({ ok: false, name, file: currentFile, err });
  }
}

function eq(actual, expected, msg) {
  const a = typeof actual === 'string' ? actual : JSON.stringify(actual);
  const b = typeof expected === 'string' ? expected : JSON.stringify(expected);
  if (a !== b) {
    throw new Error(`${msg || 'not equal'}\n   actual: ${a}\n expected: ${b}`);
  }
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'expected truthy');
}

function throws(fn, re, msg) {
  let threw = null;
  try { fn(); } catch (e) { threw = e; }
  if (!threw) throw new Error(`${msg || 'expected a throw'} — nothing thrown`);
  if (re && !re.test(threw.message)) {
    throw new Error(`${msg || 'wrong error'}\n   got: ${threw.message}\n expected /${re.source}/`);
  }
}

function report() {
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? '  ok  ' : ' FAIL '} ${r.name}`);
    if (!r.ok) console.log(`        ${String(r.err.message).split('\n').join('\n        ')}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

module.exports = { test, eq, ok, throws, report, setFile };
