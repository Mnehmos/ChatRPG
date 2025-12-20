/**
 * modify_terrain Tests - TDD Red Phase
 * These tests are intentionally written to FAIL until the handler is implemented
 * 
 * modify_terrain allows dynamic modification of encounter terrain during combat:
 * - Adding/removing obstacles, difficult terrain, water, hazards
 * - Environmental effects (fire spreading, ice forming, walls being destroyed)
 * - Lair actions affecting battlefield
 * - Spell effects creating terrain (Wall of Fire, Grease, Web)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';

// Helper to create a basic encounter with terrain for testing
async function createTestEncounterWithTerrain(): Promise<string> {
  const result = await handleToolCall('create_encounter', {
    participants: [
      {
        id: 'fighter-1',
        name: 'Thorin',
        hp: 45,
        maxHp: 45,
        position: { x: 5, y: 5 },
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
    terrain: {
      width: 20,
      height: 20,
      obstacles: ['3,3', '3,4'],
      difficultTerrain: ['7,7', '7,8'],
      water: ['12,12', '12,13'],
    },
  });

  const text = getTextContent(result);
  const match = text.match(/Encounter ID: ([a-zA-Z0-9_-]+)/i);
  if (!match) throw new Error('Could not extract encounter ID');
  return match[1];
}

describe('modify_terrain', () => {
  // ============================================================
  // BASIC ADD OPERATIONS
  // ============================================================

  describe('Basic Add Operations', () => {
    it('should add a single obstacle to the battlefield', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'obstacle',
        positions: ['8,8'],
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('╔'); // ASCII box border
      expect(text).toMatch(/obstacle|added|terrain/i);
      expect(text).toContain('8,8');
    });

    it('should add multiple obstacles in one call', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'obstacle',
        positions: ['1,1', '1,2', '1,3', '2,1'],
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/4.*positions|4.*added|added.*4/i);
    });

    it('should add difficult terrain squares', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'difficultTerrain',
        positions: ['15,15', '15,16'],
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/difficult.*terrain|added/i);
    });

    it('should add water terrain', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'water',
        positions: ['0,10', '1,10', '2,10'], // Stream
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/water|added/i);
    });

    it('should add hazard with damage details', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'hazard',
        positions: ['9,9'],
        hazardDetails: {
          type: 'fire',
          damage: '2d6',
          damageType: 'fire',
          dc: 14,
          saveAbility: 'dex',
        },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/hazard|fire/i);
      expect(text).toContain('2d6');
      expect(text).toContain('DC 14');
    });

    it('should add hazard with source attribution', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'hazard',
        positions: ['6,6', '6,7', '7,6', '7,7'],
        hazardDetails: {
          type: 'fire',
          damage: '3d6',
          damageType: 'fire',
          dc: 15,
          saveAbility: 'dex',
        },
        source: 'Wall of Fire spell',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Wall of Fire');
    });
  });

  // ============================================================
  // BASIC REMOVE OPERATIONS
  // ============================================================

  describe('Basic Remove Operations', () => {
    it('should remove a single obstacle', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      // Encounter was created with obstacles at 3,3 and 3,4
      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'remove',
        terrainType: 'obstacle',
        positions: ['3,3'],
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/removed|cleared/i);
      expect(text).toContain('3,3');
    });

    it('should remove multiple positions at once', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'remove',
        terrainType: 'obstacle',
        positions: ['3,3', '3,4'],
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/2.*removed|removed.*2/i);
    });

    it('should remove hazard by position', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      // First add a hazard
      await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'hazard',
        positions: ['11,11'],
        hazardDetails: {
          type: 'spike_trap',
          damage: '1d10',
          damageType: 'piercing',
          dc: 12,
        },
      });

      // Then remove it
      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'remove',
        terrainType: 'hazard',
        positions: ['11,11'],
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/removed|hazard/i);
    });

    it('should not error when removing non-existent terrain (no-op)', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'remove',
        terrainType: 'obstacle',
        positions: ['99,99'], // Position with no obstacle
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/no.*terrain|0.*removed|not found|no.*change/i);
    });

    it('should clear all terrain of a specific type', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'clear',
        terrainType: 'difficultTerrain',
        positions: [], // Empty for clear operation
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/cleared|all.*difficult/i);
    });
  });

  // ============================================================
  // VALIDATION & ERROR HANDLING
  // ============================================================

  describe('Validation & Error Handling', () => {
    it('should return error for invalid encounterId', async () => {
      const result = await handleToolCall('modify_terrain', {
        encounterId: 'non-existent-encounter-id-12345',
        operation: 'add',
        terrainType: 'obstacle',
        positions: ['5,5'],
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/not found|invalid.*encounter|encounter.*not.*exist/i);
    });

    it('should return error for invalid position format', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'obstacle',
        positions: ['invalid', '5,5,5', 'x,y'], // Invalid formats
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/invalid.*position|format|must be.*x,y/i);
    });

    it('should return error for invalid terrainType', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'lava' as any, // Invalid type
        positions: ['5,5'],
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/invalid.*terrain.*type|must be one of/i);
    });

    it('should return error for positions outside battlefield bounds', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      // Battlefield is 20x20, so 25,25 is out of bounds
      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'obstacle',
        positions: ['25,25'],
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/out.*bounds|invalid.*position|outside.*battlefield/i);
    });

    it('should return error for hazard without required details', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'hazard',
        positions: ['10,10'],
        // Missing hazardDetails
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/hazard.*details|require.*type|missing.*hazard/i);
    });

    it('should return error for invalid operation', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'replace' as any, // Invalid operation
        terrainType: 'obstacle',
        positions: ['5,5'],
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/invalid.*operation|must be.*add|remove|clear/i);
    });
  });

  // ============================================================
  // EDGE CASES
  // ============================================================

  describe('Edge Cases', () => {
    it('should handle adding terrain where participant is standing', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      // Fighter is at 5,5 - try to add obstacle there
      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'obstacle',
        positions: ['5,5'],
      });

      // Should either error or warn - can't place blocking terrain on occupied square
      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/occupied|participant|blocked|cannot.*place/i);
    });

    it('should allow overlapping terrain types (obstacle + hazard at same square)', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      // First add an obstacle
      await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'obstacle',
        positions: ['14,14'],
      });

      // Then add a hazard at the same location (e.g., burning pillar)
      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'hazard',
        positions: ['14,14'],
        hazardDetails: {
          type: 'burning_pillar',
          damage: '1d6',
          damageType: 'fire',
        },
        source: 'Burning pillar',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/hazard|added|burning/i);
    });

    it('should handle terrain with duration (temporary)', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'hazard',
        positions: ['16,16'],
        hazardDetails: {
          type: 'grease',
          dc: 10,
          saveAbility: 'dex',
        },
        source: 'Grease spell',
        duration: 10, // 10 rounds
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/duration|10.*rounds|temporary/i);
    });

    it('should handle empty positions array for add operation', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'obstacle',
        positions: [],
      });

      // Should either error or no-op with message
      const text = getTextContent(result);
      expect(text).toMatch(/no.*positions|empty|nothing.*add/i);
    });

    it('should handle negative coordinates gracefully', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'obstacle',
        positions: ['-1,5', '5,-3'],
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/invalid|negative|out.*bounds/i);
    });
  });

  // ============================================================
  // ASCII ART OUTPUT
  // ============================================================

  describe('ASCII Art Output', () => {
    it('should use ASCII box borders in output', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'obstacle',
        positions: ['8,8'],
      });

      const text = getTextContent(result);
      expect(text).toContain('╔'); // Top-left corner
      expect(text).toContain('═'); // Horizontal line
      expect(text).toContain('╗'); // Top-right corner
      expect(text).toContain('║'); // Vertical line
      expect(text).toContain('╚'); // Bottom-left corner
      expect(text).toContain('╝'); // Bottom-right corner
    });

    it('should show before/after terrain change summary', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'obstacle',
        positions: ['8,8', '8,9'],
      });

      const text = getTextContent(result);
      expect(text).toMatch(/before|after|changed|modified/i);
      expect(text).toMatch(/obstacle.*4|4.*obstacle/i); // Now 4 obstacles (2 original + 2 new)
    });

    it('should list affected positions in output', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'water',
        positions: ['4,4', '4,5', '5,4'],
      });

      const text = getTextContent(result);
      expect(text).toContain('4,4');
      expect(text).toContain('4,5');
      expect(text).toContain('5,4');
    });

    it('should include source attribution if provided', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'difficultTerrain',
        positions: ['13,13', '13,14', '14,13', '14,14'],
        source: 'Web spell cast by Wizard',
      });

      const text = getTextContent(result);
      expect(text).toContain('Web spell');
      expect(text).toContain('Wizard');
    });

    it('should show terrain type with appropriate label', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'difficultTerrain',
        positions: ['2,2'],
      });

      const text = getTextContent(result);
      expect(text).toMatch(/difficult terrain|DIFFICULT TERRAIN/i);
    });
  });

  // ============================================================
  // INTEGRATION
  // ============================================================

  describe('Integration', () => {
    it('should update terrain visible in render_battlefield', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      // Add new obstacles
      await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'obstacle',
        positions: ['18,18', '18,19', '19,18', '19,19'],
      });

      // Render battlefield and check new obstacles appear
      const renderResult = await handleToolCall('render_battlefield', {
        encounterId,
      });

      const text = getTextContent(renderResult);
      // Obstacles should be rendered as █ or similar
      expect(text).toMatch(/[█▓■#]/);
    });

    it('should reflect terrain changes in get_encounter output', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      // Add water terrain
      await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'water',
        positions: ['17,17'],
      });

      // Get encounter state
      const stateResult = await handleToolCall('get_encounter', {
        encounterId,
      });

      const text = getTextContent(stateResult);
      // Should show updated water positions
      expect(text).toMatch(/water.*17,17|17,17.*water/i);
    });

    it('should persist terrain modifications across multiple calls', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      // Add obstacles in first call
      await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'obstacle',
        positions: ['1,1', '1,2'],
      });

      // Add more obstacles in second call
      await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'obstacle',
        positions: ['1,3', '1,4'],
      });

      // Remove one obstacle
      await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'remove',
        terrainType: 'obstacle',
        positions: ['3,3'], // Original obstacle
      });

      // Verify final state
      const stateResult = await handleToolCall('get_encounter', {
        encounterId,
      });

      const text = getTextContent(stateResult);
      // Should have new obstacles but not the removed one
      expect(text).toMatch(/1,1|1,2|1,3|1,4/);
      // Removed obstacle should not appear (harder to test definitively)
    });
  });

  // ============================================================
  // SPELL & ABILITY EFFECTS (CREATIVE SCENARIOS)
  // ============================================================

  describe('Spell & Ability Effects', () => {
    it('should support Wall of Fire effect (line of fire hazards)', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'hazard',
        positions: ['10,5', '11,5', '12,5', '13,5', '14,5', '15,5'],
        hazardDetails: {
          type: 'fire',
          damage: '5d8',
          damageType: 'fire',
          dc: 17,
          saveAbility: 'dex',
        },
        source: 'Wall of Fire (5th level)',
        duration: 10, // Concentration, up to 1 minute
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/Wall of Fire/i);
      expect(text).toMatch(/6.*positions|6.*added/i);
    });

    it('should support Grease effect (difficult terrain + hazard)', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      // First add difficult terrain for the grease area
      await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'difficultTerrain',
        positions: ['10,10', '10,11', '11,10', '11,11'],
        source: 'Grease spell',
      });

      // Then add the hazard aspect (falling prone DC)
      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'hazard',
        positions: ['10,10', '10,11', '11,10', '11,11'],
        hazardDetails: {
          type: 'grease',
          dc: 13,
          saveAbility: 'dex',
        },
        source: 'Grease spell',
        duration: 10,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/grease/i);
    });

    it('should support Lair Action terrain modification', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'obstacle',
        positions: ['0,15', '1,15', '2,15', '0,16', '1,16', '2,16'],
        source: 'Lair Action: Stone Wall',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/Lair Action/i);
      expect(text).toMatch(/6.*added|added.*6/i);
    });

    it('should support environmental destruction (remove obstacles)', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      // Simulate a Shatter spell destroying obstacles
      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'remove',
        terrainType: 'obstacle',
        positions: ['3,3', '3,4'], // Original obstacles
        source: 'Shatter spell destroyed the wall',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/removed|destroyed|Shatter/i);
    });
  });

  // ============================================================
  // HAZARD DETAIL VARIATIONS
  // ============================================================

  describe('Hazard Detail Variations', () => {
    it('should support hazard with all optional details', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'hazard',
        positions: ['16,16'],
        hazardDetails: {
          type: 'acid_pool',
          damage: '4d6',
          damageType: 'acid',
          dc: 15,
          saveAbility: 'dex',
        },
        source: 'Melf\'s Acid Arrow pool',
        duration: 3,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('acid');
      expect(text).toContain('4d6');
      expect(text).toContain('DC 15');
    });

    it('should support hazard with minimal details (just type)', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'hazard',
        positions: ['17,17'],
        hazardDetails: {
          type: 'spike_trap',
        },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/spike_trap|spike/i);
    });

    it('should support condition-applying hazards', async () => {
      const encounterId = await createTestEncounterWithTerrain();

      const result = await handleToolCall('modify_terrain', {
        encounterId,
        operation: 'add',
        terrainType: 'hazard',
        positions: ['18,18'],
        hazardDetails: {
          type: 'web',
          dc: 12,
          saveAbility: 'dex',
          // Web doesn't deal damage but restrains
        },
        source: 'Giant Spider Web',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/web/i);
    });
  });
});
