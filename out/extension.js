"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
function getNonce() {
    return crypto.randomBytes(16).toString('hex');
}
// ─── Entry point ────────────────────────────────────────────────────────────
// Esta función se llama cuando VS Code activa la extensión.
// "activate" es OBLIGATORIA en toda extensión.
function activate(context) {
    // Registramos un "command" — es lo que aparece en el Command Palette (Ctrl+Shift+P)
    // El string debe coincidir exactamente con el "command" en package.json
    const disposable = vscode.commands.registerCommand('mc-texture-browser.open', () => {
        TextureBrowserPanel.createOrShow(context);
    });
    const soundDisposable = vscode.commands.registerCommand('mc-texture-browser.openSounds', () => {
        SoundBrowserPanel.createOrShow(context);
    });
    context.subscriptions.push(disposable, soundDisposable);
    context.subscriptions.push(vscode.window.registerTreeDataProvider('mc-texture-browser.welcomeView', {
        getTreeItem: (el) => el,
        getChildren: () => []
    }));
}
function deactivate() { }
// ─── Live fetch from GitHub ──────────────────────────────────────────────────
function fetchSoundDefinitionsLive() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'raw.githubusercontent.com',
            path: '/Mojang/bedrock-samples/main/resource_pack/sounds/sound_definitions.json',
            headers: { 'User-Agent': 'mc-texture-browser' }
        };
        https.get(options, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode} al obtener sound_definitions.json`));
                return;
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const defs = (json.sound_definitions || json);
                    const sounds = [];
                    for (const [name, def] of Object.entries(defs)) {
                        if (name === 'format_version' || typeof def !== 'object' || !def) {
                            continue;
                        }
                        const d = def;
                        const category = d.category || 'misc';
                        const rawSounds = d.sounds || [];
                        const soundPaths = rawSounds
                            .map((s) => typeof s === 'string' ? s : s?.name)
                            .filter(Boolean);
                        sounds.push({ name, category, sounds: soundPaths });
                    }
                    sounds.sort((a, b) => a.name.localeCompare(b.name));
                    resolve(sounds);
                }
                catch {
                    reject(new Error('Error al parsear sound_definitions.json'));
                }
            });
        }).on('error', reject);
    });
}
// ─── Sound Browser Panel ─────────────────────────────────────────────────────
class SoundBrowserPanel {
    static createOrShow(context) {
        const column = vscode.ViewColumn.Two;
        if (SoundBrowserPanel.currentPanel) {
            SoundBrowserPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel('mcSoundBrowser', 'MC Sound Browser', column, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(context.extensionPath, 'sounds-local'))
            ]
        });
        SoundBrowserPanel.currentPanel = new SoundBrowserPanel(panel, context);
    }
    constructor(panel, context) {
        this._disposables = [];
        this._sounds = null;
        this._loadError = null;
        this._ready = false;
        this._localUri = '';
        this._localPaths = [];
        this._panel = panel;
        this._panel.webview.html = this._getHtmlContent();
        this._panel.webview.onDidReceiveMessage((message) => {
            if (message.command === 'ready') {
                this._ready = true;
                this._trySendData();
            }
            else if (message.command === 'copyName' && message.name) {
                vscode.env.clipboard.writeText(message.name).then(() => {
                    vscode.window.setStatusBarMessage(`✔ Copiado: ${message.name}`, 2500);
                });
            }
        }, null, this._disposables);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._loadSounds(context).then(sounds => {
            this._sounds = sounds;
            this._trySendData();
        }).catch(err => {
            this._loadError = err.message || 'Error desconocido';
            this._trySendData();
        });
    }
    _trySendData() {
        if (!this._ready) {
            return;
        }
        if (this._loadError !== null) {
            this._panel.webview.postMessage({ command: 'error', message: this._loadError });
        }
        else if (this._sounds !== null) {
            this._panel.webview.postMessage({
                command: 'soundList',
                sounds: this._sounds,
                localUri: this._localUri,
                localPaths: this._localPaths
            });
        }
    }
    async _loadSounds(context) {
        const jsonPath = path.join(context.extensionPath, 'sounds.json');
        const sounds = fs.existsSync(jsonPath)
            ? JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
            : await fetchSoundDefinitionsLive();
        const localDir = path.join(context.extensionPath, 'sounds-local');
        this._localPaths = [];
        if (fs.existsSync(localDir)) {
            this._scanLocalSounds(localDir, localDir);
        }
        this._localUri = this._panel.webview
            .asWebviewUri(vscode.Uri.file(localDir))
            .toString();
        return sounds;
    }
    _scanLocalSounds(baseDir, dir) {
        try {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    this._scanLocalSounds(baseDir, full);
                }
                else if (entry.name.endsWith('.ogg') || entry.name.endsWith('.wav')) {
                    const rel = path.relative(baseDir, full).replace(/\\/g, '/').replace(/\.(ogg|wav)$/, '');
                    if (!this._localPaths.includes(rel)) {
                        this._localPaths.push(rel);
                    }
                }
            }
        }
        catch { /* ignore */ }
    }
    dispose() {
        SoundBrowserPanel.currentPanel = undefined;
        this._panel.dispose();
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
    }
    _getHtmlContent() {
        const RAW_BASE = 'https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack';
        const nonce = getNonce();
        return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
           media-src https://raw.githubusercontent.com vscode-resource: https:;
           script-src 'nonce-${nonce}';
           style-src 'unsafe-inline';">
<title>MC Sound Browser</title>
<style>
  :root {
    --bg:       #0f0f0f;
    --surface:  #1a1a1a;
    --surface2: #242424;
    --border:   #2e2e2e;
    --accent:   #5c9e31;
    --accent2:  #8bc34a;
    --text:     #e8e8e8;
    --text-dim: #888;
    --danger:   #e74c3c;
    --radius:   6px;
    --font-mono: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 12px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  header {
    background: var(--surface);
    border-bottom: 2px solid var(--accent);
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
  }

  .header-top {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .logo {
    font-size: 18px;
    font-weight: 700;
    color: var(--accent2);
    letter-spacing: -0.5px;
    text-shadow: 0 0 20px rgba(139,195,74,0.4);
    white-space: nowrap;
  }
  .logo span { color: var(--text-dim); font-weight: 400; font-size: 11px; margin-left: 6px; }

  #search {
    flex: 1;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 13px;
    padding: 6px 10px;
    outline: none;
    transition: border-color 0.15s;
  }
  #search:focus { border-color: var(--accent); }
  #search::placeholder { color: var(--text-dim); }

  .filters {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }

  .filter-btn {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 20px;
    color: var(--text-dim);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 3px 10px;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .filter-btn:hover { border-color: var(--accent); color: var(--text); }
  .filter-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  .stats {
    background: var(--surface2);
    border-bottom: 1px solid var(--border);
    padding: 5px 14px;
    color: var(--text-dim);
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .stats strong { color: var(--accent2); }

  #list-container {
    flex: 1;
    overflow-y: auto;
    padding: 8px 14px;
  }

  .sound-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: var(--radius);
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.1s;
    margin-bottom: 3px;
  }
  .sound-row:hover {
    background: var(--surface);
    border-color: var(--border);
  }
  .sound-row.copied {
    border-color: var(--accent2);
    background: rgba(92,158,49,0.12);
  }
  .sound-row.playing {
    border-color: var(--accent);
    background: rgba(92,158,49,0.08);
  }

  .sound-icon {
    font-size: 15px;
    width: 22px;
    text-align: center;
    flex-shrink: 0;
  }

  .sound-main {
    flex: 1;
    min-width: 0;
  }

  .sound-id {
    color: var(--text);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sound-sub {
    color: var(--text-dim);
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-top: 1px;
  }

  .cat-badge {
    font-size: 9px;
    padding: 2px 7px;
    border-radius: 10px;
    border: 1px solid var(--border);
    color: var(--text-dim);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .play-btn {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-dim);
    cursor: pointer;
    font-size: 11px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.1s;
  }
  .play-btn:hover { border-color: var(--accent); color: var(--accent2); }
  .play-btn.playing { border-color: var(--accent); color: var(--accent2); background: rgba(92,158,49,0.15); }
  .play-btn.error { border-color: var(--danger); color: var(--danger); }

  .fsb-badge {
    font-size: 9px;
    padding: 2px 6px;
    border-radius: var(--radius);
    border: 1px solid #3a3a3a;
    color: #555;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: default;
    letter-spacing: 0.5px;
    user-select: none;
  }

  .center-msg {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    gap: 12px;
    color: var(--text-dim);
  }

  .spinner {
    width: 32px; height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .error-msg { color: var(--danger); text-align: center; max-width: 300px; line-height: 1.5; }

  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg); }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--accent); }

  #player-bar {
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: 6px 14px;
    display: none;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
    font-size: 11px;
  }
  #player-bar.visible { display: flex; }
  #player-label { color: var(--text-dim); white-space: nowrap; }
  #player-name { color: var(--accent2); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #player-stop {
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-dim);
    cursor: pointer;
    padding: 2px 8px;
    font-size: 11px;
    font-family: var(--font-mono);
    white-space: nowrap;
  }
  #player-stop:hover { border-color: var(--danger); color: var(--danger); }

  #volume-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  #volume-icon { color: var(--text-dim); font-size: 13px; cursor: pointer; user-select: none; }
  #volume-slider {
    -webkit-appearance: none;
    width: 80px;
    height: 4px;
    border-radius: 2px;
    background: var(--border);
    outline: none;
    cursor: pointer;
  }
  #volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent2);
    cursor: pointer;
  }
</style>
</head>
<body>

<header>
  <div class="header-top">
    <div class="logo">🔊 MC Sounds <span>bedrock-samples/vanilla</span></div>
    <input id="search" type="text" placeholder="Buscar sonido… (ej: block.stone, music, ambient)" autocomplete="off" />
  </div>
  <div class="filters" id="filters"></div>
</header>

<div class="stats" id="stats"><span>Cargando sonidos…</span></div>

<div id="list-container">
  <div id="list">
    <div class="center-msg" id="loading-msg">
      <div class="spinner"></div>
      <span>Obteniendo catálogo de sonidos de GitHub…</span>
    </div>
  </div>
</div>

<div id="player-bar">
  <span id="player-label">▶ Reproduciendo:</span>
  <span id="player-name"></span>
  <button id="player-stop">⏹ Detener</button>
  <div id="volume-wrap">
    <span id="volume-icon" title="Volumen">🔊</span>
    <input id="volume-slider" type="range" min="0" max="100" value="100" title="Volumen">
  </div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const RAW_BASE = '${RAW_BASE}';

  let allSounds = [];
  let filtered  = [];
  let activeCategory = 'all';
  let searchTerm = '';
  let currentAudio = null;
  let currentPlayBtn = null;
  let currentRow = null;
  let LOCAL_URI = '';
  let localPathSet = new Set();

  const CATEGORIES = [
    { id: 'all',     label: '🔊 Todos'   },
    { id: 'ambient', label: '🌊 Ambient'  },
    { id: 'block',   label: '🧱 Block'    },
    { id: 'music',   label: '🎵 Music'    },
    { id: 'hostile', label: '👹 Hostile'  },
    { id: 'neutral', label: '🐾 Neutral'  },
    { id: 'player',  label: '👤 Player'   },
    { id: 'ui',      label: '🖥 UI'       },
    { id: 'weather', label: '⛈ Weather'  },
    { id: 'record',  label: '📀 Record'   },
    { id: 'bucket',  label: '🪣 Bucket'   },
    { id: 'master',  label: '🎛 Master'   },
  ];

  const CAT_ICONS = {
    ambient: '🌊', block: '🧱', music: '🎵', hostile: '👹',
    neutral: '🐾', player: '👤', ui: '🖥', weather: '⛈',
    record: '📀', bucket: '🪣', master: '🎛', misc: '🔊'
  };

  buildFilterButtons();
  setupSearch();
  vscode.postMessage({ command: 'ready' });

  window.addEventListener('message', function(event) {
    const msg = event.data;
    if (msg.command === 'soundList') {
      allSounds = msg.sounds;
      LOCAL_URI = msg.localUri || '';
      localPathSet = new Set(msg.localPaths || []);
      renderList(allSounds);
      updateStats(allSounds.length, allSounds.length);
    } else if (msg.command === 'error') {
      document.getElementById('list').innerHTML =
        '<div class="center-msg"><div class="error-msg">⚠ ' + esc(msg.message) +
        '<br><br><small>Ejecutá <code>npm run fetch-sounds</code> para generar sounds.json</small></div></div>';
      document.getElementById('stats').textContent = 'Error al cargar sonidos';
    }
  });

  function buildFilterButtons() {
    const container = document.getElementById('filters');
    CATEGORIES.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn' + (cat.id === 'all' ? ' active' : '');
      btn.textContent = cat.label;
      btn.addEventListener('click', () => {
        activeCategory = cat.id;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFilters();
      });
      container.appendChild(btn);
    });
  }

  function setupSearch() {
    const input = document.getElementById('search');
    let debounce;
    input.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        searchTerm = input.value.toLowerCase().trim();
        applyFilters();
      }, 180);
    });
    input.focus();
  }

  function applyFilters() {
    filtered = allSounds.filter(s => {
      const matchesCat = activeCategory === 'all' || s.category === activeCategory;
      const matchesText = searchTerm === '' || s.name.toLowerCase().includes(searchTerm);
      return matchesCat && matchesText;
    });
    renderList(filtered);
    updateStats(filtered.length, allSounds.length);
  }

  function renderList(sounds) {
    const list = document.getElementById('list');
    if (sounds.length === 0) {
      list.innerHTML = '<div class="center-msg"><span>Sin resultados' +
        (searchTerm ? ' para &quot;' + esc(searchTerm) + '&quot;' : '') + '</span></div>';
      return;
    }

    const fragment = document.createDocumentFragment();

    sounds.forEach(s => {
      const row = document.createElement('div');
      row.className = 'sound-row';

      const icon = CAT_ICONS[s.category] || '🔊';
      const previewPath = s.sounds && s.sounds.length > 0 ? s.sounds[0] : null;
      const hasLocal = s.sounds.some(p => localPathSet.has(p));
      const canPlay  = hasLocal || s.hasOgg !== false;
      const ext = hasLocal ? '.wav' : (s.hasOgg === false ? '.fsb' : '.ogg');
      const subText = previewPath
        ? previewPath + ext + (s.sounds.length > 1 ? '  +' + (s.sounds.length - 1) + ' más' : '')
        : '(sin archivo)';
      const playTitle = hasLocal ? 'Reproducir (local)' : 'Reproducir';

      const actionEl = canPlay
        ? '<button class="play-btn" title="' + playTitle + '">▶</button>'
        : '<span class="fsb-badge" title="Formato .fsb — ejecutá npm run convert-sounds">FSB</span>';

      row.innerHTML =
        '<div class="sound-icon">' + icon + '</div>' +
        '<div class="sound-main">' +
          '<div class="sound-id">' + esc(s.name) + '</div>' +
          '<div class="sound-sub">' + esc(subText) + '</div>' +
        '</div>' +
        '<span class="cat-badge">' + esc(s.category) + '</span>' +
        actionEl;

      if (canPlay) {
        const playBtn = row.querySelector('.play-btn');
        playBtn._sounds = s.sounds;
        playBtn._hasLocal = hasLocal;
        row.addEventListener('click', (e) => {
          if (e.target === playBtn || playBtn.contains(e.target)) { return; }
          copyName(s.name, row);
        });
        playBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (playBtn._sounds.length === 0) { return; }
          togglePlay(s, playBtn, row);
        });
      } else {
        row.addEventListener('click', () => copyName(s.name, row));
      }

      fragment.appendChild(row);
    });

    list.innerHTML = '';
    list.appendChild(fragment);
  }

  function copyName(name, row) {
    vscode.postMessage({ command: 'copyName', name });
    row.classList.add('copied');
    setTimeout(() => row.classList.remove('copied'), 1200);
  }

  function togglePlay(sound, btn, row) {
    if (btn === currentPlayBtn) { stopAudio(); return; }
    stopAudio();

    const paths = btn._sounds;

    // Prioridad: .wav local > .ogg de GitHub
    let url, variantLabel;
    if (btn._hasLocal) {
      const localPath = paths.find(p => localPathSet.has(p));
      // preferir .ogg (comprimido) sobre .wav
      const oggLocal = LOCAL_URI + '/' + localPath + '.ogg';
      const wavLocal = LOCAL_URI + '/' + localPath + '.wav';
      url = oggLocal; // el Audio intentará .ogg; si falla el catch manejará el .wav
      btn._wavFallback = wavLocal;
      variantLabel = '';
    } else {
      const idx = Math.floor(Math.random() * paths.length);
      url = RAW_BASE + '/' + paths[idx] + '.ogg';
      variantLabel = paths.length > 1 ? '  [' + (idx + 1) + '/' + paths.length + ']' : '';
    }

    const audio = new Audio(url);
    audio.volume = currentVolume;
    currentAudio = audio;
    currentPlayBtn = btn;
    currentRow = row;

    btn.classList.add('playing');
    btn.textContent = '⏹';
    row.classList.add('playing');

    const bar = document.getElementById('player-bar');
    bar.classList.add('visible');
    document.getElementById('player-name').textContent = sound.name + variantLabel;

    audio.play().catch(() => {
      // si era .ogg local y falla, intentar .wav
      if (btn._wavFallback && audio.src.endsWith('.ogg')) {
        const wav = new Audio(btn._wavFallback);
        wav.volume = currentVolume;
        currentAudio = wav;
        wav.play().catch(() => showPlayError(btn, row, bar));
        wav.onended = () => {
          resetBtn(btn, row, '▶', null);
          bar.classList.remove('visible');
          currentAudio = null; currentPlayBtn = null; currentRow = null;
        };
        return;
      }
      showPlayError(btn, row, bar);
    });

    audio.onended = () => {
      resetBtn(btn, row, '▶', null);
      bar.classList.remove('visible');
      currentAudio = null; currentPlayBtn = null; currentRow = null;
    };
  }

  function showPlayError(btn, row, bar) {
    resetBtn(btn, row, '✕', 'error');
    btn.title = 'No se pudo reproducir';
    if (bar) { bar.classList.remove('visible'); }
    currentAudio = null; currentPlayBtn = null; currentRow = null;
    setTimeout(() => {
      btn.classList.remove('error');
      btn.textContent = '▶';
      btn.title = btn._hasLocal ? 'Reproducir (local)' : 'Reproducir';
    }, 2000);
  }

  function stopAudio() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = '';
      currentAudio = null;
    }
    if (currentPlayBtn) {
      resetBtn(currentPlayBtn, currentRow, '▶', null);
      currentPlayBtn = null; currentRow = null;
    }
    document.getElementById('player-bar').classList.remove('visible');
  }

  function resetBtn(btn, row, label, extraClass) {
    btn.classList.remove('playing', 'error');
    if (extraClass) { btn.classList.add(extraClass); }
    btn.textContent = label;
    if (row) { row.classList.remove('playing'); }
  }

  document.getElementById('player-stop').addEventListener('click', stopAudio);

  const volumeSlider = document.getElementById('volume-slider');
  const volumeIcon   = document.getElementById('volume-icon');
  let currentVolume  = 1.0;

  volumeSlider.addEventListener('input', () => {
    currentVolume = volumeSlider.value / 100;
    if (currentAudio) { currentAudio.volume = currentVolume; }
    volumeIcon.textContent = currentVolume === 0 ? '🔇' : currentVolume < 0.5 ? '🔉' : '🔊';
  });

  volumeIcon.addEventListener('click', () => {
    if (currentVolume > 0) {
      volumeSlider._prev = volumeSlider.value;
      volumeSlider.value = 0;
    } else {
      volumeSlider.value = volumeSlider._prev || 100;
    }
    volumeSlider.dispatchEvent(new Event('input'));
  });

  function updateStats(shown, total) {
    const hasOggInfo = allSounds.length > 0 && allSounds[0].hasOgg !== undefined;
    const playable = hasOggInfo ? allSounds.filter(s => s.hasOgg).length : null;
    const playableNote = playable !== null
      ? ' · <span style="color:var(--accent2)">' + playable + ' ▶</span> <span style="color:var(--text-dim)">/ ' + (total - playable) + ' FSB</span>'
      : '';
    document.getElementById('stats').innerHTML =
      'Mostrando <strong>' + shown + '</strong> de <strong>' + total + '</strong> sonidos' +
      playableNote +
      (searchTerm ? ' · <strong>&quot;' + esc(searchTerm) + '&quot;</strong>' : '') +
      ' · <span style="color:var(--text-dim)">Click = copiar</span>';
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
</script>
</body>
</html>`;
    }
}
// ─── Webview Panel ───────────────────────────────────────────────────────────
// Un WebviewPanel es básicamente una pestaña con HTML/CSS/JS dentro de VS Code.
// Podés pensarlo como una mini-app web embebida.
class TextureBrowserPanel {
    // ── Métodos estáticos ────────────────────────────────────────────────────
    static createOrShow(context) {
        const column = vscode.ViewColumn.Two; // Abrir al lado del editor activo
        // Si ya existe, traerlo al frente
        if (TextureBrowserPanel.currentPanel) {
            TextureBrowserPanel.currentPanel._panel.reveal(column);
            return;
        }
        // Crear nuevo panel
        const panel = vscode.window.createWebviewPanel('mcTextureBrowser', // ID interno del webview (único)
        'MC Texture Browser', // Título que aparece en la tab
        column, {
            enableScripts: true, // Permite ejecutar JS en el webview
            retainContextWhenHidden: true, // Mantiene el estado al cambiar de tab
            // localResourceRoots: [] // Aquí iría si tuvieras assets locales
        });
        // Leer textures.json local (generado por: npm run fetch-textures)
        let textures = [];
        try {
            const jsonPath = path.join(context.extensionPath, 'textures.json');
            textures = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        }
        catch {
            vscode.window.showErrorMessage('MC Texture Browser: no se encontró textures.json. Ejecutá npm run fetch-textures primero.');
        }
        TextureBrowserPanel.currentPanel = new TextureBrowserPanel(panel, textures);
    }
    // ── Constructor ──────────────────────────────────────────────────────────
    constructor(panel, textures) {
        this._disposables = [];
        this._panel = panel;
        this._panel.webview.html = this._getHtmlContent();
        this._panel.webview.onDidReceiveMessage((message) => {
            if (message.command === 'ready') {
                // Webview listo — enviar datos locales
                this._panel.webview.postMessage({ command: 'textureList', textures });
            }
            else if (message.command === 'copyPath' && message.path) {
                vscode.env.clipboard.writeText(message.path).then(() => {
                    vscode.window.setStatusBarMessage(`✔ Copiado: ${message.path}`, 2500);
                });
            }
        }, null, this._disposables);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }
    // ── Cleanup ──────────────────────────────────────────────────────────────
    dispose() {
        TextureBrowserPanel.currentPanel = undefined;
        this._panel.dispose();
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
    }
    // ── HTML del Webview ─────────────────────────────────────────────────────
    _getHtmlContent() {
        const RAW_BASE = 'https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack';
        const nonce = getNonce();
        return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
           img-src https://raw.githubusercontent.com data:;
           script-src 'nonce-${nonce}';
           style-src 'unsafe-inline';">
<title>MC Texture Browser</title>
<style>
  /* ── Variables ── */
  :root {
    --bg:          #0f0f0f;
    --surface:     #1a1a1a;
    --surface2:    #242424;
    --border:      #2e2e2e;
    --accent:      #5c9e31;       /* verde Minecraft */
    --accent2:     #8bc34a;
    --text:        #e8e8e8;
    --text-dim:    #888;
    --danger:      #e74c3c;
    --card-size:   88px;
    --radius:      6px;
    --font-mono:   'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 12px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Header ── */
  header {
    background: var(--surface);
    border-bottom: 2px solid var(--accent);
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
  }

  .header-top {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .logo {
    font-size: 18px;
    font-weight: 700;
    color: var(--accent2);
    letter-spacing: -0.5px;
    text-shadow: 0 0 20px rgba(139,195,74,0.4);
    white-space: nowrap;
  }

  .logo span { color: var(--text-dim); font-weight: 400; font-size: 11px; margin-left: 6px; }

  #search {
    flex: 1;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 13px;
    padding: 6px 10px;
    outline: none;
    transition: border-color 0.15s;
  }
  #search:focus { border-color: var(--accent); }
  #search::placeholder { color: var(--text-dim); }

  /* ── Filters ── */
  .filters {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }

  .filter-btn {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 20px;
    color: var(--text-dim);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 3px 10px;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .filter-btn:hover { border-color: var(--accent); color: var(--text); }
  .filter-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  /* ── Stats bar ── */
  .stats {
    background: var(--surface2);
    border-bottom: 1px solid var(--border);
    padding: 5px 14px;
    color: var(--text-dim);
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .stats strong { color: var(--accent2); }

  /* ── Grid ── */
  #grid-container {
    flex: 1;
    overflow-y: auto;
    padding: 12px 14px;
  }

  #grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--card-size), 1fr));
    gap: 8px;
  }

  .tex-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 6px 4px 4px;
    transition: all 0.12s;
    position: relative;
    overflow: hidden;
    aspect-ratio: 1;
  }

  .tex-card:hover {
    border-color: var(--accent);
    background: var(--surface2);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(92,158,49,0.25);
    z-index: 10;
  }

  .tex-card.copied {
    border-color: var(--accent2);
    background: rgba(92,158,49,0.15);
  }

  .tex-card img {
    width: 48px;
    height: 48px;
    object-fit: contain;
    image-rendering: pixelated; /* Importante para pixel art */
    flex: 1;
  }

  .tex-name {
    color: var(--text-dim);
    font-size: 9px;
    text-align: center;
    margin-top: 4px;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── Tooltip ── */
  .tooltip {
    position: fixed;
    background: #111;
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    padding: 8px 12px;
    font-size: 11px;
    color: var(--text);
    pointer-events: none;
    z-index: 1000;
    max-width: 340px;
    word-break: break-all;
    display: none;
    box-shadow: 0 4px 16px rgba(0,0,0,0.6);
  }
  .tooltip .label { color: var(--text-dim); font-size: 10px; margin-bottom: 2px; }
  .tooltip .path { color: var(--accent2); }

  /* ── Loading / Empty ── */
  .center-msg {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    color: var(--text-dim);
  }

  .spinner {
    width: 32px; height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .error-msg { color: var(--danger); text-align: center; max-width: 300px; }

  /* ── Scrollbar ── */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg); }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--accent); }
