/**
 * Tilitin - Reports (account summary, document print, journal, ledger, VAT)
 */

(function () {
  'use strict';

  // Delegate to global formatNum from data.js (respects decimal separator setting).
  // formatNum is defined globally in data.js.

  // Financial statement formatter: empty string for zero/NaN rather than '0,00'.
  function formatFsAmount(x) {
    const n = parseFloat(x);
    if (isNaN(n)) return '';
    return formatNum(n);
  }

  function _reportBaseUrl() {
    // Strip filename (or last path segment) from current URL.
    return String(window.location.href || '').replace(/\/[^/]*$/, '/');
  }

  function openReportPopup(title, bodyHtml) {
    const base = _reportBaseUrl();
    const w = window.open('', '_blank');
    if (!w) {
      alert('Ponnahdusikkuna estettiin. Salli ponnahdusikkunat tälle sivulle.');
      return false;
    }
    const safeTitle = String(title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    w.document.open();
    w.document.write(
      '<!doctype html><html><head>' +
      '<meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<base href="' + base + '">' +
      '<title>' + safeTitle + '</title>' +
      '<link rel="stylesheet" href="css/app.css">' +
      '<style>body{margin:18px;} .report-view{max-width:980px;margin:0 auto;}</style>' +
      '</head><body>' +
      '<div class="report-view">' + bodyHtml + '</div>' +
      '</body></html>'
    );
    w.document.close();
    try { w.focus(); } catch (_) {}
    return true;
  }

  function showReportInPanel(title, html) {
    const container = document.getElementById('panelContainer');
    container.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'panel-overlay';
    overlay.innerHTML = '<div class="panel" style="max-width: 900px; width: 90%;">' +
      '<div class="panel-title">' + title + '</div>' +
      '<div class="panel-body report-view">' + html + '</div>' +
      '<div class="panel-footer" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<button type="button" class="btn btn-primary" id="btnPrintReport">Tulosta</button>' +
        '<button type="button" class="btn" id="btnOpenPopupReport">Avaa ponnahdusikkunassa</button>' +
        '<button type="button" class="btn" id="btnCloseReport">Sulje</button>' +
      '</div></div>';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('.panel').addEventListener('click', (e) => e.stopPropagation());
    overlay.querySelector('#btnCloseReport').onclick = () => overlay.remove();
    overlay.querySelector('#btnPrintReport').onclick = () => window.print();
    overlay.querySelector('#btnOpenPopupReport').onclick = () => openReportPopup(title, html);
    container.appendChild(overlay);
  }

  function parseStructureFromTemplate(structureText, opts) {
    const { balancesByCol = [], cols = [], accounts = [], negateExpense = true } = opts || {};
    function inRange(num, start, stop) {
      if (start === stop) return num === start;
      return num >= start && num < stop;
    }
    function calculateBalanceForRange(start, stop, colIndex, sum) {
      accounts.forEach(acc => {
        const number = String(acc.number || '');
        if (!number) return;
        if (!inRange(number, start, stop)) return;
        let bal = balancesByCol[colIndex] && balancesByCol[colIndex][acc.id];
        if (bal == null) return;
        if (negateExpense && acc.type === 4) bal = -bal;
        sum = (sum == null) ? bal : (sum + bal);
      });
      return sum;
    }
    function addDetailRows(start, stop, style, level, filterChar, rows) {
      accounts.forEach(acc => {
        const number = String(acc.number || '');
        if (!number) return;
        if (!inRange(number, start, stop)) return;
        const amounts = cols.map((_, i) => {
          let a = balancesByCol[i] && balancesByCol[i][acc.id];
          if (a != null && negateExpense && acc.type === 4) a = -a;
          return a;
        });
        let nonZero = amounts.some(a => a != null);
        if (amounts[0] == null && filterChar === '0') { amounts[0] = 0; nonZero = true; }
        if (!nonZero) return;
        if (amounts[0] != null) {
          if (filterChar === '+' && amounts[0] < 0) return;
          if (filterChar === '-' && amounts[0] > 0) return;
          if (filterChar === '0' && amounts[0] !== 0) return;
        }
        rows.push({ number: acc.number, text: acc.name || '', style, level, amounts });
      });
    }
    const rows = [];
    const numberFormatLines = (structureText || '').split(/\r?\n/);
    numberFormatLines.forEach(line => {
      if (line == null) return;
      const raw = String(line);
      if (raw.length === 0) { rows.push({ empty: true }); return; }
      if (raw.startsWith('-')) { rows.push({ empty: true }); return; }
      const typeChar = raw.charAt(0);
      let styleChar = raw.charAt(1);
      let offset = 1;
      if (typeChar === 'D' && (styleChar === '+' || styleChar === '-' || styleChar === '0')) {
        offset = 2;
        styleChar = raw.charAt(offset);
      }
      const level = parseInt(raw.charAt(offset + 1), 10) || 0;
      const style = (styleChar === 'B') ? 'bold' : (styleChar === 'I' ? 'italic' : 'plain');
      const filterChar = raw.charAt(1);
      const parts = raw.substring(offset + 3).split(';');
      if (parts.length < 1) return;
      const text = parts[parts.length - 1] || '';
      const ranges = parts.slice(0, -1);
      if (typeChar === 'D') {
        for (let i = 0; i + 1 < ranges.length; i += 2) {
          addDetailRows(ranges[i], ranges[i + 1], style, level, filterChar, rows);
        }
        return;
      }
      let amounts = cols.map(() => null);
      for (let i = 0; i + 1 < ranges.length; i += 2) {
        for (let c = 0; c < cols.length; c++) {
          amounts[c] = calculateBalanceForRange(ranges[i], ranges[i + 1], c, amounts[c]);
        }
      }
      let nonZero = false;
      for (let i = 0; i < amounts.length; i++) {
        if (amounts[i] != null) { nonZero = true; break; }
      }
      if (!nonZero && (typeChar === 'G' || typeChar === 'T')) return;
      if (typeChar === 'H' || typeChar === 'G') amounts = null;
      rows.push({ number: null, text, style, level, amounts });
    });
    return rows;
  }

  const _IS_DEFAULT = [

      'DP0;3000;3600;LIIKEVAIHTO',
      '-',
      'SB0;3000;3600;LIIKEVAIHTO',
      '-',
      'GB0;3600;3630;Valmiiden ja keskeneräisten tuotteiden varastojen muutos',
      'DP1;3600;3630;Valmiiden ja keskeneräisten tuotteiden varastojen muutos',
      'TB0;3600;3630;Tuotteiden varastojen muutos yhteensä',
      '-',
      'GB0;3630;3650;Valmistus omaan käyttöön',
      'DP1;3630;3650;Valmistus omaan käyttöön',
      'TB0;3630;3650;Valmistus omaan käyttöön yhteensä',
      '-',
      'GB0;3650;4000;Liiketoiminnan muut tuotot',
      'DP1;3650;4000;Liiketoiminnan muut tuotot',
      'TB0;3650;4000;Liiketoiminnan muut tuotot yhteensä',
      '-',
      'GB0;4000;5000;Materiaalit ja palvelut',
      'GB1;4000;4450;Aineet, tarvikkeet ja tavarat',
      '',
      'GB2;4000;4400;Ostot tilikauden aikana',
      'DP3;4000;4400;Ostot tilikauden aikana',
      'TB2;4000;4400;Ostot tilikauden aikana yhteensä',
      '',
      'GB2;4400;4450;Varastojen muutos',
      'DP3;4400;4450;Varastojen muutos',
      'TB2;4400;4450;Varastojen muutos yhteensä',
      '',
      'TB1;4000;4450;Aineet, tarvikkeet ja tavarat yhteensä',
      '',
      'GB1;4450;5000;Ulkopuoliset palvelut',
      'DP2;4450;5000;Ulkopuoliset palvelut',
      'TB1;4450;5000;Ulkopuoliset palvelut yhteensä',
      '',
      'TB0;4000;5000;Materiaalit ja palvelut yhteensä',
      '-',
      'GB0;5000;6800;Henkilöstökulut',
      '',
      'GB1;5000;6000;Palkat ja palkkiot',
      'DP2;5000;6000;Palkat ja palkkiot',
      'TB1;5000;6000;Palkat ja palkkiot yhteensä',
      '',
      'GB1;6000;6800;Henkilösivukulut',
      '',
      'GB2;6000;6300;Eläkekulut',
      'DP3;6000;6300;Eläkekulut',
      'TB2;6000;6300;Eläkekulut yhteensä',
      '',
      'GB2;6300;6800;Muut henkilösivukulut',
      'DP3;6300;6800;Muut henkilösivukulut',
      'TB2;6300;6800;Muut henkilösivukulut yhteensä',
      '',
      'TB1;6000;6800;Henkilösivukulut yhteensä',
      'TB0;5000;6800;Henkilöstökulut yhteensä',
      '-',
      'GB0;6800;7000;Poistot ja arvonalentumiset',
      '',
      'GB1;6800;6900;Suunnitelman mukaiset poistot',
      'DP2;6800;6900;Suunnitelman mukaiset poistot',
      'TB1;6800;6900;Suunnitelman mukaiset poistot yhteensä',
      '',
      'GB1;6900;6990;Arvonalentumiset pysyvien vastaavien hyödykkeistä',
      'DP2;6900;6990;Arvonalentumiset pysyvien vastaavien hyödykkeistä',
      'TB1;6900;6990;Arvonalentumiset pysyvien vastaavien hyödykkeistä yht.',
      '',
      'GB1;6990;7000;Vaihtuvien vastaavien poikkeukselliset arvonalentumiset',
      'DP2;6990;7000;Vaihtuvien vastaavien poikkeukselliset arvonalentumiset',
      'TB1;6990;7000;Vaihtuvien vastaavien poik. arvonalentumiset yht.',
      '',
      'TB0;6800;7000;Poistot ja arvonalentumiset yhteensä',
      '-',
      'GB0;7000;8990;Liiketoiminnan muut kulut',
      'DP1;7000;8990;Liiketoiminnan muut kulut',
      'TB0;7000;8990;Liiketoiminnan muut kulut yhteensä',
      '-',
      'SB0;3000;9000;LIIKEVOITTO (-TAPPIO)',
      '-',
      'GB0;9000;9700;Rahoitustuotot ja -kulut',
      '',
      'GB1;9000;9040;Tuotot osuuksista saman konsernin yrityksissä',
      'DP2;9000;9040;Tuotot osuuksista saman konsernin yrityksissä',
      'TB1;9000;9040;Tuotot osuuksista saman konsernin yrityksissä yht.',
      '',
      'GB1;9040;9070;Tuotot osuuksista omistusyhteysyrityksissä',
      'DP2;9040;9070;Tuotot osuuksista omistusyhteysyrityksissä',
      'TB1;9040;9070;Tuotot osuuksista omistusyhteysyrityksissä yhteensä',
      '',
      'GB1;9080;9150;Tuotot muista pysyvien vastaavien sijoituksista',
      'DP2;9080;9150;Tuotot muista pysyvien vastaavien sijoituksista',
      'TB1;9080;9150;Tuotot muista pysyvien vastaavien sijoituksista yht.',
      '',
      'GB1;9150;9300;Muut korko- ja rahoitustuotot',
      'DP2;9150;9300;Muut korko- ja rahoitustuotot',
      'TB1;9150;9300;Muut korko- ja rahoitustuotot yhteensä',
      '',
      'GB1;9300;9370;Arvonalentumiset pysyvien vastaavien sijoituksista',
      'DP2;9300;9370;Arvonalentumiset pysyvien vastaavien sijoituksista',
      'TB1;9300;9370;Arvonalentumiset pys. vastaavien sijoituksista yht.',
      '',
      'GB1;9370;9420;Arvonalentumiset vaihtuvien vastaavien rahoitusarvopapereista',
      'DP2;9370;9420;Arvonalentumiset vaiht. vast. rahoitusarvopap. yht.',
      '',
      'GB1;9420;9700;Korkokulut ja muut rahoituskulut',
      'DP2;9420;9700;Korkokulut ja muut rahoituskulut',
      'TB1;9420;9700;Korkokulut ja muut rahoituskulut yhteensä',
      '',
      'TB0;9000;9700;Rahoitustuotot ja -kulut yhteensä',
      '-',
      'SB0;3000;9700;VOITTO (TAPPIO) ENNEN SATUNNAISIA ERIÄ',
      '-',
      'GB0;9700;9800;Satunnaiset erät',
      '',
      'GB1;9700;9740;Satunnaiset tuotot',
      'DP2;9700;9740;Satunnaiset tuotot',
      'TB1;9700;9740;Satunnaiset tuotot yhteensä',
      '',
      'GB1;9740;9780;Satunnaiset kulut',
      'DP2;9740;9780;Satunnaiset kulut',
      'TB1;9740;9780;Satunnaiset kulut yhteensä',
      '',
      'TB0;9700;9800;Satunnaiset erät yhteensä',
      '-',
      'SB0;3000;9800;VOITTO (TAPPIO) ENNEN TILINPÄÄTÖSSIIRTOJA JA VEROJA',
      '-',
      'GB0;9800;9900;Tilinpäätössiirrot',
      '',
      'GB1;9800;9840;Poistoeron muutos',
      'DP2;9800;9840;Poistoeron muutos',
      'TB1;9800;9840;Poistoeron muutos yhteensä',
      '',
      'GB1;9840;9900;Vapaaehtoisten varausten muutos',
      'DP2;9840;9900;Vapaaehtoisten varausten muutos',
      'TB1;9840;9900;Vapaaehtoisten varausten muutos yhteensä',
      '',
      'TB0;9800;9900;Tilinpäätössiirrot',
      '-',
      'GB0;9900;9980;Tuloverot',
      'DP1;9900;9980;Tuloverot',
      'TB0;9900;9980;Tuloverot yhteensä',
      '-',
      'GB0;9980;9990;Muut välittömät verot',
      'DP1;9980;9990;Muut välittömät verot',
      'TB0;9980;9990;Muut välittömät verot yhteensä',
      '-',
    'SB0;3000;9999;TILIKAUDEN VOITTO (TAPPIO)'
  ].join('\n');

  // Balance sheet detailed structure. Can be overridden via Raporttipohja editor (saved to localStorage).
  // getBalanceSheetStructure() returns the saved version if present, else the hardcoded default.
  const _BS_DEFAULT = [
    'HB0;1000;2000;VASTAAVAA',
    'HB1;1000;1500;PYSYVÄT VASTAAVAT',
    'GB2;1000;1100;Aineettomat hyödykkeet',
    'GB3;1020;1030;Kehittämismenot',
    'DP4;1020;1030;Kehittämismenot',
    'TB3;1020;1030;Kehittämismenot yhteensä',
    '',
    'GB3;1030;1050;Aineettomat oikeudet',
    'DP4;1030;1050;Aineettomat oikeudet',
    'TB3;1030;1050;Aineettomat oikeudet yhteensä',
    '',
    'GB3;1050;1070;Liikearvo',
    'DP4;1050;1070;Liikearvo',
    'TB3;1050;1070;Liikearvo yhteensä',
    '',
    'GB3;1070;1090;Muut pitkävaikutteiset menot',
    'DP4;1070;1090;Muut pitkävaikutteiset menot',
    'TB3;1070;1090;Muut pitkävaikutteiset menot yhteensä',
    '',
    'GB3;1090;1100;Ennakkomaksut',
    'DP4;1090;1100;Ennakkomaksut',
    'TB3;1090;1100;Ennakkomaksut yhteensä',
    '',
    'TB2;1000;1100;Aineettomat hyödykkeet yhteensä',
    'GB2;1100;1400;Aineelliset hyödykkeet',
    'GB3;1100;1120;Maa- ja vesialueet',
    'DP4;1100;1120;Maa- ja vesialueet',
    'TB3;1100;1120;Maa- ja vesialueet yhteensä',
    '',
    'GB3;1120;1160;Rakennukset ja rakennelmat',
    'DP4;1120;1160;Rakennukset ja rakennelmat',
    'TB3;1120;1160;Rakennukset ja rakennelmat yhteensä',
    '',
    'GB3;1160;1300;Koneet ja kalusto',
    'DP4;1160;1300;Koneet ja kalusto',
    'TB3;1160;1300;Koneet ja kalusto yhteensä',
    '',
    'GB3;1300;1380;Muut aineelliset hyödykkeet',
    'DP4;1300;1380;Muut aineelliset hyödykkeet',
    'TB3;1300;1380;Muut aineelliset hyödykkeet yhteensä',
    '',
    'GB3;1380;1400;Ennakkomaksut ja keskeneräiset hankinnat',
    'DP4;1380;1400;Ennakkomaksut ja keskeneräiset hankinnat',
    'TB3;1380;1400;Ennakkomaksut ja keskeneräiset hankinnat yhteensä',
    '',
    'TB2;1100;1400;Aineelliset hyödykkeet yhteensä',
    'GB2;1400;1500;Sijoitukset',
    'GB3;1400;1410;Osuudet saman konsernin yrityksissä',
    'DP4;1400;1410;Osuudet saman konsernin yrityksissä',
    'TB3;1400;1410;Osuudet saman konsernin yrityksissä yhteensä',
    '',
    'GB3;1410;1420;Saamiset saman konsernin yrityksiltä',
    'DP4;1410;1420;Saamiset saman konsernin yrityksiltä',
    'TB3;1410;1420;Saamiset saman konsernin yrityksiltä yhteensä',
    '',
    'GB3;1420;1430;Osuudet omistusyhteysyrityksissä',
    'DP4;1420;1430;Osuudet omistusyhteysyrityksissä',
    'TB3;1420;1430;Osuudet omistusyhteysyrityksissä yhteensä',
    '',
    'GB3;1430;1440;Saamiset omistusyhteysyrityksiltä',
    'DP4;1430;1440;Saamiset omistusyhteysyrityksiltä',
    'TB3;1430;1440;Saamiset omistusyhteysyrityksiltä yhteensä',
    '',
    'GB3;1440;1470;Muut osakkeet ja osuudet',
    'DP4;1440;1470;Muut osakkeet ja osuudet',
    'TB3;1440;1470;Muut osakkeet ja osuudet yhteensä',
    '',
    'GB3;1470;1500;Muut saamiset',
    'DP4;1470;1500;Muut saamiset',
    'TB3;1470;1500;Muut saamiset yhteensä',
    '',
    'TB2;1400;1500;Sijoitukset yhteensä',
    'SB1;1000;1500;Pysyvät vastaavat yhteensä',
    '-',
    'HB1;1500;2000;VAIHTUVAT VASTAAVAT',
    'GB2;1500;1600;Vaihto-omaisuus',
    'GB3;1500;1510;Aineet ja tarvikkeet',
    'DP4;1500;1510;Aineet ja tarvikkeet',
    'TB3;1500;1510;Aineet ja tarvikkeet yhteensä',
    '',
    'GB3;1510;1520;Keskeneräiset tuotteet',
    'DP4;1510;1520;Keskeneräiset tuotteet',
    'TB3;1510;1520;Keskeneräiset tuotteet yhteensä',
    '',
    'GB3;1520;1540;Valmiit tuotteet/tavarat',
    'DP4;1520;1540;Valmiit tuotteet/tavarat',
    'TB3;1520;1540;Valmiit tuotteet/tavarat yhteensä',
    '',
    'GB3;1540;1550;Muu vaihto-omaisuus',
    'DP4;1540;1550;Muu vaihto-omaisuus',
    'TB3;1540;1550;Muu vaihto-omaisuus yhteensä',
    '',
    'GB3;1550;1560;Ennakkomaksut',
    'DP4;1550;1560;Ennakkomaksut',
    'TB3;1550;1560;Ennakkomaksut yhteensä',
    '',
    'TB2;1500;1600;Vaihto-omaisuus yhteensä',
    'GB2;1600;1860;Saamiset',
    'GB3;1600;1630;1700;1730;Myyntisaamiset',
    'DP4;1600;1630;1700;1730;Myyntisaamiset',
    'TB3;1600;1630;1700;1730;Myyntisaamiset yhteensä',
    '',
    'GB3;1630;1640;1730;1740;Saamiset saman konsernin yrityksiltä',
    'DP4;1630;1640;1730;1740;Saamiset saman konsernin yrityksiltä',
    'TB3;1630;1640;1730;1740;Saamiset saman konsernin yrityksiltä yhteensä',
    '',
    'GB3;1640;1650;1740;1750;Saamiset omistusyhteysyrityksiltä',
    'DP4;1640;1650;1740;1750;Saamiset omistusyhteysyrityksiltä',
    'TB3;1640;1650;1740;1750;Saamiset omistusyhteysyrityksiltä yhteensä',
    '',
    'GB3;1650;1660;1750;1760;Lainasaamiset',
    'DP4;1650;1660;1750;1760;Lainasaamiset',
    'TB3;1650;1660;1750;1760;Lainasaamiset yhteensä',
    '',
    'GB3;1660;1670;1760;1780;Muut saamiset',
    'DP4;1660;1670;1760;1780;Muut saamiset',
    'TB3;1660;1670;1760;1780;Muut saamiset yhteensä',
    '',
    'GB3;1670;1680;1780;1800;Maksamattomat osakkeet/osuudet',
    'DP4;1670;1680;1780;1800;Maksamattomat osakkeet/osuudet',
    'TB3;1670;1680;1780;1800;Maksamattomat osakkeet/osuudet yhteensä',
    '',
    'GB3;1680;1690;1800;1850;Siirtosaamiset',
    'DP4;1680;1690;1800;1850;Siirtosaamiset',
    'TB3;1680;1690;1800;1850;Siirtosaamiset yhteensä',
    '',
    'TB2;1600;1860;Saamiset yhteensä',
    'GB2;1860;1900;Rahoitusarvopaperit',
    'GB3;1860;1870;Osuudet saman konsernin yrityksissä',
    'DP4;1860;1870;Osuudet saman konsernin yrityksissä',
    'TB3;1860;1870;Osuudet saman konsernin yrityksissä yhteensä',
    '',
    'GB3;1880;1890;Muut osakkeet ja osuudet',
    'DP4;1880;1890;Muut osakkeet ja osuudet',
    'TB3;1880;1890;Muut osakkeet ja osuudet yhteensä',
    '',
    'GB3;1890;1900;Muut arvopaperit',
    'DP4;1890;1900;Muut arvopaperit',
    'TB3;1890;1900;Muut arvopaperit yhteensä',
    '',
    'TB2;1860;1900;Rahoitusarvopaperit yhteensä',
    '',
    'GB2;1900;2000;Rahat ja pankkisaamiset',
    'DP3;1900;2000;Rahat ja pankkisaamiset',
    'TB2;1900;2000;Rahat ja pankkisaamiset yhteensä',
    '',
    'SB1;1500;2000;Vaihtuvat vastaavat yhteensä',
    'SB0;1000;2000;Vastaavaa yhteensä',
    '--',
    'HB0;2000;9999;VASTATTAVAA',
    'HB1;2000;2400;OMA PÄÄOMA',
    'GB2;2000;2020;Osakepääoma',
    'DP3;2000;2020;Osakepääoma',
    'TB2;2000;2020;Osakepääoma yhteensä',
    '',
    'GB2;2100;2110;Osuuspääoma',
    'DP3;2100;2110;Osuuspääoma',
    'TB2;2100;2110;Osuuspääoma yhteensä',
    '',
    'GB2;2150;2160;2180;2190;2340;2360;Pääomapanokset',
    'DP3;2150;2160;2180;2190;2340;2360;Pääomapanokset',
    'TB2;2150;2160;2180;2190;2340;2360;Pääomapanokset yhteensä',
    '',
    'GB2;2200;2210;2360;2370;Peruspääoma',
    'DP3;2200;2210;2360;2370;Peruspääoma',
    'TB2;2200;2210;2360;2370;Peruspääoma yhteensä',
    '',
    'GB2;2020;2030;Ylikurssirahasto',
    'DP3;2020;2030;Ylikurssirahasto',
    'TB2;2020;2030;Ylikurssirahasto yhteensä',
    '',
    'GB2;2030;2040;2110;2120;Arvonkorotusrahasto',
    'DP3;2030;2040;2110;2120;Arvonkorotusrahasto',
    'TB2;2030;2040;2110;2120;Arvonkorotusrahasto yhteensä',
    '',
    'GB2;2050;2100;Muut rahastot',
    'GB3;2050;2060;Vararahasto',
    'DP4;2050;2060;Vararahasto',
    'TB3;2050;2060;Vararahasto yhteensä',
    '',
    'GB3;2060;2070;Yhtiöjärjestyksen tai sääntöjen mukaiset rahastot',
    'DP4;2060;2070;Yhtiöjärjestyksen tai sääntöjen mukaiset rahastot',
    'TB3;2060;2070;Sääntöjen mukaiset rahastot yhteensä',
    '',
    'GB3;2070;2100;Muut rahastot',
    'DP4;2070;2100;Muut rahastot',
    'TB3;2070;2100;Muut rahastot yhteensä',
    '',
    'TB2;2050;2100;Muut rahastot yhteensä',
    '',
    'TB2;2250;2330;Edellisten tilikausien voitto (tappio)',
    '',
    'GB2;2330;2340;Pääomavajaus',
    'DP3;2330;2340;Pääomavajaus',
    'TB2;2330;2340;Pääomavajaus yhteensä',
    '',
    'TB2;3000;9999;Tilikauden voitto (tappio)',
    '',
    'GB2;2380;2390;Pääomalainat',
    'DP3;2380;2390;Pääomalainat',
    'TB2;2380;2390;Pääomalainat',
    '',
    'SB1;2000;2400;3000;9999;Oma pääoma yhteensä',
    '-',
    'GB1;2400;2500;TILINPÄÄTÖSSIIRTOJEN KERTYMÄ',
    'GB2;2400;2450;Poistoero',
    'DP3;2400;2450;Poistoero',
    'TB2;2400;2450;Poistoero yhteensä',
    '',
    'GB2;2450;2500;Vapaaehtoiset varaukset',
    'DP3;2450;2500;Vapaaehtoiset varaukset',
    'TB2;2450;2500;Vapaaehtoiset varaukset yhteensä',
    '',
    'TB1;2400;2500;Tilinpäätössiirtojen kertymä yhteensä',
    '-',
    'GB1;2500;2600;PAKOLLISET VARAUKSET',
    'GB2;2500;2530;Eläkevaraukset',
    'DP3;2500;2530;Eläkevaraukset',
    'TB2;2500;2530;Eläkevaraukset yhteensä',
    '',
    'GB2;2530;2550;Verovaraukset',
    'DP3;2530;2550;Verovaraukset',
    'TB2;2530;2550;Verovaraukset yhteensä',
    '',
    'GB2;2550;2590;Muut pakolliset varaukset',
    'DP3;2550;2590;Muut pakolliset varaukset',
    'TB2;2550;2590;Muut pakolliset varaukset yhteensä',
    '',
    'TB1;2500;2600;Pakolliset varaukset yhteensä',
    '-',
    'HB1;2600;3000;VIERAS PÄÄOMA',
    'GB2;2600;2610;2800;2810;Joukkovelkakirjalainat',
    'DP3;2600;2610;2800;2810;Joukkovelkakirjalainat',
    'TB2;2600;2610;2800;2810;Joukkovelkakirjalainat yhteensä',
    '',
    'GB2;2610;2620;2810;2820;Vaihtovelkakirjalainat',
    'DP3;2610;2620;2810;2820;Vaihtovelkakirjalainat',
    'TB2;2610;2620;2810;2820;Vaihtovelkakirjalainat yhteensä',
    '',
    'GB2;2620;2650;2820;2850;Lainat rahoituslaitoksilta',
    'DP3;2620;2650;2820;2850;Lainat rahoituslaitoksilta',
    'TB2;2620;2650;2820;2850;Lainat rahoituslaitoksilta yhteensä',
    '',
    'GB2;2650;2660;2850;2860;Eläkelainat',
    'DP3;2650;2660;2850;2860;Eläkelainat',
    'TB2;2650;2660;2850;2860;Eläkelainat yhteensä',
    '',
    'GB2;2660;2670;2860;2870;Saadut ennakot',
    'DP3;2660;2670;2860;2870;Saadut ennakot',
    'TB2;2660;2670;2860;2870;Saadut ennakot yhteensä',
    '',
    'GB2;2670;2690;2870;2890;Ostovelat',
    'DP3;2670;2690;2870;2890;Ostovelat',
    'TB2;2670;2690;2870;2890;Ostovelat yhteensä',
    '',
    'GB2;2690;2700;2890;2900;Rahoitusvekselit',
    'DP3;2690;2700;2890;2900;Rahoitusvekselit',
    'TB2;2690;2700;2890;2900;Rahoitusvekselit yhteensä',
    '',
    'GB2;2700;2710;2900;2910;Velat saman konsernin yrityksille',
    'DP3;2700;2710;2900;2910;Velat saman konsernin yrityksille',
    'TB2;2700;2710;2900;2910;Velat saman konsernin yrityksille yhteensä',
    '',
    'GB2;2710;2720;2910;2920;Velat omistusyhteysyrityksille',
    'DP3;2710;2720;2910;2920;Velat omistusyhteysyrityksille',
    'TB2;2710;2720;2910;2920;Velat omistusyhteysyrityksille yhteensä',
    '',
    'GB2;2720;2750;2920;2950;Muut velat',
    'DP3;2720;2750;2920;2950;Muut velat',
    'TB2;2720;2750;2920;2950;Muut velat yhteensä',
    '',
    'GB2;2750;2800;2950;3000;Siirtovelat',
    'DP3;2750;2800;2950;3000;Siirtovelat',
    'TB2;2750;2800;2950;3000;Siirtovelat yhteensä',
    '',
    'SB1;2600;3000;Vieras pääoma yhteensä',
    'SB0;2000;9999;Vastattavaa yhteensä'
  ].join('\n');
  function getBalanceSheetStructure() {
    const saved = getReportStructureById('balance-sheet-detailed');
    return (saved && saved.lines) ? saved.lines : _BS_DEFAULT;
  }

  window.openReportAccountSummary = function () {
    const period = getPeriod();
    if (!period) { alert('Valitse tilikausi.'); return; }
    const settings = getSettings();
    const container = document.getElementById('panelContainer');
    if (!container) return;
    const overlay = document.createElement('div');
    overlay.className = 'panel-overlay';
    const html = '<div class="panel" style="max-width: 400px;">' +
      '<div class="panel-title">Tilien saldot</div>' +
      '<div class="panel-body">' +
      '<div class="form-group">' +
      '<label><input type="checkbox" id="reportSummaryHideZero" name="reportSummaryHideZero"> Jätä pois nollasaldotilit</label>' +
      '</div>' +
      '</div>' +
      '<div class="panel-footer">' +
      '<button type="button" class="btn btn-primary" id="btnReportSummaryShow">Näytä</button> ' +
      '<button type="button" class="btn" id="btnReportSummaryCancel">Peruuta</button>' +
      '</div></div>';
    overlay.innerHTML = html;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('.panel').addEventListener('click', (e) => e.stopPropagation());

    overlay.querySelector('#btnReportSummaryCancel').onclick = () => overlay.remove();
    overlay.querySelector('#btnReportSummaryShow').onclick = function () {
      const hideZero = !!overlay.querySelector('#reportSummaryHideZero').checked;
      overlay.remove();
      runReportAccountSummary(period, settings, hideZero);
    };
    container.appendChild(overlay);
  };

  function runReportAccountSummary(period, settings, hideZeroBalances) {
    const startingBalances = getStartingBalances(period.id);
    const accounts = getAccounts();
    const documents = getDocuments(period.id, null);
    const entriesByAccount = {};
    accounts.forEach(a => { entriesByAccount[a.id] = { debit: 0, credit: 0 }; });
    documents.forEach(doc => {
      getEntriesByDocument(doc.id).forEach(e => {
        if (!entriesByAccount[e.accountId]) entriesByAccount[e.accountId] = { debit: 0, credit: 0 };
        const deb = e.amountDebit != null ? e.amountDebit : (e.debit ? (e.amount || 0) : 0);
        const cred = e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0);
        entriesByAccount[e.accountId].debit += deb;
        entriesByAccount[e.accountId].credit += cred;
      });
    });
    let html = '<h2>Tilien saldot</h2><p>' + (settings.name || '') + ' ' + (settings.businessId || '') + '</p>';
    html += '<p>Tilikausi: ' + period.startDate + ' - ' + period.endDate + '</p>';
    if (hideZeroBalances) html += '<p><em>Nollasaldotilit jätetty pois.</em></p>';
    html += '<table><thead><tr><th>Tili</th><th>Nimi</th><th class="text-right">Debet</th><th class="text-right">Kredit</th><th class="text-right">Saldo</th></tr></thead><tbody>';
    let totalDebit = 0, totalCredit = 0;
    accounts.forEach(a => {
      const sb = startingBalances[a.id] || {};
      let deb = (sb.debit || 0) + (entriesByAccount[a.id] ? entriesByAccount[a.id].debit : 0);
      let cred = (sb.credit || 0) + (entriesByAccount[a.id] ? entriesByAccount[a.id].credit : 0);
      const saldo = deb - cred;
      const isZero = Math.abs(saldo) < 0.005;
      totalDebit += deb;
      totalCredit += cred;
      if (hideZeroBalances && isZero) return;
      html += '<tr><td>' + (a.number || '') + '</td><td>' + (a.name || '') + '</td><td class="rd-debit">' + formatNum(deb) + '</td><td class="rd-credit">' + formatNum(cred) + '</td><td class="rd-num">' + formatNum(saldo) + '</td></tr>';
    });
    html += '<tr class="total"><td colspan="2">Yhteensä</td><td class="rd-debit">' + formatNum(totalDebit) + '</td><td class="rd-credit">' + formatNum(totalCredit) + '</td><td class="rd-num">' + formatNum(totalDebit - totalCredit) + '</td></tr>';
    html += '</tbody></table>';
    showReportInPanel('Tilien saldot', html);
  }

  window.openReportDocument = function () {
    const state = window.TilitinApp && window.TilitinApp.getState ? window.TilitinApp.getState() : null;
    if (!state || !state.document) { alert('Avaa tosite.'); return; }
    const doc = state.document;
    const entries = state.entries.length ? state.entries : getEntriesByDocument(doc.id);
    const settings = getSettings();
    let html = '<h2>Tosite ' + (doc.number || '') + '</h2><p>' + (settings.name || '') + '</p>';
    html += '<p>Päivämäärä: ' + formatDate(doc.date) + '</p>';
    html += '<table><thead><tr><th>Tili</th><th>Selite</th><th class="text-right">Debet</th><th class="text-right">Kredit</th></tr></thead><tbody>';
    let totalDebit = 0, totalCredit = 0;
    entries.forEach(e => {
      const acc = getAccountById(e.accountId);
      const accStr = acc ? acc.number + ' ' + acc.name : '';
      const deb = e.amountDebit != null ? e.amountDebit : (e.debit ? (e.amount || 0) : 0);
      const cred = e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0);
      totalDebit += deb;
      totalCredit += cred;
      html += '<tr><td>' + accStr + '</td><td>' + (e.description || '') + '</td><td class="rd-debit">' + (deb ? formatNum(deb) : '') + '</td><td class="rd-credit">' + (cred ? formatNum(cred) : '') + '</td></tr>';
    });
    html += '<tr class="total"><td colspan="2">Yhteensä</td><td class="rd-debit">' + formatNum(totalDebit) + '</td><td class="rd-credit">' + formatNum(totalCredit) + '</td></tr>';
    html += '</tbody></table>';
    showReportInPanel('Tosite ' + doc.number, html);
  };

  window.openReportJournal = function () {
    const period = getPeriod();
    if (!period) { alert('Valitse tilikausi.'); return; }
    const settings = getSettings();
    const sortBy = (arguments && arguments.length ? arguments[0] : null) || getSetting('journalSort', 'date');
    const documents = (getDocuments(period.id, null) || []).slice();

    function num(v) {
      const n = parseInt(v, 10);
      return isNaN(n) ? 0 : n;
    }

    if (sortBy === 'number') {
      documents.sort((a, b) => {
        const dn = num(a.number) - num(b.number);
        if (dn) return dn;
        const dd = String(a.date || '').localeCompare(String(b.date || ''));
        if (dd) return dd;
        return (a.id || 0) - (b.id || 0);
      });
    } else {
      // Default: sort by date
      documents.sort((a, b) => {
        const dd = String(a.date || '').localeCompare(String(b.date || ''));
        if (dd) return dd;
        const dn = num(a.number) - num(b.number);
        if (dn) return dn;
        return (a.id || 0) - (b.id || 0);
      });
    }

    let html = '<h2>Päiväkirja</h2><p>' + (settings.name || '') + '</p>';
    html += '<p>Tilikausi: ' + period.startDate + ' - ' + period.endDate + '</p>';
    html += '<p style="margin: 10px 0 16px;">' +
      '<label>Järjestys: ' +
      '<select onchange="setSetting(\'journalSort\', this.value); openReportJournal(this.value)">' +
      '<option value="date"' + (sortBy === 'date' ? ' selected' : '') + '>Päivämäärä</option>' +
      '<option value="number"' + (sortBy === 'number' ? ' selected' : '') + '>Tositenumero</option>' +
      '</select></label>' +
      '</p>';
    html += '<table><thead><tr><th>Pvm</th><th>Tositenro</th><th>Tili</th><th>Selite</th><th class="text-right">Debet</th><th class="text-right">Kredit</th></tr></thead><tbody>';
    documents.forEach(doc => {
      (getEntriesByDocument(doc.id) || []).forEach(e => {
        const acc = getAccountById(e.accountId);
        const accStr = acc ? acc.number + ' ' + acc.name : '';
        const deb = e.amountDebit != null ? e.amountDebit : (e.debit ? (e.amount || 0) : 0);
        const cred = e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0);
        html += '<tr><td>' + formatDate(doc.date) + '</td><td>' + doc.number + '</td><td>' + accStr + '</td><td>' + (e.description || '') + '</td><td class="rd-debit">' + (deb ? formatNum(deb) : '') + '</td><td class="rd-credit">' + (cred ? formatNum(cred) : '') + '</td></tr>';
      });
    });
    html += '</tbody></table>';
    showReportInPanel('Päiväkirja', html);
  };

  window.openReportLedger = function () {
    const period = getPeriod();
    if (!period) { alert('Valitse tilikausi.'); return; }
    const settings = getSettings();
    const accounts = getAccounts();
    const startingBalances = getStartingBalances(period.id);
    const documents = getDocuments(period.id, null);
    let html = '<h2>Pääkirja</h2><p>' + (settings.name || '') + '</p>';
    html += '<p>Tilikausi: ' + period.startDate + ' - ' + period.endDate + '</p>';
    // Build entries grouped by account to avoid O(accounts * documents * entries) scanning.
    const entriesByAccount = {};
    documents.forEach(doc => {
      getEntriesByDocument(doc.id).forEach(e => {
        if (!entriesByAccount[e.accountId]) entriesByAccount[e.accountId] = [];
        entriesByAccount[e.accountId].push({ doc, entry: e });
      });
    });
    accounts.forEach(a => {
      const sb = startingBalances[a.id] || {};
      const accEntries = entriesByAccount[a.id] || [];
      const hasOpening = (sb.debit || 0) !== 0 || (sb.credit || 0) !== 0;
      if (!hasOpening && accEntries.length === 0) return;

      // Running balance sign convention: debit-normal accounts (assets, expenses) →
      // positive when debit > credit; credit-normal (liabilities, equity, revenue) → positive when credit > debit.
      const type = Number(a.type);
      const isDebitNormal = (type === 0 || type === 4 || type === 5); // asset, expense, prev-profit

      let runningBalance = (parseFloat(sb.debit) || 0) - (parseFloat(sb.credit) || 0);
      if (!isDebitNormal) runningBalance = -runningBalance;

      html += '<h3>' + (a.number || '') + ' ' + (a.name || '') + '</h3>';
      html += '<table><thead><tr>' +
        '<th>Pvm</th><th>Tositenro</th><th>Selite</th>' +
        '<th class="text-right">Debet</th><th class="text-right">Kredit</th>' +
        '<th class="text-right">Saldo</th>' +
        '</tr></thead><tbody>';

      if (hasOpening) {
        const sbDeb = parseFloat(sb.debit) || 0;
        const sbCred = parseFloat(sb.credit) || 0;
        html += '<tr class="total"><td colspan="3">Alkusaldo</td>' +
          '<td class="rd-debit">' + (sbDeb ? formatNum(sbDeb) : '') + '</td>' +
          '<td class="rd-credit">' + (sbCred ? formatNum(sbCred) : '') + '</td>' +
          '<td class="text-right rd-balance">' + formatNum(runningBalance) + '</td>' +
          '</tr>';
      }

      accEntries.forEach(({ doc, entry: e }) => {
        const deb  = parseFloat(e.amountDebit  != null ? e.amountDebit  : (e.debit  ? (e.amount || 0) : 0)) || 0;
        const cred = parseFloat(e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0)) || 0;
        const delta = isDebitNormal ? (deb - cred) : (cred - deb);
        runningBalance = Math.round((runningBalance + delta) * 100) / 100;
        html += '<tr>' +
          '<td>' + formatDate(doc.date) + '</td>' +
          '<td>' + (doc.number || '') + '</td>' +
          '<td>' + (e.description || '') + '</td>' +
          '<td class="rd-debit">'  + (deb  ? formatNum(deb)  : '') + '</td>' +
          '<td class="rd-credit">' + (cred ? formatNum(cred) : '') + '</td>' +
          '<td class="text-right rd-balance' + (runningBalance < 0 ? ' rd-balance-neg' : '') + '">' + formatNum(runningBalance) + '</td>' +
          '</tr>';
      });

      html += '<tr class="total"><td colspan="3">Loppusaldo</td>' +
        '<td></td><td></td>' +
        '<td class="text-right rd-balance' + (runningBalance < 0 ? ' rd-balance-neg' : '') + '"><strong>' + formatNum(runningBalance) + '</strong></td>' +
        '</tr></tbody></table>';
    });
    showReportInPanel('Pääkirja', html);
  };

  window.openReportAccountStatement = function () {
    const period = getPeriod();
    if (!period) { alert('Valitse tilikausi.'); return; }
    const accounts = getAccounts().filter(a => a.number !== undefined && a.number !== '');
    if (!accounts.length) { alert('Ei tilejä.'); return; }
    const container = document.getElementById('panelContainer');
    container.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'panel-overlay';
    let opts = accounts.map(a => ({ value: a.id, label: (a.number || '') + ' ' + (a.name || '') }));
    const firstId = opts.length ? opts[0].value : 0;
    const html = '<div class="panel" style="max-width: 420px;">' +
      '<div class="panel-title">Tiliote</div>' +
      '<div class="panel-body"><p>Valitse tili</p><select id="tilioteAccountId" style="width:100%;">' +
      opts.map(o => '<option value="' + o.value + '">' + (o.label || '').replace(/</g, '&lt;') + '</option>').join('') +
      '</select></div>' +
      '<div class="panel-footer"><button type="button" class="btn btn-primary" id="btnTilioteShow">Näytä</button> <button type="button" class="btn" id="btnTilioteCancel">Peruuta</button></div></div>';
    overlay.innerHTML = html;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('.panel').addEventListener('click', (e) => e.stopPropagation());
    overlay.querySelector('#btnTilioteCancel').onclick = () => overlay.remove();
    overlay.querySelector('#btnTilioteShow').onclick = function () {
      const accountId = parseInt(overlay.querySelector('#tilioteAccountId').value, 10);
      overlay.remove();
      runReportAccountStatement(period, accountId);
    };
    container.appendChild(overlay);
  };

  function runReportAccountStatement(period, accountId) {
    const settings = getSettings();
    const account = getAccountById(accountId);
    if (!account) { alert('Tiliä ei löydy.'); return; }

    // Initialise running balance from opening balance (alkusaldo).
    // AccountBalances uses signed balance: positive = debit-normal, negative = credit-normal.
    const ab = new AccountBalances([account]);
    const startingBalances = getStartingBalances(period.id);
    const sbEntry = startingBalances[accountId] || {};
    const sbDebit  = parseFloat(sbEntry.debit)  || 0;
    const sbCredit = parseFloat(sbEntry.credit) || 0;
    // Inject opening balance as a synthetic entry so AccountBalances tracks it correctly.
    if (sbDebit > 0)  ab.addEntry({ accountId: accountId, amountDebit: sbDebit,  amountCredit: 0 });
    if (sbCredit > 0) ab.addEntry({ accountId: accountId, amountDebit: 0, amountCredit: sbCredit });
    const openingBalance = ab.getBalance(accountId) || 0;

    const documents = getDocuments(period.id, null);
    const rows = [];
    let debitTotal = 0, creditTotal = 0;

    documents.forEach(doc => {
      getEntriesByDocument(doc.id).filter(e => e.accountId === accountId).forEach(e => {
        const deb  = parseFloat(e.amountDebit  != null ? e.amountDebit  : (e.debit  ? (e.amount || 0) : 0)) || 0;
        const cred = parseFloat(e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0)) || 0;
        ab.addEntry(e);
        const runBalance = ab.getBalance(accountId) || 0;
        if (deb  > 0) debitTotal  += deb;
        if (cred > 0) creditTotal += cred;
        rows.push({ date: doc.date, number: doc.number, description: e.description || '', debit: deb, credit: cred, balance: runBalance });
      });
    });

    // Format a signed balance – delegates to global formatNum.
    function fmtBalance(b) {
      const n = parseFloat(b);
      if (isNaN(n)) return formatNum(0);
      return formatNum(n);
    }
    // Format debit/credit amount – blank when zero.
    function fmtAmt(n) { return n ? formatNum(n) : ''; }

    let html = '<h2>Tiliote</h2><p>' + (settings.name || '') + '</p>';
    html += '<p><strong>' + (account.number || '') + ' ' + (account.name || '') + '</strong></p>';
    html += '<p>Tilikausi: ' + period.startDate + ' – ' + period.endDate + '</p>';
    html += '<table><thead><tr>' +
      '<th>Pvm</th><th>Nro</th><th>Selite</th>' +
      '<th class="text-right">Debet</th><th class="text-right">Kredit</th>' +
      '<th class="text-right">Saldo</th>' +
      '</tr></thead><tbody>';

    // Opening balance row (only if non-zero).
    if (openingBalance !== 0) {
      html += '<tr><td></td><td></td><td><em>Alkusaldo</em></td><td></td><td></td>' +
        '<td class="rd-num"><em>' + fmtBalance(openingBalance) + '</em></td></tr>';
    }

    rows.forEach(r => {
      html += '<tr>' +
        '<td>' + formatDate(r.date) + '</td>' +
        '<td>' + r.number + '</td>' +
        '<td>' + (r.description || '').replace(/</g, '&lt;') + '</td>' +
        '<td class="rd-debit">'  + fmtAmt(r.debit)   + '</td>' +
        '<td class="rd-credit">' + fmtAmt(r.credit)  + '</td>' +
        '<td class="rd-num">'    + fmtBalance(r.balance) + '</td>' +
        '</tr>';
    });

    const finalBalance = ab.getBalance(accountId) || 0;
    const entryCount = rows.length;
    const entryCountLabel = entryCount === 1 ? '1 vienti' : entryCount + ' vientiä';
    html += '<tr class="total">' +
      '<td colspan="3"><strong>' + entryCountLabel + '</strong></td>' +
      '<td class="rd-debit"><strong>'  + formatNum(debitTotal)   + '</strong></td>' +
      '<td class="rd-credit"><strong>' + formatNum(creditTotal)  + '</strong></td>' +
      '<td class="rd-num"><strong>'    + fmtBalance(finalBalance) + '</strong></td>' +
      '</tr>';

    html += '</tbody></table>';
    showReportInPanel('Tiliote – ' + account.number, html);
  }

  window.openReportIncomeStatement = function () {
    const period = getPeriod();
    if (!period) { alert('Valitse tilikausi.'); return; }
    const settings = getSettings();
    const startingBalances = getStartingBalances(period.id);
    const accounts = getAccounts();
    const documents = getDocuments(period.id, null);
    const byAccount = {};
    accounts.forEach(a => { byAccount[a.id] = { account: a, debit: 0, credit: 0 }; });
    documents.forEach(doc => {
      getEntriesByDocument(doc.id).forEach(e => {
        if (!byAccount[e.accountId]) return;
        const deb = e.amountDebit != null ? e.amountDebit : (e.debit ? (e.amount || 0) : 0);
        const cred = e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0);
        byAccount[e.accountId].debit += deb;
        byAccount[e.accountId].credit += cred;
      });
    });
    const REVENUE = 3, EXPENSE = 4;
    let revenue = 0, expense = 0;
    accounts.forEach(a => {
      const sb = startingBalances[a.id] || {};
      const d = (sb.debit || 0) + (byAccount[a.id] ? byAccount[a.id].debit : 0);
      const c = (sb.credit || 0) + (byAccount[a.id] ? byAccount[a.id].credit : 0);
      const saldo = c - d; // revenue-normal positive, expense-normal negative
      if (a.type === REVENUE) revenue += saldo;
      if (a.type === EXPENSE) expense += -saldo; // show expenses as positive
    });
    let html = '<h2>Tuloslaskelma</h2><p>' + (settings.name || '') + ' ' + (settings.businessId || '') + '</p>';
    html += '<p>Tilikausi: ' + period.startDate + ' – ' + period.endDate + '</p>';
    html += '<table><tr><td>Tulot yhteensä</td><td class="text-right">' + formatNum(revenue) + '</td></tr>';
    html += '<tr><td>Menot yhteensä</td><td class="text-right">' + formatNum(expense) + '</td></tr>';
    html += '<tr class="total"><td>Tilikauden tulos</td><td class="text-right">' + formatNum(revenue - expense) + '</td></tr></table>';
    showReportInPanel('Tuloslaskelma', html);
  };

  window.openReportIncomeStatementDetailed = function () {
    const period = getPeriod();
    if (!period) { alert('Valitse tilikausi.'); return; }
    const settings = getSettings();
    const accounts = getAccounts();
    const allPeriods = (typeof getPeriods === 'function') ? getPeriods() : [];

    // Pick a comparison period (previous) if available.
    const currentStart = period.startDate || '';
    const prevPeriod = allPeriods
      .filter(p => p && p.id !== period.id && (p.endDate || '') < currentStart)
      .sort((a, b) => String(b.endDate || '').localeCompare(String(a.endDate || '')))[0] || null;

    const cols = [];
    cols.push({ startDate: period.startDate, endDate: period.endDate, periodId: period.id });
    if (prevPeriod) cols.push({ startDate: prevPeriod.startDate, endDate: prevPeriod.endDate, periodId: prevPeriod.id });

    // Populate module-level default on first call so getDefaultReportStructure works immediately.
    // _IS_DEFAULT is defined at module level above
    // Use saved custom structure if available, otherwise fall back to the module-level default.
    const _savedIs = getReportStructureById('income-statement-detailed');
    const IS_STRUCTURE = (_savedIs && _savedIs.lines) ? _savedIs.lines : _IS_DEFAULT;

    function ymdToFinnish(ymd) {
      return typeof formatDate === 'function' ? formatDate(ymd) : (ymd || '');
    }

    function todayFinnish() {
      return typeof formatToday === 'function' ? formatToday() : (function () {
        const d = new Date();
        return d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear();
      })();
    }

    function formatFsAmount(x) {
      const n = parseFloat(x);
      return isNaN(n) ? '' : formatNum(n);
    }

    function buildBalancesForColumn(col) {
      const docs = getDocuments(col.periodId, null).filter(doc => {
        const d = doc.date || '';
        return d >= col.startDate && d <= col.endDate;
      });
      const balances = {};
      const seen = {};
      const TYPE_ASSET = 0, TYPE_LIABILITY = 1, TYPE_EQUITY = 2, TYPE_REVENUE = 3, TYPE_EXPENSE = 4, TYPE_PROFIT_PREV = 5, TYPE_PROFIT = 6;

      docs.forEach(doc => {
        getEntriesByDocument(doc.id).forEach(e => {
          const acc = getAccountById(e.accountId);
          if (!acc) return;
          const type = acc.type;
          const debitAmt = e.amountDebit != null ? e.amountDebit : (e.debit ? (e.amount || 0) : 0);
          const creditAmt = e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0);

          function addSide(amount, isDebit) {
            if (!amount) return;
            let a = amount;
            if ((type === TYPE_ASSET && !isDebit) ||
              (type === TYPE_EXPENSE && !isDebit) ||
              (type === TYPE_LIABILITY && isDebit) ||
              (type === TYPE_EQUITY && isDebit) ||
              (type === TYPE_REVENUE && isDebit) ||
              (type === TYPE_PROFIT_PREV && isDebit) ||
              (type === TYPE_PROFIT && isDebit)) {
              a = -a;
            }
            balances[acc.id] = (balances[acc.id] == null) ? a : (balances[acc.id] + a);
            seen[acc.id] = true;
          }

          addSide(debitAmt, true);
          addSide(creditAmt, false);
        });
      });

      // Turn unseen accounts into null (match Java: null if no entries).
      const out = {};
      accounts.forEach(a => { out[a.id] = seen[a.id] ? balances[a.id] : null; });
      return out;
    }

    const balancesByCol = cols.map(c => buildBalancesForColumn(c));

    const fsRows = parseStructureFromTemplate(IS_STRUCTURE, { balancesByCol, cols, accounts, negateExpense: true });

    let html = '<div class="report-fs">';
    html += '<div class="report-fs-header" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">';
    html += '<div><div><strong>' + (settings.name || '') + '</strong></div><div>' + (settings.businessId || '') + '</div></div>';
    html += '<div style="text-align:center; flex:1;"><div style="font-weight:600;">Tuloslaskelma tilierittelyin</div></div>';
    html += '<div style="text-align:right;"><div>Sivu 1</div><div>' + todayFinnish() + '</div></div>';
    html += '</div>';

    html += '<table class="report-fs-table"><thead>';
    html += '<tr><th></th><th></th>' + cols.map(c => '<th class="text-right">' + ymdToFinnish(c.startDate) + ' -</th>').join('') + '</tr>';
    html += '<tr><th></th><th></th>' + cols.map(c => '<th class="text-right">' + ymdToFinnish(c.endDate) + '</th>').join('') + '</tr>';
    html += '</thead><tbody>';

    fsRows.forEach(r => {
      if (r.empty) {
        html += '<tr><td colspan="' + (2 + cols.length) + '"></td></tr>';
        return;
      }
      const indent = (r.level || 0) * 16;
      const styleCls = r.style === 'bold' ? 'font-weight:600;' : (r.style === 'italic' ? 'font-style:italic;' : '');
      const textCell = '<td style="padding-left:' + indent + 'px; ' + styleCls + '">' + (r.text || '').replace(/</g, '&lt;') + '</td>';
      const numCell = '<td style="' + styleCls + '">' + (r.number || '') + '</td>';
      html += '<tr>' + numCell + textCell;
      if (r.amounts) {
        r.amounts.forEach(a => {
          html += '<td class="text-right" style="' + styleCls + '">' + (a == null ? '' : formatFsAmount(a)) + '</td>';
        });
      } else {
        html += cols.map(() => '<td class="text-right"></td>').join('');
      }
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    showReportInPanel('Tuloslaskelma tilierittelyin', html);
  };

  function runReportBalanceSheet(period, endDate) {
    const settings = getSettings();
    const accounts = getAccounts();
    const periods = getPeriods ? getPeriods() : [];
    const currentStart = period.startDate || '';
    const prevPeriod = periods
      .filter(p => p && p.id !== period.id && (p.endDate || '') < currentStart)
      .sort((a, b) => String(b.endDate || '').localeCompare(String(a.endDate || '')))[0] || null;
    const cols = [{ periodId: period.id, startDate: period.startDate, endDate }];
    if (prevPeriod) cols.push({ periodId: prevPeriod.id, startDate: prevPeriod.startDate, endDate: prevPeriod.endDate });

    const TYPE_ASSET = 0, TYPE_LIABILITY = 1, TYPE_EQUITY = 2, TYPE_REVENUE = 3, TYPE_EXPENSE = 4, TYPE_PROFIT_PREV = 5, TYPE_PROFIT = 6;

    function buildBalancesForColumnBalanceSheet(col) {
      const sb = getStartingBalances(col.periodId);
      const balances = {};
      const seen = {};
      accounts.forEach(acc => {
        const openD = (sb[acc.id] && sb[acc.id].debit) || 0;
        const openC = (sb[acc.id] && sb[acc.id].credit) || 0;
        const openBal = (acc.type === TYPE_ASSET || acc.type === TYPE_EXPENSE) ? (openD - openC) : (openC - openD);
        if (openBal !== 0) { balances[acc.id] = openBal; seen[acc.id] = true; }
      });
      const docs = getDocuments(col.periodId, null).filter(doc => {
        const d = doc.date || '';
        return d >= col.startDate && d <= col.endDate;
      });
      docs.forEach(doc => {
        getEntriesByDocument(doc.id).forEach(e => {
          const acc = getAccountById(e.accountId);
          if (!acc) return;
          const type = acc.type;
          const debitAmt = e.amountDebit != null ? e.amountDebit : (e.debit ? (e.amount || 0) : 0);
          const creditAmt = e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0);
          function addSide(amount, isDebit) {
            if (!amount) return;
            let a = amount;
            if ((type === TYPE_ASSET && !isDebit) || (type === TYPE_EXPENSE && !isDebit) ||
                (type === TYPE_LIABILITY && isDebit) || (type === TYPE_EQUITY && isDebit) ||
                (type === TYPE_REVENUE && isDebit) || (type === TYPE_PROFIT_PREV && isDebit) || (type === TYPE_PROFIT && isDebit)) {
              a = -a;
            }
            balances[acc.id] = (balances[acc.id] == null) ? a : (balances[acc.id] + a);
            seen[acc.id] = true;
          }
          addSide(debitAmt, true);
          addSide(creditAmt, false);
        });
      });
      const out = {};
      accounts.forEach(a => { out[a.id] = seen[a.id] ? balances[a.id] : null; });
      return out;
    }

    const balancesByCol = cols.map(c => buildBalancesForColumnBalanceSheet(c));
    const fsRows = parseStructureFromTemplate(getBalanceSheetStructure(), { balancesByCol, cols, accounts, negateExpense: true });

    let totalAsset = null;
    let totalLiabEquity = null;
    fsRows.forEach(r => {
      if (!r.amounts || r.amounts[0] == null) return;
      const text = (r.text || '').trim();
      if (text === 'Vastaavaa yhteensä') totalAsset = r.amounts[0];
      if (text === 'Vastattavaa yhteensä') totalLiabEquity = r.amounts[0];
    });

    let html = '<h2>Tase</h2><p>' + (settings.name || '') + '</p>';
    html += '<p>Päivämäärä: ' + endDate + '</p>';
    html += '<table>';
    html += '<tr><td>Vastaavaa yhteensä</td><td class="text-right">' + (totalAsset != null ? formatFsAmount(totalAsset) : '') + '</td></tr>';
    html += '<tr><td>Vastattavaa yhteensä</td><td class="text-right">' + (totalLiabEquity != null ? formatFsAmount(totalLiabEquity) : '') + '</td></tr>';
    html += '</table>';
    showReportInPanel('Tase', html);
  }

  window.openReportBalanceSheet = function () {
    const period = getPeriod();
    if (!period) { alert('Valitse tilikausi.'); return; }
    const container = document.getElementById('panelContainer');
    container.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'panel-overlay';
    const bodyHtml = '<div class="panel" style="max-width: 420px;">' +
      '<div class="panel-title">Tase</div>' +
      '<div class="panel-body">' +
      '<p>Valitse laskentajakso</p>' +
      '<label><input type="radio" name="bsRange" value="period" checked> Koko tilikausi (' + (period.startDate || '') + ' – ' + (period.endDate || '') + ')</label><br>' +
      '<label><input type="radio" name="bsRange" value="date"> Tase päivältä: <input type="date" id="bsDate" value="' + (period.endDate || '') + '"></label>' +
      '</div>' +
      '<div class="panel-footer"><button type="button" class="btn btn-primary" id="btnBsShow">Näytä</button> <button type="button" class="btn" id="btnBsCancel">Peruuta</button></div>' +
      '</div>';
    overlay.innerHTML = bodyHtml;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    const panel = overlay.querySelector('.panel');
    panel.addEventListener('click', (e) => e.stopPropagation());
    panel.querySelector('#btnBsCancel').onclick = () => overlay.remove();
    panel.querySelector('#btnBsShow').onclick = () => {
      const range = panel.querySelector('input[name="bsRange"]:checked') ? panel.querySelector('input[name="bsRange"]:checked').value : 'period';
      let endDate = period.endDate || '';
      if (range === 'date') {
        const d = panel.querySelector('#bsDate').value;
        if (!d) { alert('Valitse päivämäärä.'); return; }
        if (d < (period.startDate || '') || d > (period.endDate || '')) {
          alert('Päivämäärän on oltava tilikauden ' + (period.startDate || '') + ' – ' + (period.endDate || '') + ' sisällä.');
          return;
        }
        endDate = d;
      }
      overlay.remove();
      runReportBalanceSheet(period, endDate);
    };
    container.appendChild(overlay);
  };

  window.openReportBalanceSheetDetailed = function () {
    const period = getPeriod();
    if (!period) { alert('Valitse tilikausi.'); return; }
    const settings = getSettings();
    const accounts = getAccounts();
    const periods = getPeriods ? getPeriods() : [];
    const currentStart = period.startDate || '';
    const prevPeriod = periods
      .filter(p => p && p.id !== period.id && (p.endDate || '') < currentStart)
      .sort((a, b) => String(b.endDate || '').localeCompare(String(a.endDate || '')))[0] || null;
    const cols = [{ periodId: period.id, startDate: period.startDate, endDate: period.endDate }];
    if (prevPeriod) cols.push({ periodId: prevPeriod.id, startDate: prevPeriod.startDate, endDate: prevPeriod.endDate });

    const TYPE_ASSET = 0, TYPE_LIABILITY = 1, TYPE_EQUITY = 2, TYPE_REVENUE = 3, TYPE_EXPENSE = 4, TYPE_PROFIT_PREV = 5, TYPE_PROFIT = 6;

    function buildBalancesForColumnBalanceSheet(col) {
      const sb = getStartingBalances(col.periodId);
      const balances = {};
      const seen = {};
      accounts.forEach(acc => {
        const openD = (sb[acc.id] && sb[acc.id].debit) || 0;
        const openC = (sb[acc.id] && sb[acc.id].credit) || 0;
        const openBal = (acc.type === TYPE_ASSET || acc.type === TYPE_EXPENSE) ? (openD - openC) : (openC - openD);
        if (openBal !== 0) { balances[acc.id] = openBal; seen[acc.id] = true; }
      });
      const docs = getDocuments(col.periodId, null).filter(doc => {
        const d = doc.date || '';
        return d >= col.startDate && d <= col.endDate;
      });
      docs.forEach(doc => {
        getEntriesByDocument(doc.id).forEach(e => {
          const acc = getAccountById(e.accountId);
          if (!acc) return;
          const type = acc.type;
          const debitAmt = e.amountDebit != null ? e.amountDebit : (e.debit ? (e.amount || 0) : 0);
          const creditAmt = e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0);
          function addSide(amount, isDebit) {
            if (!amount) return;
            let a = amount;
            if ((type === TYPE_ASSET && !isDebit) || (type === TYPE_EXPENSE && !isDebit) ||
                (type === TYPE_LIABILITY && isDebit) || (type === TYPE_EQUITY && isDebit) ||
                (type === TYPE_REVENUE && isDebit) || (type === TYPE_PROFIT_PREV && isDebit) || (type === TYPE_PROFIT && isDebit)) {
              a = -a;
            }
            balances[acc.id] = (balances[acc.id] == null) ? a : (balances[acc.id] + a);
            seen[acc.id] = true;
          }
          addSide(debitAmt, true);
          addSide(creditAmt, false);
        });
      });
      const out = {};
      accounts.forEach(a => { out[a.id] = seen[a.id] ? balances[a.id] : null; });
      return out;
    }

    const balancesByCol = cols.map(c => buildBalancesForColumnBalanceSheet(c));
    // Java FinancialStatementModel.calculateBalance() negates EXPENSE accounts for range sums.
    // Balance sheet uses profit row 3000–9999, so we must negate expenses here too.
    const fsRows = parseStructureFromTemplate(getBalanceSheetStructure(), { balancesByCol, cols, accounts, negateExpense: true });

    function ymdToFinnish(ymd) {
      if (!ymd || typeof ymd !== 'string' || ymd.length < 10) return '';
      const y = parseInt(ymd.slice(0, 4), 10);
      const m = parseInt(ymd.slice(5, 7), 10);
      const d = parseInt(ymd.slice(8, 10), 10);
      if (!y || !m || !d) return '';
      return d + '.' + m + '.' + y;
    }
    function todayFinnish() {
      const d = new Date();
      return d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear();
    }
    function formatFsAmount(x) {
      const n = parseFloat(x);
      return isNaN(n) ? '' : formatNum(n);
    }

    let html = '<div class="report-fs">';
    html += '<div class="report-fs-header" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">';
    html += '<div><div><strong>' + (settings.name || '') + '</strong></div><div>' + (settings.businessId || '') + '</div></div>';
    html += '<div style="text-align:center; flex:1;"><div style="font-weight:600;">Tase tilierittelyin</div></div>';
    html += '<div style="text-align:right;"><div>Sivu 1</div><div>' + todayFinnish() + '</div></div>';
    html += '</div>';
    html += '<table class="report-fs-table"><thead>';
    html += '<tr><th></th><th></th>' + cols.map(c => '<th class="text-right">' + ymdToFinnish(c.endDate) + '</th>').join('') + '</tr>';
    html += '</thead><tbody>';

    fsRows.forEach(r => {
      if (r.empty) {
        html += '<tr><td colspan="' + (2 + cols.length) + '"></td></tr>';
        return;
      }
      const indent = (r.level || 0) * 16;
      const styleCls = r.style === 'bold' ? 'font-weight:600;' : (r.style === 'italic' ? 'font-style:italic;' : '');
      const textCell = '<td style="padding-left:' + indent + 'px; ' + styleCls + '">' + (r.text || '').replace(/</g, '&lt;') + '</td>';
      const numCell = '<td style="' + styleCls + '">' + (r.number || '') + '</td>';
      html += '<tr>' + numCell + textCell;
      if (r.amounts) {
        r.amounts.forEach(a => {
          html += '<td class="text-right" style="' + styleCls + '">' + (a == null ? '' : formatFsAmount(a)) + '</td>';
        });
      } else {
        html += cols.map(() => '<td class="text-right"></td>').join('');
      }
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    showReportInPanel('Tase tilierittelyin', html);
  };

  window.openReportEdit = function () {
    if (window.openSettingsPanel) {
      window.openSettingsPanel();
    } else {
      alert('Kirjausasetusten muokkaus: avaa Muokkaa → Kirjausasetukset.');
    }
  };

  window.openReportVat = function () {
    const period = getPeriod();
    if (!period) { alert('Valitse tilikausi.'); return; }
    const settings = getSettings();

    const container = document.getElementById('panelContainer');
    container.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'panel-overlay';
    const periodStart = period.startDate || '';
    const periodEnd = period.endDate || '';
    const firstMonth = periodStart ? periodStart.slice(0, 7) : new Date().toISOString().slice(0, 7);
    const html = '<div class="panel" style="max-width: 480px;">' +
      '<div class="panel-title">ALV-laskelma</div>' +
      '<div class="panel-body">' +
      '<p><strong>Tyyli:</strong></p>' +
      '<div class="form-group">' +
      '<label><input type="radio" name="vatStyle" value="perinteinen" checked> Perinteinen Tilitin</label>' +
      '</div>' +
      '<div class="form-group">' +
      '<label><input type="radio" name="vatStyle" value="verottaja"> Verottajan ALV-ilmoitus</label>' +
      '</div>' +
      '<p>Minkä aikavälin laskelma näytetään?</p>' +
      '<div class="form-group">' +
      '<label><input type="radio" name="vatRange" value="period" checked> Koko tilikausi (' + periodStart + ' – ' + periodEnd + ')</label>' +
      '</div>' +
      '<div class="form-group">' +
      '<label><input type="radio" name="vatRange" value="month"> Kuukausi</label>' +
      '<input type="month" id="vatReportMonth" value="' + firstMonth + '" style="margin-left: 8px;">' +
      '</div>' +
      '</div>' +
      '<div class="panel-footer">' +
      '<button type="button" class="btn btn-primary" id="btnVatReportShow">Näytä</button> ' +
      '<button type="button" class="btn" id="btnVatReportCancel">Peruuta</button>' +
      '</div></div>';
    overlay.innerHTML = html;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('.panel').addEventListener('click', (e) => e.stopPropagation());

    overlay.querySelector('#btnVatReportCancel').onclick = () => overlay.remove();
    overlay.querySelector('#btnVatReportShow').onclick = function () {
      const usePeriod = overlay.querySelector('input[name="vatRange"]:checked').value === 'period';
      const style = overlay.querySelector('input[name="vatStyle"]:checked').value || 'perinteinen';
      let startDate = periodStart;
      let endDate = periodEnd;
      if (!usePeriod) {
        const monthVal = overlay.querySelector('#vatReportMonth').value;
        if (!monthVal) { alert('Valitse kuukausi.'); return; }
        const [y, m] = monthVal.split('-').map(Number);
        startDate = y + '-' + String(m).padStart(2, '0') + '-01';
        const lastDay = new Date(y, m, 0).getDate();
        endDate = y + '-' + String(m).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
      }
      overlay.remove();
      runReportVat(period, startDate, endDate, settings, style);
    };
    container.appendChild(overlay);
  };

  /** Java VATReportModel: build account rows from raw entries using rowNumber matching. */
  function buildVatReportDataJavaStyle(documents, accounts) {
    const balances = typeof AccountBalances !== 'undefined' ? new AccountBalances(accounts) : null;
    const vatAmounts = {};
    let entryMap = {};
    let documentId = -1;

    const allEntries = [];
    documents.forEach(doc => {
      getEntriesByDocument(doc.id).forEach(e => {
        allEntries.push({ ...e, _docId: doc.id, _date: doc.date });
      });
    });
    allEntries.sort((a, b) => {
      const d = String(a._date || '').localeCompare(String(b._date || ''));
      if (d !== 0) return d;
      const docCmp = (a.documentId || 0) - (b.documentId || 0);
      if (docCmp !== 0) return docCmp;
      return (a.rowNumber || 0) - (b.rowNumber || 0);
    });

    allEntries.forEach(e => {
      if ((e.flags || 0) & 1) return;
      const acc = getAccountById(e.accountId);
      if (!acc) return;

      if (e.documentId !== documentId) {
        documentId = e.documentId;
        entryMap = {};
      }

      const code = acc.vatCode != null ? Number(acc.vatCode) : 0;
      const rn = e.rowNumber || 0;

      if (code === 4 || code === 5 || code === 9 || code === 11) {
        entryMap[rn] = e;
      }
      if (code === 6 || code === 7 || code === 8 || code === 10) {
        if (balances) balances.addEntry(e);
      }
      if (rn >= 100000 && rn < 300000) {
        const baseRn = rn % 100000;
        const baseEntry = entryMap[baseRn];
        if (baseEntry) {
          delete entryMap[baseRn];
          if (balances) balances.addEntry(baseEntry);
          const vatVal = parseFloat(e.amountDebit != null ? e.amountDebit : (e.debit ? (e.amount || 0) : 0)) || 0;
          const vatCred = parseFloat(e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0)) || 0;
          const isDebit = vatVal > 0;
          const vatAmt = isDebit ? -vatVal : vatCred;
          const aid = baseEntry.accountId;
          vatAmounts[aid] = (vatAmounts[aid] || 0) + vatAmt;
        }
      }
    });

    const DEFAULT_VAT_RATE = 24;
    function resolveRate(acc) {
      if (acc.vatRate == null || acc.vatRate === '') return DEFAULT_VAT_RATE;
      if (typeof Tilikarttamallit !== 'undefined' && typeof Tilikarttamallit.resolveVatRate === 'function') {
        const r = Tilikarttamallit.resolveVatRate(acc.vatRate);
        return (r === 0) ? DEFAULT_VAT_RATE : r;
      }
      const n = parseFloat(String(acc.vatRate).replace(',', '.'));
      return (isNaN(n) || n === 0) ? DEFAULT_VAT_RATE : n;
    }

    const VAT_SECTION_CODES = [4, 5, 8, 9, 10, 11];
    const accountRows = [];
    accounts.forEach(acc => {
      const code = acc.vatCode != null ? Number(acc.vatCode) : 0;
      if (code < 4) return;
      const vatExcluded = balances ? balances.getBalance(acc.id) : null;
      if (vatExcluded == null || Math.abs(vatExcluded) < 0.005) return;

      let vatAmount = vatAmounts[acc.id] || 0;
      let base = vatExcluded;
      if (code === 5 || code === 7 || code === 9 || code === 11) base = -base;
      const gross = Math.round((base + vatAmount) * 100) / 100;
      accountRows.push({
        account: acc,
        vatCode: code,
        vatRate: resolveRate(acc),
        base: base,
        vat: vatAmount,
        gross: gross
      });
    });

    accountRows.sort((a, b) => {
      if (a.vatCode !== b.vatCode) return a.vatCode - b.vatCode;
      if (a.vatRate !== b.vatRate) return a.vatRate - b.vatRate;
      return String(a.account.number || '').localeCompare(String(b.account.number || ''));
    });
    return accountRows;
  }

  /** Fallback for legacy merged data (no rowNumber 100000+): sum by account. */
  function buildVatReportDataLegacy(documents) {
    const VAT_SECTION_CODES = [4, 5, 8, 9, 10, 11];
    const SALES_CODES = [1, 4, 6, 8, 10];
    const PURCHASE_CODES = [2, 5, 7, 9, 11];
    const ACCOUNT_TYPE_REVENUE = 3;
    const ACCOUNT_TYPE_EXPENSE = 4;
    const DEFAULT_VAT_RATE = 24;
    function resolveRate(acc) {
      if (acc.vatRate == null || acc.vatRate === '') return DEFAULT_VAT_RATE;
      const n = parseFloat(String(acc.vatRate).replace(',', '.'));
      return (isNaN(n) || n === 0) ? DEFAULT_VAT_RATE : n;
    }
    const byAccount = {};
    documents.forEach(doc => {
      (typeof getEntriesForDisplay === 'function' ? getEntriesForDisplay(doc.id) : getEntriesByDocument(doc.id)).forEach(e => {
        const acc = getAccountById(e.accountId);
        if (!acc) return;
        const code = acc.vatCode != null ? Number(acc.vatCode) : 0;
        const isSales = SALES_CODES.indexOf(code) >= 0;
        const isPurchase = PURCHASE_CODES.indexOf(code) >= 0;
        if (!isSales && !isPurchase) return;
        if (isSales && acc.type !== ACCOUNT_TYPE_REVENUE) return;
        if (isPurchase && acc.type !== ACCOUNT_TYPE_EXPENSE) return;
        const key = acc.id;
        if (!byAccount[key]) byAccount[key] = { account: acc, vatCode: code, vatRate: resolveRate(acc), debit: 0, credit: 0, vatAmountSum: 0 };
        const deb = parseFloat(e.amountDebit != null ? e.amountDebit : (e.debit ? (e.amount || 0) : 0)) || 0;
        const cred = parseFloat(e.amountCredit != null ? e.amountCredit : (!e.debit ? (e.amount || 0) : 0)) || 0;
        byAccount[key].debit += deb;
        byAccount[key].credit += cred;
        byAccount[key].vatAmountSum += (e.vatAmount != null ? parseFloat(e.vatAmount) : 0);
      });
    });
    const accountRows = [];
    Object.keys(byAccount).forEach(k => {
      const r = byAccount[k];
      const isSales = SALES_CODES.indexOf(r.vatCode) >= 0;
      const base = isSales ? r.credit : -r.debit;
      if (Math.abs(base) < 0.005) return;
      const vatStored = r.vatAmountSum || 0;
      const vat = vatStored !== 0 ? vatStored : (r.vatRate !== 0 ? Math.round(base * r.vatRate / 100 * 100) / 100 : 0);
      const gross = Math.round((base + vat) * 100) / 100;
      accountRows.push({ account: r.account, vatCode: r.vatCode, vatRate: r.vatRate, base, vat, gross });
    });
    accountRows.sort((a, b) => {
      if (a.vatCode !== b.vatCode) return a.vatCode - b.vatCode;
      if (a.vatRate !== b.vatRate) return a.vatRate - b.vatRate;
      return String(a.account.number || '').localeCompare(String(b.account.number || ''));
    });
    return accountRows;
  }

  function runReportVat(period, startDate, endDate, settings, reportStyle) {
    const style = reportStyle || 'perinteinen';
    const documents = getDocuments(period.id, null).filter(doc => {
      const d = doc.date || '';
      return d >= startDate && d <= endDate;
    });
    const VAT_CODE_NAMES = (typeof Tilikarttamallit !== 'undefined' && Tilikarttamallit.VAT_CODE_NAMES) ? Tilikarttamallit.VAT_CODE_NAMES : ['---', '', '', '', 'Verollinen myynti', 'Verolliset ostot', 'Veroton myynti', 'Veroton osto', 'Yhteisömyynti', 'Yhteisöostot', 'Rakentamispalvelun myynti', 'Rakentamispalvelun osto'];
    const VAT_SECTION_CODES = [4, 5, 8, 9, 10, 11];
    const accounts = getAccounts();

    const hasJavaStyleRows = documents.some(doc =>
      getEntriesByDocument(doc.id).some(e => (e.rowNumber || 0) >= 100000)
    );
    const accountRows = hasJavaStyleRows && typeof AccountBalances !== 'undefined'
      ? buildVatReportDataJavaStyle(documents, accounts)
      : buildVatReportDataLegacy(documents);

    function formatReportNum(x) {
      const n = parseFloat(x);
      if (isNaN(n)) return formatNum(0);
      const s = formatNum(Math.abs(n));
      return n < 0 ? '-' + s : s;
    }

    function formatReportNumEuro(x) {
      const n = parseFloat(x);
      if (isNaN(n)) return formatNum(0) + ' €';
      const abs = Math.abs(n);
      const intPart = Math.floor(abs);
      const sep = getDecimalSeparator();
      const decPart = sep + (abs % 1).toFixed(2).slice(2);
      const str = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + decPart + ' €';
      return n < 0 ? '-' + str : str;
    }

    const dateRangeFormatted = formatDate(startDate) + ' - ' + formatDate(endDate);
    const totalVatFromRows = accountRows.reduce((a, r) => a + r.vat, 0);

    let html;
    if (style === 'verottaja') {
      const salesRows = accountRows.filter(r => r.vatCode === 4 || r.vatCode === 1);
      const purchaseEU = accountRows.filter(r => r.vatCode === 9);
      const purchaseEUTavara = purchaseEU.filter(r => {
        const num = (r.account.number || '').toString();
        const name = (r.account.name || '').toLowerCase();
        return num === '8621' || name.indexOf('tavara') >= 0 || (name.indexOf('toimistotarvike') >= 0) || (name.indexOf('yhteisöhankinnat') >= 0 && name.indexOf('palvelu') < 0);
      });
      const purchaseEUPalvelu = purchaseEU.filter(r => {
        const num = (r.account.number || '').toString();
        const name = (r.account.name || '').toLowerCase();
        const isTavara = num === '8621' || name.indexOf('tavara') >= 0 || (name.indexOf('toimistotarvike') >= 0) || (name.indexOf('yhteisöhankinnat') >= 0 && name.indexOf('palvelu') < 0);
        return !isTavara;
      });
      const purchaseConstruction = accountRows.filter(r => r.vatCode === 11);
      const purchaseDomestic = accountRows.filter(r => r.vatCode === 5);
      const salesEU = accountRows.filter(r => r.vatCode === 8);
      function sumVat(rows) { return rows.reduce((a, r) => a + r.vat, 0); }
      function sumBase(rows) { return rows.reduce((a, r) => a + r.base, 0); }
      const vat25 = sumVat(salesRows.filter(r => r.vatRate === 25.5 || r.vatRate === 25));
      const vat24 = sumVat(salesRows.filter(r => r.vatRate === 24));
      const vat14 = sumVat(salesRows.filter(r => r.vatRate === 14));
      const vat10 = sumVat(salesRows.filter(r => r.vatRate === 10));
      const vat0 = sumVat(salesRows.filter(r => r.vatRate === 0));
      const veroOstotEUTavara = sumVat(purchaseEUTavara);
      const veroOstotEUPalvelu = sumVat(purchaseEUPalvelu);
      const veroOstotEU = veroOstotEUTavara + veroOstotEUPalvelu;
      const veroRakentaminenOstot = sumVat(purchaseConstruction);
      const veroOstotKotimaa = sumVat(purchaseDomestic);
      const vahennettavaRaw = veroOstotKotimaa + veroOstotEU + veroRakentaminenOstot;
      const domesticSalesBase = sumBase(salesRows);
      const alarajaLiikevaihto = domesticSalesBase;

      html = '<div class="report-vat report-vat-verottaja">';
      html += '<p><strong>Maksuperusteinen arvonlisävero: EI</strong></p>';
      html += '<p class="report-vat-period">' + dateRangeFormatted + '</p>';
      html += '<p>Tilitätkö arvonlisäveron tällä verokaudella maksuperusteisesti?</p>';
      html += '<h2>Vero kotimaan myynneistä verokannoittain</h2>';
      html += '<table class="report-vat-table report-vat-verottaja-table">';
      html += '<tr><td>25,5 %:n vero</td><td class="text-right">' + formatReportNumEuro(vat25 + vat24) + '</td></tr>';
      html += '<tr><td>14 %:n vero</td><td class="text-right">' + formatReportNumEuro(vat14) + '</td></tr>';
      html += '<tr><td>10 %:n vero</td><td class="text-right">' + formatReportNumEuro(vat10) + '</td></tr>';
      html += '</table>';
      html += '<h2>Vero ostoista ja maahantuonneista</h2>';
      html += '<table class="report-vat-table report-vat-verottaja-table">';
      html += '<tr><td>Vero tavaraostoista muista EU-maista</td><td class="text-right">' + formatReportNumEuro(Math.abs(veroOstotEUTavara)) + '</td></tr>';
      html += '<tr><td>Vero palveluostoista muista EU-maista</td><td class="text-right">' + formatReportNumEuro(Math.abs(veroOstotEUPalvelu)) + '</td></tr>';
      html += '<tr><td>Vero tavaroiden maahantuonneista EU:n ulkopuolelta</td><td class="text-right">' + formatReportNumEuro(0) + '</td></tr>';
      html += '<tr><td>Vero rakentamispalvelun ja metalliromun ostoista</td><td class="text-right">' + formatReportNumEuro(Math.abs(veroRakentaminenOstot)) + '</td></tr>';
      html += '<tr class="vat-section-total"><td>Vähennettävä vero</td><td class="text-right">' + formatReportNumEuro(Math.abs(vahennettavaRaw)) + '</td></tr></table>';
      html += '<h2>Verokauden vähennettävä vero</h2>';
      html += '<p>Ilmoitatko alarajahuojennuksen tietoja tällä verokaudella?</p>';
      html += '<table class="report-vat-table report-vat-verottaja-table">';
      html += '<tr><td>Alarajahuojennukseen oikeuttava liikevaihto</td><td class="text-right">' + formatReportNumEuro(alarajaLiikevaihto) + '</td></tr>';
      html += '<tr><td>Alarajahuojennukseen oikeuttava vero</td><td class="text-right"></td></tr>';
      html += '<tr><td>Alarajahuojennuksen määrä</td><td class="text-right"></td></tr>';
      html += '<tr class="vat-final"><td><strong>Maksettava vero</strong></td><td class="text-right">' + formatReportNumEuro(totalVatFromRows) + '</td></tr></table>';
      html += '<h2>Myynnit, ostot ja maahantuonnit</h2>';
      html += '<table class="report-vat-table report-vat-verottaja-table">';
      html += '<tr><td>0-verokannan alainen liikevaihto</td><td class="text-right">' + formatReportNumEuro(sumBase(accountRows.filter(r => (r.vatCode === 6 || r.vatCode === 8) && r.vatRate === 0))) + '</td></tr>';
      html += '<tr><td>Tavaroiden myynnit muihin EU-maihin</td><td class="text-right">' + formatReportNumEuro(0) + '</td></tr>';
      html += '<tr><td>Palveluiden myynnit muihin EU-maihin</td><td class="text-right">' + formatReportNumEuro(sumBase(salesEU)) + '</td></tr>';
      html += '<tr><td>Tavaraostot muista EU-maista</td><td class="text-right">' + formatReportNumEuro(Math.abs(sumBase(purchaseEUTavara))) + '</td></tr>';
      html += '<tr><td>Palveluostot muista EU-maista</td><td class="text-right">' + formatReportNumEuro(Math.abs(sumBase(purchaseEUPalvelu))) + '</td></tr>';
      html += '<tr><td>Tavaroiden maahantuonnit EU:n ulkopuolelta</td><td class="text-right">' + formatReportNumEuro(0) + '</td></tr>';
      html += '<tr><td>Rakentamispalvelun ja metalliromun myynnit (käännetty verovelvollisuus)</td><td class="text-right">' + formatReportNumEuro(sumBase(accountRows.filter(r => r.vatCode === 10))) + '</td></tr>';
      html += '<tr><td>Rakentamispalvelun ja metalliromun ostot</td><td class="text-right">' + formatReportNumEuro(Math.abs(sumBase(purchaseConstruction))) + '</td></tr></table>';
      html += '<p class="report-vat-verottaja-contact">Lisätietojen antajan yhteystiedot</p></div>';
    } else {
    html = '<div class="report-vat">';
    html += '<h1>' + (settings.name || '') + '</h1>';
    html += '<p class="report-vat-meta">' + (settings.businessId || '') + '</p>';
    html += '<h2>ALV-laskelma tileittäin</h2>';
    html += '<p class="report-vat-period">' + dateRangeFormatted + '</p>';
    html += '<table class="report-vat-table"><thead><tr><th>Nro</th><th>Tili</th><th class="text-right">Veron peruste</th><th class="text-right">Vero</th><th class="text-right">Verollinen summa</th></tr></thead><tbody>';


    let totalVat = 0;
    let prevCode = -1;
    let prevRate = -1;
    let sectionBase = 0, sectionVat = 0, sectionGross = 0;
    let rateBase = 0, rateVat = 0, rateGross = 0;

    VAT_SECTION_CODES.forEach(sectionCode => {
      const sectionRows = accountRows.filter(r => r.vatCode === sectionCode);
      if (sectionRows.length === 0) return;

      sectionBase = 0; sectionVat = 0; sectionGross = 0;
      rateBase = 0; rateVat = 0; rateGross = 0;
      prevRate = -1;

      const sectionName = VAT_CODE_NAMES[sectionCode] || 'ALV-koodi ' + sectionCode;
      html += '<tr class="vat-section-header"><td colspan="5"><strong>' + sectionName + '</strong></td></tr>';

      sectionRows.forEach((row, i) => {
        if (prevRate >= 0 && row.vatRate !== prevRate) {
          html += '<tr class="vat-rate-total"><td></td><td>ALV ' + formatReportNum(prevRate) + ' yhteensä</td><td class="rd-num">' + formatReportNum(rateBase) + '</td><td class="rd-vat">' + formatReportNum(rateVat) + '</td><td class="rd-num">' + formatReportNum(rateGross) + '</td></tr>';
          rateBase = 0; rateVat = 0; rateGross = 0;
        }
        prevRate = row.vatRate;
        rateBase += row.base; rateVat += row.vat; rateGross += row.gross;
        sectionBase += row.base; sectionVat += row.vat; sectionGross += row.gross;
        totalVat += row.vat;

        const accName = (row.account.name || '') + ' ' + formatReportNum(row.vatRate) + '%';
        html += '<tr><td>' + (row.account.number || '') + '</td><td>' + accName + '</td><td class="rd-num">' + formatReportNum(row.base) + '</td><td class="rd-vat">' + formatReportNum(row.vat) + '</td><td class="rd-num">' + formatReportNum(row.gross) + '</td></tr>';
      });

      if (sectionRows.length > 0) {
        html += '<tr class="vat-rate-total"><td></td><td>ALV ' + formatReportNum(prevRate) + ' yhteensä</td><td class="rd-num">' + formatReportNum(rateBase) + '</td><td class="rd-vat">' + formatReportNum(rateVat) + '</td><td class="rd-num">' + formatReportNum(rateGross) + '</td></tr>';
        html += '<tr class="vat-section-total"><td></td><td><strong>' + sectionName + ' yhteensä</strong></td><td class="rd-num">' + formatReportNum(sectionBase) + '</td><td class="rd-vat">' + formatReportNum(sectionVat) + '</td><td class="rd-num">' + formatReportNum(sectionGross) + '</td></tr>';
      }
    });

    html += '<tr class="vat-final"><td colspan="3"></td><td><strong>' + (totalVat < 0 ? 'Palautukseen oikeuttava vero' : 'Maksettava vero') + '</strong></td><td class="rd-vat">' + formatReportNum(totalVat) + '</td></tr>';
    html += '</tbody></table></div>';
    }

    showReportInPanel(style === 'verottaja' ? 'Verottajan ALV-ilmoitus' : 'ALV-laskelma tileittäin', html);
  };

  // Expose default structures so the Raporttipohja editor can read them.
  window.getDefaultReportStructure = function (id) {
    if (id === 'balance-sheet-detailed') return _BS_DEFAULT;
    if (id === 'income-statement-detailed') return _IS_DEFAULT;
    return null;
  };
})();
