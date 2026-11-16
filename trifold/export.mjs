// Renders trifold.html into the print files and checks every QR code on the board decodes to its URL.
//   stroop-trifold-sheets.pdf  16 letter-landscape pages to print
//   assembly-guide.pdf         1 letter page: map + steps (don't glue)
//   board-preview.png          the assembled board, for a quick look
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

const here = (p) => new URL(p, import.meta.url);
const page = pathToFileURL(new URL('./trifold.html', import.meta.url).pathname).href;
const exe = process.env.CHROME_PATH ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const browser = await chromium.launch({ executablePath: exe, args: ['--allow-file-access-from-files'] });
const open = async (query, opts = {}) => {
  const p = await browser.newPage(opts);
  await p.goto(page + query, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  return p;
};

// Print sheets
let p = await open('');
await p.pdf({ path: here('./stroop-trifold-sheets.pdf').pathname, width: '11in', height: '8.5in', printBackground: true, preferCSSPageSize: true });
const pages = await p.locator('.sheet').count();
console.log(`sheets pdf: ${pages} pages`);

// Overflow check: nothing may spill out of its card
const spills = await p.evaluate(() => [...document.querySelectorAll('.card')].flatMap((card) => {
  const c = card.getBoundingClientRect();
  return [...card.querySelectorAll('*')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width && (r.right > c.right + 1 || r.bottom > c.bottom + 1 || r.left < c.left - 1 || r.top < c.top - 1)
      && !el.closest('[data-bleed]');
  }).map((el) => `${card.parentElement.dataset.id}: <${el.tagName.toLowerCase()}> ${el.textContent.trim().slice(0, 40)}`);
}));
// The phone on C4 deliberately runs off the bottom of its card.
const real = spills.filter((s) => !s.startsWith('C4:'));
console.log(real.length ? `OVERFLOW:\n  ${real.join('\n  ')}` : 'overflow: none');

// QR decode check on a high-res render of the QR sheet
const qrs = JSON.parse(fs.readFileSync(here('./qr-urls.json'))).filter((q) => q.url);
await p.setViewportSize({ width: 1056, height: 816 });
const shot = await p.locator('.sheet[data-id="C8"]').screenshot({ scale: 'device' });
const imgs = await p.locator('#qr-row img').all();
let bad = 0;
for (const [i, img] of imgs.entries()) {
  const png = PNG.sync.read(await img.screenshot());
  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  const ok = code?.data === qrs[i].url;
  if (!ok) bad++;
  console.log(`qr ${qrs[i].key}: ${ok ? 'decodes' : 'FAILED'} ${code?.data ?? ''}`);
}
await p.close();

// Assembly guide
p = await open('?mode=guide');
await p.pdf({ path: here('./assembly-guide.pdf').pathname, width: '8.5in', height: '11in', printBackground: true });
await p.close();
console.log('guide pdf: done');

// Board preview
p = await open('?mode=board', { viewport: { width: 1920, height: 1440 }, deviceScaleFactor: 1 });
await p.screenshot({ path: here('./board-preview.png').pathname });
await p.close();
console.log('board preview: done');

await browser.close();
if (bad || real.length) process.exit(1);
