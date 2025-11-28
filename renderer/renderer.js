// Local copy of parseStructureInput because we cannot use `require` in a
// context‑isolated renderer. Keep this implementation in sync with `src/parser.js`.
function parseStructureInput(raw) {
  if (!raw || typeof raw !== 'string') {
    return [];
  }

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const result = [];

  for (const line of lines) {
    const colonIndex = line.indexOf(':');

    if (colonIndex >= 0) {
      // Format: "path: file1, file2" OR only files at root: ": file1, file2"
      const pathPart = line
        .slice(0, colonIndex)
        .trim();
      const filesPart = line
        .slice(colonIndex + 1)
        .trim();

      const files = filesPart
        .split(',')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);

      // Only files at the root level (no directory path before the colon)
      if (!pathPart && files.length > 0) {
        result.push({
          directory: '',
          files
        });
        continue;
      }

      if (!pathPart) {
        // No directory path and no files – ignore this line as invalid noise.
        continue;
      }

      // Directory with an optional list of files (may be empty).
      result.push({
        directory: pathPart,
        files
      });
    } else {
      // Directory path only, without any files on this line
      const pathOnly = line.trim();
      if (!pathOnly) continue;

      result.push({
        directory: pathOnly,
        files: []
      });
    }
  }

  return result;
}

let translations = {};
// Will be populated from the main process based on JSON files in /locales
let availableLanguages = [];
let currentSettings = {
  rootDir: '',
  language: '',
  theme: 'light'
};

const MAX_INPUT_CHARS = 1000;

// Track last rendered input value so we do not re‑render the preview
// when the text has not actually changed.
let lastRenderedInput = '';
// Last known validation result – used for soft, real-time feedback.
let currentValidation = {
  isValid: true,
  errors: []
};
// Debounce handle for validation calls.
let validationTimeoutId = null;

function formatTemplate(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : `{${key}}`;
  });
}

async function loadSettingsAndTranslations() {
  // Guard against preload failures – without `electronAPI` we cannot talk
  // to the main process, so we just log and bail out.
  if (!window.electronAPI) {
    console.error('electronAPI is not available');
    return;
  }

  // Step 1: load the list of available languages from the main process
  availableLanguages = await window.electronAPI.getAvailableLanguages();
  
  // If there are no languages at all, hide the language switcher UI
  const headerLangContainer = document.querySelector('.header-lang');
  if (headerLangContainer) {
    headerLangContainer.style.display = availableLanguages.length > 0 ? '' : 'none';
  }
  
  // If we do have languages – build the dropdown UI and load settings
  if (availableLanguages.length > 0) {
    await generateLanguageMenu();
    
    currentSettings = await window.electronAPI.getSettings();
    // Check if the language stored in settings is still present in the locales list
    const currentLangCode = currentSettings.language;
    const langExists = availableLanguages.some(lang => {
      const code = typeof lang === 'string' ? lang : lang.code;
      return code === currentLangCode;
    });
    
    // Fallback: if the current language is missing, use the first available one
    const firstLang = availableLanguages[0];
    const firstLangCode = typeof firstLang === 'string' ? firstLang : firstLang.code;
    const lang = langExists ? currentLangCode : firstLangCode;
    
    translations = await window.electronAPI.getTranslations(lang);
    
    // Persist the chosen language back to settings if it changed
    if (currentSettings.language !== lang) {
      currentSettings.language = lang;
      await window.electronAPI.saveSettings(currentSettings);
    }
  } else {
    // When there are no locale files, we still load settings and continue with
    // an empty translations object – UI falls back to hard‑coded strings.
    currentSettings = await window.electronAPI.getSettings();
    translations = {}; // Tuščias vertimų objektas
  }
  
  applyTheme();
  applyTranslations();
}

