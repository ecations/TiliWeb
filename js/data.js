/**
 * Tilitin - Data layer (localStorage)
 * Port from Java kirjanpito.db
 */

const APP_KEY = 'tilitin_';

/** Fix UTF-8 mojibake (e.g. Ã¤ -> ä) so Finnish text displays correctly. */
function fixMojibake(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/\u00C3\u00A4/g, '\u00E4')
    .replace(/\u00C3\u00B6/g, '\u00F6')
    .replace(/\u00C3\u00A5/g, '\u00E5')
    .replace(/\u00C3\u0084/g, '\u00C4')
    .replace(/\u00C3\u0096/g, '\u00D6')
    .replace(/\u00C3\u0085/g, '\u00C5');
}

// Account types (from Account.java)
const AccountType = {
  ASSET: 0,
  LIABILITY: 1,
  EQUITY: 2,
  REVENUE: 3,
  EXPENSE: 4,
  PROFIT_PREV: 5,
  PROFIT: 6
};

function nextId(key) {
  const k = APP_KEY + 'seq_' + key;
  let n = parseInt(localStorage.getItem(k) || '0', 10) + 1;
  localStorage.setItem(k, String(n));
  return n;
}

// In-memory read-through cache: avoids repeated JSON.parse on every render.
// Invalidated on every saveJson so reads are always consistent.
const _jsonCache = {};

function loadJson(key, defaultVal = []) {
  if (Object.prototype.hasOwnProperty.call(_jsonCache, key)) {
    return _jsonCache[key];
  }
  try {
    const s = localStorage.getItem(APP_KEY + key);
    const val = s ? JSON.parse(s) : defaultVal;
    _jsonCache[key] = val;
    return val;
  } catch (e) {
    return defaultVal;
  }
}

function saveJson(key, data) {
  localStorage.setItem(APP_KEY + key, JSON.stringify(data));
  _jsonCache[key] = data;   // update cache so next loadJson sees it immediately
}

/** Removes all Tilitin data from localStorage. Call ensureDefaultData() and reload after. */
function clearAllUserData() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(APP_KEY)) keys.push(k);
  }
  keys.forEach(k => localStorage.removeItem(k));
}

// --- Accounts ---
function getAccounts() {
  const list = loadJson('accounts', []);
  list.forEach(a => { if (a.name) a.name = fixMojibake(a.name); });
  return list;
}

function getAccountById(id) {
  return getAccounts().find(a => a.id === id);
}

function getAccountByNumber(num) {
  return getAccounts().find(a => a.number === String(num));
}

function saveAccount(account) {
  const list = getAccounts();
  const i = list.findIndex(a => a.id === account.id);
  if (i >= 0) list[i] = account;
  else {
    if (!account.id) account.id = nextId('account');
    list.push(account);
  }
  list.sort((a, b) => (a.number || '').localeCompare(b.number || ''));
  saveJson('accounts', list);
  return account.id;
}

function deleteAccount(id) {
  saveJson('accounts', getAccounts().filter(a => a.id !== id));
}

// --- COA Headings ---
function getCOAHeadings() {
  const list = loadJson('coa_headings', []);
  list.forEach(h => { if (h.text) h.text = fixMojibake(h.text); });
  return list;
}

function saveCOAHeading(h) {
  const list = getCOAHeadings();
  const i = list.findIndex(x => x.id === h.id);
  if (i >= 0) list[i] = h;
  else {
    if (!h.id) h.id = nextId('coa_heading');
    list.push(h);
  }
  saveJson('coa_headings', list);
  return h.id;
}

function deleteCOAHeading(id) {
  saveJson('coa_headings', getCOAHeadings().filter(x => x.id !== id));
}

/**
 * Applies a tilikarttamalli (chart of accounts template).
 * Replaces all accounts and COA headings. Does not remove documents/entries (but their account references may become invalid).
 * @param {string} templateId - e.g. 'ammatinharjoittaja'
 * @returns {boolean} true if applied
 */
