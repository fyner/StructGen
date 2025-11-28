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
// Automatiškai aptinkame visas kalbas iš locales katalogo
// Grąžiname objektą su kalbos kodu ir failo pavadinimu
function getAvailableLanguages() {
  const localesDir = path.join(__dirname, '../locales');
  const languages = [];
  
  try {
    const files = fs.readdirSync(localesDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(localesDir, file);
        try {
          // Skaityti JSON failą, kad gautume languageCode
          const raw = fs.readFileSync(filePath, 'utf-8');
          const json = JSON.parse(raw);
          const languageCode = json.app?.languageCode || file.replace('.json', '');
          languages.push({
            code: languageCode,
            file: file.replace('.json', '')
          });
        } catch (err) {
          console.error(`Failed to read ${file}`, err);
          // Fallback į failo pavadinimą
          languages.push({
            code: file.replace('.json', ''),
            file: file.replace('.json', '')
          });
        }
      }
    }
  } catch (err) {
    console.error('Failed to read locales directory', err);
    return []; // Grąžiname tuščią masyvą, jei nepavyko nuskaityti
  }
  
  return languages; // Grąžiname masyvą su {code, file} objektais
}

function loadTranslations(langCode) {
  const availableLanguages = getAvailableLanguages();
  // Rasti kalbos failą pagal kodą
  const langInfo = availableLanguages.find(lang => lang.code === langCode);
  if (!langInfo) {
    // Jei nerasta pagal kodą, naudojame pirmąją iš sąrašo
    const firstLang = availableLanguages[0];
    if (!firstLang) {
      console.error('No languages available');
      return {};
    }
    const filePath = path.join(__dirname, `../locales/${firstLang.file}.json`);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      console.error('Failed to load translations', err);
      return {};
    }
  }
  const filePath = path.join(__dirname, `../locales/${langInfo.file}.json`);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load translations', err);
    return {};
  }
}

ipcMain.handle('get-available-languages', () => {
  return getAvailableLanguages();
});

// IPC – gauti kalbos pavadinimą pagal kodą
ipcMain.handle('get-language-name', (event, langCode) => {
  try {
    const translations = loadTranslations(langCode);
    return translations.app?.languageName || langCode.toUpperCase();
  } catch (err) {
    console.error('Failed to get language name', err);
    return langCode.toUpperCase();
  }
});

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

// Case-insensitive kelio egzistavimo tikrinimas (Windows)
// Windows'e fs.existsSync() jau yra case-insensitive, bet patikrinsime tiksliau
// naudojant realpathSync, kuris grąžina tikrąjį kelio pavadinimą
function findExistingPathCaseInsensitive(filePath) {
  try {
    // Pirmiausia patikrinkime ar kelias egzistuoja
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    // Windows'e realpathSync grąžina tikrąjį kelio pavadinimą (su teisingais raidžių dydžiais)
    try {
      return fs.realpathSync(filePath);
    } catch {
      // Jei realpathSync nepavyko, naudosime originalų kelio pavadinimą
      return filePath;
    }
  } catch {
    return null;
  }
}

// IPC – tikrinimas, kurie keliai egzistuoja (naudojama peržiūroje realiu laiku)
ipcMain.handle('check-paths-exist', (event, { rootDir, paths }) => {
  if (!rootDir || !paths || !Array.isArray(paths)) {
    return {};
  }

  const rootResolved = path.resolve(rootDir);
  const result = {};

  for (const relPath of paths) {
    const fullPath = path.join(rootResolved, relPath);
    // Tikriname tik jei kelias yra root viduje (saugumo sumetimais)
    if (isPathInsideRoot(rootResolved, fullPath)) {
      // Windows'e fs.existsSync() jau yra case-insensitive
      result[relPath] = fs.existsSync(fullPath);
    } else {
      result[relPath] = false;
    }
  }

  return result;
});

