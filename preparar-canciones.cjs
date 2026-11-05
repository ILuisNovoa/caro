const fs = require('node:fs');
const path = require('node:path');
const folder = path.join(__dirname, 'dist', 'canciones');
const songs = fs.readdirSync(folder).filter(file => /\.(mp3|m4a|ogg|wav|aac)$/i.test(file)).sort().map(file => ({
  name: path.parse(file).name.replace(/[_]+/g, ' '),
  url: 'canciones/' + encodeURIComponent(file)
}));
fs.writeFileSync(path.join(__dirname, 'dist', 'canciones.js'), 'window.CANCIONES = ' + JSON.stringify(songs, null, 2) + ';\n');
console.log(`${songs.length} canciones preparadas.`);
