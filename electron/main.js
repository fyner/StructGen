const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const { parseStructureInput } = require('../src/parser');
const { loadSettings, saveSettings, getSettingsFilePath } = require('../src/settingsStore');

let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 780,
    height: 650,
    resizable: false,       // fiksuotas lango dydis
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../assets/structgen-icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'StructGen'
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  loadSettings(app.getPath('userData'));
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('get-settings', () => {
  return loadSettings(app.getPath('userData'));
});

ipcMain.handle('save-settings', (event, newSettings) => {
  const current = loadSettings(app.getPath('userData'));
  const merged = {
    ...current,
    ...newSettings
  };
  saveSettings(app.getPath('userData'), merged);
  return merged;
});

ipcMain.handle('choose-root-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// IPC – vertimai
function loadTranslations(langCode) {
  const safeLang = langCode === 'lt' ? 'lt' : 'en';
  const filePath = path.join(__dirname, `../locales/${safeLang}.json`);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load translations', err);
    return {};
  }
}

ipcMain.handle('get-translations', (event, langCode) => {
  return loadTranslations(langCode);
});

// IPC – struktūros generavimas
function isPathInsideRoot(rootDir, targetPath) {
  const rootNormalized = path.resolve(rootDir);
  const targetNormalized = path.resolve(targetPath);

  const relative = path.relative(rootNormalized, targetNormalized);

  // viduje root, jei kelias nėra išeinantis į viršų ir nėra absoliutus
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

ipcMain.handle('generate-structure', (event, { input, rootDir }) => {
  if (!rootDir) {
    return {
      success: false,
      errorCode: 'NO_ROOT'
    };
  }

  const rootResolved = path.resolve(rootDir);
  const parsed = parseStructureInput(input);

  let createdDirs = 0;
  let createdFiles = 0;
  let skipped = 0;

  for (const item of parsed) {
    const dirRelative = item.directory; // pvz. Pro/etc
    const dirSegments = dirRelative
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);

    const targetDir = path.join(rootResolved, ...dirSegments);

    if (!isPathInsideRoot(rootResolved, targetDir)) {
      skipped += item.files.length;
      continue;
    }

    fs.mkdirSync(targetDir, { recursive: true });
    createdDirs++;

    for (const fileName of item.files) {
      const targetFile = path.join(targetDir, fileName);

      if (!isPathInsideRoot(rootResolved, targetFile)) {
        skipped++;
        continue;
      }

      // Tuščias failas arba perrašymas, kol kas be turinio generavimo
      fs.writeFileSync(targetFile, '', { encoding: 'utf-8' });
      createdFiles++;
    }
  }

  return {
    success: true,
    createdDirs,
    createdFiles,
    skipped
  };
});


