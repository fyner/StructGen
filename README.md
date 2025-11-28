# StructGen

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![Electron](https://img.shields.io/badge/Electron-39.2.4-47848F?logo=electron)
![Node](https://img.shields.io/badge/Node.js-LTS-green?logo=node.js)
![Version](https://img.shields.io/badge/version-1.1.0-orange.svg)

**🇱🇹 [Lietuvių kalba](#lietuvių-kalba) | 🇬🇧 [English](#english)**

---

## Lietuvių kalba

### Apie

StructGen – tai paprastas desktop įrankis Windows (Electron), kuris iš teksto aprašo sugeneruoja katalogų ir failų struktūrą pasirinktoje vietoje.

### Funkcijos

- **Tekstinis struktūros aprašas** – kiekviena eilutė aprašo vieną katalogų kelią ir pasirenkamus failus
- **Struktūros peržiūra realiu laiku** – dešinėje pusėje matai medžio peržiūrą su paveikslėliais ir atitraukimais dar prieš generuodamas
- **Alfabetinis rūšiavimas** – katalogai ir failai automatiškai rūšiuojami pagal abėcėlę (katalogai pirmiau, tada failai)
- **Root katalogo pasirinkimas** – visi katalogai ir failai visada kuriami tik pasirinkto root viduje
- **Dvi kalbos** – lietuvių ir anglų (perjungiama iš nustatymų arba viršutinio meniu)
- **Šviesi / tamsi tema** – perjungiama viršutiniame header'yje
- **Modernus UI** – spalvotos SVG ikonos, modernios scroll juostos, minimalistinis dizainas

### Struktūros aprašo formatas

- Kiekviena nauja eilutė aprašo vieną vietą struktūroje
- Formatas: `katalogų_kelias: failų_sąrašas`
- Kairėje iki dvitaškio `:` – katalogų kelias (pvz., `src/components`, `public/assets/images`)
- Dešinėje po dvitaškio – kableliais atskirtas failų sąrašas tame kelyje
- Katalogai atskiriami `/` simboliu
- Galite sukurti bet kokio gylio struktūrą

#### Pavyzdžiai

**Paprastas pavyzdys:**
```text
src/components: Button.jsx, Card.jsx
src/utils: helpers.js, constants.js
public: index.html, favicon.ico
```

**Gilus katalogų struktūra:**
```text
src/components/ui/buttons: PrimaryButton.tsx, SecondaryButton.tsx
src/utils/helpers: stringUtils.js, dateUtils.js
```

**Root lygio failai:**
```text
: README.md, .gitignore, package.json
```

> **Svarbu:** Visi keliai visada ribojami pasirinkto root katalogo. Bandymai „išeiti" už jo ribų ignoruojami ir skaičiuojami kaip „praleisti" (Skipped). Jei katalogas ar failas jau egzistuoja, jis neperrašomas.

### Paleidimas iš kodo

Reikalinga **Node.js** ir **npm**.

```bash
npm install
npm run dev
```

arba:

```bash
npm start
```

### Portable `.exe` generavimas (Windows)

Projektas naudoja `electron-builder`.

1. Įdiegti priklausomybes (jei dar ne):

```bash
npm install
```

2. Sugeneruoti portable `.exe`:

```bash
npm run build
```

3. Sukurtą `StructGen.exe` rasi kataloge `dist/`. Tai yra portable versija, kurią gali kopijuoti kur nori.

### Nustatymai ir kalba

- Nustatymai (root katalogas, kalba, tema) saugomi faile `structgen-settings.json` Electron `userData` kataloge
- Kalbos tekstai saugomi `locales/lt.json` ir `locales/en.json`

### Planuojami patobulinimai

- **Įvesties validacija** – realaus laiko validacija struktūros aprašo įvedimo metu su aiškiomis klaidų žinutėmis

### Licencija

MIT

---

## English

### About

StructGen is a simple desktop tool for Windows (Electron) that generates folder and file structures from a text description in the selected location.

### Features

- **Text-based structure definition** – each line describes one folder path and optional files
- **Real-time structure preview** – see a tree preview with icons and indentation on the right side before generating
- **Alphabetical sorting** – folders and files are automatically sorted alphabetically (folders first, then files)
- **Root directory selection** – all folders and files are always created only inside the selected root
- **Two languages** – Lithuanian and English (switchable from settings or top menu)
- **Light / dark theme** – switchable in the top header
- **Modern UI** – colorful SVG icons, modern scrollbars, minimalist design

### Structure definition format

- Each new line describes one location in the structure
- Format: `folder_path: file_list`
- Left side before colon `:` – folder path (e.g., `src/components`, `public/assets/images`)
- Right side after colon – comma-separated list of files in that path
- Folders are separated with `/` symbol
- You can create structures of any depth

#### Examples

**Simple example:**
```text
src/components: Button.jsx, Card.jsx
src/utils: helpers.js, constants.js
public: index.html, favicon.ico
```

**Deep folder structure:**
```text
src/components/ui/buttons: PrimaryButton.tsx, SecondaryButton.tsx
src/utils/helpers: stringUtils.js, dateUtils.js
```

**Root level files:**
```text
: README.md, .gitignore, package.json
```

> **Important:** All paths are always limited to the selected root directory. Attempts to go outside its boundaries are ignored and counted as "Skipped". If a folder or file already exists, it is not overwritten.

### Running from source

Requires **Node.js** and **npm**.

```bash
npm install
npm run dev
```

or:

```bash
npm start
```

### Portable `.exe` generation (Windows)

The project uses `electron-builder`.

1. Install dependencies (if not already):

```bash
npm install
```

2. Generate portable `.exe`:

```bash
npm run build
```

3. You'll find `StructGen.exe` in the `dist/` folder. This is a portable version that you can copy anywhere.

### Settings and language

- Settings (root directory, language, theme) are saved in `structgen-settings.json` file in Electron `userData` directory
- Language texts are stored in `locales/lt.json` and `locales/en.json`

### Planned improvements

- **Input validation** – real-time validation during structure definition input with clear error messages

### License

MIT
