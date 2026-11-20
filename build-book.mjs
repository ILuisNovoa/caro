import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

// Existing files remain usable as a local album. Hosted publishing adds the Worker.
mkdirSync('dist/client', { recursive: true });
for (const entry of readdirSync('dist', { withFileTypes: true })) {
  if (['client', 'server', '.openai', '_appgen_meta'].includes(entry.name)) continue;
  cpSync(path.join('dist', entry.name), path.join('dist/client', entry.name), { recursive: true });
}
mkdirSync('dist/server', { recursive: true });
cpSync('worker/index.mjs', 'dist/server/index.js');
mkdirSync('dist/.openai', { recursive: true });
cpSync('.openai/hosting.json', 'dist/.openai/hosting.json');
cpSync('drizzle', 'dist/.openai/drizzle', { recursive: true });
console.log('Libro con almacenamiento preparado.');
