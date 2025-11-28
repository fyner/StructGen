const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const { validateStructureInput } = require('../src/validation/structureValidator');
const { loadSettings, saveSettings, getSettingsFilePath } = require('../src/settingsStore');

let mainWindow = null;

function createMainWindow() {
  // Main application window. This is intentionally non-resizable so the
  // layout matches the design pixel‑perfectly and testing/debugging is easier.
  mainWindow = new BrowserWindow({
    width: 780,
    height: 650,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    // Application icon (used in the taskbar, window chrome, etc.)
    icon: path.join(__dirname, '../assets/structgen-icon.ico'),
    webPreferences: {
      // Security: disable Node.js integration in the renderer
      nodeIntegration: false,
      // Security: isolate the renderer context and expose a minimal API via preload
      contextIsolation: true,
      // Preload script that defines the safe `window.electronAPI` bridge
      preload: path.join(__dirname, 'preload.js')
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

// IPC – translations
// Discover every available language by scanning the `locales` directory.
// Each JSON file is treated as one language; we infer the language code either
// from `app.languageCode` in the JSON or from the filename itself.
function getAvailableLanguages() {
  const localesDir = path.join(__dirname, '../locales');
  const languages = [];
  
  try {
    const files = fs.readdirSync(localesDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(localesDir, file);
        try {
          // Read JSON file to extract the language code and metadata
          const raw = fs.readFileSync(filePath, 'utf-8');
          const json = JSON.parse(raw);
          const languageCode = json.app?.languageCode || file.replace('.json', '');
          languages.push({
            code: languageCode,
            file: file.replace('.json', '')
          });
        } catch (err) {
          console.error(`Failed to read ${file}`, err);
          // Fallback: if parsing fails, still expose this file as a language entry
          languages.push({
            code: file.replace('.json', ''),
            file: file.replace('.json', '')
          });
        }
      }
    }
  } catch (err) {
    console.error('Failed to read locales directory', err);
    // On error we return an empty list so the renderer can gracefully hide
    // language‑related UI instead of crashing.
    return [];
  }
  
  // Array of objects: { code, file } where `file` is the basename without .json
  return languages;
}

function loadTranslations(langCode) {
  const availableLanguages = getAvailableLanguages();
  // Find translation file by language code
  const langInfo = availableLanguages.find(lang => lang.code === langCode);
  if (!langInfo) {
    // Fallback: if requested language is not found, use the first available one
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

// IPC – resolve a human‑readable language name by its code
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

// IPC – on-demand structure validation (no file-system writes).
// This allows the renderer to provide soft, real-time feedback while the
// user is typing, using exactly the same validation rules as generation.
// If a `rootDir` is provided, we also validate approximate full path length
// (`root + relativePath`) against a reasonable Windows limit.
ipcMain.handle('validate-structure', (event, { input, rootDir }) => {
  try {
    const options = rootDir ? { rootDir } : {};
    return validateStructureInput(input || '', options);
  } catch (err) {
    console.error('validate-structure failed', err);
    return {
      isValid: false,
      // Return a synthetic error entry so that callers can surface a clear
      // validation failure instead of silently proceeding with an empty set.
      errors: [
        {
          code: 'INTERNAL_VALIDATION_ERROR',
          messageKey: 'generic',
          where: 'internal',
          line: null,
          segment: null
        }
      ],
      parsed: [],
      lines: []
    };
  }
});

// IPC – structure generation
function isPathInsideRoot(rootDir, targetPath) {
  const rootNormalized = path.resolve(rootDir);
  const targetNormalized = path.resolve(targetPath);

  const relative = path.relative(rootNormalized, targetNormalized);
  // A path is considered inside root if it does not traverse upwards (`..`)
  // and the computed relative path is not absolute.
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

// Case‑insensitive path existence check (primarily for Windows).
// - `fs.existsSync` on Windows is already case‑insensitive, but we normalize
//   the path via `realpathSync` to get the canonical casing when possible.
function findExistingPathCaseInsensitive(filePath) {
  try {
    // Fast path: if the path clearly does not exist, stop early.
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    // On Windows, `realpathSync` returns the canonical path (including casing).
    try {
      return fs.realpathSync(filePath);
    } catch {
      // If `realpathSync` fails (e.g. network share quirks), fall back to the
      // original path – we still know it exists from `existsSync` above.
      return filePath;
    }
  } catch {
    return null;
  }
}

// IPC – bulk check which relative paths already exist on disk.
// Used by the live structure preview to visually distinguish existing items.
ipcMain.handle('check-paths-exist', (event, { rootDir, paths }) => {
  if (!rootDir || !paths || !Array.isArray(paths)) {
    return {};
  }

  const rootResolved = path.resolve(rootDir);
  const result = {};

  for (const relPath of paths) {
    const fullPath = path.join(rootResolved, relPath);
    // Only report existence for paths that are inside the configured root.
    // This prevents accidental information disclosure outside the workspace.
    if (isPathInsideRoot(rootResolved, fullPath)) {
      // On Windows, `fs.existsSync` is effectively case‑insensitive.
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

  // Run structural validation (Windows naming rules etc.). For now, we only
  // block generation if there are *any* errors, and we return them to the
  // renderer to be displayed appropriately. We pass the resolved root so that
  // full path length constraints can be evaluated.
  const validation = validateStructureInput(input || '', { rootDir: rootResolved });
  if (!validation.isValid && validation.errors.length > 0) {
    return {
      success: false,
      errorCode: 'VALIDATION_ERROR',
      validation
    };
  }

  const parsed = validation.parsed;

  // We count only directories/files that are actually created in this run.
  // Anything that already exists under the root is treated as "skipped"
  // so the user gets an accurate summary of what changed.
  let createdDirs = 0;
  let createdFiles = 0;
  let skippedDirs = 0;
  let skippedFiles = 0;

  // Track which directories were created in this run (case‑insensitive).
  // This prevents double‑counting when the same logical directory appears
  // multiple times in the parsed structure description.
  const createdDirsInThisRun = new Set();
  
  // Track which files were created in this run (case‑insensitive) for the
  // same reason as `createdDirsInThisRun` above.
  const createdFilesInThisRun = new Set();

  try {
    for (const item of parsed) {
      // Directory path relative to the root (e.g. "src/components" or "").
      const dirRelative = item.directory || '';
      const dirSegments = dirRelative
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean);

      const targetDir = path.join(rootResolved, ...dirSegments);

      // If the directory points outside the configured root, we treat both the
      // directory and all its files as skipped for safety reasons.
      if (!isPathInsideRoot(rootResolved, targetDir)) {
        if (dirRelative) {
          skippedDirs++;
        }
        skippedFiles += item.files.length;
        continue;
      }

      // Only create a directory if it does not already exist. This guarantees
      // that the "created" / "skipped" counters are accurate and that we never
      // overwrite existing content.
      if (dirRelative) {
        // Non‑empty relative path means this is not the root itself.
        // We still use a case‑insensitive existence check helper for robustness.
        const existingPath = findExistingPathCaseInsensitive(targetDir);
        const dirExists = existingPath !== null;
        
        // Check whether this exact directory was already created in this run.
        const dirKey = targetDir.toLowerCase();
        const wasCreatedInThisRun = createdDirsInThisRun.has(dirKey);
        
        if (!dirExists) {
          // Before creating the final directory, walk through all intermediate
          // segments and determine which of them already existed beforehand.
          // Each path segment is treated separately (e.g. "pro" vs "oni/pro").
          let currentPath = rootResolved;
          for (const segment of dirSegments) {
            currentPath = path.join(currentPath, segment);
            const currentKey = currentPath.toLowerCase();

            // Check if this intermediate directory was already created in this run.
            const wasCurrentCreatedInThisRun = createdDirsInThisRun.has(currentKey);
            
            if (!wasCurrentCreatedInThisRun) {
              // Check if the directory existed *before* this run. If it did,
              // we count it as skipped rather than created.
              const currentExists = findExistingPathCaseInsensitive(currentPath) !== null;
              
              if (currentExists) {
                // Directory existed before this run – treat it as skipped.
                skippedDirs++;
                // Mark it as seen so we do not re‑evaluate it again later.
                createdDirsInThisRun.add(currentKey);
              }
            }
          }
          
          // Now create the entire directory tree (including intermediates).
          fs.mkdirSync(targetDir, { recursive: true });
          
          // Count every directory that was actually created in this run
          // (both intermediate and final directories).
          currentPath = rootResolved;
          for (const segment of dirSegments) {
            currentPath = path.join(currentPath, segment);
            const currentKey = currentPath.toLowerCase();

            // Skip counting if we have already marked this directory as created.
            const wasCurrentCreatedInThisRun = createdDirsInThisRun.has(currentKey);
            
            if (!wasCurrentCreatedInThisRun) {
              // Directory was just created now – increase the counter.
              createdDirs++;
              createdDirsInThisRun.add(currentKey);
            }
          }
        } else if (!wasCreatedInThisRun) {
          // The directory (in some casing) already existed before this run.
          // We walk through all its segments and count them as skipped if they
          // were pre‑existing but not yet recorded in `createdDirsInThisRun`.
          let currentPath = rootResolved;
          for (const segment of dirSegments) {
            currentPath = path.join(currentPath, segment);
            const currentKey = currentPath.toLowerCase();

            // If this directory was created earlier in this run, skip it.
            const wasCurrentCreatedInThisRun = createdDirsInThisRun.has(currentKey);
            
            if (!wasCurrentCreatedInThisRun) {
              // Directory existed before this run – count it as skipped and
              // mark as seen so we don't re‑evaluate it again.
              const currentExists = findExistingPathCaseInsensitive(currentPath) !== null;
              
              if (currentExists) {
                skippedDirs++;
                createdDirsInThisRun.add(currentKey);
              }
            }
          }
        }
        // If the directory was already created in this run, do nothing here
        // – it has already been properly counted.
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

        // If the file already exists (case‑insensitive), we never overwrite it
        // and instead count it as skipped so the user knows why it was ignored.
        const existingFilePath = findExistingPathCaseInsensitive(targetFile);
        if (existingFilePath !== null && !wasFileCreatedInThisRun) {
          // File existed before this run – mark as skipped.
          skippedFiles++;
          continue;
        }
        
        // If the file was already created earlier in this run, skip it – it
        // has already been counted in `createdFiles`.
        if (wasFileCreatedInThisRun) {
          continue;
        }

        // Create an empty file only when it does not exist yet.
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


