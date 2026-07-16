# Digitaler Notfallordner – Projektkontext

## Was das ist
Ein **digitaler Notfallordner** für Familien: eine einzige, eigenständige HTML-Datei
(`index.html`), die **vollständig offline** im Browser läuft. Sie bündelt die wichtigsten
Informationen für den Notfall, verschlüsselt sie lokal und erzeugt ausdruckbare Rechtsdokumente.
Kein Server, kein Build-Schritt, keine externe Laufzeitabhängigkeit – alles ist in der einen
HTML-Datei enthalten (CSS + JavaScript inline).

**Zielgruppe:** Privatpersonen, die Notfalldaten strukturiert hinterlegen und im Erb-/Notfall
an berechtigte Personen weitergeben wollen.

## Wichtigste Designprinzipien (nicht brechen)
1. **Offline-first:** Keine externen Requests zur Laufzeit außer optionalem Google-Fonts-Import.
   Alle Kernfunktionen (Verschlüsselung, QR-Code, PDF) funktionieren ohne Internet und via `file://`.
2. **Single-File:** Die gesamte App bleibt in `index.html`. Kein Bundler, kein npm-Runtime-Deps.
   (npm wird nur für die Tests im Entwicklungsordner genutzt, siehe unten.)
3. **Datensicherheit vor Bequemlichkeit:** Nie Klartext exportieren, wenn Verschlüsselung aktiv ist.
   Kindersicherheits- und Rechtshinweise in den Dokumenten nicht entfernen.
4. **Barrierefreiheit/Kontrast:** Textkontraste mindestens WCAG AA halten (Prüfskript unten).

## Aktueller Zustand
- Sprache der Oberfläche: **Deutsch**.
- Design: **hell & freundlich**, durchgängig dunkle Schrift auf hellem Grund.
  Farbschema **Arctic Teal** (Akzent/Überschriften) + **Cloud Pearl** (helle Flächen).
- 13 Inhalts-Sektionen (siehe Architektur).

## Architektur (alles in index.html)

### Aufbau der Datei
- `<style>` (erster Block): komplettes On-Screen-CSS. Weitere `<style>`-Blöcke weiter unten
  gehören zu den **Druckdokument-Generatoren** (separate, bewusst helle Layouts – nicht mit dem
  On-Screen-Theme vermischen).
- `<body>`: Gatekeeper-Sperrbildschirm (`#gate`), Master-Modal (`#masterModal`),
  Lightbox (`#lightbox`), HUD-Rahmen, Header mit **Safe-Drehschloss** (`#safeDial`),
  Toolbar, Navigation (`#navGrid`), Inhaltscontainer (`#sections`), Footer.
- `<script>`-Blöcke: (1) QR-Encoder, (2) Haupt-App-Logik. Achtung: In den Dokument-Generatoren
  stehen escaped `<\/script>`-Strings – die dürfen nicht als echte Tags interpretiert werden.

### Datenmodell
- Laufzeit-State in der globalen Variable `data` (Objekt je Sektion).
- Persistenz in `localStorage`:
  - `notfallordner_v1` – **unverschlüsselter** Zustand (nur wenn Schutz AUS).
  - `notfallordner_env_v1` – **verschlüsselter Umschlag** (wenn Schutz AN).
- `collect()` baut `data` aus dem DOM neu. **Wichtig:** Sektionen, die ihren State selbst
  verwalten (`ledger`, `vault`, `qr`, `custody`, `security`), werden in `collect()`
  übersprungen bzw. unverändert übernommen – sonst gehen ihre Daten beim Tippen verloren.
- `persist()` schreibt: im geschützten Modus **verschlüsselt** (AES-GCM mit In-Memory-Schlüssel,
  entprellt), sonst Klartext.

### Sektionen (`SCHEMA`-Array)
Reihenfolge & Typ:
1. `schutz` (`security:true`) – Zugriffsschutz & Empfängerverwaltung
2. `personen` – Persönliche Daten & Kontaktpersonen
3. `medizin` – Medizinische Infos
4. `zugang` – Zugangsdaten (einfache Repeat-Liste)
5. `tresor` (`vault:true`) – PINs/Passwörter, Dropdown PIN/Login/FREI + Infofeld
6. `finanzen` – Finanzpositionen
7. `vermoegen` (`ledger:true`) – Verträge/Vermögen mit Gruppen→Kategorien→Einträgen,
   Foto-Scan pro Eintrag, Live-Übersicht
8. `dokumente` – Dokumente & Aufbewahrungsorte
9. `digital` – Digitales Erbe & Geräte
10. `vollmachten` – Vollmachten (druckbares Dokument via `printPower`)
11. `sorgerecht` (`custody:true`) – Sorgerechtsverfügung §1782 BGB, 1+ Kinder,
    druckbar via `printCustody`
12. `wuensche` – Persönliche Wünsche
13. `qr` (`qr:true`) – QR-Code-Generator für Schnellzugriff

`render()` iteriert `SCHEMA` und delegiert Spezialtypen an `renderSecurity` / `renderVault` /
`renderLedger` / `renderCustody` / `renderQR`.

