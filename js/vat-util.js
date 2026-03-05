/**
 * VAT calculation utilities - port from kirjanpito.util.VATUtil
 * Java: addVatAmount (VAT from net), subtractVatAmount (VAT from gross)
 */
(function () {
  'use strict';

  function addVatAmount(percentage, amount) {
    if (percentage == null || amount == null) return 0;
    const p = parseFloat(String(percentage).replace(',', '.'));
    const a = parseFloat(String(amount).replace(',', '.'));
    if (isNaN(p) || isNaN(a)) return 0;
    return Math.round(a * p / 100 * 100) / 100;
  }

  function subtractVatAmount(percentage, amount) {
    if (percentage == null || amount == null) return 0;
    const p = parseFloat(String(percentage).replace(',', '.'));
    const a = parseFloat(String(amount).replace(',', '.'));
    if (isNaN(p) || isNaN(a)) return 0;
    const factor = 1 - 1 / (1 + p / 100);
    return Math.round(a * factor * 100) / 100;
  }

  window.VATUtil = { addVatAmount, subtractVatAmount };
})();
