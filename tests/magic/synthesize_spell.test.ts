/**
 * synthesize_spell Tests - TDD Red Phase
 *
 * Arcane Synthesis for improvised magic in D&D 5e:
 * - Caster proposes a custom spell effect
 * - Arcana check DC = 10 + (level × 2) + modifiers
 * - Success creates temporary spell effect
 * - Failure may cause mishaps
 */

import { describe, it, expect } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';

describe('synthesize_spell', () => {
  // ============================================================
  // BASIC SYNTHESIS - Simple spell creation
  // ============================================================

  describe('Basic Spell Synthesis', () => {
    it('should synthesize a simple damage spell', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'I want to create a burst of arcane energy',
        proposedSpell: {
          name: 'Arcane Burst',
          level: 2,
          school: 'evocation',
          effect: {
            type: 'damage',
            damage: '3d6',
            damageType: 'force',
          },
          range: 60,
        },
        arcanaBonus: 7,
        manualRoll: 15, // 15 + 7 = 22 vs DC 14 (10 + 2×2)
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Arcane Burst');
      expect(text).toContain('evocation');
    });

    it('should synthesize a healing spell', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'cleric-1',
        intent: 'Channel divine energy to mend wounds',
        proposedSpell: {
          name: 'Divine Mending',
          level: 1,
          school: 'evocation',
          effect: {
            type: 'healing',
            healing: '2d8',
          },
          range: 30,
        },
        arcanaBonus: 5,
        manualRoll: 10, // 10 + 5 = 15 vs DC 12 (10 + 1×2)
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Divine Mending');
      expect(text).toContain('healing');
    });

    it('should synthesize a control spell with condition', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Trap enemies in magical bindings',
        proposedSpell: {
          name: 'Arcane Shackles',
          level: 3,
          school: 'conjuration',
          effect: {
            type: 'control',
            condition: 'restrained',
          },
          range: 60,
          savingThrow: {
            ability: 'dex',
            dc: 15,
          },
        },
        arcanaBonus: 8,
        manualRoll: 12, // 12 + 8 = 20 vs DC 16 (10 + 3×2)
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Arcane Shackles');
      expect(text).toContain('restrained');
    });

    it('should synthesize a utility spell', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Create a floating disk to carry items',
        proposedSpell: {
          name: 'Arcane Platform',
          level: 1,
          school: 'conjuration',
          effect: {
            type: 'utility',
          },
          range: 30,
          duration: '1 hour',
        },
        arcanaBonus: 6,
        manualRoll: 10, // 10 + 6 = 16 vs DC 12 (10 + 1×2)
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Arcane Platform');
      expect(text).toContain('utility');
    });
  });

  // ============================================================
  // ARCANA CHECK DC CALCULATION
  // ============================================================

  describe('Arcana Check DC Calculation', () => {
    it('should calculate DC as 10 + (level × 2) for level 1', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Simple light spell',
        proposedSpell: {
          name: 'Glow',
          level: 1,
          school: 'evocation',
          effect: { type: 'utility' },
          range: 0,
        },
        arcanaBonus: 0,
        manualRoll: 12, // DC 12 (10 + 1×2)
      });

      const text = getTextContent(result);
      expect(text).toContain('DC 12');
      expect(text).toMatch(/success/i);
    });

    it('should calculate DC for level 5 spell', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Powerful elemental blast',
        proposedSpell: {
          name: 'Elemental Nova',
          level: 5,
          school: 'evocation',
          effect: {
            type: 'damage',
            damage: '8d6',
            damageType: 'fire',
          },
          range: 120,
        },
        arcanaBonus: 10,
        manualRoll: 10, // 10 + 10 = 20 vs DC 20 (10 + 5×2)
      });

      const text = getTextContent(result);
      expect(text).toContain('DC 20');
    });

    it('should calculate DC for level 9 spell', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Reality-warping magic',
        proposedSpell: {
          name: 'Reality Warp',
          level: 9,
          school: 'transmutation',
          effect: { type: 'utility' },
          range: 300,
        },
        arcanaBonus: 15,
        manualRoll: 13, // 13 + 15 = 28 vs DC 28 (10 + 9×2)
      });

      const text = getTextContent(result);
      expect(text).toContain('DC 28');
    });
  });

  // ============================================================
  // CIRCUMSTANCE MODIFIERS
  // ============================================================

  describe('Circumstance Modifiers', () => {
    it('should apply ley line bonus (reduces DC by 2)', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Channel ley line energy',
        proposedSpell: {
          name: 'Ley Bolt',
          level: 3,
          school: 'evocation',
          effect: {
            type: 'damage',
            damage: '4d10',
            damageType: 'force',
          },
          range: 120,
        },
        nearLeyLine: true,
        arcanaBonus: 5,
        manualRoll: 9, // 9 + 5 = 14 vs DC 14 (16 - 2 for ley line)
      });

      const text = getTextContent(result);
      expect(text).toContain('ley line');
      expect(text).toContain('DC 14'); // Reduced from 16
    });

    it('should apply desperation bonus (+2 to roll, but mishap on failure)', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Desperate magical defense',
        proposedSpell: {
          name: 'Last Resort',
          level: 2,
          school: 'abjuration',
          effect: { type: 'utility' },
          range: 0,
        },
        desperationBonus: true,
        arcanaBonus: 3,
        manualRoll: 7, // 7 + 3 + 2 = 12 vs DC 14
      });

      const text = getTextContent(result);
      expect(text).toContain('Desperation'); // Capital D in output
    });

    it('should apply material component value bonus', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Ritual with expensive components',
        proposedSpell: {
          name: 'Greater Binding',
          level: 4,
          school: 'conjuration',
          effect: { type: 'control', condition: 'restrained' },
          range: 30,
        },
        materialComponentValue: 500, // 500gp = DC -2
        arcanaBonus: 6,
        manualRoll: 10, // 10 + 6 = 16 vs DC 16 (18 - 2)
      });

      const text = getTextContent(result);
      expect(text).toContain('500');
    });
  });

  // ============================================================
  // SUCCESS & MASTERY LEVELS
  // ============================================================

  describe('Success and Mastery Levels', () => {
    it('should grant basic success when meeting DC', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Create a fireball',
        proposedSpell: {
          name: 'Improvised Fireball',
          level: 3,
          school: 'evocation',
          effect: {
            type: 'damage',
            damage: '6d6',
            damageType: 'fire',
          },
          range: 150,
          area: { shape: 'sphere', size: 20 },
        },
        arcanaBonus: 6,
        manualRoll: 10, // 10 + 6 = 16 vs DC 16, exactly meets
      });

      const text = getTextContent(result);
      expect(text).toMatch(/success/i);
    });

    it('should grant enhanced success when beating DC by 5+', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Perfect arcane bolt',
        proposedSpell: {
          name: 'Perfect Bolt',
          level: 2,
          school: 'evocation',
          effect: {
            type: 'damage',
            damage: '3d8',
            damageType: 'lightning',
          },
          range: 120,
        },
        arcanaBonus: 8,
        manualRoll: 15, // 15 + 8 = 23 vs DC 14, beats by 9
      });

      const text = getTextContent(result);
      expect(text).toMatch(/enhanced|mastery|exceptional/i);
    });

    it('should grant critical success on natural 20', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Channel pure arcane power',
        proposedSpell: {
          name: 'Arcane Perfection',
          level: 5,
          school: 'evocation',
          effect: {
            type: 'damage',
            damage: '10d6',
            damageType: 'force',
          },
          range: 300,
        },
        arcanaBonus: 5,
        manualRoll: 20, // Natural 20
      });

      const text = getTextContent(result);
      expect(text).toMatch(/critical|perfect|flawless/i);
    });
  });

  // ============================================================
  // FAILURE & MISHAPS
  // ============================================================

  describe('Failure and Mishaps', () => {
    it('should fail when below DC', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Attempt complex magic',
        proposedSpell: {
          name: 'Overreach',
          level: 7,
          school: 'evocation',
          effect: {
            type: 'damage',
            damage: '12d6',
            damageType: 'fire',
          },
          range: 150,
        },
        arcanaBonus: 5,
        manualRoll: 8, // 8 + 5 = 13 vs DC 24 (10 + 7×2)
      });

      const text = getTextContent(result);
      expect(text).toMatch(/fail/i);
    });

    it('should cause mishap on natural 1', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Risky spell attempt',
        proposedSpell: {
          name: 'Dangerous Gambit',
          level: 3,
          school: 'evocation',
          effect: {
            type: 'damage',
            damage: '5d6',
            damageType: 'fire',
          },
          range: 60,
        },
        arcanaBonus: 10,
        manualRoll: 1, // Natural 1 = mishap
      });

      const text = getTextContent(result);
      expect(text).toMatch(/mishap|backfire|surge/i);
    });

    it('should cause enhanced mishap on desperation failure', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Desperate and risky',
        proposedSpell: {
          name: 'Reckless Power',
          level: 4,
          school: 'evocation',
          effect: {
            type: 'damage',
            damage: '6d8',
            damageType: 'fire',
          },
          range: 60,
        },
        desperationBonus: true,
        arcanaBonus: 2,
        manualRoll: 5, // 5 + 2 + 2 = 9 vs DC 18, fail with desperation
      });

      const text = getTextContent(result);
      expect(text).toMatch(/mishap|backfire|severe/i);
    });
  });

  // ============================================================
  // AREA OF EFFECT
  // ============================================================

  describe('Area of Effect Spells', () => {
    it('should support sphere AoE', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Create an explosion',
        proposedSpell: {
          name: 'Arcane Explosion',
          level: 3,
          school: 'evocation',
          effect: {
            type: 'damage',
            damage: '5d6',
            damageType: 'thunder',
          },
          range: 120,
          area: { shape: 'sphere', size: 20 },
        },
        arcanaBonus: 8,
        manualRoll: 10,
      });

      const text = getTextContent(result);
      expect(text).toContain('sphere');
      expect(text).toContain('20');
    });

    it('should support cone AoE', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Breathe frost',
        proposedSpell: {
          name: 'Frost Breath',
          level: 2,
          school: 'evocation',
          effect: {
            type: 'damage',
            damage: '4d6',
            damageType: 'cold',
          },
          range: 0, // Self
          area: { shape: 'cone', size: 30 },
        },
        arcanaBonus: 6,
        manualRoll: 12,
      });

      const text = getTextContent(result);
      expect(text).toContain('cone');
      expect(text).toContain('30');
    });

    it('should support line AoE', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Lightning bolt line',
        proposedSpell: {
          name: 'Arc Lightning',
          level: 3,
          school: 'evocation',
          effect: {
            type: 'damage',
            damage: '6d6',
            damageType: 'lightning',
          },
          range: 0,
          area: { shape: 'line', size: 100 },
        },
        arcanaBonus: 7,
        manualRoll: 11,
      });

      const text = getTextContent(result);
      expect(text).toContain('line');
      expect(text).toContain('100');
    });
  });

  // ============================================================
  // CONCENTRATION SPELLS
  // ============================================================

  describe('Concentration Spells', () => {
    it('should mark spell as concentration', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Sustained protective barrier',
        proposedSpell: {
          name: 'Arcane Barrier',
          level: 2,
          school: 'abjuration',
          effect: { type: 'utility' },
          range: 0,
          concentration: true,
          duration: '10 minutes',
        },
        arcanaBonus: 6,
        manualRoll: 12,
      });

      const text = getTextContent(result);
      expect(text).toContain('Concentration'); // Capital C in output
      expect(text).toContain('10 minutes');
    });
  });

  // ============================================================
  // SPELL SCHOOLS
  // ============================================================

  describe('Spell Schools', () => {
    it('should handle all valid spell schools', async () => {
      const schools = [
        'abjuration',
        'conjuration',
        'divination',
        'enchantment',
        'evocation',
        'illusion',
        'necromancy',
        'transmutation',
      ];

      for (const school of schools) {
        const result = await handleToolCall('synthesize_spell', {
          casterId: 'wizard-1',
          intent: `Test ${school} spell`,
          proposedSpell: {
            name: `Test ${school}`,
            level: 1,
            school,
            effect: { type: 'utility' },
            range: 30,
          },
          arcanaBonus: 10,
          manualRoll: 15,
        });

        expect(result.isError).toBeUndefined();
      }
    });
  });

  // ============================================================
  // ENCOUNTER CONTEXT
  // ============================================================

  describe('Encounter Context', () => {
    it('should accept optional encounterId', async () => {
      const result = await handleToolCall('synthesize_spell', {
        encounterId: 'battle-1',
        casterId: 'wizard-1',
        intent: 'Combat improvisation',
        proposedSpell: {
          name: 'Desperate Strike',
          level: 2,
          school: 'evocation',
          effect: {
            type: 'damage',
            damage: '3d8',
            damageType: 'force',
          },
          range: 60,
        },
        arcanaBonus: 6,
        manualRoll: 12,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('battle-1');
    });
  });

  // ============================================================
  // OUTPUT FORMAT
  // ============================================================

  describe('Output Format', () => {
    it('should output ASCII art box', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Create light',
        proposedSpell: {
          name: 'Glow',
          level: 1,
          school: 'evocation',
          effect: { type: 'utility' },
          range: 30,
        },
        arcanaBonus: 5,
        manualRoll: 10,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/[╔┌]/); // ASCII box border
    });

    it('should show roll details', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Test roll display',
        proposedSpell: {
          name: 'Test Spell',
          level: 2,
          school: 'evocation',
          effect: { type: 'utility' },
          range: 30,
        },
        arcanaBonus: 7,
        manualRoll: 12,
      });

      const text = getTextContent(result);
      expect(text).toContain('12'); // The roll
      expect(text).toContain('+7'); // The modifier
      expect(text).toContain('19'); // The total
    });

    it('should show spell details on success', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Create fireball',
        proposedSpell: {
          name: 'Improvised Fireball',
          level: 3,
          school: 'evocation',
          effect: {
            type: 'damage',
            damage: '6d6',
            damageType: 'fire',
          },
          range: 150,
          area: { shape: 'sphere', size: 20 },
          savingThrow: { ability: 'dex', dc: 15 },
        },
        arcanaBonus: 10,
        manualRoll: 15,
      });

      const text = getTextContent(result);
      expect(text).toContain('Improvised Fireball');
      expect(text).toContain('6d6');
      expect(text).toContain('fire');
      expect(text).toContain('150');
      expect(text).toContain('DEX');
      expect(text).toContain('DC 15');
    });
  });

  // ============================================================
  // ADVANTAGE/DISADVANTAGE
  // ============================================================

  describe('Advantage and Disadvantage', () => {
    it('should support advantage on Arcana check', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Familiar-assisted casting',
        proposedSpell: {
          name: 'Guided Spell',
          level: 2,
          school: 'evocation',
          effect: { type: 'utility' },
          range: 30,
        },
        arcanaBonus: 5,
        rollMode: 'advantage',
        manualRolls: [8, 15], // Takes 15
      });

      const text = getTextContent(result);
      expect(text).toContain('advantage');
    });

    it('should support disadvantage on Arcana check', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Distracted casting',
        proposedSpell: {
          name: 'Shaky Spell',
          level: 2,
          school: 'evocation',
          effect: { type: 'utility' },
          range: 30,
        },
        arcanaBonus: 5,
        rollMode: 'disadvantage',
        manualRolls: [15, 8], // Takes 8
      });

      const text = getTextContent(result);
      expect(text).toContain('disadvantage');
    });
  });

  // ============================================================
  // ERROR HANDLING
  // ============================================================

  describe('Error Handling', () => {
    it('should require casterId', async () => {
      const result = await handleToolCall('synthesize_spell', {
        intent: 'Create a spell',
        proposedSpell: {
          name: 'Test',
          level: 1,
          school: 'evocation',
          effect: { type: 'utility' },
          range: 30,
        },
      });

      expect(result.isError).toBe(true);
    });

    it('should require intent', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        proposedSpell: {
          name: 'Test',
          level: 1,
          school: 'evocation',
          effect: { type: 'utility' },
          range: 30,
        },
      });

      expect(result.isError).toBe(true);
    });

    it('should require proposedSpell', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Create a spell',
      });

      expect(result.isError).toBe(true);
    });

    it('should validate spell level (1-9)', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Create a spell',
        proposedSpell: {
          name: 'Invalid',
          level: 10,
          school: 'evocation',
          effect: { type: 'utility' },
          range: 30,
        },
      });

      expect(result.isError).toBe(true);
    });

    it('should validate spell school', async () => {
      const result = await handleToolCall('synthesize_spell', {
        casterId: 'wizard-1',
        intent: 'Create a spell',
        proposedSpell: {
          name: 'Invalid',
          level: 1,
          school: 'invalid_school',
          effect: { type: 'utility' },
          range: 30,
        },
      });

      expect(result.isError).toBe(true);
    });
  });
});
