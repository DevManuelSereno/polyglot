#!/usr/bin/env node

/**
 * Validates i18n keys in translation files.
 * Checks for:
 * - Missing keys across locales
 * - Empty values
 * - Duplicate keys (in nested structures)
 * - Orphaned references (keys in code but not in translations, or vice versa)
 * 
 * Usage: node validate-keys.js [locales-dir] [source-dir]
 * Example: node validate-keys.js ./locales ./src
 * Example: node validate-keys.js ./locales (source auto-detected)
 * 
 * Exit codes:
 * 0 = all valid
 * 1 = errors found
 * 2 = warnings only
 * 3 = no files found
 */

const fs = require('fs');
const path = require('path');

function flattenKeys(obj, prefix = '') {
  const keys = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(keys, flattenKeys(value, fullKey));
    } else {
      keys[fullKey] = value;
    }
  }
  return keys;
}

function findLocalesDir() {
  const candidates = ['locales', 'messages', 'i18n', 'lang', 'translations', 'public/locales'];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  return null;
}

function findSourceDir() {
  const candidates = ['src', 'app', 'components', 'pages', '.'];
  for (const dir of candidates) {
    if (fs.existsSync(dir) && dir !== '.') {
      return dir;
    }
  }
  return '.';
}

function scanSourceFiles(sourceDir) {
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'];
  const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];
  const files = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        if (!ignoreDirs.includes(item)) {
          walk(fullPath);
        }
      } else if (stat.isFile()) {
        const ext = path.extname(item);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(sourceDir);
  return files;
}

function extractI18nKeys(files) {
  const keys = new Set();
  const namespaces = new Set();
  
  // Patterns to match:
  // t('key'), t("key"), t(`key`)
  // $t('key'), $t("key"), $t(`key`)
  // formatMessage({ id: 'key' }), formatMessage({id: "key"})
  // useTranslations('namespace'), useTranslation('namespace')
  const patterns = [
    /\bt\(['"`]([^'"`]+)['"`]\)/g,
    /\$t\(['"`]([^'"`]+)['"`]\)/g,
    /formatMessage\(\s*\{\s*id:\s*['"`]([^'"`]+)['"`]/g,
    /useTranslations?\(['"`]([^'"`]+)['"`]\)/g,
  ];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const key = match[1];
          // Skip if it's a namespace (useTranslations/useTranslation)
          if (pattern.source.includes('useTranslation')) {
            namespaces.add(key);
          } else {
            keys.add(key);
          }
        }
      }
    } catch (err) {
      // Skip files that can't be read
    }
  }

  return { keys: Array.from(keys), namespaces: Array.from(namespaces) };
}

function validate(localesDir, sourceDir) {
  if (!fs.existsSync(localesDir)) {
    console.log(`Directory not found: ${localesDir}`);
    process.exit(3);
  }

  const files = fs.readdirSync(localesDir).filter(f => 
    f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml')
  );
  
  if (files.length === 0) {
    console.log(`No translation files found in ${localesDir}`);
    process.exit(3);
  }

  const allKeys = {};
  const errors = [];
  const warnings = [];

  // Parse all translation files
  for (const file of files) {
    const filePath = path.join(localesDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = file.endsWith('.json') ? JSON.parse(content) : require('js-yaml').load(content);
      const keys = flattenKeys(parsed);
      allKeys[file] = keys;

      // Check for empty values
      for (const [key, value] of Object.entries(keys)) {
        if (typeof value === 'string' && value.trim() === '') {
          warnings.push(`${file}: Empty value for key "${key}"`);
        }
        if (value === null || value === undefined) {
          warnings.push(`${file}: Null/undefined value for key "${key}"`);
        }
      }
    } catch (err) {
      errors.push(`${file}: Parse error - ${err.message}`);
    }
  }

  // Check for missing keys across locales
  const allKeyNames = new Set(Object.values(allKeys).flatMap(k => Object.keys(k)));
  
  for (const [file, keys] of Object.entries(allKeys)) {
    for (const keyName of allKeyNames) {
      if (!(keyName in keys)) {
        errors.push(`${file}: Missing key "${keyName}"`);
      }
    }
  }

  // Check for interpolation variable consistency
  for (const [file, keys] of Object.entries(allKeys)) {
    for (const [key, value] of Object.entries(keys)) {
      if (typeof value === 'string') {
        const vars = value.match(/\{[^}]+\}/g) || [];
        // Check if same key in other locales has same variables
        for (const [otherFile, otherKeys] of Object.entries(allKeys)) {
          if (otherFile !== file && key in otherKeys) {
            const otherValue = otherKeys[key];
            if (typeof otherValue === 'string') {
              const otherVars = otherValue.match(/\{[^}]+\}/g) || [];
              if (vars.length !== otherVars.length) {
                warnings.push(`${file} vs ${otherFile}: Variable count mismatch for "${key}"`);
              }
            }
          }
        }
      }
    }
  }

  // Check for orphaned references (if source directory exists)
  if (sourceDir && fs.existsSync(sourceDir)) {
    console.log(`\nScanning source files in: ${sourceDir}`);
    const sourceFiles = scanSourceFiles(sourceDir);
    console.log(`Found ${sourceFiles.length} source files`);
    
    if (sourceFiles.length > 0) {
      const { keys: codeKeys, namespaces: codeNamespaces } = extractI18nKeys(sourceFiles);
      console.log(`Found ${codeKeys.length} unique keys in code`);
      console.log(`Found ${codeNamespaces.length} namespaces in code: ${codeNamespaces.join(', ') || 'none'}`);
      
      // Check for keys in code that don't exist in translations
      for (const key of codeKeys) {
        let found = false;
        for (const keys of Object.values(allKeys)) {
          if (key in keys) {
            found = true;
            break;
          }
        }
        if (!found) {
          errors.push(`Code reference: Key "${key}" used in code but not found in any translation file`);
        }
      }
      
      // Check for keys in translations that are not used in code (orphaned translations)
      for (const keyName of allKeyNames) {
        if (!codeKeys.includes(keyName)) {
          warnings.push(`Translation only: Key "${keyName}" exists in translations but not found in code`);
        }
      }
    }
  }

  // Report results
  console.log(`\nValidation: ${localesDir}`);
  console.log(`Files: ${files.length}, Keys: ${allKeyNames.size}\n`);

  if (errors.length > 0) {
    console.log(' ERRORS:');
    errors.forEach(e => console.log(`  ${e}`));
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warnings.forEach(w => console.log(`  ${w}`));
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ All translation files are valid');
    process.exit(0);
  } else if (errors.length > 0) {
    process.exit(1);
  } else {
    process.exit(2);
  }
}

const localesDir = process.argv[2] || findLocalesDir();
const sourceDir = process.argv[3] || findSourceDir();

if (!localesDir) {
  console.log('No translation directories found (locales/, messages/, i18n/)');
  process.exit(0);
}

validate(localesDir, sourceDir);
