# GBADuo companion simulator

Previews [GBADuo](https://github.com/khumam/gba-duo) companion-screen packs in the browser, with the same sizing rules, pages, `onClick` and `update()` ui actions as the app's engine. Edit a pack's `layout.json`, `style.css` or `preview-data.json` in the side editor and the preview updates; saving writes the file back to the pack.

## Setup

Clone it next to the packs repo ([gba-duo-companions](https://github.com/khumam/gba-duo-companions)):

```
gbaduo/                        the app (needed by npm test: one test reads its default.css)
gbaduo-companions/             packs, one folder per pack
gbaduo-companion-simulator/    this repo
```

```sh
npm install
npm run dev     # http://localhost:5173
npm test
```

Packs are read from `../gbaduo-companions`; a folder counts as a pack when it has a `manifest.json`. To use another folder:

```sh
GBADUO_PACKS_DIR=/path/to/packs npm run dev
```

Always confirm the final look on the device.
