import { handleToolCall } from './dist/registry.js';

async function test() {
  console.log('=== STEP 1: Create Character ===\n');
  let result = await handleToolCall('create_character', {
    name: 'Exhausted Fighter',
    class: 'Fighter',
    level: 5,
    stats: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 10 }
  });
  console.log(result.content[0].text);

  // Extract character ID from the output
  const idMatch = result.content[0].text.match(/Character ID: ([a-f0-9-]+)/);
  const characterId = idMatch[1];
  console.log(`\nCharacter ID: ${characterId}\n`);

  console.log('=== STEP 2: Add Exhaustion Level 4 ===\n');
  result = await handleToolCall('manage_condition', {
    targetId: characterId,
    operation: 'add',
    condition: 'exhaustion',
    exhaustionLevels: 4,
    source: 'Forced march'
  });
  console.log(result.content[0].text);

  console.log('\n=== STEP 3: Get Character (should show effective stats) ===\n');
  result = await handleToolCall('get_character', {
    characterName: 'Exhausted Fighter'
  });
  console.log(result.content[0].text);
}

test().catch(console.error);
