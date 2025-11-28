# StructGen

StructGen is a simple desktop tool for Windows (Electron) that generates directory and file structures from a text description in a selected location.

## Features

- **Text-based structure description** – each line describes one directory path and optional files.
- **Real-time structure preview** – see a tree preview on the right side before generating.
- **Root directory selection** – all directories and files are always created only inside the selected root.
- **Two languages** – Lithuanian and English (switchable from settings or top menu).
- **Light / dark theme** – switchable in the top header.

## Structure description format

- Each new line describes one location in the structure.
- Left side up to colon `:` – directory path (`Pro/etc`, `Project/src/js`, etc.).
- Right side after colon – comma-separated list of files in that path.

Example:

```text
Pro/etc: index.html, main.css
Pro/js: main.js
```

Result:

- Directory `Pro` is created.
- Inside it – `etc` and `js` directories.
- In `etc` directory: `index.html`, `main.css`.
- In `js` directory: `main.js`.

> Note: all paths are always limited to the selected root directory. Attempts to "escape" beyond its boundaries are ignored and counted as "skipped" (Skipped).

## Running from source

Requires **Node.js** and **npm**.

```bash
npm install
npm run dev
```

or:

```bash
npm start
```

## Portable `.exe` generation (Windows)

The project uses `electron-builder`.

1. Install dependencies (if not already):

```bash
npm install
```

2. Generate portable `.exe`:

```bash
npm run build
```

3. You'll find the created `StructGen.exe` in the `dist/` directory. This is a portable version that you can copy anywhere.

## Settings and language

- Settings (root directory, language, theme) are saved in `structgen-settings.json` file in Electron `userData` directory.
- Language texts are stored in `locales/lt.json` and `locales/en.json`.

## License

MIT.
