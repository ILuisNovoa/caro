const fs = require('node:fs');
const path = require('node:path');
const photos = {};
for (let i = 1; i <= 5; i++) {
  const folder = path.join(__dirname, 'media', 'fotos', `capitulo-${i}`);
  fs.mkdirSync(folder, {recursive: true});
  const file = fs.readdirSync(folder).filter(name => /\.(jpe?g|png|webp)$/i.test(name)).sort()[0];
  if (file) photos[i - 1] = `api/index.php?route=legacy%2Ffotos%2Fcapitulo-${i}%2F` + encodeURIComponent(file);
}
fs.writeFileSync(path.join(__dirname, 'dist', 'fotos.js'), 'window.FOTOS = ' + JSON.stringify(photos, null, 2) + ';\n');
console.log(`${Object.keys(photos).length} fotos preparadas.`);
