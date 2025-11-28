const { ipcRenderer } = require('electron');
const { parseStructureInput } = require('../src/parser');

let translations = {};
let currentSettings = {
  rootDir: '',
  language: 'lt',
  theme: 'light'
};

const MAX_INPUT_CHARS = 1000;

function formatTemplate(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : `{${key}}`;
  });
}

async function loadSettingsAndTranslations() {
  currentSettings = await ipcRenderer.invoke('get-settings');
  const lang = currentSettings.language || 'lt';
  translations = await ipcRenderer.invoke('get-translations', lang);
  applyTheme();
  applyTranslations();
}

function applyTheme() {
  const theme = currentSettings.theme === 'dark' ? 'dark' : 'light';
  const htmlEl = document.documentElement;
  htmlEl.setAttribute('data-theme', theme);
  document.body.classList.toggle('theme-dark', theme === 'dark');
  document.body.classList.toggle('theme-light', theme === 'light');

  const themeToggleBtn = document.getElementById('theme-toggle');
  if (themeToggleBtn) {
    if (theme === 'dark') {
      themeToggleBtn.classList.add('active');
      themeToggleBtn.textContent = '☾';
    } else {
      themeToggleBtn.classList.remove('active');
      themeToggleBtn.textContent = '☀';
    }
  }
}

function applyTranslations() {
  if (!translations || !translations.main || !translations.app) return;

  // Electron lango pavadinimas turi būti visada „StructGen“ ir nesikeisti nuo kalbos
  document.title = 'StructGen';

  const inputLabelEl = document.getElementById('input-label');
  const inputEl = document.getElementById('structure-input');
  const generateBtn = document.getElementById('generate-button');
  const clearBtn = document.getElementById('clear-button');
  const navSettings = document.getElementById('nav-settings');
  const navInfo = document.getElementById('nav-info');
  const statusText = document.getElementById('status-text');
  const statusTitleEl = document.getElementById('status-title');
  const settingsTitle = document.getElementById('settings-modal-title');
  const rootLabel = document.getElementById('root-dir-label');
  const chooseRootBtn = document.getElementById('choose-root-button');
  const languageLabel = document.getElementById('language-label');
  const optionLt = document.getElementById('language-option-lt');
  const optionEn = document.getElementById('language-option-en');
  const saveBtn = document.getElementById('save-settings-button');
  const rootInput = document.getElementById('root-dir-display');
  const infoTitle = document.getElementById('info-modal-title');
  const infoContent = document.getElementById('info-modal-content');
  const headerLangToggle = document.getElementById('header-language-toggle');
  const headerLangMenu = document.getElementById('header-language-menu');
  const headerLangOptions = document.querySelectorAll('.header-lang-option');
  const themeToggleBtn = document.getElementById('theme-toggle');
  const charCountEl = document.getElementById('char-count');

  if (inputLabelEl) inputLabelEl.textContent = translations.main.inputLabel;
  // Placeholder nenaudojame – paliekame švarų lauką be pagalbinio teksto
  if (inputEl) {
    inputEl.placeholder = '';
  }
  if (generateBtn) generateBtn.textContent = translations.main.generateButton;
  if (clearBtn) clearBtn.textContent = translations.main.clearButton;
  if (navSettings && translations.nav) navSettings.textContent = translations.nav.settings;
  if (navInfo && translations.nav) navInfo.textContent = translations.nav.info;

  // Settings modal tekstai
  if (settingsTitle && translations.settings) settingsTitle.textContent = translations.settings.windowTitle;
  if (rootLabel && translations.settings) rootLabel.textContent = translations.settings.rootDirLabel;
  if (chooseRootBtn && translations.settings) chooseRootBtn.textContent = translations.settings.chooseRootButton;
  if (languageLabel && translations.settings) languageLabel.textContent = translations.settings.languageLabel;
  if (optionLt && translations.settings) optionLt.textContent = translations.settings.languageLt;
  if (optionEn && translations.settings) optionEn.textContent = translations.settings.languageEn;
  if (saveBtn && translations.settings) saveBtn.textContent = translations.settings.saveButton;
  if (rootInput && translations.settings && translations.settings.rootDirPlaceholder) {
    rootInput.placeholder = translations.settings.rootDirPlaceholder;
  }

  // Info modal
  if (infoTitle && translations.info) infoTitle.textContent = translations.info.title;
  if (infoContent && translations.info) infoContent.textContent = translations.info.body;

  if (statusText) {
    const hasRoot = currentSettings && currentSettings.rootDir;
    statusText.textContent = hasRoot ? translations.main.statusIdle : translations.main.statusNoRoot;
  }

  if (statusTitleEl && translations.main.statusTitle) {
    statusTitleEl.textContent = translations.main.statusTitle;
  }

  // Header switchų tooltipai ir aktyvios kalbos būsena
  if (themeToggleBtn && translations.main) {
    themeToggleBtn.title =
      currentSettings.theme === 'dark' ? translations.main.themeLight : translations.main.themeDark;
  }

  if (headerLangToggle && translations.settings) {
    const langCode = currentSettings.language || 'lt';
    headerLangToggle.textContent =
      langCode === 'lt' ? translations.settings.languageLt : translations.settings.languageEn;
  }

  if (headerLangOptions && translations.settings) {
    headerLangOptions.forEach((opt) => {
      const value = opt.getAttribute('data-lang');
      if (value === 'lt') {
        opt.textContent = translations.settings.languageLt;
      } else if (value === 'en') {
        opt.textContent = translations.settings.languageEn;
      }

      opt.classList.toggle('active', value === (currentSettings.language || 'lt'));
    });
  }

  if (charCountEl) {
    updateCharCount();
  }

  // atnaujiname struktūros peržiūrą, kad placeholder tekstas būtų teisinga kalba
  renderStructurePreview();
}