function applyTilikarttamalli(templateId) {
  if (typeof Tilikarttamallit === 'undefined') return false;
  const accounts = Tilikarttamallit.getAccountsForTemplate(templateId);
  const headings = Tilikarttamallit.getHeadingsForTemplate(templateId);
  if (!accounts.length && !headings.length) return false;
  saveJson('accounts', []);
  saveJson('coa_headings', []);
  localStorage.setItem(APP_KEY + 'seq_account', '0');
  localStorage.setItem(APP_KEY + 'seq_coa_heading', '0');
  const numberToId = {};
  accounts.forEach(a => {
    const id = nextId('account');
    const acc = {
      id,
      number: a.number,
      name: fixMojibake(a.name),
      type: a.type,
      vatCode: a.vatCode || 0,
      vatRate: a.vatRate != null ? a.vatRate : 0,
      vatAccount1Id: 0,
      vatAccount2Id: 0,
      flags: a.flags || 0
    };
    numberToId[a.number] = id;
    saveAccount(acc);
  });
  accounts.forEach((a) => {
    const acc = getAccountById(numberToId[a.number]);
    if (!acc) return;
    if (a.vatAccount1Number && numberToId[a.vatAccount1Number]) acc.vatAccount1Id = numberToId[a.vatAccount1Number];
    if (a.vatAccount2Number && numberToId[a.vatAccount2Number]) acc.vatAccount2Id = numberToId[a.vatAccount2Number];
    if (a.vatRate != null) acc.vatRate = typeof a.vatRate === 'number' ? a.vatRate : Tilikarttamallit.resolveVatRate(a.vatRate);
    saveAccount(acc);
  });
  headings.forEach(h => {
    saveCOAHeading({
      id: nextId('coa_heading'),
      number: h.number,
      text: fixMojibake(h.text),
      level: h.level != null ? h.level : 0
    });
  });
  return true;
}

function getDefaultAccountId() {
  const id = getSetting('defaultAccount', '');
  const n = parseInt(id, 10);
  return isNaN(n) ? null : n;
}

function setDefaultAccountId(accountId) {
  setSetting('defaultAccount', accountId != null ? String(accountId) : '');
}

