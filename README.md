# Digitaler Notfallordner

Eine eigenständige, **offline** laufende HTML-Anwendung, die Notfallinformationen für Familien
bündelt, lokal verschlüsselt und ausdruckbare Rechtsdokumente erzeugt. Alles steckt in einer
einzigen Datei: `index.html`.

## Schnellstart
1. `index.html` im Browser öffnen (Doppelklick genügt).
2. Daten eintragen – sie werden nur **lokal** gespeichert.
3. Optional Zugriffsschutz aktivieren (Verschlüsselung + Empfänger mit eigenen Passwörtern).

### Biometrie (Face ID / Fingerabdruck)
Funktioniert nur in einem sicheren Kontext (https oder localhost), nicht unter `file://`:
```bash
python3 -m http.server 8000
# Browser: http://localhost:8000
```

## Funktionen
- 13 Sektionen: Persönliches, Medizin, Zugänge, Tresor (PINs/Passwörter), Finanzen,
  Verträge/Vermögen (mit Foto-Scans & Live-Übersicht), Dokumente, digitales Erbe,
  Vollmachten, Sorgerechtsverfügung (§1782 BGB), Wünsche, QR-Schnellzugriff.
- Verschlüsselung: AES-256-GCM mit pro-Empfänger-Passwort (PBKDF2, 600k Iterationen),
  Master-Passwort für Admin-Aktionen, optional WebAuthn-Biometrie.
- Passwortgenerator nach aktuellem Standard (CSPRNG, unverzerrt, ~154 bit bei Länge 24).
- Offline-QR-Code-Generator, druckbare Dokumente (Vollmacht, Sorgerecht, Zugangsdokument),
  Gesamt-PDF-Export.
- Safe-Drehschloss zum schnellen Sperren/Entsperren der Dateneingabe (Sitzungssimulation).
- Helles, freundliches Design (Arctic Teal + Cloud Pearl).

## Tests
```bash
npm install jsdom --no-save
node tests/smoke.test.js
```

## Wichtiges
- Single-File-Prinzip: keine Runtime-Abhängigkeiten, kein Build.
- Details zu Architektur, Datenmodell und Fallstricken stehen in `CLAUDE.md`.
- Sicherheit: Passwortverlust = Datenverlust. Zugangsdokument versiegelt hinterlegen.
