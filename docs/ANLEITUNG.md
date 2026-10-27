# Digitaler Nachlassordner — Kurzdokumentation

Single-File-Web-App (`index.html`), vollständig offline, Zero-Knowledge/E2EE. Kein Server,
keine Cloud, keine Runtime-Abhängigkeit. Entwickler-Infos in `CLAUDE.md`.

## Gewählte DB-Lösung
- **IndexedDB** als verschlüsselte Offline-Datenbank (Store `kv`, Key `notfallordner_env_v1`),
  mit automatischem **Fallback auf `localStorage`** (z. B. unter `file://` oder wenn IndexedDB
  fehlt). Gespeichert wird **ausschließlich der AES-256-GCM-Umschlag** – nie Klartext.
- Zugriff über eine austauschbare Repository-Facade `Store`
  (`open/get/put/delete/list/exportEncrypted/importEncrypted`, `backend()`), sodass später z. B.
  wa-sqlite/OPFS eingehängt werden könnte, ohne die UI zu ändern.
- Schlüsselableitung: PBKDF2-HMAC-SHA256, 600.000 Iterationen, per-Empfänger-Salt, AES-GCM mit
  zufälligem IV. (Argon2id wäre stärker, bräuchte aber inline-WASM; bewusst bei WebCrypto/PBKDF2
  geblieben, um Single-File/Offline nicht zu brechen.)

## Rollen (zwei Frontends in einer Datei)
Die Rolle ergibt sich aus dem Schlüssel-Slot, mit dem entsperrt wurde:
- **Owner** (`owner=true`): Vollzugriff – bearbeiten, Empfänger verwalten, Nachlass-Freigabe
  konfigurieren, Dokumente drucken.
- **Erbe** (Empfänger- oder Recovery-Slot): **nur Lesen**. Keine Schutz-/Verwaltungssektion,
  Eingaben schreibgeschützt, verwaltende Bedienelemente ausgeblendet.
- **Feingranulare Freigabe:** Der Owner legt je Empfänger fest, welche Bereiche sichtbar sind
  (z. B. Sorgerecht nur für die benannte Vormund-Person). Standard: alle Bereiche.
  *Hinweis:* Dies ist eine Anzeige-Einschränkung in der Erben-Ansicht; kryptografisch teilen sich
  alle Berechtigten einen Inhalts-Schlüssel. Für echte Trennung pro Person wären separate
  Sektions-Schlüssel nötig (mögliche Erweiterung).

## Posthum-Zugriff — welches Modell?
Der „Tod" ist in einem Offline-ZK-System nicht kryptografisch erkennbar. Umgesetzt sind die
offline/ZK-konformen Verfahren:
- **A) Versiegeltes Zugangsdokument** (`printAccessDoc`): Empfänger-Passwörter gedruckt und
  versiegelt beim Notar/Tresor hinterlegen; Freigabe gegen Sterbeurkunde/Erbschein.
- **B) Shamir Secret Sharing** (N=3, K=2): „Nachlass-Freigabe einrichten" erzeugt 3 druckbare
  Teile; **2 davon** genügen zum Öffnen, ein einzelnes ist nutzlos. Verteilung z. B. Notar +
  2 Angehörige. Entsperrung am Sperrbildschirm über „Mit Nachlass-Teilen entsperren".
- **C) Totmann-Schaltung:** bewusst **nicht** umgesetzt – bräuchte einen Online-Dienst und würde
  Offline/Zero-Knowledge brechen.

### Trade-offs
| Verfahren | Online nötig | Zero-Knowledge | Auslöser |
|---|---|---|---|
| A Versiegeltes Dokument | nein | ja | Notar gegen Sterbeurkunde |
| B Shamir K/N | nein | ja | Berechtigte führen K Teile zusammen |
| C Totmann-Schaltung | ja | nein | Ausbleibendes Lebenszeichen |

## Betriebsanleitung

### Owner (Einrichtung)
1. `index.html` öffnen → beim ersten Start **Master-Passwort** anlegen (Pflicht, keine Recovery
   über den Betreiber – sicher verwahren!).
2. Daten in den 13 Sektionen erfassen (Foto-Scans pro Vermögenseintrag möglich).
3. Unter **„Zugriffsschutz & Empfänger"**:
   - Empfänger (Erben) mit je eigenem, generiertem Passwort anlegen.
   - Je Empfänger **sichtbare Bereiche** festlegen (optional).
   - **„Nachlass-Freigabe einrichten"** → 3 Teile drucken und getrennt verwahren.
   - **„Zugangsdokument drucken"** → versiegeln und hinterlegen.

### Erbe (Zugriff nach dem Ableben)
- **Mit eigenem Passwort:** `index.html` öffnen → Passwort eingeben → schreibgeschützte Ansicht
  der freigegebenen Bereiche.
- **Über Shamir-Teile:** Am Sperrbildschirm „Mit Nachlass-Teilen entsperren" → mind. 2 Teile
  (von den Vertrauenspersonen) einfügen → Ordner öffnet sich schreibgeschützt.

### Notar / Vertrauensperson
- Verwahrt ein versiegeltes Zugangsdokument und/oder ein Shamir-Teil.
- Gibt es nach Vorlage der Sterbeurkunde/des Erbscheins an die Berechtigten heraus bzw. führt mit
  den weiteren Teil-Inhabern die Rekonstruktion durch.

## Tests
`npm install jsdom fake-indexeddb --no-save && npm test` baut die Demo und fährt die Suiten
smoke / crypto / roles / demo (zusammen 100+ Checks): Rendering & Sektionen, ZK-Audit (kein
Klartext at-rest, Envelope nur in IndexedDB), Krypto-Roundtrip, Shamir (K/N), Rollen (Owner vs.
Erbe, feingranulare Freigabe) und die verschlüsselte Demo.

> Dies ist Software-Dokumentation, keine Rechtsberatung. Form-/Rechtshinweise in Vollmacht,
> Sorgerechtsverfügung (§ 1782 BGB) und Zugangsdokument sind zu beachten.
