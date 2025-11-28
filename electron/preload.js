const { contextBridge, ipcRenderer } = require('electron');

// Expose a narrow, explicit and safe IPC API from the main process to the renderer.
// This is the only surface the renderer can use to talk to the main process.
contextBridge.exposeInMainWorld('electronAPI', {
  // Settings: load and persist application configuration (rootDir, language, theme)
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (newSettings) => ipcRenderer.invoke('save-settings', newSettings),
  
  // Let the user choose the root directory where the structure will be generated
  chooseRootDirectory: () => ipcRenderer.invoke('choose-root-directory'),
  
  // Internationalization: expose available languages and the translation bundles
  getAvailableLanguages: () => ipcRenderer.invoke('get-available-languages'),
  getLanguageName: (langCode) => ipcRenderer.invoke('get-language-name', langCode),
  getTranslations: (langCode) => ipcRenderer.invoke('get-translations', langCode),
  
  // Structure generation & live preview helpers
  // - checkPathsExist: used by the preview to highlight already existing paths
  // - generateStructure: actually creates folders/files on disk
  checkPathsExist: (data) => ipcRenderer.invoke('check-paths-exist', data),
  generateStructure: (data) => ipcRenderer.invoke('generate-structure', data),

  // Validation helper – runs the same validation logic as the generator,
  // but without touching the file system. Used for soft, real-time feedback.
  // We also forward the current root directory so that path-length rules
  // can take the full `root + relative` path into account.
  validateStructure: (input, rootDir) => ipcRenderer.invoke('validate-structure', { input, rootDir })
});

