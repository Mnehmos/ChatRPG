/**
 * roll_death_save Tests - TDD Red Phase
 * These tests are intentionally written to FAIL until the handler is implemented
 * 
 * D&D 5e Death Saving Throw Rules:
 * - When at 0 HP, roll d20 at start of turn
 * - 10+ = success, 9- = failure
 * - Natural 1 = 2 failures
 * - Natural 20 = regain 1 HP and become conscious
 * - 3 successes = stable (no longer need to roll)
 * - 3 failures = death
 * - Taking damage at 0 HP = 1 failure (2 if critical)
 * 
 * Expected Schema (Zod):
 * ```typescript
 * const rollDeathSaveSchema = z.object({
 *   encounterId: z.string().describe('The encounter containing the dying character'),
 *   characterId: z.string().describe('The character making the death save'),
 *   modifier: z.number().optional().describe('Bonus/penalty to the roll (e.g., Bless spell)'),
 *   rollMode: z.enum(['normal', 'advantage', 'disadvantage']).optional().default('normal')
 *     .describe('Roll mode - advantage rolls 2d20 keep highest, disadvantage keeps lowest'),
 *   manualRoll: z.number().min(1).max(20).optional().describe('Override the d20 roll (for testing)'),
 *   manualRolls: z.array(z.number().min(1).max(20)).length(2).optional()
 *     .describe('Override both dice for advantage/disadvantage (for testing)'),
 * });
 * ```
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';
import { 
  clearAllEncounters, 
  clearAllConditions,
  getEncounterState,
} from '../../src/modules/combat.js';

// Note: getDeathSaveState and clearDeathSaveState will be added during Green Phase
// For now, we test the interface through tool calls only

// Helper to create a test encounter with a dying character
async function createEncounterWithDyingCharacter(characterName: string = 'Dying Dave') {
  const result = await handleToolCall('create_encounter', {
    seed: 'death-save-test',
    participants: [
      { id: 'dying-pc', name: characterName, hp: 0, maxHp: 30, position: { x: 0, y: 0 }, initiativeBonus: 0 },
      { id: 'enemy-1', name: 'Goblin', hp: 7, maxHp: 7, position: { x: 10, y: 10 }, initiativeBonus: 1, isEnemy: true },
    ],
  });

  const text = getTextContent(result);
  const idMatch = text.match(/Encounter ID: ([a-zA-Z0-9-]+)/);
  return idMatch ? idMatch[1] : '';
}

describe('roll_death_save', () => {
  beforeEach(() => {
    clearAllEncounters();
    clearAllConditions();
  });

  // ============================================================
  // BASIC DEATH SAVES (6 tests)
  // ============================================================
  describe('Basic Death Saves', () => {
    it('should roll a d20 for death saving throw', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should show roll result
      expect(text).toMatch(/roll|d20/i);
      // Should show a number between 1 and 20
      expect(text).toMatch(/\b([1-9]|1[0-9]|20)\b/);
    });

    it('should count 10+ as a success', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      // Use manual roll to force success
      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 15, // Forced roll for testing
      });

      const text = getTextContent(result);
      expect(text).toMatch(/success/i);
    });

    it('should count 9 or less as a failure', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 5, // Forced roll for testing
      });

      const text = getTextContent(result);
      expect(text).toMatch(/failure|fail/i);
    });

    it('should track cumulative successes', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      // First success
      await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 12,
      });

      // Second success
      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 14,
      });

      const text = getTextContent(result);
      // Should show 2 successes (visual: ●●○)
      expect(text).toMatch(/Successes:.*●.*●/i);
    });

    it('should track cumulative failures', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      // First failure
      await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 5,
      });

      // Second failure
      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 3,
      });

      const text = getTextContent(result);
      // Should show 2 failures (visual: ✕✕○)
      expect(text).toMatch(/Failures:.*✕.*✕/i);
    });

    it('should return current death save state', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 10, // Exactly 10 = success
      });

      const text = getTextContent(result);
      // Should show success/failure visual tracker
      expect(text).toMatch(/Successes:.*[●○]/i);
      expect(text).toMatch(/Failures:.*[✕○]/i);
    });
  });

  // ============================================================
  // NATURAL 1 - TWO FAILURES (3 tests)
  // ============================================================
  describe('Natural 1 - Two Failures', () => {
    it('should count natural 1 as two failures', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 1, // Natural 1
      });

      const text = getTextContent(result);
      expect(text).toMatch(/natural 1|nat 1|critical fail/i);
      // Should show 2 failures (not 1)
      expect(text).toMatch(/2.*fail|fail.*2|two fail/i);
    });

    it('should cause death if already at 1 failure', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      // First failure
      await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 5,
      });

      // Natural 1 (adds 2 more = 3 total = DEATH)
      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 1,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/dead|death|died|perished/i);
    });

    it('should show dramatic messaging for natural 1', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 1,
      });

      const text = getTextContent(result);
      // Should have dramatic/warning indicators
      expect(text).toMatch(/💀|⚠|critical|terrible/i);
    });
  });

  // ============================================================
  // NATURAL 20 - REVIVAL (4 tests)
  // ============================================================
  describe('Natural 20 - Revival', () => {
    it('should revive character at 1 HP on natural 20', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 20, // Natural 20
      });

      const text = getTextContent(result);
      expect(text).toMatch(/natural 20|nat 20|critical success/i);
      expect(text).toMatch(/revive|conscious|regain|1 hp/i);
    });

    it('should set HP to 1 after natural 20', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 20,
      });

      // Check encounter state
      const encounter = getEncounterState(encounterId);
      const character = encounter?.participants.find(p => p.id === 'dying-pc');
      expect(character?.hp).toBe(1);
    });

    it('should clear death save state after natural 20', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      // Get some failures first
      await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 5,
      });

      // Natural 20 should clear everything
      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 20,
      });

      const text = getTextContent(result);
      // Result should indicate revival and cleared state
      expect(text).toMatch(/revive|conscious|regain/i);
    });

    it('should remove unconscious condition on natural 20', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      // Add unconscious condition
      await handleToolCall('manage_condition', {
        targetId: 'dying-pc',
        operation: 'add',
        condition: 'unconscious',
      });

      // Roll natural 20
      await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 20,
      });

      // Check condition is removed
      const conditionResult = await handleToolCall('manage_condition', {
        targetId: 'dying-pc',
        operation: 'query',
      });

      const text = getTextContent(conditionResult);
      expect(text).not.toMatch(/unconscious/i);
    });
  });

  // ============================================================
  // STABILIZATION - THREE SUCCESSES (4 tests)
  // ============================================================
  describe('Stabilization - Three Successes', () => {
    it('should stabilize character after 3 successes', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 10 });
      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 12 });
      const result = await handleToolCall('roll_death_save', { 
        encounterId, 
        characterId: 'dying-pc', 
        manualRoll: 15 
      });

      const text = getTextContent(result);
      expect(text).toMatch(/stable|stabilized/i);
    });

    it('should not require more death saves after stabilization', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      // Stabilize
      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 10 });
      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 12 });
      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 15 });

      // Try to roll again
      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
      });

      const text = getTextContent(result);
      expect(text).toMatch(/already stable|no longer|not needed/i);
    });

    it('should keep character at 0 HP when stable', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 10 });
      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 12 });
      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 15 });

      const encounter = getEncounterState(encounterId);
      const character = encounter?.participants.find(p => p.id === 'dying-pc');
      expect(character?.hp).toBe(0); // Still at 0 HP, just stable
    });

    it('should show stable status in output', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 10 });
      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 12 });
      const result = await handleToolCall('roll_death_save', { 
        encounterId, 
        characterId: 'dying-pc', 
        manualRoll: 15 
      });

      const text = getTextContent(result);
      expect(text).toMatch(/✓.*stable|stable.*✓|★.*stable/i);
    });
  });

  // ============================================================
  // DEATH - THREE FAILURES (4 tests)
  // ============================================================
  describe('Death - Three Failures', () => {
    it('should kill character after 3 failures', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 5 });
      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 3 });
      const result = await handleToolCall('roll_death_save', { 
        encounterId, 
        characterId: 'dying-pc', 
        manualRoll: 2 
      });

      const text = getTextContent(result);
      expect(text).toMatch(/dead|death|died|perished|fallen/i);
    });

    it('should not allow more death saves after death', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 5 });
      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 3 });
      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 2 });

      // Try to roll again after death
      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
      });

      const text = getTextContent(result);
      expect(text).toMatch(/already dead|deceased|cannot|no longer/i);
    });

    it('should show dramatic death messaging', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 5 });
      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 3 });
      const result = await handleToolCall('roll_death_save', { 
        encounterId, 
        characterId: 'dying-pc', 
        manualRoll: 2 
      });

      const text = getTextContent(result);
      // Should have dramatic death indicators
      expect(text).toMatch(/💀|☠|✝|RIP|rest in peace/i);
    });

    it('should include character name in death message', async () => {
      const encounterId = await createEncounterWithDyingCharacter('Brave Bertram');

      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 5 });
      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 3 });
      const result = await handleToolCall('roll_death_save', { 
        encounterId, 
        characterId: 'dying-pc', 
        manualRoll: 2 
      });

      const text = getTextContent(result);
      expect(text).toContain('Brave Bertram');
    });
  });

  // ============================================================
  // MODIFIERS (4 tests)
  // ============================================================
  describe('Modifiers', () => {
    it('should apply positive modifier to roll', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      // Roll 8 + 3 modifier = 11 = success
      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 8,
        modifier: 3, // e.g., Bless spell
      });

      const text = getTextContent(result);
      expect(text).toMatch(/11/); // Shows total
      expect(text).toMatch(/success/i);
    });

    it('should apply negative modifier to roll', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      // Roll 12 - 3 modifier = 9 = failure
      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 12,
        modifier: -3, // e.g., Bane spell
      });

      const text = getTextContent(result);
      expect(text).toMatch(/9/); // Shows total
      expect(text).toMatch(/fail/i);
    });

    it('should show modifier breakdown in output', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 10,
        modifier: 2,
      });

      const text = getTextContent(result);
      // Should show breakdown like "10 + 2 = 12"
      expect(text).toMatch(/10.*\+.*2|roll.*10.*mod.*2/i);
    });

    it('should still trigger nat 20 effects even with modifier', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      // Natural 20 should still revive regardless of modifier
      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 20,
        modifier: -5,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/natural 20|nat 20|revive/i);
    });
  });

  // ============================================================
  // ADVANTAGE/DISADVANTAGE (4 tests)
  // ============================================================
  describe('Roll Mode (Advantage/Disadvantage)', () => {
    it('should roll with advantage when rollMode is advantage', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        rollMode: 'advantage', // Enum: 'normal' | 'advantage' | 'disadvantage'
      });

      const text = getTextContent(result);
      expect(text).toMatch(/advantage/i);
      // Should show two dice values
      expect(text).toMatch(/\d+.*\d+|kept.*higher/i);
    });

    it('should roll with disadvantage when rollMode is disadvantage', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        rollMode: 'disadvantage',
      });

      const text = getTextContent(result);
      expect(text).toMatch(/disadvantage/i);
    });

    it('should default to normal roll mode', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 15,
        // No rollMode specified - should be normal
      });

      const text = getTextContent(result);
      // Should NOT show advantage or disadvantage
      expect(text).not.toMatch(/advantage|disadvantage/i);
    });

    it('should use higher of two dice with advantage', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      // With manual rolls for advantage, use the higher
      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        rollMode: 'advantage',
        manualRolls: [5, 15], // Should use 15
      });

      const text = getTextContent(result);
      expect(text).toMatch(/15/);
      expect(text).toMatch(/success/i);
    });
  });

  // ============================================================
  // ERROR HANDLING (5 tests)
  // ============================================================
  describe('Error Handling', () => {
    it('should return error for non-existent encounter', async () => {
      const result = await handleToolCall('roll_death_save', {
        encounterId: 'fake-encounter-id',
        characterId: 'dying-pc',
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/not found|invalid|does not exist/i);
    });

    it('should return error for non-existent character', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'non-existent-character',
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/not found|invalid|does not exist/i);
    });

    it('should return error if character is not at 0 HP', async () => {
      // Create encounter with healthy character
      const result = await handleToolCall('create_encounter', {
        seed: 'healthy-test',
        participants: [
          { id: 'healthy-pc', name: 'Healthy Harry', hp: 30, maxHp: 30, position: { x: 0, y: 0 } },
          { id: 'enemy', name: 'Goblin', hp: 7, maxHp: 7, position: { x: 10, y: 10 }, isEnemy: true },
        ],
      });

      const text = getTextContent(result);
      const idMatch = text.match(/Encounter ID: ([a-zA-Z0-9-]+)/);
      const encounterId = idMatch ? idMatch[1] : '';

      const saveResult = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'healthy-pc',
      });

      expect(saveResult.isError).toBe(true);
      const saveText = getTextContent(saveResult);
      expect(saveText).toMatch(/not at 0 hp|not dying|not unconscious|has hp/i);
    });

    it('should return error for missing encounterId', async () => {
      const result = await handleToolCall('roll_death_save', {
        characterId: 'dying-pc',
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for missing characterId', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      const result = await handleToolCall('roll_death_save', {
        encounterId,
      });

      expect(result.isError).toBe(true);
    });
  });

  // ============================================================
  // ASCII ART OUTPUT (4 tests)
  // ============================================================
  describe('ASCII Art Output', () => {
    it('should return ASCII-formatted death save with box borders', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 10,
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

    it('should show character name in output', async () => {
      const encounterId = await createEncounterWithDyingCharacter('Doomed Derek');

      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 10,
      });

      const text = getTextContent(result);
      expect(text).toContain('Doomed Derek');
    });

    it('should show visual success/failure tracker', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      // Get 2 successes and 1 failure
      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 15 });
      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 5 });
      const result = await handleToolCall('roll_death_save', { 
        encounterId, 
        characterId: 'dying-pc', 
        manualRoll: 12 
      });

      const text = getTextContent(result);
      // Should show visual tracker like "Successes: ●●○" or "✓✓○"
      expect(text).toMatch(/success.*[●✓☑].*[●✓☑]|[●✓☑].*[●✓☑].*success/i);
      expect(text).toMatch(/fail.*[●✗☒✕]|[●✗☒✕].*fail/i);
    });

    it('should include dramatic header for death save', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 10,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/death.*save|saving.*throw|fate|life.*death/i);
    });
  });

  // ============================================================
  // INTEGRATION WITH OTHER SYSTEMS (3 tests)
  // ============================================================
  describe('System Integration', () => {
    it('should work after advance_turn death save reminder', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      // Advance turn (should show death save reminder)
      await handleToolCall('advance_turn', { encounterId });

      // Roll death save
      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
        manualRoll: 10,
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);
      expect(text).toMatch(/success/i);
    });

    it('should persist death save state across multiple calls', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      // Roll several saves
      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 15 });
      const result = await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 5 });

      // Result should show both success and failure tracked (visual: ●○○ and ✕○○)
      const text = getTextContent(result);
      expect(text).toMatch(/Successes:.*●.*○.*○/i);
      expect(text).toMatch(/Failures:.*✕.*○.*○/i);
    });

    it('should reset death save state when healed above 0 HP', async () => {
      const encounterId = await createEncounterWithDyingCharacter();

      // Get some death save progress
      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 15 });
      await handleToolCall('roll_death_save', { encounterId, characterId: 'dying-pc', manualRoll: 5 });

      // Heal the character (via execute_action heal or update encounter state)
      const encounter = getEncounterState(encounterId);
      const character = encounter?.participants.find(p => p.id === 'dying-pc');
      if (character) character.hp = 5;

      // Death save state should be cleared or next call should recognize not at 0 HP
      const result = await handleToolCall('roll_death_save', {
        encounterId,
        characterId: 'dying-pc',
      });

      const text = getTextContent(result);
      expect(text).toMatch(/not at 0 hp|not dying|has hp|cannot/i);
    });
  });
});
