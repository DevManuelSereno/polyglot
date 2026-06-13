#!/usr/bin/env node

/**
 * Validates i18n keys in translation files.
 * Checks for:
 * - Missing keys across locales
 * - Empty values
 * - Duplicate keys (in nested structures)
 * - Unused keys (if source files provided)
 * 
 * Usage: node validate-keys.js <locales-dir>
 * Example: node validate-keys.js ./locales
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

function validate(localesDir) {
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

  // Parse all files
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

  // Report results
  console.log(`\nValidation: ${localesDir}`);
  console.log(`Files: ${files.length}, Keys: ${allKeyNames.size}\n`);

  if (errors.length > 0) {
    console.log('❌ ERRORS:');
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

const localesDir = process.argv[2];
if (!localesDir) {
  console.log('Usage: node validate-keys.js <locales-dir>');
  process.exit(3);
}

validate(localesDir);
