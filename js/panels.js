/**
 * Tilitin - Modal panels (COA, Periods, Document types, Entry templates, Settings, Properties, Starting balances)
 */

(function () {
  'use strict';

  function openPanel(title, bodyHtml, footerButtons) {
    const container = document.getElementById('panelContainer');
    container.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'panel-overlay';
    overlay.innerHTML = '<div class="panel">' +
      '<div class="panel-title">' + title + '</div>' +
      '<div class="panel-body">' + bodyHtml + '</div>' +
      '<div class="panel-footer"></div></div>';
    const footer = overlay.querySelector('.panel-footer');
    if (footerButtons) footerButtons.forEach(b => footer.appendChild(b));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('.panel').addEventListener('click', (e) => e.stopPropagation());
    container.appendChild(overlay);
    return overlay;
  }

  function closePanel() {
    const overlay = document.querySelector('#panelContainer .panel-overlay');
    if (overlay) overlay.remove();
  }

  function refreshApp() {
    if (window.TilitinApp && window.TilitinApp.render) window.TilitinApp.render();
  }

  window.openBulkImportPanel = function () {
    const period = getPeriod();
    if (!period) { alert('Valitse tilikausi ensin.'); return; }
    const types = getDocumentTypes();
    if (!types.length) { alert('Lisää tositelaji ensin (Muokkaa → Muokkaa tositelajeja…).'); return; }
    const current = getSettings().documentTypeId;
    const typeOptions = types.map(t => {
      const range = (t.numberStart != null || t.numberEnd != null) ? ' (' + (t.numberStart ?? '') + '–' + (t.numberEnd ?? '') + ')' : '';
      return '<option value="' + t.id + '"' + (t.id === current ? ' selected' : '') + '>' + (t.name || '').replace(/</g, '&lt;') + range + '</option>';
    }).join('');
    const html = '<p class="text-muted">Tilikausi: ' + formatDate(period.startDate) + ' – ' + formatDate(period.endDate) + '</p>' +
      '<div class="form-group"><label>Tositelaji</label><select id="bulkImportDocType" class="form-control">' + typeOptions + '</select></div>' +
      '<div class="form-group"><label>Lisäys</label><div style="padding:2px 0">' +
      '<div style="margin-bottom:6px;display:flex;align-items:baseline;gap:6px"><input type="radio" name="bulkImportMode" value="end" checked id="bulkModeEnd" style="width:auto;flex-shrink:0"><label for="bulkModeEnd" style="display:inline;color:var(--text);font-size:inherit;margin:0;cursor:pointer">Lis\u00e4\u00e4 sarjan loppuun (oletus) \u2013 uudet tositteet saavat seuraavat numerot</label></div>' +
      '<div style="display:flex;align-items:baseline;gap:6px"><input type="radio" name="bulkImportMode" value="bydate" id="bulkModeByDate" style="width:auto;flex-shrink:0"><label for="bulkModeByDate" style="display:inline;color:var(--text);font-size:inherit;margin:0;cursor:pointer">Lis\u00e4\u00e4 p\u00e4iv\u00e4m\u00e4\u00e4r\u00e4n mukaan v\u00e4liin \u2013 siirt\u00e4\u00e4 olemassa olevien tositenumeroita</label></div>' +
      '</div></div>' +
      '<div class="form-group"><label>Viennit (CSV)</label><textarea id="bulkImportText" rows="12" class="form-control" placeholder="Päivä;Tili;Debet;Kredit;Selite\n' + period.startDate + ';1000;100;0;Kassa\n' + period.startDate + ';4000;0;100;Myynti\n\n' + period.startDate + ';1100;50;0;Pankki\n' + period.startDate + ';1300;0;50;Myyntisaaminen"></textarea></div>' +
      '<p class="text-muted" style="font-size:0.9em;">Erotin: puolipiste (;) tai pilkku. Ensimmäinen rivi voi olla otsikko (Päivä;Tili;Debet;Kredit;Selite). Tyhjä rivi = uusi tosite.</p>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn';
    closeBtn.textContent = 'Sulje';
    closeBtn.onclick = closePanel;
    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-primary';
    importBtn.textContent = 'Tuo';
    importBtn.onclick = function () {
      const rawText = document.getElementById('bulkImportText').value;
      const docTypeId = parseInt(document.getElementById('bulkImportDocType').value, 10);
      const docType = getDocumentTypeById(docTypeId);
      if (!docType) { alert('Valitse tositelaji.'); return; }
      const rawLines = String(rawText || '').split(/\r?\n/);
      const firstNonEmptyIndex = rawLines.findIndex(l => String(l || '').trim().length > 0);
      if (firstNonEmptyIndex < 0) { alert('Ei rivejä.'); return; }
      const firstLine = String(rawLines[firstNonEmptyIndex] || '').trim();
      const sep = firstLine.indexOf(';') >= 0 ? ';' : ',';
      const parseNum = (s) => { const n = parseFloat(String(s || '').trim().replace(',', '.')); return isNaN(n) ? 0 : n; };
      const isHeader = (parts) => {
        const p0 = (parts[0] || '').toLowerCase();
        return p0 === 'päivä' || p0 === 'date' || p0 === 'tili' || p0 === 'account' || p0 === 'debet' || p0 === 'debit';
      };
      let start = firstNonEmptyIndex;
      if (isHeader(firstLine.split(sep))) start = firstNonEmptyIndex + 1;
      const blocks = [];
      let block = [];
      for (let i = start; i < rawLines.length; i++) {
        const line = String(rawLines[i] || '').trim();
        if (line === '') {
          if (block.length) { blocks.push(block); block = []; }
          continue;
        }
        const parts = line.split(sep).map(p => (p || '').trim());
        if (parts.length < 2) continue;
        const date = (parts[0] || '').replace(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, '$3-$2-$1');
        const accNum = parts[1] || '';
        const debit = parseNum(parts[2]);
        const credit = parseNum(parts[3]);
        const desc = (parts[4] || '').trim();
        if (!accNum) continue;
        block.push({ date: date || period.startDate, accountNumber: accNum, debit, credit, description: desc, _line: line });
      }
      if (block.length) blocks.push(block);

      // Reject whole import if any row date is outside current period.
      const outOfBoundsLines = [];
      for (let b = 0; b < blocks.length; b++) {
        const rows = blocks[b];
        for (let r = 0; r < rows.length; r++) {
          const d = rows[r].date;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d))) continue;
          if (d < period.startDate || d > period.endDate) outOfBoundsLines.push(rows[r]._line || '');
        }
      }
      if (outOfBoundsLines.length) {
        const header = 'Päivä;Tili;Debet;Kredit;Selite';
        alert(
          'Tuonti hylätty: CSV sisältää päivämääriä, jotka eivät kuulu tilikauteen ' +
          period.startDate + ' – ' + period.endDate + '.\n\n' +
          'Hylätyt rivit:\n' +
          header + '\n' +
          outOfBoundsLines.join('\n')
        );
        return;
      }

      const bulkMode = (document.querySelector('input[name="bulkImportMode"]:checked') || {}).value || 'end';
      var existing = getDocumentsForDocType(period.id, docTypeId);
      const accounts = getAccounts();
      let created = 0;
      let errors = [];
      const baseStart = (docType.numberStart != null ? parseInt(docType.numberStart, 10) : 1) || 1;
      const endLimit = (docType.numberEnd != null && docType.numberEnd !== '') ? parseInt(docType.numberEnd, 10) : null;

      if (bulkMode === 'bydate') {
        var existingNums = existing.map(d => parseInt(d.number, 10)).filter(n => !isNaN(n));
        var baseNum = existingNums.length ? Math.min.apply(null, existingNums) : baseStart;
        var merged = [];
        existing.forEach(function (d) {
          merged.push({ type: 'existing', doc: d, date: d.date || '', num: parseInt(d.number, 10) });
        });
        blocks.forEach(function (blk, idx) {
          if (blk.length === 0) return;
          var d = blk[0].date && /^\d{4}-\d{2}-\d{2}$/.test(blk[0].date) ? blk[0].date : period.startDate;
          merged.push({ type: 'new', block: blk, date: d, blockIndex: idx });
        });
        merged.sort(function (a, b) {
          var c = (a.date || '').localeCompare(b.date || '');
          if (c !== 0) return c;
          if (a.type === 'existing' && b.type === 'existing') return (a.num || 0) - (b.num || 0);
          if (a.type === 'existing') return -1;
          if (b.type === 'existing') return 1;
          return a.blockIndex - b.blockIndex;
        });
        var totalCount = merged.length;
        if (endLimit != null && !isNaN(endLimit) && baseNum + totalCount - 1 > endLimit) {
          alert('Tositenumerot ylittäisivät tositelajin numerovälin (' + (docType.numberStart ?? '') + '–' + (docType.numberEnd ?? '') + ').');
          return;
        }
        for (var m = 0; m < merged.length; m++) {
          var item = merged[m];
          var num = baseNum + m;
          if (item.type === 'existing') {
            if (item.doc.number !== num) {
              item.doc.number = num;
              saveDocument(item.doc);
            }
          } else {
            var rows = item.block;
            var docDate = rows[0].date && /^\d{4}-\d{2}-\d{2}$/.test(rows[0].date) ? rows[0].date : period.startDate;
            var doc = {
              id: null,
              periodId: period.id,
              documentTypeId: docTypeId,
              number: num,
              date: docDate
            };
            saveDocument(doc);
            var savedDoc = getDocumentById(doc.id);
            if (!savedDoc) { errors.push('Tosite ' + num + ' tallennus epäonnistui'); continue; }
            for (var r = 0; r < rows.length; r++) {
              var row = rows[r];
              var acc = getAccountByNumber(row.accountNumber);
              if (!acc) { errors.push('Tiliä ei löydy: ' + row.accountNumber); continue; }
              saveEntry({
                id: null,
                documentId: savedDoc.id,
                accountId: acc.id,
                amountDebit: row.debit,
                amountCredit: row.credit,
                description: row.description,
                rowNumber: r,
                flags: 0
              });
            }
            created++;
          }
        }
      } else {
        var nextNum = baseStart;
        if (existing.length) {
          var maxN = Math.max.apply(null, existing.map(function (d) { return parseInt(d.number, 10) || 0; }));
          nextNum = (isFinite(maxN) ? maxN : baseStart - 1) + 1;
        }
        if (endLimit != null && !isNaN(endLimit) && nextNum + blocks.filter(function (b) { return b.length > 0; }).length - 1 > endLimit) {
          alert('Tositenumerot ylittäisivät tositelajin numerovälin (' + (docType.numberStart ?? '') + '–' + (docType.numberEnd ?? '') + ').');
          return;
        }
        for (var b = 0; b < blocks.length; b++) {
          var rows = blocks[b];
          if (rows.length === 0) continue;
          var docDate = rows[0].date && /^\d{4}-\d{2}-\d{2}$/.test(rows[0].date) ? rows[0].date : period.startDate;
          var doc = {
            id: null,
            periodId: period.id,
            documentTypeId: docTypeId,
            number: nextNum,
            date: docDate
          };
          saveDocument(doc);
          var savedDoc = getDocumentById(doc.id);
          if (!savedDoc) { errors.push('Tosite ' + nextNum + ' tallennus epäonnistui'); nextNum++; continue; }
          for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            var acc = getAccountByNumber(row.accountNumber);
            if (!acc) { errors.push('Tiliä ei löydy: ' + row.accountNumber); continue; }
            saveEntry({
              id: null,
              documentId: savedDoc.id,
              accountId: acc.id,
              amountDebit: row.debit,
              amountCredit: row.credit,
              description: row.description,
              rowNumber: r,
              flags: 0
            });
          }
          created++;
          nextNum++;
        }
      }
      const s = getSettings();
      s.documentTypeId = docTypeId;
      saveSettings(s);
      closePanel();
      var firstNewNumber = bulkMode === 'end' && created > 0
        ? (nextNum - created)
        : undefined;
      if (window.TilitinApp && window.TilitinApp.reloadDocuments) window.TilitinApp.reloadDocuments(firstNewNumber);
      if (errors.length) alert('Tuo valmis. Varoitukset:\n' + errors.slice(0, 10).join('\n') + (errors.length > 10 ? '\n…' : ''));
      else if (created > 0) alert('Tuotu ' + created + ' tositetta.');
    };
    const overlay = openPanel('Luo useita tositteita kerralla', html, [importBtn, closeBtn]);
  };

  /**
   * Valitse, mihin uusi tosite lisätään: sarjan loppuun vai nykyisen jälkeen.
   * onChoice(mode): mode = 'end' | 'after' | 'cancel'
   */
  window.openNewDocumentInsertChoice = function (onChoice) {
    const period = getPeriod();
    const settings = getSettings ? getSettings() : null;
    const docTypeId = settings && settings.documentTypeId != null ? settings.documentTypeId : null;
    const docType = (typeof getDocumentTypeById === 'function' && docTypeId != null)
      ? getDocumentTypeById(docTypeId)
      : null;
    const periodText = period ? (formatDate(period.startDate) + ' – ' + formatDate(period.endDate)) : '';
    const docTypeName = docType ? (docType.name || '') : '';
    const html =
      '<p>Et ole viimeisessä tositteessa.</p>' +
      (docTypeName ? '<p><strong>Tositelaji:</strong> ' + docTypeName.replace(/</g, '&lt;') + '</p>' : '') +
      (periodText ? '<p class="text-muted">Tilikausi: ' + periodText + '</p>' : '') +
      '<p>Valitse, mihin uusi tosite lisätään:</p>' +
      '<ul>' +
      '<li><strong>Lisää sarjan loppuun</strong> – suositus, ei siirrä olemassa olevien tositteiden numeroita.</li>' +
      '<li><strong>Lisää nykyisen jälkeen</strong> – lisää väliin ja siirtää myöhempien tositteiden numeroita yhdellä.</li>' +
      '</ul>';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'btn';
    btnCancel.textContent = 'Peruuta';
    btnCancel.onclick = function () {
      closePanel();
      if (typeof onChoice === 'function') onChoice('cancel');
    };

    const btnAfter = document.createElement('button');
    btnAfter.className = 'btn';
    btnAfter.textContent = 'Lisää nykyisen jälkeen';
    btnAfter.onclick = function () {
      closePanel();
      if (typeof onChoice === 'function') onChoice('after');
    };

    const btnEnd = document.createElement('button');
    btnEnd.className = 'btn btn-primary';
    btnEnd.textContent = 'Lisää sarjan loppuun (suositus)';
    btnEnd.onclick = function () {
      closePanel();
      if (typeof onChoice === 'function') onChoice('end');
    };

    openPanel('Uusi tosite', html, [btnEnd, btnAfter, btnCancel]);
  };

  /**
   * Muuta tositenumeroita – shift document numbers in a range (like original Tilitin).
   * Documents with number in [start, end] get number += shift. Validates no conflict and number >= 1.
   */
  window.openDocumentNumberShiftPanel = function () {
    const period = getPeriod();
    if (!period) { alert('Valitse tilikausi ensin.'); return; }
    const documents = getDocuments(period.id, null);
    const numberSet = {};
    let maxNumber = 0;
    documents.forEach(function (d) {
      const n = parseInt(d.number, 10);
      if (!isNaN(n)) {
        numberSet[n] = true;
        if (n > maxNumber) maxNumber = n;
      }
    });
    const startDefault = 1;
    const endDefault = maxNumber || 1;
    const html = '<p class="text-muted">Tilikausi: ' + formatDate(period.startDate) + ' – ' + formatDate(period.endDate) + '</p>' +
      '<div class="form-group form-inline">' +
      '<label>Alkaa</label> <input type="number" id="numberShiftStart" min="1" value="' + startDefault + '" class="form-control" style="width:80px"> ' +
      '<label style="margin-left:12px">Päättyy</label> <input type="number" id="numberShiftEnd" min="1" value="' + endDefault + '" class="form-control" style="width:80px"> ' +
      '<label style="margin-left:12px">Muutos</label> <input type="number" id="numberShiftDelta" value="1" class="form-control" style="width:80px" placeholder="+/-">' +
      '</div>' +
      '<p class="text-muted" style="font-size:0.9em;">Tositteet numerovälillä Alkaa–Päättyy siirretään Muutos-arvolla. Esim. Muutos 3: 5→8, 6→9, 7→10. Positiivinen muutos: uudet numerot oltava &gt; Päättyy. Negatiivinen: uudet numerot oltava &lt; Alkaa.</p>' +
      '<div id="numberShiftPreview" class="form-control" style="min-height:120px; max-height:200px; overflow:auto; font-family:monospace; white-space:pre-wrap;"></div>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn';
    closeBtn.textContent = 'Peruuta';
    closeBtn.onclick = closePanel;
    const okBtn = document.createElement('button');
    okBtn.className = 'btn btn-primary';
    okBtn.textContent = 'OK';
    okBtn.id = 'numberShiftOk';
    const overlay = openPanel('Muuta tositenumeroita', html, [okBtn, closeBtn]);
    const previewEl = document.getElementById('numberShiftPreview');
    const startEl = document.getElementById('numberShiftStart');
    const endEl = document.getElementById('numberShiftEnd');
    const deltaEl = document.getElementById('numberShiftDelta');

    function updatePreview() {
      const start = parseInt(startEl.value, 10);
      const end = parseInt(endEl.value, 10);
      const shift = parseInt(deltaEl.value, 10);
      if (isNaN(start) || isNaN(end) || isNaN(shift)) {
        previewEl.textContent = 'Syötä kelvolliset luvut.';
        okBtn.disabled = true;
        return;
      }
      const docsInRange = documents.filter(function (d) {
        const n = parseInt(d.number, 10);
        return !isNaN(n) && n >= start && n <= end;
      }).sort(function (a, b) { return (a.number || 0) - (b.number || 0); });
      if (docsInRange.length === 0) {
        previewEl.textContent = 'Ei tositteita välillä ' + start + '–' + end + '.';
        okBtn.disabled = true;
        return;
      }
      let hasConflict = false;
      const lines = [];
      docsInRange.forEach(function (doc) {
        const oldNum = parseInt(doc.number, 10);
        const newNum = oldNum + shift;
        let conflict = newNum < 1;
        if (!conflict && shift > 0 && start + shift <= end) conflict = true;
        if (!conflict && shift < 0 && end + shift >= start) conflict = true;
        if (!conflict && numberSet[newNum] && !docsInRange.some(function (d) { return parseInt(d.number, 10) === newNum; })) conflict = true;
        if (conflict) hasConflict = true;
        lines.push({ text: '(' + oldNum + ' → ' + newNum + ')', conflict: conflict });
      });
      previewEl.innerHTML = '';
      lines.forEach(function (line) {
        const span = document.createElement('span');
        span.textContent = line.text + ' ';
        if (line.conflict) {
          span.style.backgroundColor = '#c00';
          span.style.color = '#fff';
          span.style.padding = '1px 4px';
        }
        previewEl.appendChild(span);
      });
      okBtn.disabled = hasConflict || shift === 0;
    }

    startEl.addEventListener('input', updatePreview);
    startEl.addEventListener('change', updatePreview);
    endEl.addEventListener('input', updatePreview);
    endEl.addEventListener('change', updatePreview);
    deltaEl.addEventListener('input', updatePreview);
    deltaEl.addEventListener('change', updatePreview);
    updatePreview();

    okBtn.onclick = function () {
      const start = parseInt(startEl.value, 10);
      const end = parseInt(endEl.value, 10);
      const shift = parseInt(deltaEl.value, 10);
      if (isNaN(start) || isNaN(end) || isNaN(shift) || shift === 0) return;
      const docsInRange = documents.filter(function (d) {
        const n = parseInt(d.number, 10);
        return !isNaN(n) && n >= start && n <= end;
      });
      let hasConflict = false;
      docsInRange.forEach(function (doc) {
        const newNum = parseInt(doc.number, 10) + shift;
        if (newNum < 1) hasConflict = true;
        if (shift > 0 && start + shift <= end) hasConflict = true;
        if (shift < 0 && end + shift >= start) hasConflict = true;
        if (numberSet[newNum] && !docsInRange.some(function (d) { return parseInt(d.number, 10) === newNum; })) hasConflict = true;
      });
      if (hasConflict) { alert('Konflikti: tarkista esikatselu.'); return; }
      docsInRange.forEach(function (doc) {
        doc.number = parseInt(doc.number, 10) + shift;
        saveDocument(doc);
      });
      closePanel();
      if (window.TilitinApp && window.TilitinApp.reloadDocuments) window.TilitinApp.reloadDocuments();
      refreshApp();
    };
  };

  window.openCOAPanel = function () {
    const showFavouritesOnly = typeof window._coaShowFavouritesOnly === 'boolean' ? window._coaShowFavouritesOnly : false;
    let accounts = getAccounts();
    if (showFavouritesOnly) accounts = accounts.filter(a => (a.flags || 0) & 1);
    const headings = getCOAHeadings();
    const typeNames = (typeof Tilikarttamallit !== 'undefined' && Tilikarttamallit.ACCOUNT_TYPE_NAMES) ? Tilikarttamallit.ACCOUNT_TYPE_NAMES : ['Vastaavaa', 'Vastattavaa', 'Oma pääoma', 'Tulot', 'Menot', 'Edellisten tilikausien voitto', 'Tilikauden voitto'];
    const vatCodeNames = (typeof Tilikarttamallit !== 'undefined' && Tilikarttamallit.VAT_CODE_NAMES) ? Tilikarttamallit.VAT_CODE_NAMES : [];
    const allAccounts = getAccounts();
    const defaultAccountId = getDefaultAccountId();

    const items = [];
    accounts.forEach(a => items.push({ type: 'account', number: (a.number || '').toString(), account: a }));
    headings.forEach(h => items.push({ type: 'heading', number: (h.number || '').toString(), level: h.level || 0, heading: h }));
    items.sort((a, b) => {
      const na = a.number || '';
      const nb = b.number || '';
      const numA = parseInt(na, 10);
      const numB = parseInt(nb, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return na.localeCompare(nb);
    });

    const vatHasRateAndAccount = [4, 5, 9, 11];
    function getAccountDisplay(accId) {
      if (!accId) return '—';
      const acc = allAccounts.find(function(a) { return a.id === accId; });
      return acc ? (acc.number || '') + ' ' + (acc.name || '') : '—';
    }

    let html = '<p class="coa-toolbar">';
    html += '<button type="button" class="btn btn-primary" id="btnAddAccount">Lisää tili</button> ';
    html += '<button type="button" class="btn btn-primary" id="btnAddHeading">Lisää otsikko</button> ';
    html += '<label class="coa-filter-fav"><input type="checkbox" id="coaShowFavouritesOnly" ' + (showFavouritesOnly ? 'checked' : '') + '> Näytä vain suosikkitilit</label>';
    html += '</p>';
    html += '<div class="coa-table-wrap"><table class="data-table coa-table"><thead><tr>';
    html += '<th>Nro</th><th>Nimi / Otsikko</th><th>Tyyppi</th><th>ALV-koodi</th><th>ALV %</th><th>ALV-vastatili</th><th>Suosikki</th><th>Oletusvastatili</th><th>Toiminnot</th></tr></thead><tbody>';

    items.forEach(item => {
      if (item.type === 'heading') {
        const h = item.heading;
        const pad = '&nbsp;'.repeat((item.level || 0) * 2);
        const lvl = h.level != null ? h.level : 0;
        html += '<tr class="coa-heading-row" data-heading-id="' + h.id + '">';
        html += '<td><input type="text" value="' + (h.number || '').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '" class="coa-h-num" size="6"></td>';
        html += '<td colspan="2"><strong>' + pad + '</strong><input type="text" value="' + (h.text || '').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '" class="coa-h-text" placeholder="Otsikko"></td>';
        html += '<td><span class="coa-picker" data-picker="h-level" data-value="' + lvl + '" role="button" tabindex="0">Taso ' + lvl + '</span></td>';
        html += '<td colspan="4"></td>';
        html += '<td><button type="button" class="btn btn-danger btn-delete-heading">Poista otsikko</button></td></tr>';
      } else {
        const a = item.account;
        const vatCode = a.vatCode != null ? a.vatCode : 0;
        const canVatRate = vatHasRateAndAccount.indexOf(vatCode) >= 0;
        const vatAccountId = a.vatAccount1Id || 0;
        const typeLabel = (typeNames[a.type] != null) ? typeNames[a.type] : typeNames[0];
        const vatCodeLabel = (vatCodeNames[vatCode] != null) ? vatCodeNames[vatCode] : '---';
        html += '<tr data-id="' + a.id + '" class="coa-account-row"><td><input type="text" value="' + (a.number || '').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '" class="coa-number" size="6"></td>';
        html += '<td><input type="text" value="' + (a.name || '').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '" class="coa-name" placeholder="Tilin nimi"></td>';
        html += '<td><span class="coa-picker" data-picker="type" data-value="' + a.type + '" role="button" tabindex="0">' + (typeLabel || '').replace(/</g, '&lt;') + '</span></td>';
        html += '<td><span class="coa-picker" data-picker="vat-code" data-value="' + vatCode + '" role="button" tabindex="0">' + (vatCodeLabel || '---').replace(/</g, '&lt;') + '</span></td>';
        html += '<td><input type="number" value="' + (a.vatRate != null ? a.vatRate : '') + '" class="coa-vat-rate" min="0" max="100" step="0.01" size="4" placeholder="%"></td>';
        html += '<td><span class="coa-picker" data-picker="vat-account" data-value="' + vatAccountId + '" role="button" tabindex="0">' + getAccountDisplay(vatAccountId).replace(/</g, '&lt;') + '</span></td>';
        html += '<td><input type="checkbox" class="coa-favourite" ' + ((a.flags || 0) & 1 ? 'checked' : '') + ' title="Suosikkitili"></td>';
        html += '<td><input type="checkbox" class="coa-default-account" ' + (a.id === defaultAccountId ? 'checked' : '') + ' title="Oletusvastatili"></td>';
        html += '<td><button type="button" class="btn btn-save-coa">Tallenna</button> <button type="button" class="btn btn-danger btn-delete-coa">Poista tili</button></td></tr>';
      }
    });
    html += '</tbody></table></div>';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn';
    closeBtn.textContent = 'Sulje';
    closeBtn.onclick = closePanel;
    const overlay = openPanel('Tilikartta', html, [closeBtn]);
    overlay.querySelector('.panel').classList.add('panel-coa');

    function openCoaPicker(pickerEl, kind, options, currentValue) {
      const showFilter = kind === 'vat-account' && options.length > 15;
      const isAccountPicker = kind === 'vat-account';
      window.TilitinPicker.open(pickerEl, 'Valitse', options, function (value, label) {
        pickerEl.setAttribute('data-value', value);
        pickerEl.textContent = label;
        if (kind === 'vat-code') {
          const tr = pickerEl.closest('tr');
          if (tr) {
            const rateInp = tr.querySelector('.coa-vat-rate');
            if (rateInp) rateInp.disabled = false;
          }
        }
      }, {
        showFilter: showFilter,
        showFavouritesFilter: isAccountPicker,
        onToggleFavourite: isAccountPicker ? function (accountId, isFavourite) {
          const acc = getAccountById(accountId);
          if (!acc) return;
          let f = acc.flags || 0;
          if (isFavourite) f |= 1; else f &= ~1;
          acc.flags = f;
          saveAccount(acc);
        } : undefined
      });
    }

    overlay.querySelector('.coa-table-wrap').addEventListener('click', function (e) {
      const picker = e.target.closest('.coa-picker');
      if (!picker || picker.classList.contains('coa-picker-disabled')) return;
      e.preventDefault();
      const kind = picker.getAttribute('data-picker');
      const current = picker.getAttribute('data-value');
      if (kind === 'type') {
        const opts = [];
        for (let i = 0; i <= 5; i++) opts.push({ value: i, label: typeNames[i] || '' });
        openCoaPicker(picker, kind, opts, current);
      } else if (kind === 'vat-code') {
        const opts = [{ value: 0, label: '---' }];
        vatCodeNames.forEach(function (n, i) { if (i > 0) opts.push({ value: i, label: n || '---' }); });
        openCoaPicker(picker, kind, opts, current);
      } else if (kind === 'vat-account') {
        const opts = [{ value: 0, label: '—' }];
        allAccounts.forEach(function (acc) {
          opts.push({ value: acc.id, label: (acc.number || '') + ' ' + (acc.name || ''), favourite: !!(acc.flags & 1) });
        });
        openCoaPicker(picker, kind, opts, current);
      } else if (kind === 'h-level') {
        const opts = [];
        for (let i = 0; i <= 5; i++) opts.push({ value: i, label: 'Taso ' + i });
        openCoaPicker(picker, kind, opts, current);
      }
    });
    overlay.querySelector('.coa-table-wrap').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const picker = e.target.closest('.coa-picker');
      if (picker) { e.preventDefault(); picker.click(); }
    });

    overlay.querySelector('#coaShowFavouritesOnly').onchange = function () {
      window._coaShowFavouritesOnly = this.checked;
      window.openCOAPanel();
    };

    overlay.querySelectorAll('.coa-default-account').forEach(cb => {
      cb.onchange = function () {
        if (!this.checked) return;
        const tr = this.closest('tr');
        const id = tr.dataset.id ? parseInt(tr.dataset.id, 10) : null;
        if (id != null) setDefaultAccountId(id);
        overlay.querySelectorAll('.coa-default-account').forEach(other => { if (other !== cb) other.checked = false; });
        refreshApp();
      };
    });

    overlay.querySelectorAll('.btn-save-coa').forEach(btn => {
      btn.onclick = function () {
        const tr = this.closest('tr');
        if (!tr || !tr.dataset.id) return;
        const id = parseInt(tr.dataset.id, 10);
        const acc = getAccountById(id) || {};
        acc.id = id;
        acc.number = tr.querySelector('.coa-number').value.trim();
        acc.name = tr.querySelector('.coa-name').value.trim();
        const typePick = tr.querySelector('.coa-picker[data-picker="type"]');
        const vatCodePick = tr.querySelector('.coa-picker[data-picker="vat-code"]');
        const vatAccountPick = tr.querySelector('.coa-picker[data-picker="vat-account"]');
        acc.type = typePick ? parseInt(typePick.getAttribute('data-value'), 10) : 0;
        acc.vatCode = vatCodePick ? parseInt(vatCodePick.getAttribute('data-value'), 10) : 0;
        const rateInput = tr.querySelector('.coa-vat-rate');
        acc.vatRate = rateInput ? (parseFloat(rateInput.value) || 0) : 0;
        acc.vatAccount1Id = vatAccountPick ? (parseInt(vatAccountPick.getAttribute('data-value'), 10) || 0) : 0;
        acc.vatAccount2Id = acc.vatAccount2Id || 0;
        let flags = acc.flags || 0;
        if (tr.querySelector('.coa-favourite').checked) flags |= 1; else flags &= ~1;
        acc.flags = flags;
        saveAccount(acc);
        refreshApp();
      };
    });

    overlay.querySelectorAll('.btn-delete-coa').forEach(btn => {
      btn.onclick = function () {
        if (!confirm('Poistetaan tili?')) return;
        const tr = this.closest('tr');
        const id = parseInt(tr.dataset.id, 10);
        if (id) { deleteAccount(id); tr.remove(); }
        refreshApp();
      };
    });

    overlay.querySelectorAll('.btn-delete-heading').forEach(btn => {
      btn.onclick = function () {
        if (!confirm('Poistetaan otsikko?')) return;
        const tr = this.closest('tr');
        const id = parseInt(tr.dataset.headingId, 10);
        if (id) { deleteCOAHeading(id); tr.remove(); }
        refreshApp();
      };
    });

    overlay.querySelectorAll('.coa-heading-row').forEach(tr => {
      const saveHeading = function () {
        const id = parseInt(tr.dataset.headingId, 10);
        const h = getCOAHeadings().find(x => x.id === id) || {};
        h.id = id;
        h.number = tr.querySelector('.coa-h-num').value.trim();
        h.text = tr.querySelector('.coa-h-text').value.trim();
        const levelPick = tr.querySelector('.coa-picker[data-picker="h-level"]');
        h.level = levelPick ? (parseInt(levelPick.getAttribute('data-value'), 10) || 0) : 0;
        saveCOAHeading(h);
        refreshApp();
      };
      tr.querySelector('.coa-h-num').onblur = saveHeading;
      tr.querySelector('.coa-h-text').onblur = saveHeading;
    });

    overlay.querySelector('#btnAddAccount').onclick = function () {
      saveAccount({ number: '', name: '', type: 0, vatCode: 0, vatRate: 0, vatAccount1Id: 0, vatAccount2Id: 0, flags: 0 });
      window.openCOAPanel();
    };

    overlay.querySelector('#btnAddHeading').onclick = function () {
      saveCOAHeading({ number: '', text: '', level: 0 });
      window.openCOAPanel();
    };
  };

  window.openTilikarttamalliPanel = function () {
    if (typeof Tilikarttamallit === 'undefined') {
      alert('Tilikarttamalleja ei ole ladattu.');
      return;
    }
    const templates = Tilikarttamallit.getTemplateList();
    if (!templates.length) {
      alert('Tilikarttamalleja ei ole määritelty.');
      return;
    }
    let html = '<p>Valitse tilikarttamalli. Nykyinen tilikartta (tilit ja otsikot) korvataan valitulla mallilla.</p>';
    html += '<ul class="coa-template-list">';
    templates.forEach(t => {
      html += '<li><label><input type="radio" name="coa_template" value="' + t.id + '"> ' + (t.name || t.id) + '</label></li>';
    });
    html += '</ul>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn';
    closeBtn.textContent = 'Peruuta';
    closeBtn.onclick = closePanel;
    const loadBtn = document.createElement('button');
    loadBtn.className = 'btn btn-primary';
    loadBtn.textContent = 'Lataa malli';
    loadBtn.onclick = function () {
      const sel = document.querySelector('#panelContainer input[name="coa_template"]:checked');
      if (!sel) {
        alert('Valitse tilikarttamalli.');
        return;
      }
      if (!confirm('Nykyinen tilikartta korvataan valitulla mallilla. Jatketaanko?')) return;
      const ok = applyTilikarttamalli(sel.value);
      if (ok) {
        closePanel();
        refreshApp();
        if (window.openCOAPanel) window.openCOAPanel();
      } else {
        alert('Tilikarttamallin lataus epäonnistui.');
      }
    };
    const overlay = openPanel('Lataa tilikarttamalli', html, [loadBtn, closeBtn]);
    if (templates.length > 0) {
      const first = overlay.querySelector('input[name="coa_template"]');
      if (first) first.checked = true;
    }
  };

  window.openPeriodsPanel = function () {
    function toYyyyMmDd(val) {
      if (val == null || val === '') return '';
      const n = Number(val);
      if (!isNaN(n) && n > 0) {
        const d = new Date(n);
        const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
      }
      const s = String(val).trim();
      if (/^\d{4}-\d{2}-\d{2}(?:T|\s|$)/.test(s)) return s.slice(0, 10);
      const d = new Date(s);
      if (isNaN(d.getTime())) return s;
      const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    }
    const periods = getPeriods();
    let html = '<table class="data-table"><thead><tr><th>Alku</th><th>Loppu</th><th>Lukittu</th><th></th></tr></thead><tbody>';
    periods.forEach(p => {
      html += '<tr data-id="' + p.id + '"><td><input type="date" value="' + (toYyyyMmDd(p.startDate) || '') + '" class="period-start"></td>';
      html += '<td><input type="date" value="' + (toYyyyMmDd(p.endDate) || '') + '" class="period-end"></td>';
      html += '<td><input type="checkbox" ' + (p.locked ? 'checked' : '') + ' class="period-locked"></td>';
      html += '<td><button type="button" class="btn btn-save-period">Tallenna</button> <button type="button" class="btn btn-set-current">Käytä</button> <button type="button" class="btn btn-danger btn-delete-period">Poista</button></td></tr>';
    });
    html += '</tbody></table>';
    html += '<p><button type="button" class="btn btn-primary" id="btnAddPeriod">Lisää tilikausi</button></p>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn';
    closeBtn.textContent = 'Sulje';
    closeBtn.onclick = closePanel;
    const overlay = openPanel('Tilikaudet', html, [closeBtn]);
    overlay.querySelectorAll('.btn-save-period').forEach(btn => {
      btn.onclick = function () {
        const tr = this.closest('tr');
        const id = parseInt(tr.dataset.id, 10);
        const p = getPeriodById(id) || {};
        p.id = id;
        p.startDate = tr.querySelector('.period-start').value;
        p.endDate = tr.querySelector('.period-end').value;
        p.locked = tr.querySelector('.period-locked').checked;
        savePeriod(p);
        refreshApp();
      };
    });
    overlay.querySelectorAll('.btn-delete-period').forEach(btn => {
      btn.onclick = function () {
        if (!confirm('Poistetaan tilikausi?')) return;
        const tr = this.closest('tr');
        deletePeriod(parseInt(tr.dataset.id, 10));
        tr.remove();
        refreshApp();
      };
    });
    overlay.querySelector('#btnAddPeriod').onclick = function () {
      const y = new Date().getFullYear();
      savePeriod({ startDate: y + '-01-01', endDate: y + '-12-31', locked: false });
      window.openPeriodsPanel();
    };
    overlay.querySelectorAll('.btn-set-current').forEach(btn => {
      btn.onclick = function () {
        const tr = this.closest('tr');
        const id = parseInt(tr.dataset.id, 10);
        const s = getSettings();
        s.currentPeriodId = id;
        saveSettings(s);
        if (window.TilitinApp && window.TilitinApp.reloadDocuments) {
          window.TilitinApp.reloadDocuments();
        } else {
          refreshApp();
        }
        closePanel();
      };
    });
  };

  window.openDocumentTypesPanel = function () {
    const types = getDocumentTypes();
    let html = '<table class="data-table"><thead><tr><th>Nro</th><th>Nimi</th><th>Numero alku</th><th>Numero loppu</th><th></th></tr></thead><tbody>';
    types.forEach(t => {
      html += '<tr data-id="' + t.id + '"><td><input type="number" value="' + (t.number || '') + '" class="dt-number"></td>';
      html += '<td><input type="text" value="' + (t.name || '') + '" class="dt-name"></td>';
      html += '<td><input type="number" value="' + (t.numberStart ?? '') + '" class="dt-start"></td>';
      html += '<td><input type="number" value="' + (t.numberEnd ?? '') + '" class="dt-end"></td>';
      html += '<td><button type="button" class="btn btn-save-dt">Tallenna</button> <button type="button" class="btn btn-danger btn-delete-dt">Poista</button></td></tr>';
    });
    html += '</tbody></table>';
    html += '<p><button type="button" class="btn btn-primary" id="btnAddDocType">Lisää tositelaji</button></p>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn';
    closeBtn.textContent = 'Sulje';
    closeBtn.onclick = closePanel;
    const overlay = openPanel('Tositelajit', html, [closeBtn]);
    overlay.querySelectorAll('.btn-save-dt').forEach(btn => {
      btn.onclick = function () {
        const tr = this.closest('tr');
        const id = parseInt(tr.dataset.id, 10);
        const t = getDocumentTypeById(id) || {};
        t.id = id;
        t.number = parseInt(tr.querySelector('.dt-number').value, 10) || 0;
        t.name = tr.querySelector('.dt-name').value.trim();
        t.numberStart = parseInt(tr.querySelector('.dt-start').value, 10) || 0;
        t.numberEnd = parseInt(tr.querySelector('.dt-end').value, 10) || 0;
        saveDocumentType(t);
        refreshApp();
      };
    });
    overlay.querySelectorAll('.btn-delete-dt').forEach(btn => {
      btn.onclick = function () {
        if (!confirm('Poistetaan tositelaji?')) return;
        const tr = this.closest('tr');
        deleteDocumentType(parseInt(tr.dataset.id, 10));
        tr.remove();
        refreshApp();
      };
    });
    overlay.querySelector('#btnAddDocType').onclick = function () {
      saveDocumentType({ number: 2, name: 'Uusi laji', numberStart: 1000, numberEnd: 19999 });
      window.openDocumentTypesPanel();
    };
  };

  window.openEntryTemplatesPanel = function () {
    const templates = getEntryTemplates();
    const accounts = getAccounts();
    function accountLabel(accId) {
      if (!accId) return '— Valitse tili —';
      const a = accounts.find(function (x) { return x.id === accId; });
      return a ? (a.number || '') + ' ' + (a.name || '') : '— Valitse tili —';
    }
    let html = '<table class="data-table"><thead><tr><th>Nro</th><th>Nimi</th><th>Tili</th><th>Debet</th><th>Kredit</th><th>Selite</th><th></th></tr></thead><tbody>';
    templates.forEach(t => {
      const accDisplay = accountLabel(t.accountId).replace(/</g, '&lt;');
      html += '<tr data-id="' + t.id + '"><td><input type="number" value="' + (t.number || '') + '" class="et-number"></td>';
      html += '<td><input type="text" value="' + (t.name || '') + '" class="et-name"></td>';
      html += '<td><span class="picker-trigger et-account-picker" data-value="' + (t.accountId || '') + '" role="button" tabindex="0">' + accDisplay + '</span></td>';
      html += '<td><input type="text" value="' + (t.debit ? t.amount : '') + '" class="et-debit"></td>';
      html += '<td><input type="text" value="' + (!t.debit ? t.amount : '') + '" class="et-credit"></td>';
      html += '<td><input type="text" value="' + (t.description || '').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '" class="et-desc"></td>';
      html += '<td><button type="button" class="btn btn-save-et">Tallenna</button> <button type="button" class="btn btn-danger btn-delete-et">Poista</button></td></tr>';
    });
    html += '</tbody></table>';
    html += '<p><button type="button" class="btn btn-primary" id="btnAddEntryTemplate">Lisää vientimalli</button></p>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn';
    closeBtn.textContent = 'Sulje';
    closeBtn.onclick = closePanel;
    const overlay = openPanel('Vientimallit', html, [closeBtn]);

    overlay.querySelectorAll('.et-account-picker').forEach(function (span) {
      span.addEventListener('click', function () {
        const opts = [{ value: 0, label: '— Valitse tili —' }];
        accounts.forEach(function (a) {
          opts.push({ value: a.id, label: (a.number || '') + ' ' + (a.name || ''), favourite: !!(a.flags & 1) });
        });
        window.TilitinPicker.open(span, 'Valitse tili', opts, function (value, label) {
          const id = value === 0 || value === '0' ? 0 : parseInt(value, 10);
          span.setAttribute('data-value', id || '');
          span.textContent = id ? label : '— Valitse tili —';
        }, {
          showFilter: accounts.length > 15,
          showFavouritesFilter: true,
          onToggleFavourite: function (accountId, isFavourite) {
            const acc = getAccountById(accountId);
            if (!acc) return;
            let f = acc.flags || 0;
            if (isFavourite) f |= 1; else f &= ~1;
            acc.flags = f;
            saveAccount(acc);
          }
        });
      });
    });

    overlay.querySelectorAll('.btn-save-et').forEach(btn => {
      btn.onclick = function () {
        const tr = this.closest('tr');
        const id = parseInt(tr.dataset.id, 10);
        const accountPick = tr.querySelector('.et-account-picker');
        const accountId = accountPick ? (parseInt(accountPick.getAttribute('data-value'), 10) || 0) : 0;
        const debitVal = parseNum(tr.querySelector('.et-debit').value);
        const creditVal = parseNum(tr.querySelector('.et-credit').value);
        const t = { id, number: parseInt(tr.querySelector('.et-number').value, 10) || 0, name: tr.querySelector('.et-name').value.trim(), accountId: accountId, debit: debitVal > 0, amount: debitVal || creditVal, description: tr.querySelector('.et-desc').value.trim(), rowNumber: 0 };
        saveEntryTemplate(t);
        refreshApp();
      };
    });
    overlay.querySelectorAll('.btn-delete-et').forEach(btn => {
      btn.onclick = function () {
        if (!confirm('Poistetaan vientimalli?')) return;
        const tr = this.closest('tr');
        deleteEntryTemplate(parseInt(tr.dataset.id, 10));
        tr.remove();
        refreshApp();
      };
    });
    overlay.querySelector('#btnAddEntryTemplate').onclick = function () {
      const acc = getAccounts()[0];
      saveEntryTemplate({ number: 1, name: 'Uusi malli', accountId: acc ? acc.id : 0, debit: true, amount: 0, description: '', rowNumber: 0 });
      window.openEntryTemplatesPanel();
    };
  };

  window.openPropertiesPanel = function () {
    const s = getSettings();
    const html = '<div class="form-group"><label>Nimi (yritys / kirjanpito)</label><input type="text" id="propName" value="' + (s.name || '').replace(/"/g, '&quot;') + '"></div>' +
      '<div class="form-group"><label>Y-tunnus</label><input type="text" id="propBusinessId" value="' + (s.businessId || '').replace(/"/g, '&quot;') + '"></div>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn';
    closeBtn.textContent = 'Sulje';
    closeBtn.onclick = function () {
      s.name = document.getElementById('propName').value.trim();
      s.businessId = document.getElementById('propBusinessId').value.trim();
      saveSettings(s);
      closePanel();
      refreshApp();
    };
    openPanel('Perustiedot', html, [closeBtn]);
  };

  window.openSettingsPanel = function () {
    const vatVisible = getSetting('vatVisible', 'true') !== 'false';
    const vatLocked = getSetting('vatLocked', 'true') !== 'false';
    const html = '<div class="form-group"><label><input type="checkbox" id="setVatVisible" ' + (vatVisible ? 'checked' : '') + '> Näytä ALV-sarake</label></div>' +
      '<div class="form-group"><label><input type="checkbox" id="setVatLocked" ' + (!vatLocked ? 'checked' : '') + '> ALV muokattavissa</label></div>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn';
    closeBtn.textContent = 'Sulje';
    closeBtn.onclick = function () {
      setSetting('vatVisible', document.getElementById('setVatVisible').checked ? 'true' : 'false');
      setSetting('vatLocked', document.getElementById('setVatLocked').checked ? 'false' : 'true');
      closePanel();
      refreshApp();
    };
    openPanel('Kirjausasetukset', html, [closeBtn]);
  };

  window.openUiSettingsPanel = function () {
    const s = getSettings();
    const currentFontSize = getSettingsFontSize();
    const currentDateFmt = s.dateFormat || 'DD.MM.YYYY';
    const currentDecSep = s.decimalSeparator || ',';
    const labels = { 11: 'Hyvin pieni', 12: 'Pieni', 13: 'Melko pieni', 14: 'Normaali (pieni)',
                     15: 'Normaali', 16: 'Tavallinen', 17: 'Hieman suurempi', 18: 'Suuri',
                     19: 'Melko suuri', 20: 'Iso', 22: 'Erittäin iso', 24: 'Suurin' };

    const dateFormats = [
      { value: 'DD.MM.YYYY', example: '31.12.2025' },
      { value: 'D.M.YYYY',   example: '31.12.2025 (ei nolla-täyttö)' },
      { value: 'DD.MM.YY',   example: '31.12.25' },
      { value: 'DD/MM/YYYY', example: '31/12/2025' },
      { value: 'MM/DD/YYYY', example: '12/31/2025' },
      { value: 'YYYY-MM-DD', example: '2025-12-31' },
      { value: 'YYYY.MM.DD', example: '2025.12.31' },
    ];

    const dateOptions = dateFormats.map(function (f) {
      const sel = f.value === currentDateFmt ? ' selected' : '';
      return '<option value="' + f.value + '"' + sel + '>' + f.example + '</option>';
    }).join('');

    const html =
      '<div class="form-group">' +
        '<label for="uiFontSizeRange" style="display:flex;justify-content:space-between;align-items:center;">' +
          '<span>Fonttikoko</span>' +
          '<span id="uiFontSizeDisplay" style="font-weight:600;color:var(--accent);min-width:80px;text-align:right;">' + currentFontSize + ' px – ' + (labels[currentFontSize] || '') + '</span>' +
        '</label>' +
        '<input type="range" id="uiFontSizeRange" min="11" max="24" step="1" value="' + currentFontSize + '" ' +
          'style="width:100%;margin-top:8px;accent-color:var(--accent);">' +
        '<div style="display:flex;justify-content:space-between;color:var(--text-muted);font-size:0.75rem;margin-top:4px;">' +
          '<span>11px</span><span>16px</span><span>24px</span>' +
        '</div>' +
      '</div>' +
      '<div class="form-group" style="background:var(--bg-input);border-radius:var(--radius);padding:14px 16px;margin-bottom:16px;">' +
        '<p style="margin:0 0 4px;font-size:var(--font-size-base);color:var(--text);">Esikatseluteksti – näin teksti näyttää valitulla koolla.</p>' +
        '<p style="margin:0;font-size:0.875rem;color:var(--text-muted);">Pienempi teksti: numerot, otsikot, valikot.</p>' +
      '</div>' +
      '<div class="form-group">' +
        '<label for="uiDateFormat">Päivämäärän muoto</label>' +
        '<select id="uiDateFormat" style="font-family:monospace;">' + dateOptions + '</select>' +
      '</div>' +
      '<div class="form-group">' +
        '<label for="uiDecimalSep">Desimaalipilkku</label>' +
        '<select id="uiDecimalSep">' +
          '<option value=","' + (currentDecSep === ',' ? ' selected' : '') + '>Pilkku &nbsp; 1\u00a0234,56 &nbsp; (suomalainen oletus)</option>' +
          '<option value="."' + (currentDecSep === '.' ? ' selected' : '') + '>Piste &nbsp;&nbsp; 1234.56 &nbsp;&nbsp; (kansainvälinen)</option>' +
        '</select>' +
      '</div>';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Tallenna';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn';
    cancelBtn.textContent = 'Peruuta';

    openPanel('Asetukset', html, [saveBtn, cancelBtn]);

    const slider = document.getElementById('uiFontSizeRange');
    const display = document.getElementById('uiFontSizeDisplay');

    slider.addEventListener('input', function () {
      const v = parseInt(this.value, 10);
      display.textContent = v + ' px' + (labels[v] ? ' – ' + labels[v] : '');
      applyFontSize(v);
    });

    saveBtn.onclick = function () {
      const v = parseInt(slider.value, 10);
      const fmt = document.getElementById('uiDateFormat').value;
      const dec = document.getElementById('uiDecimalSep').value;
      const s2 = getSettings();
      s2.fontSize = v;
      s2.dateFormat = fmt;
      s2.decimalSeparator = dec;
      saveSettings(s2);
      applyFontSize(v);
      closePanel();
      refreshApp();
    };

    cancelBtn.onclick = function () {
      applyFontSize(currentFontSize);
      closePanel();
    };
  };

  window.openStartingBalancesPanel = function () {
    const period = getPeriod();
    if (!period) { alert('Valitse ensin tilikausi.'); return; }
    const balances = getStartingBalances(period.id);
    const accounts = getAccounts();
    let html = '<p>Tilikausi: ' + formatDate(period.startDate) + ' – ' + formatDate(period.endDate) + '</p>';
    html += '<table class="data-table"><thead><tr><th>Tili</th><th>Alkusaldo debet</th><th>Alkusaldo kredit</th></tr></thead><tbody>';
    accounts.forEach(a => {
      const b = balances[a.id] || {};
      const deb = b.debit != null ? b.debit : '';
      const cred = b.credit != null ? b.credit : '';
      html += '<tr data-account-id="' + a.id + '"><td>' + (a.number || '') + ' ' + (a.name || '') + '</td>';
      html += '<td><input type="text" class="sb-debit" value="' + deb + '"></td>';
      html += '<td><input type="text" class="sb-credit" value="' + cred + '"></td></tr>';
    });
    html += '</tbody></table>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn';
    closeBtn.textContent = 'Sulje';
    closeBtn.onclick = closePanel;
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Tallenna';
    saveBtn.onclick = function () {
      const ov = document.querySelector('#panelContainer .panel-overlay');
      const newBalances = {};
      ov.querySelectorAll('tbody tr').forEach(tr => {
        const accountId = parseInt(tr.dataset.accountId, 10);
        const deb = parseNum(tr.querySelector('.sb-debit').value);
        const cred = parseNum(tr.querySelector('.sb-credit').value);
        if (deb || cred) newBalances[accountId] = { debit: deb, credit: cred };
      });
      saveStartingBalances(period.id, newBalances);
      closePanel();
      refreshApp();
    };
    openPanel('Alkusaldot', html, [saveBtn, closeBtn]);
  };

  window.openCheckBalancesPanel = function () {
    const periods = getPeriods();
    if (!periods.length) { alert('Ei tilikausia.'); return; }

    // Build results: check every document in every period
    const errors = [];   // { period, doc, debit, credit, diff }
    const stats = { periods: 0, docs: 0, ok: 0, errors: 0 };

    periods.forEach(function (period) {
      stats.periods++;
      const docs = getDocuments(period.id, null);
      docs.forEach(function (doc) {
        stats.docs++;
        const entries = getEntriesByDocument(doc.id);
        let debit = 0, credit = 0;
        entries.forEach(function (e) {
          debit  += (typeof e.amountDebit  === 'number' ? e.amountDebit  : 0);
          credit += (typeof e.amountCredit === 'number' ? e.amountCredit : 0);
        });
        // Round to 2 decimals to avoid floating point noise
        debit  = Math.round(debit  * 100) / 100;
        credit = Math.round(credit * 100) / 100;
        const diff = Math.round((debit - credit) * 100) / 100;
        if (Math.abs(diff) >= 0.005) {
          errors.push({ period: period, doc: doc, debit: debit, credit: credit, diff: diff });
          stats.errors++;
        } else {
          stats.ok++;
        }
      });
    });

    function fmt(n) {
      return formatNum(n);
    }

    let html = '<div style="margin-bottom:16px;display:flex;gap:16px;flex-wrap:wrap;">' +
      '<span class="status-stat-chip"><span class="stat-label">Tilikaudet</span><span class="stat-value">' + stats.periods + '</span></span>' +
      '<span class="status-stat-chip"><span class="stat-label">Tositteet</span><span class="stat-value">' + stats.docs + '</span></span>' +
      '<span class="status-stat-chip"><span class="stat-label">Täsmää</span><span class="stat-value" style="color:var(--debit);">' + stats.ok + '</span></span>' +
      '<span class="status-stat-chip"><span class="stat-label">Virheitä</span><span class="stat-value" style="color:' + (stats.errors ? 'var(--error)' : 'var(--debit)') + ';">' + stats.errors + '</span></span>' +
      '</div>';

    if (!errors.length) {
      html += '<div style="display:flex;align-items:center;gap:10px;padding:18px 20px;' +
        'background:rgba(125,211,168,0.08);border:1px solid rgba(125,211,168,0.25);border-radius:var(--radius);">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--debit)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
        '<span style="color:var(--debit);font-weight:600;">Kaikki tositteet täsmäävät. Ei virheitä löydetty.</span>' +
        '</div>';
    } else {
      html += '<p style="color:var(--error);margin:0 0 10px;font-weight:600;">' +
        'Seuraavissa tositteissa debet ja kredit eivät täsmää:</p>';
      html += '<table class="data-table" style="min-width:520px;">' +
        '<thead><tr>' +
        '<th>Tilikausi</th>' +
        '<th>Nro</th>' +
        '<th>Päivä</th>' +
        '<th style="text-align:right">Debet</th>' +
        '<th style="text-align:right">Kredit</th>' +
        '<th style="text-align:right">Erotus</th>' +
        '</tr></thead><tbody>';
      errors.forEach(function (e) {
        const periodLabel = formatDate(e.period.startDate) + '–' + formatDate(e.period.endDate);
        const diffColor = e.diff > 0 ? 'color:var(--debit)' : 'color:var(--credit)';
        html += '<tr>' +
          '<td style="color:var(--text-muted);white-space:nowrap;">' + periodLabel + '</td>' +
          '<td style="font-weight:600;color:var(--accent);" class="check-doc-link" data-period-id="' + e.period.id + '" data-doc-id="' + e.doc.id + '">' +
            '<span style="cursor:pointer;text-decoration:underline dotted;" title="Siirry tositteeseen">' + e.doc.number + '</span>' +
          '</td>' +
          '<td style="white-space:nowrap;">' + (e.doc.date ? formatDate(e.doc.date) : '–') + '</td>' +
          '<td style="text-align:right;color:var(--debit);">' + fmt(e.debit) + '</td>' +
          '<td style="text-align:right;color:var(--credit);">' + fmt(e.credit) + '</td>' +
          '<td style="text-align:right;font-weight:600;' + diffColor + ';">' + fmt(e.diff) + '</td>' +
          '</tr>';
      });
      html += '</tbody></table>';
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-primary';
    closeBtn.textContent = 'Sulje';
    closeBtn.onclick = closePanel;
    openPanel('Tarkista täsmäykset', html, [closeBtn]);

    // Wire up click-to-navigate on doc number links
    document.querySelectorAll('#panelContainer .check-doc-link').forEach(function (cell) {
      cell.querySelector('span').addEventListener('click', function () {
        const periodId = parseInt(cell.dataset.periodId, 10);
        const docId    = parseInt(cell.dataset.docId,    10);
        closePanel();
        // Switch period and navigate to the document
        const s = getSettings();
        s.currentPeriodId = periodId;
        saveSettings(s);
        if (window.TilitinApp) {
          window.TilitinApp.reloadDocuments();
          const st = window.TilitinApp.getState();
          const idx = (st.documents || []).findIndex(function (d) { return d.id === docId; });
          if (idx >= 0) {
            st.documentIndex = idx;
            window.TilitinApp.render();
          }
        }
      });
    });
  };
  window.openRaporttipohjaPanel = function () {
    var TABS = [
      { id: 'balance-sheet-detailed',    label: 'Tase erittelyin' },
      { id: 'income-statement-detailed', label: 'Tuloslaskelma erittelyin' }
    ];
    var activeTab = 0;

    function getCurrentText(id) {
      var saved = getReportStructureById(id);
      if (saved && saved.lines) return saved.lines;
      // Ask reports.js for the default (available after it has been opened once).
      var def = window.getDefaultReportStructure && window.getDefaultReportStructure(id);
      return def || '';
    }

    function renderPanel() {
      var existing = document.querySelector('.panel-raporttipohja-overlay');
      if (existing) existing.remove();

      var tab = TABS[activeTab];
      var currentText = getCurrentText(tab.id);
      var isSaved = !!(getReportStructureById(tab.id) && getReportStructureById(tab.id).lines);

      var tabHtml = TABS.map(function (t, i) {
        return '<button type="button" class="rp-tab' + (i === activeTab ? ' rp-tab-active' : '') + '" data-tab="' + i + '">' + t.label + '</button>';
      }).join('');

      var html =
        '<div class="rp-top-row">' +
          '<div class="rp-tabs">' + tabHtml + '</div>' +
          '<button type="button" id="btnRpResetTop" class="btn rp-reset-btn">Palauta oletukset</button>' +
        '</div>' +
        '<details class="rp-legend">' +
          '<summary>Muodon selitys ▾</summary>' +
          '<div class="rp-legend-body">' +
            '<p>Jokainen rivi on muotoa <code>XY&lt;taso&gt;;&lt;alku&gt;;&lt;loppu&gt;;...;Otsikko</code></p>' +
            '<table class="rp-legend-table">' +
              '<thead><tr><th>Merkki</th><th>Merkitys</th></tr></thead>' +
              '<tbody>' +
                '<tr><td colspan="2" class="rp-legend-section">Rivityyppi (1. merkki)</td></tr>' +
                '<tr><td><code>H</code></td><td>Otsikkorivi — näytetään aina, ei summia (esim. <code>HB0;1000;2000;VASTAAVAA</code>)</td></tr>' +
                '<tr><td><code>G</code></td><td>Ryhmän otsikko — piilotetaan jos saldo on nolla</td></tr>' +
                '<tr><td><code>T</code></td><td>Välisumma — piilotetaan jos nolla</td></tr>' +
                '<tr><td><code>S</code></td><td>Kumulatiivinen välisumma alusta (running sum) — näytetään aina</td></tr>' +
                '<tr><td><code>D</code></td><td>Tilirivit — listaa yksittäiset tilit alueelta</td></tr>' +
                '<tr><td colspan="2" class="rp-legend-section">Tyyli (2. merkki)</td></tr>' +
                '<tr><td><code>B</code></td><td>Lihavoitu (bold)</td></tr>' +
                '<tr><td><code>I</code></td><td>Kursivoitu (italic)</td></tr>' +
                '<tr><td><code>P</code></td><td>Tavallinen</td></tr>' +
                '<tr><td colspan="2" class="rp-legend-section">Taso (3. merkki, 0–4)</td></tr>' +
                '<tr><td><code>0</code></td><td>Ei sisennystä (päätaso)</td></tr>' +
                '<tr><td><code>1–4</code></td><td>Sisennys (16 px per taso)</td></tr>' +
                '<tr><td colspan="2" class="rp-legend-section">D-rivin suodatin (valinnainen, D:n jälkeen)</td></tr>' +
                '<tr><td><code>D+</code></td><td>Näytä vain positiiviset tilit</td></tr>' +
                '<tr><td><code>D-</code></td><td>Näytä vain negatiiviset tilit</td></tr>' +
                '<tr><td><code>D0</code></td><td>Näytä vain nollasaldoiset tilit</td></tr>' +
                '<tr><td colspan="2" class="rp-legend-section">Muut</td></tr>' +
                '<tr><td><em>tyhjä rivi</em></td><td>Väliviiva / tyhjä rivi</td></tr>' +
                '<tr><td><code>-</code></td><td>Osien välinen erottaja</td></tr>' +
              '</tbody>' +
            '</table>' +
            '<p style="margin-top:6px">Esimerkki: <code>DP1;3000;3600;Liikevaihto</code> = Ryhmäotsikko, lihavoitu, taso 1, tilit 3000–3599, teksti "Liikevaihto"</p>' +
          '</div>' +
        '</details>' +
        (isSaved ? '<p class="rp-saved-note">\u26A0 T\u00e4ss\u00e4 on tallennettu mukautettu rakenne. <button type="button" id="btnRpReset">Palauta oletuksiin</button></p>' : '') +
        (isSaved ? '<p class="rp-saved-note">⚠ Tässä on tallennettu mukautettu rakenne. <button type="button" id="btnRpReset">Palauta oletuksiin</button></p>' : '') +
        '<textarea id="rpTextarea" class="rp-textarea" spellcheck="false">' +
          (currentText || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
        '</textarea>';

      var saveBtn = document.createElement('button');
      saveBtn.className = 'btn btn-primary';
      saveBtn.textContent = 'Tallenna';

      var closeBtn = document.createElement('button');
      closeBtn.className = 'btn';
      closeBtn.textContent = 'Sulje';
      closeBtn.onclick = function () { overlay.remove(); };

      var overlay = document.createElement('div');
      overlay.className = 'panel-overlay panel-raporttipohja-overlay';
      overlay.innerHTML =
        '<div class="panel panel-raporttipohja">' +
          '<div class="panel-header"><span class="panel-title">Raporttipohja</span>' +
            '<button class="panel-close" title="Sulje">\u00D7</button></div>' +
          '<div class="panel-body rp-body">' + html + '</div>' +
          '<div class="panel-footer"></div>' +
        '</div>';

      overlay.querySelector('.panel-footer').appendChild(saveBtn);
      overlay.querySelector('.panel-footer').appendChild(closeBtn);
      overlay.querySelector('.panel-close').onclick = function () { overlay.remove(); };
      overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

      overlay.querySelectorAll('.rp-tab').forEach(function (btn) {
        btn.addEventListener('click', function () {
          activeTab = parseInt(btn.getAttribute('data-tab'), 10);
          renderPanel();
        });
      });

      function doReset() {
        if (!confirm('Palauta oletusrakenne? Mukautetut muutokset häviävät.')) return;
        var list = getReportStructures();
        var idx = list.findIndex(function (r) { return r.id === tab.id; });
        if (idx >= 0) { list.splice(idx, 1); saveJson('report_structures', list); }
        renderPanel();
      }
      var resetBtn = overlay.querySelector('#btnRpReset');
      if (resetBtn) resetBtn.onclick = doReset;
      var resetTopBtn = overlay.querySelector('#btnRpResetTop');
      if (resetTopBtn) resetTopBtn.onclick = doReset;

      saveBtn.onclick = function () {
        var ta = overlay.querySelector('#rpTextarea');
        var text = ta ? ta.value : '';
        saveReportStructure({ id: tab.id, lines: text });
        renderPanel();
        alert('Tallennettu! Raportti käyttää nyt mukautettua rakennetta.');
      };

      document.body.appendChild(overlay);
    }

    renderPanel();
  };

  window.openAboutPanel = function (appName, appVersion) {
    var html =
      '<div class="about-panel-content">' +
      '<p><strong>' + appName + ' ' + appVersion + '</strong> on ilmainen ja avoimen lähdekoodin selainpohjainen kirjanpito-ohjelma, ' +
      'joka perustuu suomalaisen <a href="https://ito.fi/tilitin/" target="_blank" rel="noopener noreferrer">Tilitin</a>-kirjanpito-ohjelman lähdekoodiin. ' +
      'Ohjelman on toteuttanut <strong>ecations</strong>. Lisenssi: <strong>GPL-3.0</strong>.</p>' +

      '<h3>Käyttö</h3>' +
      '<p>Ohjelmaa voi käyttää suoraan selaimessa ilman asennusta osoitteessa:<br>' +
      '<a href="https://ecation.fi/tiliweb" target="_blank" rel="noopener noreferrer">https://ecation.fi/tiliweb</a></p>' +
      '<p>Ohjelman voi myös ladata omalle koneelle ja käyttää paikallisesti ilman internet-yhteyttä. ' +
      'Tällöin ohjelma toimii täysin offline-tilassa ilman verkkoyhteyttä. Latausosoite:<br>' +
      '<a href="https://github.com/ecations/TiliWeb" target="_blank" rel="noopener noreferrer">https://github.com/ecations/TiliWeb</a></p>' +

      '<h3>Yhteensopivuus Tilitinin kanssa</h3>' +
      '<p>Vanhan <strong>Tilitin</strong>-ohjelman (Java-versio) kirjanpitotiedostot voidaan tuoda suoraan TiliWebiin – avaa vain vanhan Tilittimen tietokanta ja kopio sieltä  ' +
      '<code>SQLLite</code>-tiedosto. Sitten valitse TiliWebistä työkalut --> tuo SQL tiedosto. ' +
      'Toiseen suuntaan siirtyminen on myös mahdollista: TiliWebistä voi viedä kirjanpitodatan ja palata tarvittaessa takaisin alkuperäiseen Java-Tilitiniin.</p>' +

      '<h3>Ominaisuuksia</h3>' +
      '<ul>' +
      '<li>Kahdenkertainen kirjanpito tilikausikohtaisesti</li>' +
      '<li>Vapaavalintainen tilikartta ja valmiit tilikarttamallit (esim. pienyritys, yhdistys, maatalous)</li>' +
      '<li>Arvonlisäverolaskelmat ja ALV-raportti Verohallintoa varten</li>' +
      '<li>Tuloslaskelma ja tase</li>' +
      '<li>Tiliote tilikausittain</li>' +
      '<li>Pääkirja ja päiväkirja</li>' +
      '<li>Tositteiden haku ja suodatus</li>' +
      '<li>Vientimallit toistuviin kirjauksiin</li>' +
      '<li>Vientien ennustus ja autotäyttö historiallisen vientidatan perusteella</li>' +
      '<li>Tositelajit ja tositenumerointi</li>' +
      '<li>Alkusaldojen hallinta</li>' +
      '<li>Kaikki tieto tallennetaan paikallisesti selaimen muistiin – mitään ei lähetetä palvelimelle</li>' +
      '<li>Toimii offline-tilassa (ladatussa versiossa ei tarvita internet-yhteyttä)</li>' +
      '</ul>' +

      '<h3>Tuki ja keskustelu</h3>' +
      '<p>Ohjelmaa koskevaa keskustelua käydään Kirjanpitofoorumilla:<br>' +
      '<a href="https://kirjanpitofoorumi.com/viewforum.php?f=48" target="_blank" rel="noopener noreferrer">https://kirjanpitofoorumi.com/viewforum.php?f=48</a></p>' +

      '<h3>Vastuuvapauslauseke</h3>' +
      '<p class="about-disclaimer">Ohjelma on tarkoitettu avuksi kirjanpitoon, mutta käyttö on käyttäjän omalla vastuulla. ' +
      'Ohjelmassa saattaa esiintyä virheitä (bugeja). Tarkista aina kirjanpitosi oikeellisuus ennen viranomaisraportointia. ' +
      'Ohjelma ei korvaa ammattimaista kirjanpitäjää tai tilitoimistoa.</p>' +
      '</div>';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-primary';
    closeBtn.textContent = 'Sulje';
    closeBtn.onclick = closePanel;
    var overlay = openPanel('Tietoja ohjelmasta', html, [closeBtn]);
    overlay.querySelector('.panel').style.maxWidth = '620px';
  };

  window.openLicensePanel = function () {
    var text = '                    GNU GENERAL PUBLIC LICENSE\n                       Version 3, 29 June 2007\n\n Copyright (C) 2007 Free Software Foundation, Inc. <http://fsf.org/>\n Everyone is permitted to copy and distribute verbatim copies\n of this license document, but changing it is not allowed.\n\n                            Preamble\n\n  The GNU General Public License is a free, copyleft license for\nsoftware and other kinds of works.\n\n  The licenses for most software and other practical works are designed\nto take away your freedom to share and change the works.  By contrast,\nthe GNU General Public License is intended to guarantee your freedom to\nshare and change all versions of a program--to make sure it remains free\nsoftware for all its users.  We, the Free Software Foundation, use the\nGNU General Public License for most of our software; it applies also to\nany other work released this way by its authors.  You can apply it to\nyour programs, too.\n\n  When we speak of free software, we are referring to freedom, not\nprice.  Our General Public Licenses are designed to make sure that you\nhave the freedom to distribute copies of free software (and charge for\nthem if you wish), that you receive source code or can get it if you\nwant it, that you can change the software or use pieces of it in new\nfree programs, and that you know you can do these things.\n\n  To protect your rights, we need to prevent others from denying you\nthese rights or asking you to surrender the rights.  Therefore, you have\ncertain responsibilities if you distribute copies of the software, or if\nyou modify it: responsibilities to respect the freedom of others.\n\n  For example, if you distribute copies of such a program, whether\ngratis or for a fee, you must pass on to the recipients the same\nfreedoms that you received.  You must make sure that they, too, receive\nor can get the source code.  And you must show them these terms so they\nknow their rights.\n\n  Developers that use the GNU GPL protect your rights with two steps:\n(1) assert copyright on the software, and (2) offer you this License\ngiving you legal permission to copy, distribute and/or modify it.\n\n  For the developers\' and authors\' protection, the GPL clearly explains\nthat there is no warranty for this free software.  For both users\' and\nauthors\' sake, the GPL requires that modified versions be marked as\nchanged, so that their problems will not be attributed erroneously to\nauthors of previous versions.\n\n  Some devices are designed to deny users access to install or run\nmodified versions of the software inside them, although the manufacturer\ncan do so.  This is fundamentally incompatible with the aim of\nprotecting users\' freedom to change the software.  The systematic\npattern of such abuse occurs in the area of products for individuals to\nuse, which is precisely where it is most unacceptable.  Therefore, we\nhave designed this version of the GPL to prohibit the practice for those\nproducts.  If such problems arise substantially in other domains, we\nstand ready to extend this provision to those domains in future versions\nof the GPL, as needed to protect the freedom of users.\n\n  Finally, every program is threatened constantly by software patents.\nStates should not allow patents to restrict development and use of\nsoftware on general-purpose computers, but in those that do, we wish to\navoid the special danger that patents applied to a free program could\nmake it effectively proprietary.  To prevent this, the GPL assures that\npatents cannot be used to render the program non-free.\n\n  The precise terms and conditions for copying, distribution and\nmodification follow.\n\n                       TERMS AND CONDITIONS\n\n  0. Definitions.\n\n  "This License" refers to version 3 of the GNU General Public License.\n\n  "Copyright" also means copyright-like laws that apply to other kinds of\nworks, such as semiconductor masks.\n\n  "The Program" refers to any copyrightable work licensed under this\nLicense.  Each licensee is addressed as "you".  "Licensees" and\n"recipients" may be individuals or organizations.\n\n  To "modify" a work means to copy from or adapt all or part of the work\nin a fashion requiring copyright permission, other than the making of an\nexact copy.  The resulting work is called a "modified version" of the\nearlier work or a work "based on" the earlier work.\n\n  A "covered work" means either the unmodified Program or a work based\non the Program.\n\n  To "propagate" a work means to do anything with it that, without\npermission, would make you directly or secondarily liable for\ninfringement under applicable copyright law, except executing it on a\ncomputer or modifying a private copy.  Propagation includes copying,\ndistribution (with or without modification), making available to the\npublic, and in some countries other activities as well.\n\n  To "convey" a work means any kind of propagation that enables other\nparties to make or receive copies.  Mere interaction with a user through\na computer network, with no transfer of a copy, is not conveying.\n\n  An interactive user interface displays "Appropriate Legal Notices"\nto the extent that it includes a convenient and prominently visible\nfeature that (1) displays an appropriate copyright notice, and (2)\ntells the user that there is no warranty for the work (except to the\nextent that warranties are provided), that licensees may convey the\nwork under this License, and how to view a copy of this License.  If\nthe interface presents a list of user commands or options, such as a\nmenu, a prominent item in the list meets this criterion.\n\n  1. Source Code.\n\n  The "source code" for a work means the preferred form of the work\nfor making modifications to it.  "Object code" means any non-source\nform of a work.\n\n  A "Standard Interface" means an interface that either is an official\nstandard defined by a recognized standards body, or, in the case of\ninterfaces specified for a particular programming language, one that\nis widely used among developers working in that language.\n\n  The "System Libraries" of an executable work include anything, other\nthan the work as a whole, that (a) is included in the normal form of\npackaging a Major Component, but which is not part of that Major\nComponent, and (b) serves only to enable use of the work with that\nMajor Component, or to implement a Standard Interface for which an\nimplementation is available to the public in source code form.  A\n"Major Component", in this context, means a major essential component\n(kernel, window system, and so on) of the specific operating system\n(if any) on which the executable work runs, or a compiler used to\nproduce the work, or an object code interpreter used to run it.\n\n  The "Corresponding Source" for a work in object code form means all\nthe source code needed to generate, install, and (for an executable\nwork) run the object code and to modify the work, including scripts to\ncontrol those activities.  However, it does not include the work\'s\nSystem Libraries, or general-purpose tools or generally available free\nprograms which are used unmodified in performing those activities but\nwhich are not part of the work.  For example, Corresponding Source\nincludes interface definition files associated with source files for\nthe work, and the source code for shared libraries and dynamically\nlinked subprograms that the work is specifically designed to require,\nsuch as by intimate data communication or control flow between those\nsubprograms and other parts of the work.\n\n  The Corresponding Source need not include anything that users\ncan regenerate automatically from other parts of the Corresponding\nSource.\n\n  The Corresponding Source for a work in source code form is that\nsame work.\n\n  2. Basic Permissions.\n\n  All rights granted under this License are granted for the term of\ncopyright on the Program, and are irrevocable provided the stated\nconditions are met.  This License explicitly affirms your unlimited\npermission to run the unmodified Program.  The output from running a\ncovered work is covered by this License only if the output, given its\ncontent, constitutes a covered work.  This License acknowledges your\nrights of fair use or other equivalent, as provided by copyright law.\n\n  You may make, run and propagate covered works that you do not\nconvey, without conditions so long as your license otherwise remains\nin force.  You may convey covered works to others for the sole purpose\nof having them make modifications exclusively for you, or provide you\nwith facilities for running those works, provided that you comply with\nthe terms of this License in conveying all material for which you do\nnot control copyright.  Those thus making or running the covered works\nfor you must do so exclusively on your behalf, under your direction\nand control, on terms that prohibit them from making any copies of\nyour copyrighted material outside their relationship with you.\n\n  Conveying under any other circumstances is permitted solely under\nthe conditions stated below.  Sublicensing is not allowed; section 10\nmakes it unnecessary.\n\n  3. Protecting Users\' Legal Rights From Anti-Circumvention Law.\n\n  No covered work shall be deemed part of an effective technological\nmeasure under any applicable law fulfilling obligations under article\n11 of the WIPO copyright treaty adopted on 20 December 1996, or\nsimilar laws prohibiting or restricting circumvention of such\nmeasures.\n\n  When you convey a covered work, you waive any legal power to forbid\ncircumvention of technological measures to the extent such circumvention\nis effected by exercising rights under this License with respect to\nthe covered work, and you disclaim any intention to limit operation or\nmodification of the work as a means of enforcing, against the work\'s\nusers, your or third parties\' legal rights to forbid circumvention of\ntechnological measures.\n\n  4. Conveying Verbatim Copies.\n\n  You may convey verbatim copies of the Program\'s source code as you\nreceive it, in any medium, provided that you conspicuously and\nappropriately publish on each copy an appropriate copyright notice;\nkeep intact all notices stating that this License and any\nnon-permissive terms added in accord with section 7 apply to the code;\nkeep intact all notices of the absence of any warranty; and give all\nrecipients a copy of this License along with the Program.\n\n  You may charge any price or no price for each copy that you convey,\nand you may offer support or warranty protection for a fee.\n\n  5. Conveying Modified Source Versions.\n\n  You may convey a work based on the Program, or the modifications to\nproduce it from the Program, in the form of source code under the\nterms of section 4, provided that you also meet all of these conditions:\n\n    a) The work must carry prominent notices stating that you modified\n    it, and giving a relevant date.\n\n    b) The work must carry prominent notices stating that it is\n    released under this License and any conditions added under section\n    7.  This requirement modifies the requirement in section 4 to\n    "keep intact all notices".\n\n    c) You must license the entire work, as a whole, under this\n    License to anyone who comes into possession of a copy.  This\n    License will therefore apply, along with any applicable section 7\n    additional terms, to the whole of the work, and all its parts,\n    regardless of how they are packaged.  This License gives no\n    permission to license the work in any other way, but it does not\n    invalidate such permission if you have separately received it.\n\n    d) If the work has interactive user interfaces, each must display\n    Appropriate Legal Notices; however, if the Program has interactive\n    interfaces that do not display Appropriate Legal Notices, your\n    work need not make them do so.\n\n  A compilation of a covered work with other separate and independent\nworks, which are not by their nature extensions of the covered work,\nand which are not combined with it such as to form a larger program,\nin or on a volume of a storage or distribution medium, is called an\n"aggregate" if the compilation and its resulting copyright are not\nused to limit the access or legal rights of the compilation\'s users\nbeyond what the individual works permit.  Inclusion of a covered work\nin an aggregate does not cause this License to apply to the other\nparts of the aggregate.\n\n  6. Conveying Non-Source Forms.\n\n  You may convey a covered work in object code form under the terms\nof sections 4 and 5, provided that you also convey the\nmachine-readable Corresponding Source under the terms of this License,\nin one of these ways:\n\n    a) Convey the object code in, or embodied in, a physical product\n    (including a physical distribution medium), accompanied by the\n    Corresponding Source fixed on a durable physical medium\n    customarily used for software interchange.\n\n    b) Convey the object code in, or embodied in, a physical product\n    (including a physical distribution medium), accompanied by a\n    written offer, valid for at least three years and valid for as\n    long as you offer spare parts or customer support for that product\n    model, to give anyone who possesses the object code either (1) a\n    copy of the Corresponding Source for all the software in the\n    product that is covered by this License, on a durable physical\n    medium customarily used for software interchange, for a price no\n    more than your reasonable cost of physically performing this\n    conveying of source, or (2) access to copy the\n    Corresponding Source from a network server at no charge.\n\n    c) Convey individual copies of the object code with a copy of the\n    written offer to provide the Corresponding Source.  This\n    alternative is allowed only occasionally and noncommercially, and\n    only if you received the object code with such an offer, in accord\n    with subsection 6b.\n\n    d) Convey the object code by offering access from a designated\n    place (gratis or for a charge), and offer equivalent access to the\n    Corresponding Source in the same way through the same place at no\n    further charge.  You need not require recipients to copy the\n    Corresponding Source along with the object code.  If the place to\n    copy the object code is a network server, the Corresponding Source\n    may be on a different server (operated by you or a third party)\n    that supports equivalent copying facilities, provided you maintain\n    clear directions next to the object code saying where to find the\n    Corresponding Source.  Regardless of what server hosts the\n    Corresponding Source, you remain obligated to ensure that it is\n    available for as long as needed to satisfy these requirements.\n\n    e) Convey the object code using peer-to-peer transmission, provided\n    you inform other peers where the object code and Corresponding\n    Source of the work are being offered to the general public at no\n    charge under subsection 6d.\n\n  A separable portion of the object code, whose source code is excluded\nfrom the Corresponding Source as a System Library, need not be\nincluded in conveying the object code work.\n\n  A "User Product" is either (1) a "consumer product", which means any\ntangible personal property which is normally used for personal, family,\nor household purposes, or (2) anything designed or sold for incorporation\ninto a dwelling.  In determining whether a product is a consumer product,\ndoubtful cases shall be resolved in favor of coverage.  For a particular\nproduct received by a particular user, "normally used" refers to a\ntypical or common use of that class of product, regardless of the status\nof the particular user or of the way in which the particular user\nactually uses, or expects or is expected to use, the product.  A product\nis a consumer product regardless of whether the product has substantial\ncommercial, industrial or non-consumer uses, unless such uses represent\nthe only significant mode of use of the product.\n\n  "Installation Information" for a User Product means any methods,\nprocedures, authorization keys, or other information required to install\nand execute modified versions of a covered work in that User Product from\na modified version of its Corresponding Source.  The information must\nsuffice to ensure that the continued functioning of the modified object\ncode is in no case prevented or interfered with solely because\nmodification has been made.\n\n  If you convey an object code work under this section in, or with, or\nspecifically for use in, a User Product, and the conveying occurs as\npart of a transaction in which the right of possession and use of the\nUser Product is transferred to the recipient in perpetuity or for a\nfixed term (regardless of how the transaction is characterized), the\nCorresponding Source conveyed under this section must be accompanied\nby the Installation Information.  But this requirement does not apply\nif neither you nor any third party retains the ability to install\nmodified object code on the User Product (for example, the work has\nbeen installed in ROM).\n\n  The requirement to provide Installation Information does not include a\nrequirement to continue to provide support service, warranty, or updates\nfor a work that has been modified or installed by the recipient, or for\nthe User Product in which it has been modified or installed.  Access to a\nnetwork may be denied when the modification itself materially and\nadversely affects the operation of the network or violates the rules and\nprotocols for communication across the network.\n\n  Corresponding Source conveyed, and Installation Information provided,\nin accord with this section must be in a format that is publicly\ndocumented (and with an implementation available to the public in\nsource code form), and must require no special password or key for\nunpacking, reading or copying.\n\n  7. Additional Terms.\n\n  "Additional permissions" are terms that supplement the terms of this\nLicense by making exceptions from one or more of its conditions.\nAdditional permissions that are applicable to the entire Program shall\nbe treated as though they were included in this License, to the extent\nthat they are valid under applicable law.  If additional permissions\napply only to part of the Program, that part may be used separately\nunder those permissions, but the entire Program remains governed by\nthis License without regard to the additional permissions.\n\n  When you convey a copy of a covered work, you may at your option\nremove any additional permissions from that copy, or from any part of\nit.  (Additional permissions may be written to require their own\nremoval in certain cases when you modify the work.)  You may place\nadditional permissions on material, added by you to a covered work,\nfor which you have or can give appropriate copyright permission.\n\n  Notwithstanding any other provision of this License, for material you\nadd to a covered work, you may (if authorized by the copyright holders of\nthat material) supplement the terms of this License with terms:\n\n    a) Disclaiming warranty or limiting liability differently from the\n    terms of sections 15 and 16 of this License; or\n\n    b) Requiring preservation of specified reasonable legal notices or\n    author attributions in that material or in the Appropriate Legal\n    Notices displayed by works containing it; or\n\n    c) Prohibiting misrepresentation of the origin of that material, or\n    requiring that modified versions of such material be marked in\n    reasonable ways as different from the original version; or\n\n    d) Limiting the use for publicity purposes of names of licensors or\n    authors of the material; or\n\n    e) Declining to grant rights under trademark law for use of some\n    trade names, trademarks, or service marks; or\n\n    f) Requiring indemnification of licensors and authors of that\n    material by anyone who conveys the material (or modified versions of\n    it) with contractual assumptions of liability to the recipient, for\n    any liability that these contractual assumptions directly impose on\n    those licensors and authors.\n\n  All other non-permissive additional terms are considered "further\nrestrictions" within the meaning of section 10.  If the Program as you\nreceived it, or any part of it, contains a notice stating that it is\ngoverned by this License along with a term that is a further\nrestriction, you may remove that term.  If a license document contains\na further restriction but permits relicensing or conveying under this\nLicense, you may add to a covered work material governed by the terms\nof that license document, provided that the further restriction does\nnot survive such relicensing or conveying.\n\n  If you add terms to a covered work in accord with this section, you\nmust place, in the relevant source files, a statement of the\nadditional terms that apply to those files, or a notice indicating\nwhere to find the applicable terms.\n\n  Additional terms, permissive or non-permissive, may be stated in the\nform of a separately written license, or stated as exceptions;\nthe above requirements apply either way.\n\n  8. Termination.\n\n  You may not propagate or modify a covered work except as expressly\nprovided under this License.  Any attempt otherwise to propagate or\nmodify it is void, and will automatically terminate your rights under\nthis License (including any patent licenses granted under the third\nparagraph of section 11).\n\n  However, if you cease all violation of this License, then your\nlicense from a particular copyright holder is reinstated (a)\nprovisionally, unless and until the copyright holder explicitly and\nfinally terminates your license, and (b) permanently, if the copyright\nholder fails to notify you of the violation by some reasonable means\nprior to 60 days after the cessation.\n\n  Moreover, your license from a particular copyright holder is\nreinstated permanently if the copyright holder notifies you of the\nviolation by some reasonable means, this is the first time you have\nreceived notice of violation of this License (for any work) from that\ncopyright holder, and you cure the violation prior to 30 days after\nyour receipt of the notice.\n\n  Termination of your rights under this section does not terminate the\nlicenses of parties who have received copies or rights from you under\nthis License.  If your rights have been terminated and not permanently\nreinstated, you do not qualify to receive new licenses for the same\nmaterial under section 10.\n\n  9. Acceptance Not Required for Having Copies.\n\n  You are not required to accept this License in order to receive or\nrun a copy of the Program.  Ancillary propagation of a covered work\noccurring solely as a consequence of using peer-to-peer transmission\nto receive a copy likewise does not require acceptance.  However,\nnothing other than this License grants you permission to propagate or\nmodify any covered work.  These actions infringe copyright if you do\nnot accept this License.  Therefore, by modifying or propagating a\ncovered work, you indicate your acceptance of this License to do so.\n\n  10. Automatic Licensing of Downstream Recipients.\n\n  Each time you convey a covered work, the recipient automatically\nreceives a license from the original licensors, to run, modify and\npropagate that work, subject to this License.  You are not responsible\nfor enforcing compliance by third parties with this License.\n\n  An "entity transaction" is a transaction transferring control of an\norganization, or substantially all assets of one, or subdividing an\norganization, or merging organizations.  If propagation of a covered\nwork results from an entity transaction, each party to that\ntransaction who receives a copy of the work also receives whatever\nlicenses to the work the party\'s predecessor in interest had or could\ngive under the previous paragraph, plus a right to possession of the\nCorresponding Source of the work from the predecessor in interest, if\nthe predecessor has it or can get it with reasonable efforts.\n\n  You may not impose any further restrictions on the exercise of the\nrights granted or affirmed under this License.  For example, you may\nnot impose a license fee, royalty, or other charge for exercise of\nrights granted under this License, and you may not initiate litigation\n(including a cross-claim or counterclaim in a lawsuit) alleging that\nany patent claim is infringed by making, using, selling, offering for\nsale, or importing the Program or any portion of it.\n\n  11. Patents.\n\n  A "contributor" is a copyright holder who authorizes use under this\nLicense of the Program or a work on which the Program is based.  The\nwork thus licensed is called the contributor\'s "contributor version".\n\n  A contributor\'s "essential patent claims" are all patent claims\nowned or controlled by the contributor, whether already acquired or\nhereafter acquired, that would be infringed by some manner, permitted\nby this License, of making, using, or selling its contributor version,\nbut do not include claims that would be infringed only as a\nconsequence of further modification of the contributor version.  For\npurposes of this definition, "control" includes the right to grant\npatent sublicenses in a manner consistent with the requirements of\nthis License.\n\n  Each contributor grants you a non-exclusive, worldwide, royalty-free\npatent license under the contributor\'s essential patent claims, to\nmake, use, sell, offer for sale, import and otherwise run, modify and\npropagate the contents of its contributor version.\n\n  In the following three paragraphs, a "patent license" is any express\nagreement or commitment, however denominated, not to enforce a patent\n(such as an express permission to practice a patent or covenant not to\nsue for patent infringement).  To "grant" such a patent license to a\nparty means to make such an agreement or commitment not to enforce a\npatent against the party.\n\n  If you convey a covered work, knowingly relying on a patent license,\nand the Corresponding Source of the work is not available for anyone\nto copy, free of charge and under the terms of this License, through a\npublicly available network server or other readily accessible means,\nthen you must either (1) cause the Corresponding Source to be so\navailable, or (2) arrange to deprive yourself of the benefit of the\npatent license for this particular work, or (3) arrange, in a manner\nconsistent with the requirements of this License, to extend the patent\nlicense to downstream recipients.  "Knowingly relying" means you have\nactual knowledge that, but for the patent license, your conveying the\ncovered work in a country, or your recipient\'s use of the covered work\nin a country, would infringe one or more identifiable patents in that\ncountry that you have reason to believe are valid.\n\n  If, pursuant to or in connection with a single transaction or\narrangement, you convey, or propagate by procuring conveyance of, a\ncovered work, and grant a patent license to some of the parties\nreceiving the covered work authorizing them to use, propagate, modify\nor convey a specific copy of the covered work, then the patent license\nyou grant is automatically extended to all recipients of the covered\nwork and works based on it.\n\n  A patent license is "discriminatory" if it does not include within\nthe scope of its coverage, prohibits the exercise of, or is\nconditioned on the non-exercise of one or more of the rights that are\nspecifically granted under this License.  You may not convey a covered\nwork if you are a party to an arrangement with a third party that is\nin the business of distributing software, under which you make payment\nto the third party based on the extent of your activity of conveying\nthe work, and under which the third party grants, to any of the\nparties who would receive the covered work from you, a discriminatory\npatent license (a) in connection with copies of the covered work\nconveyed by you (or copies made from those copies), or (b) primarily\nfor and in connection with specific products or compilations that\ncontain the covered work, unless you entered into that arrangement,\nor that patent license was granted, prior to 28 March 2007.\n\n  Nothing in this License shall be construed as excluding or limiting\nany implied license or other defenses to infringement that may\notherwise be available to you under applicable patent law.\n\n  12. No Surrender of Others\' Freedom.\n\n  If conditions are imposed on you (whether by court order, agreement or\notherwise) that contradict the conditions of this License, they do not\nexcuse you from the conditions of this License.  If you cannot convey a\ncovered work so as to satisfy simultaneously your obligations under this\nLicense and any other pertinent obligations, then as a consequence you may\nnot convey it at all.  For example, if you agree to terms that obligate you\nto collect a royalty for further conveying from those to whom you convey\nthe Program, the only way you could satisfy both those terms and this\nLicense would be to refrain entirely from conveying the Program.\n\n  13. Use with the GNU Affero General Public License.\n\n  Notwithstanding any other provision of this License, you have\npermission to link or combine any covered work with a work licensed\nunder version 3 of the GNU Affero General Public License into a single\ncombined work, and to convey the resulting work.  The terms of this\nLicense will continue to apply to the part which is the covered work,\nbut the special requirements of the GNU Affero General Public License,\nsection 13, concerning interaction through a network will apply to the\ncombination as such.\n\n  14. Revised Versions of this License.\n\n  The Free Software Foundation may publish revised and/or new versions of\nthe GNU General Public License from time to time.  Such new versions will\nbe similar in spirit to the present version, but may differ in detail to\naddress new problems or concerns.\n\n  Each version is given a distinguishing version number.  If the\nProgram specifies that a certain numbered version of the GNU General\nPublic License "or any later version" applies to it, you have the\noption of following the terms and conditions either of that numbered\nversion or of any later version published by the Free Software\nFoundation.  If the Program does not specify a version number of the\nGNU General Public License, you may choose any version ever published\nby the Free Software Foundation.\n\n  If the Program specifies that a proxy can decide which future\nversions of the GNU General Public License can be used, that proxy\'s\npublic statement of acceptance of a version permanently authorizes you\nto choose that version for the Program.\n\n  Later license versions may give you additional or different\npermissions.  However, no additional obligations are imposed on any\nauthor or copyright holder as a result of your choosing to follow a\nlater version.\n\n  15. Disclaimer of Warranty.\n\n  THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY\nAPPLICABLE LAW.  EXCEPT WHEN OTHERWISE STATED IN WRITING THE COPYRIGHT\nHOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM "AS IS" WITHOUT WARRANTY\nOF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO,\nTHE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR\nPURPOSE.  THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM\nIS WITH YOU.  SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF\nALL NECESSARY SERVICING, REPAIR OR CORRECTION.\n\n  16. Limitation of Liability.\n\n  IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING\nWILL ANY COPYRIGHT HOLDER, OR ANY OTHER PARTY WHO MODIFIES AND/OR CONVEYS\nTHE PROGRAM AS PERMITTED ABOVE, BE LIABLE TO YOU FOR DAMAGES, INCLUDING ANY\nGENERAL, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE\nUSE OR INABILITY TO USE THE PROGRAM (INCLUDING BUT NOT LIMITED TO LOSS OF\nDATA OR DATA BEING RENDERED INACCURATE OR LOSSES SUSTAINED BY YOU OR THIRD\nPARTIES OR A FAILURE OF THE PROGRAM TO OPERATE WITH ANY OTHER PROGRAMS),\nEVEN IF SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF\nSUCH DAMAGES.\n\n  17. Interpretation of Sections 15 and 16.\n\n  If the disclaimer of warranty and limitation of liability provided\nabove cannot be given local legal effect according to their terms,\nreviewing courts shall apply local law that most closely approximates\nan absolute waiver of all civil liability in connection with the\nProgram, unless a warranty or assumption of liability accompanies a\ncopy of the Program in return for a fee.\n\n                     END OF TERMS AND CONDITIONS\n\n            How to Apply These Terms to Your New Programs\n\n  If you develop a new program, and you want it to be of the greatest\npossible use to the public, the best way to achieve this is to make it\nfree software which everyone can redistribute and change under these terms.\n\n  To do so, attach the following notices to the program.  It is safest\nto attach them to the start of each source file to most effectively\nstate the exclusion of warranty; and each file should have at least\nthe "copyright" line and a pointer to where the full notice is found.\n\n    <one line to give the program\'s name and a brief idea of what it does.>\n    Copyright (C) <year>  <name of author>\n\n    This program is free software: you can redistribute it and/or modify\n    it under the terms of the GNU General Public License as published by\n    the Free Software Foundation, either version 3 of the License, or\n    (at your option) any later version.\n\n    This program is distributed in the hope that it will be useful,\n    but WITHOUT ANY WARRANTY; without even the implied warranty of\n    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the\n    GNU General Public License for more details.\n\n    You should have received a copy of the GNU General Public License\n    along with this program.  If not, see <http://www.gnu.org/licenses/>.\n\nAlso add information on how to contact you by electronic and paper mail.\n\n  If the program does terminal interaction, make it output a short\nnotice like this when it starts in an interactive mode:\n\n    <program>  Copyright (C) <year>  <name of author>\n    This program comes with ABSOLUTELY NO WARRANTY; for details type `show w\'.\n    This is free software, and you are welcome to redistribute it\n    under certain conditions; type `show c\' for details.\n\nThe hypothetical commands `show w\' and `show c\' should show the appropriate\nparts of the General Public License.  Of course, your program\'s commands\nmight be different; for a GUI interface, you would use an "about box".\n\n  You should also get your employer (if you work as a programmer) or school,\nif any, to sign a "copyright disclaimer" for the program, if necessary.\nFor more information on this, and how to apply and follow the GNU GPL, see\n<http://www.gnu.org/licenses/>.\n\n  The GNU General Public License does not permit incorporating your program\ninto proprietary programs.  If your program is a subroutine library, you\nmay consider it more useful to permit linking proprietary applications with\nthe library.  If this is what you want to do, use the GNU Lesser General\nPublic License instead of this License.  But first, please read\n<http://www.gnu.org/philosophy/why-not-lgpl.html>.\n';
    var overlay = document.createElement('div');
    overlay.className = 'panel-overlay';
    var safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    overlay.innerHTML =
      '<div class="panel" style="max-width:700px;max-height:82vh;display:flex;flex-direction:column;overflow:hidden">' +
        '<div class="panel-header">' +
          '<span class="panel-title">Lisenssi — GNU General Public License v3</span>' +
          '<button class="panel-close" title="Sulje">×</button>' +
        '</div>' +
        '<div class="panel-body" style="overflow-y:auto;flex:1;padding:1rem 1.2rem">' +
          '<pre style="white-space:pre-wrap;font-size:0.78rem;line-height:1.65;margin:0;font-family:monospace,monospace;color:inherit">' +
            safe +
          '</pre>' +
        '</div>' +
      '</div>';
    overlay.querySelector('.panel-close').onclick = function () { overlay.remove(); };
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  };
})();
