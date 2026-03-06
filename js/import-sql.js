/**
 * Tilitin - Import accounting data from SQL (INSERT statements).
 * Maps common table/column names to our localStorage data model.
 * Use: Työkalut → Tuo SQL-tiedosto…
 */

(function () {
  'use strict';

  // Map SQL table names (lowercase) to our entity type
  const TABLE_MAP = {
    account: 'accounts',
    accounts: 'accounts',
    tili: 'accounts',
    period: 'periods',
    periods: 'periods',
    tilikausi: 'periods',
    document_type: 'document_types',
    document_types: 'document_types',
    tositetyyppi: 'document_types',
    tositelaji: 'document_types',
    document: 'documents',
    documents: 'documents',
    tosite: 'documents',
    entry: 'entries',
    entries: 'entries',
    vienti: 'entries',
    vientit: 'entries'
  };

  // Map SQL column names (lowercase) to our field names per entity
  const COLUMN_MAP = {
    accounts: {
      id: 'id', number: 'number', name: 'name', type: 'type',
      vat_code: 'vatCode', vatcode: 'vatCode', vat_rate: 'vatRate', vatrate: 'vatRate',
      vat_percentage: 'vatRate', vatpercentage: 'vatRate',
      alv_prosentti: 'vatRate', alvprosentti: 'vatRate', alv: 'vatRate',
      vat_percent: 'vatRate', vatpercent: 'vatRate',
      vat_account_1_id: 'vatAccount1Id', vat_account_2_id: 'vatAccount2Id',
      vataccount1id: 'vatAccount1Id', vataccount2id: 'vatAccount2Id',
      flags: 'flags', account_number: 'number', account_name: 'name'
    },
    periods: {
      id: 'id', start_date: 'startDate', startdate: 'startDate',
      end_date: 'endDate', enddate: 'endDate', locked: 'locked'
    },
    document_types: {
      id: 'id', number: 'number', name: 'name',
      number_start: 'numberStart', numberstart: 'numberStart',
      number_end: 'numberEnd', numberend: 'numberEnd',
      numero_alku: 'numberStart', numero_loppu: 'numberEnd'
    },
    documents: {
      id: 'id', period_id: 'periodId', periodid: 'periodId',
      document_type_id: 'documentTypeId', documenttypeid: 'documentTypeId',
      number: 'number', date: 'date'
    },
    entries: {
      id: 'id', document_id: 'documentId', documentid: 'documentId',
      account_id: 'accountId', accountid: 'accountId',
      row_number: 'rowNumber', rownumber: 'rowNumber',
      amount: 'amount', debit: 'debit',
      amount_debit: 'amountDebit', amountdebit: 'amountDebit',
      amount_credit: 'amountCredit', amountcredit: 'amountCredit',
      vat_amount: 'vatAmount', vatamount: 'vatAmount', alv: 'vatAmount',
      description: 'description', selite: 'description',
      flags: 'flags'
    }
  };

  function unquote(s) {
    if (typeof s !== 'string') return s;
    s = s.trim();
    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"')))
      return s.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
    return s;
  }

  function parseValue(s) {
    const t = s.trim();
    if (t === 'NULL' || t === 'null') return null;
    if (t.startsWith("'") || t.startsWith('"')) return unquote(t);
    const n = parseFloat(t);
    if (!isNaN(n) && t !== '') return n;
    return unquote(t);
  }

  /** Parse numeric value; accepts comma as decimal separator (e.g. 25,5). */
  function parseDecimal(s) {
    if (s == null || s === '') return NaN;
    const str = String(s).trim().replace(',', '.');
    return parseFloat(str);
  }

  /** Parse a single VALUES (...) or (...),(...) into array of value arrays */
  function parseValueList(str) {
    const rows = [];
    let i = 0;
    const len = str.length;
    while (i < len) {
      const c = str[i];
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t') { i++; continue; }
      if (c === ',') { i++; continue; }
      if (c === '(') {
        const start = i + 1;
        let depth = 1;
        i++;
        while (i < len && depth > 0) {
          const ch = str[i];
          if (ch === '\\') { i += 2; continue; }
          if (ch === "'" || ch === '"') {
            const q = ch;
            i++;
            while (i < len && (str[i] !== q || str[i - 1] === '\\')) i++;
            i++;
            continue;
          }
          if (ch === '(') depth++;
          else if (ch === ')') depth--;
          i++;
        }
        const inner = str.slice(start, i - 1);
        const values = [];
        let j = 0;
        while (j < inner.length) {
          const rest = inner.slice(j).trimStart();
          j += inner.length - rest.length;
          if (!rest) break;
          let end = 0;
          if (rest.startsWith("'")) {
            end = 1;
            while (end < rest.length && (rest[end] !== "'" || rest[end - 1] === '\\')) end++;
            end++;
          } else if (rest.startsWith('"')) {
            end = 1;
            while (end < rest.length && (rest[end] !== '"' || rest[end - 1] === '\\')) end++;
            end++;
          } else if (rest.startsWith('NULL') || rest.startsWith('null')) {
            end = 4;
          } else {
            while (end < rest.length && rest[end] !== ',' && rest[end] !== ')') end++;
          }
          values.push(parseValue(rest.slice(0, end)));
          j += rest.slice(0, end).length;
          const comma = rest.slice(end).match(/^\s*,/);
          if (comma) j += comma[0].length;
        }
        rows.push(values);
        continue;
      }
      i++;
    }
    return rows;
  }

  /** Extract INSERT INTO table (cols) VALUES ... from SQL text; return { table, columns, rows }[] */
  function parseInsertStatements(sql) {
    const results = [];
    const re = /INSERT\s+INTO\s+[`"\s]*(\w+)[`"\s]*\s*\(\s*([^)]+)\s*\)\s*VALUES\s*(.+)/gi;
    let m;
    const normalized = sql.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    while ((m = re.exec(normalized)) !== null) {
      const tableName = (m[1] || '').toLowerCase().replace(/`/g, '');
      const columnsStr = m[2].replace(/`/g, '');
      const columns = columnsStr.split(',').map(c => c.trim().toLowerCase());
      let valuesStr = m[3].trim();
      const semicolon = valuesStr.indexOf(';');
      if (semicolon >= 0) valuesStr = valuesStr.slice(0, semicolon);
      const rows = parseValueList(valuesStr);
      if (rows.length > 0 && rows[0].length === columns.length)
        results.push({ table: tableName, columns, rows });
    }
    return results;
  }

  /** Convert one row (array of values) to object using column names and entity type */
  function rowToObject(columns, row, entityType) {
    const map = COLUMN_MAP[entityType];
    if (!map) return null;
    const obj = {};
    columns.forEach((col, i) => {
      const key = map[col] || map[col.replace(/_/g, '')];
      if (key && row[i] !== undefined) obj[key] = row[i];
    });
    return obj;
  }

  /** Yield to event loop to keep page responsive */
  function yieldToUI() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  /** Convert timestamp (ms) or date string to yyyy-MM-dd. Uses local date so SQL/Tilitin export (local midnight) does not shift by a day. */
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

  function buildAccountIdMap(accounts) {
    const map = {};
    (accounts || []).forEach(a => {
      if (!a || a.id == null) return;
      const id = Number(a.id);
      if (!isNaN(id)) map[id] = a;
    });
    return map;
  }

  /** VAT accounts are those referenced as vatAccount1Id/vatAccount2Id, or typical VAT accounts (vatCode 2/3 or 2939*). */
  function buildUsedVatAccountIdSet(accounts) {
    const set = {};
    (accounts || []).forEach(a => {
      if (!a) return;
      const id1 = Number(a.vatAccount1Id);
      const id2 = Number(a.vatAccount2Id);
      if (!isNaN(id1) && id1 > 0) set[id1] = true;
      if (!isNaN(id2) && id2 > 0) set[id2] = true;
    });
    return set;
  }

  function isLikelyVatAccountId(accountId, accountById, usedVatAccountIds) {
    const id = Number(accountId);
    if (isNaN(id) || id <= 0) return false;
    if (usedVatAccountIds && usedVatAccountIds[id]) return true;
    const acc = accountById && accountById[id];
    if (!acc) return false;
    const num = acc.number != null ? String(acc.number) : '';
    if (/^2939/.test(num)) return true;
    const code = Number(acc.vatCode);
    return code === 2 || code === 3;
  }

  /**
   * Normalize "flat" VAT rows (VAT account as its own base row) into Java-style VAT sub-rows:
   * parent rowNumber + 100000 (vat1) or + 200000 (vat2) or + 300000 (vat3).
   * Matches VAT rows to the base row that references them (vatAccount1Id/vatAccount2Id), not just the previous row.
   */
  function normalizeFlatVatRowsToJavaRowNumbers(list, accountById, usedVatAccountIds) {
    if (!list || list.length < 2) return list || [];
    if (list.some(e => (e.rowNumber || 0) >= 100000)) return list; // already Java-style

    const used = {};
    list.forEach(e => { used[e.rowNumber || 0] = true; });

    const baseRows = list.filter(e => !isLikelyVatAccountId(e.accountId, accountById, usedVatAccountIds));

    list.forEach(e => {
      const rn = e.rowNumber || 0;
      const isVatAcc = isLikelyVatAccountId(e.accountId, accountById, usedVatAccountIds);
      if (!isVatAcc) return;

      const vatAccId = Number(e.accountId);
      let baseEntry = null;
      let offset = 100000;

      for (let i = 0; i < baseRows.length; i++) {
        const base = baseRows[i];
        const baseAcc = accountById && accountById[Number(base.accountId)];
        if (!baseAcc) continue;
        const v1 = Number(baseAcc.vatAccount1Id);
        const v2 = Number(baseAcc.vatAccount2Id);
        if (vatAccId === v1) { baseEntry = base; offset = 100000; break; }
        if (vatAccId === v2) { baseEntry = base; offset = 200000; break; }
      }

      if (!baseEntry) return;

      const baseRn = Number(baseEntry.rowNumber) || 0;
      const isReverse = (() => {
        const baseAcc = accountById && accountById[Number(baseEntry.accountId)];
        return baseAcc && (Number(baseAcc.vatCode) === 9 || Number(baseAcc.vatCode) === 11);
      })();
      if (isReverse && offset === 100000) offset = 200000;
      else if (isReverse && offset === 200000) offset = 300000;

      let newRn = baseRn + offset;
      if (used[newRn]) {
        const candidates = [baseRn + 100000, baseRn + 200000, baseRn + 300000];
        for (let ci = 0; ci < candidates.length; ci++) {
          if (!used[candidates[ci]]) { newRn = candidates[ci]; break; }
        }
      }

      if (newRn !== rn) {
        delete used[rn];
        e.rowNumber = newRn;
        used[newRn] = true;
      }
      e.vatAmount = 0;
    });

    list.sort(function (a, b) { return (a.rowNumber || 0) - (b.rowNumber || 0); });
    return list;
  }

  /** Save byEntity to localStorage. Used by runImport and importFromSQLite. Supports chunked processing. */
  async function runImportFromData(byEntity, options, report) {
    let replace = options && options.replaceExisting;
    const onProgress = options && options.onProgress;
    const idMaps = { accounts: {}, periods: {}, document_types: {}, documents: {} };
    const CHUNK = 400;

    if (byEntity.document_types.length > 0) replace = true;
    if (replace && typeof getAccounts === 'function') {
      try {
        getAccounts().forEach(a => { if (a.id) deleteAccount(a.id); });
        getPeriods().forEach(p => { if (p.id) deletePeriod(p.id); });
        getDocumentTypes().forEach(dt => { if (dt.id) deleteDocumentType(dt.id); });
        const docs = loadJson('documents', []);
        docs.forEach(d => { if (d.id) deleteDocument(d.id); });
        ['account', 'period', 'document_type', 'document', 'entry'].forEach(k => {
          try { localStorage.setItem(APP_KEY + 'seq_' + k, '0'); } catch (e) {}
        });
      } catch (e) {
        report.errors.push('Clear failed: ' + e.message);
        return report;
      }
    }

    try {
      for (let i = 0; i < byEntity.accounts.length; i++) {
        const oldAcc = byEntity.accounts[i];
        const id = oldAcc.id;
        const acc = {
          id: null,
          number: String(oldAcc.number != null ? oldAcc.number : ''),
          name: String(oldAcc.name != null ? oldAcc.name : ''),
          type: parseInt(oldAcc.type, 10) || 0,
          vatCode: parseInt(oldAcc.vatCode, 10) || 0,
          vatRate: parseDecimal(oldAcc.vatRate) || 0,
          vatAccount1Id: (oldAcc.vatAccount1Id != null && idMaps.accounts[oldAcc.vatAccount1Id] != null) ? idMaps.accounts[oldAcc.vatAccount1Id] : (oldAcc.vatAccount1Id || 0),
          vatAccount2Id: (oldAcc.vatAccount2Id != null && idMaps.accounts[oldAcc.vatAccount2Id] != null) ? idMaps.accounts[oldAcc.vatAccount2Id] : (oldAcc.vatAccount2Id || 0),
          flags: parseInt(oldAcc.flags, 10) || 0
        };
        const newId = saveAccount(acc);
        if (id != null) idMaps.accounts[id] = newId;
        report.accounts++;
      }

      for (let i = 0; i < byEntity.periods.length; i++) {
        const oldP = byEntity.periods[i];
        const id = oldP.id;
        const p = {
          id: null,
          startDate: String(oldP.startDate != null ? oldP.startDate : ''),
          endDate: String(oldP.endDate != null ? oldP.endDate : ''),
          locked: !!oldP.locked
        };
        const newId = savePeriod(p);
        if (id != null) idMaps.periods[id] = newId;
        report.periods++;
      }

      for (let i = 0; i < byEntity.document_types.length; i++) {
        const oldDt = byEntity.document_types[i];
        const id = oldDt.id;
        const numStart = oldDt.numberStart != null ? parseInt(oldDt.numberStart, 10) : NaN;
        const numEnd = oldDt.numberEnd != null ? parseInt(oldDt.numberEnd, 10) : NaN;
        const dt = {
          id: null,
          number: parseInt(oldDt.number, 10) || 0,
          name: String(oldDt.name != null ? oldDt.name : ''),
          numberStart: (!isNaN(numStart) ? numStart : 0),
          numberEnd: (!isNaN(numEnd) ? numEnd : 99999)
        };
        const newId = saveDocumentType(dt);
        if (id != null) idMaps.document_types[id] = newId;
        report.document_types++;
      }

      const totalDocs = byEntity.documents.length;
      const newDocIdToNumber = {};
      for (let i = 0; i < totalDocs; i++) {
        const oldDoc = byEntity.documents[i];
        const id = oldDoc.id;
        const periodId = idMaps.periods[oldDoc.periodId] != null ? idMaps.periods[oldDoc.periodId] : oldDoc.periodId;
        const docTypeId = idMaps.document_types[oldDoc.documentTypeId] != null ? idMaps.document_types[oldDoc.documentTypeId] : oldDoc.documentTypeId;
        const doc = {
          id: null,
          periodId: periodId,
          documentTypeId: docTypeId,
          number: parseInt(oldDoc.number, 10) || 0,
          date: String(oldDoc.date != null ? oldDoc.date : '')
        };
        const newId = saveDocument(doc);
        if (id != null) idMaps.documents[id] = newId;
        newDocIdToNumber[newId] = parseInt(oldDoc.number, 10) || 0;
        report.documents++;
        if (totalDocs > CHUNK && i > 0 && i % CHUNK === 0) {
          if (onProgress) onProgress('documents', i, totalDocs);
          await yieldToUI();
        }
      }

      const totalEntries = byEntity.entries.length;
      const entriesWithResolvedIds = [];
      for (let i = 0; i < totalEntries; i++) {
        const oldEnt = byEntity.entries[i];
        const docId = idMaps.documents[oldEnt.documentId] != null ? idMaps.documents[oldEnt.documentId] : oldEnt.documentId;
        const accId = idMaps.accounts[oldEnt.accountId] != null ? idMaps.accounts[oldEnt.accountId] : oldEnt.accountId;
        let amountDebit = oldEnt.amountDebit != null ? parseFloat(oldEnt.amountDebit) : (oldEnt.debit ? (parseFloat(oldEnt.amount) || 0) : 0);
        let amountCredit = oldEnt.amountCredit != null ? parseFloat(oldEnt.amountCredit) : (!oldEnt.debit ? (parseFloat(oldEnt.amount) || 0) : 0);
        if (oldEnt.amountDebit != null && oldEnt.amountCredit != null) {
          amountDebit = parseFloat(oldEnt.amountDebit) || 0;
          amountCredit = parseFloat(oldEnt.amountCredit) || 0;
        }
        const vatAmount = oldEnt.vatAmount != null ? parseFloat(oldEnt.vatAmount) : 0;
        entriesWithResolvedIds.push({
          id: null,
          documentId: docId,
          accountId: accId,
          rowNumber: parseInt(oldEnt.rowNumber, 10) || 0,
          amountDebit: amountDebit,
          amountCredit: amountCredit,
          vatAmount: vatAmount,
          description: String(oldEnt.description != null ? oldEnt.description : ''),
          flags: parseInt(oldEnt.flags, 10) || 0
        });
      }
      const newId2026 = Object.keys(newDocIdToNumber).find(function (k) { return Number(newDocIdToNumber[k]) === 2026; });
      if (newId2026) {
        const entries2026 = entriesWithResolvedIds.filter(function (e) { return Number(e.documentId) === Number(newId2026); });
        console.log('[Import voucher 2026] entriesWithResolvedIds (parsed from source, docId=' + newId2026 + '):', JSON.parse(JSON.stringify(entries2026)));
      }

      const accountsNow = (typeof getAccounts === 'function') ? getAccounts() : [];
      const accountById = buildAccountIdMap(accountsNow);
      const usedVatAccountIds = buildUsedVatAccountIdSet(accountsNow);

      const byDoc = {};
      entriesWithResolvedIds.forEach(function (e) {
        const d = e.documentId;
        if (!byDoc[d]) byDoc[d] = [];
        byDoc[d].push(e);
      });
      const docOrder = byEntity.documents.map(function (d) { return idMaps.documents[d.id] != null ? idMaps.documents[d.id] : d.id; });
      for (let di = 0; di < docOrder.length; di++) {
        const docId = docOrder[di];
        const docNumber = newDocIdToNumber[docId] != null ? Number(newDocIdToNumber[docId]) : null;
        const list = (byDoc[docId] || []).sort(function (a, b) { return (a.rowNumber || 0) - (b.rowNumber || 0); });
        if (docNumber === 2026) {
          console.log('[Import voucher 2026] entries BEFORE normalize (docId=' + docId + '):', JSON.parse(JSON.stringify(list)));
        }
        normalizeFlatVatRowsToJavaRowNumbers(list, accountById, usedVatAccountIds);
        if (docNumber === 2026) {
          console.log('[Import voucher 2026] entries AFTER normalize (saving to storage):', JSON.parse(JSON.stringify(list)));
        }
        for (let ri = 0; ri < list.length; ri++) {
          const e = list[ri];
          if (e.rowNumber == null) e.rowNumber = ri;
          saveEntry(e);
          report.entries++;
        }
        if (totalEntries > CHUNK && (di + 1) % 50 === 0 && onProgress) {
          onProgress('entries', report.entries, totalEntries);
          await yieldToUI();
        }
      }
    } catch (e) {
      report.errors.push(e.message);
    }

    if (replace && report.errors.length === 0 && typeof getSettings === 'function') {
      const settings = getSettings();
      let needSave = false;
      if (getPeriods().length > 0 && !getPeriodById(settings.currentPeriodId)) {
        settings.currentPeriodId = getPeriods()[0].id;
        needSave = true;
      }
      if (getDocumentTypes().length > 0 && !getDocumentTypeById(settings.documentTypeId)) {
        settings.documentTypeId = getDocumentTypes()[0].id;
        needSave = true;
      }
      if (needSave) saveSettings(settings);
    }
    if (!replace) {
      if (typeof reassignDocumentsToSpecificType === 'function') reassignDocumentsToSpecificType();
      if (typeof removeRedundantDocumentTypes === 'function') removeRedundantDocumentTypes();
    }
    return report;
  }

  /** Run import from SQL text (INSERT statements). */
  async function runImport(sql, options) {
    const report = { accounts: 0, periods: 0, document_types: 0, documents: 0, entries: 0, errors: [] };
    const statements = parseInsertStatements(sql);
    const byEntity = { accounts: [], periods: [], document_types: [], documents: [], entries: [] };
    statements.forEach(st => {
      const entity = TABLE_MAP[st.table];
      if (!entity) return;
      st.rows.forEach(row => {
        const obj = rowToObject(st.columns, row, entity);
        if (obj) byEntity[entity].push(obj);
      });
    });
    const opts = options || {};
    if (byEntity.document_types.length > 0) opts.replaceExisting = true;
    return runImportFromData(byEntity, opts, report);
  }

  /** Import from SQLite .db/.sqlite file using SQL.js. Streams table-by-table to avoid loading all rows into memory. */
  async function importFromSQLite(arrayBuffer, options) {
    const report = { accounts: 0, periods: 0, document_types: 0, documents: 0, entries: 0, errors: [] };
    const onProgress = options && options.onProgress;
    const CHUNK = 300;

    if (typeof initSqlJs !== 'function') {
      try {
        await new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = 'js/vendor/sql-wasm.js';
          s.onload = resolve;
          s.onerror = function () { reject(new Error('SQL.js script failed to load')); };
          document.head.appendChild(s);
        });
      } catch (e) {
        report.errors.push('SQL.js ei ladattu. Tarkista verkkoyhteys ja lataa sivu uudelleen.');
        return report;
      }
    }
    if (typeof initSqlJs !== 'function') {
      report.errors.push('SQL.js ei ladattu. Lataa sivu uudelleen tai tarkista verkkoyhteys.');
      return report;
    }
    let SQL;
    try {
      SQL = await initSqlJs({ locateFile: function (file) { return 'js/vendor/' + file; } });
    } catch (e) {
      report.errors.push('SQL.js: ' + (e.message || e));
      return report;
    }
    let db;
    try {
      db = new SQL.Database(new Uint8Array(arrayBuffer));
    } catch (e) {
      report.errors.push('Tietokanta: ' + (e.message || e));
      return report;
    }

    const tableResult = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    const tableNames = (tableResult.length && tableResult[0].values) ? tableResult[0].values.map(function (r) { return r[0]; }) : [];
    function findTableFor(entity) {
      for (let i = 0; i < tableNames.length; i++) {
        if (TABLE_MAP[(tableNames[i] || '').toLowerCase()] === entity) return tableNames[i];
      }
      return null;
    }

    const replace = options && options.replaceExisting;
    const idMaps = { accounts: {}, periods: {}, document_types: {}, documents: {} };

    let forceReplace = false;
    const docTypesTable = findTableFor('document_types');
    if (docTypesTable) {
      const quoted = '"' + String(docTypesTable).replace(/"/g, '""') + '"';
      const countResult = db.exec('SELECT COUNT(*) FROM ' + quoted);
      if (countResult.length && countResult[0].values && countResult[0].values.length > 0 && Number(countResult[0].values[0][0]) > 0) forceReplace = true;
    }
    const doReplace = replace || forceReplace;

    if (doReplace && typeof getAccounts === 'function') {
      try {
        getAccounts().forEach(a => { if (a.id) deleteAccount(a.id); });
        getPeriods().forEach(p => { if (p.id) deletePeriod(p.id); });
        getDocumentTypes().forEach(dt => { if (dt.id) deleteDocumentType(dt.id); });
        const docs = loadJson('documents', []);
        docs.forEach(d => { if (d.id) deleteDocument(d.id); });
        ['account', 'period', 'document_type', 'document', 'entry'].forEach(k => {
          try { localStorage.setItem(APP_KEY + 'seq_' + k, '0'); } catch (e) {} 
        });
      } catch (e) {
        report.errors.push('Clear failed: ' + e.message);
        db.close();
        return report;
      }
    }

    try {
      const entityOrder = ['accounts', 'periods', 'document_types', 'documents', 'entries'];
      for (let e = 0; e < entityOrder.length; e++) {
        const entity = entityOrder[e];
        const tableName = findTableFor(entity);
        if (!tableName) continue;
        const quoted = '"' + String(tableName).replace(/"/g, '""') + '"';
        let columns = [];
        const pragma = db.exec('PRAGMA table_info(' + quoted + ')');
        if (pragma.length && pragma[0].values) columns = pragma[0].values.map(function (r) { return String(r[1]).toLowerCase(); });
        if (!columns.length) continue;

        let offset = 0;
        let totalDone = 0;
        while (true) {
          const result = db.exec('SELECT * FROM ' + quoted + ' LIMIT ' + CHUNK + ' OFFSET ' + offset);
          if (!result.length || !result[0].values || result[0].values.length === 0) break;
          const rows = result[0].values;
          const colNames = result[0].columns.map(function (c) { return c.toLowerCase(); });

          for (let i = 0; i < rows.length; i++) {
            const obj = rowToObject(colNames, rows[i], entity);
            if (!obj) continue;
            if (entity === 'accounts') {
              const id = obj.id;
              const acc = { id: null, number: String(obj.number != null ? obj.number : ''), name: String(obj.name != null ? obj.name : ''), type: parseInt(obj.type, 10) || 0, vatCode: parseInt(obj.vatCode, 10) || 0, vatRate: parseDecimal(obj.vatRate) || 0, vatAccount1Id: (obj.vatAccount1Id != null && idMaps.accounts[obj.vatAccount1Id] != null) ? idMaps.accounts[obj.vatAccount1Id] : (obj.vatAccount1Id || 0), vatAccount2Id: (obj.vatAccount2Id != null && idMaps.accounts[obj.vatAccount2Id] != null) ? idMaps.accounts[obj.vatAccount2Id] : (obj.vatAccount2Id || 0), flags: parseInt(obj.flags, 10) || 0 };
              const newId = saveAccount(acc);
              if (id != null) idMaps.accounts[id] = newId;
              report.accounts++;
            } else if (entity === 'periods') {
              const id = obj.id;
              const p = { id: null, startDate: toYyyyMmDd(obj.startDate), endDate: toYyyyMmDd(obj.endDate), locked: !!obj.locked };
              const newId = savePeriod(p);
              if (id != null) idMaps.periods[id] = newId;
              report.periods++;
            } else if (entity === 'document_types') {
              const id = obj.id;
              const numStart = obj.numberStart != null ? parseInt(obj.numberStart, 10) : NaN;
              const numEnd = obj.numberEnd != null ? parseInt(obj.numberEnd, 10) : NaN;
              const dt = {
                id: null,
                number: parseInt(obj.number, 10) || 0,
                name: String(obj.name != null ? obj.name : ''),
                numberStart: (!isNaN(numStart) ? numStart : 0),
                numberEnd: (!isNaN(numEnd) ? numEnd : 99999)
              };
              const newId = saveDocumentType(dt);
              if (id != null) idMaps.document_types[id] = newId;
              report.document_types++;
            } else if (entity === 'documents') {
              const id = obj.id;
              const periodId = idMaps.periods[obj.periodId] != null ? idMaps.periods[obj.periodId] : obj.periodId;
              const docTypeId = idMaps.document_types[obj.documentTypeId] != null ? idMaps.document_types[obj.documentTypeId] : obj.documentTypeId;
              const doc = { id: null, periodId: periodId, documentTypeId: docTypeId, number: parseInt(obj.number, 10) || 0, date: toYyyyMmDd(obj.date) };
              const newId = saveDocument(doc);
              if (id != null) idMaps.documents[id] = newId;
              report.documents++;
              if (onProgress && (totalDone + i) % 500 === 0) onProgress('documents', totalDone + i + 1, null);
            } else if (entity === 'entries') {
              const docId = idMaps.documents[obj.documentId] != null ? idMaps.documents[obj.documentId] : obj.documentId;
              const accId = idMaps.accounts[obj.accountId] != null ? idMaps.accounts[obj.accountId] : obj.accountId;
              let amountDebit = obj.amountDebit != null ? parseFloat(obj.amountDebit) : (obj.debit ? (parseFloat(obj.amount) || 0) : 0);
              let amountCredit = obj.amountCredit != null ? parseFloat(obj.amountCredit) : (!obj.debit ? (parseFloat(obj.amount) || 0) : 0);
              if (obj.amountDebit != null && obj.amountCredit != null) {
                amountDebit = parseFloat(obj.amountDebit) || 0;
                amountCredit = parseFloat(obj.amountCredit) || 0;
              }
              const vatAmount = obj.vatAmount != null ? parseFloat(obj.vatAmount) : 0;
              const entry = { id: null, documentId: docId, accountId: accId, rowNumber: parseInt(obj.rowNumber, 10) || 0, amountDebit: amountDebit, amountCredit: amountCredit, vatAmount: vatAmount, description: String(obj.description != null ? obj.description : ''), flags: parseInt(obj.flags, 10) || 0 };
              saveEntry(entry);
              report.entries++;
              if (onProgress && (totalDone + i) % 1000 === 0) onProgress('entries', totalDone + i + 1, null);
            }
          }
          totalDone += rows.length;
          offset += CHUNK;
          if (rows.length < CHUNK) break;
          await yieldToUI();
        }
      }

      if (doReplace && report.errors.length === 0 && typeof getSettings === 'function') {
        const settings = getSettings();
        let needSave = false;
        if (getPeriods().length > 0 && !getPeriodById(settings.currentPeriodId)) {
          settings.currentPeriodId = getPeriods()[0].id;
          needSave = true;
        }
        if (getDocumentTypes().length > 0 && !getDocumentTypeById(settings.documentTypeId)) {
          settings.documentTypeId = getDocumentTypes()[0].id;
          needSave = true;
        }
        if (needSave) saveSettings(settings);
      }
      if (!doReplace) {
        if (typeof reassignDocumentsToSpecificType === 'function') reassignDocumentsToSpecificType();
        if (typeof removeRedundantDocumentTypes === 'function') removeRedundantDocumentTypes();
      }
    } catch (err) {
      report.errors.push(err.message || err);
    } finally {
      try { db.close(); } catch (_) {}
    }
    return report;
  }

  function openImportPanel() {
    const container = document.getElementById('panelContainer');
    container.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'panel-overlay';
    const bodyHtml = '<div class="panel">' +
      '<div class="panel-title">Tuo SQL-tiedosto</div>' +
      '<div class="panel-body">' +
      '<p class="text-muted" style="font-size:0.9em;">Tuetut taulut: account/tili/accounts, period/tilikausi/periods, document_type/tositelaji, document/tosite/documents, entry/vienti/entries. Sarakkeet: id, number, name, type, period_id, document_id, amount_debit, amount_credit, jne.</p>' +
      '<label class="form-group"><input type="checkbox" id="importReplace"> Korvaa nykyinen tietokanta (tyhjentää tilin ennen tuontia)</label>' +
      '<div class="form-group">' +
      '<label>SQL-teksti (INSERT-lauseet)</label> ' +
      '<button type="button" class="btn btn-primary" id="importBtnTuo">Tuo</button>' +
      '<p class="text-muted" style="font-size:0.85em; margin-top:4px;">Liitä SQL-teksti alle ja paina Tuo. Tiedosto tuodaan automaattisesti kun valitset .sqlite/.db-tiedoston.</p>' +
      '</div>' +
      '<div class="form-group"><textarea id="importSqlText" rows="10" style="width:100%; font-family:monospace; font-size:12px;" placeholder="INSERT INTO account ..."></textarea></div>' +
      '<div class="form-group"><label>Tai valitse tiedosto</label><input type="file" id="importSqlFile" accept=".sql,.sqlite,.db,.db3,text/plain"></div>' +
      '<p id="importReport" class="import-report"></p>' +
      '</div>' +
      '<div class="panel-footer"></div></div>';
    overlay.innerHTML = bodyHtml;
    const footer = overlay.querySelector('.panel-footer');
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn';
    closeBtn.textContent = 'Sulje';
    closeBtn.onclick = () => overlay.remove();
    const importBtn = overlay.querySelector('#importBtnTuo');
    if (importBtn) {
      importBtn.onclick = async function () {
        const reportEl = overlay.querySelector('#importReport');
        const replaceChk = overlay.querySelector('#importReplace');
        const replace = replaceChk && replaceChk.checked;
        const textarea = overlay.querySelector('#importSqlText');
        let sql = (textarea && textarea.value) ? textarea.value.trim() : '';
        if (!sql) {
          reportEl.textContent = 'Liitä SQL-teksti yllä olevaan kenttään ja paina Tuo.';
          reportEl.style.color = 'var(--danger, #c00)';
          return;
        }
        reportEl.textContent = 'Tuodaan…';
        reportEl.style.color = '';
        try {
          const report = await runImport(sql, { replaceExisting: replace });
          let msg = 'Tuotu: ' + report.accounts + ' tiliä, ' + report.periods + ' tilikautta, ' + report.document_types + ' tositetyyppiä, ' + report.documents + ' tositetta, ' + report.entries + ' vientiä.';
          if (report.errors.length) msg += ' Virheet: ' + report.errors.join('; ');
          reportEl.textContent = msg;
          reportEl.style.color = report.errors.length ? 'var(--danger, #c00)' : '';
          if (report.accounts + report.periods + report.documents + report.entries > 0 && window.TilitinApp && window.TilitinApp.reloadDocuments) {
            window.TilitinApp.reloadDocuments();
          } else if (window.TilitinApp && window.TilitinApp.render) {
            window.TilitinApp.render();
          }
        } catch (err) {
          reportEl.textContent = 'Virhe: ' + (err.message || err);
          reportEl.style.color = 'var(--danger, #c00)';
        }
      };
    }
    footer.appendChild(closeBtn);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('.panel').addEventListener('click', (e) => e.stopPropagation());
    const fileInput = overlay.querySelector('#importSqlFile');
    if (fileInput) fileInput.addEventListener('change', function (e) {
      const f = e.target.files[0];
      if (!f) return;
      const reportEl = overlay.querySelector('#importReport');
      const replaceChk = overlay.querySelector('#importReplace');
      const replace = replaceChk && replaceChk.checked;
      const isSQLite = /\.(sqlite|db|db3)$/i.test(f.name);
      if (isSQLite) {
        reportEl.textContent = 'Tuodaan SQLite-tietokantaa…';
        reportEl.style.color = '';
        const r = new FileReader();
        r.onload = async function () {
          try {
            const report = await importFromSQLite(r.result, {
              replaceExisting: replace,
              onProgress: function (kind, current) {
                if (kind === 'documents') reportEl.textContent = 'Tuodaan tositteita ' + current + '…';
                else if (kind === 'entries') reportEl.textContent = 'Tuodaan vientejä ' + current + '…';
              }
            });
            let msg = 'Tuotu: ' + report.accounts + ' tiliä, ' + report.periods + ' tilikautta, ' + report.document_types + ' tositetyyppiä, ' + report.documents + ' tositetta, ' + report.entries + ' vientiä.';
            if (report.errors.length) msg += ' Virheet: ' + report.errors.join('; ');
            reportEl.textContent = msg;
            reportEl.style.color = report.errors.length ? 'var(--danger, #c00)' : '';
            if (report.accounts + report.periods + report.documents + report.entries > 0 && window.TilitinApp && window.TilitinApp.reloadDocuments) {
              window.TilitinApp.reloadDocuments();
            } else if (window.TilitinApp && window.TilitinApp.render) {
              window.TilitinApp.render();
            }
          } catch (err) {
            reportEl.textContent = 'Virhe: ' + (err.message || err);
            reportEl.style.color = 'var(--danger, #c00)';
          }
        };
        r.readAsArrayBuffer(f);
        return;
      }
      const ta = overlay.querySelector('#importSqlText');
      if (ta) {
        const reader = new FileReader();
        reader.onload = function () {
          ta.value = reader.result;
          const reportEl = overlay.querySelector('#importReport');
          if (reportEl) reportEl.textContent = 'Tiedosto ladattu. Paina Tuo tuodaksesi.';
        };
        reader.readAsText(f, 'UTF-8');
      }
    });
    container.appendChild(overlay);
  }

  window.TilitinImportSQL = { runImport, parseInsertStatements, openImportPanel, importFromSQLite };
})();
