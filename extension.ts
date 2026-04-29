import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

function getNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

// ─── Entry point ────────────────────────────────────────────────────────────
// Esta función se llama cuando VS Code activa la extensión.
// "activate" es OBLIGATORIA en toda extensión.
export function activate(context: vscode.ExtensionContext) {

  // Registramos un "command" — es lo que aparece en el Command Palette (Ctrl+Shift+P)
  // El string debe coincidir exactamente con el "command" en package.json
  const disposable = vscode.commands.registerCommand('mc-texture-browser.open', () => {
    TextureBrowserPanel.createOrShow(context);
  });

  // Agregar al context.subscriptions es importante:
  // VS Code lo limpia automáticamente cuando se desactiva la extensión
  context.subscriptions.push(disposable);
}

export function deactivate() {}

// ─── Webview Panel ───────────────────────────────────────────────────────────
// Un WebviewPanel es básicamente una pestaña con HTML/CSS/JS dentro de VS Code.
// Podés pensarlo como una mini-app web embebida.
class TextureBrowserPanel {

  // Singleton: solo una instancia del panel a la vez
  public static currentPanel: TextureBrowserPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  // ── Métodos estáticos ────────────────────────────────────────────────────

  public static createOrShow(context: vscode.ExtensionContext) {
    const column = vscode.ViewColumn.Two; // Abrir al lado del editor activo

    // Si ya existe, traerlo al frente
    if (TextureBrowserPanel.currentPanel) {
      TextureBrowserPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Crear nuevo panel
    const panel = vscode.window.createWebviewPanel(
      'mcTextureBrowser',       // ID interno del webview (único)
      'MC Texture Browser',     // Título que aparece en la tab
      column,
      {
        enableScripts: true,    // Permite ejecutar JS en el webview
        retainContextWhenHidden: true, // Mantiene el estado al cambiar de tab
        // localResourceRoots: [] // Aquí iría si tuvieras assets locales
      }
    );

    // Leer textures.json local (generado por: npm run fetch-textures)
    let textures: string[] = [];
    try {
      const jsonPath = path.join(context.extensionPath, 'textures.json');
      textures = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch {
      vscode.window.showErrorMessage(
        'MC Texture Browser: no se encontró textures.json. Ejecutá npm run fetch-textures primero.'
      );
    }

    TextureBrowserPanel.currentPanel = new TextureBrowserPanel(panel, textures);
  }

  // ── Constructor ──────────────────────────────────────────────────────────

  private constructor(panel: vscode.WebviewPanel, textures: string[]) {
    this._panel = panel;
    this._panel.webview.html = this._getHtmlContent();

    this._panel.webview.onDidReceiveMessage(
      (message: { command: string; path?: string }) => {
        if (message.command === 'ready') {
          // Webview listo — enviar datos locales
          this._panel.webview.postMessage({ command: 'textureList', textures });
        } else if (message.command === 'copyPath' && message.path) {
          vscode.env.clipboard.writeText(message.path).then(() => {
            vscode.window.setStatusBarMessage(`✔ Copiado: ${message.path}`, 2500);
          });
        }
      },
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  public dispose() {
    TextureBrowserPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
  }

  // ── HTML del Webview ─────────────────────────────────────────────────────

  private _getHtmlContent(): string {
    const RAW_BASE = 'https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack';
    const nonce = getNonce();

    return /* html */`
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
