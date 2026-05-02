# MC Texture Browser

A VS Code extension for browsing and copying vanilla Minecraft Bedrock texture paths and sound identifiers — without leaving your editor.

![MC Texture Browser](https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack/textures/ui/home_screen_sun.png)

## Features

### 🖼 Texture Browser
- **4 700+ textures** from the official [bedrock-samples](https://github.com/Mojang/bedrock-samples) repository
- Searchable pixel-art grid rendered with `image-rendering: pixelated`
- Filter by category: UI, Items, Blocks, Entity, Particle, Environment, Misc, GUI
- **Hover** → shows the full texture path in a tooltip
- **Click** → copies the path to your clipboard

### 🔊 Sound Browser *(new in 0.1.4)*
- **1 200+ sound identifiers** from the vanilla Bedrock catalog
- Filter by category: Ambient, Block, Music, Hostile, Neutral, Player, UI, Weather, Record and more
- Real-time search by name
- **▶ Play** → preview the sound before using it
- **Click a row** → copies the sound identifier to your clipboard
- Built-in volume control

## Usage

| Action | Result |
|---|---|
| `Ctrl+Shift+P` → **MC Texture Browser: Open** | Opens the texture panel |
| `Ctrl+Shift+T` (while editor is focused) | Shortcut for textures |
| `Ctrl+Shift+P` → **MC Sound Browser: Open** | Opens the sound panel |
| `Ctrl+Shift+Y` (while editor is focused) | Shortcut for sounds |
| Click a texture | Copies the path to clipboard |
| Click a sound row | Copies the identifier to clipboard |
| ▶ button | Plays the sound |

### Textures — ready to paste into JSON:

```json
"texture": "textures/ui/arrow"
```

### Sounds — ready to paste into JSON:

```json
"sound": "block.stone.break"
```

## License

MIT