function updateCharCount() {
  const inputEl = document.getElementById('structure-input');
  const charCountEl = document.getElementById('char-count');
  if (!inputEl || !charCountEl) return;
  const used = inputEl.value.length || 0;

  let template = '{used} / {max}';
  if (translations && translations.main && translations.main.charCountLabel) {
    // Pvz.: "Simboliai: {used} / {max}"
    template = translations.main.charCountLabel;
  }

  charCountEl.textContent = template
    .replace('{used}', String(used))
    .replace('{max}', String(MAX_INPUT_CHARS));
}

function buildStructureTree(items) {
  const root = { children: {}, files: [] };

  for (const item of items) {
    const segments = (item.directory || '')
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    let node = root;
    for (const seg of segments) {
      if (!node.children[seg]) {
        node.children[seg] = { children: {}, files: [] };
      }
      node = node.children[seg];
    }
    node.files.push(...item.files);
  }

  // surūšiuojame failus kiekviename mazge
  function sortNode(node) {
    node.files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const childNames = Object.keys(node.children).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
    const sortedChildren = {};
    for (const name of childNames) {
      sortedChildren[name] = node.children[name];
      sortNode(sortedChildren[name]);
    }
    node.children = sortedChildren;
  }

  sortNode(root);

  return root;
}

function renderTreeBranch(name, node, parentUl) {
  // katalogo eilutė
  const dirLi = document.createElement('li');
  dirLi.className = 'preview-dir';
  dirLi.textContent = name + '/';
  parentUl.appendChild(dirLi);

  // vidinių elementų sąrašas
  const inner = document.createElement('ul');
  parentUl.appendChild(inner);

  // Pirmiausia vidiniai katalogai
  for (const childName of Object.keys(node.children)) {
    renderTreeBranch(childName, node.children[childName], inner);
  }

  // Tada failai šiame kataloge
  for (const file of node.files) {
    const fileLi = document.createElement('li');
    fileLi.className = 'preview-file';
    fileLi.textContent = file;
    inner.appendChild(fileLi);
  }
}