ipcMain.handle('generate-structure', (event, { input, rootDir }) => {
  if (!rootDir) {
    return {
      success: false,
      errorCode: 'NO_ROOT'
    };
  }

  const rootResolved = path.resolve(rootDir);
  const parsed = parseStructureInput(input);

  // Skaičiuojame tik realiai naujai sukurtus katalogus šiame generavimo paleidime.
  // Jei katalogas jau egzistuoja root viduje – jo neperrašome ir į „sukurtus“ jo neskaičiuojame.
  let createdDirs = 0;
  let createdFiles = 0;
  let skippedDirs = 0;
  let skippedFiles = 0;

  // Sekame, kurie katalogai buvo sukurti šiame generavimo paleidime (case-insensitive)
  // Tai reikalinga, kad neteisingai neskaičiuotume katalogų kaip praleistų,
  // jei jie buvo sukurti ankstesnėse eilutėse šiame generavimo paleidime
  const createdDirsInThisRun = new Set();
  
  // Sekame, kurie failai buvo sukurti šiame generavimo paleidime (case-insensitive)
  // Tai reikalinga, kad neteisingai neskaičiuotume failų kaip praleistų,
  // jei jie buvo sukurti ankstesnėse eilutėse šiame generavimo paleidime
  const createdFilesInThisRun = new Set();

  try {
    for (const item of parsed) {
      const dirRelative = item.directory || ''; // pvz. Pro/etc arba ''
      const dirSegments = dirRelative
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean);

      const targetDir = path.join(rootResolved, ...dirSegments);

      // Jei bandome išeiti už root ribų – skaičiuojame kaip praleistus tiek katalogą, tiek failus.
      if (!isPathInsideRoot(rootResolved, targetDir)) {
        if (dirRelative) {
          skippedDirs++;
        }
        skippedFiles += item.files.length;
        continue;
      }

      // Kuriame katalogą tik jei jo dar nėra – taip tiksliai skaičiuojame naujai sukurtus katalogus.
      // Jei katalogas jau egzistuoja – skaičiuojame kaip praleistą (jei tai ne root katalogas).
      if (dirRelative) {
        // Tik jei tai ne root katalogas (turi būti kelias)
        // Windows'e fs.existsSync() jau yra case-insensitive, bet patikrinsime tiksliau
        const existingPath = findExistingPathCaseInsensitive(targetDir);
        const dirExists = existingPath !== null;
        
        // Patikrinkime, ar šis katalogas buvo sukurtas šiame generavimo paleidime
        const dirKey = targetDir.toLowerCase();
        const wasCreatedInThisRun = createdDirsInThisRun.has(dirKey);
        
        if (!dirExists) {
          // Prieš kurdami, patikrinkime visus tarpinius katalogus ir nustatykime, kurie jau egzistavo
          // Kiekvienas katalogas tikrinamas pagal savo pilną kelią (pvz., "pro" ir "oni/pro" yra skirtingi)
          let currentPath = rootResolved;
          for (const segment of dirSegments) {
            currentPath = path.join(currentPath, segment);
            const currentKey = currentPath.toLowerCase();
            
            // Patikrinkime, ar šis katalogas jau buvo sukurtas šiame generavimo paleidime
            const wasCurrentCreatedInThisRun = createdDirsInThisRun.has(currentKey);
            
            if (!wasCurrentCreatedInThisRun) {
              // Patikrinkime, ar šis katalogas jau egzistavo prieš šį generavimo paleidimą
              const currentExists = findExistingPathCaseInsensitive(currentPath) !== null;
              
              if (currentExists) {
                // Katalogas jau egzistavo prieš šį generavimo paleidimą – skaičiuojame kaip praleistą
                skippedDirs++;
                createdDirsInThisRun.add(currentKey); // Pažymime, kad jis jau buvo
              }
            }
          }
          
          // Dabar sukuriame visą kelią (su visais tarpiniais)
          fs.mkdirSync(targetDir, { recursive: true });
          
          // Skaičiuojame visus katalogus, kurie buvo sukurti (tiek tarpinius, tiek pagrindinį)
          currentPath = rootResolved;
          for (const segment of dirSegments) {
            currentPath = path.join(currentPath, segment);
            const currentKey = currentPath.toLowerCase();
            
            // Patikrinkime, ar šis katalogas jau buvo sukurtas šiame generavimo paleidime
            const wasCurrentCreatedInThisRun = createdDirsInThisRun.has(currentKey);
            
            if (!wasCurrentCreatedInThisRun) {
              // Katalogas buvo sukurtas dabar – skaičiuojame jį
              createdDirs++;
              createdDirsInThisRun.add(currentKey);
            }
          }
        } else if (!wasCreatedInThisRun) {
          // Katalogas jau egzistavo prieš šį generavimo paleidimą
          // Skaičiuojame VISUS katalogus (tiek tarpinius, tiek pagrindinį) kaip praleistus, jei jie jau egzistavo
          let currentPath = rootResolved;
          for (const segment of dirSegments) {
            currentPath = path.join(currentPath, segment);
            const currentKey = currentPath.toLowerCase();
            
            // Patikrinkime, ar šis katalogas jau buvo sukurtas šiame generavimo paleidime
            const wasCurrentCreatedInThisRun = createdDirsInThisRun.has(currentKey);
            
            if (!wasCurrentCreatedInThisRun) {
              // Patikrinkime, ar šis katalogas jau egzistavo prieš šį generavimo paleidimą
              const currentExists = findExistingPathCaseInsensitive(currentPath) !== null;
              
              if (currentExists) {
                // Katalogas jau egzistavo prieš šį generavimo paleidimą – skaičiuojame kaip praleistą
                skippedDirs++;
                createdDirsInThisRun.add(currentKey); // Pažymime, kad jis jau buvo
              }
            }
          }
        }
        // Jei katalogas buvo sukurtas šiame paleidime, nieko nedarome (jau suskaičiuotas)
      }

      for (const fileName of item.files) {
        const targetFile = path.join(targetDir, fileName);

        if (!isPathInsideRoot(rootResolved, targetFile)) {
          skippedFiles++;
          continue;
        }

        // Patikrinkime, ar šis failas buvo sukurtas šiame generavimo paleidime
        const fileKey = targetFile.toLowerCase();
        const wasFileCreatedInThisRun = createdFilesInThisRun.has(fileKey);
        
        // Jei failas jau egzistuoja (case-insensitive) – jo neperrašome ir skaičiuojame kaip praleistą.
        const existingFilePath = findExistingPathCaseInsensitive(targetFile);
        if (existingFilePath !== null && !wasFileCreatedInThisRun) {
          // Failas jau egzistavo prieš šį generavimo paleidimą – skaičiuojame kaip praleistą
          skippedFiles++;
          continue;
        }
        
        // Jei failas buvo sukurtas šiame paleidime, nieko nedarome (jau suskaičiuotas)
        if (wasFileCreatedInThisRun) {
          continue;
        }

        // Tuščias failas – kuriame tik jei tokio dar nėra
        fs.writeFileSync(targetFile, '', { encoding: 'utf-8' });
        createdFiles++;
        createdFilesInThisRun.add(fileKey);
      }
    }

    return {
      success: true,
      createdDirs,
      createdFiles,
      skipped: skippedDirs + skippedFiles,
      skippedDirs,
      skippedFiles
    };
  } catch (err) {
    console.error('generate-structure failed', err);
    return {
      success: false,
      errorCode: 'FS_ERROR',
      createdDirs,
      createdFiles,
      skipped: skippedDirs + skippedFiles,
      skippedDirs,
      skippedFiles
    };
  }
});

