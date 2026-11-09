/* Monthly figures use saved net postings, like the application's income summary. */
(function (root) {
  'use strict';
  function collect(period, documents, entriesForDocument, accountById) {
    const months = [];
    let year = Number(period.startDate.slice(0, 4)), month = Number(period.startDate.slice(5, 7));
    const end = period.endDate.slice(0, 7);
    while (`${year}-${String(month).padStart(2, '0')}` <= end) {
      months.push({ key: `${year}-${String(month).padStart(2, '0')}`, revenue: 0, expenses: 0, profit: 0 });
      if (++month > 12) { month = 1; year++; }
    }
    const byMonth = new Map(months.map(m => [m.key, m]));
    for (const doc of documents) {
      if (doc.date < period.startDate || doc.date > period.endDate || doc.periodId !== period.id) continue;
      const bucket = byMonth.get(String(doc.date || '').slice(0, 7));
      if (!bucket) continue;
      for (const entry of entriesForDocument(doc.id)) {
        const account = accountById(entry.accountId);
        if (!account) continue;
        const debit = Number(entry.amountDebit ?? (entry.debit ? entry.amount : 0)) || 0;
        const credit = Number(entry.amountCredit ?? (!entry.debit ? entry.amount : 0)) || 0;
        const cents = Math.round(credit * 100) - Math.round(debit * 100);
        if (Number(account.type) === 3) bucket.revenue += cents;
        if (Number(account.type) === 4) bucket.expenses -= cents;
      }
    }
    return months.map(m => ({ key: m.key, revenue: m.revenue / 100, expenses: m.expenses / 100, profit: (m.revenue - m.expenses) / 100 }));
  }
  const titles = { revenue: 'Liikevaihto kuukausittain', expenses: 'Kulut kuukausittain', profit: 'Tulos kuukausittain' };
  const annualTitles = { revenue: 'Liikevaihto vuosittain', expenses: 'Kulut vuosittain', profit: 'Voitto vuosittain' };
  function collectAnnual(periods, documentsForPeriod, entriesForDocument, accountForPeriod, startingBalances = () => ({})) {
    const dateLabel = date => date.split('-').reverse().join('.');
    const rows = periods.slice().sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate)).map(period => {
      const months = collect(period, documentsForPeriod(period.id), entriesForDocument, id => accountForPeriod(id, period.id));
      let revenue = months.reduce((sum, m) => sum + Math.round(m.revenue * 100), 0);
      let expenses = months.reduce((sum, m) => sum + Math.round(m.expenses * 100), 0);
      Object.entries(startingBalances(period.id)).forEach(([id, balance]) => {
        const account = accountForPeriod(Number(id), period.id);
        const cents = Math.round((Number(balance.credit) || 0) * 100) - Math.round((Number(balance.debit) || 0) * 100);
        if (Number(account?.type) === 3) revenue += cents;
        if (Number(account?.type) === 4) expenses -= cents;
      });
      const startYear = period.startDate.slice(0, 4), endYear = period.endDate.slice(0, 4);
      return { key: String(period.id), label: dateLabel(period.startDate) + ' – ' + dateLabel(period.endDate),
        tick: startYear === endYear ? startYear : startYear + '–' + endYear,
        revenue: revenue / 100, expenses: expenses / 100, profit: (revenue - expenses) / 100 };
    });
    const counts = new Map(), seen = new Map();
    rows.forEach(row => counts.set(row.tick, (counts.get(row.tick) || 0) + 1));
    rows.forEach(row => {
      const tick = row.tick;
      if (counts.get(tick) > 1) { seen.set(tick, (seen.get(tick) || 0) + 1); row.tick += ' (' + seen.get(tick) + ')'; }
    });
    return rows;
  }
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const euro = value => value.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const label = key => key.slice(5) + '/' + key.slice(0, 4);

  function render(months, kind, annual = false) {
    const title = (annual ? annualTitles : titles)[kind];
    const rowLabel = row => annual ? escape(row.label) : label(row.key);
    const tickLabel = row => annual ? escape(row.tick) : label(row.key);
    if (!title) throw new Error('Tuntematon kaavio');
    const width = Math.max(780, months.length * 65 + 100), height = 370;
    const left = 90, top = 35, bottom = 310, right = width - 20;
    const values = months.map(m => m[kind]);
    const max = Math.max(0, ...values), min = Math.min(0, ...values);
    const high = max > 0 ? max * 1.15 : (min < 0 ? 0 : 1);
    const low = min < 0 ? min * 1.15 : 0;
    const y = value => bottom - (value - low) / (high - low) * (bottom - top);
    const step = (right - left) / Math.max(1, months.length);
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}. Tarkat summat alla olevassa taulukossa." style="display:block;width:100%;min-width:680px;font:12px system-ui;background:white;color:#222"><title>${title}</title>`;
    for (let i = 0; i <= 4; i++) {
      const value = low + (high - low) * i / 4;
      svg += `<line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}" stroke="#ddd"/><text x="${left - 10}" y="${y(value) + 4}" text-anchor="end" fill="#555">${escape(value.toLocaleString('fi-FI', { maximumFractionDigits: 0 }))}</text>`;
    }
    svg += `<text x="${left - 10}" y="18" text-anchor="end" fill="#555">EUR</text><line x1="${left}" x2="${right}" y1="${y(0)}" y2="${y(0)}" stroke="#555"/>`;
    months.forEach((m, i) => {
      const value = m[kind], x = left + step * i + step / 2, barWidth = step * .6;
      const color = value < 0 ? '#be4354' : kind === 'expenses' ? '#b96c20' : '#287bb5';
      svg += `<rect x="${x - barWidth / 2}" y="${Math.min(y(0), y(value))}" width="${barWidth}" height="${Math.abs(y(value) - y(0))}" fill="${color}"><title>${rowLabel(m)}: ${escape(euro(value))}</title></rect>`;
      svg += `<text x="${x}" y="${value >= 0 ? y(value) - 7 : y(value) + 15}" text-anchor="middle" fill="#222">${escape(value.toLocaleString('fi-FI', { maximumFractionDigits: 0 }))}</text><text x="${x}" y="335" text-anchor="middle" fill="#444">${tickLabel(m)}</text>`;
    });
    svg += '</svg>';
    const total = Math.round(values.reduce((sum, v) => sum + Math.round(v * 100), 0)) / 100;
    return `<p><strong>Yhteensä: ${escape(euro(total))}</strong></p>` +
      (values.every(v => v === 0) ? '<p>Kaavion nettosummat ovat nollia. Kaikki ' + (annual ? 'tilikaudet' : 'kuukaudet') + ' näytetään nollina.</p>' : '') +
      `<div style="overflow-x:auto">${svg}</div><table><thead><tr><th scope="col">${annual ? 'Tilikausi' : 'Kuukausi'}</th><th scope="col" class="text-right">${title.replace(/ (kuukausittain|vuosittain)/, '')}</th></tr></thead><tbody>` +
      months.map(m => `<tr><th scope="row">${rowLabel(m)}</th><td class="text-right">${escape(euro(m[kind]))}</td></tr>`).join('') + '</tbody></table>';
  }
  root.MonthlyCharts = { collect, collectAnnual, render, titles, annualTitles, escape };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MonthlyCharts;
})(typeof window !== 'undefined' ? window : globalThis);
