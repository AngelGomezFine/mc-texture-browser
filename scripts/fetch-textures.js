// Genera textures.json con todos los paths de PNG en resource_pack/textures/
// Uso: node scripts/fetch-textures.js

const https = require('https');
const fs    = require('fs');
const path  = require('path');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'mc-texture-browser-script' } }, res => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} — ${url}`));
        return;
      }
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const API = 'https://api.github.com/repos/Mojang/bedrock-samples/git/trees';

  process.stdout.write('Paso 1/3  árbol raíz… ');
  const root = await httpGet(`${API}/main`);
  const rpEntry = root.tree.find(i => i.path === 'resource_pack');
  if (!rpEntry) throw new Error('No se encontró resource_pack');
  console.log(`OK  (sha: ${rpEntry.sha.slice(0, 8)}…)`);

  process.stdout.write('Paso 2/3  árbol resource_pack… ');
  const rp = await httpGet(`${API}/${rpEntry.sha}`);
  const texEntry = rp.tree.find(i => i.path === 'textures');
  if (!texEntry) throw new Error('No se encontró textures');
  console.log(`OK  (sha: ${texEntry.sha.slice(0, 8)}…)`);

  process.stdout.write('Paso 3/3  árbol textures (recursive)… ');
  const tex = await httpGet(`${API}/${texEntry.sha}?recursive=1`);
  const paths = tex.tree
    .filter(i => i.type === 'blob' && i.path.endsWith('.png'))
    .map(i => 'textures/' + i.path);
  console.log(`OK  (${paths.length} texturas)`);

  const out = path.join(__dirname, '..', 'textures.json');
  fs.writeFileSync(out, JSON.stringify(paths, null, 2), 'utf8');
  console.log(`\n✔  Guardado en ${out}`);
}

main().catch(err => { console.error('\n✖  ' + err.message); process.exit(1); });