function renderStructurePreview() {
  const previewEl = document.getElementById('structure-preview');
  const inputEl = document.getElementById('structure-input');
  if (!previewEl || !inputEl) return;

  const items = parseStructureInput(inputEl.value);
  previewEl.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'structure-preview-empty';
    empty.textContent =
      (translations.main && translations.main.previewEmpty) ||
      'Type a structure definition to see its preview.';
    previewEl.appendChild(empty);
    return;
  }

  const tree = buildStructureTree(items);
  const treeUl = document.createElement('ul');
  treeUl.classList.add('preview-tree');

  // Root katalogai viršuje
  for (const childName of Object.keys(tree.children)) {
    renderTreeBranch(childName, tree.children[childName], treeUl);
  }

  // Root failai (be kelio) – apačioje
  for (const file of tree.files) {
    const fileLi = document.createElement('li');
    fileLi.className = 'preview-file';
    fileLi.textContent = file;
    treeUl.appendChild(fileLi);
  }

  previewEl.appendChild(treeUl);
}

async function onGenerateClick() {
  const inputEl = document.getElementById('structure-input');
  const statusText = document.getElementById('status-text');
  const generateBtn = document.getElementById('generate-button');

  if (!inputEl || !statusText || !generateBtn) return;

  if (!currentSettings.rootDir) {
    statusText.textContent = translations.main.statusNoRoot || 'Root not set.';
    return;
  }

  const input = inputEl.value;

  generateBtn.disabled = true;
  generateBtn.classList.add('is-loading');

  try {
    const result = await ipcRenderer.invoke('generate-structure', {
      input,
      rootDir: currentSettings.rootDir
    });

    if (!result || result.success === false) {
      if (result && result.errorCode === 'NO_ROOT') {
        statusText.textContent = translations.main.statusNoRoot || 'Root not set.';
      } else {
        statusText.textContent = translations.main.statusError || 'Error.';
      }
      return;
    }

    const tmpl = translations.main.statusSuccess || 'Created folders: {dirs}, files: {files}. Skipped: {skipped}.';
    statusText.textContent = formatTemplate(tmpl, {
      dirs: result.createdDirs,
      files: result.createdFiles,
      skipped: result.skipped
    });
  } catch (err) {
    console.error('generate-structure failed', err);
    statusText.textContent = translations.main.statusError || 'Error.';
  } finally {
    generateBtn.disabled = false;
    generateBtn.classList.remove('is-loading');
  }
}

function openModal(id) {
  const backdrop = document.getElementById(`${id}-modal-backdrop`);
  if (backdrop) {
    backdrop.classList.add('is-visible');
  }
}

function closeModal(id) {
  const backdrop = document.getElementById(`${id}-modal-backdrop`);
  if (backdrop) {
    backdrop.classList.remove('is-visible');
  }
}

function onOpenSettingsClick() {
  // užkrauname dabartinius nustatymus į UI prieš rodydami
  const rootInput = document.getElementById('root-dir-display');
  const languageSelect = document.getElementById('language-select');
  if (rootInput) rootInput.value = currentSettings.rootDir || '';
  if (languageSelect) languageSelect.value = currentSettings.language || 'lt';
  openModal('settings');
}

function onOpenInfoClick() {
  openModal('info');
}

function onClearClick() {
  const inputEl = document.getElementById('structure-input');
  const statusText = document.getElementById('status-text');

  if (inputEl) {
    inputEl.value = '';
  }
  if (statusText) {
    const hasRoot = currentSettings && currentSettings.rootDir;
    statusText.textContent = hasRoot
      ? translations.main.statusIdle || ''
      : translations.main.statusNoRoot || '';
  }

  // atnaujiname peržiūrą – parodome tuščią būseną
  renderStructurePreview();
}

async function onChooseRootClick() {
  const rootInput = document.getElementById('root-dir-display');
  const chosen = await ipcRenderer.invoke('choose-root-directory');
  if (chosen && rootInput) {
    rootInput.value = chosen;
  }
}

