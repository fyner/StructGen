const fs = require('fs');
const path = require('path');

let cachedSettings = null;
let cachedSettingsPath = null;
let cachedSettingsMtime = null;

function getSettingsFilePath(userDataDir) {
  return path.join(userDataDir, 'structgen-settings.json');
}

/**
 * Load application settings from disk with a small in‑memory cache.
 *
 * The cache is automatically invalidated when:
 *   - the resolved settings file path changes, or
 *   - the file's modification time (mtime) changes.
 *
 * `forceReload` can be used to bypass the cache explicitly.
 */
function loadSettings(userDataDir, forceReload = false) {
  const filePath = getSettingsFilePath(userDataDir);
  
  // If the resolved path changed (e.g. different userData directory),
  // drop the existing cache to avoid mixing settings from different locations.
  if (cachedSettingsPath !== filePath) {
    cachedSettings = null;
    cachedSettingsPath = filePath;
    cachedSettingsMtime = null;
  }

  // If the cache is missing or an explicit reload is requested, read from disk.
  if (forceReload || !cachedSettings) {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const currentMtime = stats.mtime.getTime();
        
        // If the file has changed since last time, re‑read and re‑parse it.
        if (cachedSettingsMtime !== currentMtime || !cachedSettings) {
          const raw = fs.readFileSync(filePath, 'utf-8');
          cachedSettings = JSON.parse(raw);
          cachedSettingsMtime = currentMtime;
        }
      } else {
        // No settings file yet – bootstrap with sensible defaults.
        cachedSettings = {
          rootDir: '',
          language: 'lt',
          theme: 'light'
        };
        cachedSettingsMtime = null;
      }
    } catch (err) {
      console.error('Failed to load settings', err);
      // On error, fall back to defaults so the app can still start.
      cachedSettings = {
        rootDir: '',
        language: 'lt',
        theme: 'light'
      };
      cachedSettingsMtime = null;
    }
  }

  return cachedSettings;
}

function saveSettings(userDataDir, settings) {
  const filePath = getSettingsFilePath(userDataDir);

  try {
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
    cachedSettings = settings;

    // Refresh cached modification time after a successful write so that
    // subsequent reads know the cache is still valid.
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      cachedSettingsMtime = stats.mtime.getTime();
    }
  } catch (err) {
    console.error('Failed to save settings', err);
  }
}

module.exports = {
  getSettingsFilePath,
  loadSettings,
  saveSettings
};


