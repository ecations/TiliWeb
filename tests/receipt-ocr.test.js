const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse, parseAmount } = require('../js/receipt-ocr.js');

test('Finnish receipt: gross total, transaction date and description', () => {
  const result = parse('RAUTAKAUPPA OY\n18.10.2026 12:34\nRuuvit 12,50\nMaali 30,00\nYHTEENSÄ 42,50\nALV 25,5% 8,64\nKÄTEINEN 50,00\nVAIHTORAHA 7,50');
  assert.equal(result.date, '2026-10-18');
  assert.equal(result.amount, 42.5);
  assert.equal(result.vatAmount, 8.64);
  assert.equal(result.description, 'RAUTAKAUPPA OY – Ruuvit, Maali');
  assert.deepEqual(result.warnings, []);
});

test('VAT amounts are read from explicit totals and per-rate breakdowns, never from the rate alone', () => {
  assert.equal(parse('YHTEENSÄ 125,50\nALV 25,5% 25,50').vatAmount, 25.5);
  assert.equal(parse('YHTEENSÄ 125,50\nALV yhteensä 25,50').vatAmount, 25.5);
  assert.equal(parse('YHTEENSÄ 125,50\nALV yhteensä\n25,50 EUR').vatAmount, 25.5);
  assert.equal(parse('YHTEENSÄ 239,50\nALV 25,5% 25,50\nALV 14% 14,00\nALV yhteensä 39,50').vatAmount, 39.5);
  assert.equal(parse('YHTEENSÄ 239,50\nALV 25,5% 25,50\nALV 14% 14,00').vatAmount, 39.5);
  assert.equal(parse('YHTEENSÄ 100,00\nALV 0% 0,00').vatAmount, 0);
  assert.equal(parse('YHTEENSÄ 125,50\nALV 25,5%').vatAmount, null);
  assert.equal(parse('YHTEENSÄ 125,50').vatAmount, null);
});

test('VAT tables use the tax column regardless of column order and avoid double counting totals', () => {
  assert.equal(parse('YHTEENSÄ 239,50\nALV% Veroton ALV Verollinen\n25,5 100,00 25,50 125,50\n14 100,00 14,00 114,00\nYhteensä 200,00 39,50 239,50').vatAmount, 39.5);
  assert.equal(parse('YHTEENSÄ 125,50\n% Brutto Netto ALV\n25,5% 125,50 100,00 25,50').vatAmount, 25.5);
  assert.equal(parse('YHTEENSÄ 125,50\nALV% Veroton ALV Verollinen\n25,5 100,00 99,50 125,50').vatAmount, null);
});

test('uncertain, inconsistent, foreign currency and impossible VAT amounts remain unset', () => {
  for (const text of [
    'ALV yhteensä -1,00', 'ALV yhteensä 126,00', 'ALV yhteensä 125,50',
    'ALV yhteensä 25,50\nALV yhteensä 26,50',
    'ALV 25,5% 25,50\nALV yhteensä 26,00',
    'ALV 25,5% 25,50\nALV 14% 10,00 14,00',
    'ALV yhteensä 25,50 USD'
  ]) assert.equal(parse('YHTEENSÄ 125,50\n' + text).vatAmount, null, text);
});
test('calendar dates validated, including leap years and two-digit years', () => {
  assert.equal(parse('29.2.2024').date, '2024-02-29');
  assert.equal(parse('29.2.2025').date, '');
  assert.equal(parse('31.4.2026').date, '');
  assert.equal(parse('8/9/26').date, '2026-09-08');
  assert.equal(parse('2026-10-18').date, '2026-10-18');
  assert.equal(parse('18.10.2026\n18.10.2026').date, '2026-10-18');
  assert.equal(parse('18.10.2026\n19.10.2026').date, '');
  const choices = parse('18.10.2026\nEräpäivä 20.11.2026\n18.10.26\n31.2.2026');
  assert.equal(choices.date, '');
  assert.deepEqual(choices.dates, ['2026-10-18', '2026-11-20']);
  assert.deepEqual(parse('Ei päivämäärää').dates, []);
});
test('total parsing avoids tax, subtotal, change, negative and conflicting totals', () => {
  assert.equal(parse('YHTEENSÄ\n1 234,56 EUR').amount, 1234.56);
  assert.equal(parse('Välisumma 80,00\nALV YHTEENSÄ 20,00\nTOTAL 100.00').amount, 100);
  assert.equal(parse('Yhteensä 10,00\nYhteensä 20,00').amount, null);
  assert.equal(parse('Yhteensä -10,00').amount, null);
  assert.equal(parse('Yhteensä −10,00').amount, null);
  assert.equal(parse('Tuote 20,00\nALV 4,00').amount, null);
  assert.equal(parse('TOTAL 10.00 USD').amount, null);
  assert.equal(parse('Kortti 24,90').amount, 24.9);
  assert.equal(parse('YHTEENSA 24,90\nKATEINEN 30,00').amount, 24.9);
});
test('manual amounts reject invalid formats instead of silently truncating', () => {
  assert.equal(parseAmount('1 234,56'), 1234.56);
  assert.equal(parseAmount('12.5'), 12.5);
  for (const value of ['', '0', '-1', '1,234', '12abc', 'Infinity', '1.234,56']) assert.equal(parseAmount(value), null);
});
