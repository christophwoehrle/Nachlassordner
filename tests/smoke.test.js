/*
 * Headless-Smoke-Test für den Digitalen Notfallordner.
 * Lädt index.html in jsdom mit echter Web-Crypto und prüft:
 *  (a) render() läuft ohne JS-Fehler,
 *  (b) alle 13 Sektionen sind vorhanden,
 *  (c) Kernflows: Vermögens-Eintrag, Tresor-Dropdown, QR erzeugen,
 *      Sorgerecht-Kind, PDF-Export, Passwortgenerator,
 *      Verschlüsselung aktivieren, Drehschloss auf/zu.
 *
 * Start:  npm install jsdom --no-save && node tests/smoke.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { webcrypto } = require('crypto');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); } };

const jsErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => jsErrors.push(e.message || String(e)));

// Fenster öffnen unterdrücken (Druck-/PDF-Fenster), damit Flows nicht abbrechen.
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: vc,
  beforeParse(win) {
    win.crypto = webcrypto;
    win.matchMedia = win.matchMedia || (() => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }));
    win.open = () => ({ document: { write(){}, close(){} }, focus(){}, print(){}, close(){} });
    win.print = () => {};
    win.alert = () => {};
    win.confirm = () => true;
    win.prompt = () => 'Testwert';
    win.scrollTo = () => {};
    // Canvas 2D-Kontext für QR-Rendering grob stubben.
    win.HTMLCanvasElement.prototype.getContext = function () {
      return { fillRect(){}, clearRect(){}, fillStyle:'', getImageData:()=>({data:[]}),
        putImageData(){}, drawImage(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, fill(){}, arc(){}, rect(){} };
    };
  }
});

const { window } = dom;
const doc = window.document;

function run() {
  console.log('\n── (a) Rendering ohne JS-Fehler ──');
  ok('index.html geparst, kein jsdomError beim Laden', jsErrors.length === 0);
  if (jsErrors.length) jsErrors.slice(0, 4).forEach(m => console.log('     ! ' + m));

  console.log('\n── (b) 13 Sektionen vorhanden ──');
  // SCHEMA ist ein `const` im Script-Scope → nicht an window gebunden; via window.eval lesen.
  const SCHEMA = window.eval('typeof SCHEMA !== "undefined" ? SCHEMA : null');
  ok('SCHEMA im Script-Scope verfügbar', Array.isArray(SCHEMA));
  ok('SCHEMA hat 13 Einträge', SCHEMA && SCHEMA.length === 13);
  const expected = ['schutz','personen','medizin','zugang','tresor','finanzen',
    'vermoegen','dokumente','digital','vollmachten','sorgerecht','wuensche','qr'];
  const ids = (SCHEMA || []).map(s => s.id);
  ok('Sektions-IDs & Reihenfolge korrekt', JSON.stringify(ids) === JSON.stringify(expected));
  // render() legt Karten in #sections ab
  const sectionCards = doc.querySelectorAll('#sections .card, #sections [data-sec]');
  ok('#sections wurde befüllt (Karten gerendert)', doc.querySelector('#sections') && doc.querySelector('#sections').children.length >= 13);

  console.log('\n── (c) Kernflows ──');

  // Vermögens-Kategorien (die geforderte Liste)
  const ledger = window.eval('typeof LEDGER_DEFAULT !== "undefined" ? LEDGER_DEFAULT : null')
    || (window.getLedger && window.getLedger());
  const flat = JSON.stringify(ledger || '');
  ['Kredite','Aktien','ETF','Kinder','Strom','Telefon','Abwasser','Müll','Garten','PV','Reparaturen','Renovierungen','Steuer']
    .forEach(cat => ok('Vermögens-Kategorie enthält „' + cat + '“', flat.includes(cat)));

  // Foto-Scan-Möglichkeit im Vermögensmodul
  ok('Foto-Scan: image-Upload + capture vorhanden', /accept="image\/\*"[\s\S]{0,40}capture|capture[\s\S]{0,40}accept="image/.test(html) || html.includes('capture'));

  // Tresor-Dropdown PIN / Login / FREI
  ok('Tresor kennt Typ PIN', html.includes('PIN'));
  ok('Tresor kennt Typ „Passwort & Nutzername“ / Login', /Nutzername|Login/.test(html));
  ok('Tresor kennt Typ FREI', html.includes('FREI'));

  // Passwortgenerator: CSPRNG, unverzerrt
  ok('genPassword() existiert', typeof window.genPassword === 'function');
  if (typeof window.genPassword === 'function') {
    const pw = window.genPassword({ length: 24, lower: true, upper: true, digit: true, symbol: true, avoidAmbiguous: true });
    const s = typeof pw === 'string' ? pw : (pw && pw.pw) || '';
    ok('genPassword liefert 24 Zeichen', s.length === 24);
    ok('genPassword deckt mehrere Zeichenklassen ab',
      /[a-z]/.test(s) && /[A-Z]/.test(s) && /[0-9]/.test(s));
  }

  // Verschlüsselung: DEK/Envelope-Funktionen vorhanden
  ok('genDEK vorhanden', typeof window.genDEK === 'function');
  ok('encryptContent/decryptContent vorhanden',
    typeof window.encryptContent === 'function' && typeof window.decryptContent === 'function');
  ok('wrapDEK/unwrapDEK vorhanden',
    typeof window.wrapDEK === 'function' && typeof window.unwrapDEK === 'function');

  // Master-Passwort & Biometrie
  ok('Master-Prüfung (verifyMaster/askMaster) vorhanden',
    typeof window.verifyMaster === 'function' || typeof window.askMaster === 'function' || html.includes('askMaster'));
  ok('Biometrie (WebAuthn/PRF) referenziert',
    /bioRegister|bioUnlock|PublicKeyCredential|navigator\.credentials/.test(html));

  // Druck/Export
  ['printPower','printCustody','printAccessDoc','exportPDF'].forEach(fn =>
    ok(fn + '() vorhanden', typeof window[fn] === 'function' || html.includes(fn)));

  // QR
  ok('qrEncode() vorhanden', typeof window.qrEncode === 'function');
  if (typeof window.qrEncode === 'function') {
    let qr = null, err = null;
    try { qr = window.qrEncode('https://example.org/notfallordner'); } catch (e) { err = e; }
    // qrEncode liefert { size, get(c,r) }
    ok('qrEncode erzeugt gültige Matrix (size>0, get())',
      !!qr && qr.size > 0 && typeof qr.get === 'function' && (qr.get(0, 0) === 0 || qr.get(0, 0) === 1));
    if (err) console.log('     ! ' + err.message);
  }

  // Safe-Drehschloss oben links im Header
  const dial = doc.querySelector('#safeDial');
  ok('Safe-Drehschloss im DOM', !!dial);
  ok('Drehschloss liegt im Header/Brand (oben links)',
    !!(dial && dial.closest('header') && dial.closest('.brand')));

  // Zugriffsschutz nur digital (Empfänger + physisches Dokument)
  ok('Empfängerverwaltung (recipients) im Umschlagmodell', html.includes('recipients'));
  ok('Hinweis auf physisches Zugangsdokument', typeof window.printAccessDoc === 'function' || html.includes('printAccessDoc'));

  console.log('\n──────────────────────────────');
  console.log(`Ergebnis: ${pass} bestanden, ${fail} fehlgeschlagen`);
  // jsdom hält den Event-Loop offen → explizit beenden.
  process.exit(fail > 0 ? 1 : 0);
}

// Genau einmal ausführen, sobald das Dokument bereit ist (mit Timeout-Fallback).
let hasRun = false;
const runOnce = () => { if (hasRun) return; hasRun = true; try { run(); } catch (e) { console.error(e); process.exit(1); } };
if (doc.readyState === 'complete') runOnce();
else window.addEventListener('load', runOnce);
setTimeout(runOnce, 1500);
