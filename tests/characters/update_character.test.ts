/**
 * update_character Tests - TDD
 * Red -> Green -> Refactor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Helper to get the same data directory the code uses
const getDataDir = () => {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'rpg-lite-mcp');
  } else {
    return path.join(os.homedir(), '.config', 'rpg-lite-mcp');
  }
};

describe('update_character', () => {
  let testCharacterId: string;

  beforeEach(async () => {
    // Create a test character before each test
    const result = await handleToolCall('create_character', {
      name: 'Test Hero',
      class: 'Fighter',
      level: 5,
      stats: {
        str: 16,
        dex: 14,
        con: 15,
        int: 10,
        wis: 12,
        cha: 8,
      },
      ac: 18,
      speed: 30,
    });

    const text = getTextContent(result);
    const match = text.match(/Character ID: ([a-z0-9-]+)/);
    testCharacterId = match![1];
  });

  describe('Basic Updates', () => {
    it('should update character HP', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: 25,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('╔'); // ASCII box border
      expect(text).toContain('CHARACTER UPDATE');
      expect(text).toContain('CHANGES');
      expect(text).toContain('HP:');
      expect(text).toContain('25');
      expect(text).toContain('→'); // Arrow showing before → after
    });

    it('should update character level', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        level: 6,
      });

      const text = getTextContent(result);
      expect(text).toContain('Level:');
      expect(text).toContain('5'); // Before
      expect(text).toContain('6'); // After
      expect(text).toContain('→'); // Arrow format
      // Max HP should increase due to level up
      expect(text).toContain('Max HP:');
    });

    it('should update character name', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        name: 'Updated Hero',
      });

      const text = getTextContent(result);
      expect(text).toContain('Test Hero'); // Before
      expect(text).toContain('Updated Hero'); // After
    });

    it('should update AC', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        ac: 20,
      });

      const text = getTextContent(result);
      expect(text).toContain('AC:');
      expect(text).toContain('18'); // Before
      expect(text).toContain('20'); // After
    });
  });

  describe('Ability Score Updates', () => {
    it('should update a single ability score', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        stats: { str: 18 },
      });

      const text = getTextContent(result);
      expect(text).toContain('STR');
      expect(text).toContain('16'); // Before
      expect(text).toContain('18'); // After
      // Modifier should change from +3 to +4
      expect(text).toContain('+3');
      expect(text).toContain('+4');
    });

    it('should update multiple ability scores', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        stats: { str: 18, dex: 16, con: 16 },
      });

      const text = getTextContent(result);
      expect(text).toContain('STR');
      expect(text).toContain('DEX');
      expect(text).toContain('CON');
    });

    it('should recalculate maxHp when CON changes', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        stats: { con: 18 }, // +4 instead of +2, should add +10 HP (2 * 5 levels)
      });

      const text = getTextContent(result);
      expect(text).toContain('CON');
      expect(text).toContain('Max HP:');
      // Should show increased maxHp
    });
  });

  describe('Multiple Field Updates', () => {
    it('should update multiple fields at once', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: 30,
        ac: 19,
        speed: 35,
        level: 6,
      });

      const text = getTextContent(result);
      expect(text).toContain('HP:');
      expect(text).toContain('AC:');
      expect(text).toContain('Speed:');
      expect(text).toContain('Level:');
    });

    it('should update class and recalculate derived stats', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        class: 'Wizard', // Lower hit die (d6 vs d10)
      });

      const text = getTextContent(result);
      expect(text).toContain('Fighter'); // Before
      expect(text).toContain('Wizard'); // After
      expect(text).toContain('Max HP:'); // Should recalculate
    });
  });

  describe('Optional Fields', () => {
    it('should update equipment list', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        equipment: ['Longsword', 'Shield', 'Plate Armor'],
      });

      const text = getTextContent(result);
      expect(text).toContain('Equipment:');
      expect(text).toContain('Longsword');
      expect(text).toContain('Shield');
    });

    it('should update spellcasting info', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        spellcastingAbility: 'int',
        cantrips: ['Fire Bolt', 'Mage Hand'],
        knownSpells: ['Magic Missile', 'Shield'],
      });

      const text = getTextContent(result);
      expect(text).toContain('Spellcasting:');
      expect(text).toContain('INT');
    });

    it('should update resistances/immunities', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        resistances: ['fire', 'cold'],
        immunities: ['poison'],
      });

      const text = getTextContent(result);
      expect(text).toContain('Resistances:');
      expect(text).toContain('fire');
      expect(text).toContain('Immunities:');
      expect(text).toContain('poison');
    });
  });

  describe('Validation', () => {
    it('should reject HP greater than maxHp', async () => {
      // First get current maxHp
      const getResult = await handleToolCall('get_character', {
        characterId: testCharacterId,
      });
      const getText = getTextContent(getResult);
      const hpMatch = getText.match(/HP: \[.*?\] (\d+)\/(\d+)/);
      const maxHp = parseInt(hpMatch![2]);

      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: maxHp + 10, // Over max
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/Error|ERROR/i);
      expect(text).toContain('HP');
    });

    it('should treat negative numbers as damage deltas', async () => {
      // Get initial HP
      const getResult = await handleToolCall('get_character', {
        characterId: testCharacterId,
      });
      const getText = getTextContent(getResult);
      const hpMatch = getText.match(/HP: \[.*?\] (\d+)\/(\d+)/);
      const initialHp = parseInt(hpMatch![1]);

      // Apply damage using negative number (delta)
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: -5,
      });

      expect(result.isError).toBeUndefined(); // Should succeed (delta notation)
      const text = getTextContent(result);
      expect(text).toContain('HP:');
      // HP should be reduced by 5
      const afterMatch = text.match(/HP:.*?→.*?(\d+)\/(\d+)/);
      expect(parseInt(afterMatch![1])).toBe(initialHp - 5);
    });

    it('should reject level out of range', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        level: 25, // Over 20
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('Level');
    });

    it('should reject ability scores out of range', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        stats: { str: 35 }, // Over 30
      });

      expect(result.isError).toBe(true);
    });

    it('should reject non-existent character', async () => {
      const result = await handleToolCall('update_character', {
        characterId: 'non-existent-id',
        hp: 30,
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('not found');
    });
  });

  describe('Persistence', () => {
    it('should persist changes to disk', async () => {
      await handleToolCall('update_character', {
        characterId: testCharacterId,
        name: 'Persisted Hero',
        hp: 42,
      });

      // Read the file directly from AppData
      const dataDir = path.join(getDataDir(), 'characters');
      const filePath = path.join(dataDir, `${testCharacterId}.json`);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const character = JSON.parse(fileContent);

      expect(character.name).toBe('Persisted Hero');
      expect(character.hp).toBe(42);
    });

    it('should retrieve updated character with get_character', async () => {
      await handleToolCall('update_character', {
        characterId: testCharacterId,
        ac: 22,
      });

      const result = await handleToolCall('get_character', {
        characterId: testCharacterId,
      });

      const text = getTextContent(result);
      expect(text).toContain('22'); // Updated AC
    });
  });

  describe('Output Format', () => {
    it('should show before/after comparison in ASCII', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: 35,
        level: 6,
      });

      const text = getTextContent(result);
      expect(text).toContain('╔'); // ASCII box border
      expect(text).toContain('CHARACTER UPDATE');
      expect(text).toContain('CHANGES');
      expect(text).toContain('→'); // Arrow showing changes
      expect(text).toContain('║'); // Box border (HEAVY style)
    });

    it('should only show changed fields in comparison', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: 20,
      });

      const text = getTextContent(result);
      // Should show HP change
      expect(text).toContain('HP:');
      // Should not clutter with unchanged fields (test by checking reasonable length)
      expect(text.length).toBeLessThan(2000); // Compact output
    });

    it('should handle updates with no actual changes gracefully', async () => {
      // Get current HP first
      const getResult = await handleToolCall('get_character', {
        characterId: testCharacterId,
      });
      const getText = getTextContent(getResult);
      const hpMatch = getText.match(/HP: \[.*?\] (\d+)\/(\d+)/);
      const currentHp = parseInt(hpMatch![1]);

      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: currentHp, // Same value
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('CHARACTER UPDATE');
    });
  });
});
