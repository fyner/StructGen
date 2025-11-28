const { ipcRenderer } = require('electron');
const { parseStructureInput } = require('../src/parser');

let translations = {};
let availableLanguages = []; // Bus užkrauta automatiškai
let currentSettings = {
  rootDir: '',
  language: '',
  theme: 'light'
};

const MAX_INPUT_CHARS = 1000;

// Input reikšmės sekimas, kad neberenderintume seno turinio
let lastRenderedInput = '';

function formatTemplate(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : `{${key}}`;
  });
}

async function loadSettingsAndTranslations() {
  // Pirmiausia užkrauname prieinamas kalbas
  availableLanguages = await ipcRenderer.invoke('get-available-languages');
  
  // Jei nėra kalbų, paslėpiame kalbų pasirinkimo mygtuką
  const headerLangContainer = document.querySelector('.header-lang');
  if (headerLangContainer) {
    headerLangContainer.style.display = availableLanguages.length > 0 ? '' : 'none';
  }
  
  // Dinamiškai generuojame kalbų meniu (tik jei yra kalbų)
  if (availableLanguages.length > 0) {
    await generateLanguageMenu();
    
    currentSettings = await ipcRenderer.invoke('get-settings');
    // Patikriname, ar dabartinė kalba yra prieinamų kalbų sąraše
    const currentLangCode = currentSettings.language;
    const langExists = availableLanguages.some(lang => {
      const code = typeof lang === 'string' ? lang : lang.code;
      return code === currentLangCode;
    });
    
    // Jei nustatymuose nėra kalbos arba kalba neegzistuoja, naudojame pirmąją iš sąrašo
    const firstLang = availableLanguages[0];
    const firstLangCode = typeof firstLang === 'string' ? firstLang : firstLang.code;
    const lang = langExists ? currentLangCode : firstLangCode;
    
    translations = await ipcRenderer.invoke('get-translations', lang);
    
    // Atnaujiname nustatymus, jei kalba pasikeitė
    if (currentSettings.language !== lang) {
      currentSettings.language = lang;
      await ipcRenderer.invoke('save-settings', currentSettings);
    }
  } else {
    // Jei nėra kalbų, užkrauname tik nustatymus
    currentSettings = await ipcRenderer.invoke('get-settings');
    translations = {}; // Tuščias vertimų objektas
  }
  
  applyTheme();
  applyTranslations();
}

