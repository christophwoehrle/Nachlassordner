#!/usr/bin/env node
/*
 * Baut index-demo.html aus index.html + tools/demo-bootstrap.html.
 * Der Demo-Bootstrap wird direkt nach dem <body> eingefügt (vor dem Haupt-Script,
 * damit window.__demoStart existiert, wenn boot() es aufruft). Zero-Knowledge:
 * der Bootstrap legt beim Erststart einen verschlüsselten Envelope mit Demo-Passwort
 * an und entsperrt bei Reload automatisch – kein Klartext at-rest.
 *
 * Start:  node tools/build_demo.js
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const SRC = path.join(root, 'index.html');
const BOOT = path.join(__dirname, 'demo-bootstrap.html');
const OUT = path.join(root, 'index-demo.html');

const html = fs.readFileSync(SRC, 'utf8');
const bootstrap = fs.readFileSync(BOOT, 'utf8').trimEnd() + '\n';

const marker = '<body>\n';
const idx = html.indexOf(marker);
if (idx === -1) { console.error('reales <body> nicht gefunden'); process.exit(1); }
const at = idx + marker.length;
const out = html.slice(0, at) + bootstrap + html.slice(at);

fs.writeFileSync(OUT, out);
console.log('geschrieben:', OUT, '(' + out.length + ' bytes)');
