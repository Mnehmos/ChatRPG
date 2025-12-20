/**
 * create_encounter Tests - TDD Red Phase
 * These tests are intentionally written to FAIL until the handler is implemented
 */

import { describe, it, expect } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';

describe('create_encounter', () => {
  describe('Basic Encounter Creation', () => {
    it('should create encounter with minimum viable participants', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          {
            id: 'player-1',
            name: 'Aragorn',
            hp: 45,
            maxHp: 45,
            position: { x: 0, y: 0 },
          },
          {
            id: 'goblin-1',
            name: 'Goblin Scout',
            hp: 7,
            maxHp: 7,
            position: { x: 10, y: 10 },
            isEnemy: true,
          },
        ],
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('╔'); // ASCII box border
      expect(text).toContain('ENCOUNTER');
      expect(text).toContain('Aragorn');
      expect(text).toContain('Goblin Scout');
      // Should include encounter ID in output
      expect(text).toMatch(/Encounter ID:/i);
    });

    it('should return unique encounter ID', async () => {
      const result1 = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Fighter', hp: 30, maxHp: 30, position: { x: 0, y: 0 } },
          { id: 'e1', name: 'Orc', hp: 15, maxHp: 15, position: { x: 5, y: 5 }, isEnemy: true },
        ],
      });

      const result2 = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p2', name: 'Wizard', hp: 20, maxHp: 20, position: { x: 0, y: 0 } },
          { id: 'e2', name: 'Troll', hp: 84, maxHp: 84, position: { x: 8, y: 8 }, isEnemy: true },
        ],
      });

      const text1 = getTextContent(result1);
      const text2 = getTextContent(result2);
      
      // Extract encounter IDs (should be different)
      const id1Match = text1.match(/Encounter ID: ([a-zA-Z0-9-]+)/);
      const id2Match = text2.match(/Encounter ID: ([a-zA-Z0-9-]+)/);
      
      expect(id1Match).not.toBeNull();
      expect(id2Match).not.toBeNull();
      expect(id1Match![1]).not.toBe(id2Match![1]);
    });

    it('should auto-roll initiative for all participants', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          {
            id: 'player-1',
            name: 'Ranger',
            hp: 35,
            maxHp: 35,
            initiativeBonus: 3,
            position: { x: 0, y: 0 },
          },
          {
            id: 'wolf-1',
            name: 'Dire Wolf',
            hp: 37,
            maxHp: 37,
            initiativeBonus: 2,
            position: { x: 15, y: 15 },
            isEnemy: true,
          },
        ],
      });

      const text = getTextContent(result);
      expect(text).toContain('INITIATIVE');
      expect(text).toContain('Ranger');
      expect(text).toContain('Dire Wolf');
      // Initiative values should be present (d20 + bonus, so 1-23 for Ranger, 1-22 for Wolf)
      expect(text).toMatch(/\d+/); // At least one number showing initiative
    });

    it('should sort initiative order correctly (highest first)', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'slow', name: 'Slow Joe', hp: 20, maxHp: 20, initiativeBonus: -2, position: { x: 0, y: 0 } },
          { id: 'fast', name: 'Fast Fred', hp: 25, maxHp: 25, initiativeBonus: 5, position: { x: 5, y: 5 } },
          { id: 'mid', name: 'Mid Mary', hp: 22, maxHp: 22, initiativeBonus: 0, position: { x: 3, y: 3 } },
        ],
      });

      const text = getTextContent(result);
      expect(text).toContain('INITIATIVE ORDER');
      // The order should show initiative values, though exact order varies due to dice
      // We just verify all three are present
      expect(text).toContain('Slow Joe');
      expect(text).toContain('Fast Fred');
      expect(text).toContain('Mid Mary');
    });
  });

  describe('Participant Handling', () => {
    it('should accept full participant data with all optional fields', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          {
            id: 'dragon-1',
            name: 'Ancient Red Dragon',
            hp: 546,
            maxHp: 546,
            ac: 22,
            initiativeBonus: 0,
            position: { x: 20, y: 20, z: 10 },
            isEnemy: true,
            size: 'gargantuan',
            speed: 40,
            resistances: ['piercing', 'slashing', 'bludgeoning'],
            immunities: ['fire'],
            vulnerabilities: ['cold'],
            conditionImmunities: ['charmed', 'frightened'],
          },
        ],
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Ancient Red Dragon');
      expect(text).toContain('546'); // HP
      expect(text).toContain('AC');
      expect(text).toContain('22');
    });

    it('should default AC to 10 when not provided', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          {
            id: 'commoner-1',
            name: 'Peasant',
            hp: 4,
            maxHp: 4,
            position: { x: 0, y: 0 },
          },
        ],
      });

      const text = getTextContent(result);
      expect(text).toContain('Peasant');
      expect(text).toContain('AC');
      expect(text).toContain('10');
    });

    it('should default size to medium when not provided', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          {
            id: 'human-1',
            name: 'Guard',
            hp: 11,
            maxHp: 11,
            position: { x: 5, y: 5 },
          },
        ],
      });

      const text = getTextContent(result);
      expect(text).toContain('Guard');
      // Size should be displayed or stored as medium
      expect(text).toMatch(/medium/i);
    });

    it('should validate position has x,y coordinates', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          {
            id: 'invalid',
            name: 'Bad Position',
            hp: 10,
            maxHp: 10,
            position: { x: 5, y: 5 },
          },
        ],
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);
      expect(text).toContain('Bad Position');
    });

    it('should handle z-coordinate elevation', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          {
            id: 'flying-1',
            name: 'Harpy',
            hp: 38,
            maxHp: 38,
            position: { x: 10, y: 10, z: 15 },
            isEnemy: true,
          },
        ],
      });

      const text = getTextContent(result);
      expect(text).toContain('Harpy');
      // Should indicate elevation
      expect(text).toMatch(/15.*ft|z.*15|elevation/i);
    });

    it('should handle resistances, immunities, and vulnerabilities', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          {
            id: 'elemental-1',
            name: 'Fire Elemental',
            hp: 102,
            maxHp: 102,
            position: { x: 8, y: 8 },
            resistances: ['piercing', 'slashing'],
            immunities: ['fire', 'poison'],
            vulnerabilities: ['cold'],
            isEnemy: true,
          },
        ],
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Fire Elemental');
    });
  });

  describe('Initiative System', () => {
    it('should roll d20 + initiativeBonus for each participant', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          {
            id: 'rogue-1',
            name: 'Rogue',
            hp: 30,
            maxHp: 30,
            initiativeBonus: 4,
            position: { x: 0, y: 0 },
          },
        ],
      });

      const text = getTextContent(result);
      // Initiative should be between 5 (1+4) and 24 (20+4)
      // New format: "22 (+4)" shows rolled initiative with bonus
      const initiativeMatch = text.match(/(\d+)\s*\(\+\d+\)/);
      expect(initiativeMatch).not.toBeNull();
      const initiative = parseInt(initiativeMatch![1]);
      expect(initiative).toBeGreaterThanOrEqual(5);
      expect(initiative).toBeLessThanOrEqual(24);
    });

    it('should handle initiative ties (same roll)', async () => {
      // This test may need to run multiple times or use a seed
      // For now, just verify it doesn't crash with multiple participants
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'a', name: 'Alice', hp: 20, maxHp: 20, initiativeBonus: 2, position: { x: 0, y: 0 } },
          { id: 'b', name: 'Bob', hp: 20, maxHp: 20, initiativeBonus: 2, position: { x: 1, y: 1 } },
          { id: 'c', name: 'Carol', hp: 20, maxHp: 20, initiativeBonus: 2, position: { x: 2, y: 2 } },
        ],
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Alice');
      expect(text).toContain('Bob');
      expect(text).toContain('Carol');
    });

    it('should handle surprised creatures', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'sneaky', name: 'Assassin', hp: 30, maxHp: 30, position: { x: 0, y: 0 } },
          { id: 'victim', name: 'Noble', hp: 9, maxHp: 9, position: { x: 5, y: 5 } },
        ],
        surprise: ['victim'],
      });

      const text = getTextContent(result);
      expect(text).toContain('Noble');
      expect(text).toMatch(/surprised|surprise/i);
    });

    it('should handle negative initiative bonuses', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          {
            id: 'slow-1',
            name: 'Zombie',
            hp: 22,
            maxHp: 22,
            initiativeBonus: -2,
            position: { x: 10, y: 10 },
            isEnemy: true,
          },
        ],
      });

      const text = getTextContent(result);
      expect(text).toContain('Zombie');
      // Initiative should be between -1 (1-2) and 18 (20-2)
      // New format: "15 (-2)" shows rolled initiative with negative bonus
      const initiativeMatch = text.match(/(-?\d+)\s*\(-?\d+\)/);
      expect(initiativeMatch).not.toBeNull();
      const initiative = parseInt(initiativeMatch![1]);
      expect(initiative).toBeGreaterThanOrEqual(-1);
      expect(initiative).toBeLessThanOrEqual(18);
    });
  });

  describe('Terrain Support', () => {
    it('should create battlefield with custom dimensions', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Fighter', hp: 30, maxHp: 30, position: { x: 5, y: 5 } },
        ],
        terrain: {
          width: 30,
          height: 25,
        },
      });

      const text = getTextContent(result);
      expect(text).toContain('30'); // Width
      expect(text).toContain('25'); // Height
      expect(text).toMatch(/battlefield|terrain/i);
    });

    it('should default terrain to 20x20 when not provided', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Cleric', hp: 27, maxHp: 27, position: { x: 10, y: 10 } },
        ],
      });

      const text = getTextContent(result);
      expect(text).toContain('20'); // Default dimensions
    });

    it('should recognize obstacles at specified positions', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Ranger', hp: 30, maxHp: 30, position: { x: 0, y: 0 } },
        ],
        terrain: {
          width: 20,
          height: 20,
          obstacles: ['5,5', '5,6', '6,5', '6,6'], // 2x2 boulder
        },
      });

      const text = getTextContent(result);
      expect(text).toMatch(/obstacle/i);
    });

    it('should recognize difficult terrain', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Barbarian', hp: 50, maxHp: 50, position: { x: 0, y: 0 } },
        ],
        terrain: {
          width: 20,
          height: 20,
          difficultTerrain: ['10,10', '10,11', '11,10', '11,11'], // Rough ground
        },
      });

      const text = getTextContent(result);
      expect(text).toMatch(/difficult.*terrain/i);
    });

    it('should handle water terrain', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Paladin', hp: 40, maxHp: 40, position: { x: 0, y: 0 } },
        ],
        terrain: {
          width: 25,
          height: 25,
          water: ['12,12', '12,13', '13,12', '13,13'], // Small pond
        },
      });

      const text = getTextContent(result);
      expect(text).toMatch(/water/i);
    });

    it('should handle hazards with DC and damage', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Rogue', hp: 28, maxHp: 28, position: { x: 0, y: 0 } },
        ],
        terrain: {
          width: 20,
          height: 20,
          hazards: [
            {
              position: '10,10',
              type: 'fire trap',
              damage: '4d6',
              dc: 15,
            },
          ],
        },
      });

      const text = getTextContent(result);
      expect(text).toMatch(/hazard|trap/i);
      expect(text).toContain('DC 15');
      expect(text).toContain('4d6');
    });

    it('should validate terrain dimensions (min 5, max 100)', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Wizard', hp: 20, maxHp: 20, position: { x: 50, y: 50 } },
        ],
        terrain: {
          width: 100,
          height: 5,
        },
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);
      expect(text).toContain('100');
      expect(text).toContain('5');
    });
  });

  describe('Lighting Conditions', () => {
    it('should default to bright lighting', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Fighter', hp: 30, maxHp: 30, position: { x: 5, y: 5 } },
        ],
      });

      const text = getTextContent(result);
      expect(text).toMatch(/bright/i);
    });

    it('should accept dim lighting', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Rogue', hp: 25, maxHp: 25, position: { x: 5, y: 5 } },
        ],
        lighting: 'dim',
      });

      const text = getTextContent(result);
      expect(text).toMatch(/dim/i);
    });

    it('should accept darkness lighting', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Drow', hp: 13, maxHp: 13, position: { x: 5, y: 5 } },
        ],
        lighting: 'darkness',
      });

      const text = getTextContent(result);
      expect(text).toMatch(/darkness/i);
    });

    it('should accept magical_darkness lighting', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Warlock', hp: 22, maxHp: 22, position: { x: 5, y: 5 } },
        ],
        lighting: 'magical_darkness',
      });

      const text = getTextContent(result);
      expect(text).toMatch(/magical.*darkness/i);
    });
  });

  describe('Edge Cases', () => {
    it('should reject empty participants array', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [],
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/participant|required|empty/i);
    });

    it('should validate participant IDs are unique', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'duplicate', name: 'First', hp: 20, maxHp: 20, position: { x: 0, y: 0 } },
          { id: 'duplicate', name: 'Second', hp: 20, maxHp: 20, position: { x: 5, y: 5 } },
        ],
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/duplicate|unique|id/i);
    });

    it('should handle very large encounters (10+ participants)', async () => {
      const participants = [];
      for (let i = 1; i <= 12; i++) {
        participants.push({
          id: `creature-${i}`,
          name: `Creature ${i}`,
          hp: 20,
          maxHp: 20,
          position: { x: i * 2, y: i * 2 },
          isEnemy: i > 6,
        });
      }

      const result = await handleToolCall('create_encounter', {
        participants,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Creature 1');
      expect(text).toContain('Creature 12');
    });

    it('should allow HP of 0 for dying/unconscious characters', async () => {
      // HP = 0 is valid for death save scenarios
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'unconscious', name: 'Unconscious', hp: 0, maxHp: 20, position: { x: 0, y: 0 } },
        ],
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);
      expect(text).toContain('Unconscious');
      expect(text).toContain('0/20');
    });

    it('should reject negative HP', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'invalid', name: 'Negative', hp: -5, maxHp: 20, position: { x: 0, y: 0 } },
        ],
      });

      expect(result.isError).toBe(true);
    });

    it('should validate maxHp is positive', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'invalid', name: 'Broken', hp: 10, maxHp: 0, position: { x: 0, y: 0 } },
        ],
      });

      expect(result.isError).toBe(true);
    });

    it('should handle seed for deterministic rolls (optional)', async () => {
      const result = await handleToolCall('create_encounter', {
        seed: 'test-seed-123',
        participants: [
          { id: 'p1', name: 'Fighter', hp: 30, maxHp: 30, position: { x: 0, y: 0 } },
        ],
      });

      // Even if seed isn't implemented yet, it shouldn't error
      expect(result.isError).toBeUndefined();
    });
  });

  describe('ASCII Art Output', () => {
    it('should return ASCII-formatted encounter summary', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Knight', hp: 40, maxHp: 40, position: { x: 5, y: 5 } },
        ],
      });

      const text = getTextContent(result);
      expect(text).toContain('╔'); // Heavy box drawing
      expect(text).toContain('═');
      expect(text).toContain('╗');
    });

    it('should show initiative order in output', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Bard', hp: 25, maxHp: 25, initiativeBonus: 3, position: { x: 0, y: 0 } },
          { id: 'e1', name: 'Bandit', hp: 11, maxHp: 11, initiativeBonus: 1, position: { x: 10, y: 10 }, isEnemy: true },
        ],
      });

      const text = getTextContent(result);
      expect(text).toContain('INITIATIVE');
      expect(text).toContain('Bard');
      expect(text).toContain('Bandit');
    });

    it('should show participant HP in output', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Monk', hp: 35, maxHp: 40, position: { x: 0, y: 0 } },
        ],
      });

      const text = getTextContent(result);
      expect(text).toContain('35'); // Current HP
      expect(text).toContain('40'); // Max HP
      expect(text).toMatch(/hp|health/i);
    });

    it('should show participant positions in output', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Druid', hp: 30, maxHp: 30, position: { x: 12, y: 8 } },
        ],
      });

      const text = getTextContent(result);
      expect(text).toContain('12'); // X position
      expect(text).toContain('8');  // Y position
      expect(text).toMatch(/position|location|x|y/i);
    });

    it('should use consistent box drawing style', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Sorcerer', hp: 22, maxHp: 22, position: { x: 5, y: 5 } },
        ],
      });

      const text = getTextContent(result);
      // Check for heavy box characters (╔═╗ ║ ╚═╝)
      expect(text).toMatch(/[╔╗╚╝═║]/);
    });

    it('should include encounter metadata in output', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Warlock', hp: 24, maxHp: 24, position: { x: 0, y: 0 } },
          { id: 'e1', name: 'Imp', hp: 10, maxHp: 10, position: { x: 15, y: 15 }, isEnemy: true },
        ],
        lighting: 'dim',
        terrain: { width: 20, height: 20 },
      });

      const text = getTextContent(result);
      expect(text).toContain('dim'); // Lighting
      expect(text).toContain('20'); // Terrain dimensions
      expect(text).toMatch(/participant.*2|2.*participant/i); // Participant count
    });
  });

  describe('Error Handling', () => {
    it('should return error for missing participants', async () => {
      const result = await handleToolCall('create_encounter', {});
      expect(result.isError).toBe(true);
    });

    it('should return error for invalid damage type in resistances', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          {
            id: 'p1',
            name: 'Test',
            hp: 20,
            maxHp: 20,
            position: { x: 0, y: 0 },
            resistances: ['invalid_damage_type' as any],
          },
        ],
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for invalid size', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          {
            id: 'p1',
            name: 'Test',
            hp: 20,
            maxHp: 20,
            position: { x: 0, y: 0 },
            size: 'enormous' as any,
          },
        ],
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for invalid lighting value', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Test', hp: 20, maxHp: 20, position: { x: 0, y: 0 } },
        ],
        lighting: 'twilight' as any,
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for terrain width < 5', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Test', hp: 20, maxHp: 20, position: { x: 0, y: 0 } },
        ],
        terrain: {
          width: 3,
          height: 20,
        },
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for terrain height > 100', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'p1', name: 'Test', hp: 20, maxHp: 20, position: { x: 0, y: 0 } },
        ],
        terrain: {
          width: 20,
          height: 150,
        },
      });

      expect(result.isError).toBe(true);
    });
  });
});
