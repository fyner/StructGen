const fs = require('fs');
const path = require('path');

let cachedSettings = null;

function getSettingsFilePath(userDataDir) {
  return path.join(userDataDir, 'structgen-settings.json');
}

function loadSettings(userDataDir) {
  if (cachedSettings) {
    return cachedSettings;
  }

  const filePath = getSettingsFilePath(userDataDir);

  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      cachedSettings = JSON.parse(raw);
    } else {
      cachedSettings = {
        rootDir: '',
        language: 'lt',
        theme: 'light'
      };
    }
  } catch (err) {
    console.error('Failed to load settings', err);
    cachedSettings = {
      rootDir: '',
      language: 'lt',
      theme: 'light'
    };
  }

  return cachedSettings;
}

function saveSettings(userDataDir, settings) {
  const filePath = getSettingsFilePath(userDataDir);

  try {
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
    cachedSettings = settings;
  } catch (err) {
    console.error('Failed to save settings', err);
  }
}

module.exports = {
  getSettingsFilePath,
  loadSettings,
  saveSettings
};