</style>
</head>
<body>

<header>
  <div class="header-top">
    <div class="logo">⛏ MC Textures <span>bedrock-samples/vanilla</span></div>
    <input id="search" type="text" placeholder="Buscar textura… (ej: arrow, button, heart)" autocomplete="off" />
  </div>
  <div class="filters" id="filters">
    <button class="filter-btn active" data-cat="all">Todos</button>
    <!-- Se generan dinámicamente -->
  </div>
</header>

<div class="stats" id="stats">
  <span>Cargando texturas desde GitHub…</span>
</div>

<div id="grid-container">
  <div id="grid">
    <div class="center-msg" id="loading-msg">
      <div class="spinner"></div>
      <span>Obteniendo árbol de archivos…</span>
    </div>
  </div>
</div>

<div class="tooltip" id="tooltip">
  <div class="label">Path para JSON / Form:</div>
  <div class="path" id="tooltip-path"></div>
</div>

<script nonce="${nonce}">
  // ── VSCode API ──────────────────────────────────────────────────────────
  // acquireVsCodeApi() te da acceso al puente entre el webview y la extensión.
  // IMPORTANTE: Solo se puede llamar UNA vez, por eso lo guardamos en variable.
  const vscode = acquireVsCodeApi();

  // ── Estado ──────────────────────────────────────────────────────────────
  const RAW_BASE = '${RAW_BASE}';

  let allTextures = [];
  let filtered    = [];
  let activeCategory = 'all';
  let searchTerm  = '';

  // Categorías predefinidas y sus subcarpetas
  const CATEGORIES = [
    { id: 'all',         label: 'Todos',      match: '' },
    { id: 'ui',          label: '🖼 UI',        match: 'textures/ui/' },
    { id: 'items',       label: '🗡 Items',     match: 'textures/items/' },
    { id: 'blocks',      label: '🧱 Blocks',    match: 'textures/blocks/' },
    { id: 'entity',      label: '🐾 Entity',    match: 'textures/entity/' },
    { id: 'particle',    label: '✨ Particle',   match: 'textures/particle/' },
    { id: 'environment', label: '🌅 Environment',match: 'textures/environment/' },
    { id: 'misc',        label: '📦 Misc',       match: 'textures/misc/' },
    { id: 'gui',         label: '🎮 GUI',        match: 'textures/gui/' },
  ];

  // ── Inicialización ───────────────────────────────────────────────────────
  buildFilterButtons();
  setupSearch();

  // Avisar a la extensión que el webview está listo para recibir datos
  vscode.postMessage({ command: 'ready' });

  window.addEventListener('message', function(event) {
    const msg = event.data;
    if (msg.command === 'textureList') {
      allTextures = msg.textures;
      renderGrid(allTextures);
      updateStats(allTextures.length, allTextures.length);
    } else if (msg.command === 'error') {
      document.getElementById('grid').innerHTML =
        '<div class="center-msg"><div class="error-msg">Error: ' + msg.message + '</div></div>';
      document.getElementById('stats').innerHTML = msg.message;
    }
  });

  // ── Render de la grilla ──────────────────────────────────────────────────
  function renderGrid(textures) {
    const grid = document.getElementById('grid');

    if (textures.length === 0) {
      grid.innerHTML = '<div class="center-msg"><span>Sin resultados para "' + searchTerm + '"</span></div>';
      return;
    }

    // Usamos DocumentFragment para no re-pintar el DOM en cada tarjeta
    const fragment = document.createDocumentFragment();

    textures.forEach(path => {
      const card = document.createElement('div');
      card.className = 'tex-card';
      card.dataset.path = path;

      const imgUrl = RAW_BASE + '/' + path;
      const name   = path.split('/').pop().replace('.png', '');

      card.innerHTML =
        '<img src="' + imgUrl + '" loading="lazy" alt="' + name + '" onerror="this.style.opacity=0.2">' +
        '<div class="tex-name">' + name + '</div>';

      // Click: copiar path
      card.addEventListener('click', () => copyPath(path, card));

      // Hover: mostrar tooltip con path completo
      card.addEventListener('mouseenter', (e) => showTooltip(e, path));
      card.addEventListener('mouseleave', hideTooltip);

      fragment.appendChild(card);
    });

    grid.innerHTML = '';
    grid.appendChild(fragment);
  }

  // ── Copy path ────────────────────────────────────────────────────────────
  function copyPath(path, card) {
    // Enviar mensaje a la extensión (extension.ts)
    // La extensión escucha esto en onDidReceiveMessage
    vscode.postMessage({ command: 'copyPath', path: path });

    // Feedback visual en la card
    card.classList.add('copied');
    setTimeout(() => card.classList.remove('copied'), 1200);
  }

  // ── Tooltip ──────────────────────────────────────────────────────────────
  const tooltip    = document.getElementById('tooltip');
  const tooltipPath = document.getElementById('tooltip-path');

  function showTooltip(e, path) {
    tooltipPath.textContent = path;
    tooltip.style.display = 'block';
    moveTooltip(e);
  }

  document.addEventListener('mousemove', (e) => {
    if (tooltip.style.display === 'block') moveTooltip(e);
  });

  function moveTooltip(e) {
    const x = e.clientX + 14;
    const y = e.clientY + 14;
    tooltip.style.left  = Math.min(x, window.innerWidth - 360) + 'px';
    tooltip.style.top   = Math.min(y, window.innerHeight - 80) + 'px';
  }

  function hideTooltip() {
    tooltip.style.display = 'none';
  }

  // ── Filtros por categoría ────────────────────────────────────────────────
  function buildFilterButtons() {
    const container = document.getElementById('filters');
    container.innerHTML = '';

    CATEGORIES.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn' + (cat.id === 'all' ? ' active' : '');
      btn.dataset.cat = cat.id;
      btn.textContent = cat.label;
      btn.addEventListener('click', () => {
        activeCategory = cat.id;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFilters();
      });
      container.appendChild(btn);
    });
  }

  // ── Búsqueda ─────────────────────────────────────────────────────────────
  function setupSearch() {
    const input = document.getElementById('search');
    let debounce;
    input.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        searchTerm = input.value.toLowerCase().trim();
        applyFilters();
      }, 180);
    });
    // Auto-focus
    input.focus();
  }

  // ── Filtrado combinado ────────────────────────────────────────────────────
  function applyFilters() {
    const catFilter = CATEGORIES.find(c => c.id === activeCategory);

    filtered = allTextures.filter(path => {
      const matchesCat  = catFilter.match === '' || path.includes(catFilter.match);
      const matchesText = searchTerm === '' || path.toLowerCase().includes(searchTerm);
      return matchesCat && matchesText;
    });

    renderGrid(filtered);
    updateStats(filtered.length, allTextures.length);
  }

  // ── Stats bar ────────────────────────────────────────────────────────────
  function updateStats(shown, total) {
    document.getElementById('stats').innerHTML =
      'Mostrando <strong>' + shown + '</strong> de <strong>' + total + '</strong> texturas' +
      (searchTerm ? ' · búsqueda: <strong>"' + searchTerm + '"</strong>' : '') +
      ' · <span style="color:var(--text-dim)">Click = copiar path</span>';
  }
</script>
</body>
</html>`;
    }
}
//# sourceMappingURL=extension.js.map