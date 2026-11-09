const { test } = require('node:test');
const assert = require('node:assert/strict');
const { collect, collectAnnual, render } = require('../js/monthly-charts.js');

test('annual comparison sorts all periods, keeps same-year periods separate and includes opening balances', () => {
  const periods = [
    { id: 3, startDate: '2026-07-01', endDate: '2026-12-31' },
    { id: 1, startDate: '2024-07-01', endDate: '2025-06-30' },
    { id: 2, startDate: '2026-01-01', endDate: '2026-06-30' }
  ];
  const rows = collectAnnual(periods,
    id => [{ id, periodId: id, date: periods.find(p => p.id === id).startDate }],
    id => id === 3 ? [] : [{ accountId: 10, amountCredit: 100, amountDebit: 0 }],
    (id, periodId) => ({ type: id === 10 && periodId === 1 ? 3 : 4 }),
    id => id === 1 ? { 10: { credit: 50 }, 20: { debit: 200 } } : {});
  assert.deepEqual(rows.map(r => [r.key, r.revenue, r.expenses, r.profit]), [
    ['1', 150, 200, -50], ['2', 0, -100, 100], ['3', 0, 0, 0]
  ]);
  assert.deepEqual(rows.map(r => r.tick), ['2024–2025', '2026 (1)', '2026 (2)']);
  const html = render(rows, 'profit', true);
  assert.match(html, /Voitto vuosittain/);
  assert.match(html, /01.07.2024 – 30.06.2025/);
  assert.match(html, /Tilikausi/);
});

test('monthly net postings include reversals, empty months, partial periods and year changes', () => {
  const period = { id: 1, startDate: '2025-11-15', endDate: '2026-02-10' };
  const documents = [
    { id: 1, periodId: 1, date: '2025-11-20' }, { id: 2, periodId: 1, date: '2026-01-12' },
    { id: 3, periodId: 1, date: '2025-11-01' }, { id: 4, periodId: 1, date: '2026-02-11' },
    { id: 5, periodId: 2, date: '2025-11-20' }
  ];
  const entries = {
    1: [{ accountId: 3, amountCredit: 100, amountDebit: 0, vatAmount: 25.5 },
      { accountId: 3, amountDebit: 10, amountCredit: 0 },
      { accountId: 4, amountDebit: 30, amountCredit: 0 },
      { accountId: 0, amountDebit: 25.5, rowNumber: 100000 },
      { accountId: 99, amountCredit: 1000 }],
    2: [{ accountId: 3, debit: false, amount: 5 }, { accountId: 4, debit: true, amount: 15.11 },
      { accountId: 4, debit: false, amount: 2.01 }]
  };
  const result = collect(period, documents, id => { assert(id <= 2); return entries[id]; }, id => id === 99 ? null : { type: id });
  assert.deepEqual(result, [
    { key: '2025-11', revenue: 90, expenses: 30, profit: 60 },
    { key: '2025-12', revenue: 0, expenses: 0, profit: 0 },
    { key: '2026-01', revenue: 5, expenses: 13.1, profit: -8.1 },
    { key: '2026-02', revenue: 0, expenses: 0, profit: 0 }
  ]);
  assert.match(render(result, 'profit'), /[−-]8,10/);
  assert.match(render(result, 'profit'), /fill="#be4354"/);
});

test('empty fiscal year has twelve zero months and finite chart geometry', () => {
  const rows = collect({ id: 1, startDate: '2026-01-01', endDate: '2026-12-31' }, [], () => [], () => null);
  assert.equal(rows.length, 12);
  for (const kind of ['revenue', 'expenses', 'profit']) {
    const html = render(rows, kind);
    assert.match(html, /nollina/);
    assert.doesNotMatch(html, /NaN|Infinity/);
  }
});
