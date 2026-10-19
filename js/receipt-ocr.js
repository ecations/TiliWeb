/* Local receipt recognition and conservative Finnish receipt parsing. */
(function (root) {
  'use strict';

  function validDate(year, month, day) {
    const d = new Date(Date.UTC(year, month - 1, day));
    return year >= 1900 && year <= 2199 && d.getUTCFullYear() === year &&
      d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
  }

  function parseAmount(value) {
    const s = String(value).trim().replace(/[\s\u00a0]/g, '');
    if (!/^\d+(?:[,.]\d{1,2})?$/.test(s)) return null;
    const amount = Number(s.replace(',', '.'));
    return Number.isFinite(amount) && amount > 0 && amount <= 99999999.99 ? Math.round(amount * 100) / 100 : null;
  }

  function parseVatAmount(value) {
    return /^0(?:[,.]0{1,2})?$/.test(String(value).trim()) ? 0 : parseAmount(value);
  }

  function parseVat(lines, gross) {
    const totals = [], parts = new Map();
    let columns = null, uncertain = false;
    const addPart = (rate, amount) => {
      if (amount == null || (parts.has(rate) && parts.get(rate) !== amount)) uncertain = true;
      else parts.set(rate, amount);
    };
    lines.forEach((line, index) => {
      const headings = line.match(/alv\s*%|vat\s*%|veroton|netto|net|verollinen|brutto|gross|alv|vat|vero|tax|%/gi);
      if (headings && !/\d/.test(line)) {
        const roles = headings.map(s => /%/.test(s) ? 'rate' : /veroton|net/i.test(s) ? 'net' : /verollinen|brutto|gross/i.test(s) ? 'gross' : 'tax');
        if (roles.includes('tax') && roles.includes('net') && roles.includes('gross')) { columns = roles; return; }
      }
      if (columns) {
        const values = line.match(/[-−]?\d+(?:[,.]\d+)?/g) || [];
        const total = /yhteens[äa]|total/i.test(line);
        const roles = total ? columns.filter(c => c !== 'rate') : columns;
        if (values.length === roles.length && (total || /^\s*[A-Z]?\s*\d/i.test(line))) {
          const row = Object.fromEntries(roles.map((role, i) => [role, parseVatAmount(values[i])]));
          if (row.net != null && row.tax != null && row.gross != null && Math.abs(row.net + row.tax - row.gross) <= 0.021) {
            if (total) totals.push(row.tax);
            else addPart(String(row.rate ?? parts.size), row.tax);
          } else uncertain = true;
          return;
        }
        if (/^\s*[A-Z]?\s*\d/i.test(line)) uncertain = true;
        columns = null;
      }
      if (!/\b(?:alv|vat|vero|tax)\b/i.test(line)) return;
      const rate = line.match(/(\d+(?:[,.]\d+)?)\s*%/);
      let amounts = line.replace(/\d+(?:[,.]\d+)?\s*%/g, '').match(/[-−]?\d+(?:[ \u00a0]\d{3})*[,.]\d{2}(?!\d)/g) || [];
      if (!amounts.length && /^\s*[-−]?\d+(?:[ \u00a0]\d{3})*[,.]\d{2}\s*(?:€|EUR)?\s*$/i.test(lines[index + 1] || '')) {
        amounts = lines[index + 1].match(/[-−]?\d+(?:[ \u00a0]\d{3})*[,.]\d{2}/g);
      }
      if (amounts.length === 1) {
        const amount = parseVatAmount(amounts[0]);
        if (/yhteens[äa]|total/i.test(line) || !rate) totals.push(amount);
        else addPart(rate[1].replace(',', '.'), amount);
      } else if (amounts.length > 1) uncertain = true;
    });
    const unique = [...new Set(totals)];
    const sum = parts.size ? Math.round([...parts.values()].reduce((a, b) => a + b, 0) * 100) / 100 : null;
    if (uncertain || unique.length > 1 || unique.includes(null)) return null;
    const vat = unique.length === 1 ? unique[0] : sum;
    if (unique.length && sum != null && Math.abs(vat - sum) > 0.011) return null;
    return vat != null && gross != null && vat < gross ? vat : null;
  }

  function parse(text) {
    const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const dates = new Set();
    lines.forEach(line => {
      const pattern = /\b(?:(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})|(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2}))\b/g;
      for (const m of line.matchAll(pattern)) {
        let year = Number(m[1] || m[6]);
        if (year < 100) year += year >= 70 ? 1900 : 2000;
        const month = Number(m[2] || m[5]);
        const day = Number(m[3] || m[4]);
        if (validDate(year, month, day)) dates.add(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      }
    });
    const totals = [];
    lines.forEach((line, index) => {
      if (/välisumma|subtotal|alv|vat|veroton|ilman veroa|säästö|alennus|vaihtoraha|change/i.test(line)) return;
      const priority = /yhteens[äa]|loppusumma|maksettava|total(?!\s*(?:vat|tax))/i.test(line) ? 2 :
        /^(?:summa|kortti|pankkikortti|visa|mastercard|käteinen)\b/i.test(line) ? 1 : 0;
      if (!priority) return;
      // Accept only decimal amounts on labelled total/payment lines; never guess the largest number.
      let amounts = line.match(/[-−]?\d+(?:[ \u00a0]\d{3})*[,.]\d{2}(?!\d)/g) || [];
      if (!amounts.length && lines[index + 1] && /^\s*[-−]?\d[\d .,]*(?:€|EUR)?\s*$/i.test(lines[index + 1])) {
        amounts = lines[index + 1].match(/[-−]?\d+(?:[ \u00a0]\d{3})*[,.]\d{2}(?!\d)/g) || [];
      }
      if (amounts.length === 1) totals.push({ priority, value: parseAmount(amounts[0]) });
    });
    const priority = Math.max(0, ...totals.map(t => t.priority));
    const values = [...new Set(totals.filter(t => t.priority === priority).map(t => t.value))];
    const foreign = /\b(?:USD|SEK|NOK|DKK|GBP|CHF)\b|[$£]/i.test(text);
    const amount = !foreign && values.length === 1 ? values[0] : null;
    const vatAmount = foreign ? null : parseVat(lines, amount);
    const date = dates.size === 1 ? [...dates][0] : '';
    const merchant = lines.slice(0, 6).find(line => /[a-zåäö]{3}/i.test(line) &&
      !/kuitti|receipt|y-tunnus|www\.|https?:|\d{1,2}[.:/]\d{2}|\d{5}|puh\.|tel\./i.test(line)) || '';
    const products = lines.filter(line => /[a-zåäö]{3}/i.test(line) && /\d+[,.]\d{2}\b/.test(line) &&
      !/yhteens[äa]|summa|total|alv|vat|vero|kortti|visa|mastercard|kätein|makset|maksu|vaihto|sääst|alennus|puh\.|tel\.|\d{1,2}[./]\d{1,2}[./]\d{2}/i.test(line))
      .slice(0, 3).map(line => line.replace(/\s+[-−]?\d+[,.]\d{2}.*$/, '').trim()).filter(Boolean);
    const description = [merchant, products.join(', ')].filter(Boolean).join(' – ').slice(0, 250);
    const warnings = [];
    if (!date) warnings.push(dates.size > 1 ? 'Kuitissa on useita päivämääriä. Valitse ostopäivä.' : 'Ostopäivää ei tunnistettu varmasti. Valitse ”Aseta päivämäärä”.');
    if (!amount) warnings.push(foreign ? 'Kuitissa on vieras valuutta. Täytä kirjanpidon euromääräinen summa.' : 'Loppusummaa ei tunnistettu varmasti. Tarkista ja täytä summa.');
    if (vatAmount == null) warnings.push('ALV-summaa ei tunnistettu varmasti. Tarkista se kuitista; tyhjä kenttä ei tarkoita verotonta ostoa.');
    return { date, dates: [...dates], amount, vatAmount, description, warnings };
  }

  let libraryPromise;
  function loadLibrary() {
    if (root.TiliWebLocalOcr) return Promise.resolve(root.TiliWebLocalOcr);
    if (!libraryPromise) {
      libraryPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const fail = () => { clearTimeout(timer); script.remove(); reject(new Error('Paikallisen OCR-ohjelman lataus epäonnistui. Varmista, että js/vendor/ocr/ocr-local.js on mukana TiliWeb-kansiossa.')); };
        const timer = setTimeout(fail, 30000);
        script.src = 'js/vendor/ocr/ocr-local.js?v=2026-10-19-1';
        script.onload = () => { if (!root.TiliWebLocalOcr) { fail(); return; } clearTimeout(timer); resolve(root.TiliWebLocalOcr); };
        script.onerror = fail;
        document.head.appendChild(script);
      }).catch(error => { libraryPromise = null; throw error; });
    }
    return libraryPromise;
  }

  function open(options) {
    const dialog = document.createElement('dialog');
    dialog.className = 'receipt-ocr-dialog';
    dialog.setAttribute('aria-labelledby', 'receiptOcrTitle');
    dialog.innerHTML = `
      <div class="receipt-ocr-heading"><h2 id="receiptOcrTitle">Lue kuitti</h2><button type="button" data-close aria-label="Sulje kuittinäkymä">Sulje</button></div>
      <p>Kuitin tunnistus toimii kokonaan paikallisesti tässä selaimessa. Internet-yhteyttä tai palvelinta ei tarvita. Kuvaa ei lähetetä minnekään.</p>
      <div class="receipt-ocr-drop" data-drop>
        <p>Raahaa kuitin kuva tähän tai valitse tiedosto.</p>
        <button type="button" data-choose>Valitse kuitin kuva</button>
        <input type="file" data-file accept="image/jpeg,image/png,image/webp" hidden>
        <small>JPG, PNG tai WebP, enintään 20 Mt. Yksi kuitti kerrallaan.</small>
      </div>
      <p data-status role="status" aria-live="polite"></p>
      <div class="receipt-ocr-review" hidden>
        <div class="receipt-ocr-image-wrap"><img data-image alt="Alkuperäinen kuitti"><p>Kuva näkyy vain tässä tarkistuksessa. Säilytä alkuperäinen kuitti erikseen.</p></div>
        <form data-form>
          <h3>Kirjausehdotus</h3>
          <p data-warnings class="receipt-ocr-warnings"></p>
          <label>Ostopäivä<select data-date-choice required aria-controls="receiptOcrManualDate"></select></label>
          <label id="receiptOcrManualDate" data-manual-date hidden>Aseta päivämäärä<input data-date type="date" disabled></label>
          <label>Loppusumma veroineen (€)<input data-amount type="text" inputmode="decimal" required placeholder="0,00"></label>
          <label>Summaan sisältyvä ALV (€)<input data-vat type="text" inputmode="decimal" placeholder="Ei tunnistettu – tarkista kuitista"></label>
          <label>Selite<textarea data-description rows="3" maxlength="250"></textarea></label>
          <label>Pankkitili (kredit)<select data-bank><option value="0">Valitse myöhemmin</option></select></label>
          <table class="receipt-ocr-postings"><thead><tr><th>Tili</th><th>Debet</th><th>Kredit</th><th>ALV</th></tr></thead><tbody>
            <tr><td>Kulutili – valitse tositteella</td><td data-debit>–</td><td>–</td><td data-vat-preview>–</td></tr>
            <tr><td data-bank-label>Pankkitili</td><td>–</td><td data-credit>–</td><td>–</td></tr>
          </tbody></table>
          <p>Debet ja kredit sisältävät ALV:n. ALV ehdotetaan kuluriville, eikä sitä lisätä loppusummaan. Tarkista vähennyskelpoisuus ja täydennä tilit tositteella. Jos kuitissa on useita verokantoja, jaa kulut tarvittaessa omille riveilleen.</p>
          <details><summary>Tunnistettu teksti</summary><pre data-text></pre></details>
          <p data-error role="alert" class="receipt-ocr-warnings"></p>
          <button type="submit" data-accept disabled>Hyväksy uudeksi tositteeksi</button>
        </form>
      </div>`;
    const $ = selector => dialog.querySelector(selector);
    function updateDateMode(focus) {
      const manual = $('[data-date-choice]').value === 'manual';
      $('[data-manual-date]').hidden = !manual;
      $('[data-date]').disabled = !manual;
      $('[data-date]').required = manual;
      if (manual && focus) $('[data-date]').focus();
    }
    function setDateOptions(dates) {
      const select = $('[data-date-choice]');
      select.replaceChildren();
      select.add(new Option(dates.length ? 'Valitse ostopäivä' : 'Päivämäärää ei tunnistettu', ''));
      dates.forEach(date => {
        const [year, month, day] = date.split('-');
        select.add(new Option(`${day}.${month}.${year}`, date));
      });
      select.add(new Option('Aseta päivämäärä', 'manual'));
      select.value = dates.length === 1 ? dates[0] : '';
      $('[data-date]').value = '';
      updateDateMode(false);
    }
    setDateOptions([]);
    $('[data-date-choice]').onchange = () => updateDateMode(true);
    let worker = null, imageUrl = null, generation = 0, busy = false;
    const banks = options.accounts.filter(a => Number(a.type) === 0 && /pankki|bank/i.test(a.name || '') && !/saamis|siirto|laina|luotto/i.test(a.name || ''));
    // Other accounts remain available for manually choosing the payment account.
    options.accounts.filter(a => Number(a.type) === 0).forEach(a => {
      const option = document.createElement('option');
      option.value = a.id;
      option.textContent = `${a.number} ${a.name}`;
      $('[data-bank]').appendChild(option);
    });
    if (banks.length === 1) $('[data-bank]').value = banks[0].id;
    const previousFocus = document.activeElement;
    function stopWorker() {
      if (worker) { worker.terminate().catch(() => {}); worker = null; }
    }
    function close() {
      generation++;
      stopWorker();
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      dialog.close();
      dialog.remove();
      previousFocus?.focus();
    }
    function updatePreview() {
      const amount = parseAmount($('[data-amount]').value);
      const formatted = amount ? amount.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–';
      $('[data-debit]').textContent = formatted;
      $('[data-credit]').textContent = formatted;
      const vat = parseVatAmount($('[data-vat]').value);
      $('[data-vat-preview]').textContent = vat == null ? '–' : vat.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const select = $('[data-bank]');
      $('[data-bank-label]').textContent = select.value === '0' ? 'Pankkitili – valitse tositteella' : select.selectedOptions[0].textContent;
    }
    function setBusy(value) {
      busy = value;
      $('[data-choose]').disabled = value;
      $('[data-accept]').disabled = value;
      $('[data-form]').inert = value;
      dialog.setAttribute('aria-busy', String(value));
    }
    async function recognize(file) {
      if (busy || !file) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 20 * 1024 * 1024) {
        $('[data-status]').textContent = 'Valitse JPG-, PNG- tai WebP-kuva, jonka koko on enintään 20 Mt.';
        return;
      }
      const run = ++generation;
      setBusy(true);
      setDateOptions([]);
      $('[data-amount]').value = '';
      $('[data-vat]').value = '';
      $('[data-description]').value = '';
      $('[data-text]').textContent = '';
      $('[data-warnings]').textContent = '';
      $('[data-error]').textContent = '';
      updatePreview();
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      imageUrl = URL.createObjectURL(file);
      $('[data-image]').src = imageUrl;
      $('.receipt-ocr-review').hidden = false;
      $('[data-status]').textContent = 'Ladataan kuittia ja tunnistusta…';
      let timeout;
      try {
        await Promise.race([
          (async () => {
            await $('[data-image]').decode();
            if (run !== generation) return;
            const engine = await loadLibrary();
            if (run !== generation) return;
            const created = await engine.createWorker('fin+eng', 1, {
              logger: message => {
                if (run !== generation) return;
                $('[data-status]').textContent = message.status === 'recognizing text'
                  ? `Tunnistetaan kuittia… ${Math.round((message.progress || 0) * 100)} %` : 'Ladataan OCR-ohjelmaa ja kielitiedostoja…';
              }
            });
            if (run !== generation) { await created.terminate(); return; }
            worker = created;
            // Bound memory use for high-resolution phone photos while retaining a readable receipt.
            const img = $('[data-image]');
            const scale = Math.min(1, 3000 / Math.max(img.naturalWidth, img.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const result = await created.recognize(canvas, { rotateAuto: true });
            if (run !== generation) return;
            const proposal = parse(result.data.text);
            setDateOptions(proposal.dates);
            $('[data-amount]').value = proposal.amount ? proposal.amount.toFixed(2).replace('.', ',') : '';
            $('[data-vat]').value = proposal.vatAmount == null ? '' : proposal.vatAmount.toFixed(2).replace('.', ',');
            $('[data-description]').value = proposal.description;
            $('[data-text]').textContent = result.data.text;
            $('[data-warnings]').textContent = proposal.warnings.join(' ');
            $('[data-status]').textContent = 'Tunnistus valmis. Tarkista päivämäärä, loppusumma, ALV ja selite alkuperäisestä kuvasta.';
            updatePreview();
          })(),
          new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Tunnistus kesti liian kauan. Yritä uudelleen tai täytä tiedot käsin.')), 120000); })
        ]);
      } catch (error) {
        if (run === generation) {
          $('[data-status]').textContent = 'Tunnistus epäonnistui. Voit valita toisen kuvan tai täyttää ehdotuksen käsin. ' + (error.message || '');
        }
      } finally {
        clearTimeout(timeout);
        if (run === generation) { generation++; stopWorker(); setBusy(false); }
      }
    }
    $('[data-close]').onclick = close;
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    // Keep application-wide voucher shortcuts away from the modal.
    dialog.addEventListener('keydown', event => event.stopPropagation());
    $('[data-choose]').onclick = () => $('[data-file]').click();
    $('[data-file]').onchange = event => { recognize(event.target.files[0]); event.target.value = ''; };
    const drop = $('[data-drop]');
    dialog.addEventListener('dragover', event => event.preventDefault());
    dialog.addEventListener('drop', event => event.preventDefault());
    drop.ondragover = event => { event.preventDefault(); if (!busy) drop.classList.add('is-dragging'); };
    drop.ondragleave = () => drop.classList.remove('is-dragging');
    drop.ondrop = event => {
      event.preventDefault(); drop.classList.remove('is-dragging');
      if (event.dataTransfer.files.length !== 1) { $('[data-status]').textContent = 'Valitse yksi kuitti kerrallaan.'; return; }
      recognize(event.dataTransfer.files[0]);
    };
    $('[data-amount]').oninput = updatePreview;
    $('[data-vat]').oninput = updatePreview;
    $('[data-bank]').onchange = updatePreview;
    $('[data-form]').addEventListener('input', () => { $('[data-error]').textContent = ''; });
    $('[data-form]').onsubmit = event => {
      event.preventDefault();
      if (busy) return;
      const date = $('[data-date-choice]').value === 'manual' ? $('[data-date]').value : $('[data-date-choice]').value;
      const amount = parseAmount($('[data-amount]').value);
      const vatText = $('[data-vat]').value.trim();
      const vatAmount = parseVatAmount(vatText);
      const parts = date.split('-').map(Number);
      if (!validDate(parts[0], parts[1], parts[2]) || !amount) {
        $('[data-error]').textContent = 'Täytä kelvollinen päivämäärä ja positiivinen loppusumma.'; return;
      }
      if (date < options.period.startDate || date > options.period.endDate) {
        $('[data-error]').textContent = 'Ostopäivä ei kuulu valittuun tilikauteen. Valitse oikea tilikausi tai korjaa päivämäärä.'; return;
      }
      if (vatText && (vatAmount == null || vatAmount >= amount)) {
        $('[data-error]').textContent = 'ALV:n tulee olla vähintään nolla ja pienempi kuin kuitin loppusumma.'; return;
      }
      try {
        options.accept({ date, amount, vatAmount, description: $('[data-description]').value.trim(), bankAccountId: Number($('[data-bank]').value) });
        close();
      } catch (error) { $('[data-error]').textContent = error.message; }
    };
    document.body.appendChild(dialog);
    dialog.showModal();
    $('[data-choose]').focus();
  }

  root.ReceiptOcr = { parse, parseAmount, open };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ReceiptOcr;
})(typeof window !== 'undefined' ? window : globalThis);
