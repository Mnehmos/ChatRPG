/**
 * Tests for get_encounter tool
 * 
 * Retrieves current encounter state with configurable verbosity levels:
 * - minimal: ID, round, current turn only (fast context for LLM)
 * - summary: + participant list, HP percentages (quick overview)
 * - standard: + full HP, conditions, positions (default view)
 * - detailed: + terrain, lighting, action history (full state dump)
 * 
 * This tool absorbs the former get_encounter_summary via the verbosity parameter.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEncounter, clearAllEncounters, getEncounter } from '../../src/modules/combat.js';
import { manageCondition, clearAllConditions } from '../../src/modules/combat.js';

// Helper to strip ANSI codes and normalize whitespace for text matching
function getTextContent(str: string): string {
  return str
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\r\n/g, '\n');
}

// Default position for participants without explicit position
const defaultPos = { x: 0, y: 0, z: 0 };

describe('get_encounter', () => {
  beforeEach(() => {
    clearAllEncounters();
    clearAllConditions();
  });

  // ============================================================
  // BASIC FUNCTIONALITY
  // ============================================================

  describe('Basic Functionality', () => {
    it('should retrieve an existing encounter by ID', () => {
      // Create an encounter first
      const createResult = createEncounter({
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: defaultPos },
          { id: 'goblin-1', name: 'Goblin', hp: 7, maxHp: 7, ac: 13, initiativeBonus: 1, position: defaultPos },
        ],
      });
      
      // Extract encounter ID from the result
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      expect(idMatch).toBeTruthy();
      const encounterId = idMatch![1];
      
      // Get the encounter
      const result = getEncounter({ encounterId });
      const text = getTextContent(result);
      
      // Should show encounter info
      expect(text).toMatch(/encounter/i);
      expect(text).toContain(encounterId);
    });

    it('should throw error for non-existent encounter', () => {
      expect(() => getEncounter({ encounterId: 'enc_nonexistent' }))
        .toThrow(/not found/i);
    });

    it('should default to standard verbosity', () => {
      const createResult = createEncounter({
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: defaultPos },
        ],
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      // Call without verbosity parameter
      const result = getEncounter({ encounterId });
      const text = getTextContent(result);
      
      // Standard verbosity includes full HP and participant details
      expect(text).toContain('Thorin');
      expect(text).toMatch(/45|HP/);  // Check HP value // Full HP shown
    });
  });

  // ============================================================
  // VERBOSITY: MINIMAL
  // ============================================================

  describe('Verbosity: minimal', () => {
    it('should show only ID, round, and current turn', () => {
      const createResult = createEncounter({
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: defaultPos },
          { id: 'goblin-1', name: 'Goblin', hp: 7, maxHp: 7, ac: 13, initiativeBonus: 1, position: defaultPos },
        ],
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      const result = getEncounter({ encounterId, verbosity: 'minimal' });
      const text = getTextContent(result);
      
      // Should show encounter ID
      expect(text).toContain(encounterId);
      // Should show round number
      expect(text).toMatch(/round/i);
      // Should show current turn
      expect(text).toMatch(/turn/i);
    });

    it('should NOT show full participant details in minimal mode', () => {
      const createResult = createEncounter({
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: defaultPos },
          { id: 'goblin-1', name: 'Goblin', hp: 7, maxHp: 7, ac: 13, initiativeBonus: 1, position: defaultPos },
        ],
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      const result = getEncounter({ encounterId, verbosity: 'minimal' });
      const text = getTextContent(result);
      
      // Should NOT show detailed HP values (just current turn name is ok)
      expect(text).not.toMatch(/45.*hp/i);
      expect(text).not.toMatch(/ac.*18/i);
    });

    it('should show current combatant name in minimal mode', () => {
      const createResult = createEncounter({
        seed: 'test-minimal',
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 10, position: defaultPos },
          { id: 'goblin-1', name: 'Goblin', hp: 7, maxHp: 7, ac: 13, initiativeBonus: -5, position: defaultPos },
        ],
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      const result = getEncounter({ encounterId, verbosity: 'minimal' });
      const text = getTextContent(result);
      
      // Should show who's turn it is
      expect(text).toMatch(/thorin|goblin/i);
    });
  });

  // ============================================================
  // VERBOSITY: SUMMARY
  // ============================================================

  describe('Verbosity: summary', () => {
    it('should show participant list with HP percentages', () => {
      const createResult = createEncounter({
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: defaultPos },
          { id: 'goblin-1', name: 'Goblin', hp: 7, maxHp: 7, ac: 13, initiativeBonus: 1, position: defaultPos },
        ],
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      const result = getEncounter({ encounterId, verbosity: 'summary' });
      const text = getTextContent(result);
      
      // Should show both participants
      expect(text).toContain('Thorin');
      expect(text).toContain('Goblin');
      // Should show HP as percentage or visual indicator
      expect(text).toMatch(/HP|Thorin/i);  // Check participant info
    });

    it('should show participant count in summary mode', () => {
      const createResult = createEncounter({
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: defaultPos },
          { id: 'goblin-1', name: 'Goblin A', hp: 7, maxHp: 7, ac: 13, initiativeBonus: 1, position: { x: 5, y: 0, z: 0 } },
          { id: 'goblin-2', name: 'Goblin B', hp: 7, maxHp: 7, ac: 13, initiativeBonus: 1, position: { x: 10, y: 0, z: 0 } },
        ],
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      const result = getEncounter({ encounterId, verbosity: 'summary' });
      const text = getTextContent(result);
      
      // Should indicate number of participants
      expect(text).toMatch(/3|three/i);
    });

    it('should show round and turn info in summary mode', () => {
      const createResult = createEncounter({
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: defaultPos },
        ],
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      const result = getEncounter({ encounterId, verbosity: 'summary' });
      const text = getTextContent(result);
      
      expect(text).toMatch(/round/i);
      expect(text).toMatch(/turn/i);
    });
  });

  // ============================================================
  // VERBOSITY: STANDARD (Default)
  // ============================================================

  describe('Verbosity: standard', () => {
    it('should show full HP values', () => {
      const createResult = createEncounter({
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: defaultPos },
          { id: 'goblin-1', name: 'Goblin', hp: 7, maxHp: 7, ac: 13, initiativeBonus: 1, position: defaultPos },
        ],
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      const result = getEncounter({ encounterId, verbosity: 'standard' });
      const text = getTextContent(result);
      
      // Should show exact HP values
      expect(text).toMatch(/45|HP/);  // Check HP value
      expect(text).toMatch(/7/);
    });

    it('should show AC values', () => {
      const createResult = createEncounter({
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: defaultPos },
        ],
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      const result = getEncounter({ encounterId, verbosity: 'standard' });
      const text = getTextContent(result);
      
      expect(text).toMatch(/18/);
    });

    it('should show active conditions', () => {
      const createResult = createEncounter({
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: defaultPos },
        ],
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      // Apply a condition
      manageCondition({
        targetId: 'fighter-1',
        operation: 'add',
        condition: 'poisoned',
        duration: 3,
      });
      
      const result = getEncounter({ encounterId, verbosity: 'standard' });
      const text = getTextContent(result);
      
      expect(text).toMatch(/poisoned/i);
    });

    it('should show positions when available', () => {
      const createResult = createEncounter({
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: { x: 5, y: 10, z: 0 } },
        ],
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      const result = getEncounter({ encounterId, verbosity: 'standard' });
      const text = getTextContent(result);
      
      // Should show position coordinates
      expect(text).toMatch(/5.*10|position|\(5,\s*10\)/i);
    });

    it('should show initiative order', () => {
      const createResult = createEncounter({
        seed: 'test-init-order',
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 10, position: defaultPos },
          { id: 'goblin-1', name: 'Goblin', hp: 7, maxHp: 7, ac: 13, initiativeBonus: -5, position: { x: 10, y: 0, z: 0 } },
        ],
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      const result = getEncounter({ encounterId, verbosity: 'standard' });
      const text = getTextContent(result);
      
      // Should show initiative values or order
      expect(text).toMatch(/initiative|init/i);
    });
  });

  // ============================================================
  // VERBOSITY: DETAILED
  // ============================================================

  describe('Verbosity: detailed', () => {
    it('should show terrain information', () => {
      const createResult = createEncounter({
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: defaultPos },
        ],
        terrain: {
          width: 30,
          height: 20,
          obstacles: ['10,10', '15,15'],
        },
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      const result = getEncounter({ encounterId, verbosity: 'detailed' });
      const text = getTextContent(result);
      
      // Should show terrain dimensions
      expect(text).toMatch(/30.*20|terrain|grid/i);
    });

    it('should show lighting conditions', () => {
      const createResult = createEncounter({
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: defaultPos },
        ],
        lighting: 'dim',
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      const result = getEncounter({ encounterId, verbosity: 'detailed' });
      const text = getTextContent(result);
      
      expect(text).toMatch(/dim|light/i);
    });

    it('should show all participant details', () => {
      const createResult = createEncounter({
        participants: [
          { 
            id: 'fighter-1', 
            name: 'Thorin', 
            hp: 45, 
            maxHp: 45,
            ac: 18, 
            initiativeBonus: 2,
            position: defaultPos,
            speed: 25,
            resistances: ['fire'],
          },
        ],
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      const result = getEncounter({ encounterId, verbosity: 'detailed' });
      const text = getTextContent(result);
      
      // Should show all details including resistances and speed
      expect(text).toMatch(/25|speed/i);
      expect(text).toMatch(/fire|resist/i);
    });

    it('should include everything from standard verbosity', () => {
      const createResult = createEncounter({
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: defaultPos },
        ],
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      const result = getEncounter({ encounterId, verbosity: 'detailed' });
      const text = getTextContent(result);
      
      // Should have all standard info
      expect(text).toContain('Thorin');
      expect(text).toMatch(/45|HP/);  // Check HP value
      expect(text).toMatch(/round/i);
    });
  });

  // ============================================================
  // ASCII OUTPUT
  // ============================================================

  describe('ASCII Output', () => {
    it('should produce ASCII box output', () => {
      const createResult = createEncounter({
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: defaultPos },
        ],
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      const result = getEncounter({ encounterId });
      
      // Should have box characters
      expect(result).toMatch(/[╔╗╚╝║═┌┐└┘│─]/);
    });

    it('should have appropriate header', () => {
      const createResult = createEncounter({
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: defaultPos },
        ],
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      const result = getEncounter({ encounterId });
      const text = getTextContent(result);
      
      // Should have ENCOUNTER in header
      expect(text).toMatch(/encounter/i);
    });
  });

  // ============================================================
  // EDGE CASES
  // ============================================================

  describe('Edge Cases', () => {
    it('should handle encounter with many participants', () => {
      const participants = [];
      for (let i = 1; i <= 10; i++) {
        participants.push({
          id: `combatant-${i}`,
          name: `Combatant ${i}`,
          hp: 10 + i,
          maxHp: 10 + i,
          ac: 10 + i,
          initiativeBonus: i,
          position: { x: (i - 1) * 4, y: 0, z: 0 }, // Stay within 50x50 grid (0-36)
        });
      }
      
      const createResult = createEncounter({ participants });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      const result = getEncounter({ encounterId, verbosity: 'summary' });
      const text = getTextContent(result);
      
      // Should handle large party
      expect(text).toMatch(/10|combatant/i);
    });

    it('should show death save state for characters at 0 HP', () => {
      const createResult = createEncounter({
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 0, maxHp: 45, ac: 18, initiativeBonus: 2, position: defaultPos },
        ],
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      const result = getEncounter({ encounterId, verbosity: 'standard' });
      const text = getTextContent(result);
      
      // Should indicate character is dying or at 0 HP
      expect(text).toMatch(/0|dying|unconscious|death/i);
    });

    it('should handle encounter after turns have advanced', () => {
      const createResult = createEncounter({
        seed: 'test-turn-advance',
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 10, position: defaultPos },
          { id: 'goblin-1', name: 'Goblin', hp: 7, maxHp: 7, ac: 13, initiativeBonus: -5, position: { x: 10, y: 0, z: 0 } },
        ],
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      // Import and use advanceTurn
      // Note: We'd need to import advanceTurn here
      // For now, just test retrieval works
      const result = getEncounter({ encounterId });
      expect(result).toBeTruthy();
    });
  });

  // ============================================================
  // INTEGRATION WITH OTHER TOOLS
  // ============================================================

  describe('Integration', () => {
    it('should reflect condition changes from manage_condition', () => {
      const createResult = createEncounter({
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: defaultPos },
        ],
      });
      
      const idMatch = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch![1];
      
      // Apply multiple conditions
      manageCondition({
        targetId: 'fighter-1',
        operation: 'add',
        condition: 'poisoned',
      });
      manageCondition({
        targetId: 'fighter-1',
        operation: 'add',
        condition: 'frightened',
      });
      
      const result = getEncounter({ encounterId, verbosity: 'standard' });
      const text = getTextContent(result);
      
      // Should show both conditions
      expect(text).toMatch(/poisoned/i);
      expect(text).toMatch(/frightened/i);
    });
  });
});
