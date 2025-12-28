/**
 * advance_turn Tests - TDD Red Phase
 * These tests are intentionally written to FAIL until the handler is implemented
 * 
 * advance_turn tool manages turn progression in combat:
 * - Moves to next combatant in initiative order
 * - Handles round transitions when all combatants have acted
 * - Ticks condition durations and removes expired conditions
 * - Processes start-of-turn and end-of-turn effects
 * - Provides death save reminders for characters at 0 HP
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';
import { 
  clearAllEncounters, 
  clearAllConditions, 
  clearTurnTracker,
  getEncounterState,
  getEncounterParticipant
} from '../../src/modules/combat.js';

// Helper to create a test encounter with multiple participants
async function createTestEncounter(participants?: Array<{
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  position?: { x: number; y: number };
  initiativeBonus?: number;
  isEnemy?: boolean;
}>) {
  const defaultParticipants = participants || [
    { id: 'player-1', name: 'Aragorn', hp: 45, maxHp: 45, position: { x: 0, y: 0 }, initiativeBonus: 3 },
    { id: 'player-2', name: 'Legolas', hp: 38, maxHp: 38, position: { x: 5, y: 0 }, initiativeBonus: 5 },
    { id: 'enemy-1', name: 'Orc Warrior', hp: 15, maxHp: 15, position: { x: 10, y: 10 }, initiativeBonus: 1, isEnemy: true },
  ];

  const result = await handleToolCall('create_encounter', {
    seed: 'test-seed', // For deterministic ordering in tests
    participants: defaultParticipants,
  });

  const text = getTextContent(result);
  const idMatch = text.match(/Encounter ID: ([a-zA-Z0-9-]+)/);
  return idMatch ? idMatch[1] : '';
}

describe('advance_turn', () => {
  beforeEach(() => {
    clearAllEncounters();
    clearAllConditions();
    clearTurnTracker();
  });

  // ============================================================
  // BASIC TURN ADVANCEMENT (5+ tests)
  // ============================================================
  describe('Basic Turn Advancement', () => {
    it('should advance to the next combatant in initiative order', async () => {
      const encounterId = await createTestEncounter();
      
      const result = await handleToolCall('advance_turn', {
        encounterId,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should show the next combatant's turn
      expect(text).toMatch(/turn|current/i);
      // Should include combatant info
      expect(text).toMatch(/HP|health/i);
    });

    it('should return new current combatant info', async () => {
      const encounterId = await createTestEncounter([
        { id: 'fast', name: 'Fast Fighter', hp: 30, maxHp: 30, position: { x: 0, y: 0 }, initiativeBonus: 10 },
        { id: 'slow', name: 'Slow Wizard', hp: 20, maxHp: 20, position: { x: 5, y: 5 }, initiativeBonus: -2 },
      ]);

      const result = await handleToolCall('advance_turn', {
        encounterId,
      });

      const text = getTextContent(result);
      // After first combatant, should be second combatant's turn
      expect(text).toContain('Slow Wizard');
      expect(text).toMatch(/turn/i);
    });

    it('should increment turn index correctly', async () => {
      const encounterId = await createTestEncounter();
      
      // Advance turn once
      await handleToolCall('advance_turn', { encounterId });
      
      // Verify encounter state updated
      const encounter = getEncounterState(encounterId);
      expect(encounter).toBeDefined();
      expect(encounter!.currentTurnIndex).toBe(1);
    });

    it('should update turn tracker for previous combatant', async () => {
      const encounterId = await createTestEncounter([
        { id: 'first', name: 'First Fighter', hp: 30, maxHp: 30, position: { x: 0, y: 0 }, initiativeBonus: 10 },
        { id: 'second', name: 'Second Sorcerer', hp: 20, maxHp: 20, position: { x: 5, y: 5 }, initiativeBonus: 5 },
      ]);

      const result = await handleToolCall('advance_turn', {
        encounterId,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // New turn should be the second combatant
      expect(text).toContain('Second Sorcerer');
    });

    it('should show round number in output', async () => {
      const encounterId = await createTestEncounter();

      const result = await handleToolCall('advance_turn', {
        encounterId,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/round\s*[:\s]*1/i);
    });

    it('should display current combatant HP and conditions', async () => {
      const encounterId = await createTestEncounter([
        { id: 'warrior', name: 'Battle Warrior', hp: 25, maxHp: 40, position: { x: 0, y: 0 }, initiativeBonus: 5 },
        { id: 'mage', name: 'Frost Mage', hp: 18, maxHp: 18, position: { x: 5, y: 5 }, initiativeBonus: 2 },
      ]);

      const result = await handleToolCall('advance_turn', {
        encounterId,
      });

      const text = getTextContent(result);
      expect(text).toContain('Frost Mage');
      expect(text).toContain('18'); // HP value
    });
  });

  // ============================================================
  // ROUND TRANSITIONS (3+ tests)
  // ============================================================
  describe('Round Transitions', () => {
    it('should increment round counter when last combatant ends turn', async () => {
      const encounterId = await createTestEncounter([
        { id: 'first', name: 'First', hp: 20, maxHp: 20, position: { x: 0, y: 0 }, initiativeBonus: 10 },
        { id: 'second', name: 'Second', hp: 20, maxHp: 20, position: { x: 5, y: 5 }, initiativeBonus: 5 },
      ]);

      // Advance past first combatant
      await handleToolCall('advance_turn', { encounterId });
      
      // Advance past second (last) combatant - should trigger round transition
      const result = await handleToolCall('advance_turn', { encounterId });

      const text = getTextContent(result);
      expect(text).toMatch(/round\s*[:\s]*2/i);
    });

    it('should reset to first combatant after round transition', async () => {
      const encounterId = await createTestEncounter([
        { id: 'first', name: 'Alpha Fighter', hp: 20, maxHp: 20, position: { x: 0, y: 0 }, initiativeBonus: 10 },
        { id: 'second', name: 'Beta Barbarian', hp: 20, maxHp: 20, position: { x: 5, y: 5 }, initiativeBonus: 5 },
      ]);

      // Complete first round
      await handleToolCall('advance_turn', { encounterId }); // End first's turn
      const result = await handleToolCall('advance_turn', { encounterId }); // End second's turn

      const text = getTextContent(result);
      // Should be back to first combatant (highest initiative)
      expect(text).toContain('Alpha Fighter');
    });

    it('should indicate round transition in output', async () => {
      const encounterId = await createTestEncounter([
        { id: 'p1', name: 'Player One', hp: 20, maxHp: 20, position: { x: 0, y: 0 } },
        { id: 'e1', name: 'Enemy One', hp: 15, maxHp: 15, position: { x: 10, y: 10 }, isEnemy: true },
      ]);

      // Advance through entire round
      await handleToolCall('advance_turn', { encounterId });
      const result = await handleToolCall('advance_turn', { encounterId });

      const text = getTextContent(result);
      expect(text).toMatch(/new round|round 2|round transition/i);
    });

    it('should preserve initiative order across rounds', async () => {
      const encounterId = await createTestEncounter([
        { id: 'fast', name: 'Speedy Sam', hp: 30, maxHp: 30, position: { x: 0, y: 0 }, initiativeBonus: 8 },
        { id: 'slow', name: 'Sluggish Steve', hp: 30, maxHp: 30, position: { x: 5, y: 5 }, initiativeBonus: -3 },
      ]);

      // Complete two full rounds
      await handleToolCall('advance_turn', { encounterId }); // End fast's turn
      await handleToolCall('advance_turn', { encounterId }); // End slow's turn, round 2 starts
      await handleToolCall('advance_turn', { encounterId }); // End fast's turn again
      
      const result = await handleToolCall('advance_turn', { encounterId }); // End slow's turn, round 3

      const text = getTextContent(result);
      expect(text).toMatch(/round\s*[:\s]*3/i);
      expect(text).toContain('Speedy Sam'); // Back to fastest
    });
  });

  // ============================================================
  // CONDITION DURATION TICK (4+ tests)
  // ============================================================
  describe('Condition Duration Tick', () => {
    it('should decrement condition duration at end of turn', async () => {
      const encounterId = await createTestEncounter([
        { id: 'poisoned-player', name: 'Sick Sally', hp: 30, maxHp: 30, position: { x: 0, y: 0 }, initiativeBonus: 5 },
        { id: 'enemy', name: 'Goblin', hp: 7, maxHp: 7, position: { x: 10, y: 10 }, isEnemy: true },
      ]);

      // Add a 3-round poison condition
      await handleToolCall('manage_condition', {
        targetId: 'poisoned-player',
        operation: 'add',
        condition: 'poisoned',
        duration: 3,
      });

      // Advance turn (ends Sick Sally's turn)
      const result = await handleToolCall('advance_turn', { encounterId });

      const text = getTextContent(result);
      // Should show condition updated
      expect(text).toMatch(/poisoned|condition/i);
    });

    it('should remove expired conditions', async () => {
      const encounterId = await createTestEncounter([
        { id: 'expiring', name: 'Expiring Eddie', hp: 30, maxHp: 30, position: { x: 0, y: 0 }, initiativeBonus: 5 },
        { id: 'other', name: 'Other Oscar', hp: 20, maxHp: 20, position: { x: 5, y: 5 }, initiativeBonus: 2 },
      ]);

      // Add a 1-round condition
      await handleToolCall('manage_condition', {
        targetId: 'expiring',
        operation: 'add',
        condition: 'frightened',
        duration: 1,
      });

      // Advance turn - condition should expire
      const result = await handleToolCall('advance_turn', { encounterId });

      const text = getTextContent(result);
      expect(text).toMatch(/expired|ended|removed/i);
      expect(text).toContain('frightened');
    });

    it('should not tick permanent/concentration conditions', async () => {
      const encounterId = await createTestEncounter([
        { id: 'concentrating', name: 'Focused Faye', hp: 25, maxHp: 25, position: { x: 0, y: 0 }, initiativeBonus: 4 },
        { id: 'enemy', name: 'Target', hp: 10, maxHp: 10, position: { x: 10, y: 10 }, isEnemy: true },
      ]);

      // Add concentration-based condition
      await handleToolCall('manage_condition', {
        targetId: 'enemy',
        operation: 'add',
        condition: 'restrained',
        duration: 'concentration',
        source: 'Focused Faye',
      });

      // Advance turn
      const result = await handleToolCall('advance_turn', { encounterId });

      const text = getTextContent(result);
      // Concentration conditions should NOT expire on tick
      expect(text).not.toMatch(/restrained.*expired/i);
    });

    it('should handle multiple conditions on same target', async () => {
      const encounterId = await createTestEncounter([
        { id: 'multi', name: 'Multi-Condition Mike', hp: 40, maxHp: 40, position: { x: 0, y: 0 }, initiativeBonus: 3 },
        { id: 'enemy', name: 'Foe', hp: 15, maxHp: 15, position: { x: 10, y: 10 }, isEnemy: true },
      ]);

      // Add multiple conditions with different durations
      await handleToolCall('manage_condition', {
        targetId: 'multi',
        operation: 'add',
        condition: 'poisoned',
        duration: 3,
      });

      await handleToolCall('manage_condition', {
        targetId: 'multi',
        operation: 'add',
        condition: 'blinded',
        duration: 1,
      });

      // Advance turn
      const result = await handleToolCall('advance_turn', { encounterId });

      const text = getTextContent(result);
      // Blinded should expire, poisoned should still be active
      expect(text).toMatch(/blinded.*expired|expired.*blinded/i);
    });

    it('should show remaining duration for active conditions', async () => {
      const encounterId = await createTestEncounter([
        { id: 'player', name: 'Patient Pete', hp: 30, maxHp: 30, position: { x: 0, y: 0 }, initiativeBonus: 5 },
        { id: 'enemy', name: 'Enemy', hp: 10, maxHp: 10, position: { x: 10, y: 10 }, isEnemy: true },
      ]);

      // Add 5-round condition
      await handleToolCall('manage_condition', {
        targetId: 'player',
        operation: 'add',
        condition: 'stunned',
        duration: 5,
      });

      // Advance turn
      const result = await handleToolCall('advance_turn', { encounterId });

      const text = getTextContent(result);
      // Should show updated duration (now 4 rounds)
      expect(text).toMatch(/4.*round|round.*4/i);
    });
  });

  // ============================================================
  // EFFECT PROCESSING (3+ tests)
  // ============================================================
  describe('Effect Processing', () => {
    it('should process start-of-turn effects when processEffects is true', async () => {
      const encounterId = await createTestEncounter([
        { id: 'regen', name: 'Regenerating Rex', hp: 20, maxHp: 40, position: { x: 0, y: 0 }, initiativeBonus: 5 },
        { id: 'normal', name: 'Normal Ned', hp: 30, maxHp: 30, position: { x: 5, y: 5 }, initiativeBonus: 2 },
      ]);

      // TODO: When start-of-turn effects are implemented (e.g., regeneration)
      const result = await handleToolCall('advance_turn', {
        encounterId,
        processEffects: true,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should mention effect processing
      expect(text).toMatch(/effect|start.*turn|turn.*start/i);
    });

    it('should skip effect processing when processEffects is false', async () => {
      const encounterId = await createTestEncounter();

      const result = await handleToolCall('advance_turn', {
        encounterId,
        processEffects: false,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should still advance turn but skip effects
    });

    it('should process end-of-turn effects for previous combatant', async () => {
      const encounterId = await createTestEncounter([
        { id: 'dot', name: 'Burning Bob', hp: 30, maxHp: 30, position: { x: 0, y: 0 }, initiativeBonus: 8 },
        { id: 'next', name: 'Next Nancy', hp: 25, maxHp: 25, position: { x: 5, y: 5 }, initiativeBonus: 3 },
      ]);

      // TODO: When damage-over-time effects are implemented
      const result = await handleToolCall('advance_turn', {
        encounterId,
        processEffects: true,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
    });

    it('should process aura effects when processAuras is true', async () => {
      const encounterId = await createTestEncounter([
        { id: 'paladin', name: 'Aura Paladin', hp: 50, maxHp: 50, position: { x: 0, y: 0 }, initiativeBonus: 4 },
        { id: 'ally', name: 'Protected Ally', hp: 30, maxHp: 30, position: { x: 1, y: 0 }, initiativeBonus: 2 },
      ]);

      const result = await handleToolCall('advance_turn', {
        encounterId,
        processAuras: true,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // When auras are implemented, should process them
    });

    it('should skip aura processing when processAuras is false', async () => {
      const encounterId = await createTestEncounter();

      const result = await handleToolCall('advance_turn', {
        encounterId,
        processAuras: false,
      });

      expect(result.isError).toBeUndefined();
    });
  });

  // ============================================================
  // DEATH SAVE REMINDERS (2+ tests)
  // ============================================================
  describe('Death Save Reminders', () => {
    it('should show death save reminder for combatant at 0 HP', async () => {
      const encounterId = await createTestEncounter([
        { id: 'dying', name: 'Dying Dave', hp: 1, maxHp: 30, position: { x: 0, y: 0 }, initiativeBonus: 5 },
        { id: 'attacker', name: 'Attacker', hp: 20, maxHp: 20, position: { x: 5, y: 5 }, initiativeBonus: 3, isEnemy: true },
      ]);

      // Reduce Dying Dave to 0 HP
      const encounter = getEncounterState(encounterId);
      const dyingDave = encounter!.participants.find(p => p.id === 'dying');
      if (dyingDave) dyingDave.hp = 0;

      // Advance to dying combatant's turn
      const result = await handleToolCall('advance_turn', { encounterId });

      const text = getTextContent(result);
      expect(text).toMatch(/death.*save|death.*saving|unconscious|0.*hp/i);
      expect(text).toContain('Dying Dave');
    });

    it('should not show death save reminder for stable characters at 0 HP', async () => {
      const encounterId = await createTestEncounter([
        { id: 'stable', name: 'Stable Steve', hp: 1, maxHp: 30, position: { x: 0, y: 0 }, initiativeBonus: 5 },
        { id: 'other', name: 'Other', hp: 20, maxHp: 20, position: { x: 5, y: 5 }, initiativeBonus: 3 },
      ]);

      // Set Steve to 0 HP but mark as stable (when stability tracking is implemented)
      const encounter = getEncounterState(encounterId);
      const stable = encounter!.participants.find(p => p.id === 'stable');
      if (stable) {
        stable.hp = 0;
        // Note: stability tracking would be set here when implemented
      }

      const result = await handleToolCall('advance_turn', { encounterId });

      // Should still advance turn, death save handling may differ based on implementation
      expect(result.isError).toBeUndefined();
    });

    it('should skip dead characters in turn order', async () => {
      const encounterId = await createTestEncounter([
        { id: 'dead', name: 'Dead Derek', hp: 1, maxHp: 30, position: { x: 0, y: 0 }, initiativeBonus: 10 },
        { id: 'alive', name: 'Alive Alice', hp: 25, maxHp: 25, position: { x: 5, y: 5 }, initiativeBonus: 5 },
        { id: 'also-alive', name: 'Also Alive Andy', hp: 20, maxHp: 20, position: { x: 8, y: 8 }, initiativeBonus: 2 },
      ]);

      // Kill Derek (would have 3 death save failures or massive damage)
      const encounter = getEncounterState(encounterId);
      const dead = encounter!.participants.find(p => p.id === 'dead');
      if (dead) dead.hp = 0;

      // Advance turn - should go to Alice, not dead Derek
      const result = await handleToolCall('advance_turn', { encounterId });

      const text = getTextContent(result);
      // Implementation may vary - could show dead state or skip entirely
      expect(result.isError).toBeUndefined();
    });
  });

  // ============================================================
  // ERROR HANDLING (3+ tests)
  // ============================================================
  describe('Error Handling', () => {
    it('should return error for non-existent encounter', async () => {
      const result = await handleToolCall('advance_turn', {
        encounterId: 'non-existent-encounter-id',
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/not found|invalid|does not exist/i);
    });

    it('should return error for missing encounterId', async () => {
      const result = await handleToolCall('advance_turn', {});

      expect(result.isError).toBe(true);
    });

    it('should return error when encounter has no active participants', async () => {
      const encounterId = await createTestEncounter([
        { id: 'only-one', name: 'Solo Sam', hp: 1, maxHp: 30, position: { x: 0, y: 0 } },
      ]);

      // Set only participant to 0 HP (dead)
      const encounter = getEncounterState(encounterId);
      const only = encounter!.participants[0];
      if (only) only.hp = 0;

      const result = await handleToolCall('advance_turn', { encounterId });

      // Should handle gracefully - either error or end encounter
      const text = getTextContent(result);
      expect(text).toMatch(/no.*active|all.*dead|encounter.*end|combat.*over/i);
    });

    it('should handle invalid processEffects value gracefully', async () => {
      const encounterId = await createTestEncounter();

      // Even with strange input, should handle gracefully
      const result = await handleToolCall('advance_turn', {
        encounterId,
        processEffects: 'invalid' as any,
      });

      // Should either coerce to boolean or reject with clear error
      // Implementation will determine exact behavior
    });
  });

  // ============================================================
  // ASCII ART OUTPUT (2+ tests)
  // ============================================================
  describe('ASCII Art Output', () => {
    it('should return ASCII-formatted turn info with box borders', async () => {
      const encounterId = await createTestEncounter();

      const result = await handleToolCall('advance_turn', {
        encounterId,
      });

      const text = getTextContent(result);
      // Should have box-drawing characters
      expect(text).toContain('╔');
      expect(text).toContain('═');
      expect(text).toContain('╗');
      expect(text).toContain('║');
      expect(text).toContain('╚');
      expect(text).toContain('╝');
    });

    it('should show turn summary with combatant name and HP', async () => {
      const encounterId = await createTestEncounter([
        { id: 'high-init', name: 'Quick Quinn', hp: 35, maxHp: 35, position: { x: 0, y: 0 }, initiativeBonus: 8 },
        { id: 'low-init', name: 'Slow Sasha', hp: 28, maxHp: 28, position: { x: 5, y: 5 }, initiativeBonus: -1 },
      ]);

      const result = await handleToolCall('advance_turn', {
        encounterId,
      });

      const text = getTextContent(result);
      expect(text).toContain('Slow Sasha'); // Should now be Sasha's turn
      expect(text).toContain('28'); // HP
      expect(text).toMatch(/hp|health/i);
    });

    it('should display expired conditions in output', async () => {
      const encounterId = await createTestEncounter([
        { id: 'cond', name: 'Condition Carl', hp: 30, maxHp: 30, position: { x: 0, y: 0 }, initiativeBonus: 5 },
        { id: 'next', name: 'Next Person', hp: 25, maxHp: 25, position: { x: 5, y: 5 }, initiativeBonus: 2 },
      ]);

      // Add expiring condition
      await handleToolCall('manage_condition', {
        targetId: 'cond',
        operation: 'add',
        condition: 'charmed',
        duration: 1,
      });

      const result = await handleToolCall('advance_turn', { encounterId });

      const text = getTextContent(result);
      // Should show the expired condition
      expect(text).toMatch(/charmed/i);
      expect(text).toMatch(/expired|ended|removed/i);
    });

    it('should include initiative order reminder', async () => {
      const encounterId = await createTestEncounter([
        { id: 'a', name: 'First', hp: 20, maxHp: 20, position: { x: 0, y: 0 }, initiativeBonus: 10 },
        { id: 'b', name: 'Second', hp: 20, maxHp: 20, position: { x: 2, y: 2 }, initiativeBonus: 5 },
        { id: 'c', name: 'Third', hp: 20, maxHp: 20, position: { x: 5, y: 5 }, initiativeBonus: 0 },
      ]);

      const result = await handleToolCall('advance_turn', { encounterId });

      const text = getTextContent(result);
      // Should show who is up next or initiative order
      expect(text).toMatch(/next|initiative|order/i);
    });
  });

  // ============================================================
  // INTEGRATION WITH OTHER SYSTEMS
  // ============================================================
  describe('System Integration', () => {
    it('should clear turn tracker for previous combatant', async () => {
      const encounterId = await createTestEncounter([
        { id: 'user', name: 'Turn User', hp: 30, maxHp: 30, position: { x: 0, y: 0 }, initiativeBonus: 5 },
        { id: 'next', name: 'Next Up', hp: 25, maxHp: 25, position: { x: 5, y: 5 }, initiativeBonus: 2 },
      ]);

      // Use an action on first turn
      await handleToolCall('execute_action', {
        encounterId,
        actorId: 'user',
        actionType: 'dash',
      });

      // Advance turn
      const result = await handleToolCall('advance_turn', { encounterId });

      // Next combatant should have fresh action economy
      expect(result.isError).toBeUndefined();
    });

    it('should work after multiple actions in a turn', async () => {
      const encounterId = await createTestEncounter([
        { id: 'busy', name: 'Busy Bee', hp: 30, maxHp: 30, position: { x: 0, y: 0 }, initiativeBonus: 5 },
        { id: 'target', name: 'Target Ted', hp: 20, maxHp: 20, position: { x: 1, y: 0 }, initiativeBonus: 2, isEnemy: true },
        { id: 'other', name: 'Other Otto', hp: 25, maxHp: 25, position: { x: 5, y: 5 }, initiativeBonus: 0 },
      ]);

      // Take multiple actions
      await handleToolCall('execute_action', {
        encounterId,
        actorId: 'busy',
        actionType: 'attack',
        targetId: 'target',
        damageExpression: '1d8+3',
        damageType: 'slashing',
      });

      // Advance turn
      const result = await handleToolCall('advance_turn', { encounterId });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);
      expect(text).toContain('Target Ted'); // Should be target's turn now
    });
  });

  // ============================================================
  // EDGE CASES
  // ============================================================
  describe('Edge Cases', () => {
    it('should handle single-combatant encounter', async () => {
      const encounterId = await createTestEncounter([
        { id: 'solo', name: 'Solo Warrior', hp: 50, maxHp: 50, position: { x: 0, y: 0 } },
      ]);

      const result = await handleToolCall('advance_turn', { encounterId });

      const text = getTextContent(result);
      // Should wrap back to same combatant and increment round
      expect(text).toContain('Solo Warrior');
      expect(text).toMatch(/round\s*[:\s]*2/i);
    });

    it('should handle very long encounters (round 100+)', async () => {
      const encounterId = await createTestEncounter([
        { id: 'p1', name: 'Patient One', hp: 100, maxHp: 100, position: { x: 0, y: 0 } },
        { id: 'p2', name: 'Patient Two', hp: 100, maxHp: 100, position: { x: 5, y: 5 }, isEnemy: true },
      ]);

      // Advance many rounds - simulate by setting round directly if possible
      // For now, just verify the tool handles it
      const result = await handleToolCall('advance_turn', { encounterId });
      
      expect(result.isError).toBeUndefined();
    });

    it('should handle combatants with same initiative', async () => {
      const encounterId = await createTestEncounter([
        { id: 'tie1', name: 'Tied Alice', hp: 30, maxHp: 30, position: { x: 0, y: 0 }, initiativeBonus: 5 },
        { id: 'tie2', name: 'Tied Bob', hp: 30, maxHp: 30, position: { x: 5, y: 5 }, initiativeBonus: 5 },
      ]);

      // Should handle tie-breaking and advance properly
      const result = await handleToolCall('advance_turn', { encounterId });
      
      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);
      // Should show one of them
      expect(text).toMatch(/Tied Alice|Tied Bob/);
    });
  });
});
