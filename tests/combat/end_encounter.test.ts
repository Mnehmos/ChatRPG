/**
 * end_encounter Tests - TDD Red Phase
 * These tests are intentionally written to FAIL until the handler is implemented
 */

import { describe, it, expect } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';

/**
 * Helper to create a basic encounter for testing end_encounter
 */
async function createTestEncounter() {
  const result = await handleToolCall('create_encounter', {
    participants: [
      {
        id: 'hero-1',
        name: 'Valiant Hero',
        hp: 45,
        maxHp: 45,
        ac: 16,
        initiativeBonus: 2,
        position: { x: 5, y: 5 },
      },
      {
        id: 'goblin-1',
        name: 'Goblin Warrior',
        hp: 7,
        maxHp: 7,
        ac: 13,
        initiativeBonus: 1,
        position: { x: 15, y: 10 },
        isEnemy: true,
      },
    ],
  });
  
  const text = getTextContent(result);
  const idMatch = text.match(/Encounter ID:\s*([a-zA-Z0-9-]+)/i);
  return idMatch ? idMatch[1] : null;
}

/**
 * Helper to create encounter and advance a few turns for statistics
 */
async function createBattledEncounter() {
  const encounterId = await createTestEncounter();
  if (!encounterId) return null;
  
  // Advance a few turns to generate some combat history
  await handleToolCall('advance_turn', { encounterId });
  await handleToolCall('advance_turn', { encounterId });
  
  return encounterId;
}

