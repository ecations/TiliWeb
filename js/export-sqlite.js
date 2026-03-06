/**
 * Tilitin - Export all data to a SQLite file compatible with original Tilitin (Java).
 * Use: Työkalut → Vie SQLite…
 */

(function () {
  'use strict';

  var TILITIN_SQLITE_SCHEMA =
    'CREATE TABLE account (' +
    'id integer PRIMARY KEY AUTOINCREMENT NOT NULL,' +
    'number varchar(10) NOT NULL,' +
    'name varchar(100) NOT NULL,' +
    'type integer NOT NULL,' +
    'vat_code integer NOT NULL,' +
    'vat_percentage numeric(10, 2) NOT NULL,' +
    'vat_account1_id integer,' +
    'vat_account2_id integer,' +
    'flags integer NOT NULL,' +
    'FOREIGN KEY (vat_account1_id) REFERENCES account (id),' +
    'FOREIGN KEY (vat_account2_id) REFERENCES account (id)' +
    ');' +
    'CREATE TABLE coa_heading (' +
    'id integer PRIMARY KEY AUTOINCREMENT NOT NULL,' +
    'number varchar(10) NOT NULL,' +
    'text varchar(100) NOT NULL,' +
    'level integer NOT NULL' +
    ');' +
    'CREATE TABLE period (' +
    'id integer PRIMARY KEY AUTOINCREMENT NOT NULL,' +
    'start_date date NOT NULL,' +
    'end_date date NOT NULL,' +
    'locked bool NOT NULL' +
    ');' +
    'CREATE TABLE document (' +
    'id integer PRIMARY KEY AUTOINCREMENT NOT NULL,' +
    'number integer NOT NULL,' +
    'period_id integer NOT NULL,' +
    'date date NOT NULL,' +
    'FOREIGN KEY (period_id) REFERENCES period (id)' +
    ');' +
    'CREATE TABLE entry (' +
    'id integer PRIMARY KEY AUTOINCREMENT NOT NULL,' +
    'document_id integer NOT NULL,' +
    'account_id integer NOT NULL,' +
    'debit bool NOT NULL,' +
    'amount numeric(10, 2) NOT NULL,' +
    'description varchar(100) NOT NULL,' +
    'row_number integer NOT NULL,' +
    'flags integer NOT NULL,' +
    'FOREIGN KEY (document_id) REFERENCES document (id),' +
    'FOREIGN KEY (account_id) REFERENCES account (id)' +
    ');' +
    'CREATE TABLE document_type (' +
    'id integer PRIMARY KEY AUTOINCREMENT NOT NULL,' +
    'number integer NOT NULL,' +
    'name varchar(100) NOT NULL,' +
    'number_start integer NOT NULL,' +
    'number_end integer NOT NULL' +
    ');' +
    'CREATE TABLE settings (' +
    'version integer NOT NULL,' +
    'name varchar(100) NOT NULL,' +
    'business_id varchar(50) NOT NULL,' +
    'current_period_id integer NOT NULL,' +
    'document_type_id integer,' +
    'properties text NOT NULL,' +
    'PRIMARY KEY (version),' +
    'FOREIGN KEY (current_period_id) REFERENCES period (id),' +
    'FOREIGN KEY (document_type_id) REFERENCES document_type (id)' +
    ');' +
    'CREATE TABLE report_structure (' +
    'id varchar(50) NOT NULL,' +
    'data text NOT NULL' +
    ');' +
    'CREATE TABLE entry_template (' +
    'id integer PRIMARY KEY AUTOINCREMENT NOT NULL,' +
    'number integer NOT NULL,' +
    'name varchar(100) NOT NULL,' +
    'account_id integer NOT NULL,' +
    'debit bool NOT NULL,' +
    'amount numeric(10, 2) NOT NULL,' +
    'description varchar(100) NOT NULL,' +
    'row_number integer NOT NULL,' +
    'FOREIGN KEY (account_id) REFERENCES account (id)' +
    ');' +
    'CREATE INDEX document_number_idx ON document (period_id, number);';

  /** Returns date as milliseconds since epoch (Java/SQLite compatible). Uses local midnight for yyyy-mm-dd. */
  function toDateMillis(d, fallbackMillis) {
    var def = fallbackMillis != null ? fallbackMillis : (new Date(2000, 0, 1).getTime());
    if (!d) return def;
    var dt;
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      var parts = d.split('-');
      dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      dt = typeof d === 'string' ? new Date(d) : d;
    }
    if (isNaN(dt.getTime())) return def;
    return dt.getTime();
  }

  /**
   * Export current app data (from getAccounts, getPeriods, etc.) to a SQLite file
   * compatible with original Tilitin Java app. Uses sql.js if available.
   * @returns {Promise<void>}
   */
  async function exportToSQLite() {
    if (typeof getAccounts !== 'function' || typeof getPeriods !== 'function') {
      alert('Datan lataus ei käytettävissä. Varmista että data.js on ladattu.');
      return;
    }
    if (typeof initSqlJs !== 'function') {
      alert('SQL.js ei ladattu. Lataa sivu uudelleen ja yritä uudelleen.');
      return;
    }

    var SQL;
    try {
      SQL = await initSqlJs({
        locateFile: function (file) {
          return 'js/vendor/' + file;
        }
      });
    } catch (e) {
      alert('SQL.js alustus epäonnistui: ' + (e.message || e));
      return;
    }

    var db = new SQL.Database();

    try {
      db.exec(TILITIN_SQLITE_SCHEMA);
    } catch (e) {
      alert('Tietokantarakenteen luonti epäonnistui: ' + (e.message || e));
      db.close();
      return;
    }

    var accounts = getAccounts();
    var coaHeadings = getCOAHeadings();
    var periods = getPeriods();
    var documentTypes = getDocumentTypes();
    var settings = getSettings();
    var entryTemplates = getEntryTemplates();
    var reportStructures = getReportStructures();

    var seenIds = { account: {}, coa_heading: {}, period: {}, document_type: {}, document: {}, entry: {}, entry_template: {} };

    for (var i = 0; i < accounts.length; i++) {
      var a = accounts[i];
      if (seenIds.account[a.id]) continue;
      seenIds.account[a.id] = true;
      var vat1 = a.vatAccount1Id > 0 ? a.vatAccount1Id : null;
      var vat2 = a.vatAccount2Id > 0 ? a.vatAccount2Id : null;
      db.run(
        'INSERT INTO account (id, number, name, type, vat_code, vat_percentage, vat_account1_id, vat_account2_id, flags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          a.id,
          String(a.number != null ? a.number : ''),
          String(a.name != null ? a.name : ''),
          parseInt(a.type, 10) || 0,
          parseInt(a.vatCode, 10) || 0,
          parseFloat(a.vatRate) || 0,
          vat1,
          vat2,
          parseInt(a.flags, 10) || 0
        ]
      );
    }

    for (var j = 0; j < coaHeadings.length; j++) {
      var h = coaHeadings[j];
      if (seenIds.coa_heading[h.id]) continue;
      seenIds.coa_heading[h.id] = true;
      db.run(
        'INSERT INTO coa_heading (id, number, text, level) VALUES (?, ?, ?, ?)',
        [
          h.id,
          String(h.number != null ? h.number : ''),
          String(h.text != null ? h.text : ''),
          parseInt(h.level, 10) || 0
        ]
      );
    }

    for (var k = 0; k < periods.length; k++) {
      var p = periods[k];
      if (seenIds.period[p.id]) continue;
      seenIds.period[p.id] = true;
      db.run(
        'INSERT INTO period (id, start_date, end_date, locked) VALUES (?, ?, ?, ?)',
        [
          p.id,
          toDateMillis(p.startDate),
          toDateMillis(p.endDate),
          p.locked ? 1 : 0
        ]
      );
    }

    for (var t = 0; t < documentTypes.length; t++) {
      var dt = documentTypes[t];
      if (seenIds.document_type[dt.id]) continue;
      seenIds.document_type[dt.id] = true;
      db.run(
        'INSERT INTO document_type (id, number, name, number_start, number_end) VALUES (?, ?, ?, ?, ?)',
        [
          dt.id,
          parseInt(dt.number, 10) || 0,
          String(dt.name != null ? dt.name : ''),
          (dt.numberStart != null && dt.numberStart !== '') ? parseInt(dt.numberStart, 10) : 0,
          (dt.numberEnd != null && dt.numberEnd !== '') ? parseInt(dt.numberEnd, 10) : 99999
        ]
      );
    }

    var allDocs = [];
    for (var pi = 0; pi < periods.length; pi++) {
      var docs = getDocuments(periods[pi].id, null);
      for (var di = 0; di < docs.length; di++) allDocs.push(docs[di]);
    }
    for (var d = 0; d < allDocs.length; d++) {
      var doc = allDocs[d];
      if (seenIds.document[doc.id]) continue;
      seenIds.document[doc.id] = true;
      db.run(
        'INSERT INTO document (id, number, period_id, date) VALUES (?, ?, ?, ?)',
        [
          doc.id,
          parseInt(doc.number, 10) || 0,
          doc.periodId,
          toDateMillis(doc.date)
        ]
      );
    }

    for (var e = 0; e < allDocs.length; e++) {
      var entries = getEntriesByDocument(allDocs[e].id);
      for (var ei = 0; ei < entries.length; ei++) {
        var ent = entries[ei];
        if (seenIds.entry[ent.id]) continue;
        seenIds.entry[ent.id] = true;
        var amountDebit = ent.amountDebit != null ? parseFloat(ent.amountDebit) : (ent.debit ? (parseFloat(ent.amount) || 0) : 0);
        var amountCredit = ent.amountCredit != null ? parseFloat(ent.amountCredit) : (!ent.debit ? (parseFloat(ent.amount) || 0) : 0);
        var debit = amountDebit > 0;
        var amount = amountDebit > 0 ? amountDebit : amountCredit;
        db.run(
          'INSERT INTO entry (id, document_id, account_id, debit, amount, description, row_number, flags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            ent.id,
            ent.documentId,
            ent.accountId,
            debit ? 1 : 0,
            amount,
            String(ent.description != null ? ent.description : '').substring(0, 100),
            parseInt(ent.rowNumber, 10) || 0,
            parseInt(ent.flags, 10) || 0
          ]
        );
      }
    }

    var currentPeriodId = settings.currentPeriodId != null ? settings.currentPeriodId : (periods.length ? periods[0].id : 0);
    var docTypeId = settings.documentTypeId != null && settings.documentTypeId > 0 ? settings.documentTypeId : null;
    var propertiesJson = settings.properties && typeof settings.properties === 'object'
      ? JSON.stringify(settings.properties)
      : '{}';
    db.run(
      'INSERT INTO settings (version, name, business_id, current_period_id, document_type_id, properties) VALUES (?, ?, ?, ?, ?, ?)',
      [
        14,
        String(settings.name != null ? settings.name : ''),
        String(settings.businessId != null ? settings.businessId : ''),
        currentPeriodId,
        docTypeId,
        propertiesJson
      ]
    );

    for (var et = 0; et < entryTemplates.length; et++) {
      var tmpl = entryTemplates[et];
      if (seenIds.entry_template[tmpl.id]) continue;
      seenIds.entry_template[tmpl.id] = true;
      var tDebit = tmpl.debit != null ? !!tmpl.debit : (tmpl.amountDebit > 0);
      var tAmount = tmpl.amount != null ? parseFloat(tmpl.amount) : ((tmpl.amountDebit || 0) + (tmpl.amountCredit || 0));
      if (tAmount === 0 && (tmpl.amountDebit > 0 || tmpl.amountCredit > 0)) {
        tDebit = (tmpl.amountDebit || 0) > 0;
        tAmount = tmpl.amountDebit || tmpl.amountCredit || 0;
      }
      db.run(
        'INSERT INTO entry_template (id, number, name, account_id, debit, amount, description, row_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          tmpl.id,
          parseInt(tmpl.number, 10) || 0,
          String(tmpl.name != null ? tmpl.name : ''),
          tmpl.accountId,
          tDebit ? 1 : 0,
          tAmount,
          String(tmpl.description != null ? tmpl.description : '').substring(0, 100),
          parseInt(tmpl.rowNumber, 10) || 0
        ]
      );
    }

    for (var r = 0; r < reportStructures.length; r++) {
      var rs = reportStructures[r];
      var dataStr = typeof rs.data === 'string' ? rs.data : (rs.data != null ? JSON.stringify(rs.data) : '');
      db.run(
        'INSERT INTO report_structure (id, data) VALUES (?, ?)',
        [String(rs.id != null ? rs.id : ''), dataStr]
      );
    }

    var defaultReportIds = ['balance-sheet', 'balance-sheet-detailed', 'income-statement', 'income-statement-detailed'];
    var insertedReportIds = {};
    for (var ri = 0; ri < reportStructures.length; ri++) {
      insertedReportIds[String(reportStructures[ri].id)] = true;
    }
    if (window.TilitinDefaultReportStructures) {
      for (var di = 0; di < defaultReportIds.length; di++) {
        var reportId = defaultReportIds[di];
        if (!insertedReportIds[reportId]) {
          var defaultData = window.TilitinDefaultReportStructures[reportId];
          if (defaultData) {
            db.run(
              'INSERT INTO report_structure (id, data) VALUES (?, ?)',
              [reportId, defaultData]
            );
          }
        }
      }
    }

    var binary = db.export();
    db.close();

    var blob = new Blob([binary], { type: 'application/x-sqlite3' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'tilitin.sqlite';
    a.click();
    URL.revokeObjectURL(url);
  }

  window.TilitinExportSQLite = { exportToSQLite: exportToSQLite };
})();