// --- Periods ---
/** Format a Date as YYYY-MM-DD in local time (for timestamps from SQL/import that are local midnight). */
function dateToLocalYyyyMmDd(d) {
  if (!d || isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/** Normalize to YYYY-MM-DD. Strings "YYYY-MM-DD" kept as-is. Numbers/parsed strings use local date so SQL export (local midnight) stays correct. */
function periodDateToYyyyMmDd(val) {
  if (val == null || val === '') return '';
  const n = Number(val);
  if (!isNaN(n) && n > 0) return dateToLocalYyyyMmDd(new Date(n));
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}(?:T|\s|$)/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return dateToLocalYyyyMmDd(d) || s;
}

function getPeriods() {
  const list = loadJson('periods', []);
  list.forEach(function (p) {
    if (p.startDate != null) p.startDate = periodDateToYyyyMmDd(p.startDate);
    if (p.endDate != null) p.endDate = periodDateToYyyyMmDd(p.endDate);
  });
  return list;
}

function getPeriodById(id) {
  return getPeriods().find(p => p.id === id);
}

/**
 * Returns the currently selected period from settings (for use by reports/panels).
 */
function getPeriod() {
  const s = getSettings();
  return s.currentPeriodId ? getPeriodById(s.currentPeriodId) : null;
}

function savePeriod(p) {
  const list = getPeriods();
  const i = list.findIndex(x => x.id === p.id);
  if (i >= 0) list[i] = p;
  else {
    if (!p.id) p.id = nextId('period');
    list.push(p);
  }
  list.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  saveJson('periods', list);
  return p.id;
}

function deletePeriod(id) {
  saveJson('periods', getPeriods().filter(p => p.id !== id));
}

// --- Document types ---
function getDocumentTypes() {
  return loadJson('document_types', []);
}

function getDocumentTypeById(id) {
  return getDocumentTypes().find(d => d.id === id);
}

/** Find a document type whose number range contains the given document number; prefer narrower ranges. Excludes optional excludeId. */
function findDocumentTypeByNumber(documentNumber, excludeId) {
  const num = Number(documentNumber);
  if (isNaN(num)) return null;
  const types = getDocumentTypes().filter(t => t.id !== excludeId);
  const containing = types.filter(t => {
    const start = t.numberStart != null ? Number(t.numberStart) : 0;
    const end = t.numberEnd != null ? Number(t.numberEnd) : 999999;
    return num >= start && num <= end;
  });
  if (containing.length === 0) return null;
  if (containing.length === 1) return containing[0];
  containing.sort((a, b) => {
    const rangeA = (a.numberEnd != null ? Number(a.numberEnd) : 999999) - (a.numberStart != null ? Number(a.numberStart) : 0);
    const rangeB = (b.numberEnd != null ? Number(b.numberEnd) : 999999) - (b.numberStart != null ? Number(b.numberStart) : 0);
    return rangeA - rangeB;
  });
  return containing[0];
}

function saveDocumentType(dt) {
  const list = getDocumentTypes();
  const i = list.findIndex(x => x.id === dt.id);
  if (i >= 0) list[i] = dt;
  else {
    if (!dt.id) dt.id = nextId('document_type');
    list.push(dt);
  }
  list.sort((a, b) => (a.number || 0) - (b.number || 0));
  saveJson('document_types', list);
  return dt.id;
}

function deleteDocumentType(id) {
  const idNum = id != null ? Number(id) : null;
  if (idNum == null || isNaN(idNum)) return;
  const types = getDocumentTypes();
  const list = loadJson('documents', []);
  let changed = false;
  list.forEach(doc => {
    if (doc.documentTypeId == null || Number(doc.documentTypeId) !== idNum) return;
    const better = findDocumentTypeByNumber(doc.number, idNum);
    if (better) {
      doc.documentTypeId = better.id;
      changed = true;
    }
  });
  if (changed) saveJson('documents', list);
  saveJson('document_types', types.filter(x => Number(x.id) !== idNum));
  const settings = getSettings();
  if (settings.documentTypeId != null && Number(settings.documentTypeId) === idNum) {
    const remaining = getDocumentTypes();
    settings.documentTypeId = remaining.length > 0 ? remaining[0].id : null;
    saveSettings(settings);
  }
}

/** Reassign each document to the narrowest document type whose number range contains the document number. Call after import to fix documents that point at a wide type (e.g. 1-199999) when a narrower type exists (e.g. 199165-199999). */
function reassignDocumentsToSpecificType() {
  const list = loadJson('documents', []);
  let changed = false;
  list.forEach(doc => {
    const best = findDocumentTypeByNumber(doc.number, null);
    if (!best || Number(best.id) === Number(doc.documentTypeId)) return;
    doc.documentTypeId = best.id;
    changed = true;
  });
  if (changed) saveJson('documents', list);
}

/** Remove document types that are redundant: a type whose range fully contains another type's range (and has strictly larger span). E.g. remove "Päiväkirja 1-199999" when "Myyntilaskut 199165-199999" exists. Call after reassignDocumentsToSpecificType() so no documents point to the removed type. */
function removeRedundantDocumentTypes() {
  const types = getDocumentTypes();
  if (types.length < 2) return;
  function span(t) {
    const start = t.numberStart != null ? Number(t.numberStart) : 0;
    const end = t.numberEnd != null ? Number(t.numberEnd) : 999999;
    return { start, end, size: end - start };
  }
  /** Only remove a type that looks like a catch-all (e.g. 1–199999), not specific ranges like 199660–199999. */
  const CATCH_ALL_START_MAX = 10;
  const CATCH_ALL_SPAN_MIN = 100000;
  const toRemove = new Set();
  types.forEach(a => {
    const sa = span(a);
    const isCatchAll = sa.start <= CATCH_ALL_START_MAX && sa.size >= CATCH_ALL_SPAN_MIN;
    if (!isCatchAll) return;
    types.forEach(b => {
      if (a.id === b.id) return;
      const sb = span(b);
      if (sb.size >= sa.size) return;
      if (sb.start >= sa.start && sb.end <= sa.end) toRemove.add(Number(a.id));
    });
  });
  if (toRemove.size === 0) return;
  const settings = getSettings();
  let updateSettings = toRemove.has(Number(settings.documentTypeId));
  const remaining = types.filter(t => !toRemove.has(Number(t.id)));
  saveJson('document_types', remaining);
  if (updateSettings && remaining.length > 0) {
    settings.documentTypeId = remaining[0].id;
    saveSettings(settings);
  }
}

// --- Documents ---
function getDocuments(periodId, documentTypeId) {
  const list = loadJson('documents', []);
  return list.filter(d => {
    if (periodId != null && (d.periodId == null || Number(d.periodId) !== Number(periodId))) return false;
    if (documentTypeId != null && (d.documentTypeId == null || Number(d.documentTypeId) !== Number(documentTypeId))) return false;
    return true;
  }).sort((a, b) => {
    const nd = (a.number || 0) - (b.number || 0);
    if (nd !== 0) return nd;
    return new Date(a.date) - new Date(b.date);
  });
}

/** Documents in period whose number is in [numberStart, numberEnd] (inclusive). Use for tositelaji number range. */
function getDocumentsInNumberRange(periodId, numberStart, numberEnd) {
  const list = loadJson('documents', []);
  const start = numberStart != null ? Number(numberStart) : 0;
  const end = numberEnd != null ? Number(numberEnd) : 999999;
  return list.filter(d => {
    if (periodId != null && (d.periodId == null || Number(d.periodId) !== Number(periodId))) return false;
    const num = Number(d.number);
    if (isNaN(num)) return false;
    return num >= start && num <= end;
  }).sort((a, b) => {
    const nd = (a.number || 0) - (b.number || 0);
    if (nd !== 0) return nd;
    return new Date(a.date) - new Date(b.date);
  });
}

/**
 * Canonical helper: documents for given period + tositelaji.
 * Uses number range when defined; otherwise falls back to documentTypeId.
 * If no documents are found for the type, falls back to all documents in the period.
 */
function getDocumentsForDocType(periodId, documentTypeId) {
  const docType = documentTypeId != null ? getDocumentTypeById(documentTypeId) : null;
  let list;
  if (docType) {
    if (docType.numberStart != null || docType.numberEnd != null) {
      list = getDocumentsInNumberRange(periodId, docType.numberStart, docType.numberEnd);
    } else {
      list = getDocuments(periodId, docType.id);
    }
    if (!list || list.length === 0) {
      list = getDocuments(periodId, null);
    }
  } else {
    list = getDocuments(periodId, null);
  }
  return list;
}

function getDocumentById(id) {
  const n = id != null && id !== '' ? Number(id) : null;
  if (n == null || isNaN(n)) return undefined;
  return loadJson('documents', []).find(d => d.id != null && Number(d.id) === n);
}

function saveDocument(doc) {
  const list = loadJson('documents', []);
  const docId = doc.id != null ? Number(doc.id) : null;
  const i = docId != null && !isNaN(docId) ? list.findIndex(d => d.id != null && Number(d.id) === docId) : -1;
  if (i >= 0) list[i] = doc;
  else {
    if (!doc.id) doc.id = nextId('document');
    list.push(doc);
  }
  saveJson('documents', list);
  return doc.id;
}

function deleteDocument(id) {
  const n = id != null ? Number(id) : null;
  if (n == null || isNaN(n)) return;
  const list = loadJson('documents', []).filter(d => d.id == null || Number(d.id) !== n);
  saveJson('documents', list);
  const entries = getEntriesByDocument(n);
  entries.forEach(e => deleteEntry(e.id));
}

// --- Entries ---
function getEntriesByDocument(documentId) {
  const id = documentId != null && documentId !== '' ? Number(documentId) : null;
  if (id == null || isNaN(id)) return [];
  return loadJson('entries', []).filter(e => e.documentId != null && Number(e.documentId) === id)
    .sort((a, b) => (a.rowNumber || 0) - (b.rowNumber || 0));
}

/**
 * Returns entries merged for display (Java DocumentModel.fetchDocument style).
 * Base rows (rowNumber < 100000) only; VAT from linked rows (rowNumber + 100000, 200000, 300000) merged in.
 * For legacy data (no VAT rows), returns entries as-is.
 */
/** vatCode 2 = VAT receivable, 3 = VAT deductible. Rows on these accounts with vatAmount are display-only (0 in debit/credit for balance). */
const VAT_ACCOUNT_CODES = [2, 3];
/** True if account is a VAT account: vatCode 2/3, number 2939x, 76611/76621, or used as vatAccount1/2 by another account. */
function isVatAccount(acc) {
  if (!acc || !acc.number) return false;
  const n = String(acc.number);
  if (VAT_ACCOUNT_CODES.indexOf(Number(acc.vatCode)) >= 0 || /^2939/.test(n)) return true;
  if (n === '76611' || n === '76621') return true;
  const accounts = getAccounts();
  return accounts.some(a => {
    const id1 = a.vatAccount1Id != null ? Number(a.vatAccount1Id) : 0;
    const id2 = a.vatAccount2Id != null ? Number(a.vatAccount2Id) : 0;
    const acc1 = id1 ? getAccountById(id1) : null;
    const acc2 = id2 ? getAccountById(id2) : null;
    return (acc1 && String(acc1.number) === n) || (acc2 && String(acc2.number) === n);
  });
}

/** True if row looks like VAT-only: has vatAmount and debit/credit is 0 or equals vatAmount or 2*vatAmount (common import error). */
function looksLikeVatOnlyRow(e, vatAmt) {
  if (!vatAmt || vatAmt <= 0) return false;
  const deb = parseFloat(e.amountDebit) || 0;
  const cred = parseFloat(e.amountCredit) || 0;
  const sum = deb + cred;
  if (sum === 0) return true;
  const tol = 0.02;
  return Math.abs(sum - vatAmt) < tol || Math.abs(sum - vatAmt * 2) < tol;
}

/** True when stored row has no balance (debit and credit both 0 or empty, or equal-and-opposite). Respects user overrides: only treat as VAT-only when data is already balance-neutral. */
function isStoredBalanceNeutral(e) {
  const deb = e.amountDebit != null ? parseFloat(e.amountDebit) : (e.debit ? parseFloat(e.amount) : NaN);
  const cred = e.amountCredit != null ? parseFloat(e.amountCredit) : (!e.debit ? parseFloat(e.amount) : NaN);
  const debNum = typeof deb === 'number' && !isNaN(deb) ? deb : 0;
  const credNum = typeof cred === 'number' && !isNaN(cred) ? cred : 0;
  if (debNum === 0 && credNum === 0) return true;
  if (debNum + credNum === 0) return true;
  return false;
}

function getEntriesForDisplay(documentId) {
  const raw = getEntriesByDocument(documentId);
  if (!raw.length) return [];
  try {
    if (window.TILITIN_BUILD) {
      // Log once per page load so we can confirm the browser has the latest JS.
      if (!window.__tilitinDataJsLogged) {
        window.__tilitinDataJsLogged = true;
        console.log('[Tilitin] data.js active', { build: window.TILITIN_BUILD });
      }
    }
  } catch (_) {}
  const doc = typeof getDocumentById === 'function' ? getDocumentById(documentId) : null;
  const docNum = doc && doc.number != null ? Number(doc.number) : null;
  if (docNum === 2026) {
    console.log('[Voucher 2026 display] getEntriesForDisplay RAW entries from storage:', JSON.parse(JSON.stringify(raw)));
  }
  const hasVatRows = raw.some(e => (e.rowNumber || 0) >= 100000);
  if (!hasVatRows) {
    const flatDisplay = raw.map(e => {
      const acc = e.accountId ? getAccountById(e.accountId) : null;
      const vatAmt = parseFloat(e.vatAmount) || 0;
      const deb = parseFloat(e.amountDebit != null ? e.amountDebit : (e.debit ? (e.amount || 0) : 0));
      const cred = parseFloat(e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0));
      const debNum = typeof deb === 'number' && !isNaN(deb) ? deb : 0;
      const credNum = typeof cred === 'number' && !isNaN(cred) ? cred : 0;
      const alreadyNeutral = isStoredBalanceNeutral(e);
      const isVatOnlyRow = (alreadyNeutral || looksLikeVatOnlyRow(e, vatAmt)) && (isVatAccount(acc) || vatAmt > 0);
      if (isVatOnlyRow) {
        return { ...e, amountDebit: 0, amountCredit: 0, vatAmount: vatAmt || (alreadyNeutral ? 0 : (Math.abs(debNum) || Math.abs(credNum))) };
      }
      return { ...e };
    });
    if (docNum === 2026) {
      console.log('[Voucher 2026 display] getEntriesForDisplay RESULT (flat, what UI gets):', JSON.parse(JSON.stringify(flatDisplay)));
    }
    return flatDisplay;
  }

  const byRow = {};
  raw.forEach(e => { byRow[e.rowNumber || 0] = e; });

  const display = [];
  raw.forEach(e => {
    const rn = e.rowNumber || 0;
    if (rn >= 100000) return;

    const acc = e.accountId ? getAccountById(e.accountId) : null;
    const vat1 = byRow[rn + 100000];
    const vat2 = byRow[rn + 200000];
    const vatAmtStored = parseFloat(e.vatAmount) || 0;

    // VAT counter-account base rows (e.g. 76611 / 76621) must never affect debit/credit totals.
    // Even if the stored import contains negative debit/credit, show them as 0/0 and put VAT only in the ALV column.
    if (isVatAccount(acc)) {
      let vatAmount = 0;
      if (vat2) {
        const v2 = parseFloat(vat2.amountDebit != null ? vat2.amountDebit : (vat2.debit ? (vat2.amount || 0) : 0)) || 0;
        const v2c = parseFloat(vat2.amountCredit != null ? vat2.amountCredit : (!vat2.debit ? (vat2.amount || 0) : 0)) || 0;
        vatAmount = v2 > 0 ? v2 : v2c;
      } else if (vat1) {
        const v1 = parseFloat(vat1.amountDebit != null ? vat1.amountDebit : (vat1.debit ? (vat1.amount || 0) : 0)) || 0;
        const v1c = parseFloat(vat1.amountCredit != null ? vat1.amountCredit : (!vat1.debit ? (vat1.amount || 0) : 0)) || 0;
        vatAmount = v1 > 0 ? v1 : v1c;
      }
      if (!vatAmount) {
        const stored = parseFloat(e.amountDebit != null ? e.amountDebit : (e.debit ? (e.amount || 0) : 0));
        const storedCred = parseFloat(e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0));
        const amt = (typeof stored === 'number' && !isNaN(stored)) ? Math.abs(stored) : ((typeof storedCred === 'number' && !isNaN(storedCred)) ? Math.abs(storedCred) : 0);
        vatAmount = vatAmtStored || amt;
      }
      display.push({ ...e, amountDebit: 0, amountCredit: 0, vatAmount: vatAmount, rowNumber: rn });
      return;
    }

    const isStandaloneVatRow = (isVatAccount(acc) || vatAmtStored > 0) && !vat1 && !vat2;
    if (isStandaloneVatRow && isStoredBalanceNeutral(e)) {
      const vatAmt = parseFloat(e.vatAmount) || 0;
      const stored = parseFloat(e.amountDebit != null ? e.amountDebit : (e.debit ? (e.amount || 0) : 0));
      const storedCred = parseFloat(e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0));
      const amt = (typeof stored === 'number' && !isNaN(stored)) ? Math.abs(stored) : ((typeof storedCred === 'number' && !isNaN(storedCred)) ? storedCred : 0);
      display.push({ ...e, amountDebit: 0, amountCredit: 0, vatAmount: vatAmt || amt, rowNumber: rn });
      return;
    }

    const stored = parseFloat(e.amountDebit != null ? e.amountDebit : (e.debit ? (e.amount || 0) : 0)) || 0;
    const storedCred = parseFloat(e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0)) || 0;
    const storedAmt = stored > 0 ? stored : storedCred;
    const isDebit = stored > 0;

    let vatAmount = 0;

    if (vat2) {
      const v2 = parseFloat(vat2.amountDebit != null ? vat2.amountDebit : (vat2.debit ? (vat2.amount || 0) : 0)) || 0;
      const v2c = parseFloat(vat2.amountCredit != null ? vat2.amountCredit : (!vat2.debit ? (vat2.amount || 0) : 0)) || 0;
      vatAmount = v2 > 0 ? v2 : v2c;
    } else if (vat1) {
      const v1 = parseFloat(vat1.amountDebit != null ? vat1.amountDebit : (vat1.debit ? (vat1.amount || 0) : 0)) || 0;
      const v1c = parseFloat(vat1.amountCredit != null ? vat1.amountCredit : (!vat1.debit ? (vat1.amount || 0) : 0)) || 0;
      vatAmount = v1 > 0 ? v1 : v1c;
    }

    display.push({
      ...e,
      amountDebit: isDebit ? storedAmt : 0,
      amountCredit: !isDebit ? storedAmt : 0,
      vatAmount: vatAmount,
      rowNumber: rn
    });
  });
  const result = display;
  if (docNum === 2026) {
    console.log('[Voucher 2026 display] getEntriesForDisplay RESULT (what UI gets):', JSON.parse(JSON.stringify(result)));
  }
  return result;
}

