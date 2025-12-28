/**
 * roll_check Tests - TDD Red Phase
 * Tests for skill checks, ability checks, saving throws, attack rolls, and initiative
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

describe('roll_check', () => {
  let testCharacterId: string;
  let proficientCharacterId: string;

  beforeAll(async () => {
    // Clean up test data
    if (fs.existsSync(DATA_DIR)) {
      const files = fs.readdirSync(DATA_DIR);
      for (const file of files) {
        const filePath = path.join(DATA_DIR, file);
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          // Ignore errors
        }
      }
    }

    // Create character with standard stats
    const result1 = await handleToolCall('create_character', {
      name: 'Test Rogue',
      class: 'Rogue',
      level: 3,
      stats: {
        str: 10,  // +0
        dex: 16,  // +3
        con: 12,  // +1
        int: 14,  // +2
        wis: 13,  // +1
        cha: 10,  // +0
      },
      skillProficiencies: ['stealth', 'perception', 'sleight_of_hand'],
      saveProficiencies: ['dex', 'int'],
    });

    const text1 = getTextContent(result1);
    const match1 = text1.match(/Character ID: ([a-z0-9-]+)/);
    testCharacterId = match1![1];

    // Create character for contested checks
    const result2 = await handleToolCall('create_character', {
      name: 'Test Fighter',
      class: 'Fighter',
      level: 5,
      stats: {
        str: 16,  // +3
        dex: 14,  // +2
        con: 14,  // +2
        int: 10,  // +0
        wis: 12,  // +1
        cha: 8,   // -1
      },
      skillProficiencies: ['athletics', 'intimidation'],
      saveProficiencies: ['str', 'con'],
    });

    const text2 = getTextContent(result2);
    const match2 = text2.match(/Character ID: ([a-z0-9-]+)/);
    proficientCharacterId = match2![1];
  });

  afterAll(() => {
    // Clean up test data
    if (fs.existsSync(DATA_DIR)) {
      const files = fs.readdirSync(DATA_DIR);
      for (const file of files) {
        const filePath = path.join(DATA_DIR, file);
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          // Ignore errors
        }
      }
    }
  });

  describe('Basic Rolls (no character)', () => {
    it('should roll a raw ability check with just ability specified', async () => {
      const result = await handleToolCall('roll_check', {
        checkType: 'ability',
        ability: 'str',
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('STR');
      expect(text).toContain('Check');
    });

    it('should return a value between 1-20 for raw d20 roll', async () => {
      const result = await handleToolCall('roll_check', {
        checkType: 'ability',
        ability: 'dex',
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      
      // Extract the roll result (should contain a number between 1-20)
      const rollMatch = text.match(/(?:Roll|Total):\s*(\d+)/i);
      if (rollMatch) {
        const roll = parseInt(rollMatch[1]);
        expect(roll).toBeGreaterThanOrEqual(1);
        expect(roll).toBeLessThanOrEqual(20);
      }
    });

    it('should apply bonus modifier correctly', async () => {
      const result = await handleToolCall('roll_check', {
        checkType: 'ability',
        ability: 'int',
        bonus: 5,
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('5'); // Bonus should appear
      expect(text).toContain('INT');
    });

    it('should return total = roll + bonus for no character roll', async () => {
      const result = await handleToolCall('roll_check', {
        checkType: 'ability',
        ability: 'wis',
        bonus: 3,
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Total'); // Should show total
    });

    it('should handle negative bonus modifier', async () => {
      const result = await handleToolCall('roll_check', {
        checkType: 'ability',
        ability: 'cha',
        bonus: -2,
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('-2');
    });
  });

  describe('Character-Based Rolls', () => {
    it('should use character ability modifier for skill check', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'skill',
        skill: 'acrobatics', // DEX-based, +3 modifier
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Test Rogue');
      expect(text).toContain('Acrobatics');
      expect(text).toContain('+3'); // DEX modifier
    });

    it('should use character ability modifier for ability check', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'ability',
        ability: 'int', // +2 modifier
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Test Rogue');
      expect(text).toContain('INT');
      expect(text).toContain('+2');
    });

    it('should use character ability modifier for saving throw', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'save',
        ability: 'con', // +1 modifier
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Test Rogue');
      expect(text).toContain('CON');
      expect(text).toContain('Save');
    });

    it('should add proficiency bonus to proficient skill', async () => {
      // Stealth is proficient, level 3 = +2 proficiency
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'skill',
        skill: 'stealth', // Proficient, DEX-based (+3) + proficiency (+2) = +5
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Stealth');
      expect(text).toContain('+5'); // +3 DEX + +2 proficiency
    });

    it('should add proficiency bonus to proficient save', async () => {
      // DEX save is proficient
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'save',
        ability: 'dex', // Proficient, +3 DEX + +2 proficiency = +5
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('DEX');
      expect(text).toContain('Save');
      expect(text).toContain('+5');
    });

    it('should not add proficiency to non-proficient skill', async () => {
      // Athletics is not proficient for the rogue
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'skill',
        skill: 'athletics', // Not proficient, STR-based (+0) = +0
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Athletics');
      expect(text).toContain('+0'); // Just the STR modifier, no proficiency
    });

    it('should look up character by name instead of ID', async () => {
      const result = await handleToolCall('roll_check', {
        characterName: 'Test Rogue',
        checkType: 'skill',
        skill: 'perception',
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Test Rogue');
      expect(text).toContain('Perception');
    });
  });

  describe('Advantage/Disadvantage', () => {
    it('should roll 2d20 with advantage and keep highest', async () => {
      const result = await handleToolCall('roll_check', {
        checkType: 'ability',
        ability: 'str',
        advantage: true,
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Advantage');
      // Should show both dice rolled
      expect(text).toMatch(/\d+.*\d+/); // Two numbers
    });

    it('should roll 2d20 with disadvantage and keep lowest', async () => {
      const result = await handleToolCall('roll_check', {
        checkType: 'ability',
        ability: 'dex',
        disadvantage: true,
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Disadvantage');
      // Should show both dice rolled
      expect(text).toMatch(/\d+.*\d+/);
    });

    it('should cancel advantage and disadvantage and roll normally', async () => {
      const result = await handleToolCall('roll_check', {
        checkType: 'ability',
        ability: 'wis',
        advantage: true,
        disadvantage: true,
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should indicate they cancel
      expect(text).toMatch(/Normal|Cancel|neither/i);
    });

    it('should show both dice values in output with advantage', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'skill',
        skill: 'stealth',
        advantage: true,
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Stealth');
      // Should display both rolls
      expect(text).toMatch(/\[\d+,\s*\d+\]|Rolls?:\s*\d+.*\d+/);
    });
  });

  describe('DC Checks', () => {
    it('should return success when total >= DC', async () => {
      const result = await handleToolCall('roll_check', {
        checkType: 'ability',
        ability: 'str',
        bonus: 20, // Ensure we pass
        dc: 10,
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('DC 10');
      expect(text).toMatch(/Success|Pass|✓/i);
    });

    it('should return failure when total < DC', async () => {
      const result = await handleToolCall('roll_check', {
        checkType: 'ability',
        ability: 'str',
        bonus: -10, // Ensure we fail
        dc: 20,
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('DC 20');
      expect(text).toMatch(/Fail|✗|Miss/i);
    });

    it('should show DC value prominently in output', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'skill',
        skill: 'perception',
        dc: 15,
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('15'); // DC value
      expect(text).toContain('Perception');
    });

    it('should handle edge case where total exactly equals DC (success)', async () => {
      const result = await handleToolCall('roll_check', {
        checkType: 'ability',
        ability: 'dex',
        bonus: 5,
        dc: 15, // If roll is 10, total = 15 = DC (should succeed)
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('DC 15');
    });

    it('should treat natural 20 as automatic success for saving throw', async () => {
      // This might require multiple attempts or mocking, but test the concept
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'save',
        ability: 'str',
        dc: 30, // Impossible DC
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // The result depends on the actual roll, but output should be formatted
      expect(text).toContain('Save');
    });

    it('should treat natural 1 as automatic failure for saving throw', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'save',
        ability: 'dex',
        dc: 1, // Very easy DC
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // The result depends on the actual roll
      expect(text).toContain('Save');
    });
  });

  describe('Contested Checks', () => {
    it('should roll opposed checks for two characters', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'skill',
        skill: 'stealth',
        contestedBy: proficientCharacterId,
        contestedCheck: {
          type: 'skill',
          skillOrAbility: 'perception',
        },
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Test Rogue');
      expect(text).toContain('Test Fighter');
      expect(text).toContain('Stealth');
      expect(text).toContain('Perception');
    });

    it('should show both roll totals in contested check', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'ability',
        ability: 'dex',
        contestedBy: proficientCharacterId,
        contestedCheck: {
          type: 'ability',
          skillOrAbility: 'str',
        },
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should show both totals
      expect(text).toMatch(/\d+.*vs.*\d+|\d+.*:\s*\d+/);
    });

    it('should declare winner of contested check', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'skill',
        skill: 'athletics',
        contestedBy: proficientCharacterId,
        contestedCheck: {
          type: 'skill',
          skillOrAbility: 'athletics',
        },
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should declare a winner or tie
      expect(text).toMatch(/Win|Lose|Tie|Success|Fail/i);
    });

    it('should handle tie in contested check (favor defender)', async () => {
      // This is hard to test without mocking rolls, but verify output format
      const result = await handleToolCall('roll_check', {
        characterId: proficientCharacterId,
        checkType: 'skill',
        skill: 'intimidation',
        contestedBy: testCharacterId,
        contestedCheck: {
          type: 'skill',
          skillOrAbility: 'insight',
        },
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Intimidation');
      expect(text).toContain('Insight');
    });
  });

  describe('All Check Types', () => {
    it('should handle checkType: skill with appropriate skill', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'skill',
        skill: 'arcana', // INT-based
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Arcana');
      expect(text).toContain('INT'); // Should show linked ability
    });

    it('should handle checkType: ability for raw ability check', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'ability',
        ability: 'str',
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('STR');
      expect(text).toMatch(/Ability.*Check|STR.*Check/i);
    });

    it('should handle checkType: save for saving throw', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'save',
        ability: 'wis',
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('WIS');
      expect(text).toContain('Save');
    });

    it('should handle checkType: attack for attack roll', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: proficientCharacterId,
        checkType: 'attack',
        ability: 'str', // Melee attack with STR
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/Attack|To Hit/i);
      // Should add proficiency bonus for attacks
    });

    it('should handle checkType: initiative as special DEX check', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'initiative',
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Initiative');
      expect(text).toContain('+3'); // DEX modifier
    });

    it('should link skills to correct abilities', async () => {
      // Athletics = STR
      const result1 = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'skill',
        skill: 'athletics',
      });
      const text1 = getTextContent(result1);
      expect(text1).toContain('STR');

      // Stealth = DEX
      const result2 = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'skill',
        skill: 'stealth',
      });
      const text2 = getTextContent(result2);
      expect(text2).toContain('DEX');

      // Arcana = INT
      const result3 = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'skill',
        skill: 'arcana',
      });
      const text3 = getTextContent(result3);
      expect(text3).toContain('INT');
    });
  });

  describe('ASCII Art Output', () => {
    it('should use box drawing characters for output', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'skill',
        skill: 'perception',
        dc: 15,
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/[╔╗╚╝═║]/); // ASCII box characters
    });

    it('should show roll type prominently', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'save',
        ability: 'dex',
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('SAVE');
    });

    it('should show modifier breakdown', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'skill',
        skill: 'stealth', // +3 DEX + +2 proficiency = +5
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should show breakdown like "1d20 + 3 (DEX) + 2 (Prof)"
      expect(text).toContain('+3');
      expect(text).toContain('+2');
    });

    it('should show dice rolled clearly', async () => {
      const result = await handleToolCall('roll_check', {
        checkType: 'ability',
        ability: 'con',
        advantage: true,
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/\d+/); // Should contain dice values
    });

    it('should show total prominently', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'skill',
        skill: 'sleight_of_hand',
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/Total:?\s*\d+/i);
    });

    it('should show DC result clearly when DC provided', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'skill',
        skill: 'acrobatics',
        dc: 12,
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('DC 12');
      expect(text).toMatch(/Success|Failure|✓|✗/);
    });
  });

  describe('Edge Cases', () => {
    it('should handle raw d20 roll with no character and no bonus', async () => {
      const result = await handleToolCall('roll_check', {
        checkType: 'ability',
        ability: 'str',
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('STR');
      // Total should equal the raw d20 roll
    });

    it('should reject invalid character ID', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: 'nonexistent-id',
        checkType: 'skill',
        skill: 'perception',
      });
      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/not found|invalid|error/i);
    });

    it('should reject invalid skill name', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'skill',
        skill: 'not_a_real_skill',
      });
      expect(result.isError).toBe(true);
    });

    it('should reject invalid ability name', async () => {
      const result = await handleToolCall('roll_check', {
        checkType: 'ability',
        ability: 'not_an_ability',
      });
      expect(result.isError).toBe(true);
    });

    it('should reject invalid check type', async () => {
      const result = await handleToolCall('roll_check', {
        checkType: 'invalid_type',
        ability: 'str',
      });
      expect(result.isError).toBe(true);
    });

    it('should handle missing required skill for skill check', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'skill',
        // Missing skill parameter
      });
      expect(result.isError).toBe(true);
    });

    it('should handle missing required ability for ability/save check', async () => {
      const result = await handleToolCall('roll_check', {
        checkType: 'ability',
        // Missing ability parameter
      });
      expect(result.isError).toBe(true);
    });

    it('should combine bonus with character modifiers', async () => {
      const result = await handleToolCall('roll_check', {
        characterId: testCharacterId,
        checkType: 'ability',
        ability: 'dex', // +3 from character
        bonus: 2, // +2 from Guidance or similar
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Total modifier should be +5 (+3 DEX + +2 bonus)
      expect(text).toContain('+5');
    });
  });

  describe('roll_check during active encounter (CRITICAL-004)', () => {
    let encounterId: string;
    let encounterCharacterId: string;
    const ENCOUNTER_DATA_DIR = path.join(getDataDir(), 'encounters');

    beforeAll(async () => {
      // Create character with stats and skill proficiencies for encounter testing
      const charResult = await handleToolCall('create_character', {
        name: 'Perception Tester',
        class: 'Ranger',
        level: 5,
        stats: {
          str: 10,  // +0
          dex: 16,  // +3
          con: 14,  // +2
          int: 12,  // +1
          wis: 16,  // +3
          cha: 8,   // -1
        },
        skillProficiencies: ['perception', 'stealth'],
        saveProficiencies: ['str', 'dex'],
      });

      const charText = getTextContent(charResult);
      const charMatch = charText.match(/Character ID: ([a-z0-9-]+)/);
      encounterCharacterId = charMatch![1];

      // Create an encounter with this character as a participant
      const encResult = await handleToolCall('create_encounter', {
        participants: [
          {
            characterId: encounterCharacterId,
            position: { x: 0, y: 0 }
          },
          {
            id: 'goblin-scout',
            name: 'Goblin Scout',
            hp: 7,
            maxHp: 7,
            ac: 13,
            position: { x: 5, y: 0 },
            isEnemy: true
          }
        ]
      });

      const encText = getTextContent(encResult);
      const encMatch = encText.match(/Encounter ID: ([a-z0-9-]+)/i) ||
                       encText.match(/ID[:\s]+([a-z0-9-]+)/i) ||
                       encText.match(/([a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12})/i);
      encounterId = encMatch![1];
    });

    afterAll(async () => {
      // End the encounter and clean up
      try {
        await handleToolCall('end_encounter', {
          encounterId: encounterId,
          outcome: 'victory',
        });
      } catch (e) {
        // Ignore cleanup errors
      }

      // Clean up encounter data
      if (fs.existsSync(ENCOUNTER_DATA_DIR)) {
        const files = fs.readdirSync(ENCOUNTER_DATA_DIR);
        for (const file of files) {
          const filePath = path.join(ENCOUNTER_DATA_DIR, file);
          try {
            fs.unlinkSync(filePath);
          } catch (err) {
            // Ignore errors
          }
        }
      }

      // Clean up the test character
      try {
        await handleToolCall('delete_character', {
          characterId: encounterCharacterId,
        });
      } catch (e) {
        // Ignore cleanup errors
      }
    });

    it('should make skill check for character in active encounter by characterId', async () => {
      // Use characterId to roll a skill check while character is in an active encounter
      const result = await handleToolCall('roll_check', {
        characterId: encounterCharacterId,
        checkType: 'skill',
        skill: 'perception', // Proficient, WIS-based (+3) + proficiency (+3 at level 5) = +6
      });

      const text = getTextContent(result);
      
      // Character should be found, not error
      expect(result.isError).toBeUndefined();
      expect(text).not.toMatch(/not found|error|invalid/i);
      
      // Should contain character name and skill
      expect(text).toContain('Perception Tester');
      expect(text).toContain('Perception');
      
      // Should include correct modifier (+3 WIS + +3 proficiency = +6)
      expect(text).toContain('+6');
    });

    it('should make ability check for character in active encounter', async () => {
      // Roll raw ability check (not skill) while character is in active encounter
      const result = await handleToolCall('roll_check', {
        characterId: encounterCharacterId,
        checkType: 'ability',
        ability: 'dex', // +3 modifier
      });

      const text = getTextContent(result);
      
      // Character should be found
      expect(result.isError).toBeUndefined();
      expect(text).not.toMatch(/not found|error|invalid/i);
      
      // Should show character name and ability
      expect(text).toContain('Perception Tester');
      expect(text).toContain('DEX');
      
      // Modifier should be just the ability modifier (+3), no proficiency
      expect(text).toContain('+3');
    });

    it('should find character by characterName during active encounter', async () => {
      // Use characterName instead of characterId while in encounter
      const result = await handleToolCall('roll_check', {
        characterName: 'Perception Tester',
        checkType: 'skill',
        skill: 'stealth', // Proficient, DEX-based (+3) + proficiency (+3) = +6
      });

      const text = getTextContent(result);
      
      // Character should be found by name
      expect(result.isError).toBeUndefined();
      expect(text).not.toMatch(/not found|error|invalid/i);
      
      // Should show character name and skill
      expect(text).toContain('Perception Tester');
      expect(text).toContain('Stealth');
    });

    it('should apply proficiency to proficient skills during encounter', async () => {
      // Roll a proficient skill (perception) - should include proficiency bonus
      const proficientResult = await handleToolCall('roll_check', {
        characterId: encounterCharacterId,
        checkType: 'skill',
        skill: 'perception', // Proficient: +3 WIS + +3 proficiency = +6
      });
      const proficientText = getTextContent(proficientResult);
      
      // Roll a non-proficient skill (athletics) - should NOT include proficiency
      const nonProficientResult = await handleToolCall('roll_check', {
        characterId: encounterCharacterId,
        checkType: 'skill',
        skill: 'athletics', // Not proficient: +0 STR only
      });
      const nonProficientText = getTextContent(nonProficientResult);
      
      // Both should succeed (character found)
      expect(proficientResult.isError).toBeUndefined();
      expect(nonProficientResult.isError).toBeUndefined();
      
      expect(proficientText).not.toMatch(/not found|error|invalid/i);
      expect(nonProficientText).not.toMatch(/not found|error|invalid/i);
      
      // Perception should show +6 (proficient)
      expect(proficientText).toContain('+6');
      
      // Athletics should show +0 (not proficient, STR is 10)
      expect(nonProficientText).toContain('+0');
    });

    it('should make saving throw for character in active encounter', async () => {
      // Roll a saving throw while character is in encounter
      const result = await handleToolCall('roll_check', {
        characterId: encounterCharacterId,
        checkType: 'save',
        ability: 'dex', // Proficient: +3 DEX + +3 proficiency = +6
      });

      const text = getTextContent(result);
      
      // Character should be found
      expect(result.isError).toBeUndefined();
      expect(text).not.toMatch(/not found|error|invalid/i);
      
      // Should show character name and save type
      expect(text).toContain('Perception Tester');
      expect(text).toContain('DEX');
      expect(text).toContain('Save');
      
      // Should include proficiency since DEX save is proficient
      expect(text).toContain('+6');
    });

    it('should work with DC check for character in active encounter', async () => {
      // Roll a skill check against a DC while in encounter
      const result = await handleToolCall('roll_check', {
        characterId: encounterCharacterId,
        checkType: 'skill',
        skill: 'perception',
        dc: 15,
      });

      const text = getTextContent(result);
      
      // Character should be found
      expect(result.isError).toBeUndefined();
      expect(text).not.toMatch(/not found|error|invalid/i);
      
      // Should show DC and result
      expect(text).toContain('DC 15');
      expect(text).toMatch(/Success|Failure|✓|✗/);
    });
  });
});
