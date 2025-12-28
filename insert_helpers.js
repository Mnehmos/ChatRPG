const fs = require('fs');
const path = require('path');

const combatFile = path.join(__dirname, 'src', 'modules', 'combat.ts');
const helpersFile = path.join(__dirname, 'temp_helpers.ts');

// Read both files
const combatContent = fs.readFileSync(combatFile, 'utf-8');
const helpersContent = fs.readFileSync(helpersFile, 'utf-8');

// Find the insertion point (right before "// ===========..." for GET ENCOUNTER SCHEMA)
const insertionMarker = '// ============================================================\n// GET ENCOUNTER SCHEMA\n// ============================================================';
const insertionIndex = combatContent.indexOf(insertionMarker);

if (insertionIndex === -1) {
  console.error('Could not find insertion point');
  process.exit(1);
}

// Insert the helpers
const before = combatContent.substring(0, insertionIndex);
const after = combatContent.substring(insertionIndex);
const newContent = before + helpersContent + '\n' + after;

// Write back
fs.writeFileSync(combatFile, newContent, 'utf-8');
console.log('Successfully inserted helper functions');
