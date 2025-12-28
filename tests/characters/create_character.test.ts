/**
 * create_character Tests - TDD
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

describe('create_character', () => {
  // Clean up test data before and after all tests in this suite
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

  describe('Basic Creation', () => {
    it('should create a character with minimal required fields', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Thorin',
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Thorin');
      expect(text).toContain('CHARACTER SHEET');
    });

    it('should create a character with full D&D stats', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Gandalf',
        race: 'Human',
        class: 'Wizard',
        level: 5,
        stats: {
          str: 10,
          dex: 14,
          con: 12,
          int: 18,
          wis: 16,
          cha: 14,
        },
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Gandalf');
      expect(text).toContain('Wizard');
      expect(text).toContain('INT');
      expect(text).toContain('18');
    });

    it('should auto-calculate HP based on class and CON', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Fighter Test',
        class: 'Fighter',
        level: 1,
        stats: {
          str: 16,
          dex: 14,
          con: 14, // +2 modifier
          int: 10,
          wis: 10,
          cha: 10,
        },
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Fighter d10 hit die: 10 + CON mod (2) = 12 HP at level 1
      expect(text).toContain('HP');
    });

    it('should generate unique character ID', async () => {
      const result1 = await handleToolCall('create_character', {
        name: 'Character 1',
      });
      const result2 = await handleToolCall('create_character', {
        name: 'Character 2',
      });

      expect(result1.isError).toBeUndefined();
      expect(result2.isError).toBeUndefined();

      // Extract IDs from results
      const text1 = getTextContent(result1);
      const text2 = getTextContent(result2);
      const match1 = text1.match(/Character ID: ([a-z0-9-]+)/);
      const match2 = text2.match(/Character ID: ([a-z0-9-]+)/);

      expect(match1).toBeTruthy();
      expect(match2).toBeTruthy();

      const id1 = match1![1];
      const id2 = match2![1];

      // IDs should be different
      expect(id1).not.toBe(id2);

      // Both files should exist
      expect(fs.existsSync(path.join(DATA_DIR, `${id1}.json`))).toBe(true);
      expect(fs.existsSync(path.join(DATA_DIR, `${id2}.json`))).toBe(true);
    });
  });

  describe('Character Types', () => {
    it('should create PC type by default', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Hero',
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('PC');
    });

    it('should create NPC type when specified', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Shopkeeper',
        characterType: 'npc',
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('NPC');
    });

    it('should create enemy type when specified', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Goblin',
        characterType: 'enemy',
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('ENEMY');
    });
  });

  describe('Validation', () => {
    it('should reject ability scores below 1', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Invalid',
        stats: {
          str: 0,
          dex: 10,
          con: 10,
          int: 10,
          wis: 10,
          cha: 10,
        },
      });
      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/Error|ERROR/i);
    });

    it('should reject ability scores above 30', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Invalid',
        stats: {
          str: 31,
          dex: 10,
          con: 10,
          int: 10,
          wis: 10,
          cha: 10,
        },
      });
      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/Error|ERROR/i);
    });

    it('should reject missing name', async () => {
      const result = await handleToolCall('create_character', {
        class: 'Wizard',
      });
      expect(result.isError).toBe(true);
    });

    it('should reject invalid level (0 or >20)', async () => {
      const result1 = await handleToolCall('create_character', {
        name: 'Invalid',
        level: 0,
      });
      expect(result1.isError).toBe(true);

      const result2 = await handleToolCall('create_character', {
        name: 'Invalid',
        level: 21,
      });
      expect(result2.isError).toBe(true);
    });
  });

  describe('Persistence', () => {
    it('should save character to data/characters/{id}.json', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Persistent Hero',
        class: 'Paladin',
        level: 3,
      });

      expect(result.isError).toBeUndefined();
      expect(fs.existsSync(DATA_DIR)).toBe(true);

      // Extract ID from result
      const text = getTextContent(result);
      const match = text.match(/Character ID: ([a-z0-9-]+)/);
      expect(match).toBeTruthy();
      const characterId = match![1];

      // Verify the specific file exists
      const filePath = path.join(DATA_DIR, `${characterId}.json`);
      expect(fs.existsSync(filePath)).toBe(true);

      // Verify file content
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const character = JSON.parse(fileContent);

      expect(character.name).toBe('Persistent Hero');
      expect(character.class).toBe('Paladin');
      expect(character.level).toBe(3);
      expect(character.id).toBe(characterId);
      expect(character.createdAt).toBeDefined();
    });
  });

  describe('Output Format', () => {
    it('should return ASCII art character sheet', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Rich Output Test',
        race: 'Elf',
        class: 'Ranger',
        level: 4,
      });
      const text = getTextContent(result);

      expect(result.isError).toBeUndefined();
      expect(text).toContain('╔'); // ASCII box border
      expect(text).toContain('Rich Output Test');
      expect(text).toContain('Elf');
      expect(text).toContain('Ranger');
      expect(text).toContain('Level 4');
    });

    it('should include ASCII box drawing and HP bar', async () => {
      const result = await handleToolCall('create_character', {
        name: 'ASCII Test',
        class: 'Barbarian',
      });
      const text = getTextContent(result);

      expect(result.isError).toBeUndefined();
      // Should have ASCII box drawing characters
      expect(text).toContain('╔'); // Heavy box top-left
      expect(text).toContain('HP: ['); // HP bar
    });
  });
});
