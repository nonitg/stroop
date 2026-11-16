// Builds qr/<key>.svg for every entry in qr-urls.json that has a URL, plus qr/index.js for the page.
import fs from 'node:fs';
import QRCode from 'qrcode';

const entries = JSON.parse(fs.readFileSync(new URL('./qr-urls.json', import.meta.url)));
const ready = [];
for (const e of entries) {
  if (!e.url) { console.log(`skip ${e.key} (no url yet)`); continue; }
  const svg = await QRCode.toString(e.url, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#141519', light: '#0000' } });
  fs.writeFileSync(new URL(`./qr/${e.key}.svg`, import.meta.url), svg);
  ready.push({ ...e, svg: `qr/${e.key}.svg` });
  console.log(`ok   ${e.key} -> ${e.url}`);
}
// A plain script (not a module) so trifold.html also works when opened straight from disk.
fs.writeFileSync(new URL('./qr/index.js', import.meta.url), `window.QR = ${JSON.stringify(ready, null, 2)};\n`);
