/**
 * manage_concentration Tests - TDD Red Phase
 *
 * Operations:
 * - check: Roll concentration save after damage (DC = max(10, damage/2))
 * - break: Force break concentration (manual)
 * - get: Query current concentration state
 * - set: Set concentration on a spell (internal use)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';

// Will be implemented to clear concentration state between tests
// import { clearAllConcentration } from '../../src/modules/magic.js';

describe('manage_concentration', () => {
  // Helper to clear concentration between tests
  beforeEach(async () => {
    // Clear any existing concentration states
    // clearAllConcentration();

    // For now, we'll break concentration manually on known characters
    await handleToolCall('manage_concentration', {
      characterId: 'test-wizard-1',
      operation: 'break',
    }).catch(() => {}); // Ignore errors if no concentration exists

    await handleToolCall('manage_concentration', {
      characterId: 'test-cleric-1',
      operation: 'break',
    }).catch(() => {});
  });

  // ============================================================
  // SET OPERATION - Establish concentration on a spell
  // ============================================================

  describe('Set Concentration', () => {
    it('should set concentration on a spell', async () => {
      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'set',
        spellName: 'Hold Person',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Hold Person');
      expect(text).toContain('CONCENTRATING');
    });

    it('should record the caster and spell name', async () => {
      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'set',
        spellName: 'Hypnotic Pattern',
      });

      const text = getTextContent(result);
      expect(text).toContain('test-wizard-1');
      expect(text).toContain('Hypnotic Pattern');
    });

    it('should break existing concentration when setting new spell', async () => {
      // First spell
      await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'set',
        spellName: 'Hold Person',
      });

      // Second spell (should replace first)
      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'set',
        spellName: 'Haste',
      });

      const text = getTextContent(result);
      expect(text).toContain('Haste');
      expect(text).toContain('BROKEN'); // All caps in output
      expect(text).toContain('Hold Person');
    });

    it('should optionally record affected targets', async () => {
      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'set',
        spellName: 'Hold Person',
        targets: ['goblin-1', 'goblin-2'],
      });

      const text = getTextContent(result);
      expect(text).toContain('goblin-1');
      expect(text).toContain('goblin-2');
    });

    it('should require spellName for set operation', async () => {
      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'set',
      });

      expect(result.isError).toBe(true);
      // Validation fails when schema doesn't match any union variant
    });
  });

  // ============================================================
  // GET OPERATION - Query current concentration state
  // ============================================================

  describe('Get Concentration', () => {
    it('should return current concentration state', async () => {
      // Set up concentration first
      await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'set',
        spellName: 'Fly',
      });

      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'get',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Fly');
      expect(text).toContain('CONCENTRATING');
    });

    it('should indicate when not concentrating', async () => {
      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'get',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Not concentrating');
    });

    it('should show duration/rounds if tracked', async () => {
      await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'set',
        spellName: 'Invisibility',
        duration: 10, // 10 rounds (1 hour at 6 seconds/round)
      });

      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'get',
      });

      const text = getTextContent(result);
      expect(text).toContain('10');
      expect(text).toMatch(/round|duration/i);
    });
  });

  // ============================================================
  // CHECK OPERATION - Roll concentration save after damage
  // ============================================================

  describe('Check Concentration (Save Roll)', () => {
    beforeEach(async () => {
      // Set up concentration for check tests
      await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'set',
        spellName: 'Banishment',
      });
    });

    it('should calculate DC as max(10, damage/2)', async () => {
      // 20 damage = DC 10 (20/2 = 10, max(10,10) = 10)
      const result1 = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'check',
        damage: 20,
        manualRoll: 10, // Exactly meets DC 10
      });

      const text1 = getTextContent(result1);
      expect(text1).toContain('DC 10');
      expect(text1).toContain('SUCCESS');

      // Reset and try higher damage
      await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'set',
        spellName: 'Banishment',
      });

      // 30 damage = DC 15 (30/2 = 15, max(10,15) = 15)
      const result2 = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'check',
        damage: 30,
        manualRoll: 14, // Below DC 15
      });

      const text2 = getTextContent(result2);
      expect(text2).toContain('DC 15');
      expect(text2).toContain('FAILED');
    });

    it('should use DC 10 minimum for low damage', async () => {
      // 10 damage = DC 10 (10/2 = 5, max(10,5) = 10)
      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'check',
        damage: 10,
        manualRoll: 9, // Below DC 10
      });

      const text = getTextContent(result);
      expect(text).toContain('DC 10');
      expect(text).toContain('FAILED');
    });

    it('should apply CON save modifier', async () => {
      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'check',
        damage: 20,
        conSaveModifier: 5, // +5 CON save
        manualRoll: 5, // 5 + 5 = 10, meets DC 10
      });

      const text = getTextContent(result);
      expect(text).toContain('+5');
      expect(text).toContain('SUCCESS');
    });

    it('should support advantage on the save', async () => {
      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'check',
        damage: 20,
        rollMode: 'advantage',
        manualRolls: [5, 15], // Takes 15, succeeds vs DC 10
      });

      const text = getTextContent(result);
      expect(text).toContain('advantage');
      expect(text).toContain('SUCCESS');
    });

    it('should support disadvantage on the save', async () => {
      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'check',
        damage: 20,
        rollMode: 'disadvantage',
        manualRolls: [15, 5], // Takes 5, fails vs DC 10
      });

      const text = getTextContent(result);
      expect(text).toContain('disadvantage');
      expect(text).toContain('FAILED');
    });

    it('should break concentration on failed save', async () => {
      await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'check',
        damage: 20,
        manualRoll: 5, // Below DC 10
      });

      // Verify concentration is broken
      const getResult = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'get',
      });

      const text = getTextContent(getResult);
      expect(text).toContain('Not concentrating');
    });

    it('should maintain concentration on successful save', async () => {
      await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'check',
        damage: 20,
        manualRoll: 15, // Above DC 10
      });

      // Verify concentration is maintained
      const getResult = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'get',
      });

      const text = getTextContent(getResult);
      expect(text).toContain('Banishment');
      expect(text).toContain('CONCENTRATING');
    });

    it('should indicate when check is called but not concentrating', async () => {
      // Break concentration first
      await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'break',
      });

      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'check',
        damage: 20,
      });

      const text = getTextContent(result);
      expect(text).toContain('Not concentrating');
    });

    it('should require damage parameter for check', async () => {
      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'check',
      });

      expect(result.isError).toBe(true);
      // Validation fails when schema doesn't match any union variant
    });
  });

  // ============================================================
  // BREAK OPERATION - Force break concentration
  // ============================================================

  describe('Break Concentration', () => {
    it('should break concentration manually', async () => {
      // Set up concentration first
      await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'set',
        spellName: 'Wall of Force',
      });

      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'break',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Wall of Force');
      expect(text).toContain('BROKEN'); // All caps in output
    });

    it('should handle breaking when not concentrating', async () => {
      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'break',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Not concentrating');
    });

    it('should optionally specify reason for break', async () => {
      await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'set',
        spellName: 'Spirit Guardians',
      });

      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'break',
        reason: 'Caster was incapacitated',
      });

      const text = getTextContent(result);
      expect(text).toContain('incapacitated');
    });

    it('should return info about what spell was being concentrated on', async () => {
      await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'set',
        spellName: 'Polymorph',
        targets: ['fighter-1'],
      });

      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'break',
      });

      const text = getTextContent(result);
      expect(text).toContain('Polymorph');
      expect(text).toContain('fighter-1');
    });
  });

  // ============================================================
  // OUTPUT FORMAT - ASCII Art
  // ============================================================

  describe('Output Format', () => {
    it('should output ASCII art box for set operation', async () => {
      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'set',
        spellName: 'Detect Magic',
      });

      const text = getTextContent(result);
      expect(text).toMatch(/[╔┌]/); // ASCII box border
    });

    it('should output ASCII art box for get operation', async () => {
      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'get',
      });

      const text = getTextContent(result);
      expect(text).toMatch(/[╔┌]/); // ASCII box border
    });

    it('should output ASCII art box for check operation', async () => {
      await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'set',
        spellName: 'Bless',
      });

      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'check',
        damage: 10,
        manualRoll: 15,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/[╔┌]/); // ASCII box border
      expect(text).toContain('CONCENTRATION');
    });

    it('should show dramatic messaging for concentration break', async () => {
      await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'set',
        spellName: 'Dominate Person',
      });

      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'check',
        damage: 40, // DC 20
        manualRoll: 5, // Fail badly
      });

      const text = getTextContent(result);
      expect(text).toContain('BROKEN');
    });
  });

  // ============================================================
  // ERROR HANDLING
  // ============================================================

  describe('Error Handling', () => {
    it('should require characterId', async () => {
      const result = await handleToolCall('manage_concentration', {
        operation: 'get',
      });

      expect(result.isError).toBe(true);
    });

    it('should require operation', async () => {
      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
      });

      expect(result.isError).toBe(true);
    });

    it('should reject invalid operation', async () => {
      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'invalid',
      });

      expect(result.isError).toBe(true);
    });
  });

  // ============================================================
  // INTEGRATION - With Conditions
  // ============================================================

  describe('Integration with Conditions', () => {
    it('should break concentration when incapacitated condition is added', async () => {
      // This test documents the expected behavior when integrated with manage_condition
      // The actual integration would happen in manage_condition or a hook system

      // For now, just verify manual break works
      await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'set',
        spellName: 'Moonbeam',
      });

      // Simulate what would happen when incapacitated
      const result = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'break',
        reason: 'Became incapacitated',
      });

      const text = getTextContent(result);
      expect(text).toContain('Moonbeam');
      expect(text).toContain('BROKEN'); // All caps in output
    });
  });

  // ============================================================
  // MULTIPLE CASTERS - Separate tracking
  // ============================================================

  describe('Multiple Casters', () => {
    it('should track concentration separately for each caster', async () => {
      // Wizard concentrates on Hold Person
      await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'set',
        spellName: 'Hold Person',
      });

      // Cleric concentrates on Spirit Guardians
      await handleToolCall('manage_concentration', {
        characterId: 'test-cleric-1',
        operation: 'set',
        spellName: 'Spirit Guardians',
      });

      // Check wizard's concentration
      const wizardResult = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'get',
      });
      expect(getTextContent(wizardResult)).toContain('Hold Person');

      // Check cleric's concentration
      const clericResult = await handleToolCall('manage_concentration', {
        characterId: 'test-cleric-1',
        operation: 'get',
      });
      expect(getTextContent(clericResult)).toContain('Spirit Guardians');
    });

    it('should only break the specific caster\'s concentration', async () => {
      // Both concentrating
      await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'set',
        spellName: 'Fly',
      });
      await handleToolCall('manage_concentration', {
        characterId: 'test-cleric-1',
        operation: 'set',
        spellName: 'Bless',
      });

      // Break wizard's concentration only
      await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'break',
      });

      // Wizard should not be concentrating
      const wizardResult = await handleToolCall('manage_concentration', {
        characterId: 'test-wizard-1',
        operation: 'get',
      });
      expect(getTextContent(wizardResult)).toContain('Not concentrating');

      // Cleric should still be concentrating
      const clericResult = await handleToolCall('manage_concentration', {
        characterId: 'test-cleric-1',
        operation: 'get',
      });
      expect(getTextContent(clericResult)).toContain('Bless');
    });
  });
});
