/*
 * Demo-Verifikation (Zero-Knowledge + IndexedDB).
 * Lädt index-demo.html; der Demo-Bootstrap legt beim Erststart einen
 * verschlüsselten Envelope an und entsperrt automatisch.
 * Start:  node tests/demo.test.js   (benötigt index-demo.html; via tools/build_demo.js bauen)
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { webcrypto } = require('crypto');

const file = path.join(__dirname, '..', 'index-demo.html');
if (!fs.existsSync(file)) { console.error('index-demo.html fehlt – zuerst: node tools/build_demo.js'); process.exit(1); }
const html = fs.readFileSync(file, 'utf8');

const errs = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errs.push(e.message || String(e)));

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc,
  beforeParse(win){
    try { Object.defineProperty(win, 'crypto', { value: webcrypto, configurable: true, writable: true }); }
    catch (e) { win.crypto = webcrypto; }
    try { const { IDBFactory, IDBKeyRange } = require('fake-indexeddb'); win.indexedDB = new IDBFactory(); win.IDBKeyRange = IDBKeyRange; } catch (e) {}
    win.structuredClone = win.structuredClone || globalThis.structuredClone;
    win.matchMedia = () => ({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    win.open = () => ({document:{write(){},close(){}},focus(){},print(){},close(){}});
    win.print = win.alert = win.scrollTo = () => {};
    win.confirm = () => true; win.prompt = () => 'x';
    win.HTMLCanvasElement.prototype.getContext = () => ({fillRect(){},clearRect(){},fillStyle:'',getImageData:()=>({data:[]}),putImageData(){},drawImage(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},arc(){},rect(){}});
  }
});
const { window } = dom; const doc = window.document;
let pass=0, fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

let done=false;
async function run(){
  if(done) return; done=true;
  console.log('\n── Demo-Verifikation (Zero-Knowledge + IndexedDB) ──');
  ok('kein jsdomError', errs.length===0);
  if(errs.length) errs.slice(0,4).forEach(m=>console.log('     ! '+m));

  // ZK: kein Klartext, Envelope liegt in IndexedDB (nicht localStorage)
  ok('Kein Klartext at-rest (notfallordner_v1 leer)', !window.localStorage.getItem('notfallordner_v1'));
  ok('Kein Envelope im localStorage', !window.localStorage.getItem('notfallordner_env_v1'));
  const env = await window.eval('dbGet(ENV_STORE)');
  ok('Verschlüsselter Envelope in IndexedDB', !!env && !!env.content && !!env.content.iv && !!env.content.ct);
  ok('Envelope: Owner-Slot mit Salt', env && env.recipients && env.recipients[0] && env.recipients[0].owner && env.recipients[0].salt);
  ok('Envelope enthält keinen Klarnamen „Musterfrau"', env && !env.content.ct.includes('Musterfrau'));

  // Auto-Unlock
  const data = window.eval('typeof data!=="undefined"?data:null');
  ok('Auto-Unlock: vaultKey gesetzt', !!window.eval('typeof vaultKey!=="undefined" && !!vaultKey'));
  ok('Personen-Name entschlüsselt (Anna Musterfrau)', data && data.personen && data.personen.name==='Anna Musterfrau');

  const groups = data && data.vermoegen && data.vermoegen.groups;
  let lbs=null, total=0, scans=0, empty=0;
  (groups||[]).forEach(g=>g.cats.forEach(c=>{ total+=c.entries.length; if(!c.entries.length) empty++; c.entries.forEach(e=>{ if(e.nummer==='12345678') lbs=e; if(e.scan) scans++; }); }));
  ok('LBS-Eintrag (12345678) + Foto-Scan', !!lbs && !!lbs.scan && lbs.scan.startsWith('data:image/svg+xml'));
  ok('Keine leeren Vermögens-Kategorien', empty===0);
  ok('Zwei Foto-Scans', scans===2);
  ok('Tresor: 5 Einträge', data && data.tresor && data.tresor.items && data.tresor.items.length===5);
  ok('Sorgerecht: 2 Kinder', data && data.sorgerecht && data.sorgerecht.kinder && data.sorgerecht.kinder.length===2);
  ok('2 Vollmachten', data && data.vollmachten && data.vollmachten._rows && data.vollmachten._rows.length===2);

  const sectionsEl = doc.querySelector('#sections');
  ok('#sections gerendert (>=13)', sectionsEl && sectionsEl.children.length>=13);
  const inputVals = sectionsEl ? [...sectionsEl.querySelectorAll('input')].map(i=>i.value) : [];
  ok('LBS als Eingabewert gerendert', inputVals.some(v=>v.includes('LBS Bausparvertrag')) && inputVals.includes('12345678'));
  ok('Demo-Banner vorhanden', !!doc.getElementById('demoBanner'));
  ok('Kein Setup-Overlay (Demo entsperrt)', !doc.getElementById('setupGate'));

  console.log(`\nErgebnis: ${pass} bestanden, ${fail} fehlgeschlagen`);
  process.exit(fail>0?1:0);
}
if(doc.readyState==='complete') setTimeout(run,2500); else window.addEventListener('load',()=>setTimeout(run,2500));
setTimeout(run, 3500);
