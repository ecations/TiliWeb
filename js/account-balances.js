/**
 * Account balances calculator - port from kirjanpito.util.AccountBalances
 * Computes account balances from entries (debit/credit by account type)
 */
(function () {
  'use strict';

  const TYPE_ASSET = 0;
  const TYPE_LIABILITY = 1;
  const TYPE_EQUITY = 2;
  const TYPE_REVENUE = 3;
  const TYPE_EXPENSE = 4;
  const TYPE_PROFIT_PREV = 5;
  const TYPE_PROFIT = 6;

  function AccountBalances(accounts) {
    this.balances = {};
    this.profit = 0;
    this.count = 0;
    if (accounts && accounts.length) {
      accounts.forEach(a => {
        this.balances[a.id] = { account: a, balance: null };
      });
    }
  }

  AccountBalances.prototype.addEntry = function (entry) {
    const ab = this.balances[entry.accountId];
    if (!ab) return;

    const deb = parseFloat(entry.amountDebit != null ? entry.amountDebit : (entry.debit ? (entry.amount || 0) : 0)) || 0;
    const cred = parseFloat(entry.amountCredit != null ? entry.amountCredit : (!entry.debit ? (entry.amount || 0) : 0)) || 0;
    let amount = deb > 0 ? deb : cred;
    const debit = deb > 0;
    const type = ab.account.type != null ? Number(ab.account.type) : -1;

    if ((type === TYPE_ASSET && !debit) ||
        (type === TYPE_EXPENSE && !debit) ||
        (type === TYPE_LIABILITY && debit) ||
        (type === TYPE_EQUITY && debit) ||
        (type === TYPE_REVENUE && debit) ||
        (type === TYPE_PROFIT_PREV && debit) ||
        (type === TYPE_PROFIT && debit)) {
      amount = -amount;
    }

    if (type === TYPE_EXPENSE) this.profit -= amount;
    else if (type === TYPE_REVENUE) this.profit += amount;

    if (ab.balance == null) {
      ab.balance = amount;
      this.count++;
    } else {
      ab.balance += amount;
    }
  };

  AccountBalances.prototype.getBalance = function (accountId) {
    const ab = this.balances[accountId];
    return ab == null ? null : ab.balance;
  };

  window.AccountBalances = AccountBalances;
})();
