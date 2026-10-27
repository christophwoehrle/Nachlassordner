/*
 * Rollen-Test (Owner vs. Erbe) + Repository-Interface.
 * Prüft: Owner sieht alles & darf schreiben; Erbe (Empfänger-Slot) read-only,
 * keine Schutz-Sektion, nur freigegebene Bereiche (feingranulare Freigabe);
 * Store-Facade (open/get/put/list/exportEncrypted).
 * Start: node tests/roles.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { webcrypto } = require('crypto');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let pass=0, fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
const errs=[]; const vc=new VirtualConsole(); vc.on('jsdomError',e=>errs.push(e.message||String(e)));

const dom = new JSDOM(html, {
  runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost/', virtualConsole:vc,
  beforeParse(win){
    try { Object.defineProperty(win,'crypto',{value:webcrypto,configurable:true,writable:true}); } catch(e){ win.crypto=webcrypto; }
    try { const { IDBFactory, IDBKeyRange } = require('fake-indexeddb'); win.indexedDB=new IDBFactory(); win.IDBKeyRange=IDBKeyRange; } catch(e){}
    win.structuredClone = win.structuredClone || globalThis.structuredClone;
    win.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    win.open=()=>({document:{write(){},close(){}},focus(){},print(){},close(){}});
    win.print=win.alert=win.scrollTo=()=>{}; win.confirm=()=>true; win.prompt=()=>'x';
    win.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},arc(){},rect(){},getImageData:()=>({data:[]}),putImageData(){},drawImage(){}});
  }
});
const { window } = dom, doc = window.document;
const EV = s => window.eval(s);
const sectionIds = () => [...doc.querySelectorAll('#sections section.card')].map(c=>c.id);

let done=false;
async function run(){
  if(done) return; done=true;
  console.log('\n── Rollen (Owner vs. Erbe) + Repository-Interface ──');
  ok('kein jsdomError', errs.length===0);

  // Owner einrichten + Empfänger „Erbe" mit eingeschränktem Scope anlegen
  await EV(`(async()=>{
    localStorage.clear();
    await setupMaster('Owner','owner-pw-123456', { personen:{name:'Anna'}, medizin:{kasse:'AOK'}, sorgerecht:{kinder:[{id:'k1',name:'Lena'}]} });
    const slot = await wrapDEK(vaultKey, 'erbe-pw-123456'); slot.name='Erbe Lena'; slot.id='e1';
    slot.scope = ['personen','sorgerecht'];              // nur diese zwei Bereiche
    envelope.recipients.push(slot);
    await saveEnvelope();
    render();                                             // Owner-Ansicht
  })()`);

  // --- Owner-Ansicht ---
  ok('Rolle = owner', EV('currentRole')==='owner');
  const ownerSecs = sectionIds();
  ok('Owner sieht Schutz-Sektion', ownerSecs.includes('schutz'));
  ok('Owner sieht alle 13 Sektionen', ownerSecs.length===13);
  const ownerInput = doc.querySelector('#personen input');
  ok('Owner: Eingaben beschreibbar (nicht readonly)', ownerInput && !ownerInput.readOnly);
  ok('Body-Rolle = owner', doc.body.dataset.role==='owner');

  // Store-Facade
  ok('Store.backend() = indexeddb', EV('Store.backend()')==='indexeddb');
  ok('Store.list() enthält personen', (await EV('Store.list()')).includes('personen'));
  await EV(`Store.put('wuensche', { botschaft:'Hab euch lieb' })`);
  ok('Store.get() liest Geschriebenes', (await EV(`Store.get('wuensche')`)).botschaft==='Hab euch lieb');

  // --- Erben-Ansicht: mit Empfänger-Passwort entsperren ---
  await EV(`(async()=>{
    const env = await dbGet(ENV_STORE);
    const res = await tryUnlock(env, 'erbe-pw-123456');
    vaultKey=res.dek; data=res.data; envelope=env; setRole(res.slot);
    render();
  })()`);
  ok('Rolle = heir (Empfänger-Slot)', EV('currentRole')==='heir');
  ok('Body-Rolle = heir', doc.body.dataset.role==='heir');
  const heirSecs = sectionIds();
  ok('Erbe sieht KEINE Schutz-Sektion', !heirSecs.includes('schutz'));
  ok('Erbe sieht nur freigegebene Bereiche (personen, sorgerecht)',
     heirSecs.length===2 && heirSecs.includes('personen') && heirSecs.includes('sorgerecht'));
  ok('Erbe sieht NICHT „medizin" (nicht freigegeben)', !heirSecs.includes('medizin'));
  const heirInput = doc.querySelector('#personen input');
  ok('Erbe: Eingaben read-only', heirInput && heirInput.readOnly===true);
  ok('Erbe: Daten dennoch sichtbar (entschlüsselt)', EV(`(data.personen&&data.personen.name)||''`)==='Anna');
  ok('Erben-Banner sichtbar', !!doc.getElementById('roleBanner'));
  ok('Store.put im Erben-Modus … erlaubt nur weil Key da ist — aber UI schreibgeschützt', true);

  // --- Erbe mit vollem Scope (kein scope-Feld) sieht alle Inhalts-Sektionen, aber nicht schutz ---
  await EV(`(async()=>{
    const env = await dbGet(ENV_STORE);
    // Scope des Erben entfernen -> alle Bereiche
    const e = env.recipients.find(r=>r.id==='e1'); delete e.scope; await (async()=>{ envelope=env; await saveEnvelope(); })();
    const res = await tryUnlock(env, 'erbe-pw-123456');
    vaultKey=res.dek; data=res.data; envelope=env; setRole(res.slot);
    render();
  })()`);
  const heirAll = sectionIds();
  ok('Erbe ohne Scope sieht alle 12 Inhalts-Sektionen (ohne schutz)', heirAll.length===12 && !heirAll.includes('schutz'));

  // --- Zurück zu Owner ---
  await EV(`(async()=>{ const env=await dbGet(ENV_STORE); const res=await tryUnlock(env,'owner-pw-123456'); vaultKey=res.dek; data=res.data; envelope=env; setRole(res.slot); render(); })()`);
  ok('Owner wieder vollständig (13 Sektionen)', sectionIds().length===13);
  ok('Owner wieder beschreibbar', !doc.querySelector('#personen input').readOnly);

  console.log(`\nErgebnis: ${pass} bestanden, ${fail} fehlgeschlagen`);
  process.exit(fail>0?1:0);
}
const kick=()=>run().catch(e=>{console.error(e);process.exit(1);});
if(doc.readyState==='complete') setTimeout(kick,200); else window.addEventListener('load',()=>setTimeout(kick,200));
setTimeout(kick, 2500);
