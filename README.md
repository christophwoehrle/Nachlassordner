# Digitaler Notfallordner

Eine eigenständige, **offline** laufende HTML-Anwendung, die Notfallinformationen für Familien
bündelt, lokal verschlüsselt und ausdruckbare Rechtsdokumente erzeugt. Alles steckt in einer
einzigen Datei: `index.html`.

## Schnellstart
1. `index.html` im Browser öffnen (Doppelklick genügt).
2. Beim ersten Start ein **Master-Passwort** anlegen (Pflicht – Zero-Knowledge, kein Klartext).
3. Daten eintragen – sie werden **ausschließlich Ende-zu-Ende-verschlüsselt und nur lokal**
   gespeichert. Optional weitere Empfänger mit eigenen Passwörtern hinzufügen.

## Zero-Knowledge / Ende-zu-Ende-Verschlüsselung
- **Kein Klartext at-rest:** Alles wird mit AES-256-GCM verschlüsselt in `localStorage` abgelegt;
  der Schlüssel existiert nur im Speicher nach dem Entsperren. Es gibt keinen unverschlüsselten Modus.
- **Kein Server, keine Cloud:** rein clientseitig, funktioniert offline und via `file://`.
- **Keine Recovery:** Ohne Master-Passwort sind die Daten unwiederbringlich verloren – bewusst so.
  Master-Passwort sicher verwahren (z. B. versiegelt beim Notar).

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