async function onSaveSettingsClick() {
  const rootInput = document.getElementById('root-dir-display');
  const languageSelect = document.getElementById('language-select');
  const statusTextEl = document.getElementById('settings-status-text');

  const newSettings = {
    rootDir: rootInput ? rootInput.value : '',
    language: languageSelect ? languageSelect.value : 'lt',
    theme: currentSettings.theme || 'light'
  };

  try {
    const saved = await ipcRenderer.invoke('save-settings', newSettings);
    currentSettings = saved;

    // perkrauname vertimus pagal naują kalbą
    const lang = currentSettings.language || 'lt';
    translations = await ipcRenderer.invoke('get-translations', lang);
    applyTheme();
    applyTranslations();

    if (statusTextEl && translations.settings) {
      statusTextEl.textContent = translations.settings.savedMessage || '';
    }
  } catch (err) {
    console.error('save-settings failed', err);
    if (statusTextEl && translations.settings) {
      statusTextEl.textContent = translations.settings.saveError || translations.errors?.generic || '';
    }
  }
}

async function setLanguage(lang) {
  if (lang !== 'lt' && lang !== 'en') return;
  const updated = {
    ...currentSettings,
    language: lang
  };
  const saved = await ipcRenderer.invoke('save-settings', updated);
  currentSettings = saved;
  const newLang = currentSettings.language || 'lt';
  translations = await ipcRenderer.invoke('get-translations', newLang);
  applyTranslations();
}

async function setTheme(theme) {
  const normalized = theme === 'dark' ? 'dark' : 'light';
  const updated = {
    ...currentSettings,
    theme: normalized
  };
  const saved = await ipcRenderer.invoke('save-settings', updated);
  currentSettings = saved;
  applyTheme();
}

window.addEventListener('DOMContentLoaded', () => {
  const generateBtn = document.getElementById('generate-button');
  const navSettings = document.getElementById('nav-settings');
  const navInfo = document.getElementById('nav-info');
  const clearBtn = document.getElementById('clear-button');
  const chooseRootBtn = document.getElementById('choose-root-button');
  const saveSettingsBtn = document.getElementById('save-settings-button');
  const headerLangToggle = document.getElementById('header-language-toggle');
  const headerLangMenu = document.getElementById('header-language-menu');
  const headerLangOptions = document.querySelectorAll('.header-lang-option');
  const themeToggleBtn = document.getElementById('theme-toggle');

  if (generateBtn) {
    generateBtn.addEventListener('click', onGenerateClick);
  }

  const inputEl = document.getElementById('structure-input');
  if (inputEl) {
    inputEl.addEventListener('input', () => {
      renderStructurePreview();
      updateCharCount();
    });
  }

  if (navSettings) {
    navSettings.addEventListener('click', onOpenSettingsClick);
  }

  if (navInfo) {
    navInfo.addEventListener('click', onOpenInfoClick);
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', onClearClick);
  }

  if (chooseRootBtn) {
    chooseRootBtn.addEventListener('click', onChooseRootClick);
  }

  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', onSaveSettingsClick);
  }

  if (headerLangToggle && headerLangMenu) {
    headerLangToggle.addEventListener('click', () => {
      headerLangMenu.classList.toggle('is-open');
    });
  }

  if (headerLangOptions && headerLangMenu) {
    headerLangOptions.forEach((opt) => {
      opt.addEventListener('click', async () => {
        const lang = opt.getAttribute('data-lang');
        await setLanguage(lang);
        headerLangMenu.classList.remove('is-open');
      });
    });
  }

  // uždaryti kalbos meniu paspaudus šalia
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!headerLangMenu || !headerLangToggle) return;
    if (headerLangMenu.contains(target) || headerLangToggle.contains(target)) return;
    headerLangMenu.classList.remove('is-open');
  });

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const nextTheme = currentSettings.theme === 'dark' ? 'light' : 'dark';
      setTheme(nextTheme);
    });
  }

  // modal close buttons
  document.querySelectorAll('.modal-close').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-close-modal');
      if (id) closeModal(id);
    });
  });

  // uždaryti modalius paspaudus ant foninio blur (išorės)
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (event) => {
      if (event.target !== backdrop) return;
      if (backdrop.id === 'settings-modal-backdrop') {
        closeModal('settings');
      } else if (backdrop.id === 'info-modal-backdrop') {
        closeModal('info');
      }
    });
  });

  loadSettingsAndTranslations();
  // pradinė peržiūra (tuščia) ir simbolių skaičius
  renderStructurePreview();
  updateCharCount();
});