### Verschlüsselung (Envelope-Encryption)
- Web Crypto API, **AES-256-GCM** für den Inhalt; ein zufälliger DEK verschlüsselt alles einmal.
- Pro Empfänger wird der DEK mit dem **individuellen Passwort** gewrappt
  (PBKDF2-HMAC-SHA256, 600.000 Iterationen, per-recipient Salt). Funktionen:
  `genDEK`, `encryptContent`/`decryptContent`, `wrapDEK`/`unwrapDEK`, `tryUnlock`.
- Umschlag-Format: `{v, protected, content:{iv,ct}, recipients:[{id,name,owner,salt,iv,wrapped,iter}], ownerBio?}`.
- **Master-Passwort** = Owner-Passwort; Admin-Aktionen verlangen `askMaster()`, das kryptografisch
  über den Owner-Slot prüft (`verifyMaster`).
- **Biometrie (optional):** WebAuthn + PRF-Extension (`bioAvailable`/`bioRegister`/`bioUnlock`).
  Nur in sicherem Kontext (https/localhost), **nicht** unter `file://`. Gerätegebunden.
  Fällt sauber auf Master-Passwort zurück, wenn nicht verfügbar.

### Passwortgenerator
`genPassword({length,lower,upper,digit,symbol,avoidAmbiguous})` – CSPRNG (`crypto.getRandomValues`),
unverzerrte Ziehung per Rejection-Sampling (`secRandInt`), Ganz-Passwort-Rejection zur
Klassen-Garantie, Entropie-Ausgabe. Standard 24 Zeichen ≈ 154 bit.

### QR-Code
Eigenständiger Encoder im ersten `<script>` (`qrEncode`, Reed-Solomon in GF(256), Byte-Modus,
ECC-Level M, Versionen 1–6, gegen etablierte Bibliothek verifiziert). `drawQR` rendert auf Canvas.
QR bleibt **weiß** (Scanbarkeit).

### Safe-Drehschloss
SVG im Header (`#safeDial`). Toggelt Sitzungssperre der Dateneingabe: setzt
`#sections.inert = true/false`, `body.data-locked`, dreht die SVG-Scheibe. Reine UX-Simulation,
**unabhängig** von der echten Verschlüsselung; wird nicht persistiert.

### Druckdokumente
`printPower` (Vollmacht), `printCustody` (Sorgerechtsverfügung), `printAccessDoc` (Zugangsdokument),
`exportPDF` (Gesamtexport). Öffnen ein neues Fenster mit eigenem hellem Layout und rufen `window.print()`.
Diese Layouts sind absichtlich **hell auf weiß** (Druck/Notar) und **nicht** an das On-Screen-Theme gekoppelt.

## Design-Tokens (CSS-Variablen in `:root`)
- Flächen (Cloud Pearl): `--backdrop`, `--bg`, `--bg-deep`, `--panel`, `--panel-2`
- Schrift: `--ink` (#223338), `--ink-soft`
- Akzent (Arctic Teal): `--forest` (#276E75), `--forest-bright`, `--forest-glow`, `--heading` (#22656D)
- Linien: `--line`, `--line-soft`
- Funktionsakzente: `--amber` (Clay, sparsam), `--danger`
- Weiche Schatten: `--glow`, `--glow-soft` (dezent, **kein Neon**)
- Eingabefelder: `--field-bg` (#FFFFFF), `--field-ink`, `--field-line`, `--field-placeholder`

Beim Umfärben immer über diese Variablen gehen. Hartkodierte Farben nur in den
Druckdokument-Layouts und im QR-Canvas (Weiß) belassen.

## Entwicklung & Test

### Öffnen
`index.html` einfach im Browser öffnen (Doppelklick, `file://`).
Für **Biometrie/WebAuthn** lokal ausliefern, z. B.:
```
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

### Tests (Node + jsdom)
Es gibt **keinen Build**. Tests laufen über Node mit jsdom und echter Web-Crypto (`crypto.webcrypto`).
Vorgehen für Änderungen: nach jeder relevanten Änderung eine Headless-Prüfung fahren, die
(a) rendert ohne JS-Fehler, (b) die 13 Sektionen prüft, (c) Kernflows testet
(Vermögen-Eintrag, Tresor-Dropdown, QR erzeugen, Sorgerecht-Kind, PDF-Export, Generator,
Verschlüsselung aktivieren, Drehschloss auf/zu).

```
npm install jsdom --no-save
node tests/smoke.test.js
```

Für Krypto-Änderungen zusätzlich einen isolierten Roundtrip testen
(mehrere Empfänger, falsches Passwort → kein Zugriff, Empfänger entfernen, Performance des
Neu-Verschlüsselns < 50 ms, Unlock-PBKDF2 ~ einige 100 ms).

### Kontrastprüfung
Vor dem Abschluss einer Design-Änderung Textkontraste prüfen (Ziel: Fließtext ≥ AA, besser AAA).
Ein einfaches WCAG-Ratio-Skript genügt (Luminanz-Formel).

## Fallstricke / Do-nots
- `collect()` **niemals** so ändern, dass selbstverwaltete Sektionen überschrieben werden.
- `persist()` im geschützten Modus **nie** Klartext schreiben lassen.
- Escaped `<\/script>` in den Dokument-Generatoren nicht „korrigieren".
- QR-Hintergrund weiß lassen; Druckdokumente hell lassen.
- Rechts- und Kindersicherheitshinweise in Vollmacht/Sorgerecht/Zugangsdokument nicht entfernen.
- Keine externen Runtime-Abhängigkeiten hinzufügen (Single-File-Prinzip).
