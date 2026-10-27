/*
 * Krypto-Roundtrip-Test (Zero-Knowledge / E2EE).
 * Lädt index.html mit echter Web-Crypto und prüft die Envelope-Verschlüsselung:
 *  - genDEK / encryptContent / decryptContent Roundtrip
 *  - Owner-Setup (setupMaster): nichts im Klartext, Envelope in ENV_STORE
 *  - mehrere Empfänger, jeder mit eigenem Passwort
 *  - falsches Passwort -> kein Zugriff (tryUnlock == null)
 *  - Empfänger entfernen -> dessen Passwort öffnet nicht mehr
 *  - Re-Encrypt-Performance < 50 ms, Unlock (PBKDF2) im 100-ms-Bereich
 *
 * Start:  node tests/crypto.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { webcrypto } = require('crypto');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

const vc = new VirtualConsole();
const errs = [];
vc.on('jsdomError', e => errs.push(e.message || String(e)));

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc,
  beforeParse(win) {
    try { Object.defineProperty(win, 'crypto', { value: webcrypto, configurable: true, writable: true }); }
    catch (e) { win.crypto = webcrypto; }
    win.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
    win.open = () => ({ document: { write(){}, close(){} }, focus(){}, print(){}, close(){} });
    win.print = win.alert = win.scrollTo = () => {};
    win.confirm = () => true; win.prompt = () => 'x';
    win.HTMLCanvasElement.prototype.getContext = () => ({ fillRect(){}, clearRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, fill(){}, arc(){}, rect(){}, getImageData: () => ({ data: [] }), putImageData(){}, drawImage(){} });
  }
});
const { window } = dom;
const EV = s => window.eval(s);

let done = false;
async function run() {
  if (done) return; done = true;
  console.log('\n── Krypto-Roundtrip (Zero-Knowledge) ──');
  ok('kein jsdomError beim Laden', errs.length === 0);

  // 1) Primitiv-Roundtrip
  const rt = await EV(`(async()=>{
    const dek = await genDEK();
    const secret = { geheim: "LBS 12345678", pin: "4711", nested:{a:[1,2,3]} };
    const content = await encryptContent(dek, secret);
    const back = await decryptContent(dek, content);
    return { ok: JSON.stringify(back)===JSON.stringify(secret), hasIv: !!content.iv, hasCt: !!content.ct, ctIsCipher: !content.ct.includes("12345678") };
  })()`);
  ok('encrypt/decrypt Roundtrip identisch', rt.ok);
  ok('Ciphertext enthält iv + ct', rt.hasIv && rt.hasCt);
  ok('Ciphertext ist kein Klartext', rt.ctIsCipher);

  // 2) Owner-Setup: Zero-Knowledge at-rest
  const setup = await EV(`(async()=>{
    localStorage.clear();
    await setupMaster("Anna Owner", "owner-passwort-123", { personen:{ name:"Anna" }, tresor:{ items:[{type:"pin",vals:{pin:"4711"}}] } });
    const env = JSON.parse(localStorage.getItem("notfallordner_env_v1"));
    return {
      noPlain: !localStorage.getItem("notfallordner_v1"),
      hasEnv: !!env,
      recip1: env.recipients.length===1,
      ownerFlag: !!env.recipients[0].owner,
      hasSalt: !!env.recipients[0].salt,
      hasIter: env.recipients[0].iter>=600000,
      ctNoName: !env.content.ct.includes("Anna"),
      noRawData: env.data===undefined
    };
  })()`);
  ok('Setup: kein Klartext at-rest', setup.noPlain);
  ok('Setup: Envelope vorhanden', setup.hasEnv);
  ok('Setup: genau 1 Owner-Slot', setup.recip1 && setup.ownerFlag);
  ok('Setup: PBKDF2-Salt + iter>=600k', setup.hasSalt && setup.hasIter);
  ok('Setup: Inhalt nur als Ciphertext (kein Klarname)', setup.ctNoName);
  ok('Setup: keine rohen Daten im Envelope', setup.noRawData);

  // 3) Mehrere Empfänger + falsches Passwort + Entfernen
  const multi = await EV(`(async()=>{
    const env = JSON.parse(localStorage.getItem("notfallordner_env_v1"));
    // zweiten Empfänger mit eigenem Passwort hinzufügen (Owner-DEK wrappen)
    const dek = await unwrapDEK(env.recipients[0], "owner-passwort-123");
    const slotB = await wrapDEK(dek, "empfaenger-B-pw-456"); slotB.name="Empfänger B"; slotB.id="b1";
    env.recipients.push(slotB);

    const okOwner = await tryUnlock(env, "owner-passwort-123");
    const okB     = await tryUnlock(env, "empfaenger-B-pw-456");
    const wrong   = await tryUnlock(env, "falsches-passwort");

    // Empfänger B entfernen
    env.recipients = env.recipients.filter(r=>r.id!=="b1");
    const bAfterRemoval = await tryUnlock(env, "empfaenger-B-pw-456");
    const ownerStill    = await tryUnlock(env, "owner-passwort-123");

    return {
      ownerData: okOwner && okOwner.data && okOwner.data.personen && okOwner.data.personen.name==="Anna",
      bData: okB && okB.data && okB.data.tresor && okB.data.tresor.items[0].vals.pin==="4711",
      wrongNull: wrong===null,
      bRemoved: bAfterRemoval===null,
      ownerStill: !!ownerStill
    };
  })()`);
  ok('Owner entsperrt & liest Klartext', multi.ownerData);
  ok('Empfänger B (eigenes Passwort) entsperrt', multi.bData);
  ok('Falsches Passwort → kein Zugriff (null)', multi.wrongNull);
  ok('Entfernter Empfänger → kein Zugriff mehr', multi.bRemoved);
  ok('Owner behält Zugriff nach Entfernen', multi.ownerStill);

  // 4) Performance
  const perf = await EV(`(async()=>{
    const env = JSON.parse(localStorage.getItem("notfallordner_env_v1"));
    const dek = await unwrapDEK(env.recipients[0], "owner-passwort-123");
    const big = {}; for(let i=0;i<50;i++) big["k"+i] = { _rows:[{a:"x".repeat(200)}] };
    const t0 = Date.now(); await encryptContent(dek, big); const encMs = Date.now()-t0;
    const t1 = Date.now(); await unwrapDEK(env.recipients[0], "owner-passwort-123"); const unlockMs = Date.now()-t1;
    return { encMs, unlockMs };
  })()`);
  ok('Re-Encrypt < 50 ms (war ' + perf.encMs + ' ms)', perf.encMs < 50);
  ok('Unlock/PBKDF2 messbar > 20 ms (war ' + perf.unlockMs + ' ms)', perf.unlockMs > 20);

  // 5) Shamir Secret Sharing (Nachlass-Freigabe, 3 Teile, K=2)
  console.log('\n── Shamir Secret Sharing (Nachlass-Freigabe) ──');
  const sss = await EV(`(async()=>{
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const shares = SSS.split(secret, 3, 2).map(SSS.encode);
    const hx = u => [...u].map(b=>b.toString(16).padStart(2,'0')).join('');
    const eq = (a,b)=> hx(a)===hx(b);
    // je 2 von 3 Kombinationen rekonstruieren korrekt
    const c12 = SSS.combine([SSS.decode(shares[0]), SSS.decode(shares[1])]);
    const c13 = SSS.combine([SSS.decode(shares[0]), SSS.decode(shares[2])]);
    const c23 = SSS.combine([SSS.decode(shares[1]), SSS.decode(shares[2])]);
    // 1 Teil allein: darf NICHT das Secret ergeben
    const one = SSS.decode(shares[0]).y;
    return { count: shares.length,
      k2ok: eq(c12,secret) && eq(c13,secret) && eq(c23,secret),
      oneWrong: !eq(one, secret),
      shareLen: shares[0].length };
  })()`);
  ok('3 Teile erzeugt', sss.count === 3);
  ok('Je 2 Teile rekonstruieren das Secret', sss.k2ok);
  ok('1 Teil allein gibt das Secret NICHT preis', sss.oneWrong);

  const rec = await EV(`(async()=>{
    // frischer Owner-Setup, dann Nachlass-Freigabe erzeugen
    localStorage.clear(); envelope=null; vaultKey=null;
    await setupMaster("Owner","owner-pw-123456", { personen:{ name:"Anna" } });
    const shares = await createRecoveryShares();   // 3 Teile, Recovery-Slot im Envelope
    const env = await dbGet(ENV_STORE);
    const hasRecSlot = env.recipients.some(r=>r.recovery);
    // Mit 2 Teilen entsperren
    const ok2 = await unlockWithShares(env, [shares[0], shares[1]]);
    const ok2b = await unlockWithShares(env, [shares[1], shares[2]]);
    // Mit 1 Teil -> Fehler (unter Schwellwert)
    let under=false; try{ await unlockWithShares(env, [shares[0]]); }catch(e){ under=true; }
    // Mit 2 FALSCHEN (vertauschten Bytes) Teilen -> kein Zugriff
    const bad = shares.slice(0,2).map(s=>{ const p=s.split('-'); return p[0]+'-'+p[1].split('').reverse().join(''); });
    const badRes = await unlockWithShares(env, bad);
    return {
      hasRecSlot,
      unlock2: !!(ok2 && ok2.data && ok2.data.personen.name==="Anna"),
      unlock2b: !!(ok2b && ok2b.data),
      underThreshold: under,
      badNull: badRes===null
    };
  })()`);
  ok('Recovery-Slot im Envelope angelegt', rec.hasRecSlot);
  ok('2 Teile entsperren den Ordner (Klartext lesbar)', rec.unlock2 && rec.unlock2b);
  ok('< K Teile -> Fehler (kein Zugriff)', rec.underThreshold);
  ok('Falsche Teile -> kein Zugriff (null)', rec.badNull);

  console.log(`\nErgebnis: ${pass} bestanden, ${fail} fehlgeschlagen`);
  process.exit(fail > 0 ? 1 : 0);
}
const kick = () => run().catch(e => { console.error(e); process.exit(1); });
if (window.document.readyState === 'complete') kick();
else window.addEventListener('load', kick);
setTimeout(kick, 1800);
