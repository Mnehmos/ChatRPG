/**
 * manage_aura Tests - TDD Red Phase
 *
 * Operations:
 * - create: Create new aura centered on character (Spirit Guardians, etc.)
 * - process: Process aura effects for targets in range
 * - remove: Remove an aura by ID
 * - list: List active auras
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';

describe('manage_aura', () => {
  // Clear auras between tests
  beforeEach(async () => {
    // Remove any existing auras
    const listResult = await handleToolCall('manage_aura', {
      operation: 'list',
    }).catch(() => ({ content: [{ type: 'text', text: '' }] }));

    // Clear them one by one if any exist
    const text = getTextContent(listResult);
    const auraIdMatch = text.match(/ID: (aura-[\w-]+)/g);
    if (auraIdMatch) {
      for (const match of auraIdMatch) {
        const id = match.replace('ID: ', '');
        await handleToolCall('manage_aura', {
          operation: 'remove',
          auraId: id,
        }).catch(() => {});
      }
    }
  });

  // ============================================================
  // CREATE OPERATION - Create new aura
  // ============================================================

  describe('Create Aura', () => {
    it('should create an aura with basic parameters', async () => {
      const result = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
        radius: 15,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Spirit Guardians');
      expect(text).toContain('cleric-1');
      expect(text).toContain('15');
    });

    it('should generate a unique aura ID', async () => {
      const result = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
        radius: 15,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/aura-[\w-]+/);
    });

    it('should accept damage parameters', async () => {
      const result = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
        radius: 15,
        damage: '3d8',
        damageType: 'radiant',
        saveDC: 15,
        saveAbility: 'wis',
        halfOnSave: true,
      });

      const text = getTextContent(result);
      expect(text).toContain('3d8');
      expect(text).toContain('radiant');
      expect(text).toContain('DC 15');
      expect(text).toContain('WIS');
    });

    it('should accept duration in rounds', async () => {
      const result = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'wizard-1',
        spellName: 'Cloudkill',
        radius: 20,
        duration: 10,
      });

      const text = getTextContent(result);
      expect(text).toContain('10');
      expect(text).toMatch(/round|duration/i);
    });

    it('should accept condition effects', async () => {
      const result = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'bard-1',
        spellName: 'Aura of Vitality',
        radius: 30,
        effect: 'healing',
        healing: '2d6',
      });

      const text = getTextContent(result);
      expect(text).toContain('Aura of Vitality');
      expect(text).toContain('Healing'); // Capital H in output
    });

    it('should track friendly/hostile targeting', async () => {
      const result = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
        radius: 15,
        affectsEnemies: true,
        affectsAllies: false,
      });

      const text = getTextContent(result);
      expect(text).toContain('enemies');
    });

    it('should require ownerId for create', async () => {
      const result = await handleToolCall('manage_aura', {
        operation: 'create',
        spellName: 'Spirit Guardians',
        radius: 15,
      });

      expect(result.isError).toBe(true);
    });

    it('should require spellName for create', async () => {
      const result = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        radius: 15,
      });

      expect(result.isError).toBe(true);
    });

    it('should require radius for create', async () => {
      const result = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
      });

      expect(result.isError).toBe(true);
    });
  });

  // ============================================================
  // LIST OPERATION - List active auras
  // ============================================================

  describe('List Auras', () => {
    it('should list all active auras', async () => {
      // Create two auras
      await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
        radius: 15,
      });

      await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'paladin-1',
        spellName: 'Aura of Protection',
        radius: 10,
      });

      const result = await handleToolCall('manage_aura', {
        operation: 'list',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Spirit Guardians');
      expect(text).toContain('Aura of Protection');
    });

    it('should indicate when no auras are active', async () => {
      const result = await handleToolCall('manage_aura', {
        operation: 'list',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/no.*aura|empty/i);
    });

    it('should filter by ownerId if provided', async () => {
      await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
        radius: 15,
      });

      await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'paladin-1',
        spellName: 'Aura of Protection',
        radius: 10,
      });

      const result = await handleToolCall('manage_aura', {
        operation: 'list',
        ownerId: 'cleric-1',
      });

      const text = getTextContent(result);
      expect(text).toContain('Spirit Guardians');
      expect(text).not.toContain('Aura of Protection');
    });

    it('should show aura details including radius and effects', async () => {
      await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
        radius: 15,
        damage: '3d8',
        damageType: 'radiant',
      });

      const result = await handleToolCall('manage_aura', {
        operation: 'list',
      });

      const text = getTextContent(result);
      expect(text).toContain('15');
      expect(text).toContain('3d8');
      expect(text).toContain('radiant');
    });
  });

  // ============================================================
  // REMOVE OPERATION - Remove an aura
  // ============================================================

  describe('Remove Aura', () => {
    it('should remove an aura by ID', async () => {
      // Create an aura
      const createResult = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
        radius: 15,
      });

      const createText = getTextContent(createResult);
      const auraIdMatch = createText.match(/aura-[\w-]+/);
      expect(auraIdMatch).not.toBeNull();
      const auraId = auraIdMatch![0];

      // Remove it
      const removeResult = await handleToolCall('manage_aura', {
        operation: 'remove',
        auraId,
      });

      const removeText = getTextContent(removeResult);
      expect(removeResult.isError).toBeUndefined();
      expect(removeText).toContain('Spirit Guardians');
      expect(removeText).toMatch(/removed|ended/i);
    });

    it('should handle removing non-existent aura', async () => {
      const result = await handleToolCall('manage_aura', {
        operation: 'remove',
        auraId: 'aura-nonexistent',
      });

      const text = getTextContent(result);
      expect(text).toMatch(/not found|does not exist/i);
    });

    it('should require auraId for remove', async () => {
      const result = await handleToolCall('manage_aura', {
        operation: 'remove',
      });

      expect(result.isError).toBe(true);
    });

    it('should optionally specify reason for removal', async () => {
      const createResult = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
        radius: 15,
      });

      const auraIdMatch = getTextContent(createResult).match(/aura-[\w-]+/);
      const auraId = auraIdMatch![0];

      const removeResult = await handleToolCall('manage_aura', {
        operation: 'remove',
        auraId,
        reason: 'Concentration broken',
      });

      const text = getTextContent(removeResult);
      expect(text).toContain('Concentration broken');
    });
  });

  // ============================================================
  // PROCESS OPERATION - Process aura effects
  // ============================================================

  describe('Process Aura', () => {
    it('should process damage for targets in range', async () => {
      // Create a damage aura
      const createResult = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
        radius: 15,
        damage: '3d8',
        damageType: 'radiant',
        saveDC: 15,
        saveAbility: 'wis',
        halfOnSave: true,
      });

      const auraIdMatch = getTextContent(createResult).match(/aura-[\w-]+/);
      const auraId = auraIdMatch![0];

      // Process with targets
      const result = await handleToolCall('manage_aura', {
        operation: 'process',
        auraId,
        targets: [
          { targetId: 'goblin-1', distance: 10 },
          { targetId: 'goblin-2', distance: 5 },
        ],
        manualDamageRolls: [8, 6, 4], // 3d8 = 18 damage
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('goblin-1');
      expect(text).toContain('goblin-2');
      expect(text).toMatch(/damage|radiant/i);
    });

    it('should skip targets outside radius', async () => {
      const createResult = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
        radius: 15,
        damage: '3d8',
        damageType: 'radiant',
      });

      const auraIdMatch = getTextContent(createResult).match(/aura-[\w-]+/);
      const auraId = auraIdMatch![0];

      const result = await handleToolCall('manage_aura', {
        operation: 'process',
        auraId,
        targets: [
          { targetId: 'goblin-1', distance: 10 }, // In range
          { targetId: 'goblin-2', distance: 20 }, // Out of range
        ],
      });

      const text = getTextContent(result);
      expect(text).toContain('goblin-1');
      expect(text).toMatch(/out of range|outside|skipped/i);
    });

    it('should apply saving throws when specified', async () => {
      const createResult = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
        radius: 15,
        damage: '3d8',
        damageType: 'radiant',
        saveDC: 15,
        saveAbility: 'wis',
        halfOnSave: true,
      });

      const auraIdMatch = getTextContent(createResult).match(/aura-[\w-]+/);
      const auraId = auraIdMatch![0];

      const result = await handleToolCall('manage_aura', {
        operation: 'process',
        auraId,
        targets: [
          { targetId: 'goblin-1', distance: 10, saveModifier: -1 },
        ],
        manualSaveRolls: [{ targetId: 'goblin-1', roll: 16 }], // 16 - 1 = 15, saves
        manualDamageRolls: [8, 6, 4], // 18 damage, halved to 9 on save
      });

      const text = getTextContent(result);
      expect(text).toContain('DC 15');
      expect(text).toMatch(/save|WIS/i);
    });

    it('should handle healing auras', async () => {
      const createResult = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Aura of Vitality',
        radius: 30,
        effect: 'healing',
        healing: '2d6',
      });

      const auraIdMatch = getTextContent(createResult).match(/aura-[\w-]+/);
      const auraId = auraIdMatch![0];

      const result = await handleToolCall('manage_aura', {
        operation: 'process',
        auraId,
        targets: [
          { targetId: 'fighter-1', distance: 15 },
        ],
        manualHealingRolls: [5, 4], // 2d6 = 9 healing
      });

      const text = getTextContent(result);
      expect(text).toContain('fighter-1');
      expect(text).toMatch(/heal|restore/i);
    });

    it('should require auraId for process', async () => {
      const result = await handleToolCall('manage_aura', {
        operation: 'process',
        targets: [{ targetId: 'goblin-1', distance: 10 }],
      });

      expect(result.isError).toBe(true);
    });

    it('should require targets for process', async () => {
      const createResult = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
        radius: 15,
      });

      const auraIdMatch = getTextContent(createResult).match(/aura-[\w-]+/);
      const auraId = auraIdMatch![0];

      const result = await handleToolCall('manage_aura', {
        operation: 'process',
        auraId,
      });

      expect(result.isError).toBe(true);
    });

    it('should decrement duration when processing', async () => {
      const createResult = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
        radius: 15,
        duration: 10,
        damage: '3d8',
        damageType: 'radiant',
      });

      const auraIdMatch = getTextContent(createResult).match(/aura-[\w-]+/);
      const auraId = auraIdMatch![0];

      await handleToolCall('manage_aura', {
        operation: 'process',
        auraId,
        targets: [{ targetId: 'goblin-1', distance: 10 }],
        decrementDuration: true,
      });

      // Check remaining duration
      const listResult = await handleToolCall('manage_aura', {
        operation: 'list',
      });

      const listText = getTextContent(listResult);
      expect(listText).toContain('9'); // Duration reduced from 10 to 9
    });

    it('should auto-remove aura when duration reaches 0', async () => {
      const createResult = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
        radius: 15,
        duration: 1,
        damage: '3d8',
        damageType: 'radiant',
      });

      const auraIdMatch = getTextContent(createResult).match(/aura-[\w-]+/);
      const auraId = auraIdMatch![0];

      const processResult = await handleToolCall('manage_aura', {
        operation: 'process',
        auraId,
        targets: [{ targetId: 'goblin-1', distance: 10 }],
        decrementDuration: true,
      });

      const processText = getTextContent(processResult);
      expect(processText).toMatch(/expired|ended|duration/i);

      // Verify it's gone
      const listResult = await handleToolCall('manage_aura', {
        operation: 'list',
      });

      const listText = getTextContent(listResult);
      expect(listText).not.toContain('Spirit Guardians');
    });
  });

  // ============================================================
  // OUTPUT FORMAT - ASCII Art
  // ============================================================

  describe('Output Format', () => {
    it('should output ASCII art box for create', async () => {
      const result = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
        radius: 15,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/[╔┌]/); // ASCII box border
    });

    it('should output ASCII art box for list', async () => {
      const result = await handleToolCall('manage_aura', {
        operation: 'list',
      });

      const text = getTextContent(result);
      expect(text).toMatch(/[╔┌]/);
    });

    it('should output ASCII art box for process', async () => {
      const createResult = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
        radius: 15,
        damage: '3d8',
        damageType: 'radiant',
      });

      const auraIdMatch = getTextContent(createResult).match(/aura-[\w-]+/);
      const auraId = auraIdMatch![0];

      const result = await handleToolCall('manage_aura', {
        operation: 'process',
        auraId,
        targets: [{ targetId: 'goblin-1', distance: 10 }],
      });

      const text = getTextContent(result);
      expect(text).toMatch(/[╔┌]/);
    });
  });

  // ============================================================
  // ERROR HANDLING
  // ============================================================

  describe('Error Handling', () => {
    it('should require operation', async () => {
      const result = await handleToolCall('manage_aura', {
        ownerId: 'cleric-1',
      });

      expect(result.isError).toBe(true);
    });

    it('should reject invalid operation', async () => {
      const result = await handleToolCall('manage_aura', {
        operation: 'invalid',
      });

      expect(result.isError).toBe(true);
    });

    it('should handle process on non-existent aura', async () => {
      const result = await handleToolCall('manage_aura', {
        operation: 'process',
        auraId: 'aura-nonexistent',
        targets: [{ targetId: 'goblin-1', distance: 10 }],
      });

      const text = getTextContent(result);
      expect(text).toMatch(/not found|does not exist/i);
    });
  });

  // ============================================================
  // MULTIPLE AURAS
  // ============================================================

  describe('Multiple Auras', () => {
    it('should track multiple auras from same owner', async () => {
      await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
        radius: 15,
      });

      await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Aura of Vitality',
        radius: 30,
      });

      const result = await handleToolCall('manage_aura', {
        operation: 'list',
        ownerId: 'cleric-1',
      });

      const text = getTextContent(result);
      expect(text).toContain('Spirit Guardians');
      expect(text).toContain('Aura of Vitality');
    });

    it('should track multiple auras from different owners', async () => {
      await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
        radius: 15,
      });

      await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'paladin-1',
        spellName: 'Aura of Protection',
        radius: 10,
      });

      const result = await handleToolCall('manage_aura', {
        operation: 'list',
      });

      const text = getTextContent(result);
      expect(text).toContain('cleric-1');
      expect(text).toContain('paladin-1');
    });

    it('should remove only specified aura', async () => {
      const create1 = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'cleric-1',
        spellName: 'Spirit Guardians',
        radius: 15,
      });

      await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'paladin-1',
        spellName: 'Aura of Protection',
        radius: 10,
      });

      const auraId1 = getTextContent(create1).match(/aura-[\w-]+/)![0];

      await handleToolCall('manage_aura', {
        operation: 'remove',
        auraId: auraId1,
      });

      const listResult = await handleToolCall('manage_aura', {
        operation: 'list',
      });

      const text = getTextContent(listResult);
      expect(text).not.toContain('Spirit Guardians');
      expect(text).toContain('Aura of Protection');
    });
  });

  // ============================================================
  // CONDITION APPLICATION
  // ============================================================

  describe('Condition Effects', () => {
    it('should apply conditions to targets when specified', async () => {
      const createResult = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'bard-1',
        spellName: 'Hypnotic Pattern',
        radius: 30,
        condition: 'charmed',
        saveDC: 16,
        saveAbility: 'wis',
      });

      const auraIdMatch = getTextContent(createResult).match(/aura-[\w-]+/);
      const auraId = auraIdMatch![0];

      const result = await handleToolCall('manage_aura', {
        operation: 'process',
        auraId,
        targets: [
          { targetId: 'goblin-1', distance: 15, saveModifier: -1 },
        ],
        manualSaveRolls: [{ targetId: 'goblin-1', roll: 10 }], // Fails DC 16
      });

      const text = getTextContent(result);
      expect(text).toContain('charmed');
      expect(text).toContain('goblin-1');
    });

    it('should not apply condition if save succeeds', async () => {
      const createResult = await handleToolCall('manage_aura', {
        operation: 'create',
        ownerId: 'bard-1',
        spellName: 'Hypnotic Pattern',
        radius: 30,
        condition: 'charmed',
        saveDC: 16,
        saveAbility: 'wis',
      });

      const auraIdMatch = getTextContent(createResult).match(/aura-[\w-]+/);
      const auraId = auraIdMatch![0];

      const result = await handleToolCall('manage_aura', {
        operation: 'process',
        auraId,
        targets: [
          { targetId: 'goblin-1', distance: 15, saveModifier: 2 },
        ],
        manualSaveRolls: [{ targetId: 'goblin-1', roll: 18 }], // 18 + 2 = 20, succeeds
      });

      const text = getTextContent(result);
      expect(text).toMatch(/save|resisted/i);
    });
  });
});
