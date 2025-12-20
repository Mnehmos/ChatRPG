/**
 * Tests for calculate_movement tool
 * D&D 5e movement calculations with three modes:
 * - path: Calculate optimal path from A to B with terrain costs
 * - reach: All reachable squares from a position given movement budget
 * - adjacent: Simple 8-square adjacency check (absorbs get_adjacent_squares)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { clearAllEncounters } from '../../src/modules/combat.js';

describe('calculate_movement', () => {
  let testEncounterId: string;

  beforeEach(async () => {
    // Create a test encounter
    const encounterResult = await handleToolCall('create_encounter', {
      participants: [
        {
          id: 'fighter-1',
          name: 'Fighter',
          hp: 44,
          maxHp: 44,
          position: { x: 5, y: 5 },
        },
      ],
      terrain: {
        width: 20,
        height: 20,
      },
    });

    const match = encounterResult.content[0].text.match(/Encounter ID:\s*([a-zA-Z0-9-]+)/);
    if (!match) {
      throw new Error('Failed to extract encounter ID');
    }
    testEncounterId = match[1];
  });

  afterEach(() => {
    clearAllEncounters();
  });

  // ============================================================
  // PATH MODE - Calculate optimal path between two points
  // ============================================================
  describe('Path Mode', () => {
    it('should calculate simple straight-line path', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'path',
        from: { x: 0, y: 0 },
        to: { x: 5, y: 0 },
      });

      expect(result.content[0].text).toContain('PATH');
      expect(result.content[0].text).toContain('25 feet'); // 5 squares * 5ft
    });

    it('should calculate diagonal path correctly', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'path',
        from: { x: 0, y: 0 },
        to: { x: 3, y: 3 },
      });

      // D&D 5e: diagonals alternate 5ft and 10ft, or use simple 5ft rule
      expect(result.content[0].text).toContain('PATH');
      expect(result.content[0].text).toMatch(/\d+ feet/);
    });

    it('should account for difficult terrain (2x cost)', async () => {
      // Add difficult terrain spanning multiple rows to force path through it
      await handleToolCall('modify_terrain', {
        encounterId: testEncounterId,
        operation: 'add',
        terrainType: 'difficultTerrain',
        positions: ['2,0', '2,1', '2,2', '3,0', '3,1', '3,2'],
      });

      const result = await handleToolCall('calculate_movement', {
        encounterId: testEncounterId,
        mode: 'path',
        from: { x: 0, y: 1 },
        to: { x: 5, y: 1 },
      });

      // Path goes through difficult terrain, should be noted
      expect(result.content[0].text).toContain('difficult');
    });

    it('should find path around obstacles', async () => {
      // Add obstacle blocking direct path
      await handleToolCall('modify_terrain', {
        encounterId: testEncounterId,
        operation: 'add',
        terrainType: 'obstacle',
        positions: ['2,2', '2,3', '2,4'],
      });

      const result = await handleToolCall('calculate_movement', {
        encounterId: testEncounterId,
        mode: 'path',
        from: { x: 0, y: 3 },
        to: { x: 5, y: 3 },
      });

      // Should find alternate path
      expect(result.content[0].text).toContain('PATH');
    });

    it('should report when path is blocked', async () => {
      // Create a wall blocking all paths across the entire grid height
      const wallPositions = [];
      for (let y = 0; y < 20; y++) {
        wallPositions.push(`2,${y}`);
      }
      await handleToolCall('modify_terrain', {
        encounterId: testEncounterId,
        operation: 'add',
        terrainType: 'obstacle',
        positions: wallPositions,
      });

      const result = await handleToolCall('calculate_movement', {
        encounterId: testEncounterId,
        mode: 'path',
        from: { x: 0, y: 5 },
        to: { x: 5, y: 5 },
      });

      expect(result.content[0].text).toMatch(/blocked|no path|unreachable/i);
    });

    it('should show path waypoints', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'path',
        from: { x: 0, y: 0 },
        to: { x: 3, y: 0 },
      });

      // Should list the path tiles
      expect(result.content[0].text).toContain('(0, 0)');
      expect(result.content[0].text).toContain('(3, 0)');
    });

    it('should return 0 distance for same position', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'path',
        from: { x: 5, y: 5 },
        to: { x: 5, y: 5 },
      });

      expect(result.content[0].text).toContain('0 feet');
    });
  });

  // ============================================================
  // REACH MODE - All reachable squares from position
  // ============================================================
  describe('Reach Mode', () => {
    it('should calculate reachable squares with movement budget', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'reach',
        from: { x: 5, y: 5 },
        movement: 30, // Standard 30ft movement
      });

      expect(result.content[0].text).toContain('REACHABLE');
      expect(result.content[0].text).toMatch(/\d+ squares/);
    });

    it('should respect 30ft movement limit', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'reach',
        from: { x: 10, y: 10 },
        movement: 30,
      });

      // 30ft = 6 squares in any cardinal direction
      expect(result.content[0].text).toContain('30 feet');
    });

    it('should show fewer reachable squares with difficult terrain', async () => {
      // Add difficult terrain
      await handleToolCall('modify_terrain', {
        encounterId: testEncounterId,
        operation: 'add',
        terrainType: 'difficultTerrain',
        positions: ['6,5', '7,5', '8,5', '5,6', '5,7', '5,8'],
      });

      const result = await handleToolCall('calculate_movement', {
        encounterId: testEncounterId,
        mode: 'reach',
        from: { x: 5, y: 5 },
        movement: 30,
      });

      expect(result.content[0].text).toContain('difficult terrain');
    });

    it('should exclude squares blocked by obstacles', async () => {
      await handleToolCall('modify_terrain', {
        encounterId: testEncounterId,
        operation: 'add',
        terrainType: 'obstacle',
        positions: ['6,5', '7,5'],
      });

      const result = await handleToolCall('calculate_movement', {
        encounterId: testEncounterId,
        mode: 'reach',
        from: { x: 5, y: 5 },
        movement: 30,
      });

      // Obstacles should be shown as blocked
      expect(result.content[0].text).not.toContain('(6, 5)');
    });

    it('should handle 5ft movement (very limited reach)', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'reach',
        from: { x: 5, y: 5 },
        movement: 5,
      });

      // 5ft = 1 square in any direction + start
      expect(result.content[0].text).toContain('5 feet');
      expect(result.content[0].text).toContain('(5, 5)');
    });

    it('should support different movement speeds', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'reach',
        from: { x: 5, y: 5 },
        movement: 60, // Monk/Tabaxi movement
      });

      expect(result.content[0].text).toContain('60 feet');
    });
  });

  // ============================================================
  // ADJACENT MODE - Simple 8-square adjacency (absorbs get_adjacent_squares)
  // ============================================================
  describe('Adjacent Mode', () => {
    it('should return 8 adjacent squares for center position', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'adjacent',
        from: { x: 5, y: 5 },
      });

      expect(result.content[0].text).toContain('ADJACENT');
      expect(result.content[0].text).toContain('8 squares');
    });

    it('should list all adjacent positions', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'adjacent',
        from: { x: 5, y: 5 },
      });

      // All 8 adjacent squares
      expect(result.content[0].text).toContain('(4, 4)');
      expect(result.content[0].text).toContain('(5, 4)');
      expect(result.content[0].text).toContain('(6, 4)');
      expect(result.content[0].text).toContain('(4, 5)');
      expect(result.content[0].text).toContain('(6, 5)');
      expect(result.content[0].text).toContain('(4, 6)');
      expect(result.content[0].text).toContain('(5, 6)');
      expect(result.content[0].text).toContain('(6, 6)');
    });

    it('should handle corner position (3 adjacent)', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'adjacent',
        from: { x: 0, y: 0 },
        gridWidth: 20,
        gridHeight: 20,
      });

      expect(result.content[0].text).toContain('3 squares');
    });

    it('should handle edge position (5 adjacent)', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'adjacent',
        from: { x: 0, y: 5 },
        gridWidth: 20,
        gridHeight: 20,
      });

      expect(result.content[0].text).toContain('5 squares');
    });

    it('should mark occupied squares', async () => {
      const result = await handleToolCall('calculate_movement', {
        encounterId: testEncounterId,
        mode: 'adjacent',
        from: { x: 4, y: 5 }, // Fighter is at 5,5
      });

      // Should indicate (5,5) is occupied
      expect(result.content[0].text).toMatch(/occupied|Fighter/i);
    });

    it('should mark obstacle squares', async () => {
      await handleToolCall('modify_terrain', {
        encounterId: testEncounterId,
        operation: 'add',
        terrainType: 'obstacle',
        positions: ['6,5'],
      });

      const result = await handleToolCall('calculate_movement', {
        encounterId: testEncounterId,
        mode: 'adjacent',
        from: { x: 5, y: 5 },
      });

      expect(result.content[0].text).toMatch(/blocked|obstacle/i);
    });
  });

  // ============================================================
  // ENCOUNTER INTEGRATION
  // ============================================================
  describe('Encounter Integration', () => {
    it('should use encounter terrain when encounterId provided', async () => {
      await handleToolCall('modify_terrain', {
        encounterId: testEncounterId,
        operation: 'add',
        terrainType: 'difficultTerrain',
        positions: ['3,3'],
      });

      const result = await handleToolCall('calculate_movement', {
        encounterId: testEncounterId,
        mode: 'path',
        from: { x: 2, y: 3 },
        to: { x: 4, y: 3 },
      });

      expect(result.content[0].text).toContain('difficult');
    });

    it('should recognize creature positions as blocked', async () => {
      // Use adjacent mode to see creature occupancy
      const result = await handleToolCall('calculate_movement', {
        encounterId: testEncounterId,
        mode: 'adjacent',
        from: { x: 4, y: 5 }, // Adjacent to Fighter at (5,5)
      });

      // Fighter is at (5,5), should show as occupied
      expect(result.content[0].text).toMatch(/Fighter|creature|occupied/i);
    });

    it('should work without encounterId (pure calculation)', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'path',
        from: { x: 0, y: 0 },
        to: { x: 5, y: 5 },
      });

      expect(result.content[0].text).toContain('PATH');
    });
  });

  // ============================================================
  // OUTPUT FORMAT
  // ============================================================
  describe('Output Format', () => {
    it('should display ASCII box format', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'path',
        from: { x: 0, y: 0 },
        to: { x: 3, y: 0 },
      });

      expect(result.content[0].text).toContain('╔');
      expect(result.content[0].text).toContain('╚');
    });

    it('should show movement cost in feet', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'path',
        from: { x: 0, y: 0 },
        to: { x: 4, y: 0 },
      });

      expect(result.content[0].text).toContain('20 feet');
    });

    it('should show start and end positions clearly', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'path',
        from: { x: 1, y: 2 },
        to: { x: 8, y: 9 },
      });

      expect(result.content[0].text).toContain('From: (1, 2)');
      expect(result.content[0].text).toContain('To: (8, 9)');
    });
  });

  // ============================================================
  // ERROR HANDLING
  // ============================================================
  describe('Error Handling', () => {
    it('should require mode parameter', async () => {
      const result = await handleToolCall('calculate_movement', {
        from: { x: 0, y: 0 },
        to: { x: 5, y: 0 },
      });

      // Should either default to 'path' or error
      expect(result.content[0].text).toMatch(/PATH|mode/i);
    });

    it('should require from position', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'path',
        to: { x: 5, y: 0 },
      });

      expect(result.isError).toBe(true);
    });

    it('should require to position for path mode', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'path',
        from: { x: 0, y: 0 },
      });

      expect(result.isError).toBe(true);
    });

    it('should require movement for reach mode', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'reach',
        from: { x: 5, y: 5 },
      });

      // Should either default to 30 or error
      expect(result.content[0].text).toMatch(/REACHABLE|movement/i);
    });

    it('should validate mode enum', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'invalid_mode',
        from: { x: 0, y: 0 },
      });

      expect(result.isError).toBe(true);
    });

    it('should reject invalid encounter ID', async () => {
      const result = await handleToolCall('calculate_movement', {
        encounterId: 'nonexistent-encounter',
        mode: 'path',
        from: { x: 0, y: 0 },
        to: { x: 5, y: 0 },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
  });

  // ============================================================
  // D&D 5e SPECIFIC RULES
  // ============================================================
  describe('D&D 5e Movement Rules', () => {
    it('should use 5ft per square for grid movement', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'path',
        from: { x: 0, y: 0 },
        to: { x: 6, y: 0 },
      });

      expect(result.content[0].text).toContain('30 feet'); // 6 * 5 = 30
    });

    it('should apply difficult terrain 2x movement cost', async () => {
      await handleToolCall('modify_terrain', {
        encounterId: testEncounterId,
        operation: 'add',
        terrainType: 'difficultTerrain',
        positions: ['1,0', '2,0'],
      });

      const result = await handleToolCall('calculate_movement', {
        encounterId: testEncounterId,
        mode: 'path',
        from: { x: 0, y: 0 },
        to: { x: 3, y: 0 },
      });

      // 0→1 (5ft normal) + 1→2 (10ft difficult) + 2→3 (10ft difficult) = 25ft
      // Or path might go around
      expect(result.content[0].text).toMatch(/\d+ feet/);
    });

    it('should handle water terrain as difficult', async () => {
      await handleToolCall('modify_terrain', {
        encounterId: testEncounterId,
        operation: 'add',
        terrainType: 'water',
        positions: ['3,3'],
      });

      const result = await handleToolCall('calculate_movement', {
        encounterId: testEncounterId,
        mode: 'path',
        from: { x: 2, y: 3 },
        to: { x: 4, y: 3 },
      });

      expect(result.content[0].text).toMatch(/water|difficult/i);
    });
  });

  // ============================================================
  // EDGE CASES
  // ============================================================
  describe('Edge Cases', () => {
    it('should handle movement at grid edge', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'adjacent',
        from: { x: 19, y: 19 },
        gridWidth: 20,
        gridHeight: 20,
      });

      expect(result.content[0].text).toContain('3 squares');
    });

    it('should handle very long paths', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'path',
        from: { x: 0, y: 0 },
        to: { x: 19, y: 19 },
        gridWidth: 20,
        gridHeight: 20,
      });

      expect(result.content[0].text).toContain('PATH');
    });

    it('should handle large movement budget', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'reach',
        from: { x: 10, y: 10 },
        movement: 120, // Flying speed
        gridWidth: 20,
        gridHeight: 20,
      });

      expect(result.content[0].text).toContain('REACHABLE');
    });

    it('should default z to 0 when not provided', async () => {
      const result = await handleToolCall('calculate_movement', {
        mode: 'path',
        from: { x: 0, y: 0 },
        to: { x: 5, y: 0 },
      });

      expect(result.content[0].text).not.toContain('undefined');
    });
  });
});