function getEntryById(id) {
  return loadJson('entries', []).find(e => e.id === id);
}

function saveEntry(entry) {
  const list = loadJson('entries', []);
  const i = list.findIndex(e => e.id === entry.id);
  if (i >= 0) list[i] = entry;
  else {
    if (!entry.id) entry.id = nextId('entry');
    list.push(entry);
  }
  saveJson('entries', list);
  return entry.id;
}

function deleteEntry(id) {
  saveJson('entries', loadJson('entries', []).filter(e => e.id !== id));
}

function deleteEntriesByDocument(documentId) {
  saveJson('entries', loadJson('entries', []).filter(e => e.documentId !== documentId));
}

// --- Entry templates ---
function getEntryTemplates() {
  return loadJson('entry_templates', []).sort((a, b) => {
    if (a.number !== b.number) return a.number - b.number;
    return (a.rowNumber || 0) - (b.rowNumber || 0);
  });
}

function getEntryTemplatesByNumber(num) {
  return getEntryTemplates().filter(t => t.number === num);
}

function saveEntryTemplate(t) {
  const list = getEntryTemplates();
  const idx = list.findIndex(x => x.id === t.id);
  if (idx >= 0) list[idx] = t;
  else {
    if (!t.id) t.id = nextId('entry_template');
    list.push(t);
  }
  saveJson('entry_templates', list);
  return t.id;
}

