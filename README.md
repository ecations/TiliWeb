# TiliWeb

**TiliWeb** on ilmainen ja avoimen lähdekoodin selainpohjainen kirjanpito-ohjelma, joka perustuu suomalaisen [Tilitin](https://ito.fi/tilitin/)-kirjanpito-ohjelman lähdekoodiin. Ohjelman on toteuttanut **ecations**. Lisenssi: **GPL-3.0**.

---

## Käyttö

Ohjelmaa voi käyttää suoraan selaimessa ilman asennusta:

🌐 **[https://ecation.fi/tiliweb](https://ecation.fi/tiliweb)**

Ohjelman voi myös ladata omalle koneelle ja käyttää paikallisesti täysin ilman internet-yhteyttä. Lataa repositorio ja avaa `index.html` selaimessa.

---

## Yhteensopivuus Tilitinin kanssa

Vanhan **Tilitin**-ohjelman (Java-versio) kirjanpitotiedostot voidaan tuoda suoraan TiliWebiin:

1. Avaa vanhan Tilitinin tietokanta
2. Kopioi sieltä `SQLite`-tiedosto
3. Valitse TiliWebissä **Työkalut → Tuo SQL-tiedosto**

Toiseen suuntaan siirtyminen on myös mahdollista: TiliWebistä voi viedä kirjanpitodatan ja palata tarvittaessa takaisin alkuperäiseen Java-Tilitiniin.

---

## Ominaisuuksia

### Kuitin lukeminen OCR:llä

Tositteet-näkymän tositelajirivin oikeassa reunassa oleva **OCR – lue kuitti** avaa kuitin tuonnin. Valitse tai raahaa yksi JPG-, PNG- tai WebP-kuva (enintään 20 Mt). Tarkista ja muokkaa ostopäivä, loppusumma veroineen, summaan sisältyvä ALV ja selite kuvan vieressä. Hyväksyminen luo uuden **tallentamattoman** tositteen: kulurivin debet ja maksutilin kredit ovat loppusumman suuruiset. Kuitista tunnistettu ALV näkyy kulurivin ALV-sarakkeessa, eikä sitä lisätä bruttosummaan. Kulutili jää tyhjäksi; pankkitiliä ehdotetaan vain, jos tilikartassa on yksi selvästi nimetty pankkitili. Täydennä tilit ennen tavallista tallennusta.

ALV tunnistetaan kuitin ALV-yhteissummasta, verokantakohtaisista ALV-riveistä tai otsikoidusta verotaulukosta. Epäselvä summa jää tyhjäksi, ja sen voi täydentää käsin (myös 0,00). Usean verokannan ALV:t lasketaan yhteen; jaa kulut tarvittaessa omille riveilleen. Tarkista vähennyskelpoisuus itse. ALV-tiliä valittaessa kuitin tarkistettu ALV säilyy ja kulun nettosumma muodostetaan sisäisesti, mutta debet/kredit näyttävät edelleen bruton. Jos muutat tositteen debet/kredit-summaa myöhemmin, ALV lasketaan uudelleen tilin asetuksilla.

OCR käyttää selaimessa [Tesseract.js:ää](https://github.com/naptha/tesseract.js) (6.0.1, suomi ja englanti). Kuvaa tai tunnistettua tekstiä ei lähetetä palvelimelle. OCR-ohjelma ja kielitiedostot ladataan jsDelivristä, joten OCR tarvitsee internet-yhteyden; ohjelman muut offline-toiminnot säilyvät ennallaan. Tunnistus on avustava: epäselvä päivämäärä tai loppusumma jätetään tyhjäksi ja käyttäjä täydentää sen. Vieraan valuutan kuitti edellyttää euromäärän täyttämistä käsin. Kuittikuvaa ei tallenneta tositteen liitteeksi tässä versiossa, joten säilytä alkuperäinen kuitti erikseen.

OCR-parserin testit: `node --test tests/receipt-ocr.test.js`.

### Muut ominaisuudet

- Kahdenkertainen kirjanpito tilikausikohtaisesti
- Vapaavalintainen tilikartta ja valmiit tilikarttamallit (pienyritys, yhdistys, maatalous…)
- Arvonlisäverolaskelmat ja ALV-raportti Verohallintoa varten
- Tuloslaskelma ja tase
- Tiliote tilikausittain
- Pääkirja ja päiväkirja
- Tositteiden haku ja suodatus
- Vientimallit toistuviin kirjauksiin
- Vientien ennustus ja autotäyttö historiallisen vientidatan perusteella
- Tositelajit ja tositenumerointi
- Alkusaldojen hallinta
- Kaikki tieto tallennetaan paikallisesti selaimen muistiin – mitään ei lähetetä palvelimelle
- Toimii offline-tilassa (ladatussa versiossa ei tarvita internet-yhteyttä)

---

## Tuki ja keskustelu

Ohjelmaa koskevaa keskustelua käydään Kirjanpitofoorumilla:

💬 **[https://kirjanpitofoorumi.com/viewforum.php?f=48](https://kirjanpitofoorumi.com/viewforum.php?f=48)**

---

## Vastuuvapauslauseke

Ohjelma on tarkoitettu avuksi kirjanpitoon, mutta käyttö on käyttäjän omalla vastuulla. Ohjelmassa saattaa esiintyä virheitä (bugeja). Tarkista aina kirjanpitosi oikeellisuus ennen viranomaisraportointia. Ohjelma ei korvaa ammattimaista kirjanpitäjää tai tilitoimistoa.

---

## Lisenssi

[GNU General Public License v3.0](LICENSE)
