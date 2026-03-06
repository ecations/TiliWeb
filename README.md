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