function deleteEntryTemplate(id) {
  saveJson('entry_templates', getEntryTemplates().filter(x => x.id !== id));
}

// --- Settings ---
function getSettings() {
  const raw = localStorage.getItem(APP_KEY + 'settings');
  if (!raw) return defaultSettings();
  try {
    return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch (e) {
    return defaultSettings();
  }
}

function defaultSettings() {
  return {
    name: '',
    businessId: '',
    currentPeriodId: null,
    documentTypeId: null,
    fontSize: 16,
    dateFormat: 'DD.MM.YYYY',
    decimalSeparator: ',',
    properties: {}
  };
}

/**
 * Format a YYYY-MM-DD string according to the user's dateFormat setting.
 * Safe to call with null/undefined (returns '').
 */
function formatDate(ymd) {
  if (!ymd || typeof ymd !== 'string' || ymd.length < 10) return ymd || '';
  const y = ymd.slice(0, 4);
  const m = ymd.slice(5, 7);
  const d = ymd.slice(8, 10);
  const mi = parseInt(m, 10);
  const di = parseInt(d, 10);
  const fmt = (getSettings().dateFormat) || 'DD.MM.YYYY';
  switch (fmt) {
    case 'DD.MM.YYYY':   return di + '.' + mi + '.' + y;
    case 'D.M.YYYY':     return di + '.' + mi + '.' + y;   // same digits, no zero-pad
    case 'DD/MM/YYYY':   return d + '/' + m + '/' + y;
    case 'MM/DD/YYYY':   return m + '/' + d + '/' + y;
    case 'YYYY-MM-DD':   return ymd.slice(0, 10);
    case 'YYYY.MM.DD':   return y + '.' + m + '.' + d;
    case 'DD.MM.YY':     return di + '.' + mi + '.' + y.slice(2);
    default:             return di + '.' + mi + '.' + y;
  }
}

/** Format today's date using the user's dateFormat setting. */
function formatToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return formatDate(y + '-' + m + '-' + d);
}

