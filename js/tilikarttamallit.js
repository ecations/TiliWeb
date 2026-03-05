/**
 * Tilitin - Tilikarttamallit (chart of accounts templates)
 * Same structure as Java chart-of-accounts.txt in tilikarttamallit JARs.
 * Format: A;number;name;type  |  H;number;text;level  |  V;accountNumber;vatCode;vatRate;vatAccount1Num;vatAccount2Num
 * Types: 0=Vastaavaa, 1=Vastattavaa, 2=Oma pääoma, 3=Tulot, 4=Menot, 5=Edellisten voitto, 6=Tilikauden voitto
 * vatRate: percentage number or index 0-7 -> 0,22,17,8,12,9,13,23
 */

(function (global) {
  'use strict';

  const AccountType = {
    ASSET: 0,
    LIABILITY: 1,
    EQUITY: 2,
    REVENUE: 3,
    EXPENSE: 4,
    PROFIT_PREV: 5,
    PROFIT: 6
  };

  const VAT_RATE_MAP = [0, 22, 17, 8, 12, 9, 13, 23];

  const ACCOUNT_TYPE_NAMES = [
    'Vastaavaa',
    'Vastattavaa',
    'Oma pääoma',
    'Tulot',
    'Menot',
    'Edellisten tilikausien voitto',
    'Tilikauden voitto'
  ];

  const VAT_CODE_NAMES = [
    '---',
    'Arvonlisäverovelka',
    'Suoritettava ALV',
    'Vähennettävä ALV',
    'Verollinen myynti',
    'Verollinen osto',
    'Veroton myynti',
    'Veroton osto',
    'Yhteisömyynti',
    'Yhteisöosto',
    'Rakentamispalvelun myynti',
    'Rakentamispalvelun osto'
  ];

  /**
   * Minimal 7-account chart for quick start.
   */
  const MINIMAL_COA_ACCOUNTS = [
    { number: '1000', name: 'Kassa', type: AccountType.ASSET, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '1100', name: 'Pankkitili', type: AccountType.ASSET, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '2000', name: 'Ostovelat', type: AccountType.LIABILITY, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '2930', name: 'Arvonlisäverovelka', type: AccountType.LIABILITY, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '2940', name: 'Arvonlisäverosaatavat', type: AccountType.LIABILITY, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '4000', name: 'Myyntituotot', type: AccountType.REVENUE, vatCode: 4, vatRate: 24, vatAccount1Number: '2930', vatAccount2Number: null },
    { number: '5000', name: 'Ostot', type: AccountType.EXPENSE, vatCode: 5, vatRate: 24, vatAccount1Number: '2940', vatAccount2Number: null }
  ];

  const MINIMAL_COA_HEADINGS = [
    { number: '1', text: 'VASTAAVAA', level: 0 },
    { number: '2', text: 'VASTATTAVAA', level: 0 },
    { number: '4', text: 'TULOT', level: 0 },
    { number: '5', text: 'MENOT', level: 0 }
  ];

  /**
   * Default chart of accounts (ammatinharjoittaja / yleinen tilikartta).
   * Same account and heading structure as the Java default tilikarttamalli.
   */
  const DEFAULT_COA_ACCOUNTS = [
    { number: '1000', name: 'Kassa', type: AccountType.ASSET, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '1100', name: 'Pankkitili', type: AccountType.ASSET, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '1200', name: 'Säästötili', type: AccountType.ASSET, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '1300', name: 'Myyntisaamiset', type: AccountType.ASSET, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '1310', name: 'Ostajien osamaksusaamiset', type: AccountType.ASSET, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '1380', name: 'Muut saamiset', type: AccountType.ASSET, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '1390', name: 'Arvonlisäverosaamiset', type: AccountType.ASSET, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '1400', name: 'Ostojen ennakot', type: AccountType.ASSET, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '1600', name: 'Kuluetukset', type: AccountType.ASSET, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '1650', name: 'Tulonlaskennassa edellytetyt menot', type: AccountType.ASSET, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '2000', name: 'Ostovelat', type: AccountType.LIABILITY, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '2100', name: 'Saajat', type: AccountType.LIABILITY, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '2180', name: 'Muut vastattavat', type: AccountType.LIABILITY, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '2930', name: 'Arvonlisäverovelka', type: AccountType.LIABILITY, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '2940', name: 'Arvonlisäverosaatavat', type: AccountType.LIABILITY, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '2800', name: 'Pankkilainat', type: AccountType.LIABILITY, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '3000', name: 'Oma pääoma', type: AccountType.EQUITY, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '3190', name: 'Edellisten tilikausien voitto (tappio)', type: AccountType.PROFIT_PREV, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '3200', name: 'Tilikauden voitto (tappio)', type: AccountType.PROFIT, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '4000', name: 'Myyntituotot', type: AccountType.REVENUE, vatCode: 1, vatRate: 24, vatAccount1Number: '2930', vatAccount2Number: null },
    { number: '4100', name: 'Palvelutuotot', type: AccountType.REVENUE, vatCode: 1, vatRate: 24, vatAccount1Number: '2930', vatAccount2Number: null },
    { number: '4200', name: 'Muut liiketoiminnan tuotot', type: AccountType.REVENUE, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '4300', name: 'Korkotuotot', type: AccountType.REVENUE, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '4310', name: 'Osinkotuotot', type: AccountType.REVENUE, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '4400', name: 'Poikkeukselliset tuotot', type: AccountType.REVENUE, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '5000', name: 'Ostot', type: AccountType.EXPENSE, vatCode: 2, vatRate: 24, vatAccount1Number: '2940', vatAccount2Number: null },
    { number: '5100', name: 'Palvelut', type: AccountType.EXPENSE, vatCode: 2, vatRate: 24, vatAccount1Number: '2940', vatAccount2Number: null },
    { number: '5110', name: 'Palkat ja palkkiot', type: AccountType.EXPENSE, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '5120', name: 'Sosiaaliturvamaksut', type: AccountType.EXPENSE, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '5200', name: 'Poistot', type: AccountType.EXPENSE, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '5300', name: 'Vuokrat', type: AccountType.EXPENSE, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '5310', name: 'Vakuutusmaksut', type: AccountType.EXPENSE, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '5320', name: 'Kuljetusmenot', type: AccountType.EXPENSE, vatCode: 2, vatRate: 24, vatAccount1Number: '2940', vatAccount2Number: null },
    { number: '5330', name: 'Matkamenot', type: AccountType.EXPENSE, vatCode: 2, vatRate: 24, vatAccount1Number: '2940', vatAccount2Number: null },
    { number: '5340', name: 'Toimiston välttämättömät menot', type: AccountType.EXPENSE, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '5350', name: 'Mainos- ja tiedotusmenot', type: AccountType.EXPENSE, vatCode: 2, vatRate: 24, vatAccount1Number: '2940', vatAccount2Number: null },
    { number: '5360', name: 'Laskutus- ja perintäkulut', type: AccountType.EXPENSE, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '5370', name: 'Pankki- ja maksuliikennekulut', type: AccountType.EXPENSE, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '5380', name: 'Muut hallintomenot', type: AccountType.EXPENSE, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '5400', name: 'Korkomenot', type: AccountType.EXPENSE, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null },
    { number: '5500', name: 'Poikkeukselliset menot', type: AccountType.EXPENSE, vatCode: 0, vatRate: 0, vatAccount1Number: null, vatAccount2Number: null }
  ];

  const DEFAULT_COA_HEADINGS = [
    { number: '1', text: 'VASTAAVAA', level: 0 },
    { number: '10', text: 'Rahat ja pankit', level: 1 },
    { number: '12', text: 'Saamiset', level: 1 },
    { number: '14', text: 'Ennakot ja kuluetukset', level: 1 },
    { number: '2', text: 'VASTATTAVAA', level: 0 },
    { number: '20', text: 'Ostovelat', level: 1 },
    { number: '21', text: 'Muut velat', level: 1 },
    { number: '23', text: 'Arvonlisävero', level: 1 },
    { number: '28', text: 'Rahoitusvastattavat', level: 1 },
    { number: '3', text: 'OMA PÄÄOMA', level: 0 },
    { number: '30', text: 'Oma pääoma', level: 1 },
    { number: '31', text: 'Edellisten tilikausien tulos', level: 1 },
    { number: '32', text: 'Tilikauden tulos', level: 1 },
    { number: '4', text: 'TULOT', level: 0 },
    { number: '40', text: 'Liikevaihto', level: 1 },
    { number: '42', text: 'Rahoitustuotot', level: 1 },
    { number: '43', text: 'Poikkeukselliset tuotot', level: 1 },
    { number: '5', text: 'MENOT', level: 0 },
    { number: '50', text: 'Ostot', level: 1 },
    { number: '51', text: 'Henkilöstömenot', level: 1 },
    { number: '52', text: 'Poistot', level: 1 },
    { number: '53', text: 'Muut toimintamenot', level: 1 },
    { number: '54', text: 'Rahoitustappiot', level: 1 },
    { number: '55', text: 'Poikkeukselliset menot', level: 1 }
  ];

  /** Optional templates loaded from external coa-*.js files (e.g. from Java tilikarttamallit JARs). */
  const optionalTemplates = [];

  function registerTemplate(id, name, accounts, headings) {
    optionalTemplates.push({ id, name, accounts: accounts.map(a => ({ ...a })), headings: headings.map(h => ({ ...h })) });
  }

  function getDefaultCOAAccounts() {
    return DEFAULT_COA_ACCOUNTS.map(a => ({ ...a }));
  }

  function getDefaultCOAHeadings() {
    return DEFAULT_COA_HEADINGS.map(h => ({ ...h }));
  }

  /**
   * Returns available chart of accounts templates for selection.
   * @returns {{ id: string, name: string }[]}
   */
  function getTemplateList() {
    const list = [
      { id: 'minimal', name: 'Minimal (7 tiliä)' },
      { id: 'ammatinharjoittaja', name: 'Ammatinharjoittaja (täysi tilikartta)' }
    ];
    optionalTemplates.forEach(t => list.push({ id: t.id, name: t.name }));
    return list;
  }

  function getAccountsForTemplate(templateId) {
    const opt = optionalTemplates.find(t => t.id === templateId);
    if (opt) return opt.accounts.map(a => ({ ...a }));
    if (templateId === 'minimal') return MINIMAL_COA_ACCOUNTS.map(a => ({ ...a }));
    if (templateId === 'ammatinharjoittaja') return getDefaultCOAAccounts();
    return [];
  }

  function getHeadingsForTemplate(templateId) {
    const opt = optionalTemplates.find(t => t.id === templateId);
    if (opt) return opt.headings.map(h => ({ ...h }));
    if (templateId === 'minimal') return MINIMAL_COA_HEADINGS.map(h => ({ ...h }));
    if (templateId === 'ammatinharjoittaja') return getDefaultCOAHeadings();
    return [];
  }

  function resolveVatRate(vatRate) {
    if (vatRate == null) return 0;
    const str = String(vatRate).trim().replace(',', '.');
    const n = typeof vatRate === 'number' ? vatRate : parseFloat(str);
    if (isNaN(n)) return 0;
    if (n >= 0 && n <= 7 && n === Math.floor(n)) return VAT_RATE_MAP[n];
    return n;
  }

  global.Tilikarttamallit = {
    getDefaultCOAAccounts,
    getDefaultCOAHeadings,
    getTemplateList,
    getAccountsForTemplate,
    getHeadingsForTemplate,
    registerTemplate,
    AccountType,
    ACCOUNT_TYPE_NAMES,
    VAT_CODE_NAMES,
    VAT_RATE_MAP,
    resolveVatRate
  };
})(typeof window !== 'undefined' ? window : this);
