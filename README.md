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

Search for **MC Texture Browser** in the VS Code Extensions panel (`Ctrl+Shift+X`) and click **Install**.

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

## License

MIT
