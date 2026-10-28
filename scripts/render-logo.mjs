import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDirectory = new URL('../src/frontend/public/', import.meta.url);
const logo = await readFile(new URL('puttential-logo.svg', publicDirectory), 'utf8');

await sharp(Buffer.from(logo))
  .resize(1200, 264)
  .png()
  .toFile(fileURLToPath(new URL('puttential-logo.png', publicDirectory)));
await writeFile(
  new URL('puttential-logo-reversed.svg', publicDirectory),
  logo.replaceAll('#2e7d32', '#f8f9f4').replaceAll('#2d3a3a', '#f8f9f4'),
);
await writeFile(
  new URL('puttential-logo-mono.svg', publicDirectory),
  logo.replaceAll('#2e7d32', '#2d3a3a'),
);
console.log('Rendered PNG, monochrome and reversed logo exports.');
