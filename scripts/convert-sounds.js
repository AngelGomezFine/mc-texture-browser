// Descarga .fsb del repo bedrock-samples y los convierte a .wav usando vgmstream-cli
// Los archivos quedan en sounds-local/ y el panel los usa automáticamente
//
// Requiere: vgmstream-cli en el PATH
//   Windows → https://github.com/vgmstream/vgmstream/releases
//   Extraé vgmstream-cli.exe y ponlo en el PATH (o en esta misma carpeta)
//
// Uso:
//   node scripts/convert-sounds.js                 (todos los .fsb)
//   node scripts/convert-sounds.js --category=block
//   node scripts/convert-sounds.js --limit=100

const https    = require('https');
const fs       = require('fs');
const path     = require('path');
const { spawnSync } = require('child_process');

const args           = process.argv.slice(2);
const categoryFilter = (args.find(a => a.startsWith('--category=')) || '').slice('--category='.length);
const limitArg       = (args.find(a => a.startsWith('--limit='))    || '').slice('--limit='.length);
const variantsArg    = (args.find(a => a.startsWith('--variants=')) || '').slice('--variants='.length);
const limit          = limitArg    ? parseInt(limitArg, 10)    : Infinity;
const variantsPerSound = variantsArg ? parseInt(variantsArg, 10) : 1;

// ── Verificar vgmstream-cli ───────────────────────────────────────────────────
function findVgmstream() {
  const projectRoot = path.join(__dirname, '..');
  const candidates = [
    path.join(projectRoot, 'vgmstream', 'vgmstream-cli.exe'),  // carpeta vgmstream/
    path.join(projectRoot, 'vgmstream-cli.exe'),               // raíz del proyecto
    path.join(__dirname,   'vgmstream-cli.exe'),               // scripts/
    'vgmstream-cli.exe',                                       // PATH del sistema
    'vgmstream-cli',                                           // Linux/Mac
  ];
  for (const bin of candidates) {
    const r = spawnSync(bin, ['-h'], { encoding: 'utf8' });
    if (!r.error) { return bin; }
  }
  return null;
}

// ── Descargar archivo binario ─────────────────────────────────────────────────
function downloadBinary(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'mc-texture-browser-script' } }, res => {
      if (res.statusCode === 404) { res.resume(); reject(new Error('404')); return; }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Verificar herramienta
  const vgm = findVgmstream();
  if (!vgm) {
    console.error('\n✖  vgmstream-cli no encontrado.');
    console.error('   1. Descargalo en: https://github.com/vgmstream/vgmstream/releases');
    console.error('   2. Extraé vgmstream-cli.exe');
    console.error('   3. Ponelo en el PATH o en la carpeta del proyecto');
    process.exit(1);
  }
  console.log(`✔  vgmstream-cli: ${vgm}\n`);

  // Leer sounds.json
  const soundsPath = path.join(__dirname, '..', 'sounds.json');
  if (!fs.existsSync(soundsPath)) {
    console.error('✖  sounds.json no existe. Ejecutá primero: npm run fetch-sounds');
    process.exit(1);
  }
  const sounds = JSON.parse(fs.readFileSync(soundsPath, 'utf8'));

  // Recolectar paths únicos a convertir (los que NO tienen .ogg disponible)
  const uniquePaths = new Set();
  for (const s of sounds) {
    if (s.hasOgg) { continue; }                          // ya reproducible
    if (categoryFilter && s.category !== categoryFilter) { continue; }
    s.sounds.slice(0, variantsPerSound).forEach(p => uniquePaths.add(p));
  }

  const toConvert = [...uniquePaths].slice(0, limit);
  const total     = toConvert.length;

  if (total === 0) {
    console.log('No hay archivos .fsb para convertir' +
      (categoryFilter ? ` en la categoría "${categoryFilter}"` : '') + '.');
    return;
  }

  console.log(`Convirtiendo ${total} archivos .fsb → .wav...`);
  if (categoryFilter) { console.log(`  Categoría: ${categoryFilter}`); }
  console.log('  (Saltea los que ya fueron convertidos)\n');

  const outBase = path.join(__dirname, '..', 'sounds-local');
  const tmpFsb  = path.join(outBase, '_tmp.fsb');
  const RAW_BASE = 'https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack';

  let converted = 0, skipped = 0, notFound = 0, errors = 0;
  const pad = String(total).length;

  for (let i = 0; i < toConvert.length; i++) {
    const soundPath = toConvert[i];
    const outWav    = path.join(outBase, soundPath + '.wav');
    const prefix    = `  [${String(i + 1).padStart(pad)}/${total}]`;

    if (fs.existsSync(outWav)) {
      skipped++;
      continue;
    }

    fs.mkdirSync(path.dirname(outWav), { recursive: true });
    process.stdout.write(`${prefix} ${soundPath}… `);

    // Descargar .fsb
    let fsbData;
    try {
      fsbData = await downloadBinary(`${RAW_BASE}/${soundPath}.fsb`);
    } catch (e) {
      if (e.message === '404') {
        process.stdout.write('— no encontrado\n');
        notFound++;
        continue;
      }
      process.stdout.write(`✕ descarga: ${e.message}\n`);
      errors++;
      continue;
    }

    fs.writeFileSync(tmpFsb, fsbData);

    // Convertir con vgmstream
    const r = spawnSync(vgm, ['-o', outWav, tmpFsb], { encoding: 'utf8' });
    fs.unlinkSync(tmpFsb);

    if (r.status !== 0 || !fs.existsSync(outWav)) {
      const errMsg = (r.stderr || r.stdout || '').trim().split('\n')[0] || 'sin detalle';
      process.stdout.write(`✕ ${errMsg}\n`);
      errors++;
    } else {
      const kb = Math.round(fs.statSync(outWav).size / 1024);
      process.stdout.write(`✔ (${kb} KB)\n`);
      converted++;
    }
  }

  console.log(`\n──────────────────────────────────────`);
  console.log(`  Convertidos : ${converted}`);
  console.log(`  Saltados    : ${skipped} (ya existían)`);
  console.log(`  No hallados : ${notFound} (sin .fsb en repo)`);
  console.log(`  Errores     : ${errors}`);
  console.log(`──────────────────────────────────────`);
  console.log(`  Archivos en : sounds-local/`);
  console.log(`  Recargá el panel de sonidos en VSCode para escucharlos.`);
}

main().catch(err => { console.error('\n✖  ' + err.message); process.exit(1); });
