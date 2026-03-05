# Tilikarttamallit (chart of accounts templates)

## Full KT template (Elinkeinotoiminta)

The app loads **Elinkeinotoiminta (täysi KT, ALV 24%)** from `js/coa-elinkeinotoiminta24.js` (872 accounts, 211 headings), generated from the Java Tilitin JAR `tilitin-1.5.0-src/tilikarttamallit/elinkeinotoiminta-24.jar`.

## Adding more templates from Java JARs

1. **Extract a JAR** (e.g. `asunto-osakeyhtio.jar`, `yhdistys.jar`, `yksityistalous.jar`, `tiekunta.jar`, `yhteisen-vesialueen-osakaskunta.jar`):
   - Unzip the JAR to a folder (e.g. `asunto-osakeyhtio_extracted`).
   - Each JAR contains `chart-of-accounts.txt` in the same format.

2. **Generate a JS file**:
   ```bash
   node build-tilikarttamallit.js "tilitin-1.5.0-src/tilikarttamallit/<folder>/chart-of-accounts.txt" <template-id> "<Template name>" js/coa-<name>.js
   ```
   Example for yhdistys:
   ```bash
   node build-tilikarttamallit.js "tilitin-1.5.0-src/tilikarttamallit/yhdistys_extracted/chart-of-accounts.txt" yhdistys "Yhdistys" js/coa-yhdistys.js
   ```

3. **Include the script** in `index.html` after `tilikarttamallit.js`:
   ```html
   <script src="js/coa-yhdistys.js"></script>
   ```

4. The template will appear in **Muokkaa → Lataa tilikarttamalli…**.

## Format of chart-of-accounts.txt

- First line: optional count.
- `A;number;name;type` – account (type 0–6: Vastaavaa, Vastattavaa, Oma pääoma, Tulot, Menot, Ed. voitto, Tilikauden voitto).
- `H;number;text;level` – heading (level 0–5).
- `V;accountNumber;vatCode;vatRate;vatAccount1Num[;vatAccount2Num]` – VAT link (vatRate can be e.g. `24%` or index 0–7).

## Encoding

If account names show wrong characters (e.g. Ã¤ instead of ä), the source `chart-of-accounts.txt` encoding may differ. Edit `build-tilikarttamallit.js` to try `'latin1'` first for reading, or ensure the extracted file is saved as UTF-8.
