/**
 * Parses Tilitin Java chart-of-accounts.txt format and outputs JS data.
 * Usage: node build-tilikarttamallit.js <path-to-chart-of-accounts.txt> [templateId] [templateName]
 * Example: node build-tilikarttamallit.js ../tilitin-1.5.0-src/tilikarttamallit/elinkeinotoiminta-24_extracted/chart-of-accounts.txt elinkeinotoiminta-24 "Elinkeinotoiminta (ALV 24%)"
 * Output is written to stdout; redirect to a file or paste into tilikarttamallit.js
 */

const fs = require('fs');
const path = require('path');

const VAT_RATE_MAP = [0, 22, 17, 8, 12, 9, 13, 23];

function fixMojibake(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/\u00C3\u00A4/g, '\u00E4')  // Ã¤ -> ä
    .replace(/\u00C3\u00B6/g, '\u00F6')  // Ã¶ -> ö
    .replace(/\u00C3\u00A5/g, '\u00E5')  // Ã¥ -> å
    .replace(/\u00C3\u0084/g, '\u00C4')  // Ã -> Ä
    .replace(/\u00C3\u0096/g, '\u00D6')  // Ã -> Ö
    .replace(/\u00C3\u0085/g, '\u00C5'); // Ã -> Å
}

function parseVatRate(v) {
  if (v == null || v === '') return 0;
  const s = String(v).trim();
  if (s.endsWith('%')) return parseFloat(s) || 0;
  const idx = parseInt(s, 10);
  if (idx >= 0 && idx < VAT_RATE_MAP.length) return VAT_RATE_MAP[idx];
  return parseFloat(s) || 0;
}

function parseChartOfAccounts(content) {
  const accounts = [];
  const headings = [];
  const vatByNumber = {};

  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('A;')) {
      const parts = line.slice(2).split(';');
      const number = (parts[0] || '').trim();
      const name = (parts[1] || '').trim();
      const type = parseInt(parts[2], 10) || 0;
      if (!number) continue;
      accounts.push({ number, name, type, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null });
    } else if (line.startsWith('H;')) {
      const parts = line.slice(2).split(';');
      const number = (parts[0] || '').trim();
      const text = (parts[1] || '').trim();
      const level = parseInt(parts[2], 10) || 0;
      if (number === '' && text === '') continue;
      headings.push({ number, text, level });
    } else if (line.startsWith('V;')) {
      const parts = line.slice(2).split(';');
      const accNum = (parts[0] || '').trim();
      const vatCode = parseInt(parts[1], 10) || 0;
      const vatRateRaw = (parts[2] || '').trim();
      const vatRate = parseVatRate(vatRateRaw);
      const vat1 = (parts[3] || '').trim() || null;
      const vat2 = (parts[4] || '').trim() || null;
      if (!accNum) continue;
      vatByNumber[accNum] = { vatCode, vatRate, vatAccount1Number: vat1 || null, vatAccount2Number: vat2 || null };
    }
  }

  accounts.forEach(a => {
    const v = vatByNumber[a.number];
    if (v) {
      a.vatCode = v.vatCode;
      a.vatRate = v.vatRate;
      a.vatAccount1Number = v.vatAccount1Number;
      a.vatAccount2Number = v.vatAccount2Number;
    }
  });

  accounts.forEach(a => { a.name = fixMojibake(a.name); });
  headings.forEach(h => { h.text = fixMojibake(h.text); });

  return { accounts, headings };
}

function escapeJsString(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '');
}

function toJsAccount(a) {
  const v1 = a.vatAccount1Number != null ? "'" + escapeJsString(a.vatAccount1Number) + "'" : 'null';
  const v2 = a.vatAccount2Number != null ? "'" + escapeJsString(a.vatAccount2Number) + "'" : 'null';
  return `    { number: '${escapeJsString(a.number)}', name: '${escapeJsString(a.name)}', type: ${a.type}, vatCode: ${a.vatCode}, vatRate: ${a.vatRate}, vatAccount1Number: ${v1}, vatAccount2Number: ${v2} }`;
}

function toJsHeading(h) {
  return `    { number: '${escapeJsString(h.number)}', text: '${escapeJsString(h.text)}', level: ${h.level} }`;
}

const args = process.argv.slice(2);
const filePath = args[0];
const templateId = args[1] || 'elinkeinotoiminta-24';
const templateName = args[2] || 'Elinkeinotoiminta (täysi KT, ALV 24%)';
const outPath = args[3] || null;

if (!filePath) {
  console.error('Usage: node build-tilikarttamallit.js <chart-of-accounts.txt> [templateId] [templateName]');
  process.exit(1);
}

const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
const buf = fs.readFileSync(fullPath);
let content;
if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
  content = buf.slice(3).toString('utf8');
} else if (buf[0] === 0xFF && buf[1] === 0xFE) {
  content = buf.slice(2).toString('utf16le');
} else if (buf[0] === 0xFE && buf[1] === 0xFF) {
  content = buf.slice(2).swap16().toString('utf16le');
} else {
  content = buf.toString('utf8');
  if (content.includes('Ã¤') || content.includes('Ã¶') || content.includes('Ã¥') || content.includes('Ã')) {
    content = Buffer.from(content, 'latin1').toString('utf8');
  }
}

const { accounts, headings } = parseChartOfAccounts(content);
const idSafe = templateId.replace(/-/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
const accountsVar = 'COA_' + idSafe.toUpperCase() + '_ACCOUNTS';
const headingsVar = 'COA_' + idSafe.toUpperCase() + '_HEADINGS';

const lines = [
  '(function (global) {',
  '  "use strict";',
  '  // Generated from ' + path.basename(path.dirname(fullPath)) + '/chart-of-accounts.txt',
  '  const ' + accountsVar + ' = [',
  accounts.map(toJsAccount).join(',\n'),
  '  ];',
  '',
  '  const ' + headingsVar + ' = [',
  headings.map(toJsHeading).join(',\n'),
  '  ];',
  '',
  '  if (global.Tilikarttamallit && global.Tilikarttamallit.registerTemplate) {',
  '    global.Tilikarttamallit.registerTemplate("' + templateId.replace(/"/g, '\\"') + '", "' + templateName.replace(/"/g, '\\"').replace(/\n/g, ' ') + '", ' + accountsVar + ', ' + headingsVar + ');',
  '  }',
  '})(typeof window !== "undefined" ? window : this);'
];
const output = lines.join('\n');

if (outPath) {
  const outFull = path.isAbsolute(outPath) ? outPath : path.join(process.cwd(), outPath);
  fs.writeFileSync(outFull, output, 'utf8');
  console.error('Wrote ' + accounts.length + ' accounts, ' + headings.length + ' headings to ' + outFull);
} else {
  console.log(output);
}