describe('end_encounter', () => {
  describe('Basic End Operations', () => {
    it('should end encounter with victory outcome', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('╔'); // ASCII box border
      expect(text).toMatch(/victory/i);
      expect(text).toContain(encounterId!);
    });

    it('should end encounter with defeat outcome', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'defeat',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/defeat/i);
    });

    it('should end encounter with fled outcome', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'fled',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/fled/i);
    });

    it('should end encounter with negotiated outcome', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'negotiated',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/negotiated/i);
    });

    it('should end encounter with other outcome', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'other',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/other|ended/i);
    });
  });

  describe('Summary Generation', () => {
    it('should show total rounds in summary', async () => {
      const encounterId = await createBattledEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
        generateSummary: true,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/round/i);
      expect(text).toMatch(/\d+.*round/i);
    });

    it('should show damage dealt/taken by participants in summary', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      // Simulate some damage (if execute_action is available)
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
        generateSummary: true,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/damage|dealt|taken/i);
    });

    it('should show conditions applied during combat', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
        generateSummary: true,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Summary should mention conditions section even if none applied
      expect(text).toMatch(/condition|status|effect/i);
    });

    it('should show participant status (alive, dead, fled) in summary', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
        generateSummary: true,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Valiant Hero');
      expect(text).toContain('Goblin Warrior');
      expect(text).toMatch(/alive|dead|fled|status/i);
    });

    it('should allow summary generation to be disabled', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
        generateSummary: false,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Output should be minimal without stats breakdown
      expect(text).toMatch(/ended|victory/i);
      expect(text.length).toBeLessThan(500); // Shorter output when no summary
    });
  });

  describe('State Cleanup', () => {
    it('should make encounter inaccessible after end (unless preserved)', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      // End the encounter without preserving
      await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
        preserveLog: false,
      });

      // Attempt to get the encounter should fail
      const getResult = await handleToolCall('get_encounter', {
        encounterId,
      });

      expect(getResult.isError).toBe(true);
      const text = getTextContent(getResult);
      expect(text).toMatch(/not found|ended|no longer|does not exist/i);
    });

    it('should return error when get_encounter called on ended encounter', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'defeat',
      });

      const result = await handleToolCall('get_encounter', {
        encounterId,
      });

      expect(result.isError).toBe(true);
    });

    it('should prevent execute_action on ended encounter', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
      });

      const result = await handleToolCall('execute_action', {
        encounterId,
        actionType: 'attack',
        actorId: 'hero-1',
        targetId: 'goblin-1',
        damageExpression: '1d8+3',
        damageType: 'slashing',
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/ended|not found|cannot|invalid/i);
    });

    it('should prevent advance_turn on ended encounter', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'fled',
      });

      const result = await handleToolCall('advance_turn', {
        encounterId,
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/ended|not found|cannot|invalid/i);
    });

    it('should clean up all encounter state data', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      const endResult = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
      });

      expect(endResult.isError).toBeUndefined();
      
      // Verify no lingering state (implementation-specific)
      // The encounter should be fully cleaned up
      const text = getTextContent(endResult);
      expect(text).toMatch(/ended|cleanup|complete/i);
    });
  });

  describe('Preserve Log Option', () => {
    it('should keep encounter accessible when preserveLog=true', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
        preserveLog: true,
      });

      // Should still be able to retrieve for review
      const getResult = await handleToolCall('get_encounter', {
        encounterId,
      });

      expect(getResult.isError).toBeUndefined();
      const text = getTextContent(getResult);
      expect(text).toContain(encounterId!);
    });

    it('should show ended status on preserved encounter', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
        preserveLog: true,
      });

      const getResult = await handleToolCall('get_encounter', {
        encounterId,
      });

      const text = getTextContent(getResult);
      expect(text).toMatch(/ended|concluded|finished|archived/i);
      expect(text).toMatch(/victory/i);
    });

    it('should prevent modifications on preserved encounter', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
        preserveLog: true,
      });

      // Even preserved encounters shouldn't allow new actions
      const advanceResult = await handleToolCall('advance_turn', {
        encounterId,
      });

      expect(advanceResult.isError).toBe(true);
    });

    it('should preserve final state of all participants', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
        preserveLog: true,
      });

      const getResult = await handleToolCall('get_encounter', {
        encounterId,
      });

      const text = getTextContent(getResult);
      expect(text).toContain('Valiant Hero');
      expect(text).toContain('Goblin Warrior');
      expect(text).toMatch(/hp|health|status/i);
    });
  });

  describe('Validation & Error Handling', () => {
    it('should return clear error for invalid encounterId', async () => {
      const result = await handleToolCall('end_encounter', {
        encounterId: 'non-existent-encounter-12345',
        outcome: 'victory',
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/not found|invalid|does not exist/i);
    });

    it('should return error for invalid outcome value', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'invalid_outcome' as any,
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/invalid|outcome|must be|expected/i);
    });

    it('should return error for already ended encounter', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      // End it once
      await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
        preserveLog: true,
      });

      // Try to end it again
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'defeat',
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/already.*ended|cannot end|already.*concluded/i);
    });

    it('should return error when encounterId is missing', async () => {
      const result = await handleToolCall('end_encounter', {
        outcome: 'victory',
      } as any);

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/required|missing|encounterId/i);
    });

    it('should return error when outcome is missing', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
      } as any);

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/required|missing|outcome/i);
    });
  });

  describe('ASCII Art Output', () => {
    it('should use ASCII box borders in output', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
      });

      const text = getTextContent(result);
      expect(text).toContain('╔');
      expect(text).toContain('═');
      expect(text).toContain('╗');
      expect(text).toContain('║');
      expect(text).toContain('╚');
      expect(text).toContain('╝');
    });

    it('should show outcome prominently in output', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
      });

      const text = getTextContent(result);
      // Victory should be prominently displayed (all caps or in header)
      expect(text).toMatch(/VICTORY|Victory/);
    });

    it('should show round count in output', async () => {
      const encounterId = await createBattledEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
      });

      const text = getTextContent(result);
      expect(text).toMatch(/round[s]?[:\s]+\d+/i);
    });

    it('should show participant survival status', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
      });

      const text = getTextContent(result);
      // Should list participants with their final status
      expect(text).toContain('Valiant Hero');
      expect(text).toMatch(/alive|HP|standing|survived/i);
    });

    it('should include notes in output when provided', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
        notes: 'Epic battle in the dungeon depths!',
      });

      const text = getTextContent(result);
      expect(text).toContain('Epic battle in the dungeon depths!');
    });
  });

  describe('Edge Cases', () => {
    it('should handle ending encounter on round 1 (minimal combat)', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      // End immediately without any turns
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'fled',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/round[s]?[:\s]*[01]/i); // Round 0 or 1
    });

    it('should handle ending encounter with all participants dead', async () => {
      // Create encounter where we can simulate deaths
      const createResult = await handleToolCall('create_encounter', {
        participants: [
          {
            id: 'dead-hero',
            name: 'Fallen Knight',
            hp: 0, // Already at 0 HP
            maxHp: 45,
            position: { x: 5, y: 5 },
          },
          {
            id: 'dead-enemy',
            name: 'Dead Goblin',
            hp: 0,
            maxHp: 7,
            position: { x: 10, y: 10 },
            isEnemy: true,
          },
        ],
      });

      const text = getTextContent(createResult);
      const idMatch = text.match(/Encounter ID:\s*([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch ? idMatch[1] : null;
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'other',
        notes: 'Mutual destruction',
      });

      const endText = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(endText).toMatch(/ended|concluded/i);
    });

    it('should handle ending encounter with single participant', async () => {
      const createResult = await handleToolCall('create_encounter', {
        participants: [
          {
            id: 'solo',
            name: 'Solo Adventurer',
            hp: 30,
            maxHp: 30,
            position: { x: 10, y: 10 },
          },
        ],
      });

      const text = getTextContent(createResult);
      const idMatch = text.match(/Encounter ID:\s*([a-zA-Z0-9-]+)/i);
      const encounterId = idMatch ? idMatch[1] : null;
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
      });

      const endText = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(endText).toContain('Solo Adventurer');
    });

    it('should handle ending encounter immediately after creation', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      // End immediately
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'negotiated',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/negotiated/i);
    });

    it('should handle long notes gracefully', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      const longNote = 'A'.repeat(1000); // Very long note
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
        notes: longNote,
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);
      // Should either include the note or gracefully truncate
      expect(text.length).toBeGreaterThan(0);
    });

    it('should handle empty notes string', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
        notes: '',
      });

      expect(result.isError).toBeUndefined();
    });
  });

  describe('Combat Statistics', () => {
    it('should track total damage dealt during encounter', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
        generateSummary: true,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/damage dealt|total damage/i);
    });

    it('should track attacks made vs attacks hit', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
        generateSummary: true,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/attack|hit|miss/i);
    });

    it('should track healing done during encounter', async () => {
      const encounterId = await createTestEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
        generateSummary: true,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/heal|healing|restored/i);
    });

    it('should show most effective combatant in summary', async () => {
      const encounterId = await createBattledEncounter();
      expect(encounterId).not.toBeNull();
      
      const result = await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
        generateSummary: true,
      });

      const text = getTextContent(result);
      // Should highlight top performer(s)
      expect(text).toMatch(/mvp|most|top|best|effective/i);
    });
  });
});
