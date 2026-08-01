'use strict';
/** Runs every *.test.js in this directory. */
const fs = require('fs');
const path = require('path');
const harness = require('./harness');

const dir = __dirname;
const only = process.argv[2];
const files = fs.readdirSync(dir)
  .filter((f) => f.endsWith('.test.js'))
  .filter((f) => !only || f.includes(only))
  .sort();

for (const f of files) {
  console.log(`\n== ${f} ==`);
  require(path.join(dir, f));
}
harness.report();
