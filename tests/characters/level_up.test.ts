/**
 * @fileoverview level_up Tests - TDD Red Phase
 * 
 * Tests level advancement mechanics:
 * - HP increase (roll, average, max, manual methods)
 * - Proficiency bonus updates
 * - Spell slot progression
 * - Custom resource scaling
 * - Multi-level advancement
 * - Batch level-up for parties
 * 
 * D&D 5e Level-Up Rules:
 * - HP: Hit die + CON modifier per level
 * - Proficiency: +2 at 1-4, +3 at 5-8, +4 at 9-12, +5 at 13-16, +6 at 17-20
 * - Spell slots: Determined by class/level table
 */

import { describe, it, expect, afterEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Track test characters for cleanup
const testCharIds: string[] = [];

function getDataDir() {
  return process.env.MCP_DATA_DIR || path.join(process.cwd(), 'data');
}

afterEach(async () => {
  // Clean up test characters
  const dataDir = path.join(getDataDir(), 'characters');
  for (const id of testCharIds) {
    const filePath = path.join(dataDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  testCharIds.length = 0;
});

/**
 * Helper to create a test character and track for cleanup
 */
async function createTestCharacter(overrides: Record<string, unknown> = {}) {
  const result = await handleToolCall('create_character', {
    name: 'Level Test Hero',
    race: 'Human',
    class: 'Fighter',
    level: 1,
    stats: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 }, // CON mod = +2
    ...overrides,
  });
  
  const text = getTextContent(result);
  const idMatch = text.match(/ID:\s*([a-zA-Z0-9-]+)/i);
  const id = idMatch ? idMatch[1] : null;
  if (id) testCharIds.push(id);
  return id;
}

/**
 * Helper to get character data
 */
async function getCharacter(characterId: string) {
  const result = await handleToolCall('get_character', { characterId });
  return getTextContent(result);
}

describe('level_up', () => {
  describe('Basic Level Advancement', () => {
    it('should increase level by 1 when no target specified', async () => {
      const characterId = await createTestCharacter({ level: 1 });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('╔'); // ASCII box
      expect(text).toMatch(/level\s*2|level up/i);
    });

    it('should advance to specific target level', async () => {
      const characterId = await createTestCharacter({ level: 3 });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        targetLevel: 5,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/level\s*5/i);
    });

    it('should support character lookup by name', async () => {
      await createTestCharacter({ name: 'Sir Gains-a-Lot', level: 4 });

      const result = await handleToolCall('level_up', {
        characterName: 'Sir Gains-a-Lot',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/level\s*5|level up/i);
    });

    it('should reject level-up past 20', async () => {
      const characterId = await createTestCharacter({ level: 20 });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/maximum|level 20|cannot/i);
    });

    it('should reject target level lower than current', async () => {
      const characterId = await createTestCharacter({ level: 10 });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        targetLevel: 5,
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/higher|lower|decrease|cannot/i);
    });
  });

  describe('HP Increase Methods', () => {
    it('should use average HP method by default', async () => {
      // Fighter: d10, average = 6, + CON mod (+2) = 8 HP per level
      const characterId = await createTestCharacter({ 
        level: 1,
        class: 'Fighter',
        stats: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 }, // CON +2
      });
      expect(characterId).not.toBeNull();

      // Get initial HP
      const before = await getCharacter(characterId!);
      const initialHpMatch = before.match(/HP[:\s]+(\d+)/i);
      const initialMaxHp = initialHpMatch ? parseInt(initialHpMatch[1]) : 0;

      const result = await handleToolCall('level_up', {
        characterId,
        hpMethod: 'average',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Fighter d10 average = 6, + CON mod 2 = 8 HP gain
      // Output format: HP: 12 → 20 (+8 average)
      expect(text).toMatch(/\(\+8\s*(average|HP|max)/i);
    });

    it('should use max HP method when specified', async () => {
      // Fighter d10 max = 10 + CON mod (+2) = 12 HP per level
      const characterId = await createTestCharacter({
        level: 1,
        class: 'Fighter',
        stats: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
      });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        hpMethod: 'max',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Output format: HP: 12 → 24 (+12 max)
      expect(text).toMatch(/\(\+12\s*(max|HP|average)/i);
    });

    it('should roll for HP when roll method specified', async () => {
      const characterId = await createTestCharacter({
        level: 1,
        class: 'Fighter',
        stats: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
      });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        hpMethod: 'roll',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // d10 roll (1-10) + CON mod (2) = 3-12 HP gain
      // Output format: HP: 12 → 22 (+10 roll)
      expect(text).toMatch(/\(\+\d+\s*roll\)/i);
      expect(text).toMatch(/d10/i);
    });

    it('should use manual HP when specified', async () => {
      const characterId = await createTestCharacter({ level: 1 });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        hpMethod: 'manual',
        manualHp: 15,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Output format: HP: 12 → 27 (+15 manual)
      expect(text).toMatch(/\(\+15\s*(manual|HP|max)/i);
    });

    it('should enforce minimum 1 HP gain per level', async () => {
      // Wizard d6 with negative CON mod
      const characterId = await createTestCharacter({
        level: 1,
        class: 'Wizard',
        stats: { str: 8, dex: 14, con: 6, int: 18, wis: 12, cha: 10 }, // CON -2
      });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        hpMethod: 'roll',
        manualRoll: 1, // Force minimum roll
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // d6 roll 1 + CON mod (-2) = -1, but minimum is 1
      // Output format: HP: 4 → 5 (+1 roll)
      expect(text).toMatch(/\(\+1\s*(roll|HP|average)/i);
    });

    it('should support custom class hit die', async () => {
      const characterId = await createTestCharacter({
        level: 1,
        class: 'Netrunner',
        stats: { str: 8, dex: 16, con: 12, int: 18, wis: 10, cha: 12 }, // CON +1
        customClass: {
          name: 'Netrunner',
          hitDie: 6,
          spellcasting: 'full',
          spellcastingAbility: 'int',
        },
      });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        hpMethod: 'average',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // d6 average = 4, + CON mod 1 = 5 HP gain
      // Output format: HP: 7 → 12 (+5 average)
      expect(text).toMatch(/\(\+5\s*(average|HP|max)/i);
    });
  });

  describe('Proficiency Bonus Updates', () => {
    it('should increase proficiency bonus at level 5', async () => {
      const characterId = await createTestCharacter({ level: 4 });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        targetLevel: 5,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/proficiency.*\+3|prof.*3/i);
    });

    it('should increase proficiency bonus at level 9', async () => {
      const characterId = await createTestCharacter({ level: 8 });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        targetLevel: 9,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/proficiency.*\+4|prof.*4/i);
    });
  });

  describe('Spell Slot Progression', () => {
    it('should update spell slots for full caster', async () => {
      const characterId = await createTestCharacter({
        level: 2,
        class: 'Wizard',
        spellcastingAbility: 'int',
      });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        targetLevel: 3,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/spell slots|slots updated/i);

      // Verify new slots
      const slotsResult = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });
      const slotsText = getTextContent(slotsResult);
      // Level 3 Wizard: 4 1st, 2 2nd
      expect(slotsText).toMatch(/2nd.*2|2.*2nd/i);
    });

    it('should update spell slots for half caster at level 2', async () => {
      const characterId = await createTestCharacter({
        level: 1,
        class: 'Paladin',
      });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        targetLevel: 2,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();

      // Paladin gets spells at level 2
      const slotsResult = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });
      const slotsText = getTextContent(slotsResult);
      expect(slotsText).toMatch(/1st.*2|2.*1st/i);
    });

    it('should update warlock pact slots', async () => {
      const characterId = await createTestCharacter({
        level: 1,
        class: 'Warlock',
      });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        targetLevel: 2,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();

      // Warlock level 2: 2 pact slots
      const slotsResult = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });
      const slotsText = getTextContent(slotsResult);
      expect(slotsText).toMatch(/pact.*2|2.*pact/i);
    });

    it('should support custom spellcasting class', async () => {
      const characterId = await createTestCharacter({
        level: 1,
        class: 'Psion',
        customClass: {
          name: 'Psion',
          hitDie: 6,
          spellcasting: 'full',
          spellcastingAbility: 'int',
        },
      });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        targetLevel: 3,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();

      // Full caster at level 3: 4 1st, 2 2nd
      const slotsResult = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });
      const slotsText = getTextContent(slotsResult);
      expect(slotsText).toMatch(/2nd.*2|2.*2nd/i);
    });
  });

  describe('Custom Resource Scaling', () => {
    it('should scale level-based resources', async () => {
      const characterId = await createTestCharacter({
        level: 3,
        class: 'Monk',
        customClass: {
          name: 'Monk',
          hitDie: 8,
          spellcasting: 'none',
          resourceName: 'Ki Points',
          resourceMax: 1,
          resourceScaling: 'level', // Ki = level
        },
      });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        targetLevel: 5,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/ki.*5|5.*ki/i);
    });

    it('should scale half-level resources', async () => {
      const characterId = await createTestCharacter({
        level: 4,
        class: 'Battle Master',
        customClass: {
          name: 'Battle Master',
          hitDie: 10,
          spellcasting: 'none',
          resourceName: 'Superiority Dice',
          resourceMax: 4,
          resourceScaling: 'half',
        },
      });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        targetLevel: 6,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Base 4 + floor((6-1)/2) = 4 + 2 = 6
      expect(text).toMatch(/superiority.*6|6.*superiority/i);
    });
  });

  describe('Multi-Level Advancement', () => {
    it('should calculate HP correctly for multiple levels', async () => {
      // Fighter d10, CON +2, average HP per level = 8
      const characterId = await createTestCharacter({
        level: 1,
        class: 'Fighter',
        stats: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
      });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        targetLevel: 5,
        hpMethod: 'average',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // 4 levels * 8 HP = 32 HP gain
      // Output format: HP: 12 → 44 (+32 average)
      expect(text).toMatch(/\(\+32\s*(average|HP|max)/i);
    });

    it('should show breakdown for each level gained', async () => {
      const characterId = await createTestCharacter({ level: 1 });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        targetLevel: 3,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Shows Level 1 → Level 3 format
      expect(text).toMatch(/level\s*1.*level\s*3|1.*\u2192.*3/i);
    });
  });

  describe('New Features Tracking', () => {
    it('should record new class features', async () => {
      const characterId = await createTestCharacter({ level: 1, class: 'Fighter' });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        targetLevel: 2,
        newFeatures: ['Action Surge'],
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Action Surge');
    });

    it('should record new spells learned', async () => {
      const characterId = await createTestCharacter({
        level: 1,
        class: 'Wizard',
        spellcastingAbility: 'int',
        knownSpells: ['Magic Missile', 'Shield'],
      });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        newSpells: ['Misty Step', 'Scorching Ray'],
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Misty Step');
      expect(text).toContain('Scorching Ray');
    });
  });

  describe('Batch Level-Up', () => {
    it('should level up multiple characters at once', async () => {
      const char1Id = await createTestCharacter({ name: 'Hero A', level: 2 });
      const char2Id = await createTestCharacter({ name: 'Hero B', level: 2 });
      const char3Id = await createTestCharacter({ name: 'Hero C', level: 2 });
      
      expect(char1Id).not.toBeNull();
      expect(char2Id).not.toBeNull();
      expect(char3Id).not.toBeNull();

      const result = await handleToolCall('level_up', {
        batch: [
          { characterId: char1Id },
          { characterId: char2Id },
          { characterId: char3Id },
        ],
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Hero A');
      expect(text).toContain('Hero B');
      expect(text).toContain('Hero C');
      expect(text).toMatch(/3.*success|success.*3/i);
    });

    it('should handle mixed success/failure in batch', async () => {
      const char1Id = await createTestCharacter({ name: 'Valid Hero', level: 5 });
      expect(char1Id).not.toBeNull();

      const result = await handleToolCall('level_up', {
        batch: [
          { characterId: char1Id },
          { characterId: 'nonexistent-id' },
        ],
      });

      const text = getTextContent(result);
      // Should show partial success
      expect(text).toContain('Valid Hero');
      expect(text).toMatch(/1.*success|success.*1/i);
      expect(text).toMatch(/1.*fail|fail.*1/i);
    });
  });

  describe('ASCII Art Output', () => {
    it('should display level-up in ASCII box format', async () => {
      const characterId = await createTestCharacter({ level: 4 });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('╔'); // Box border
      expect(text).toContain('║'); // Side border
      expect(text).toContain('╚'); // Bottom corner
    });

    it('should show HP bar after level-up', async () => {
      const characterId = await createTestCharacter({ level: 1 });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/█|░/); // HP bar characters
    });

    it('should show stat changes summary', async () => {
      const characterId = await createTestCharacter({ level: 4 });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        targetLevel: 5,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should show before → after for key stats
      expect(text).toMatch(/→|->|level.*4.*5/i);
    });
  });

  describe('Error Handling', () => {
    it('should reject missing character identifier', async () => {
      const result = await handleToolCall('level_up', {});

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/characterId|characterName|required/i);
    });

    it('should reject non-existent character', async () => {
      const result = await handleToolCall('level_up', {
        characterId: 'fake-character-id-12345',
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/not found|does not exist/i);
    });

    it('should reject invalid target level', async () => {
      const characterId = await createTestCharacter({ level: 5 });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        targetLevel: 25, // Over max
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/invalid|maximum|20/i);
    });

    it('should require manualHp when hpMethod is manual', async () => {
      const characterId = await createTestCharacter({ level: 1 });
      expect(characterId).not.toBeNull();

      const result = await handleToolCall('level_up', {
        characterId,
        hpMethod: 'manual',
        // Missing manualHp
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/manualHp|required|manual/i);
    });
  });
});
