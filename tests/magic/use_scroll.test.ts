/**
 * use_scroll Tests - TDD Red Phase
 *
 * Use a spell scroll in D&D 5e:
 * - If spell is on your class list and same/lower level: auto-success
 * - If spell is higher level: Arcana check DC 10 + spell level
 * - On failure: scroll is consumed with no effect
 * - On success: spell is cast from scroll, scroll consumed
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';

describe('use_scroll', () => {
  // ============================================================
  // BASIC USAGE - Spell within caster level
  // ============================================================

  describe('Basic Scroll Usage', () => {
    it('should use a scroll successfully when spell level <= caster level', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Fireball',
        spellLevel: 3,
        casterLevel: 5,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Fireball');
      expect(text).toMatch(/success|cast/i);
      expect(text).toContain('consumed');
    });

    it('should record the spell name and level', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Lightning Bolt',
        spellLevel: 3,
        casterLevel: 5,
      });

      const text = getTextContent(result);
      expect(text).toContain('Lightning Bolt');
      expect(text).toContain('3');
    });

    it('should work for cantrips (level 0)', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Fire Bolt',
        spellLevel: 0,
        casterLevel: 1,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Fire Bolt');
    });

    it('should auto-succeed when spell level equals caster level', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Cone of Cold',
        spellLevel: 5,
        casterLevel: 5,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/success|cast/i);
    });
  });

  // ============================================================
  // ARCANA CHECK - Higher level spells
  // ============================================================

  describe('Arcana Check for Higher Level Spells', () => {
    it('should require Arcana check when spell level > caster level', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Power Word Kill',
        spellLevel: 9,
        casterLevel: 5,
        arcanaBonus: 5,
        manualRoll: 15, // 15 + 5 = 20 vs DC 19 (10 + 9)
      });

      const text = getTextContent(result);
      expect(text).toContain('Arcana');
      expect(text).toContain('DC 19'); // 10 + spell level 9
    });

    it('should succeed Arcana check when roll meets DC', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Disintegrate',
        spellLevel: 6,
        casterLevel: 3,
        arcanaBonus: 4,
        manualRoll: 12, // 12 + 4 = 16 vs DC 16 (10 + 6)
      });

      const text = getTextContent(result);
      expect(text).toMatch(/success|cast/i);
      expect(text).toContain('consumed');
    });

    it('should fail Arcana check when roll below DC', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Meteor Swarm',
        spellLevel: 9,
        casterLevel: 5,
        arcanaBonus: 3,
        manualRoll: 5, // 5 + 3 = 8 vs DC 19 (10 + 9)
      });

      const text = getTextContent(result);
      expect(text).toMatch(/fail|fizzle/i);
      expect(text).toContain('consumed'); // Scroll still consumed on failure
    });

    it('should show roll details for Arcana check', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Chain Lightning',
        spellLevel: 6,
        casterLevel: 4,
        arcanaBonus: 7,
        manualRoll: 10,
      });

      const text = getTextContent(result);
      expect(text).toContain('10'); // The roll
      expect(text).toContain('+7'); // The modifier
      expect(text).toContain('17'); // The total
    });
  });

  // ============================================================
  // TARGETING
  // ============================================================

  describe('Targeting', () => {
    it('should accept a single target', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Hold Person',
        spellLevel: 2,
        casterLevel: 5,
        targetId: 'goblin-1',
      });

      const text = getTextContent(result);
      expect(text).toContain('goblin-1');
    });

    it('should accept multiple targets', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Mass Cure Wounds',
        spellLevel: 5,
        casterLevel: 9,
        targetIds: ['fighter-1', 'cleric-1', 'rogue-1'],
      });

      const text = getTextContent(result);
      expect(text).toContain('fighter-1');
      expect(text).toContain('cleric-1');
      expect(text).toContain('rogue-1');
    });

    it('should accept a target position for AoE spells', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Fireball',
        spellLevel: 3,
        casterLevel: 5,
        targetPosition: { x: 30, y: 40, z: 0 },
      });

      const text = getTextContent(result);
      expect(text).toMatch(/30.*40|position/i);
    });
  });

  // ============================================================
  // SPELL PROPERTIES
  // ============================================================

  describe('Spell Properties', () => {
    it('should use default save DC based on spell level', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Fireball',
        spellLevel: 3,
        casterLevel: 5,
      });

      const text = getTextContent(result);
      // Scroll save DC = 8 + proficiency (based on minimum caster level) + spellcasting mod
      // For a 3rd level scroll: minimum caster level 5, so DC 13 is typical
      expect(text).toMatch(/DC \d+|save/i);
    });

    it('should use default attack bonus based on spell level', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Scorching Ray',
        spellLevel: 2,
        casterLevel: 5,
        isAttackSpell: true,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/attack|\+\d+/i);
    });

    it('should optionally specify spell school', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Counterspell',
        spellLevel: 3,
        casterLevel: 5,
        spellSchool: 'abjuration',
      });

      const text = getTextContent(result);
      expect(text).toMatch(/abjuration/i);
    });
  });

  // ============================================================
  // OUTPUT FORMAT
  // ============================================================

  describe('Output Format', () => {
    it('should output ASCII art box', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Magic Missile',
        spellLevel: 1,
        casterLevel: 3,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/[╔┌]/); // ASCII box border
    });

    it('should show dramatic success message', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Wish',
        spellLevel: 9,
        casterLevel: 17,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/SCROLL|CAST|SUCCESS/i);
    });

    it('should show dramatic failure message', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Time Stop',
        spellLevel: 9,
        casterLevel: 3,
        arcanaBonus: 0,
        manualRoll: 1, // Critical fail
      });

      const text = getTextContent(result);
      expect(text).toMatch(/FAIL|FIZZLE|LOST/i);
    });
  });

  // ============================================================
  // ERROR HANDLING
  // ============================================================

  describe('Error Handling', () => {
    it('should require characterId', async () => {
      const result = await handleToolCall('use_scroll', {
        scrollName: 'Scroll of Fireball',
        spellLevel: 3,
        casterLevel: 5,
      });

      expect(result.isError).toBe(true);
    });

    it('should require scrollName', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        spellLevel: 3,
        casterLevel: 5,
      });

      expect(result.isError).toBe(true);
    });

    it('should require spellLevel', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Fireball',
        casterLevel: 5,
      });

      expect(result.isError).toBe(true);
    });

    it('should validate spellLevel range (0-9)', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Super Spell',
        spellLevel: 10,
        casterLevel: 20,
      });

      expect(result.isError).toBe(true);
    });

    it('should require casterLevel', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Fireball',
        spellLevel: 3,
      });

      expect(result.isError).toBe(true);
    });
  });

  // ============================================================
  // SCROLL SAVE DC AND ATTACK BONUS BY LEVEL
  // ============================================================

  describe('Scroll Statistics by Level', () => {
    // Per DMG: Scroll stats vary by spell level
    // Level 0-1: Save DC 13, Attack +5
    // Level 2: Save DC 13, Attack +5
    // Level 3: Save DC 15, Attack +7
    // etc.

    it('should use correct stats for 1st level scroll', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Burning Hands',
        spellLevel: 1,
        casterLevel: 5,
      });

      const text = getTextContent(result);
      expect(text).toContain('DC 13');
    });

    it('should use correct stats for 3rd level scroll', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Fireball',
        spellLevel: 3,
        casterLevel: 5,
      });

      const text = getTextContent(result);
      expect(text).toContain('DC 15');
    });

    it('should use correct stats for 5th level scroll', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Cone of Cold',
        spellLevel: 5,
        casterLevel: 9,
      });

      const text = getTextContent(result);
      expect(text).toContain('DC 17');
    });
  });

  // ============================================================
  // ADVANTAGE/DISADVANTAGE ON ARCANA CHECK
  // ============================================================

  describe('Advantage/Disadvantage', () => {
    it('should support advantage on Arcana check', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Power Word Stun',
        spellLevel: 8,
        casterLevel: 5,
        arcanaBonus: 5,
        rollMode: 'advantage',
        manualRolls: [5, 18], // Takes 18, total 23 vs DC 18
      });

      const text = getTextContent(result);
      expect(text).toContain('advantage');
      expect(text).toMatch(/success|cast/i);
    });

    it('should support disadvantage on Arcana check', async () => {
      const result = await handleToolCall('use_scroll', {
        characterId: 'wizard-1',
        scrollName: 'Scroll of Dominate Monster',
        spellLevel: 8,
        casterLevel: 5,
        arcanaBonus: 5,
        rollMode: 'disadvantage',
        manualRolls: [18, 5], // Takes 5, total 10 vs DC 18
      });

      const text = getTextContent(result);
      expect(text).toContain('disadvantage');
      expect(text).toMatch(/fail|fizzle/i);
    });
  });
});