function applyFontSize(size) {
  const px = Math.min(24, Math.max(11, parseInt(size, 10) || 16));
  document.documentElement.style.setProperty('--font-size-base', px + 'px');
}

function saveSettings(s) {
  // Mirror UI prefs into properties so they survive the SQLite export/import cycle
  if (!s.properties) s.properties = {};
  if (s.fontSize && s.fontSize !== 16) s.properties.fontSize = s.fontSize;
  else delete s.properties.fontSize;
  if (s.dateFormat && s.dateFormat !== 'DD.MM.YYYY') s.properties.dateFormat = s.dateFormat;
  else delete s.properties.dateFormat;
  if (s.decimalSeparator && s.decimalSeparator !== ',') s.properties.decimalSeparator = s.decimalSeparator;
  else delete s.properties.decimalSeparator;
  localStorage.setItem(APP_KEY + 'settings', JSON.stringify(s));
}

/** Get the decimal separator character from settings (',' or '.'). */
function getDecimalSeparator() {
  const s = getSettings();
  const v = s.decimalSeparator || (s.properties && s.properties.decimalSeparator) || ',';
  return v === '.' ? '.' : ',';
}

/**
 * Format a number to 2 decimal places using the user's decimal separator.
 * This is the global shared formatter used everywhere amounts are displayed.
 */
