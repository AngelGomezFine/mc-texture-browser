// Genera sounds.json desde sound_definitions.json del repo bedrock-samples
// También verifica qué sonidos tienen archivo .ogg disponible (vs solo .fsb)
// Uso: node scripts/fetch-sounds.js

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

function httpGetText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'mc-texture-browser-script' } }, res => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} — ${url}`));
        return;
      }
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve(raw));
    }).on('error', reject);
  });
}

async function main() {
  const API = 'https://api.github.com/repos/Mojang/bedrock-samples/git/trees';
  const DEFS_URL = 'https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack/sounds/sound_definitions.json';

  // Paso 1: sound_definitions.json
  process.stdout.write('Paso 1/4  sound_definitions.json… ');
  const defsRaw = await httpGetText(DEFS_URL);
  const defsJson = JSON.parse(defsRaw);
  console.log('OK');

  // Paso 2: árbol raíz para encontrar resource_pack
  process.stdout.write('Paso 2/4  árbol raíz… ');
  const root = await httpGet(`${API}/main`);
  const rpEntry = root.tree.find(i => i.path === 'resource_pack');
  if (!rpEntry) { throw new Error('No se encontró resource_pack'); }
  console.log(`OK  (sha: ${rpEntry.sha.slice(0, 8)}…)`);

  // Paso 3: árbol de resource_pack para encontrar sounds
  process.stdout.write('Paso 3/4  árbol resource_pack… ');
  const rp = await httpGet(`${API}/${rpEntry.sha}`);
  const soundsEntry = rp.tree.find(i => i.path === 'sounds');
  if (!soundsEntry) { throw new Error('No se encontró sounds'); }
  console.log(`OK  (sha: ${soundsEntry.sha.slice(0, 8)}…)`);

  // Paso 4: árbol completo de sounds para encontrar .ogg
  process.stdout.write('Paso 4/4  árbol sounds (recursive)… ');
  const soundsTree = await httpGet(`${API}/${soundsEntry.sha}?recursive=1`);
  // Paths relativos al directorio sounds/, sin extensión
  const oggSet = new Set(
    soundsTree.tree
      .filter(i => i.type === 'blob' && i.path.endsWith('.ogg'))
      .map(i => 'sounds/' + i.path.slice(0, -4))
  );
  console.log(`OK  (${oggSet.size} archivos .ogg)`);

  // Procesar definiciones
  const defs = defsJson.sound_definitions || defsJson;
  const sounds = [];

  for (const [name, def] of Object.entries(defs)) {
    if (name === 'format_version' || typeof def !== 'object' || !def) { continue; }
    const category = def.category || 'misc';
    const rawSounds = def.sounds || [];
    const soundPaths = rawSounds
      .map(s => typeof s === 'string' ? s : (s && s.name ? s.name : null))
      .filter(Boolean);
    const hasOgg = soundPaths.some(p => oggSet.has(p));
    sounds.push({ name, category, sounds: soundPaths, hasOgg });
  }

  sounds.sort((a, b) => a.name.localeCompare(b.name));

  const playable = sounds.filter(s => s.hasOgg).length;
  console.log(`\nProcesados ${sounds.length} sonidos — ${playable} reproducibles (.ogg), ${sounds.length - playable} solo .fsb`);

  const out = path.join(__dirname, '..', 'sounds.json');
  fs.writeFileSync(out, JSON.stringify(sounds, null, 2), 'utf8');
  console.log(`✔  Guardado en ${out}`);
}

main().catch(err => { console.error('\n✖  ' + err.message); process.exit(1); });
