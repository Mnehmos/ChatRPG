/**
 * get_character Tests - TDD
 * Red -> Green -> Refactor
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

const DATA_DIR = path.join(getDataDir(), 'characters');

describe('get_character', () => {
  // Helper function to create a test character and return its ID
  async function createTestCharacter(): Promise<string> {
    const result = await handleToolCall('create_character', {
      name: 'Test Retrieval Character',
      race: 'Halfling',
      class: 'Rogue',
      level: 5,
      background: 'Criminal',
      stats: { str: 10, dex: 18, con: 12, int: 14, wis: 10, cha: 14 },
      skillProficiencies: ['stealth', 'sleight_of_hand', 'deception'],
      saveProficiencies: ['dex', 'int'],
    });

    if (result.isError) {
      const text = getTextContent(result);
      throw new Error(`Failed to create test character: ${text}`);
    }

    const text = getTextContent(result);
    const match = text.match(/Character ID: ([a-z0-9-]+)/);
    const id = match ? match[1] : '';

    if (!id) {
      throw new Error(`Failed to extract character ID from: ${text}`);
    }

    return id;
  }

  // Clean up before and after all tests in this suite
  beforeAll(() => {
    if (fs.existsSync(DATA_DIR)) {
      const files = fs.readdirSync(DATA_DIR);
      for (const file of files) {
        const filePath = path.join(DATA_DIR, file);
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          // Ignore errors if file was already deleted
        }
      }
    }
  });

  afterAll(() => {
    if (fs.existsSync(DATA_DIR)) {
      const files = fs.readdirSync(DATA_DIR);
      for (const file of files) {
        const filePath = path.join(DATA_DIR, file);
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          // Ignore errors if file was already deleted
        }
      }
    }
  });

  describe('Retrieval', () => {
    it('should retrieve an existing character by ID', async () => {
      const testCharacterId = await createTestCharacter();

      const result = await handleToolCall('get_character', {
        characterId: testCharacterId
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);
      expect(text).toContain('Test Retrieval Character');
      expect(text).toContain('Rogue');
      expect(text).toContain('Level 5');
    });

    it('should return full character data including stats', async () => {
      const testCharacterId = await createTestCharacter();

      const result = await handleToolCall('get_character', {
        characterId: testCharacterId
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);

      // Check for ability scores
      expect(text).toContain('DEX');
      expect(text).toContain('18');

      // Check for other character info
      expect(text).toContain('Halfling');
      expect(text).toContain('Criminal');
    });

    it('should include calculated values (modifiers, proficiency)', async () => {
      const testCharacterId = await createTestCharacter();

      const result = await handleToolCall('get_character', {
        characterId: testCharacterId
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);

      // Check for proficiency bonus (level 5 = +3)
      expect(text).toContain('+3');

      // Check for ability modifier formatting (DEX 18 = +4)
      expect(text).toContain('+4');
    });
  });

  describe('Error Handling', () => {
    it('should return error for non-existent character ID', async () => {
      const result = await handleToolCall('get_character', {
        characterId: 'non-existent-uuid-12345'
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/Error|ERROR/i);
      expect(text.toLowerCase()).toContain('not found');
    });

    it('should return error for empty character ID', async () => {
      const result = await handleToolCall('get_character', {
        characterId: ''
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/Error|ERROR/i);
    });
  });

  describe('Output Format', () => {
    it('should return ASCII art character sheet', async () => {
      const testCharacterId = await createTestCharacter();

      const result = await handleToolCall('get_character', {
        characterId: testCharacterId
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);

      // Should have ASCII box borders
      expect(text).toContain('╔');

      // Should have HP bar and table formatting
      expect(text).toContain('HP: [');
      expect(text).toContain('│'); // Table borders
    });

    it('should include all ability scores with modifiers', async () => {
      const testCharacterId = await createTestCharacter();

      const result = await handleToolCall('get_character', {
        characterId: testCharacterId
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);

      // Check all six ability scores are present
      expect(text).toContain('STR');
      expect(text).toContain('DEX');
      expect(text).toContain('CON');
      expect(text).toContain('INT');
      expect(text).toContain('WIS');
      expect(text).toContain('CHA');
    });
  });

  describe('Death Save State Exposure', () => {
    it('should show death save state when character is dying in an active encounter', async () => {
      // Create a character
      const result = await handleToolCall('create_character', {
        name: 'Death Test Hero',
        race: 'Human',
        class: 'Fighter',
        level: 5,
        stats: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 10 },
      });
      const text = getTextContent(result);
      const idMatch = text.match(/Character ID: ([a-z0-9-]+)/);
      const characterId = idMatch ? idMatch[1] : '';
      expect(characterId).not.toBe('');

      // Import combat functions
      const { clearAllEncounters, clearAllDeathSaveState } = await import('../../src/modules/combat.js');
      clearAllEncounters();
      clearAllDeathSaveState();

      // Directly set the character's HP to 0 by modifying the file
      const charFilePath = path.join(DATA_DIR, `${characterId}.json`);
      const charData = JSON.parse(fs.readFileSync(charFilePath, 'utf-8'));
      charData.hp = 0;
      fs.writeFileSync(charFilePath, JSON.stringify(charData, null, 2), 'utf-8');

      // Create encounter with the character at 0 HP
      const encounterResult = await handleToolCall('manage_encounter', {
        operation: 'create',
        participants: [
          { id: characterId, characterId: characterId, name: 'Death Test Hero', hp: 0, maxHp: 44, ac: 18, initiativeBonus: 2, position: { x: 5, y: 5 } },
          { id: 'enemy-1', name: 'Goblin', hp: 7, maxHp: 7, ac: 13, initiativeBonus: 1, position: { x: 10, y: 10 }, isEnemy: true },
        ],
      });
      const encText = getTextContent(encounterResult);
      const encMatch = encText.match(/Encounter ID:\s*([a-zA-Z0-9-]+)/i);
      const encounterId = encMatch ? encMatch[1] : '';
      expect(encounterId).not.toBe('');

      // Roll a death save to create death save state
      const deathSaveResult = await handleToolCall('roll_death_save', {
        encounterId,
        characterId,
        manualRoll: 5, // Force a failure
      });
      expect(deathSaveResult.isError).toBeUndefined();

      // Now get the character - should show death save state
      const getResult = await handleToolCall('get_character', {
        characterId,
      });
      expect(getResult.isError).toBeUndefined();
      const getText = getTextContent(getResult);

      // Should show death saves section
      expect(getText).toMatch(/death.*save/i);
      expect(getText).toMatch(/success|failure/i);
      expect(getText).toMatch(/dying|stable|dead/i);

      // Cleanup
      clearAllEncounters();
      clearAllDeathSaveState();
    });
  });
});