async function generateLanguageMenu() {
  const headerLangMenu = document.getElementById('header-language-menu');
  if (!headerLangMenu) return;
  
  // Clear any existing items to rebuild the list from scratch
  headerLangMenu.innerHTML = '';
  
  // Create a button for each language returned from the main process
  for (const langInfo of availableLanguages) {
    const langCode = langInfo.code || langInfo; // Backwards compatibility with old string‑based format
    const option = document.createElement('button');
    option.className = 'header-lang-option';
    option.setAttribute('data-lang', langCode);
    
    // Ask the main process for a human‑readable language name (not just the code)
    try {
      const languageName = await window.electronAPI.getLanguageName(langCode);
      option.textContent = languageName; // Display full language name in the dropdown
    } catch (err) {
      console.error('Failed to get language name', err);
      // Fallback: use the language code in upper‑case if the name cannot be resolved
      option.textContent = (typeof langCode === 'string' ? langCode : langCode.code || '').toUpperCase();
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

  // The Electron window title should always be "StructGen" and not be localized
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
  const validationSummaryEl = document.getElementById('validation-summary');

  if (inputLabelEl) inputLabelEl.textContent = translations.main.inputLabel;
  // We intentionally keep the textarea placeholder empty for a cleaner look
  if (inputEl) {
    inputEl.placeholder = '';
  }
  if (generateBtn) generateBtn.textContent = translations.main.generateButton;
  if (clearBtn) clearBtn.textContent = translations.main.clearButton;
  // Navigation buttons are pure SVG icons; labels live in the info modal
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

  // Settings modal copy
  if (settingsTitle && translations.settings) settingsTitle.textContent = translations.settings.windowTitle;
  if (rootLabel && translations.settings) rootLabel.textContent = translations.settings.rootDirLabel;
  if (chooseRootBtn && translations.settings) chooseRootBtn.textContent = translations.settings.chooseRootButton;
  if (saveBtn && translations.settings) saveBtn.textContent = translations.settings.saveButton;
  if (rootInput && translations.settings && translations.settings.rootDirPlaceholder) {
    rootInput.placeholder = translations.settings.rootDirPlaceholder;
  }

  // Info modal – rich formatting with SVG icons and live structure previews
  if (infoTitle && translations.info) infoTitle.textContent = translations.info.title;
  if (infoContent && translations.info) {
    const body = translations.info.body;
    
    // SVG icons keyed by the emoji that appears at the beginning of each section line
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
    
    // Detect an emoji at the beginning of a line that matches one of the icon keys
    function findEmojiAtStart(text) {
      // Check all supported emojis
      for (const emoji of Object.keys(icons)) {
        if (text.startsWith(emoji)) {
          return emoji;
        }
      }
      // Special‑case the warning emoji with a variation selector (⚠️ = ⚠ + FE0F)
      if (text.startsWith('⚠')) {
        return '⚠️';
      }
      return null;
    }
    
    // Render a textual structure example into a visual tree preview with folder/file icons
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
          
          // Directory line
          html += `<div class="info-preview-dir" style="${indentStyle}"><span class="info-preview-icon">📁</span>${name}</div>`;
          
          // Collect all children (sub‑directories and files) for unified sorting
          const allChildren = [];
          
          // Nested directories
          const childNames = Object.keys(node.children).sort((a, b) => 
            a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
          );
          for (const childName of childNames) {
            allChildren.push({ type: 'dir', name: childName, node: node.children[childName] });
          }
          
          // Files in this directory
          const sortedFiles = [...node.files].sort((a, b) => 
            a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
          );
          for (const file of sortedFiles) {
            allChildren.push({ type: 'file', name: file });
          }
          
          // Sort: directories first, then files, both alphabetically (case‑insensitive)
          allChildren.sort((a, b) => {
            if (a.type !== b.type) {
              return a.type === 'dir' ? -1 : 1;
            }
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
          });
          
          // Render all children in the computed order
          for (const child of allChildren) {
            if (child.type === 'dir') {
              html += renderBranch(child.name, child.node, indent + 1);
            } else {
              html += `<div class="info-preview-file" style="${fileIndentStyle}"><span class="info-preview-icon">📄</span>${child.name}</div>`;
            }
          }
          
          return html;
        }
        
        // Collect root‑level directories and files together for sorting
        const rootChildren = [];
        
        // Root‑level directories
        const rootChildNames = Object.keys(tree.children).sort((a, b) => 
          a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
        );
        for (const childName of rootChildNames) {
          rootChildren.push({ type: 'dir', name: childName, node: tree.children[childName] });
        }
        
        // Root‑level files
        const sortedRootFiles = [...tree.files].sort((a, b) => 
          a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
        );
        for (const file of sortedRootFiles) {
          rootChildren.push({ type: 'file', name: file });
        }
        
        // Sort: directories first, then files, both alphabetically
        rootChildren.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'dir' ? -1 : 1;
          }
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
        });
        
        // Render the root‑level items
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
    
    // Check whether a line looks like a structure example (used for formatting)
    function isStructureExample(line) {
      // A structure example either contains ':' or is a bare path / file list
      return line.includes(':') || /^[a-zA-Z0-9_\-./]+$/.test(line.trim());
    }
    
    // Main formatter: walk through every line of the info text and build
    // a structured HTML representation with sections, lists and examples.
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
          // For an empty line while inside an example, look ahead to see if the
          // example continues or if we should close the current block.
          let shouldClose = true;
          for (let j = i + 1; j < lines.length; j++) {
            const nextLine = lines[j].trim();
            if (!nextLine) continue; // Skip additional empty lines
            // If we hit another section or list item, we close the example
            if (findEmojiAtStart(nextLine) || nextLine.startsWith('-') || nextLine.startsWith('•') ||
                (nextLine.toLowerCase().includes('pavyzdys') || nextLine.toLowerCase().includes('example') ||
                 nextLine.toLowerCase().includes('variantas') || nextLine.toLowerCase().includes('variant'))) {
              break;
            }
            // If we see another structure example line, keep the block open
            if (isStructureExample(nextLine)) {
              shouldClose = false;
              break;
            }
          }
          
          if (shouldClose) {
            const exampleText = exampleLines.join('\n');
            const inputLabel = (translations.info && translations.info.exampleInputLabel) || 'Įvestis';
            const previewLabel = (translations.info && translations.info.examplePreviewLabel) || 'Peržiūra';
            htmlContent += `<div class="info-example-input" data-label="${inputLabel}">${exampleText}</div>`;
            htmlContent += `<div class="info-example-preview" data-label="${previewLabel}">${renderStructurePreview(exampleText)}</div></div>`;
            exampleLines = [];
            inExample = false;
          }
        }
        
        if (inSection && i < lines.length - 1 && !inExample) {
          // Empty line between sections – close the current section
          htmlContent += '</div></div>';
          inSection = false;
        }
        continue;
      }
      
      // Section line that starts with an emoji icon
      const emoji = findEmojiAtStart(line);
      if (emoji) {
        // If we were inside an example, close it before starting the new section
        if (inExample && exampleLines.length > 0) {
          const exampleText = exampleLines.join('\n');
          const inputLabel = (translations.info && translations.info.exampleInputLabel) || 'Įvestis';
          const previewLabel = (translations.info && translations.info.examplePreviewLabel) || 'Peržiūra';
          htmlContent += `<div class="info-example-input" data-label="${inputLabel}">${exampleText}</div>`;
          htmlContent += `<div class="info-example-preview" data-label="${previewLabel}">${renderStructurePreview(exampleText)}</div></div>`;
          exampleLines = [];
          inExample = false;
        }
        
        // Close any previous section before starting a new one
        if (inSection) {
          htmlContent += '</div></div>';
          inSection = false;
        }
        
        // Extract the textual section title (strip emoji and optional numbering)
        let title = line.substring(emoji.length).trim();
        // Remove a leading number like "1. " or "2. " from the title
        title = title.replace(/^\d+\.\s*/, '');
        
        // Look ahead to determine whether this section contains only examples
        let sectionHasOnlyExamples = false;
        let hasNonExampleContent = false;
        for (let j = i + 1; j < lines.length; j++) {
          const checkLine = lines[j].trim();
          if (!checkLine) continue;
          // Stop when the next section or list item is reached
          if (findEmojiAtStart(checkLine) || checkLine.startsWith('-') || checkLine.startsWith('•')) {
            break;
          }
          // Structure example line – mark that the section has examples
          if (isStructureExample(checkLine)) {
            sectionHasOnlyExamples = true;
          } else {
            // Non‑example content – the section has more than just examples
            hasNonExampleContent = true;
            break;
          }
        }
        
        const icon = icons[emoji] || icons['⚠️'] || '';
        
        // If the section is composed purely of examples, render as an example block
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
        // Example/variant heading line (e.g. "Example 1:", "Variant 1:" etc.)
        exampleTitle = line;
        htmlContent += `<div class="info-example-wrapper"><div class="info-example-title">${line}</div>`;
        inExample = true;
        isIntro = false;
      } else if (inExample && isStructureExample(line) && 
                 !line.toLowerCase().includes('pavyzdys') && !line.toLowerCase().includes('example') &&
                 !line.toLowerCase().includes('variantas') && !line.toLowerCase().includes('variant')) {
        // Structure example line (for both explicit examples and example‑only sections)
        exampleLines.push(line);
      } else if (line.startsWith('-') || line.startsWith('•')) {
        // Start of a bullet list item; close any open example block first
        if (inExample && exampleLines.length > 0) {
          const exampleText = exampleLines.join('\n');
          const inputLabel = (translations.info && translations.info.exampleInputLabel) || 'Įvestis';
          const previewLabel = (translations.info && translations.info.examplePreviewLabel) || 'Peržiūra';
          htmlContent += `<div class="info-example-input" data-label="${inputLabel}">${exampleText}</div>`;
          htmlContent += `<div class="info-example-preview" data-label="${previewLabel}">${renderStructurePreview(exampleText)}</div></div>`;
          exampleLines = [];
          inExample = false;
        }
        // Plain list item
        const text = line.replace(/^[-•]\s*/, '');
        htmlContent += `<div class="info-list-item">${text}</div>`;
        isIntro = false;
      } else if (inSection && !inExample) {
        // Inside a regular section – check whether the line is a structure example
        if (isStructureExample(line)) {
          // Start a new example block inside this section and reuse the section
          // title as the example heading.
          const sectionTitle = htmlContent.match(/<div class="info-section-title">.*?<span>(.*?)<\/span>/);
          const exampleTitleText = sectionTitle ? sectionTitle[1] : '';
          htmlContent += `<div class="info-example-wrapper"><div class="info-example-title">${exampleTitleText}</div>`;
          inExample = true;
          exampleLines.push(line);
        } else {
          // Regular text inside the section
          htmlContent += `<div class="info-text-line">${line}</div>`;
        }
        isIntro = false;
      } else if (isIntro) {
        // Intro text before any sections have started
        htmlContent += `<div class="info-intro">${line}</div>`;
      }
    }
    
    // Close a pending example block if we reached the end
    if (inExample && exampleLines.length > 0) {
      const exampleText = exampleLines.join('\n');
      const inputLabel = (translations.info && translations.info.exampleInputLabel) || 'Įvestis';
      const previewLabel = (translations.info && translations.info.examplePreviewLabel) || 'Peržiūra';
      htmlContent += `<div class="info-example-input" data-label="${inputLabel}">${exampleText}</div>`;
      htmlContent += `<div class="info-example-preview" data-label="${previewLabel}">${renderStructurePreview(exampleText)}</div></div>`;
      exampleLines = [];
      inExample = false;
    }
    
    // Close an open section if it is still active
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

  // Reset validation summary text when language changes
  if (validationSummaryEl) {
    validationSummaryEl.textContent = '';
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
    // Example: "Characters: {used} / {max}"
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

// Collect all directory and file paths from the structure tree
function collectAllPaths(tree, rootDir = '', paths = []) {
  // Directories
  for (const [dirName, dirNode] of Object.entries(tree.children)) {
    const dirPath = rootDir ? `${rootDir}/${dirName}` : dirName;
    paths.push(dirPath);
    collectAllPaths(dirNode, dirPath, paths);
  }

  // Files
  for (const fileName of tree.files) {
    const filePath = rootDir ? `${rootDir}/${fileName}` : fileName;
    paths.push(filePath);
  }

  return paths;
}

function renderTreeBranch(name, node, parentUl, existingPaths, currentPath, invalidDirs, invalidFiles) {
  const dirPath = currentPath ? `${currentPath}/${name}` : name;
  const dirExists = existingPaths[dirPath] === true;

  // Directory line
  const dirLi = document.createElement('li');
  const dirClasses = [];
  dirClasses.push('preview-dir');
  if (dirExists) dirClasses.push('existing');
  if (invalidDirs && invalidDirs.has(name)) dirClasses.push('invalid');
  dirLi.className = dirClasses.join(' ');
  dirLi.textContent = name + '/';
  parentUl.appendChild(dirLi);

  // Inner list for children
  const inner = document.createElement('ul');
  parentUl.appendChild(inner);

  // First render nested directories
  for (const childName of Object.keys(node.children)) {
    renderTreeBranch(childName, node.children[childName], inner, existingPaths, dirPath, invalidDirs, invalidFiles);
  }

  // Then render files in this directory
  for (const file of node.files) {
    const filePath = `${dirPath}/${file}`;
    const fileExists = existingPaths[filePath] === true;
    const fileLi = document.createElement('li');
    const fileClasses = [];
    fileClasses.push('preview-file');
    if (fileExists) fileClasses.push('existing');
    if (invalidFiles && invalidFiles.has(file)) fileClasses.push('invalid');
    fileLi.className = fileClasses.join(' ');
    fileLi.textContent = file;
    inner.appendChild(fileLi);
  }
}

async function renderStructurePreview() {
  const previewEl = document.getElementById('structure-preview');
  const inputEl = document.getElementById('structure-input');
  if (!previewEl || !inputEl) return;

  const currentInput = inputEl.value;
  
  // If the input hasn't changed, avoid unnecessary re‑render work
  if (currentInput === lastRenderedInput) {
    return;
  }

  lastRenderedInput = currentInput;

  const items = parseStructureInput(currentInput);
  
  // Clear the preview container before rendering new content
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

  // Build simple sets of invalid directory/file names based on the latest
  // validation result. We match by segment name; this is a best-effort
  // highlighting and may mark multiple identical names if they appear.
  const invalidDirs = new Set();
  const invalidFiles = new Set();
  if (currentValidation && Array.isArray(currentValidation.errors)) {
    for (const err of currentValidation.errors) {
      if (!err || !err.segment) continue;
      if (err.where === 'directory') {
        invalidDirs.add(err.segment);
      } else if (err.where === 'file') {
        invalidFiles.add(err.segment);
      }
    }
  }

  // Gather all relative paths and ask the main process which of them exist
  let existingPaths = {};
  if (currentSettings.rootDir) {
    try {
      const allPaths = collectAllPaths(tree);
      existingPaths = await window.electronAPI.checkPathsExist({
        rootDir: currentSettings.rootDir,
        paths: allPaths
      });
    } catch (err) {
      console.error('check-paths-exist failed', err);
      // Even if the existence check fails, we still render a plain tree
    }
  }

  // Double‑check that the input is still the same (it might have changed
  // while we were waiting for the async `check-paths-exist` response).
  if (inputEl.value !== currentInput) {
    return; // Input pasikeitė, neberenderiname
  }

  // Root katalogai viršuje
  for (const childName of Object.keys(tree.children)) {
    renderTreeBranch(childName, tree.children[childName], treeUl, existingPaths, '', invalidDirs, invalidFiles);
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

async function runValidationDebounced() {
  const inputEl = document.getElementById('structure-input');
  const statusText = document.getElementById('status-text');
  const validationSummaryEl = document.getElementById('validation-summary');
  if (!inputEl || !statusText || !window.electronAPI) return;

  const value = inputEl.value;

  if (validationTimeoutId) {
    clearTimeout(validationTimeoutId);
  }

  // Small delay so we validate after the user pauses typing.
  validationTimeoutId = setTimeout(async () => {
    try {
      const v = await window.electronAPI.validateStructure(value, currentSettings.rootDir);
      currentValidation = v || { isValid: true, errors: [] };

      // Soft, real-time feedback: if there are validation errors while typing,
      // show a generic hint in the status line and a compact summary under input.
      if (!currentValidation.isValid && translations && translations.validation) {
        const msg =
          translations.validation.generic ||
          translations.main?.statusError ||
          'Structure definition contains invalid names.';

        statusText.textContent = msg;

        if (validationSummaryEl) {
          const uniqueLines = Array.from(
            new Set(
              (currentValidation.errors || [])
                .map((e) => e && e.line)
                .filter((n) => typeof n === 'number')
            )
          ).sort((a, b) => a - b);

          const count = currentValidation.errors ? currentValidation.errors.length : 0;
          const lineLabel = translations.validation.lineLabel || 'line';
          if (count > 0 && uniqueLines.length > 0) {
            validationSummaryEl.textContent =
              `${count} ${translations.validation.summaryErrors || 'errors'} ` +
              `(${lineLabel} ${uniqueLines.join(', ')})`;
          } else {
            validationSummaryEl.textContent = '';
          }
        }
      } else if (currentValidation.isValid) {
        // If the structure becomes valid again and status currently shows a
        // generic validation warning, reset back to idle/normal.
        const genericMsg = translations.validation?.generic;
        if (genericMsg && statusText.textContent === genericMsg) {
          const hasRoot = currentSettings && currentSettings.rootDir;
          statusText.textContent = hasRoot
            ? translations.main.statusIdle || ''
            : translations.main.statusNoRoot || '';
        }

        if (validationSummaryEl) {
          validationSummaryEl.textContent = '';
        }
      }
    } catch (err) {
      console.error('validate-structure failed', err);
    }
  }, 200);
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
    const result = await window.electronAPI.generateStructure({
      input,
      rootDir: currentSettings.rootDir
    });

    if (!result || result.success === false) {
      if (result && result.errorCode === 'NO_ROOT') {
        statusText.textContent = translations.main.statusNoRoot || 'Root not set.';
      } else if (result && result.errorCode === 'VALIDATION_ERROR') {
        // Input violates Windows naming rules or other structural constraints.
        const v = result.validation || {};
        const firstError = Array.isArray(v.errors) && v.errors.length > 0 ? v.errors[0] : null;

        if (firstError && translations.validation) {
          const key = firstError.messageKey && translations.validation[firstError.messageKey]
            ? firstError.messageKey
            : 'generic';
          let baseMessage =
            translations.validation[key] ||
            translations.validation.generic ||
            translations.main.statusError ||
            'Invalid structure definition.';

          // Append the offending segment (directory or file name) when available,
          // so the user immediately sees which name (and line) needs to be fixed.
          const lineLabel = translations.validation.lineLabel || 'line';
          if (firstError.segment && firstError.line) {
            baseMessage += ` (${firstError.segment}, ${lineLabel} ${firstError.line})`;
          } else if (firstError.segment) {
            baseMessage += ` (${firstError.segment})`;
          } else if (firstError.line) {
            baseMessage += ` (${lineLabel} ${firstError.line})`;
          }

          statusText.textContent = baseMessage;
        } else {
          statusText.textContent =
            (translations.validation && translations.validation.generic) ||
            translations.main.statusError ||
            'Invalid structure definition.';
        }
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
  // Pre‑fill the settings modal with the current root directory before showing it
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

  // Re‑render the preview to show the "empty" helper state
  renderStructurePreview();
}

async function onChooseRootClick() {
  const rootInput = document.getElementById('root-dir-display');
  const chosen = await window.electronAPI.chooseRootDirectory();
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
    const saved = await window.electronAPI.saveSettings(newSettings);
    currentSettings = saved;

    // perkrauname vertimus pagal dabartinę kalbą
    const firstLang = availableLanguages[0];
    const firstLangCode = typeof firstLang === 'string' ? firstLang : (firstLang ? firstLang.code : null);
    const lang = currentSettings.language || firstLangCode;
    if (lang) {
      translations = await window.electronAPI.getTranslations(lang);
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
  // Ensure the requested language exists in the current languages list
  const langExists = availableLanguages.some(langInfo => {
    const code = typeof langInfo === 'string' ? langInfo : langInfo.code;
    return code === lang;
  });
  if (!langExists || availableLanguages.length === 0) return;
  const updated = {
    ...currentSettings,
    language: lang
  };
  const saved = await window.electronAPI.saveSettings(updated);
  currentSettings = saved;
  const firstLang = availableLanguages[0];
  const firstLangCode = typeof firstLang === 'string' ? firstLang : (firstLang ? firstLang.code : null);
  const newLang = currentSettings.language || firstLangCode;
  // Reload the translations bundle for the newly selected language
  translations = await window.electronAPI.getTranslations(newLang);
  applyTranslations();
}

async function setTheme(theme) {
  const normalized = theme === 'dark' ? 'dark' : 'light';
  const updated = {
    ...currentSettings,
    theme: normalized
  };
  const saved = await window.electronAPI.saveSettings(updated);
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

  // Main action buttons
  if (generateBtn) {
    generateBtn.addEventListener('click', onGenerateClick);
  }

  const inputEl = document.getElementById('structure-input');
  if (inputEl) {
    inputEl.addEventListener('input', () => {
      updateCharCount();
      renderStructurePreview();
      runValidationDebounced();
    });
  }

  // Top‑nav buttons for settings and info modals
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

  // Language picker dropdown open/close handling
  if (headerLangToggle && headerLangMenu) {
    headerLangToggle.addEventListener('click', () => {
      headerLangMenu.classList.toggle('is-open');
    });
  }

  // Language selection – use event delegation so dynamically generated items work
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

  // Close the language menu when clicking outside of it
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!headerLangMenu || !headerLangToggle) return;
    if (headerLangMenu.contains(target) || headerLangToggle.contains(target)) return;
    headerLangMenu.classList.remove('is-open');
  });

  // Theme toggle – light <-> dark
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const nextTheme = currentSettings.theme === 'dark' ? 'light' : 'dark';
      setTheme(nextTheme);
    });
  }

  // Modal close buttons (X in the header)
  document.querySelectorAll('.modal-close').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-close-modal');
      if (id) closeModal(id);
    });
  });

  // Close modals when clicking on the blurred backdrop area
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

  // Initial bootstrap:
  // 1) load settings + translations
  // 2) render an empty preview
  // 3) initialize character counter
  loadSettingsAndTranslations();
  renderStructurePreview();
  updateCharCount();
});


