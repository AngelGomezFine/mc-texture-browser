# MC Texture Browser — Extension para VS Code

Navega y copia paths de texturas vanilla de Minecraft Bedrock directamente en tu editor.

## 🚀 Cómo correrla por primera vez

```bash
# 1. Instalar dependencias
npm install

# 2. Compilar TypeScript a JavaScript
npm run compile

# 3. Abrir en VS Code y presionar F5
#    → Se abre una ventana nueva con la extensión activa
```

Luego: `Ctrl+Shift+P` → **MC Texture Browser: Open**  
O shortcut directo: `Ctrl+Shift+T`

---

## 📁 Estructura del proyecto

```
mc-texture-browser/
├── package.json        ← "Manifiesto" de la extensión (muy importante)
├── tsconfig.json       ← Configuración de TypeScript
├── .vscodeignore       ← Qué NO empaquetar al publicar
├── src/
│   └── extension.ts    ← Todo el código de la extensión
└── out/                ← JS compilado (se genera con npm run compile)
```

---

## 🧠 Conceptos clave de VS Code Extensions

### 1. `package.json` — El manifiesto
Es el corazón de la extensión. Define:
- **`contributes.commands`** → Los comandos que aparecen en el Command Palette
- **`activationEvents`** → Cuándo se activa la extensión (vacío = siempre)
- **`main`** → El archivo JS de entrada (`out/extension.js`)
- **`engines.vscode`** → Versión mínima de VS Code requerida

```json
"contributes": {
  "commands": [{
    "command": "mc-texture-browser.open",  // ID único
    "title": "MC Texture Browser: Open"    // Lo que ve el usuario
  }]
}
```

### 2. `activate()` — Punto de entrada
```typescript
export function activate(context: vscode.ExtensionContext) {
  // Se ejecuta cuando VS Code activa tu extensión
  // Acá registrás comandos, event listeners, etc.
}
```

### 3. `vscode.commands.registerCommand()` — Registrar comandos
Conecta el ID del comando con una función:
```typescript
vscode.commands.registerCommand('mi-ext.miComando', () => {
  // Código que se ejecuta cuando el usuario usa el comando
});
```

### 4. `WebviewPanel` — Mini-app web dentro de VS Code
Es una pestaña con HTML/CSS/JS completo. Dos partes:
- **Extensión (TypeScript)** → Crea el panel, escucha mensajes
- **Webview (HTML/JS)** → La UI, envía mensajes a la extensión

```
[Extensión] ←→ postMessage ←→ [Webview HTML]
```

### 5. Comunicación bidireccional
**Webview → Extensión:**
```javascript
// En el HTML del webview
const vscode = acquireVsCodeApi(); // Solo se llama UNA vez
vscode.postMessage({ command: 'copyPath', path: 'textures/ui/arrow.png' });
```

**Extensión recibe:**
```typescript
panel.webview.onDidReceiveMessage(message => {
  if (message.command === 'copyPath') {
    vscode.env.clipboard.writeText(message.path);
  }
});
```

### 6. Content Security Policy (CSP)
El webview tiene restricciones de seguridad. Hay que declarar
explícitamente qué orígenes puede usar:
```html
<meta http-equiv="Content-Security-Policy"
  content="img-src https://raw.githubusercontent.com;
           connect-src https://api.github.com;">
```

---

## 🔧 Cómo funciona esta extensión

1. El usuario abre el panel (comando o shortcut)
2. El webview se carga y hace `fetch()` al **GitHub Tree API** de `bedrock-samples`
3. Filtra todos los `.png` dentro de `resource_pack/textures/`
4. Renderiza una grilla con las imágenes (cargadas desde raw.githubusercontent.com)
5. El usuario busca/filtra → click en una textura → se copia el path al clipboard

### Path copiado (ejemplo):
```
textures/ui/arrow.png
```

### URL de imagen usada internamente:
```
https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack/textures/ui/arrow.png
```

---

## 📦 Publicar en el Marketplace

```bash
# Instalar la herramienta de publicación
npm install -g @vscode/vsce

# Empaquetar como .vsix (para instalar manualmente)
vsce package

# Publicar (necesitás una cuenta en marketplace.visualstudio.com)
vsce publish
```

Para publicar necesitás:
1. Cuenta en https://marketplace.visualstudio.com
2. Un Personal Access Token de Azure DevOps
3. Publisher ID (en `package.json` → `"publisher": "finearts"`)

---

## 🛠 Agregar más features

### Insertar el path directamente en el editor activo:
```typescript
const editor = vscode.window.activeTextEditor;
if (editor) {
  editor.edit(edit => {
    edit.insert(editor.selection.active, message.path);
  });
}
```

### Guardar texturas favoritas:
```typescript
// Usar el storage de la extensión (persiste entre sesiones)
context.globalState.update('favorites', ['textures/ui/arrow.png']);
const favs = context.globalState.get<string[]>('favorites', []);
```

### Preview grande al hover:
En el webview, mostrar un `<img>` grande en un overlay cuando se hace hover.
