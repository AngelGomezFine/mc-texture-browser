// Convierte todos los .wav de sounds-local/ a .ogg usando ffmpeg
// Borra los .wav después de convertir exitosamente
// Uso: node scripts/compress-sounds.js

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function findFfmpeg() {
  const projectRoot = path.join(__dirname, '..');
  const wingetBase  = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet');
  const candidates = [
    path.join(projectRoot, 'vgmstream', 'ffmpeg.exe'),
    path.join(projectRoot, 'ffmpeg.exe'),
    path.join(wingetBase, 'Links', 'ffmpeg.exe'),
    // buscar en paquetes winget instalados
    ...(() => {
      try {
        const pkgs = path.join(wingetBase, 'Packages');
        return require('fs').readdirSync(pkgs)
          .filter(d => d.startsWith('Gyan.FFmpeg'))
          .flatMap(d => {
            try {
              return require('fs').readdirSync(path.join(pkgs, d))
                .map(sub => path.join(pkgs, d, sub, 'bin', 'ffmpeg.exe'));
            } catch { return []; }
          });
      } catch { return []; }
    })(),
    'ffmpeg.exe',
    'ffmpeg',
  ];
  for (const bin of candidates) {
    const r = spawnSync(bin, ['-version'], { encoding: 'utf8' });
    if (!r.error) { return bin; }
  }
  return null;
}

function collectWavFiles(dir, result = []) {
  if (!fs.existsSync(dir)) { return result; }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { collectWavFiles(full, result); }
    else if (entry.name.endsWith('.wav')) { result.push(full); }
  }
  return result;
}

async function main() {
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) {
    console.error('✖  ffmpeg no encontrado. Instalalo con: winget install "FFmpeg (Essentials Build)"');
    process.exit(1);
  }
  console.log(`✔  ffmpeg: ${ffmpeg}\n`);

  const soundsLocal = path.join(__dirname, '..', 'sounds-local');
  const wavFiles = collectWavFiles(soundsLocal);

  if (wavFiles.length === 0) {
    console.log('No hay archivos .wav para convertir. Ejecutá primero: npm run convert-sounds');
    return;
  }

  console.log(`Convirtiendo ${wavFiles.length} archivos .wav → .ogg...\n`);

  const pad = String(wavFiles.length).length;
  let converted = 0, errors = 0;

  for (let i = 0; i < wavFiles.length; i++) {
    const wavPath = wavFiles[i];
    const oggPath = wavPath.replace(/\.wav$/, '.ogg');
    const name    = path.relative(soundsLocal, wavPath);
    const prefix  = `  [${String(i + 1).padStart(pad)}/${wavFiles.length}]`;

    process.stdout.write(`${prefix} ${name}… `);

    const r = spawnSync(ffmpeg, [
      '-i', wavPath,
      '-c:a', 'libvorbis',
      '-q:a', '4',          // calidad 4 (~128kbps), buen balance tamaño/calidad
      '-y',                 // sobreescribir si existe
      oggPath
    ], { encoding: 'utf8' });

    if (r.status !== 0 || !fs.existsSync(oggPath)) {
      process.stdout.write('✕ error\n');
      errors++;
    } else {
      const kb = Math.round(fs.statSync(oggPath).size / 1024);
      fs.unlinkSync(wavPath); // borrar .wav original
      process.stdout.write(`✔ (${kb} KB)\n`);
      converted++;
    }
  }

  console.log(`\n──────────────────────────────────────`);
  console.log(`  Convertidos : ${converted}`);
  console.log(`  Errores     : ${errors}`);

  // Mostrar tamaño final
  const totalBytes = collectWavFiles(soundsLocal)  // los que quedaron como .wav
    .reduce((s, f) => s + fs.statSync(f).size, 0);
  const oggFiles = [];
  function collectOgg(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { collectOgg(full); }
      else if (e.name.endsWith('.ogg')) { oggFiles.push(full); }
    }
  }
  collectOgg(soundsLocal);
  const oggMB = (oggFiles.reduce((s, f) => s + fs.statSync(f).size, 0) / 1024 / 1024).toFixed(1);
  console.log(`  Tamaño .ogg : ${oggMB} MB`);
  console.log(`──────────────────────────────────────`);
}

main().catch(err => { console.error('\n✖  ' + err.message); process.exit(1); });
