## StructGen

![Version](https://img.shields.io/badge/version-1.2.2-orange.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![Tech](https://img.shields.io/badge/Tech-Electron%20%7C%20Node.js-4a6cf7.svg)

🇱🇹 [Lietuvių](#lietuvių-kalba) · 🇬🇧 [English](#english)

---

### Quick navigation

- 🇱🇹 [Apžvalga](#lietuvių-kalba) · [Struktūros formatas](#struktūros-formatas) · [Validacija](#validacija) · [Naudojimas](#naudojimas)
- 🇬🇧 [Overview](#english) · [Structure format](#structure-format) · [Validation](#validation) · [Usage](#usage)

---

## Lietuvių kalba

### Apžvalga

StructGen – įrankis, kuris iš paprasto teksto aprašo sugeneruoja katalogų ir failų medį

- **Tekstinis aprašas → tikra struktūra** (be „klikų“ Explorer’yje)
- **Peržiūra realiu laiku** – dešinėje matai medį dar prieš generuodamas
- **Windows taisyklėmis paremta validacija** – draudžiami simboliai, rezervuoti vardai, max vardų ir pilno kelio ilgis

### Struktūros formatas

- Kiekviena eilutė aprašo vieną vietą struktūroje
- Bendras formatas: `katalogų_kelias: failų_sąrašas`
- Prieš `:` – katalogų kelias (pvz. `src/components`, `public/assets/images`)
- Po `:` – failų sąrašas, atskirtas kableliais
- Katalogai skiriami `/`; gali būti tik katalogas be `:` (sukuriamas tik katalogas)

**Pagrindiniai pavyzdžiai:**

```text
src/components: Button.jsx, Card.jsx
src/utils: helpers.js, constants.js
public: index.html, favicon.ico

src/components/ui/buttons: PrimaryButton.tsx, SecondaryButton.tsx

: README.md, .gitignore, package.json
```

> **Pastaba:** visi keliai visada lieka pasirinkto root ribose; bandymai išeiti už ribų ignoruojami ir skaičiuojami kaip *Praleista (Skipped)*. Esami failai / katalogai neperrašomi.

### Validacija

StructGen validuoja įvestį **realiu laiku** ir dar kartą paspaudus **Generate**:

- Draudžiami simboliai: `< > : " / \ | ? *` ir valdymo simboliai (0–31)
- Rezervuoti vardai: `CON`, `PRN`, `AUX`, `NUL`, `COM1–COM9`, `LPT1–LPT9` ir pan.
- Vardas negali baigtis tarpu ar tašku
- `.` ir `..` negali būti naudojami kaip katalogų ar failų pavadinimai
- Vieno vardo max ilgis – **255 simboliai**
- Pilno kelio (`root + santykinis kelias`) ilgis ribojamas iki ~**260 simbolių**

### Naudojimas

- **Paleidimas iš kodo** (reikia **Node.js** ir **npm**):
  ```bash
  npm install
  npm run dev
  # arba
  npm start
  ```
- **Portable `.exe` (Windows)** – naudojamas `electron-builder`:
  ```bash
  npm install
  npm run build
  ```
  Sugeneruotą `StructGen.exe` rasi `dist/` kataloge.

## English

### Overview

StructGen is desktop tool that turns a plain text description into a real folder & file tree.

- **Text → structure** without manual folder creation
- **Live tree preview** before generating anything on disk
- **Windows-aware validation** – invalid characters, reserved names, name length and full path length

### Structure format

- Each line describes one location in the structure
- General format: `folder_path: file_list`
- Before `:` – folder path (e.g. `src/components`, `public/assets/images`)
- After `:` – comma-separated list of files in that path
- Folders are separated with `/`; a line can contain only a folder (no `:`)

**Core examples:**

```text
src/components: Button.jsx, Card.jsx
src/utils: helpers.js, constants.js
public: index.html, favicon.ico

src/components/ui/buttons: PrimaryButton.tsx, SecondaryButton.tsx

: README.md, .gitignore, package.json
```

> **Important:** all paths are always constrained to the selected root directory. Attempts to go outside are ignored and counted as *Skipped*. Existing files/directories are never overwritten.

### Validation

StructGen validates input **in real time** and again on **Generate**:

- Disallowed characters: `< > : " / \ | ? *` and control characters (0–31)
- Reserved names: `CON`, `PRN`, `AUX`, `NUL`, `COM1–COM9`, `LPT1–LPT9`, etc.
- Names cannot end with a space or dot
- `.` and `..` cannot be used as directory or file names
- Single name max length – **255 characters**
- Full path (`root + relative path`) is limited to about **260 characters**

### Usage

- **Run from source** (requires **Node.js** and **npm**):
  ```bash
  npm install
  npm run dev
  # or
  npm start
  ```
- **Portable `.exe` (Windows)** – uses `electron-builder`:
  ```bash
  npm install
  npm run build
  ```
  The generated `StructGen.exe` will be placed in the `dist/` folder.

---