function formatNum(x) {
  const n = parseFloat(x);
  if (isNaN(n)) return '0' + getDecimalSeparator() + '00';
  const sep = getDecimalSeparator();
  return sep === '.' ? n.toFixed(2) : n.toFixed(2).replace('.', ',');
}

/**
 * Parse a user-typed amount string to a float.
 * Accepts both comma and period as decimal separator regardless of setting.
 */
function parseNum(s) {
  if (s == null) return 0;
  // Remove thousands separators (space, non-breaking space) then normalise decimal
  const clean = String(s).replace(/[\s\u00a0]/g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function getSettingsFontSize() {
  const s = getSettings();
  // Prefer top-level fontSize, fall back to properties.fontSize (from SQLite import)
  const v = s.fontSize || (s.properties && s.properties.fontSize);
  return Math.min(24, Math.max(11, parseInt(v, 10) || 16));
}

function getSetting(key, def) {
  const s = getSettings();
  return (s.properties && s.properties[key]) != null ? s.properties[key] : def;
}

function setSetting(key, value) {
  const s = getSettings();
  if (!s.properties) s.properties = {};
  if (value == null || value === '') delete s.properties[key];
  else s.properties[key] = value;
  saveSettings(s);
}

// --- Starting balances (stored per account per period) ---
function getStartingBalances(periodId) {
  const key = APP_KEY + 'starting_balances_' + periodId;
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : {};
  } catch (e) {
    return {};
  }
}

function saveStartingBalances(periodId, balances) {
  localStorage.setItem(APP_KEY + 'starting_balances_' + periodId, JSON.stringify(balances));
}

// --- Report structures (optional, for custom report layouts) ---
function getReportStructures() {
  return loadJson('report_structures', []);
}

function getReportStructureById(id) {
  return getReportStructures().find(r => r.id === id);
}

function saveReportStructure(r) {
  const list = getReportStructures();
  const i = list.findIndex(x => x.id === r.id);
  if (i >= 0) list[i] = r;
  else list.push(r);
  saveJson('report_structures', list);
}

// --- Initialize default data when empty ---
function ensureDefaultData() {
  const hadNoData = getAccounts().length === 0 && getPeriods().length === 0 && getDocumentTypes().length === 0;

  if (getAccounts().length === 0) {
    if (typeof Tilikarttamallit !== 'undefined') {
      const accounts = Tilikarttamallit.getDefaultCOAAccounts();
      const headings = Tilikarttamallit.getDefaultCOAHeadings();
      const numberToId = {};
      accounts.forEach(a => {
        const id = nextId('account');
        const acc = {
          id,
          number: a.number,
          name: fixMojibake(a.name),
          type: a.type,
          vatCode: a.vatCode || 0,
          vatRate: a.vatRate != null ? a.vatRate : 0,
          vatAccount1Id: 0,
          vatAccount2Id: 0,
          flags: a.flags || 0
        };
        numberToId[a.number] = id;
        saveAccount(acc);
      });
      accounts.forEach((a, i) => {
        const acc = getAccountById(numberToId[a.number]);
        if (!acc) return;
        if (a.vatAccount1Number && numberToId[a.vatAccount1Number]) acc.vatAccount1Id = numberToId[a.vatAccount1Number];
        if (a.vatAccount2Number && numberToId[a.vatAccount2Number]) acc.vatAccount2Id = numberToId[a.vatAccount2Number];
        if (a.vatRate != null) acc.vatRate = typeof a.vatRate === 'number' ? a.vatRate : Tilikarttamallit.resolveVatRate(a.vatRate);
        saveAccount(acc);
      });
      headings.forEach(h => {
        saveCOAHeading({
          id: nextId('coa_heading'),
          number: h.number,
          text: fixMojibake(h.text),
          level: h.level != null ? h.level : 0
        });
      });
    } else {
      const defaultAccounts = [
        { id: 1, number: '1000', name: 'Kassa', type: AccountType.ASSET, vatCode: 0, vatRate: 0, vatAccount1Id: 0, vatAccount2Id: 0, flags: 0 },
        { id: 2, number: '1100', name: 'Pankkitili', type: AccountType.ASSET, vatCode: 0, vatRate: 0, vatAccount1Id: 0, vatAccount2Id: 0, flags: 0 },
        { id: 3, number: '2000', name: 'Ostovelat', type: AccountType.LIABILITY, vatCode: 0, vatRate: 0, vatAccount1Id: 0, vatAccount2Id: 0, flags: 0 },
        { id: 4, number: '4000', name: 'Myyntituotot', type: AccountType.REVENUE, vatCode: 1, vatRate: 24, vatAccount1Id: 0, vatAccount2Id: 0, flags: 0 },
        { id: 5, number: '5000', name: 'Ostot', type: AccountType.EXPENSE, vatCode: 2, vatRate: 24, vatAccount1Id: 0, vatAccount2Id: 0, flags: 0 },
        { id: 6, number: '2930', name: 'ALV velka', type: AccountType.LIABILITY, vatCode: 0, vatRate: 0, vatAccount1Id: 0, vatAccount2Id: 0, flags: 0 },
        { id: 7, number: '2940', name: 'ALV saada', type: AccountType.LIABILITY, vatCode: 0, vatRate: 0, vatAccount1Id: 0, vatAccount2Id: 0, flags: 0 }
      ];
      defaultAccounts.forEach(a => saveAccount(a));
    }
  }
  if (getPeriods().length === 0) {
    const now = new Date();
    const year = now.getFullYear();
    savePeriod({
      id: 1,
      startDate: year + '-01-01',
      endDate: year + '-12-31',
      locked: false
    });
  }
  if (getDocumentTypes().length === 0) {
    if (hadNoData) {
      saveDocumentType({
        id: 1,
        number: 1,
        name: 'Päiväkirja',
        numberStart: 1,
        numberEnd: 99999
      });
    }
  }
  const settings = getSettings();
  if (!settings.currentPeriodId && getPeriods().length > 0) {
    settings.currentPeriodId = getPeriods()[0].id;
    saveSettings(settings);
  }
  if (!settings.documentTypeId && getDocumentTypes().length > 0) {
    settings.documentTypeId = getDocumentTypes()[0].id;
    saveSettings(settings);
  }
}
