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

  console.log(`\nErgebnis: ${pass} bestanden, ${fail} fehlgeschlagen`);
  process.exit(fail > 0 ? 1 : 0);
}
const kick = () => run().catch(e => { console.error(e); process.exit(1); });
if (window.document.readyState === 'complete') kick();
else window.addEventListener('load', kick);
setTimeout(kick, 1800);
