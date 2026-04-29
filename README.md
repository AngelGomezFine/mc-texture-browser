# MC Texture Browser

A VS Code extension for browsing and copying vanilla Minecraft Bedrock texture paths instantly — without leaving your editor.

![MC Texture Browser](https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack/textures/ui/home_screen_sun.png)

## Features

- **4 700+ textures** from the official [bedrock-samples](https://github.com/Mojang/bedrock-samples) repository
- Searchable pixel-art grid — rendered with `image-rendering: pixelated`
- Filter by category: UI, Items, Blocks, Entity, Particle, Environment, Misc, GUI
- **Hover** → shows the full texture path in a tooltip
- **Click** → copies the path (e.g. `textures/ui/arrow.png`) to your clipboard
- Opens next to your active editor

## Installation

### Option A — Install from VSIX (recommended)

1. Download the latest `.vsix` file from the [Releases](https://github.com/AngelGomezFine/mc-texture-browser/releases) page.
2. In VS Code open the Command Palette (`Ctrl+Shift+P`) and run:
   ```
   Extensions: Install from VSIX...
   ```
3. Select the downloaded `.vsix` file.

### Option B — Build from source

```bash
git clone <this-repo>
cd mc-texture-browser
npm install
npm run compile
npx vsce package          # creates mc-texture-browser-x.x.x.vsix
```

Then install the generated `.vsix` as shown in Option A.

## Usage

| Action | Result |
|---|---|
| `Ctrl+Shift+P` → **MC Texture Browser: Open** | Opens the panel |
| `Ctrl+Shift+T` (while editor is focused) | Shortcut to open |
| Click a texture | Copies path to clipboard |
| Hover a texture | Shows full path tooltip |
| Search box | Filter by name (e.g. `arrow`, `heart`, `button`) |
| Category buttons | Filter by folder |

The copied path is ready to paste into any Bedrock JSON file:

```json
"texture": "textures/ui/arrow"
```

## Updating the texture list

The texture list (`textures.json`) ships with the extension and is generated from the bedrock-samples tree. When Mojang releases a new Minecraft version, run:

```bash
npm run fetch-textures
```

This downloads the updated file list from GitHub and regenerates `textures.json`.

## Development

```bash
npm install
npm run compile   # compile TypeScript
# Press F5 in VS Code to launch the Extension Development Host
```

## License

MIT
