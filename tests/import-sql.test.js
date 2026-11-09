const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('SQL parser retains every column across multiple values and rows', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/import-sql.js'), 'utf8'), context);
  const statements = context.window.TilitinImportSQL.parseInsertStatements(
    "INSERT INTO account (id, number, name, type) VALUES (1, '9991', 'Testi, tili', 0), (2, '9992', NULL, 4);"
  );
  assert.deepEqual(JSON.parse(JSON.stringify(statements)), [{
    table: 'account', columns: ['id', 'number', 'name', 'type'],
    rows: [[1, '9991', 'Testi, tili', 0], [2, '9992', null, 4]]
  }]);
});
