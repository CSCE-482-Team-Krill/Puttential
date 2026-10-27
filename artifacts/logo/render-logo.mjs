import { readFile, writeFile, copyFile } from 'node:fs/promises';
import sharp from 'sharp';

const publicDirectory = new URL('../../src/frontend/public/', import.meta.url);
const logo = await readFile(new URL('puttential-logo.svg', publicDirectory), 'utf8');
const symbol = await readFile(new URL('puttential-mark.svg', publicDirectory), 'utf8');
const icon = await readFile(new URL('../../src/frontend/app/icon.svg', import.meta.url), 'utf8');
const data = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const image = (svg, x, y, width, height) =>
  `<image href="${data(svg)}" x="${x}" y="${y}" width="${width}" height="${height}"/>`;
const label = (text, x, y, fill = '#566768') =>
  `<text x="${x}" y="${y}" fill="${fill}" font-family="Arial, sans-serif" font-size="13">${text}</text>`;
try {
  await copyFile(
    new URL('puttential-logo.png', publicDirectory),
    new URL('before-logo.png', import.meta.url),
    1,
  );
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
await sharp(Buffer.from(logo))
  .resize(1200, 264)
  .png()
  .toFile(new URL('puttential-logo.png', publicDirectory).pathname.replace(/^\/([A-Z]:)/, '$1'));
const reverse = logo.replaceAll('#2e7d32', '#f8f9f4').replaceAll('#2d3a3a', '#f8f9f4');
const mono = logo.replaceAll('#2e7d32', '#2d3a3a');
await writeFile(new URL('puttential-logo-reversed.svg', publicDirectory), reverse);
await writeFile(new URL('puttential-logo-mono.svg', publicDirectory), mono);
await sharp(Buffer.from(logo))
  .resize(800, 176)
  .flatten({ background: '#f8f9f4' })
  .png()
  .toFile(new URL('logo-preview.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const wordmark = logo.match(/<path fill="#2d3a3a"[^>]+\/>/)[0];
const direction = (symbolMarkup) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="44" viewBox="0 0 200 44">${symbolMarkup}${wordmark}</svg>`;
const typeOnly = direction('').replace('viewBox="0 0 200 44"', 'viewBox="43 0 157 44"');
const flag = direction(
  '<path d="M24 33V8l12 6-12 6" fill="none" stroke="#2e7d32" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="11" cy="31" r="4" fill="#2e7d32"/>',
);
const directions = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="610">
<rect width="1100" height="610" fill="#f8f9f4"/>
${label('PUTTENTIAL / THREE DIRECTIONS', 44, 42)}
${label('01  Wordmark and ball', 44, 100)}
${image(typeOnly, 40, 120, 315, 88)}<circle cx="364" cy="178" r="5" fill="#2e7d32"/>
${label('Calm and readable; weaker as a standalone symbol.', 540, 163)}
<path d="M44 225h1012" stroke="#cdd8cc"/>
${label('02  Flag and ball', 44, 268)}
${image(flag, 44, 286, 400, 88)}
${label('Familiar golf shorthand; resembles a course-control icon.', 540, 331)}
<path d="M44 398h1012" stroke="#cdd8cc"/>
<rect x="28" y="426" width="1044" height="154" rx="12" fill="#dff3d9"/>
${label('03  Open P and ball / SELECTED', 44, 458)}
${image(logo, 44, 476, 400, 88)}
${label('A name initial and putting path in a compact silhouette.', 540, 520)}
</svg>`;
await writeFile(new URL('logo-directions.svg', import.meta.url), directions);
await sharp(Buffer.from(directions))
  .png()
  .toFile(new URL('logo-directions.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const proof = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
<rect width="1200" height="720" fill="#f8f9f4"/>
${label('PUTTENTIAL / IDENTITY STUDY', 52, 45)}
${image(logo, 52, 90, 620, 136.4)}
${label('A putting path, an open P, and one ball. Two flat colors. Outlined lettering.', 52, 266)}
<path d="M52 302h1096" stroke="#cdd8cc"/>
${label('ON THE WEBSITE', 52, 340)}
<rect x="52" y="364" width="520" height="106" rx="12" fill="#dff3d9"/>
${image(logo, 80, 394, 200, 44)}
${label('ONE COLOR', 628, 340)}
${image(mono, 628, 394, 200, 44)}
<rect x="52" y="506" width="520" height="160" rx="12" fill="#2d3a3a"/>
${label('REVERSED', 80, 539, '#dff3d9')}
${image(reverse, 80, 566, 280, 61.6)}
${label('SYMBOL / SMALL SIZES', 628, 538)}
${image(symbol, 628, 558, 58, 63.8)}
${image(icon, 728, 574, 48, 48)}
${image(icon, 818, 590, 32, 32)}
${image(icon, 888, 598, 24, 24)}
${image(icon, 950, 606, 16, 16)}
${label('48', 743, 647)}${label('32', 825, 647)}${label('24', 892, 647)}${label('16', 951, 647)}
</svg>`;
await writeFile(new URL('logo-proof.svg', import.meta.url), proof);
await sharp(Buffer.from(proof))
  .png()
  .toFile(new URL('logo-proof.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
console.log('Rendered PNG fallback, monochrome/reversed vectors, and logo proof.');
