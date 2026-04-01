/**
 * Tilitin - Main application (document list, document form, entries)
 */

(function () {
  'use strict';

  const APP_NAME = 'TiliWeb';
  const APP_VERSION = '2.0.0';
  try {
    console.log('[Tilitin] app.js loaded', { build: (window.TILITIN_BUILD || null), version: APP_VERSION, debugVouchers: (window.TILITIN_DEBUG_VOUCHERS || null) });
  } catch (_) {}

  let state = {
    documentIndex: 0,
    documents: [],
    document: null,
    entries: [],
    changed: false,
    searchPhrase: '',
    searchMode: false,
    /** @type {number[]} Row indices of selected voucher lines (viennit). */
    selectedEntryIndices: [],
    /** Pivot row for Shift+click range selection; cleared when selection is cleared. */
    entrySelectionAnchorIndex: null,
    entriesClipboard: [],
    suggestActive: false   // true only while user is actively adding new entries
  };

  function getPeriod() {
    const s = getSettings();
    return s.currentPeriodId ? getPeriodById(s.currentPeriodId) : null;
  }

  function getDocType() {
    const s = getSettings();
    return s.documentTypeId ? getDocumentTypeById(s.documentTypeId) : null;
  }

  function isPeriodLocked(period, date) {
    if (!period || !period.locked) return false;
    const d = new Date(date);
    const start = new Date(period.startDate);
    const end = new Date(period.endDate);
    return d >= start && d <= end;
  }

  function isDateOutsidePeriod(dateYmd, period) {
    if (!period || !dateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateYmd))) return false;
    return dateYmd < period.startDate || dateYmd > period.endDate;
  }

  /**
   * Parse a user-typed date string (any common format) back to YYYY-MM-DD.
   * Handles formats like DD.MM.YYYY, D.M.YYYY, DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, YYYY.MM.DD, DD.MM.YY
   * Returns '' if unparseable.
   */
  function parseDisplayDateToYmd(str) {
    if (!str || !str.trim()) return '';
    const s = str.trim();
    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // DD.MM.YYYY or D.M.YYYY or DD.MM.YY
    let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (m) {
      let y = parseInt(m[3], 10);
      if (y < 100) y += y >= 50 ? 1900 : 2000;
      return String(y).padStart(4,'0') + '-' + String(m[2]).padStart(2,'0') + '-' + String(m[1]).padStart(2,'0');
    }
    // DD/MM/YYYY
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return m[3] + '-' + String(m[2]).padStart(2,'0') + '-' + String(m[1]).padStart(2,'0');
    // MM/DD/YYYY (US) — ambiguous if day<=12, but we check the user's setting
    const fmt = (typeof getSettings === 'function' && getSettings().dateFormat) || 'DD.MM.YYYY';
    if (fmt === 'MM/DD/YYYY') {
      m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) return m[3] + '-' + String(m[1]).padStart(2,'0') + '-' + String(m[2]).padStart(2,'0');
    }
    // YYYY.MM.DD
    m = s.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    return '';
  }

  /** Read the currently displayed date as ISO YYYY-MM-DD. */
  function getDocDateYmd() {
    const display = document.getElementById('docDateDisplay');
    if (display) return parseDisplayDateToYmd(display.value);
    const hidden = document.getElementById('docDate');
    return hidden ? hidden.value : '';
  }

  /** Set the date display field to the formatted version of a YYYY-MM-DD value. */
  function setDocDateDisplay(ymd) {
    const display = document.getElementById('docDateDisplay');
    if (display) display.value = ymd ? formatDate(ymd) : '';
  }

  function updateDocDateWarning() {
    const period = getPeriod();
    const warnEl = document.getElementById('docDateWarning');
    if (!warnEl) return;
    const dateYmd = (state.document && state.document.date) ? state.document.date : getDocDateYmd();
    const outside = period && dateYmd && isDateOutsidePeriod(dateYmd, period);
    if (outside) {
      warnEl.textContent = 'Päivämäärä ei kuulu tilikauteen ' + formatDate(period.startDate) + ' – ' + formatDate(period.endDate) + '.';
      warnEl.classList.remove('hidden');
    } else {
      warnEl.textContent = '';
      warnEl.classList.add('hidden');
    }
  }

  function isDocumentEditable() {
    if (!state.document) return false;
    const period = getPeriod();
    if (!period || period.locked) return false;
    if (state.document.id <= 0) return true;
    return !isPeriodLocked(period, state.document.date);
  }

  function loadDocuments() {
    const period = getPeriod();
    if (!period) {
      state.documents = [];
      return;
    }
    const docTypeId = getSettings().documentTypeId;
    let list = getDocumentsForDocTypeStrict(period.id, docTypeId);
    if (state.searchMode && state.searchPhrase.trim()) {
      const q = state.searchPhrase.trim().toLowerCase();
      list = list.filter(d => {
        const entries = getEntriesByDocument(d.id);
        const matchNum = String(d.number || '').includes(q);
        const matchEntry = entries.some(e => {
          const acc = getAccountById(e.accountId);
          const desc = (e.description || '').toLowerCase();
          return (acc && (acc.number.toLowerCase().includes(q) || acc.name.toLowerCase().includes(q))) || desc.includes(q);
        });
        return matchNum || matchEntry;
      });
    }
    state.documents = list;
  }

  /** Call after changing tositelaji: load only that type's documents (by number range) and show the first. */
  function switchToDocumentType(docTypeId) {
    const period = getPeriod();
    if (!period) return;
    const s = getSettings();
    s.documentTypeId = docTypeId != null ? docTypeId : null;
    saveSettings(s);
    state.documentIndex = 0;
    state.documents = getDocumentsForDocTypeStrict(period.id, docTypeId);
    if (state.searchMode && state.searchPhrase.trim()) {
      const q = state.searchPhrase.trim().toLowerCase();
      state.documents = state.documents.filter(d => {
        const entries = getEntriesByDocument(d.id);
        const matchNum = String(d.number || '').includes(q);
        const matchEntry = entries.some(e => {
          const acc = getAccountById(e.accountId);
          const desc = (e.description || '').toLowerCase();
          return (acc && (acc.number.toLowerCase().includes(q) || acc.name.toLowerCase().includes(q))) || desc.includes(q);
        });
        return matchNum || matchEntry;
      });
    }
    if (state.documents.length === 0) {
      state.document = null;
      state.entries = [];
    } else {
      state.document = { ...state.documents[0] };
      const docId = state.document.id != null ? Number(state.document.id) : null;
      state.entries = docId && typeof getEntriesForDisplay === 'function'
        ? getEntriesForDisplay(docId).map(e => ({ ...e }))
        : (docId ? getEntriesByDocument(docId).map(e => ({ ...e })) : []);
      state.entries.forEach(normalizeEntry);
      if (state.document && Number(state.document.number) === 2026) {
        console.log('[Voucher 2026 display] state.entries (loadDocuments, after normalizeEntry):', JSON.parse(JSON.stringify(state.entries)));
      }
    }
    state.changed = false;
  }

  function loadCurrentDocument() {
    const period = getPeriod();
    if (!period) {
      state.documents = [];
      state.document = null;
      state.entries = [];
      state.selectedEntryIndices = [];
      state.entrySelectionAnchorIndex = null;
      return;
    }
    if (state.documents.length === 0) {
      state.document = null;
      state.entries = [];
      state.selectedEntryIndices = [];
      state.entrySelectionAnchorIndex = null;
      return;
    }
    const idx = Math.max(0, Math.min(state.documentIndex, state.documents.length - 1));
    state.documentIndex = idx;
    state.document = { ...state.documents[idx] };
    const docId = state.document.id != null ? Number(state.document.id) : null;
    state.entries = docId && typeof getEntriesForDisplay === 'function'
      ? getEntriesForDisplay(docId).map(e => ({ ...e }))
      : (docId ? getEntriesByDocument(docId).map(e => ({ ...e })) : []);
    state.entries.forEach(normalizeEntry);
    if (state.document && Number(state.document.number) === 2026) {
      console.log('[Voucher 2026 display] state.entries passed to UI (after normalizeEntry):', JSON.parse(JSON.stringify(state.entries)));
    }
    state.changed = false;
    state.suggestActive = false;   // reset on every document load/navigation
    state.selectedEntryIndices = [];
    state.entrySelectionAnchorIndex = null;
  }

  function buildEntriesForStorage(docId, uiEntries) {
    const out = [];
    (uiEntries || []).forEach((e, i) => {
      const acc = e.accountId ? getAccountById(e.accountId) : null;
      const netDebit = e.amountDebit != null ? Number(e.amountDebit) : (e.debit ? Number(e.amount || 0) : 0);
      const netCredit = e.amountCredit != null ? Number(e.amountCredit) : (!e.debit ? Number(e.amount || 0) : 0);
      const isDebit = netDebit > 0;
      const netAmount = isDebit ? netDebit : netCredit;
      const vatAmt = e.vatAmount != null ? Number(e.vatAmount) : 0;

      const isVatCounterAccount = acc && (String(acc.number) === '76611' || String(acc.number) === '76621' || Number(acc.vatCode) === 2 || Number(acc.vatCode) === 3);
      if (isVatCounterAccount) {
        out.push({
          id: e.id || null,
          documentId: docId,
          accountId: e.accountId || 0,
          amountDebit: 0,
          amountCredit: 0,
          vatAmount: vatAmt || 0,
          description: e.description || '',
          rowNumber: i,
          flags: e.flags || 0
        });
      } else {
        out.push({
          id: e.id || null,
          documentId: docId,
          accountId: e.accountId || 0,
          amountDebit: isDebit ? netAmount : 0,
          amountCredit: !isDebit ? netAmount : 0,
          vatAmount: vatAmt || 0,
          description: e.description || '',
          rowNumber: i,
          flags: e.flags || 0
        });
      }

      // Persist Java-style VAT sub-rows only for main VAT-liable rows (e.g. 7663), not for VAT counter-account rows (76611, 76621).
      if (acc && accountHasVat(acc) && !isVatCounterAccount && vatAmt > 0) {
        const isReverse = isReverseChargeVat(acc);
        const vatAcc1 = acc.vatAccount1Id != null ? Number(acc.vatAccount1Id) : 0;
        const vatAcc2 = acc.vatAccount2Id != null ? Number(acc.vatAccount2Id) : 0;

        if (!isReverse) {
          if (vatAcc1 > 0) {
            out.push({
              id: null,
              documentId: docId,
              accountId: vatAcc1,
              amountDebit: isDebit ? vatAmt : 0,
              amountCredit: !isDebit ? vatAmt : 0,
              vatAmount: 0,
              description: '',
              rowNumber: i + 100000,
              flags: 0
            });
          }
        } else {
          // Reverse charge: Java uses vat2 (+200000) and vat3 (+300000); UI only displays VAT amount once.
          if (vatAcc1 > 0) {
            out.push({
              id: null,
              documentId: docId,
              accountId: vatAcc1,
              amountDebit: isDebit ? vatAmt : 0,
              amountCredit: !isDebit ? vatAmt : 0,
              vatAmount: 0,
              description: '',
              rowNumber: i + 200000,
              flags: 0
            });
          }
          if (vatAcc2 > 0) {
            out.push({
              id: null,
              documentId: docId,
              accountId: vatAcc2,
              amountDebit: !isDebit ? vatAmt : 0,
              amountCredit: isDebit ? vatAmt : 0,
              vatAmount: 0,
              description: '',
              rowNumber: i + 300000,
              flags: 0
            });
          }
        }
      }
    });
    out.sort((a, b) => (a.rowNumber || 0) - (b.rowNumber || 0));
    return out;
  }

  function saveDocumentToStore() {
    if (!state.document) return;
    const doc = state.document;
    const period = getPeriod();
    const docType = getDocType();
    if (period && docType) {
      const docsSameType = getDocuments(period.id, docType.id);
      const num = parseInt(doc.number, 10);
      if (!isNaN(num)) {
        const duplicate = docsSameType.find(d => d.id !== doc.id && parseInt(d.number, 10) === num);
        if (duplicate) {
          alert('Tositenumero ' + num + ' on jo käytössä tällä tilikaudella ja tositelajilla.\nValitse toinen numero.');
          return;
        }
      }
    }
    if (doc.id) {
      saveDocument(doc);
      const stored = buildEntriesForStorage(doc.id, state.entries);
      deleteEntriesByDocument(doc.id);
      stored.forEach(e => saveEntry(e));
    } else {
      const period = getPeriod();
      const docType = getDocType();
      if (!period || !docType) return;
      doc.periodId = period.id;
      doc.documentTypeId = docType.id;
      if (!doc.number) doc.number = 1;
      saveDocument(doc);
      state.document = getDocumentById(doc.id);
      const stored = buildEntriesForStorage(state.document.id, state.entries);
      deleteEntriesByDocument(state.document.id);
      stored.forEach(e => { e.id = null; saveEntry(e); });
      state.entries = (typeof getEntriesForDisplay === 'function'
        ? getEntriesForDisplay(state.document.id)
        : getEntriesByDocument(state.document.id)).map(e => ({ ...e }));
      state.entries.forEach(normalizeEntry);
    }
    state.changed = false;
    loadDocuments();
    loadCurrentDocument();
    render();
    scheduleSuggestIndexBuild(300);  // rebuild index after save, short delay
  }

  function createNewDocumentInternal(period, docType, mode) {
    const insertInMiddle = mode === 'after';

    const currentDocNumber = state.document && state.document.number != null ? parseInt(state.document.number, 10) : null;
    const isInMiddle = insertInMiddle &&
      state.document &&
      state.document.id != null &&
      state.documentIndex < state.documents.length - 1 &&
      currentDocNumber != null &&
      !isNaN(currentDocNumber);

    const storedDocs = getDocumentsForDocTypeStrict(period.id, docType.id).filter(d => d && d.id);
    const inMemoryDocs = (state.documents || []).filter(d =>
      d &&
      (d.documentTypeId == null || d.documentTypeId === docType.id) &&
      (d.periodId == null || d.periodId === period.id)
    );
    const existingDocs = storedDocs;
    const allForNumbers = [...storedDocs, ...inMemoryDocs];
    const existingNumbers = allForNumbers.map(d => parseInt(d.number, 10)).filter(n => !isNaN(n));
    const baseStart = (docType.numberStart != null ? parseInt(docType.numberStart, 10) : 1) || 1;
    const maxExisting = existingNumbers.length ? Math.max.apply(null, existingNumbers) : (baseStart - 1);
    let nextNum = maxExisting + 1;

    if (insertInMiddle && isInMiddle) {
      nextNum = currentDocNumber + 1;

      const endLimit = (docType.numberEnd != null && docType.numberEnd !== '') ? parseInt(docType.numberEnd, 10) : null;
      const wouldNeedShiftCount = existingNumbers.filter(n => n >= nextNum).length;
      const wouldMaxAfterShift = maxExisting + (wouldNeedShiftCount > 0 ? 1 : 0);
      if (endLimit != null && !isNaN(endLimit) && (nextNum > endLimit || wouldMaxAfterShift > endLimit)) {
        alert('Uutta tositetta ei voi lisätä tähän väliin: tositenumerot ylittäisivät tositelajin numerovälin (' + (docType.numberStart ?? '') + '–' + (docType.numberEnd ?? '') + ').');
        return;
      }

      const toShift = existingDocs
        .map(d => ({ doc: d, n: parseInt(d.number, 10) }))
        .filter(x => !isNaN(x.n) && x.n >= nextNum)
        .sort((a, b) => b.n - a.n);
      toShift.forEach(x => {
        x.doc.number = x.n + 1;
        saveDocument(x.doc);
      });

      state.documents.forEach(d => {
        if (!d || d.id == null) return;
        const n = parseInt(d.number, 10);
        if (!isNaN(n) && n >= nextNum) d.number = n + 1;
      });
    } else {
      const endLimit = (docType.numberEnd != null && docType.numberEnd !== '') ? parseInt(docType.numberEnd, 10) : null;
      if (endLimit != null && !isNaN(endLimit) && nextNum > endLimit) {
        alert('Uutta tositetta ei voi lisätä: tositenumero ylittäisi tositelajin numerovälin (' + (docType.numberStart ?? '') + '–' + (docType.numberEnd ?? '') + ').');
        return;
      }
    }

    state.document = {
      id: null,
      number: nextNum,
      date: period.startDate,
      periodId: period.id,
      documentTypeId: docType.id
    };
    // Auto-add the first empty entry row so the user can start typing immediately.
    state.entries = [{
      id: null,
      documentId: null,
      accountId: 0,
      amountDebit: 0,
      amountCredit: 0,
      vatAmount: 0,
      description: '',
      rowNumber: 0,
      flags: 0
    }];
    state.suggestActive = true;   // ready for suggestions once account is chosen
    state.changed = true;
    if (insertInMiddle && isInMiddle) {
      const insertAt = Math.min(state.documentIndex + 1, state.documents.length);
      state.documents = [...state.documents.slice(0, insertAt), state.document, ...state.documents.slice(insertAt)];
      state.documentIndex = insertAt;
    } else {
      state.documents = [...state.documents, state.document];
      state.documentIndex = state.documents.length - 1;
    }
    render();
  }

  function createNewDocument() {
    if (state.changed && !confirm('Tallenna muutokset ensin?')) return;
    const period = getPeriod();
    const docType = getDocType();
    if (!period || !docType) { alert('Valitse tilikausi ja tositelaji.'); return; }

    const currentDocNumber = state.document && state.document.number != null ? parseInt(state.document.number, 10) : null;
    const isInMiddle = state.document && state.document.id != null && state.documentIndex < state.documents.length - 1 && currentDocNumber != null && !isNaN(currentDocNumber);

    if (isInMiddle && window.openNewDocumentInsertChoice) {
      window.openNewDocumentInsertChoice(function (mode) {
        if (mode === 'cancel' || !mode) return;
        createNewDocumentInternal(period, docType, mode === 'after' ? 'after' : 'end');
      });
    } else {
      createNewDocumentInternal(period, docType, 'end');
    }
  }

  function deleteCurrentDocument() {
    if (!state.document || !confirm('Poistetaan tosite?')) return;
    if (state.document.id) {
      deleteDocument(state.document.id);
    }
    loadDocuments();
    state.documentIndex = Math.min(state.documentIndex, Math.max(0, state.documents.length - 1));
    loadCurrentDocument();
    render();
  }

  function goToDocument(index) {
    if (state.changed && state.document) {
      state.document.date = getDocDateYmd() || state.document.date;
      const period = getPeriod();
      if (period && state.document.date && isDateOutsidePeriod(state.document.date, period)) {
        if (!confirm('Päivämäärä ei kuulu tilikauteen ' + formatDate(period.startDate) + ' – ' + formatDate(period.endDate) + '.\n\nHaluatko siirtyä silti? Muutokset jätetään tallentamatta.')) return;
        state.changed = false;
      } else if (state.changed) {
        saveDocumentToStore();
      }
    } else if (state.changed) {
      saveDocumentToStore();
    }
    if (index === 'prev') index = state.documentIndex - 1;
    else if (index === 'next') index = state.documentIndex + 1;
    else if (index === 'first') index = 0;
    else if (index === 'last') index = state.documents.length - 1;
    if (index < 0 || index >= state.documents.length) return;
    state.documentIndex = index;
    loadCurrentDocument();
    render();
  }

  function findDocumentByNumber() {
    const num = prompt('Tositenumero?');
    if (num === null) return;
    const n = parseInt(num, 10);
    if (isNaN(n) || n < 1) { alert('Virheellinen numero.'); return; }
    const idx = state.documents.findIndex(d => d.number === n);
    if (idx >= 0) {
      if (state.changed) saveDocumentToStore();
      state.documentIndex = idx;
      loadCurrentDocument();
      render();
    } else {
      alert('Tositetta ei löytynyt.');
    }
  }

  function toggleSearch() {
    state.searchMode = !state.searchMode;
    if (!state.searchMode) {
      state.searchPhrase = '';
      closeSearchResultsPanel();
    } else {
      // Focus the input when opening
      setTimeout(() => {
        const inp = document.getElementById('searchInput');
        if (inp) inp.focus();
      }, 0);
    }
    if (state.changed) saveDocumentToStore();
    loadDocuments();
    state.documentIndex = 0;
    loadCurrentDocument();
    render();
  }

  function runSearch() {
    const q = document.getElementById('searchInput').value.trim();
    if (!q) return;
    state.searchPhrase = q;
    if (state.changed) saveDocumentToStore();

    const allPeriods = document.getElementById('searchAllPeriods')
      ? document.getElementById('searchAllPeriods').checked
      : false;

    const periods = allPeriods ? getPeriods() : (getPeriod() ? [getPeriod()] : []);
    const results = []; // { period, doc, entries, matchingEntryIds }

    periods.forEach(period => {
      const docs = getDocuments(period.id, null);
      docs.forEach(doc => {
        const entries = getEntriesByDocument(doc.id);
        const matchingIds = new Set();
        const ql = q.toLowerCase();
        if (String(doc.number || '').includes(ql)) {
          entries.forEach(e => matchingIds.add(e.id));
        }
        entries.forEach(e => {
          const acc = getAccountById(e.accountId);
          const desc = (e.description || '').toLowerCase();
          if ((acc && (String(acc.number).toLowerCase().includes(ql) || acc.name.toLowerCase().includes(ql))) || desc.includes(ql)) {
            matchingIds.add(e.id);
          }
        });
        if (matchingIds.size > 0) {
          results.push({ period, doc, entries, matchingIds });
        }
      });
    });

    showSearchResultsPanel(q, results);
  }

  function closeSearchResultsPanel() {
    const el = document.getElementById('searchResultsPanel');
    if (el) el.remove();
  }

  function showSearchResultsPanel(q, results) {
    closeSearchResultsPanel();

    const container = document.getElementById('panelContainer');
    const overlay = document.createElement('div');
    overlay.className = 'panel-overlay';
    overlay.id = 'searchResultsPanel';

    const matchCount = results.length;
    const countLabel = matchCount === 0
      ? 'Ei tuloksia'
      : matchCount === 1 ? '1 osuma' : matchCount + ' osumaa';

    let bodyHtml = '<div class="search-results-count">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-right:5px"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
      '<strong>' + countLabel + '</strong> hakusanalla <em>"' + q.replace(/</g, '&lt;') + '"</em></div>';

    if (results.length === 0) {
      bodyHtml += '<p class="search-results-empty">Hakusanaa vastaavia tositteita ei löytynyt.</p>';
    } else {
      let lastPeriodId = null;
      results.forEach((r, ri) => {
        if (r.period.id !== lastPeriodId) {
          lastPeriodId = r.period.id;
          bodyHtml += '<div class="search-period-header">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
            ' Tilikausi ' + formatDate(r.period.startDate) + ' – ' + formatDate(r.period.endDate) +
            '</div>';
        }

        const docId = r.doc.id;
        const ql = q.toLowerCase();
        bodyHtml += '<div class="search-result-card" id="src-card-' + ri + '">';
        bodyHtml += '<div class="search-result-card-header">' +
          '<span class="src-num">Tosite ' + (r.doc.number || '?') + '</span>' +
          '<span class="src-date">' + formatDate(r.doc.date) + '</span>' +
          '<button type="button" class="btn btn-icon btn-primary src-copy-btn" data-ri="' + ri + '" title="Kopioi kaikki viennit leikepöydälle">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
          'Kopioi viennit</button>' +
          '</div>';

        bodyHtml += '<table class="search-result-table"><thead><tr>' +
          '<th>Tili</th><th class="text-right">Debet</th><th class="text-right">Kredit</th><th>Selite</th>' +
          '</tr></thead><tbody>';

        r.entries.forEach(e => {
          const acc = getAccountById(e.accountId);
          const accStr = acc ? (acc.number + ' ' + acc.name) : '–';
          const deb = parseFloat(e.amountDebit != null ? e.amountDebit : (e.debit ? (e.amount || 0) : 0)) || 0;
          const cred = parseFloat(e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0)) || 0;
          const desc = (e.description || '');

          // Highlight matched text
          function hl(str) {
            if (!str) return '';
            const safe = str.replace(/</g, '&lt;');
            const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return safe.replace(new RegExp('(' + esc + ')', 'gi'), '<mark class="search-hl">$1</mark>');
          }

          const isMatch = r.matchingIds.has(e.id);
          const trClass = isMatch ? ' class="search-row-match"' : '';
          bodyHtml += '<tr' + trClass + '>' +
            '<td>' + hl(accStr) + '</td>' +
            '<td class="rd-debit">'  + (deb  ? formatNum(deb)  : '') + '</td>' +
            '<td class="rd-credit">' + (cred ? formatNum(cred) : '') + '</td>' +
            '<td>' + hl(desc) + '</td>' +
            '</tr>';
        });

        bodyHtml += '</tbody></table></div>'; // end card
      });
    }

    overlay.innerHTML = '<div class="panel search-results-panel">' +
      '<div class="panel-title">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-right:6px"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        'Hakutulokset' +
      '</div>' +
      '<div class="panel-body search-results-body">' + bodyHtml + '</div>' +
      '<div class="panel-footer">' +
        '<button type="button" class="btn" id="btnSearchResultsClose">Sulje</button>' +
      '</div></div>';

    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#btnSearchResultsClose').addEventListener('click', () => overlay.remove());

    // Wire up copy buttons
    overlay.querySelectorAll('.src-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ri = parseInt(btn.dataset.ri, 10);
        const r = results[ri];
        state.entriesClipboard = r.entries.map(e => ({
          accountId: e.accountId || 0,
          amountDebit:  parseFloat(e.amountDebit  != null ? e.amountDebit  : (e.debit  ? (e.amount || 0) : 0)) || 0,
          amountCredit: parseFloat(e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0)) || 0,
          vatAmount: parseFloat(e.vatAmount) || 0,
          description: e.description || ''
        }));
        const pasteMenuBtn = document.getElementById('menuPasteEntries');
        if (pasteMenuBtn) pasteMenuBtn.disabled = false;
        // Visual feedback
        btn.textContent = '';
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Kopioitu!';
        btn.disabled = true;
        setTimeout(() => {
          btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Kopioi viennit';
          btn.disabled = false;
        }, 1500);
      });
    });

    container.appendChild(overlay);
  }

  function addEntry() {
    if (!isDocumentEditable()) return;

    // Read the current visible totals directly from the DOM so we get gross amounts
    // (net + VAT) exactly as shown, then pre-fill the balancing side on the new row.
    let preDebit = 0, preCredit = 0;
    const tbody = document.getElementById('entriesBody');
    if (tbody && state.entries.length > 0) {
      let sumDebit = 0, sumCredit = 0;
      tbody.querySelectorAll('tr').forEach(function (tr) {
        const inputs = tr.querySelectorAll('input[type="text"]');
        // inputs: 0=debit, 1=credit, 2=vat (order matches table columns 2,3,4)
        if (inputs[0]) sumDebit  += parseNum(inputs[0].value) || 0;
        if (inputs[1]) sumCredit += parseNum(inputs[1].value) || 0;
      });
      const diff = Math.round((sumDebit - sumCredit) * 100) / 100;
      if (diff > 0) preCredit = diff;   // more debit → new row needs credit
      else if (diff < 0) preDebit = -diff; // more credit → new row needs debit
    }

    state.entries.push({
      id: null,
      documentId: state.document.id,
      accountId: 0,
      amountDebit:  preDebit,
      amountCredit: preCredit,
      vatAmount: 0,
      description: '',
      rowNumber: state.entries.length,
      flags: 0
    });
    state.changed = true;
    // Suggestions only make sense when the new row is the first counter-row (total rows = 2).
    // If more rows already exist the user is building manually — don't interfere.
    state.suggestActive = state.entries.length === 2;
    render();
  }

  function adjustEntrySelectionAfterRemove(removedIndex) {
    state.selectedEntryIndices = state.selectedEntryIndices
      .filter(function (i) { return i !== removedIndex; })
      .map(function (i) { return i > removedIndex ? i - 1 : i; });
    if (state.entrySelectionAnchorIndex != null) {
      if (state.entrySelectionAnchorIndex === removedIndex) {
        state.entrySelectionAnchorIndex = null;
      } else if (state.entrySelectionAnchorIndex > removedIndex) {
        state.entrySelectionAnchorIndex--;
      }
    }
  }

  function removeEntriesAtIndices(indices) {
    if (!isDocumentEditable()) return;
    const uniq = [...new Set(indices)]
      .filter(function (i) { return i >= 0 && i < state.entries.length; })
      .sort(function (a, b) { return b - a; });
    if (!uniq.length) return;
    uniq.forEach(function (i) { state.entries.splice(i, 1); });
    state.entries.forEach(function (e, i) { e.rowNumber = i; });
    state.changed = true;
    state.selectedEntryIndices = [];
    state.entrySelectionAnchorIndex = null;
    render();
  }

  function removeEntry(rowIndex) {
    if (!isDocumentEditable()) return;
    state.entries.splice(rowIndex, 1);
    state.entries.forEach((e, i) => e.rowNumber = i);
    state.changed = true;
    adjustEntrySelectionAfterRemove(rowIndex);
    render();
  }

  function entryRowIndexSelected(rowIndex) {
    return state.selectedEntryIndices.indexOf(rowIndex) >= 0;
  }

  function selectAllEntryRows() {
    if (!state.document || !state.entries.length) return;
    state.selectedEntryIndices = state.entries.map(function (_, i) { return i; });
    state.entrySelectionAnchorIndex = 0;
  }

  function clearEntryRowSelection() {
    state.selectedEntryIndices = [];
    state.entrySelectionAnchorIndex = null;
  }

  /** Normalize entry to have amountDebit, amountCredit and vatAmount (from legacy debit/amount). */
  function normalizeEntry(e) {
    if (e.vatAmount == null) e.vatAmount = 0;
    if (e.amountDebit != null && e.amountCredit != null) return;
    const deb = e.amountDebit != null ? e.amountDebit : (e.debit ? (e.amount || 0) : 0);
    const cred = e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0);
    e.amountDebit = deb;
    e.amountCredit = cred;
  }

  function updateEntryAccount(rowIndex, accountId) {
    const e = state.entries[rowIndex];
    e.accountId = accountId;
    const acc = accountId ? getAccountById(accountId) : null;
    if (!accountHasVat(acc)) {
      e.vatAmount = 0;
    } else {
      const rate = getAccountVatRate(acc);
      const net = e.amountDebit > 0 ? e.amountDebit : e.amountCredit;
      e.vatAmount = isReverseChargeVat(acc) ? vatFromNet(net, rate) : vatFromNet(net, rate);
    }
    state.changed = true;
  }

  function updateEntryAmount(rowIndex, isDebit, amount) {
    const e = state.entries[rowIndex];
    const v = parseFloat(amount) || 0;
    const acc = e.accountId ? getAccountById(e.accountId) : null;
    if (!accountHasVat(acc)) {
      if (isDebit) e.amountDebit = v; else e.amountCredit = v;
      e.vatAmount = 0;
    } else {
      const rate = getAccountVatRate(acc);
      let net;
      if (isReverseChargeVat(acc)) {
        net = v;
        e.vatAmount = vatFromNet(net, rate);
      } else {
        e.vatAmount = vatFromGross(v, rate);
        net = Math.round((v - e.vatAmount) * 100) / 100;
      }
      if (isDebit) {
        e.amountDebit = net;
        e.amountCredit = 0;
      } else {
        e.amountDebit = 0;
        e.amountCredit = net;
      }
    }
    state.changed = true;
  }

  function updateEntryDescription(rowIndex, desc) {
    state.entries[rowIndex].description = desc || '';
    state.changed = true;
  }

  // Delegate to global helpers in data.js so all formatting obeys the decimal separator setting.
  // formatNum and parseNum are defined globally in data.js.

  /** VAT: show/calculate ALV when account has ALV % (vatRate). Counter account (vastatili) not required for showing VAT in column. */
  const VAT_CODE_REVERSE_CHARGE = [9, 11];
  function accountHasVat(acc) {
    if (!acc) return false;
    const rate = getAccountVatRate(acc);
    return rate > 0;
  }
  function getAccountVatRate(acc) {
    if (!acc || acc.vatRate == null || acc.vatRate === '') return 0;
    return parseNum(acc.vatRate);
  }
  function isReverseChargeVat(acc) {
    return acc && VAT_CODE_REVERSE_CHARGE.indexOf(Number(acc.vatCode)) >= 0;
  }
  /** VAT from gross (user enters amount including VAT). */
  function vatFromGross(gross, rate) {
    if (!rate || rate <= 0) return 0;
    return Math.round(gross * rate / (100 + rate) * 100) / 100;
  }
  /** VAT from net (reverse-charge: user enters amount excluding VAT). */
  function vatFromNet(net, rate) {
    if (!rate || rate <= 0) return 0;
    return Math.round(net * rate / 100 * 100) / 100;
  }

  function computeReverseChargeDistribution() {
    // Same logic as renderEntriesTable(): show reverse-charge VAT on top of a single non-VAT credit contra row.
    const reverseRows = [];
    const nonVatCreditRows = [];
    state.entries.forEach((e, i) => {
      const acc0 = e.accountId ? getAccountById(e.accountId) : null;
      const vat0 = e.vatAmount != null ? e.vatAmount : 0;
      const netCredit0 = e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0);
      if (isReverseChargeVat(acc0) && vat0 > 0) reverseRows.push({ index: i, vat: vat0 });
      if (!accountHasVat(acc0) && netCredit0 > 0) nonVatCreditRows.push(i);
    });
    let reverseVatTotal = 0;
    reverseRows.forEach(r => { reverseVatTotal += r.vat; });
    const distribute = reverseRows.length > 0 && nonVatCreditRows.length === 1 && reverseVatTotal > 0;
    return {
      reverseVatTotal,
      reverseContraRowIndex: distribute ? nonVatCreditRows[0] : -1
    };
  }

  function getDisplayAmountsForTotals(entry, rowIndex, dist) {
    const acc = entry.accountId ? getAccountById(entry.accountId) : null;
    const netDebit = entry.amountDebit != null ? entry.amountDebit : (entry.debit ? (entry.amount || 0) : 0);
    const netCredit = entry.amountCredit != null ? entry.amountCredit : (!entry.debit ? (entry.amount || 0) : 0);
    const vatAmt = entry.vatAmount != null ? entry.vatAmount : 0;
    const showGross = accountHasVat(acc);
    const debitVal = showGross && netDebit > 0 ? netDebit + vatAmt : (netDebit > 0 ? netDebit : 0);
    let creditVal;
    if (showGross && netCredit > 0) {
      creditVal = netCredit + vatAmt;
    } else if (!showGross && rowIndex === dist.reverseContraRowIndex && netCredit > 0) {
      creditVal = netCredit + dist.reverseVatTotal;
    } else {
      creditVal = netCredit > 0 ? netCredit : 0;
    }
    return { debitVal, creditVal };
  }

  /** Totals match what the table displays (gross where applicable). */
  function getDebitTotal() {
    const dist = computeReverseChargeDistribution();
    return state.entries.reduce((sum, e, i) => sum + getDisplayAmountsForTotals(e, i, dist).debitVal, 0);
  }

  function getCreditTotal() {
    const dist = computeReverseChargeDistribution();
    return state.entries.reduce((sum, e, i) => sum + getDisplayAmountsForTotals(e, i, dist).creditVal, 0);
  }

  function addEntriesFromTemplate(templateNumber) {
    if (!isDocumentEditable()) return;
    const templates = getEntryTemplatesByNumber(templateNumber);
    const accounts = getAccounts();
    templates.forEach(t => {
      const acc = accounts.find(a => a.id === t.accountId);
      state.entries.push({
        id: null,
        documentId: state.document.id,
        accountId: t.accountId,
        amountDebit: t.debit ? (t.amount || 0) : 0,
        amountCredit: !t.debit ? (t.amount || 0) : 0,
        vatAmount: 0,
        description: t.description || '',
        rowNumber: state.entries.length,
        flags: 0
      });
    });
    state.entries.forEach(e => {
      const acc = e.accountId ? getAccountById(e.accountId) : null;
      if (accountHasVat(acc)) {
        const net = (e.amountDebit || 0) > 0 ? e.amountDebit : (e.amountCredit || 0);
        e.vatAmount = vatFromNet(net, getAccountVatRate(acc));
      }
    });
    state.changed = true;
    render();
  }

  function copySelectedEntries() {
    if (!state.document || !isDocumentEditable()) return;
    const indices = state.selectedEntryIndices.slice().sort(function (a, b) { return a - b; })
      .filter(function (i) { return i >= 0 && i < state.entries.length; });
    if (!indices.length) return;
    state.entriesClipboard = indices.map(function (idx) {
      const e = state.entries[idx];
      return {
        accountId: e.accountId || 0,
        amountDebit: e.amountDebit != null ? e.amountDebit : (e.debit ? (e.amount || 0) : 0),
        amountCredit: e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0),
        vatAmount: e.vatAmount != null ? e.vatAmount : 0,
        description: e.description || ''
      };
    });
    const pasteBtn = document.getElementById('menuPasteEntries');
    if (pasteBtn) pasteBtn.disabled = false;
  }

  function pasteEntries() {
    if (!state.document || !isDocumentEditable()) return;
    if (!state.entriesClipboard || state.entriesClipboard.length === 0) {
      return;
    }
    state.entriesClipboard.forEach(clip => {
      state.entries.push({
        id: null,
        documentId: state.document.id,
        accountId: clip.accountId || 0,
        amountDebit: clip.amountDebit != null ? clip.amountDebit : 0,
        amountCredit: clip.amountCredit != null ? clip.amountCredit : 0,
        vatAmount: clip.vatAmount != null ? clip.vatAmount : 0,
        description: clip.description || '',
        rowNumber: state.entries.length,
        flags: 0
      });
    });
    state.entries.forEach((e, i) => { e.rowNumber = i; });
    state.changed = true;
    render();
  }

  function createEntryTemplateFromCurrentDocument() {
    if (!state.document || !state.entries.length) {
      alert('Ei tositetta tai vientejä. Avaa tosite ja lisää vähintään yksi vienti.');
      return;
    }
    const templates = getEntryTemplates();
    const nextNum = templates.length ? Math.max.apply(null, templates.map(t => t.number || 0)) + 1 : 1;
    const name = prompt('Vientimallin nimi:', 'Tositteesta ' + (state.document.date || '')) || 'Tositteesta';
    state.entries.forEach((e, i) => {
      const deb = e.amountDebit != null ? e.amountDebit : (e.debit ? (e.amount || 0) : 0);
      const cred = e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0);
      saveEntryTemplate({
        number: nextNum,
        name: name,
        accountId: e.accountId || 0,
        debit: deb > 0,
        amount: deb > 0 ? deb : cred,
        description: e.description || '',
        rowNumber: i
      });
    });
    document.querySelectorAll('.menu-dropdown').forEach(d => d.classList.add('hidden'));
    if (window.openEntryTemplatesPanel) window.openEntryTemplatesPanel();
  }

  // --- Render ---
  function renderHeader() {
    const settings = getSettings();
    const titleEl = document.getElementById('appTitle');
    if (titleEl) {
      titleEl.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;margin-right:8px;opacity:.85"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>' + APP_NAME;
    }
    const subtitleEl = document.getElementById('appSubtitle');
    if (subtitleEl) {
      subtitleEl.textContent = settings.name || '';
    }
  }

  function renderToolbar() {
    const period = getPeriod();
    const docType = getDocType();
    const hasData = period && docType && state.documents.length >= 0;
    const canEdit = isDocumentEditable();

    const btnFirst = document.getElementById('btnFirst');
    const btnLast = document.getElementById('btnLast');
    const isFirst = !hasData || state.documentIndex <= 0;
    const isLast  = !hasData || state.documentIndex >= state.documents.length - 1;
    document.getElementById('btnPrev').disabled = isFirst;
    document.getElementById('btnNext').disabled = isLast;
    if (btnFirst) { btnFirst.disabled = isFirst; btnFirst.classList.toggle('btn-at-edge', hasData && isFirst); }
    if (btnLast)  { btnLast.disabled  = isLast;  btnLast.classList.toggle('btn-at-edge',  hasData && isLast); }
    document.getElementById('btnNewDoc').disabled = !period || !docType || (period.locked);
    document.getElementById('btnDeleteDoc').disabled = !state.document || !canEdit;
    document.getElementById('btnAddEntry').disabled = !canEdit;
    document.getElementById('btnRemoveEntry').disabled = !canEdit || state.entries.length === 0;
  }

  function renderDocForm() {
    const doc = state.document;
    const canEdit = isDocumentEditable();
    const numEl = document.getElementById('docNumber');
    const emptyHint = document.getElementById('docNumberEmptyHint');
    const period = getPeriod();
    const docType = getDocType();
    const totalForType = period && docType ? getDocumentsForDocTypeStrict(period.id, docType.id).length : 0;
    const noDocsForType = period && docType && !doc && totalForType === 0;
    const displayEl = document.getElementById('docDateDisplay');
    const pickerBtn = document.getElementById('docDatePickerBtn');
    if (noDocsForType) {
      numEl.classList.add('hidden');
      numEl.value = '';
      if (emptyHint) emptyHint.classList.remove('hidden');
      setDocDateDisplay('');
      if (displayEl) { displayEl.readOnly = true; displayEl.placeholder = ''; }
      if (pickerBtn) pickerBtn.disabled = true;
    } else {
      numEl.classList.remove('hidden');
      if (emptyHint) emptyHint.classList.add('hidden');
      if (doc) {
        numEl.value = doc.number != null && doc.number !== '' ? doc.number : '';
        setDocDateDisplay(doc.date || '');
        numEl.readOnly = !canEdit;
        if (displayEl) { displayEl.readOnly = !canEdit; displayEl.placeholder = canEdit ? 'pp.kk.vvvv' : ''; }
        if (pickerBtn) pickerBtn.disabled = !canEdit;
      } else {
        numEl.value = '';
        setDocDateDisplay('');
      }
    }
    updateDocDateWarning();
  }

  function renderEntriesTable() {
    state.selectedEntryIndices = state.selectedEntryIndices.filter(function (i) {
      return i >= 0 && i < state.entries.length;
    });
    const tbody = document.getElementById('entriesBody');
    tbody.innerHTML = '';
    const accounts = getAccounts();
    const canEdit = isDocumentEditable();
    const vatVisible = getSetting('vatVisible', 'true') !== 'false';

    // Detect simple reverse-charge pattern: one reverse-charge row with VAT and one non-VAT credit row.
    const reverseRows = [];
    const nonVatCreditRows = [];
    state.entries.forEach((e, i) => {
      const acc0 = e.accountId ? getAccountById(e.accountId) : null;
      const vat0 = e.vatAmount != null ? e.vatAmount : 0;
      const netDebit0 = e.amountDebit != null ? e.amountDebit : (e.debit ? (e.amount || 0) : 0);
      const netCredit0 = e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0);
      if (isReverseChargeVat(acc0) && vat0 > 0) {
        reverseRows.push({ index: i, vat: vat0 });
      }
      if (!accountHasVat(acc0) && netCredit0 > 0) {
        nonVatCreditRows.push(i);
      }
    });
    let reverseVatTotal = 0;
    reverseRows.forEach(r => { reverseVatTotal += r.vat; });
    const distributeReverseVatToCredits = reverseRows.length > 0 && nonVatCreditRows.length === 1 && reverseVatTotal > 0;
    const reverseContraRowIndex = distributeReverseVatToCredits ? nonVatCreditRows[0] : -1;

    state.entries.forEach((entry, rowIndex) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-row-index', rowIndex);
      if (canEdit) {
        tr.addEventListener('click', function (e) {
          if (e.target.closest('input') || e.target.closest('.picker-trigger')) return;
          const anchor = state.entrySelectionAnchorIndex;
          const anchorOk = anchor != null && anchor >= 0 && anchor < state.entries.length;
          if (e.shiftKey && anchorOk) {
            const a = Math.min(anchor, rowIndex);
            const b = Math.max(anchor, rowIndex);
            state.selectedEntryIndices = [];
            for (let i = a; i <= b; i++) state.selectedEntryIndices.push(i);
          } else {
            state.selectedEntryIndices = [rowIndex];
            state.entrySelectionAnchorIndex = rowIndex;
          }
          render();
        });
      }
      tr.classList.toggle('selected', entryRowIndexSelected(rowIndex));
      const acc = entry.accountId ? getAccountById(entry.accountId) : null;
      const accText = acc ? acc.number + ' ' + acc.name : '— Valitse tili —';

      const accountPicker = document.createElement('span');
      accountPicker.className = 'picker-trigger' + (!canEdit ? ' disabled' : '');
      accountPicker.textContent = accText;
      accountPicker.setAttribute('data-row-index', rowIndex);
      accountPicker.setAttribute('data-value', entry.accountId || '');
      if (canEdit) {
        accountPicker.addEventListener('click', function () {
          const opts = [{ value: 0, label: '— Valitse tili —' }];
          accounts.forEach(function (a) {
            opts.push({ value: a.id, label: (a.number || '') + ' ' + (a.name || ''), favourite: !!(a.flags & 1) });
          });
          window.TilitinPicker.open(accountPicker, 'Valitse tili', opts, function (value, label) {
            const id = value === 0 || value === '0' ? 0 : parseInt(value, 10);
            updateEntryAccount(rowIndex, id);
            accountPicker.setAttribute('data-value', id || '');
            accountPicker.textContent = id ? label : '— Valitse tili —';
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
      }

      const netDebit = entry.amountDebit != null ? entry.amountDebit : (entry.debit ? (entry.amount || 0) : 0);
      const netCredit = entry.amountCredit != null ? entry.amountCredit : (!entry.debit ? (entry.amount || 0) : 0);
      const vatAmt = entry.vatAmount != null ? entry.vatAmount : 0;
      const showGross = accountHasVat(acc);
      const debitVal = showGross && netDebit > 0 ? netDebit + vatAmt : netDebit;
      let creditVal;
      if (showGross && netCredit > 0) {
        creditVal = netCredit + vatAmt;
      } else if (!showGross && rowIndex === reverseContraRowIndex && netCredit > 0) {
        // Reverse-charge: show VAT on top also on the non-VAT contra row.
        creditVal = netCredit + reverseVatTotal;
      } else {
        creditVal = netCredit;
      }

      const debitInput = document.createElement('input');
      debitInput.type = 'text';
      debitInput.value = debitVal ? formatNum(debitVal) : '';
      debitInput.disabled = !canEdit;
      debitInput.addEventListener('input', () => {
        const v = parseNum(debitInput.value);
        updateEntryAmount(rowIndex, true, v);
      });
      debitInput.addEventListener('change', () => {
        const v = parseNum(debitInput.value);
        updateEntryAmount(rowIndex, true, v);
        render();
      });

      const creditInput = document.createElement('input');
      creditInput.type = 'text';
      creditInput.value = creditVal ? formatNum(creditVal) : '';
      creditInput.disabled = !canEdit;
      creditInput.addEventListener('input', () => {
        const v = parseNum(creditInput.value);
        updateEntryAmount(rowIndex, false, v);
      });
      creditInput.addEventListener('change', () => {
        const v = parseNum(creditInput.value);
        updateEntryAmount(rowIndex, false, v);
        render();
      });

      const vatInput = document.createElement('input');
      vatInput.type = 'text';
      vatInput.value = vatAmt ? formatNum(vatAmt) : '';
      vatInput.disabled = true;

      const descInput = document.createElement('input');
      descInput.type = 'text';
      descInput.value = entry.description || '';
      descInput.disabled = !canEdit;
      descInput.addEventListener('input', () => updateEntryDescription(rowIndex, descInput.value));
      descInput.addEventListener('change', () => updateEntryDescription(rowIndex, descInput.value));

      const tdAcc = document.createElement('td');
      tdAcc.className = 'col-account';
      tdAcc.appendChild(accountPicker);
      const tdDebit = document.createElement('td');
      tdDebit.className = 'col-debit amount-debit';
      tdDebit.appendChild(debitInput);
      const tdCredit = document.createElement('td');
      tdCredit.className = 'col-credit amount-credit';
      tdCredit.appendChild(creditInput);
      const tdVat = document.createElement('td');
      tdVat.className = 'col-vat amount-vat';
      tdVat.appendChild(vatInput);
      const tdDesc = document.createElement('td');
      tdDesc.className = 'col-desc';
      tdDesc.appendChild(descInput);

      tr.appendChild(tdAcc);
      tr.appendChild(tdDebit);
      tr.appendChild(tdCredit);
      if (vatVisible) tr.appendChild(tdVat);
      tr.appendChild(tdDesc);
      tbody.appendChild(tr);
    });
  }

  // ── Smart Suggest ──────────────────────────────────────────────────────────
  //
  // The full suggestion index is built ONCE at startup (deferred) and kept in
  // memory. It maps firstAccountId → sorted array of suggestion objects.
  // A lookup is then a single object-property read — no localStorage scanning.
  // The index is invalidated (and rebuilt) whenever a document is saved.

  let _suggestIndex = null;       // null = not yet built; {} = built (may be empty)
  let _suggestIndexTimer = null;

  /** Schedule a (re)build of the index after a short delay. */
  function scheduleSuggestIndexBuild(delayMs) {
    if (_suggestIndexTimer) clearTimeout(_suggestIndexTimer);
    _suggestIndex = null;         // mark stale immediately
    _suggestIndexTimer = setTimeout(_buildSuggestIndex, delayMs != null ? delayMs : 800);
  }

  /** Build the full index: one pass over ALL documents/entries, grouped by first-account. */
  function _buildSuggestIndex() {
    _suggestIndexTimer = null;
    try {
      const byFirstAccount = {};  // accountId (string) → { [patternKey]: {rows, usedCount, lastDate} }
      const periods = getPeriods();

      periods.forEach(function (period) {
        getDocuments(period.id, null).forEach(function (doc) {
          const entries = getEntriesByDocument(doc.id);
          if (!entries.length) return;
          const visible = entries.filter(function (e) { return (e.rowNumber || 0) < 100000; });
          if (visible.length < 2) return;  // need at least 2 rows to suggest anything

          const firstAccId = String(visible[0].accountId);
          const rest = visible.slice(1);

          const key = rest.map(function (e) {
            const d = parseFloat(e.amountDebit) || 0;
            const c = parseFloat(e.amountCredit) || 0;
            return e.accountId + (d > 0 ? 'D' : c > 0 ? 'C' : '');
          }).join('|');

          if (!byFirstAccount[firstAccId]) byFirstAccount[firstAccId] = {};
          const bucket = byFirstAccount[firstAccId];
          if (!bucket[key]) bucket[key] = { rows: rest, usedCount: 0, lastDate: '' };
          bucket[key].usedCount++;
          if ((doc.date || '') > bucket[key].lastDate) bucket[key].lastDate = doc.date || '';
        });
      });

      // Sort each account's patterns and keep top 6.
      const index = {};
      Object.keys(byFirstAccount).forEach(function (accId) {
        index[accId] = Object.values(byFirstAccount[accId])
          .sort(function (a, b) {
            if (b.lastDate !== a.lastDate) return b.lastDate.localeCompare(a.lastDate);
            return b.usedCount - a.usedCount;
          })
          .slice(0, 6);
      });

      _suggestIndex = index;
    } catch (_) {
      _suggestIndex = {};   // empty but not null — don't retry on error
    }

    // If the suggest bar is currently visible, refresh it with the new index.
    if (state.suggestActive) renderSmartSuggest();
  }

  /**
   * Look up suggestions for a given first-account from the pre-built index.
   * Returns [] immediately if the index isn't ready yet (it will re-render when done).
   */
  function buildSmartSuggestions(firstAccountId) {
    if (!firstAccountId) return [];
    if (_suggestIndex === null) return [];   // still building — bar will update when ready
    // Exclude any pattern that contains the document currently being edited.
    const currentDocId = state.document && state.document.id;
    return (_suggestIndex[String(firstAccountId)] || []).filter(function (sug) {
      // Filter out suggestions where every row came from the current document
      // (can happen right after a save before index is rebuilt).
      if (!currentDocId) return true;
      return sug.rows.some(function (r) { return r.documentId !== currentDocId; });
    });
  }

  function suggestLabel(rows) {
    return rows.slice(0, 3).map(function (e) {
      const acc = getAccountById(e.accountId);
      const name = acc ? (acc.number + ' ' + acc.name) : ('tili ' + e.accountId);
      return name.length > 26 ? name.slice(0, 24) + '…' : name;
    }).join(', ') + (rows.length > 3 ? ' +' + (rows.length - 3) + ' muuta' : '');
  }

  /** Apply a suggestion: fill remaining rows after row 0 using the first row's amount. */
  function applySuggestion(sugRows) {
    if (!state.document || !isDocumentEditable()) return;
    const first = state.entries.length ? state.entries[0] : null;
    state.entries = first ? [first] : [];

    // Read the value directly from the visible DOM input of row 0 — this is the
    // gross amount the user sees (net + vat), which is what we want to copy.
    const firstRow = document.querySelector('#entriesBody tr:first-child');
    const firstDebitInput  = firstRow && firstRow.querySelector('td:nth-child(2) input');
    const firstCreditInput = firstRow && firstRow.querySelector('td:nth-child(3) input');
    const domDebit  = firstDebitInput  ? (parseNum(firstDebitInput.value)  || 0) : 0;
    const domCredit = firstCreditInput ? (parseNum(firstCreditInput.value) || 0) : 0;
    const firstIsDebit = domDebit > 0;
    const counterAmt = firstIsDebit ? domDebit : domCredit;
    const desc = (first && first.description) || '';

    sugRows.forEach(function (src) {
      state.entries.push({
        id: null,
        documentId: state.document ? state.document.id : null,
        accountId: src.accountId,
        amountDebit:  firstIsDebit ? 0 : counterAmt,
        amountCredit: firstIsDebit ? counterAmt : 0,
        vatAmount: 0,
        description: src.description || desc,
        rowNumber: 0,
        flags: 0
      });
    });

    // Suggestion applied — no need to show again until user adds another entry.
    state.suggestActive = false;
    state.changed = true;
    render();
  }

  function renderSmartSuggest() {
    const bar = document.getElementById('smartSuggestBar');
    if (!bar) return;

    // Only active when user explicitly clicked "Lisää vienti" — never during browsing.
    if (!state.suggestActive) { bar.classList.add('hidden'); return; }

    try {
      const canEdit = isDocumentEditable();
      if (!canEdit || state.entries.length === 0) { bar.classList.add('hidden'); return; }

      const firstEntry = state.entries[0];
      if (!firstEntry || !firstEntry.accountId) { bar.classList.add('hidden'); return; }

      // Only show suggestions when there is exactly one row — the first row the user just filled.
      // Once they start adding more rows manually, get out of the way.
      if (state.entries.length > 1) {
        state.suggestActive = false;
        bar.classList.add('hidden');
        return;
      }

      const suggestions = buildSmartSuggestions(firstEntry.accountId);
      if (!suggestions.length) { bar.classList.add('hidden'); return; }

      bar.classList.remove('hidden');
      bar.innerHTML = '';

      const label = document.createElement('span');
      label.className = 'smart-suggest-label';
      label.innerHTML =
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
        'stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px;opacity:.6">' +
        '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' +
        '</svg>Täytä historiasta:';
      bar.appendChild(label);

      suggestions.forEach(function (sug) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'smart-suggest-chip';
        chip.title = 'Käytetty ' + sug.usedCount + ' kertaa, viimeksi ' + formatDate(sug.lastDate) +
          '\nKlikkaa lisätäksesi rivit';
        chip.innerHTML =
          '<svg class="smart-suggest-chip-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" ' +
          'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>' +
          '<polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>' +
          '<span class="smart-suggest-chip-text">' + suggestLabel(sug.rows).replace(/</g, '&lt;') + '</span>' +
          '<span class="smart-suggest-chip-count">' + sug.usedCount + '×</span>';
        chip.addEventListener('click', function () { applySuggestion(sug.rows); });
        bar.appendChild(chip);
      });
    } catch (_) {
      bar.classList.add('hidden');
    }
  }

  function renderTotals() {
    const debit = getDebitTotal();
    const credit = getCreditTotal();
    const diff = Math.abs(credit - debit);
    document.getElementById('totalDebit').textContent = formatNum(debit);
    document.getElementById('totalCredit').textContent = formatNum(credit);
    const diffEl = document.getElementById('totalDiff');
    diffEl.textContent = formatNum(diff);
    const isError = diff > 0.001;
    diffEl.classList.toggle('diff-error', isError);
    const chip = document.getElementById('chipDiff');
    if (chip) chip.classList.toggle('diff-error', isError);
  }

  function renderSearchBar() {
    document.getElementById('searchBar').classList.toggle('hidden', !state.searchMode);
  }

  function renderStatusBar() {
    const period = getPeriod();
    const docType = getDocType();
    let periodText = '';
    if (period) {
      periodText = 'Tilikausi ' + formatDate(period.startDate) + ' – ' + formatDate(period.endDate);
    }
    document.getElementById('statusPeriod').textContent = periodText;

    let posText = '';
    if (state.documents.length > 0) {
      posText = 'Tosite ' + (state.documentIndex + 1) + ' / ' + state.documents.length;
      if (state.searchMode) posText += ' (haku)';
    }
    document.getElementById('statusPosition').textContent = posText;
    const docTypeLabel = docType ? docType.name + (docType.numberStart != null || docType.numberEnd != null ? ' (' + (docType.numberStart ?? '') + '–' + (docType.numberEnd ?? '') + ')' : '') : '';
    document.getElementById('statusDocType').textContent = docTypeLabel;
    const unsavedEl = document.getElementById('docUnsaved');
    if (unsavedEl) {
      unsavedEl.style.display = state.changed ? 'inline-block' : 'none';
    }

    // Defer heavy stats calculation so it never blocks the UI paint.
    scheduleStatsUpdate();
    renderBackupFooter();
  }

  function renderBackupFooter() {
    const el = document.getElementById('statusBackupRow');
    if (!el) return;

    const at = getSetting('lastSqliteBackupAt', '');
    const rawCount = parseInt(getSetting('lastSqliteBackupEntryCount', '0'), 10);
    const countAtBackup = isNaN(rawCount) ? 0 : rawCount;
    const nowCount = typeof getTotalEntryCount === 'function' ? getTotalEntryCount() : 0;
    const entriesSince = Math.max(0, nowCount - countAtBackup);

    const weekMs = 7 * 24 * 60 * 60 * 1000;
    let tooOld = false;
    if (!at) {
      tooOld = true;
    } else {
      const t = new Date(at).getTime();
      tooOld = isNaN(t) || (Date.now() - t > weekMs);
    }
    const tooManyEntries = entriesSince > 10;
    const warn = tooOld || tooManyEntries;

    let dateStr = '';
    if (at) {
      const d = new Date(at);
      if (!isNaN(d.getTime())) {
        dateStr = d.toLocaleString('fi-FI', { dateStyle: 'short', timeStyle: 'short' });
      }
    }

    const warnIcon = warn
      ? '<span class="backup-warn-icon" title="Varmuuskopio kannattaa tehdä uudelleen" aria-hidden="true">&#9888;</span> '
      : '';

    const kirjausOsuus = entriesSince === 1 ? '<strong>1</strong> kirjaus' : '<strong>' + entriesSince + '</strong> kirjausta';

    let body = '';
    if (!at) {
      body = '<span class="backup-text">Ei vielä SQLite-varmuuskopiota.</span>';
    } else {
      body = '<span class="backup-text">Viimeisin varmuuskopio tehty: <strong>' + dateStr + '</strong>. Se oli ' + kirjausOsuus + ' sitten.</span>';
    }
    body += ' <a href="#" class="backup-link" id="linkBackupNow">Varmuuskopioi nyt</a>';

    el.innerHTML = warnIcon + body;

    const link = el.querySelector('#linkBackupNow');
    if (link) {
      link.onclick = function (e) {
        e.preventDefault();
        if (window.TilitinExportSQLite && window.TilitinExportSQLite.exportToSQLite) {
          window.TilitinExportSQLite.exportToSQLite();
        }
      };
    }
  }

  let _statsTimer = null;
  function scheduleStatsUpdate() {
    if (_statsTimer) clearTimeout(_statsTimer);
    _statsTimer = setTimeout(computeAndRenderStats, 10000);
  }

  function computeAndRenderStats() {
    _statsTimer = null;
    const statsArea = document.getElementById('statsArea');
    if (!statsArea) return;

    const periods = getPeriods();
    if (!periods.length) { statsArea.innerHTML = ''; return; }

    const currentPeriod = getPeriod();
    const accounts = getAccounts();

    // Accumulate across all periods in a single pass.
    let totalEntries = 0;
    let currentPeriodEntries = 0;
    let totalRevenue = 0;   // liikevaihto = sum of revenue-type (type=3) credits net
    let totalProfit = 0;    // net profit = revenue - expenses across all periods

    // Build account type map for quick lookup.
    const accTypeMap = {};
    accounts.forEach(a => { accTypeMap[a.id] = Number(a.type); });

    periods.forEach(period => {
      const docs = getDocuments(period.id, null);
      const isCurrentPeriod = currentPeriod && period.id === currentPeriod.id;

      // Starting balances contribute to profit/revenue totals.
      const sb = getStartingBalances(period.id);
      Object.entries(sb).forEach(([accId, bal]) => {
        const type = accTypeMap[Number(accId)];
        const deb  = parseFloat(bal.debit)  || 0;
        const cred = parseFloat(bal.credit) || 0;
        if (type === 3) totalRevenue += cred - deb; // revenue: net credit
        if (type === 3) totalProfit  += cred - deb;
        if (type === 4) totalProfit  -= deb - cred; // expense: net debit reduces profit
      });

      docs.forEach(doc => {
        const entries = getEntriesByDocument(doc.id);
        entries.forEach(e => {
          totalEntries++;
          if (isCurrentPeriod) currentPeriodEntries++;

          const type = accTypeMap[e.accountId];
          const deb  = parseFloat(e.amountDebit  != null ? e.amountDebit  : (e.debit  ? (e.amount || 0) : 0)) || 0;
          const cred = parseFloat(e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0)) || 0;

          if (type === 3) { // revenue
            totalRevenue += cred - deb;
            totalProfit  += cred - deb;
          }
          if (type === 4) { // expense
            totalProfit  -= deb - cred;
          }
        });
      });
    });

    function fmtEur(n) {
      return formatNum(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + ' €';
    }

    const profitColor = totalProfit >= 0 ? 'var(--debit)' : 'var(--error)';
    const profitLabel = totalProfit >= 0 ? 'Voitto' : 'Tappio';

    const chips = [
      { label: 'Tilikausia',          value: periods.length,                       color: '' },
      { label: 'Kirjauksia yhteensä', value: totalEntries.toLocaleString('fi-FI'), color: '' },
      { label: 'Kirjauksia ' + (currentPeriod ? currentPeriod.startDate.slice(0,4) : 'nyt'),
        value: currentPeriodEntries.toLocaleString('fi-FI'),                        color: '' },
      { label: 'Liikevaihto yht.',    value: fmtEur(totalRevenue),                 color: 'var(--debit)' },
      { label: profitLabel + ' yht.', value: fmtEur(Math.abs(totalProfit)),         color: profitColor },
    ];

    statsArea.innerHTML = chips.map(c =>
      '<span class="status-stat-chip">' +
        '<span class="stat-label">' + c.label + '</span>' +
        '<span class="stat-value"' + (c.color ? ' style="color:' + c.color + '"' : '') + '>' + c.value + '</span>' +
      '</span>'
    ).join('');
  }

  const EDIT_DOC_TYPES_SENTINEL = '__edit__';

  function renderDocumentTypeSelect() {
    const types = getDocumentTypes();
    const sel = document.getElementById('docTypeSelect');
    if (!sel) return;
    sel.innerHTML = '';
    const current = getDocType();
    types.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      const range = (t.numberStart != null || t.numberEnd != null) ? ' (' + (t.numberStart ?? '') + '–' + (t.numberEnd ?? '') + ')' : '';
      opt.textContent = (t.name || '') + range;
      if (current && t.id === current.id) opt.selected = true;
      sel.appendChild(opt);
    });
    // Separator + edit action as the last option.
    const sep = document.createElement('option');
    sep.disabled = true;
    sep.textContent = '─────────────';
    sel.appendChild(sep);
    const editOpt = document.createElement('option');
    editOpt.value = EDIT_DOC_TYPES_SENTINEL;
    editOpt.textContent = '✎ Muokkaa tositelajeja…';
    sel.appendChild(editOpt);

    sel.onchange = () => {
      const val = sel.value;
      const current = getDocType();
      if (val === EDIT_DOC_TYPES_SENTINEL) {
        // Restore the previously selected type before opening the panel.
        sel.value = (current && current.id) || '';
        openDocumentTypesPanel();
        return;
      }
      const newTypeId = parseInt(val, 10);
      if (state.changed && !confirm('Tallenna muutokset ensin?')) { sel.value = (current && current.id) || ''; return; }
      switchToDocumentType(isNaN(newTypeId) ? null : newTypeId);
      render();
    };
  }

  function renderEntryTemplateMenu() {
    // The standalone Vientimallit button was removed; templates are accessed via Muokkaa menu.
  }

  function render() {
    renderHeader();
    renderToolbar();
    renderDocForm();
    const thVat = document.getElementById('thVat');
    if (thVat) thVat.style.display = getSetting('vatVisible', 'true') !== 'false' ? '' : 'none';
    renderEntriesTable();
    renderSmartSuggest();
    renderTotals();
    renderSearchBar();
    renderStatusBar();
    renderDocumentTypeSelect();
    renderEntryTemplateMenu();
    const pasteBtn = document.getElementById('menuPasteEntries');
    if (pasteBtn) pasteBtn.disabled = !state.entriesClipboard || state.entriesClipboard.length === 0;
  }

  function init() {
    applyFontSize(getSettingsFontSize());
    ensureDefaultData();
    loadDocuments();
    loadCurrentDocument();
    scheduleSuggestIndexBuild(1500);  // build after UI has fully painted

    // If the index is still null after 10 s of mouse inactivity, trigger a background build.
    (function setupIdleIndexBuild() {
      var _idleTimer = null;
      var IDLE_MS = 10000;
      function onActivity() {
        if (_idleTimer) clearTimeout(_idleTimer);
        if (_suggestIndex !== null) return; // already built, nothing to do
        _idleTimer = setTimeout(function () {
          if (_suggestIndex === null) scheduleSuggestIndexBuild(0);
        }, IDLE_MS);
      }
      document.addEventListener('mousemove', onActivity, { passive: true });
      document.addEventListener('keydown',   onActivity, { passive: true });
    }());

    document.getElementById('btnSave').onclick = () => {
      if (!state.document) return;
      const period = getPeriod();
      if (!state.document.date || (period && (state.document.date < period.startDate || state.document.date > period.endDate))) {
        alert('Päivämäärä ei kuulu tilikaudelle.');
        return;
      }
      state.document.number = parseInt(document.getElementById('docNumber').value, 10) || 1;
      state.document.date = getDocDateYmd();
      saveDocumentToStore();
      render();
    };

    const btnFirst = document.getElementById('btnFirst');
    if (btnFirst) btnFirst.onclick = () => goToDocument('first');
    document.getElementById('btnPrev').onclick = () => goToDocument('prev');
    document.getElementById('btnNext').onclick = () => goToDocument('next');
    const btnLast = document.getElementById('btnLast');
    if (btnLast) btnLast.onclick = () => goToDocument('last');
    document.getElementById('btnNewDoc').onclick = createNewDocument;
    document.getElementById('btnDeleteDoc').onclick = deleteCurrentDocument;
    document.getElementById('btnAddEntry').onclick = addEntry;
    document.getElementById('btnRemoveEntry').onclick = () => {
      if (state.selectedEntryIndices.length) {
        removeEntriesAtIndices(state.selectedEntryIndices.slice());
      } else if (state.entries.length) {
        removeEntry(state.entries.length - 1);
      }
    };
    document.getElementById('btnFindByNumber').onclick = findDocumentByNumber;
    document.getElementById('btnSearch').onclick = toggleSearch;
    document.getElementById('searchInput').onkeydown = (e) => { if (e.key === 'Enter') runSearch(); };

    document.addEventListener('keydown', function (e) {
      // Never intercept when typing in an input, textarea or contenteditable.
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      const inInput = tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable);

      // Escape: close any open panel/overlay.
      if (e.key === 'Escape') {
        const overlay = document.querySelector('.panel-overlay');
        if (overlay) { overlay.remove(); e.preventDefault(); return; }
        const dropdowns = document.querySelectorAll('.menu-dropdown:not(.hidden)');
        if (dropdowns.length) { dropdowns.forEach(d => d.classList.add('hidden')); e.preventDefault(); return; }
      }

      if (inInput) return;

      const ctrl = e.ctrlKey || e.metaKey;

      // Navigation: PageUp/PageDown = prev/next, Ctrl+PageUp/PageDown = first/last.
      if (e.key === 'PageUp' && !ctrl)   { e.preventDefault(); goToDocument('prev'); return; }
      if (e.key === 'PageDown' && !ctrl) { e.preventDefault(); goToDocument('next'); return; }
      if (e.key === 'PageUp' && ctrl)    { e.preventDefault(); goToDocument('first'); return; }
      if (e.key === 'PageDown' && ctrl)  { e.preventDefault(); goToDocument('last'); return; }

      if (!ctrl) return; // rest all require Ctrl/Cmd

      switch (e.key.toLowerCase()) {
        case 's': // Ctrl+S → save
          e.preventDefault();
          if (!state.document) return;
          if (state.document.number == null) state.document.number = parseInt(document.getElementById('docNumber').value, 10) || 1;
          if (state.document.date == null) state.document.date = getDocDateYmd();
          saveDocumentToStore();
          render();
          break;
        case 'n': // Ctrl+N → new tosite
          e.preventDefault();
          createNewDocument();
          break;
        case 'c': // Ctrl+C → copy selected entry
          e.preventDefault();
          copySelectedEntries();
          break;
        case 'v': // Ctrl+V → paste entry
          e.preventDefault();
          pasteEntries();
          break;
        case 'f': // Ctrl+F → toggle search
          e.preventDefault();
          toggleSearch();
          break;
        case 'g': // Ctrl+G → go to by number
          e.preventDefault();
          findDocumentByNumber();
          break;
      }

      // Ctrl+Delete → delete tosite
      if (e.key === 'Delete') { e.preventDefault(); deleteCurrentDocument(); }
    });

    // F8 or Insert → add entry (outside inputs only).
    document.addEventListener('keydown', function (e) {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      const inInput = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (inInput) return;
      if (e.key === 'F8' || e.key === 'Insert') { e.preventDefault(); addEntry(); render(); }
      if (e.key === 'Delete' && !e.ctrlKey) {
        e.preventDefault();
        if (state.selectedEntryIndices.length) {
          removeEntriesAtIndices(state.selectedEntryIndices.slice());
        }
      }
    });
    document.getElementById('btnSearchRun').onclick = runSearch;

    document.getElementById('docNumber').onchange = () => { if (state.document) state.document.number = parseInt(document.getElementById('docNumber').value, 10) || 0; state.changed = true; };
    document.getElementById('docNumber').oninput = () => { if (state.document) state.document.number = parseInt(document.getElementById('docNumber').value, 10) || 0; state.changed = true; };
    // Date display field: parse typed text → ISO on change/blur
    const docDateDisplayEl = document.getElementById('docDateDisplay');
    const docDateHiddenEl  = document.getElementById('docDate');
    const docDatePickerBtn = document.getElementById('docDatePickerBtn');

    function onDocDateChange() {
      const ymd = parseDisplayDateToYmd(docDateDisplayEl.value);
      if (ymd) {
        if (state.document) state.document.date = ymd;
        // Reformat display to canonical form
        setDocDateDisplay(ymd);
      } else if (!docDateDisplayEl.value.trim()) {
        if (state.document) state.document.date = '';
      }
      state.changed = true;
      updateDocDateWarning();
    }

    docDateDisplayEl.addEventListener('change', onDocDateChange);
    docDateDisplayEl.addEventListener('blur',   onDocDateChange);
    docDateDisplayEl.addEventListener('input',  () => {
      // Update state live for warnings but don't reformat yet (user is typing)
      const ymd = parseDisplayDateToYmd(docDateDisplayEl.value);
      if (ymd && state.document) state.document.date = ymd;
      state.changed = true;
      updateDocDateWarning();
    });

    // Picker button: show native date picker by programmatically clicking the hidden input
    docDatePickerBtn.addEventListener('click', () => {
      if (docDatePickerBtn.disabled) return;
      // Sync current ISO value into the hidden date input before showing picker
      const ymd = state.document && state.document.date ? state.document.date : '';
      if (ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd)) docDateHiddenEl.value = ymd;
      docDateHiddenEl.style.cssText = 'position:absolute;opacity:0;width:1px;height:1px;pointer-events:auto;';
      docDateHiddenEl.showPicker ? docDateHiddenEl.showPicker() : docDateHiddenEl.click();
    });

    docDateHiddenEl.addEventListener('change', () => {
      const ymd = docDateHiddenEl.value; // YYYY-MM-DD from native picker
      if (ymd && state.document) state.document.date = ymd;
      setDocDateDisplay(ymd);
      state.changed = true;
      updateDocDateWarning();
      docDateHiddenEl.style.cssText = '';
    });

    // COA, Settings, etc.
    document.getElementById('menuCoa').onclick = () => openCOAPanel();
    document.getElementById('menuCopyEntries').onclick = () => { copySelectedEntries(); document.getElementById('menuEdit')?.classList.add('hidden'); };
    document.getElementById('menuPasteEntries').onclick = () => { pasteEntries(); document.getElementById('menuEdit')?.classList.add('hidden'); };
    document.getElementById('menuSelectAllEntries').onclick = () => {
      selectAllEntryRows();
      document.getElementById('menuEdit')?.classList.add('hidden');
      render();
    };
    document.getElementById('menuClearEntrySelection').onclick = () => {
      clearEntryRowSelection();
      document.getElementById('menuEdit')?.classList.add('hidden');
      render();
    };

    document.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      const t = e.target;
      if (!t || typeof t.closest !== 'function') return;
      if (t.closest('.entries-wrap')) return;
      if (t.closest('.menu-wrap')) return;
      if (t.closest('.toolbar')) return;
      if (t.closest('.panel-overlay')) return;
      if (t.closest('.picker-modal')) return;
      if (!state.selectedEntryIndices.length) return;
      clearEntryRowSelection();
      render();
    });

    document.getElementById('menuLoadTilikarttamalli').onclick = () => openTilikarttamalliPanel();
    document.getElementById('menuPeriods').onclick = () => openPeriodsPanel();
    // "Muokkaa tositelajeja" is now a sentinel option inside docTypeSelect (no separate button).
    document.getElementById('menuProperties').onclick = () => openPropertiesPanel();
    document.getElementById('menuSettings').onclick = () => openSettingsPanel();
    document.getElementById('menuStartingBalances').onclick = () => openStartingBalancesPanel();
    document.querySelector('#menuEdit .menu-submenu-trigger')?.addEventListener('click', function (e) {
      e.stopPropagation();
      const sub = this.nextElementSibling;
      if (sub) sub.classList.toggle('hidden');
    });
    document.getElementById('menuCreateTemplateFromDocument').onclick = () => createEntryTemplateFromCurrentDocument();
    document.getElementById('menuEditEntryTemplates').onclick = () => {
      document.querySelectorAll('.menu-dropdown').forEach(d => d.classList.add('hidden'));
      openEntryTemplatesPanel();
    };
    document.getElementById('menuReportSummary').onclick = () => openReportAccountSummary();
    document.getElementById('menuReportDocument').onclick = () => openReportDocument();
    document.getElementById('menuReportAccountStatement').onclick = () => openReportAccountStatement();
    document.getElementById('menuReportIncomeStatement').onclick = () => openReportIncomeStatement();
    document.getElementById('menuReportIncomeStatementDetailed').onclick = () => openReportIncomeStatementDetailed();
    document.getElementById('menuReportBalanceSheet').onclick = () => openReportBalanceSheet();
    document.getElementById('menuReportBalanceSheetDetailed').onclick = () => openReportBalanceSheetDetailed();
    document.getElementById('menuReportJournal').onclick = () => openReportJournal();
    document.getElementById('menuReportLedger').onclick = () => openReportLedger();
    document.getElementById('menuReportVat').onclick = () => openReportVat();
    document.getElementById('menuReportCoa').onclick = () => { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openCOAPanel && window.openCOAPanel(); };
    document.getElementById('menuReportEdit').onclick = () => openReportEdit();
    document.getElementById('menuExport').onclick = () => exportCSV();
    document.getElementById('menuImportSql').onclick = () => { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.TilitinImportSQL && window.TilitinImportSQL.openImportPanel(); };
    document.getElementById('menuExportSqlite').onclick = () => { window.TilitinExportSQLite && window.TilitinExportSQLite.exportToSQLite(); };
    document.getElementById('menuBulkImport').onclick = () => { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openBulkImportPanel && window.openBulkImportPanel(); };
    document.getElementById('menuDocumentNumberShift').onclick = () => { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openDocumentNumberShiftPanel && window.openDocumentNumberShiftPanel(); };
    document.getElementById('menuCheckBalances').onclick = () => { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openCheckBalancesPanel && window.openCheckBalancesPanel(); };
    document.getElementById('menuRaporttipohja').onclick = () => { window.openRaporttipohjaPanel && window.openRaporttipohjaPanel(); };
    document.getElementById('menuClearAllData').onclick = () => {
      if (!confirm('Haluatko varmasti tyhjentää kaikki tiedot?\n\nKaikki tilikartat, tilikaudet, tositteet ja viennit poistetaan. Tätä toimintoa ei voi perua.')) return;
      if (typeof clearAllUserData === 'function') clearAllUserData();
      if (typeof ensureDefaultData === 'function') ensureDefaultData();
      document.querySelectorAll('.menu-dropdown').forEach(d => d.classList.add('hidden'));
      document.getElementById('panelContainer').innerHTML = '';
      loadDocuments();
      loadCurrentDocument();
      render();
    };
    document.getElementById('menuUiSettings').onclick = () => { window.openUiSettingsPanel && window.openUiSettingsPanel(); };
    document.getElementById('menuAbout').onclick = function () {
      window.openAboutPanel && window.openAboutPanel(APP_NAME, APP_VERSION);
    };
    document.getElementById('menuLicense').onclick = function () {
      window.openLicensePanel && window.openLicensePanel();
    };

    render();
  }

  // --- Panels (stubs that we'll implement next) ---
  function openCOAPanel() { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openCOAPanel && window.openCOAPanel(); }
  function openTilikarttamalliPanel() { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openTilikarttamalliPanel && window.openTilikarttamalliPanel(); }
  function openPeriodsPanel() { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openPeriodsPanel && window.openPeriodsPanel(); }
  function openDocumentTypesPanel() { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openDocumentTypesPanel && window.openDocumentTypesPanel(); }
  function openEntryTemplatesPanel() { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openEntryTemplatesPanel && window.openEntryTemplatesPanel(); }
  function openPropertiesPanel() { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openPropertiesPanel && window.openPropertiesPanel(); }
  function openSettingsPanel() { window.openSettingsPanel && window.openSettingsPanel(); }
  function openStartingBalancesPanel() { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openStartingBalancesPanel && window.openStartingBalancesPanel(); }
  function openReportAccountSummary() { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openReportAccountSummary && window.openReportAccountSummary(); }
  function openReportDocument() { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openReportDocument && window.openReportDocument(); }
  function openReportAccountStatement() { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openReportAccountStatement && window.openReportAccountStatement(); }
  function openReportIncomeStatement() { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openReportIncomeStatement && window.openReportIncomeStatement(); }
  function openReportIncomeStatementDetailed() { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openReportIncomeStatementDetailed && window.openReportIncomeStatementDetailed(); }
  function openReportBalanceSheet() { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openReportBalanceSheet && window.openReportBalanceSheet(); }
  function openReportBalanceSheetDetailed() { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openReportBalanceSheetDetailed && window.openReportBalanceSheetDetailed(); }
  function openReportJournal() { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openReportJournal && window.openReportJournal(); }
  function openReportLedger() { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openReportLedger && window.openReportLedger(); }
  function openReportVat() { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openReportVat && window.openReportVat(); }
  function openReportEdit() { if (state.changed && !confirm('Tallenna muutokset ensin?')) return; window.openReportEdit && window.openReportEdit(); }

  function exportCSV() {
    const period = getPeriod();
    if (!period) { alert('Valitse tilikausi ensin.'); return; }
    const docTypes = getDocumentTypes();

    // Build the options panel
    const overlay = document.createElement('div');
    overlay.className = 'panel-overlay';

    const sep = getDecimalSeparator();
    const fieldSep = sep === ',' ? ';' : ',';

    overlay.innerHTML =
      '<div class="panel" style="max-width:480px;width:92vw">' +
        '<div class="panel-header"><span class="panel-title">Vie CSV-tiedostoon</span>' +
          '<button class="panel-close" title="Sulje">\u00D7</button></div>' +
        '<div class="panel-body" style="display:flex;flex-direction:column;gap:12px">' +

          '<div class="form-row">' +
            '<label>Aikaväli</label>' +
            '<div style="display:flex;gap:8px;align-items:center">' +
              '<input type="date" id="csvFrom" value="' + period.startDate + '" style="flex:1">' +
              '<span>–</span>' +
              '<input type="date" id="csvTo" value="' + period.endDate + '" style="flex:1">' +
            '</div>' +
          '</div>' +

          '<div class="form-row">' +
            '<label>Tositelaji</label>' +
            '<select id="csvDocType" style="width:100%">' +
              '<option value="">Kaikki</option>' +
              docTypes.map(t => '<option value="' + t.id + '">' + (t.name || '') + '</option>').join('') +
            '</select>' +
          '</div>' +

          '<div class="form-row">' +
            '<label>Sarakkeet</label>' +
            '<div style="display:flex;flex-direction:column;gap:4px">' +
              '<label><input type="checkbox" id="csvColNum" checked> Tositenumero</label>' +
              '<label><input type="checkbox" id="csvColDate" checked> Päivämäärä</label>' +
              '<label><input type="checkbox" id="csvColDocType"> Tositelaji</label>' +
              '<label><input type="checkbox" id="csvColAccNum" checked> Tilinumero</label>' +
              '<label><input type="checkbox" id="csvColAccName"> Tilin nimi</label>' +
              '<label><input type="checkbox" id="csvColDebit" checked> Debet</label>' +
              '<label><input type="checkbox" id="csvColCredit" checked> Kredit</label>' +
              '<label><input type="checkbox" id="csvColVat"> ALV</label>' +
              '<label><input type="checkbox" id="csvColDesc" checked> Selite</label>' +
            '</div>' +
          '</div>' +

          '<div class="form-row">' +
            '<label>Kenttäerotin</label>' +
            '<select id="csvFieldSep">' +
              '<option value=";"' + (fieldSep === ';' ? ' selected' : '') + '>Puolipiste (;)</option>' +
              '<option value=","' + (fieldSep === ',' ? ' selected' : '') + '>Pilkku (,)</option>' +
              '<option value="\t">Tabulaattori</option>' +
            '</select>' +
          '</div>' +

        '</div>' +
        '<div class="panel-footer"></div>' +
      '</div>';

    overlay.querySelector('.panel-close').onclick = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-primary';
    exportBtn.textContent = 'Vie tiedostoon';
    exportBtn.onclick = function () {
      const from    = overlay.querySelector('#csvFrom').value;
      const to      = overlay.querySelector('#csvTo').value;
      const dtId    = overlay.querySelector('#csvDocType').value;
      const fs      = overlay.querySelector('#csvFieldSep').value;
      const colNum  = overlay.querySelector('#csvColNum').checked;
      const colDate = overlay.querySelector('#csvColDate').checked;
      const colDT   = overlay.querySelector('#csvColDocType').checked;
      const colAN   = overlay.querySelector('#csvColAccNum').checked;
      const colAName= overlay.querySelector('#csvColAccName').checked;
      const colDeb  = overlay.querySelector('#csvColDebit').checked;
      const colCred = overlay.querySelector('#csvColCredit').checked;
      const colVat  = overlay.querySelector('#csvColVat').checked;
      const colDesc = overlay.querySelector('#csvColDesc').checked;

      const escField = v => {
        const s = String(v == null ? '' : v);
        return (s.includes(fs) || s.includes('"') || s.includes('\n'))
          ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const fmtNum = n => {
        const num = parseFloat(n);
        return isNaN(num) ? '' : String(num).replace('.', sep);
      };

      const header = [];
      if (colNum)   header.push('Tositenumero');
      if (colDate)  header.push('Päivämäärä');
      if (colDT)    header.push('Tositelaji');
      if (colAN)    header.push('Tilinumero');
      if (colAName) header.push('Tilin nimi');
      if (colDeb)   header.push('Debet');
      if (colCred)  header.push('Kredit');
      if (colVat)   header.push('ALV');
      if (colDesc)  header.push('Selite');

      const lines = [header.join(fs)];

      const allDocs = getDocuments(period.id, dtId ? parseInt(dtId, 10) : null);
      const filteredDocs = allDocs.filter(d => {
        const dt = d.date || '';
        return (!from || dt >= from) && (!to || dt <= to);
      });

      const dtMap = {};
      docTypes.forEach(t => { dtMap[t.id] = t.name || ''; });

      filteredDocs.forEach(doc => {
        getEntriesByDocument(doc.id).forEach(e => {
          const acc = e.accountId ? getAccountById(e.accountId) : null;
          const debit  = parseFloat(e.amountDebit  != null ? e.amountDebit  : (e.debit  ? (e.amount || 0) : 0)) || 0;
          const credit = parseFloat(e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0)) || 0;
          const vat    = parseFloat(e.vatAmount) || 0;
          const row = [];
          if (colNum)   row.push(escField(doc.number));
          if (colDate)  row.push(escField(formatDate(doc.date)));
          if (colDT)    row.push(escField(dtMap[doc.documentTypeId] || ''));
          if (colAN)    row.push(escField(acc ? acc.number : ''));
          if (colAName) row.push(escField(acc ? acc.name  : ''));
          if (colDeb)   row.push(escField(debit  ? fmtNum(debit)  : ''));
          if (colCred)  row.push(escField(credit ? fmtNum(credit) : ''));
          if (colVat)   row.push(escField(vat    ? fmtNum(vat)    : ''));
          if (colDesc)  row.push(escField(e.description || ''));
          lines.push(row.join(fs));
        });
      });

      const bom = '\uFEFF'; // UTF-8 BOM for Excel compatibility
      const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tiliweb_' + from + '_' + to + '.csv';
      a.click();
      URL.revokeObjectURL(a.href);
      overlay.remove();
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn';
    cancelBtn.textContent = 'Peruuta';
    cancelBtn.onclick = () => overlay.remove();

    overlay.querySelector('.panel-footer').appendChild(exportBtn);
    overlay.querySelector('.panel-footer').appendChild(cancelBtn);
    document.body.appendChild(overlay);
  }

  window.TilitinApp = { init, render, addEntriesFromTemplate, getState: () => state, closeSearch, reloadDocuments };

  function reloadDocuments(goToDocumentNumber) {
    loadDocuments();
    if (goToDocumentNumber != null && state.documents.length > 0) {
      const idx = state.documents.findIndex(d => d.number === goToDocumentNumber);
      if (idx >= 0) state.documentIndex = idx;
    }
    loadCurrentDocument();
    render();
  }

  function closeSearch() {
    state.searchMode = false;
    state.searchPhrase = '';
    closeSearchResultsPanel();
    loadDocuments();
    loadCurrentDocument();
    render();
  }
})();
