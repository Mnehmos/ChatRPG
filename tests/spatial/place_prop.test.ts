/**
 * Tests for place_prop tool
 * Place interactive props on the battlefield - barrels, doors, levers, chests, etc.
 * Props can provide cover, block movement, or be interacted with during combat.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { clearEncounterProps } from '../../src/modules/spatial.js';
import { clearAllEncounters } from '../../src/modules/combat.js';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'encounters');

describe('place_prop', () => {
  let testEncounterId: string;

  beforeEach(async () => {
    // Create a test encounter with required fields
    const encounterResult = await handleToolCall('create_encounter', {
      participants: [
        {
          id: 'fighter-1',
          name: 'Fighter',
          hp: 44,
          maxHp: 44,
          position: { x: 0, y: 0 },
        },
      ],
      terrain: {
        width: 20,
        height: 20,
      },
    });

    // Extract encounter ID from result (format: "Encounter ID: abc-123")
    const match = encounterResult.content[0].text.match(/Encounter ID:\s*([a-zA-Z0-9-]+)/);
    if (!match) {
      throw new Error(`Failed to extract encounter ID from create_encounter result: ${encounterResult.content[0].text.substring(0, 200)}`);
    }
    testEncounterId = match[1];
  });

  afterEach(() => {
    // Clean up test encounters and props
    if (testEncounterId) {
      clearEncounterProps(testEncounterId);
    }
    clearAllEncounters();

    if (fs.existsSync(DATA_DIR)) {
      const files = fs.readdirSync(DATA_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(DATA_DIR, file));
        }
      }
    }
  });

  // ============================================================
  // BASIC PROP PLACEMENT
  // ============================================================
  describe('Basic Prop Placement', () => {
    it('should place a barrel on the battlefield', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Wooden Barrel',
        type: 'barrel',
        position: { x: 5, y: 5, z: 0 },
      });

      expect(result.content[0].text).toContain('PROP PLACED');
      expect(result.content[0].text).toContain('Wooden Barrel');
      expect(result.content[0].text).toContain('(5, 5, 0)');
    });

    it('should place a door prop', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Iron Door',
        type: 'door',
        position: { x: 10, y: 5, z: 0 },
        state: 'closed',
      });

      expect(result.content[0].text).toContain('PROP PLACED');
      expect(result.content[0].text).toContain('Iron Door');
      expect(result.content[0].text).toContain('door');
      expect(result.content[0].text).toContain('closed');
    });

    it('should place a lever prop', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Wall Lever',
        type: 'lever',
        position: { x: 3, y: 8, z: 0 },
        state: 'off',
      });

      expect(result.content[0].text).toContain('Wall Lever');
      expect(result.content[0].text).toContain('lever');
    });

    it('should place a chest prop', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Treasure Chest',
        type: 'chest',
        position: { x: 8, y: 12, z: 0 },
        locked: true,
      });

      expect(result.content[0].text).toContain('Treasure Chest');
      expect(result.content[0].text).toContain('Locked');
    });

    it('should generate a unique prop ID', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Barrel',
        type: 'barrel',
        position: { x: 1, y: 1, z: 0 },
      });

      // Should contain a prop ID
      expect(result.content[0].text).toMatch(/prop-[a-z0-9]+|Prop ID:/i);
    });
  });

  // ============================================================
  // PROP PROPERTIES
  // ============================================================
  describe('Prop Properties', () => {
    it('should set prop cover type', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Stone Pillar',
        type: 'pillar',
        position: { x: 6, y: 6, z: 0 },
        coverType: 'half',
      });

      expect(result.content[0].text).toContain('half');
      expect(result.content[0].text).toContain('Cover');
    });

    it('should set prop as blocking movement', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Boulder',
        type: 'obstacle',
        position: { x: 4, y: 4, z: 0 },
        blocksMovement: true,
      });

      expect(result.content[0].text).toContain('Blocks Movement');
    });

    it('should set prop as destructible with HP', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Wooden Crate',
        type: 'crate',
        position: { x: 7, y: 7, z: 0 },
        destructible: true,
        hp: 15,
        ac: 10,
      });

      expect(result.content[0].text).toContain('HP: 15');
      expect(result.content[0].text).toContain('AC: 10');
    });

    it('should set prop size', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Giant Statue',
        type: 'statue',
        position: { x: 10, y: 10, z: 0 },
        size: 'large',
      });

      expect(result.content[0].text).toContain('large');
    });

    it('should add custom description', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Glowing Crystal',
        type: 'custom',
        position: { x: 9, y: 9, z: 0 },
        description: 'A mystical crystal that pulses with arcane energy.',
      });

      expect(result.content[0].text).toContain('pulses with arcane energy');
    });
  });

  // ============================================================
  // PROP TYPES
  // ============================================================
  describe('Prop Types', () => {
    const propTypes = [
      'barrel',
      'crate',
      'chest',
      'door',
      'lever',
      'pillar',
      'statue',
      'table',
      'chair',
      'altar',
      'trap',
      'obstacle',
      'custom',
    ];

    for (const propType of propTypes) {
      it(`should support ${propType} prop type`, async () => {
        const result = await handleToolCall('place_prop', {
          encounterId: testEncounterId,
          name: `Test ${propType}`,
          type: propType,
          position: { x: 5, y: 5, z: 0 },
        });

        expect(result.content[0].text).toContain('PROP PLACED');
      });
    }
  });

  // ============================================================
  // PROP MANAGEMENT
  // ============================================================
  describe('Prop Management', () => {
    it('should list props in encounter', async () => {
      // Place some props first
      await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Barrel 1',
        type: 'barrel',
        position: { x: 1, y: 1, z: 0 },
      });
      await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Barrel 2',
        type: 'barrel',
        position: { x: 2, y: 2, z: 0 },
      });

      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        operation: 'list',
      });

      expect(result.content[0].text).toContain('Barrel 1');
      expect(result.content[0].text).toContain('Barrel 2');
    });

    it('should remove a prop by ID', async () => {
      // Place a prop
      const placeResult = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Removable Barrel',
        type: 'barrel',
        position: { x: 3, y: 3, z: 0 },
      });

      // Extract prop ID
      const propIdMatch = placeResult.content[0].text.match(/(?:Prop ID|ID):\s*([a-z0-9-]+)/i);
      const propId = propIdMatch ? propIdMatch[1] : 'prop-1';

      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        operation: 'remove',
        propId: propId,
      });

      expect(result.content[0].text).toContain('REMOVED');
    });

    it('should update prop state', async () => {
      // Place a door
      const placeResult = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Test Door',
        type: 'door',
        position: { x: 5, y: 5, z: 0 },
        state: 'closed',
      });

      const propIdMatch = placeResult.content[0].text.match(/(?:Prop ID|ID):\s*([a-z0-9-]+)/i);
      const propId = propIdMatch ? propIdMatch[1] : 'prop-1';

      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        operation: 'update',
        propId: propId,
        state: 'open',
      });

      expect(result.content[0].text).toContain('open');
    });

    it('should move a prop to new position', async () => {
      const placeResult = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Movable Crate',
        type: 'crate',
        position: { x: 2, y: 2, z: 0 },
      });

      const propIdMatch = placeResult.content[0].text.match(/(?:Prop ID|ID):\s*([a-z0-9-]+)/i);
      const propId = propIdMatch ? propIdMatch[1] : 'prop-1';

      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        operation: 'move',
        propId: propId,
        position: { x: 8, y: 8, z: 0 },
      });

      expect(result.content[0].text).toContain('(8, 8, 0)');
    });
  });

  // ============================================================
  // PROP INTERACTIONS
  // ============================================================
  describe('Prop Interactions', () => {
    it('should track interaction requirements', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Locked Chest',
        type: 'chest',
        position: { x: 5, y: 5, z: 0 },
        locked: true,
        lockDC: 15,
      });

      expect(result.content[0].text).toContain('Lock DC: 15');
    });

    it('should track trap properties', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Pit Trap',
        type: 'trap',
        position: { x: 6, y: 6, z: 0 },
        hidden: true,
        trapDC: 14,
        trapDamage: '2d6',
      });

      expect(result.content[0].text).toContain('Hidden');
      expect(result.content[0].text).toContain('Trap DC: 14');
    });

    it('should support trigger conditions', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Pressure Plate',
        type: 'trap',
        position: { x: 7, y: 7, z: 0 },
        trigger: 'pressure',
      });

      expect(result.content[0].text).toContain('pressure');
    });
  });

  // ============================================================
  // OUTPUT FORMAT
  // ============================================================
  describe('Output Format', () => {
    it('should display ASCII box format', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Display Test',
        type: 'barrel',
        position: { x: 5, y: 5, z: 0 },
      });

      expect(result.content[0].text).toContain('╔');
      expect(result.content[0].text).toContain('╚');
    });

    it('should show position in consistent format', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Position Test',
        type: 'crate',
        position: { x: 3, y: 7, z: 1 },
      });

      expect(result.content[0].text).toContain('(3, 7, 1)');
    });

    it('should list multiple properties clearly', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Full Test Prop',
        type: 'chest',
        position: { x: 5, y: 5, z: 0 },
        locked: true,
        destructible: true,
        hp: 20,
        ac: 12,
        coverType: 'half',
        size: 'medium',
      });

      expect(result.content[0].text).toContain('HP:');
      expect(result.content[0].text).toContain('AC:');
      expect(result.content[0].text).toContain('Cover:');
    });
  });

  // ============================================================
  // ERROR HANDLING
  // ============================================================
  describe('Error Handling', () => {
    it('should require encounterId', async () => {
      const result = await handleToolCall('place_prop', {
        name: 'Test',
        type: 'barrel',
        position: { x: 0, y: 0, z: 0 },
      });

      expect(result.isError).toBe(true);
    });

    it('should require name for place operation', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        type: 'barrel',
        position: { x: 0, y: 0, z: 0 },
      });

      expect(result.isError).toBe(true);
    });

    it('should require type for place operation', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Test',
        position: { x: 0, y: 0, z: 0 },
      });

      expect(result.isError).toBe(true);
    });

    it('should require position for place operation', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Test',
        type: 'barrel',
      });

      expect(result.isError).toBe(true);
    });

    it('should reject invalid encounter ID', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: 'nonexistent-encounter-id',
        name: 'Test',
        type: 'barrel',
        position: { x: 0, y: 0, z: 0 },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('should reject invalid prop type', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Test',
        type: 'invalid_type',
        position: { x: 0, y: 0, z: 0 },
      });

      expect(result.isError).toBe(true);
    });

    it('should reject out-of-bounds position', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Test',
        type: 'barrel',
        position: { x: 100, y: 100, z: 0 }, // Outside 20x20 grid
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('bounds');
    });

    it('should require propId for remove operation', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        operation: 'remove',
      });

      expect(result.isError).toBe(true);
    });
  });

  // ============================================================
  // EDGE CASES
  // ============================================================
  describe('Edge Cases', () => {
    it('should handle prop at origin (0, 0, 0)', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Origin Prop',
        type: 'barrel',
        position: { x: 0, y: 0, z: 0 },
      });

      expect(result.content[0].text).toContain('PROP PLACED');
      expect(result.content[0].text).toContain('(0, 0, 0)');
    });

    it('should handle elevated prop', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Elevated Statue',
        type: 'statue',
        position: { x: 5, y: 5, z: 2 },
      });

      expect(result.content[0].text).toContain('(5, 5, 2)');
    });

    it('should allow multiple props at same position (stacking)', async () => {
      await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Bottom Prop',
        type: 'barrel',
        position: { x: 5, y: 5, z: 0 },
      });

      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'Top Prop',
        type: 'crate',
        position: { x: 5, y: 5, z: 1 },
      });

      expect(result.content[0].text).toContain('PROP PLACED');
    });

    it('should default z to 0 when not provided', async () => {
      const result = await handleToolCall('place_prop', {
        encounterId: testEncounterId,
        name: 'No Z Prop',
        type: 'barrel',
        position: { x: 3, y: 4 },
      });

      expect(result.content[0].text).toContain('(3, 4, 0)');
    });
  });
});