async function generateLanguageMenu() {
  const headerLangMenu = document.getElementById('header-language-menu');
  if (!headerLangMenu) return;
  
  // Išvalome esamą meniu
  headerLangMenu.innerHTML = '';
  
  // Generuojame meniu elementus kiekvienai kalbai
  for (const langInfo of availableLanguages) {
    const langCode = langInfo.code || langInfo; // Palaikome atgalinį suderinamumą
    const option = document.createElement('button');
    option.className = 'header-lang-option';
    option.setAttribute('data-lang', langCode);
    
    // Gauname kalbos pavadinimą (pilną, ne kodą)
    try {
      const languageName = await ipcRenderer.invoke('get-language-name', langCode);
      option.textContent = languageName; // Rodome pilną kalbos pavadinimą
    } catch (err) {
      console.error('Failed to get language name', err);
      option.textContent = (typeof langCode === 'string' ? langCode : langCode.code || '').toUpperCase(); // Fallback į kodą
    }
    
    headerLangMenu.appendChild(option);
  }
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
  const saveBtn = document.getElementById('save-settings-button');
  const rootInput = document.getElementById('root-dir-display');
  const infoTitle = document.getElementById('info-modal-title');
  const infoContent = document.getElementById('info-modal-content');
  const headerLangToggle = document.getElementById('header-language-toggle');
  const headerLangMenu = document.getElementById('header-language-menu');
  const themeToggleBtn = document.getElementById('theme-toggle');
  const charCountEl = document.getElementById('char-count');

  if (inputLabelEl) inputLabelEl.textContent = translations.main.inputLabel;
  // Placeholder nenaudojame – paliekame švarų lauką be pagalbinio teksto
  if (inputEl) {
    inputEl.placeholder = '';
  }
  if (generateBtn) generateBtn.textContent = translations.main.generateButton;
  if (clearBtn) clearBtn.textContent = translations.main.clearButton;
  // Nav mygtukai su spalvotomis SVG ikonomis
  if (navSettings) {
    navSettings.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="nav-icon">
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" fill="#4a6cf7"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="#4a6cf7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }
  if (navInfo) {
    navInfo.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="nav-icon">
      <circle cx="12" cy="12" r="10" stroke="#4a6cf7" stroke-width="2" fill="#4a6cf7" fill-opacity="0.1"/>
      <path d="M12 16v-4" stroke="#4a6cf7" stroke-width="2" stroke-linecap="round"/>
      <path d="M12 8h.01" stroke="#4a6cf7" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
  }

  // Settings modal tekstai
  if (settingsTitle && translations.settings) settingsTitle.textContent = translations.settings.windowTitle;
  if (rootLabel && translations.settings) rootLabel.textContent = translations.settings.rootDirLabel;
  if (chooseRootBtn && translations.settings) chooseRootBtn.textContent = translations.settings.chooseRootButton;
  if (saveBtn && translations.settings) saveBtn.textContent = translations.settings.saveButton;
  if (rootInput && translations.settings && translations.settings.rootDirPlaceholder) {
    rootInput.placeholder = translations.settings.rootDirPlaceholder;
  }

  // Info modal - formatuojame su SVG ikonoms ir gražesniu dizainu
  if (infoTitle && translations.info) infoTitle.textContent = translations.info.title;
  if (infoContent && translations.info) {
    const body = translations.info.body;
    
    // SVG ikonos su spalvomis - naudojame emoji kaip raktus
    const icons = {
      '📝': `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="info-icon">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="#3b82f6" fill-opacity="0.1" stroke="#3b82f6" stroke-width="2"/>
        <path d="M14 2v6h6" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/>
        <path d="M16 13H8" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/>
        <path d="M16 17H8" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/>
        <path d="M10 9H8" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/>
      </svg>`,
      '📂': `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="info-icon">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" fill="#f59e0b" fill-opacity="0.15" stroke="#f59e0b" stroke-width="2"/>
        <path d="M7 5h5l2 3" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
      '📄': `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="info-icon">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="#10b981" fill-opacity="0.1" stroke="#10b981" stroke-width="2"/>
        <path d="M14 2v6h6" stroke="#10b981" stroke-width="2" stroke-linecap="round"/>
      </svg>`,
      '✨': `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="info-icon">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#a855f7" fill-opacity="0.2" stroke="#a855f7" stroke-width="2"/>
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#fbbf24" fill-opacity="0.3"/>
      </svg>`,
      '🎯': `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="info-icon">
        <circle cx="12" cy="12" r="10" fill="#ef4444" fill-opacity="0.1" stroke="#ef4444" stroke-width="2"/>
        <circle cx="12" cy="12" r="6" fill="#ef4444" fill-opacity="0.2" stroke="#ef4444" stroke-width="2"/>
        <circle cx="12" cy="12" r="2" fill="#ef4444" stroke="#ef4444" stroke-width="2"/>
      </svg>`,
      '⚠️': `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="info-icon">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="#f59e0b" fill-opacity="0.15" stroke="#f59e0b" stroke-width="2"/>
        <line x1="12" y1="9" x2="12" y2="13" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="17" x2="12.01" y2="17" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>
      </svg>`,
      '⚠': `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="info-icon">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="#f59e0b" fill-opacity="0.15" stroke="#f59e0b" stroke-width="2"/>
        <line x1="12" y1="9" x2="12" y2="13" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="17" x2="12.01" y2="17" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>
      </svg>`
    };
    
    // Funkcija, kuri randa emoji eilutės pradžioje
    function findEmojiAtStart(text) {
      // Tikriname visus galimus emoji
      for (const emoji of Object.keys(icons)) {
        if (text.startsWith(emoji)) {
          return emoji;
        }
      }
      // Tikriname emoji su variation selector (⚠️ = ⚠ + FE0F)
      if (text.startsWith('⚠')) {
        return '⚠️';
      }
      return null;
    }
    
    // Funkcija, kuri struktūros pavyzdžius atvaizduoja kaip peržiūrą su paveikslėliais
    function renderStructurePreview(structureText) {
      try {
        const items = parseStructureInput(structureText);
        if (!items.length) return structureText;
        
        const tree = buildStructureTree(items);
        let previewHtml = '<div class="info-structure-preview">';
        
        function renderBranch(name, node, indent = 0) {
          const indentStyle = `padding-left: ${indent * 14}px;`;
          const fileIndentStyle = `padding-left: ${(indent + 1) * 14}px;`;
          let html = '';
          
          // Katalogas
          html += `<div class="info-preview-dir" style="${indentStyle}"><span class="info-preview-icon">📁</span>${name}</div>`;
          
          // Surinkti visus vaikus (katalogus ir failus) kartu rūšiavimui
          const allChildren = [];
          
          // Vidiniai katalogai
          const childNames = Object.keys(node.children).sort((a, b) => 
            a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
          );
          for (const childName of childNames) {
            allChildren.push({ type: 'dir', name: childName, node: node.children[childName] });
          }
          
          // Failai
          const sortedFiles = [...node.files].sort((a, b) => 
            a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
          );
          for (const file of sortedFiles) {
            allChildren.push({ type: 'file', name: file });
          }
          
          // Rūšiuoti: katalogai pirmiau, tada failai (abu pagal abėcėlę)
          allChildren.sort((a, b) => {
            if (a.type !== b.type) {
              return a.type === 'dir' ? -1 : 1;
            }
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
          });
          
          // Atvaizduoti visus vaikus
          for (const child of allChildren) {
            if (child.type === 'dir') {
              html += renderBranch(child.name, child.node, indent + 1);
            } else {
              html += `<div class="info-preview-file" style="${fileIndentStyle}"><span class="info-preview-icon">📄</span>${child.name}</div>`;
            }
          }
          
          return html;
        }
        
        // Surinkti root elementus (katalogus ir failus) kartu rūšiavimui
        const rootChildren = [];
        
        // Root katalogai
        const rootChildNames = Object.keys(tree.children).sort((a, b) => 
          a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
        );
        for (const childName of rootChildNames) {
          rootChildren.push({ type: 'dir', name: childName, node: tree.children[childName] });
        }
        
        // Root failai
        const sortedRootFiles = [...tree.files].sort((a, b) => 
          a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
        );
        for (const file of sortedRootFiles) {
          rootChildren.push({ type: 'file', name: file });
        }
        
        // Rūšiuoti: katalogai pirmiau, tada failai (abu pagal abėcėlę)
        rootChildren.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'dir' ? -1 : 1;
          }
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
        });
        
        // Atvaizduoti root elementus
        for (const child of rootChildren) {
          if (child.type === 'dir') {
            previewHtml += renderBranch(child.name, child.node, 0);
          } else {
            previewHtml += `<div class="info-preview-file"><span class="info-preview-icon">📄</span>${child.name}</div>`;
          }
        }
        
        previewHtml += '</div>';
        return previewHtml;
      } catch (e) {
        return structureText;
      }
    }
    
    // Funkcija, kuri patikrina, ar eilutė yra struktūros pavyzdys
    function isStructureExample(line) {
      // Struktūros pavyzdys turi dvitaškį arba yra tik failų/katalogų pavadinimas
      return line.includes(':') || /^[a-zA-Z0-9_\-./]+$/.test(line.trim());
    }
    
    // Formatavimas su SVG ikonoms
    const lines = body.split('\n');
    let htmlContent = '';
    let inSection = false;
    let isIntro = true;
    let inExample = false;
    let exampleLines = [];
    let exampleTitle = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';
      
      if (!line) {
        // Jei buvome pavyzdyje ir jau turime eilučių, patikrinti ar reikia uždaryti
        if (inExample && exampleLines.length > 0) {
          // Patikrinti, ar po tuščios eilutės yra dar pavyzdžio eilutė arba kita sekcija
          let shouldClose = true;
          for (let j = i + 1; j < lines.length; j++) {
            const nextLine = lines[j].trim();
            if (!nextLine) continue; // Tęsti, jei tuščia eilutė
            // Jei rasta kita sekcija arba sąrašo elementas, uždaryti
            if (findEmojiAtStart(nextLine) || nextLine.startsWith('-') || nextLine.startsWith('•') ||
                (nextLine.toLowerCase().includes('pavyzdys') || nextLine.toLowerCase().includes('example') ||
                 nextLine.toLowerCase().includes('variantas') || nextLine.toLowerCase().includes('variant'))) {
              break;
            }
            // Jei rasta pavyzdžio eilutė, ne uždaryti
            if (isStructureExample(nextLine)) {
              shouldClose = false;
              break;
            }
          }
          
          if (shouldClose) {
            const exampleText = exampleLines.join('\n');
            htmlContent += `<div class="info-example-input">${exampleText}</div>`;
            htmlContent += `<div class="info-example-preview">${renderStructurePreview(exampleText)}</div></div>`;
            exampleLines = [];
            inExample = false;
          }
        }
        
        if (inSection && i < lines.length - 1 && !inExample) {
          // Tuščia eilutė tarp sekcijų - uždaryti sekciją (bet ne jei esame pavyzdyje)
          htmlContent += '</div></div>';
          inSection = false;
        }
        continue;
      }
      
      // Tikriname, ar eilutė prasideda su emoji
      const emoji = findEmojiAtStart(line);
      if (emoji) {
        // Jei buvome pavyzdyje, uždaryti jį prieš uždarant sekciją
        if (inExample && exampleLines.length > 0) {
          const exampleText = exampleLines.join('\n');
          htmlContent += `<div class="info-example-input">${exampleText}</div>`;
          htmlContent += `<div class="info-example-preview">${renderStructurePreview(exampleText)}</div></div>`;
          exampleLines = [];
          inExample = false;
        }
        
        // Uždaryti ankstesnę sekciją, jei yra
        if (inSection) {
          htmlContent += '</div></div>';
          inSection = false;
        }
        
        // Ištraukti antraštę (pašalinti emoji ir skaičių, jei yra)
        let title = line.substring(emoji.length).trim();
        // Pašalinti skaičių pradžioje (pvz., "1. " arba "2. ")
        title = title.replace(/^\d+\.\s*/, '');
        
        // Patikrinti, ar po šios sekcijos yra tik struktūros pavyzdžiai (iki kitos sekcijos arba sąrašo)
        let sectionHasOnlyExamples = false;
        let hasNonExampleContent = false;
        for (let j = i + 1; j < lines.length; j++) {
          const checkLine = lines[j].trim();
          if (!checkLine) continue;
          // Jei rasta kita sekcija arba sąrašo elementas, sustoti
          if (findEmojiAtStart(checkLine) || checkLine.startsWith('-') || checkLine.startsWith('•')) {
            break;
          }
          // Jei rasta struktūros pavyzdžio eilutė
          if (isStructureExample(checkLine)) {
            sectionHasOnlyExamples = true;
          } else {
            // Jei rasta ne pavyzdžio eilutė, sekcija turi ne tik pavyzdžius
            hasNonExampleContent = true;
            break;
          }
        }
        
        const icon = icons[emoji] || icons['⚠️'] || '';
        
        // Jei sekcija turi tik pavyzdžius (ir nėra kitų elementų), formatuoti kaip pavyzdį
        if (sectionHasOnlyExamples && !hasNonExampleContent) {
          htmlContent += `<div class="info-example-wrapper"><div class="info-example-title">${title}</div>`;
          inExample = true;
          inSection = false;
        } else {
          htmlContent += `<div class="info-section"><div class="info-section-title">${icon}<span>${title}</span></div><div class="info-section-content">`;
          inSection = true;
          inExample = false;
        }
        isIntro = false;
      } else if ((line.toLowerCase().includes('pavyzdys') || line.toLowerCase().includes('example') || 
                  line.toLowerCase().includes('variantas') || line.toLowerCase().includes('variant')) && 
                 (line.toLowerCase().includes(':') || /^\d+/.test(line))) {
        // Pavyzdžio/varianto antraštė (pvz., "Pavyzdys 1:", "Variantas 1:", "Example 1:", "Variant 1:")
        exampleTitle = line;
        htmlContent += `<div class="info-example-wrapper"><div class="info-example-title">${line}</div>`;
        inExample = true;
        isIntro = false;
      } else if (inExample && isStructureExample(line) && 
                 !line.toLowerCase().includes('pavyzdys') && !line.toLowerCase().includes('example') &&
                 !line.toLowerCase().includes('variantas') && !line.toLowerCase().includes('variant')) {
        // Struktūros pavyzdžio eilutė (tiek variantuose, tiek sekcijose su tik pavyzdžiais)
        exampleLines.push(line);
      } else if (line.startsWith('-') || line.startsWith('•')) {
        // Jei buvome pavyzdyje, uždaryti jį
        if (inExample && exampleLines.length > 0) {
          const exampleText = exampleLines.join('\n');
          htmlContent += `<div class="info-example-input">${exampleText}</div>`;
          htmlContent += `<div class="info-example-preview">${renderStructurePreview(exampleText)}</div></div>`;
          exampleLines = [];
          inExample = false;
        }
        // Sąrašo elementai
        const text = line.replace(/^[-•]\s*/, '');
        htmlContent += `<div class="info-list-item">${text}</div>`;
        isIntro = false;
      } else if (inSection && !inExample) {
        // Patikrinti, ar tai struktūros pavyzdžio eilutė
        if (isStructureExample(line)) {
          // Pradėti naują pavyzdį sekcijoje - naudoti sekcijos antraštę kaip pavyzdžio antraštę
          const sectionTitle = htmlContent.match(/<div class="info-section-title">.*?<span>(.*?)<\/span>/);
          const exampleTitleText = sectionTitle ? sectionTitle[1] : '';
          htmlContent += `<div class="info-example-wrapper"><div class="info-example-title">${exampleTitleText}</div>`;
          inExample = true;
          exampleLines.push(line);
        } else {
          // Paprastas tekstas sekcijoje (ne pavyzdys)
          htmlContent += `<div class="info-text-line">${line}</div>`;
        }
        isIntro = false;
      } else if (isIntro) {
        // Tekstas pradžioje (intro)
        htmlContent += `<div class="info-intro">${line}</div>`;
      }
    }
    
    // Jei liko neuždarytas pavyzdys, uždaryti jį
    if (inExample && exampleLines.length > 0) {
      const exampleText = exampleLines.join('\n');
      htmlContent += `<div class="info-example-input">${exampleText}</div>`;
      htmlContent += `<div class="info-example-preview">${renderStructurePreview(exampleText)}</div></div>`;
      exampleLines = [];
      inExample = false;
    }
    
    // Uždaryti sekciją, jei liko neuždaryta
    if (inSection) htmlContent += '</div></div>';
    
    infoContent.innerHTML = htmlContent || body;
  }

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

  if (headerLangToggle && availableLanguages.length > 0) {
    const currentLangCode = currentSettings.language;
    // Rasti kalbos informaciją pagal kodą
    const langInfo = availableLanguages.find(lang => {
      const code = typeof lang === 'string' ? lang : lang.code;
      return code === currentLangCode;
    }) || availableLanguages[0];
    
    const langCode = typeof langInfo === 'string' ? langInfo : langInfo.code;
    // Rodome kalbos kodą iš JSON (LT, EN, etc.)
    headerLangToggle.textContent = langCode ? langCode.toUpperCase() : '';
  }

  // Atnaujiname kalbų meniu elementus (pilni pavadinimai jau nustatyti generateLanguageMenu)
  if (headerLangMenu && availableLanguages.length > 0) {
    const headerLangOptions = headerLangMenu.querySelectorAll('.header-lang-option');
    // Atnaujiname aktyvų elementą
    headerLangOptions.forEach((opt) => {
      const value = opt.getAttribute('data-lang');
      const firstLang = availableLanguages[0];
      const firstLangCode = typeof firstLang === 'string' ? firstLang : (firstLang ? firstLang.code : null);
      opt.classList.toggle('active', value === (currentSettings.language || firstLangCode));
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

// Surinkti visus katalogų ir failų kelius iš struktūros medžio
function collectAllPaths(tree, rootDir = '', paths = []) {
  // Katalogai
  for (const [dirName, dirNode] of Object.entries(tree.children)) {
    const dirPath = rootDir ? `${rootDir}/${dirName}` : dirName;
    paths.push(dirPath);
    collectAllPaths(dirNode, dirPath, paths);
  }

  // Failai
  for (const fileName of tree.files) {
    const filePath = rootDir ? `${rootDir}/${fileName}` : fileName;
    paths.push(filePath);
  }

  return paths;
}

function renderTreeBranch(name, node, parentUl, existingPaths, currentPath) {
  const dirPath = currentPath ? `${currentPath}/${name}` : name;
  const dirExists = existingPaths[dirPath] === true;

  // katalogo eilutė
  const dirLi = document.createElement('li');
  dirLi.className = dirExists ? 'preview-dir existing' : 'preview-dir';
  dirLi.textContent = name + '/';
  parentUl.appendChild(dirLi);

  // vidinių elementų sąrašas
  const inner = document.createElement('ul');
  parentUl.appendChild(inner);

  // Pirmiausia vidiniai katalogai
  for (const childName of Object.keys(node.children)) {
    renderTreeBranch(childName, node.children[childName], inner, existingPaths, dirPath);
  }

  // Tada failai šiame kataloge
  for (const file of node.files) {
    const filePath = `${dirPath}/${file}`;
    const fileExists = existingPaths[filePath] === true;
    const fileLi = document.createElement('li');
    fileLi.className = fileExists ? 'preview-file existing' : 'preview-file';
    fileLi.textContent = file;
    inner.appendChild(fileLi);
  }
}

async function renderStructurePreview() {
  const previewEl = document.getElementById('structure-preview');
  const inputEl = document.getElementById('structure-input');
  if (!previewEl || !inputEl) return;

  const currentInput = inputEl.value;
  
  // Jei input nepasikeitė, nieko nedarome
  if (currentInput === lastRenderedInput) {
    return;
  }

  lastRenderedInput = currentInput;

  const items = parseStructureInput(currentInput);
  
  // Išvalome preview prieš renderinant
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

  // Surinkti visus kelius ir patikrinti, kurie egzistuoja (jei rootDir nustatytas)
  let existingPaths = {};
  if (currentSettings.rootDir) {
    try {
      const allPaths = collectAllPaths(tree);
      existingPaths = await ipcRenderer.invoke('check-paths-exist', {
        rootDir: currentSettings.rootDir,
        paths: allPaths
      });
    } catch (err) {
      console.error('check-paths-exist failed', err);
      // Tęsiame be egzistavimo tikrinimo
    }
  }

  // Patikriname, ar input vis dar tas pats (gali būti pasikeitęs per async operaciją)
  if (inputEl.value !== currentInput) {
    return; // Input pasikeitė, neberenderiname
  }

  // Root katalogai viršuje
  for (const childName of Object.keys(tree.children)) {
    renderTreeBranch(childName, tree.children[childName], treeUl, existingPaths, '');
  }

  // Root failai (be kelio) – apačioje
  for (const file of tree.files) {
    const fileExists = existingPaths[file] === true;
    const fileLi = document.createElement('li');
    fileLi.className = fileExists ? 'preview-file existing' : 'preview-file';
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
      } else if (result && result.errorCode === 'FS_ERROR') {
        // Klaida dirbant su failų sistema – rodome bendresnę klaidos žinutę
        statusText.textContent =
          (translations.errors && translations.errors.generic) ||
          translations.main.statusError ||
          'Error.';
      } else {
        statusText.textContent = translations.main.statusError || 'Error.';
      }
      return;
    }

    const tmpl = translations.main.statusSuccess || 'Created 📁: {createdDirs} 📄: {createdFiles} | Skipped 📁: {skippedDirs} 📄: {skippedFiles}';
    statusText.textContent = formatTemplate(tmpl, {
      createdDirs: result.createdDirs || 0,
      skippedDirs: result.skippedDirs || 0,
      createdFiles: result.createdFiles || 0,
      skippedFiles: result.skippedFiles || 0
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

async function onOpenSettingsClick() {
  // užkrauname dabartinius nustatymus į UI prieš rodydami
  const rootInput = document.getElementById('root-dir-display');
  if (rootInput) rootInput.value = currentSettings.rootDir || '';
  
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
  const statusTextEl = document.getElementById('settings-status-text');

  const newSettings = {
    rootDir: rootInput ? rootInput.value : '',
    language: currentSettings.language || (availableLanguages.length > 0 ? (typeof availableLanguages[0] === 'string' ? availableLanguages[0] : availableLanguages[0].code) : ''),
    theme: currentSettings.theme || 'light'
  };

  try {
    const saved = await ipcRenderer.invoke('save-settings', newSettings);
    currentSettings = saved;

    // perkrauname vertimus pagal dabartinę kalbą
    const firstLang = availableLanguages[0];
    const firstLangCode = typeof firstLang === 'string' ? firstLang : (firstLang ? firstLang.code : null);
    const lang = currentSettings.language || firstLangCode;
    if (lang) {
      translations = await ipcRenderer.invoke('get-translations', lang);
    }
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
  // Patikriname, ar kalba yra prieinamų kalbų sąraše
  const langExists = availableLanguages.some(langInfo => {
    const code = typeof langInfo === 'string' ? langInfo : langInfo.code;
    return code === lang;
  });
  if (!langExists || availableLanguages.length === 0) return;
  const updated = {
    ...currentSettings,
    language: lang
  };
  const saved = await ipcRenderer.invoke('save-settings', updated);
  currentSettings = saved;
  const firstLang = availableLanguages[0];
  const firstLangCode = typeof firstLang === 'string' ? firstLang : (firstLang ? firstLang.code : null);
  const newLang = currentSettings.language || firstLangCode;
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
  const themeToggleBtn = document.getElementById('theme-toggle');

  if (generateBtn) {
    generateBtn.addEventListener('click', onGenerateClick);
  }

  const inputEl = document.getElementById('structure-input');
  if (inputEl) {
    inputEl.addEventListener('input', () => {
      updateCharCount();
      renderStructurePreview();
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

  // Event listener'iai kalbų pasirinkimui - naudojame event delegation, kad veiktų su dinamiškai generuojamais elementais
  if (headerLangMenu) {
    headerLangMenu.addEventListener('click', async (event) => {
      const opt = event.target.closest('.header-lang-option');
      if (opt) {
        const lang = opt.getAttribute('data-lang');
        if (lang) {
          await setLanguage(lang);
          headerLangMenu.classList.remove('is-open');
        }
      }
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


