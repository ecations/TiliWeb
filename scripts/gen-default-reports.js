const fs = require('fs');
const path = require('path');
const base = path.join(__dirname, '..', 'tilitin-1.5.0-src', 'tilikarttamallit', 'elinkeinotoiminta-24_extracted');
const ids = ['balance-sheet', 'balance-sheet-detailed', 'income-statement', 'income-statement-detailed'];
const out = {};
for (const id of ids) {
  const p = path.join(base, id + '.txt');
  out[id] = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n').trimEnd();
}
const code = '(function () {\n  \'use strict\';\n  window.TilitinDefaultReportStructures = ' + JSON.stringify(out) + ';\n})();\n';
fs.writeFileSync(path.join(__dirname, '..', 'js', 'tilitin-default-reports.js'), code, 'utf8');
console.log('Wrote js/tilitin-default-reports.js');
