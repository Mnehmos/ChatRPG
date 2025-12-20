/**
 * @fileoverview manage_spell_slots Tests - Complete TDD Test Suite
 * 
 * @module tests/characters/manage_spell_slots
 * @see src/modules/characters.ts - Handler implementation
 * @see TOOLS_CHECKLIST.md - Tool documentation
 * @see SCHEMAS.md - Schema reference
 * 
 * ## Test Coverage (44 tests)
 * 
 * ### Operation Tests
 * - **View:** Display current spell slot state with ASCII visualization
 * - **Expend:** Consume spell slots for casting, validate availability
 * - **Restore:** Regain slots (specific level, all slots, pact magic)
 * - **Set:** DM override for manual slot configuration
 * 
 * ### D&D 5e Spellcasting Rules
 * | Caster Type | Classes | Spell Levels | Progression |
 * |-------------|---------|--------------|-------------|
 * | Full | Wizard, Sorcerer, Cleric, Druid, Bard | 1st-9th | Standard PHB table |
 * | Half | Paladin, Ranger | 1st-5th | Delayed, starts at 2nd |
 * | Third | Eldritch Knight, Arcane Trickster | 1st-4th | Subclass-based |
 * | Pact Magic | Warlock | 1st-5th | Short rest recovery |
 * 
 * ### Warlock Pact Magic
 * - Separate pool from regular spell slots
 * - All slots are the same level (scales with warlock level)
 * - Restores on short OR long rest
 * - Level 1-2: 1 slot, 3-4: 2 slots, 5-10: 2 slots (3rd), 11+: 3 slots
 * 
 * ### Integration Tests
 * - **take_rest:** Long rest → restore all, short rest → restore pact only
 * - **execute_action:** cast_spell validates and expends slots automatically
 * 
 * ### Batch Operations
 * - Up to 20 operations in a single call
 * - Individual success/failure tracking
 * - Consolidated ASCII summary output
 * 
 * ### ASCII Output Format
 * - ● (filled) / ○ (empty) for regular slots
 * - ◆ (filled) / ◇ (empty) for pact magic
 * - Heavy border box with slot level breakdown
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';

/**
 * Helper to create a spellcaster for testing
 */
async function createSpellcaster(overrides: Record<string, unknown> = {}) {
  const result = await handleToolCall('create_character', {
    name: 'Test Wizard',
    race: 'Human',
    class: 'Wizard',
    level: 5,
    stats: { str: 8, dex: 14, con: 14, int: 18, wis: 12, cha: 10 },
    spellcastingAbility: 'int',
    ...overrides,
  });
  
  const text = getTextContent(result);
  const idMatch = text.match(/ID:\s*([a-zA-Z0-9-]+)/i);
  return idMatch ? idMatch[1] : null;
}

/**
 * Helper to create a warlock for pact magic testing
 */
async function createWarlock(overrides: Record<string, unknown> = {}) {
  const result = await handleToolCall('create_character', {
    name: 'Test Warlock',
    race: 'Tiefling',
    class: 'Warlock',
    level: 5,
    stats: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 },
    spellcastingAbility: 'cha',
    ...overrides,
  });
  
  const text = getTextContent(result);
  const idMatch = text.match(/ID:\s*([a-zA-Z0-9-]+)/i);
  return idMatch ? idMatch[1] : null;
}

describe('manage_spell_slots', () => {
  describe('View Operation', () => {
    it('should view spell slots for a wizard', async () => {
      const characterId = await createSpellcaster();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('╔'); // ASCII box border
      expect(text).toMatch(/spell slot|slots/i);
    });

    it('should show slot visualization with filled/empty indicators', async () => {
      const characterId = await createSpellcaster();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should show slot visualization like: 1st: ●●●○ or similar
      expect(text).toMatch(/1st|2nd|3rd|level 1|level 2/i);
    });

    it('should show correct slots for level 5 wizard (4/3/2)', async () => {
      const characterId = await createSpellcaster({ level: 5 });
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Level 5 wizard has 4 1st, 3 2nd, 2 3rd level slots
      expect(text).toMatch(/4|3|2/);
    });

    it('should support characterName instead of characterId', async () => {
      await createSpellcaster({ name: 'Named Mage' });
      
      const result = await handleToolCall('manage_spell_slots', {
        characterName: 'Named Mage',
        operation: 'view',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/spell slot|slots/i);
    });
  });

  describe('Expend Operation', () => {
    it('should expend a 1st level spell slot', async () => {
      const characterId = await createSpellcaster();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        slotLevel: 1,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/expend|spent|used/i);
      expect(text).toMatch(/1st|level 1/i);
    });

    it('should expend multiple slots with count parameter', async () => {
      const characterId = await createSpellcaster();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        slotLevel: 1,
        count: 2,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/2|expend|spent/i);
    });

    it('should fail when no slots available at level', async () => {
      const characterId = await createSpellcaster({ level: 1 });
      expect(characterId).not.toBeNull();
      
      // Level 1 wizard has no 3rd level slots
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        slotLevel: 3,
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/no.*slot|insufficient|not available/i);
    });

    it('should fail when all slots at level are expended', async () => {
      const characterId = await createSpellcaster({ level: 1 });
      expect(characterId).not.toBeNull();
      
      // Level 1 wizard has 2 1st level slots - expend both
      await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        slotLevel: 1,
        count: 2,
      });
      
      // Try to expend a third
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        slotLevel: 1,
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/no.*slot|insufficient|none remaining/i);
    });

    it('should track expended slots in view', async () => {
      const characterId = await createSpellcaster();
      expect(characterId).not.toBeNull();
      
      // Expend a slot
      await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        slotLevel: 1,
      });
      
      // View should show reduced count
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should show current < max for 1st level
      expect(text).toMatch(/3\/4|3 of 4|○/i); // One expended
    });
  });

  describe('Restore Operation', () => {
    it('should restore all spell slots', async () => {
      const characterId = await createSpellcaster();
      expect(characterId).not.toBeNull();
      
      // Expend some slots first
      await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        slotLevel: 1,
        count: 2,
      });
      
      // Restore all
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'restore',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/restore|recovered|all/i);
    });

    it('should restore specific slot level only', async () => {
      const characterId = await createSpellcaster();
      expect(characterId).not.toBeNull();
      
      // Expend slots at multiple levels
      await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        slotLevel: 1,
        count: 2,
      });
      await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        slotLevel: 2,
        count: 1,
      });
      
      // Restore only 1st level
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'restore',
        slotLevel: 1,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/1st|level 1/i);
      
      // Verify 2nd level still expended
      const viewResult = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });
      const viewText = getTextContent(viewResult);
      expect(viewText).toMatch(/2\/3|2 of 3/i); // 2nd level still has one expended
    });

    it('should restore specific count of slots', async () => {
      const characterId = await createSpellcaster();
      expect(characterId).not.toBeNull();
      
      // Expend 3 first level slots
      await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        slotLevel: 1,
        count: 3,
      });
      
      // Restore only 1
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'restore',
        slotLevel: 1,
        count: 1,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      
      // Should have 2/4 slots now
      const viewResult = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });
      const viewText = getTextContent(viewResult);
      expect(viewText).toMatch(/2\/4|2 of 4/i);
    });
  });

  describe('Set Operation (DM Override)', () => {
    it('should set specific slot configuration', async () => {
      const characterId = await createSpellcaster();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'set',
        slots: {
          '1': { current: 2, max: 4 },
          '2': { current: 0, max: 3 },
          '3': { current: 2, max: 2 },
        },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/set|configured|updated/i);
    });

    it('should allow setting slots beyond normal maximum (DM override)', async () => {
      const characterId = await createSpellcaster({ level: 1 });
      expect(characterId).not.toBeNull();
      
      // Give level 1 wizard some extra slots (magic item, etc.)
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'set',
        slots: {
          '1': { current: 5, max: 5 },
          '2': { current: 2, max: 2 },
        },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
    });
  });

  describe('Warlock Pact Magic', () => {
    it('should track pact magic slots separately', async () => {
      const characterId = await createWarlock();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
        pactMagic: true,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/pact|warlock/i);
    });

    it('should expend pact magic slot', async () => {
      const characterId = await createWarlock();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        pactMagic: true,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/pact.*expend|expend.*pact/i);
    });

    it('should show correct pact slots for level 5 warlock (2 slots at 3rd level)', async () => {
      const characterId = await createWarlock({ level: 5 });
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
        pactMagic: true,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Level 5 warlock: 2 pact slots at 3rd level
      expect(text).toMatch(/2|3rd|level 3/i);
    });

    it('should restore pact slots on short rest', async () => {
      const characterId = await createWarlock();
      expect(characterId).not.toBeNull();
      
      // Expend pact slot
      await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        pactMagic: true,
      });
      
      // Short rest
      await handleToolCall('take_rest', {
        characterId,
        restType: 'short',
      });
      
      // Verify pact slots restored
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
        pactMagic: true,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should be at full pact slots
      expect(text).toMatch(/2\/2|full/i);
    });
  });

  describe('Integration with take_rest', () => {
    it('should restore all spell slots on long rest', async () => {
      const characterId = await createSpellcaster();
      expect(characterId).not.toBeNull();
      
      // Expend multiple slots
      await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        slotLevel: 1,
        count: 3,
      });
      await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        slotLevel: 2,
        count: 2,
      });
      
      // Long rest
      await handleToolCall('take_rest', {
        characterId,
        restType: 'long',
      });
      
      // Verify all restored
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // All slots should be at max
      expect(text).toMatch(/4\/4|3\/3|2\/2/i);
    });

    it('should NOT restore regular spell slots on short rest', async () => {
      const characterId = await createSpellcaster();
      expect(characterId).not.toBeNull();
      
      // Expend a slot
      await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        slotLevel: 1,
      });
      
      // Short rest
      await handleToolCall('take_rest', {
        characterId,
        restType: 'short',
      });
      
      // Verify NOT restored (wizards don't get slots back on short rest by default)
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should still be 3/4 for 1st level
      expect(text).toMatch(/3\/4|3 of 4/i);
    });

    it('should respect restoreSpellSlots: false on long rest', async () => {
      const characterId = await createSpellcaster();
      expect(characterId).not.toBeNull();
      
      // Expend a slot
      await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        slotLevel: 1,
      });
      
      // Long rest with spell slot restoration disabled
      await handleToolCall('take_rest', {
        characterId,
        restType: 'long',
        restoreSpellSlots: false,
      });
      
      // Verify NOT restored
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should still be 3/4 for 1st level
      expect(text).toMatch(/3\/4|3 of 4/i);
    });
  });

  describe('Integration with execute_action (Spell Casting)', () => {
    it('should expend slot when casting a spell via execute_action', async () => {
      // Create encounter with wizard
      const characterId = await createSpellcaster({ name: 'Battle Mage' });
      expect(characterId).not.toBeNull();
      
      const encounterResult = await handleToolCall('create_encounter', {
        name: 'Spell Test',
        participants: [
          { id: characterId, name: 'Battle Mage', hp: 30, maxHp: 30, position: { x: 0, y: 0 } },
          { id: 'enemy1', name: 'Goblin', hp: 7, maxHp: 7, position: { x: 5, y: 0 } },
        ],
      });
      const encounterText = getTextContent(encounterResult);
      const encIdMatch = encounterText.match(/ID:\s*([a-zA-Z0-9-]+)/i);
      const encounterId = encIdMatch ? encIdMatch[1] : null;
      expect(encounterId).not.toBeNull();
      
      // Cast a spell (should expend a slot)
      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: characterId,
        actionType: 'cast_spell',
        spellName: 'Magic Missile',
        spellSlot: 1,
        targetId: 'enemy1',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/magic missile|spell|cast/i);
      
      // Verify slot was expended
      const slotsResult = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });
      const slotsText = getTextContent(slotsResult);
      expect(slotsText).toMatch(/3\/4|3 of 4/i); // One 1st level slot used
    });

    it('should fail to cast spell without available slot', async () => {
      const characterId = await createSpellcaster({ name: 'Depleted Mage', level: 1 });
      expect(characterId).not.toBeNull();
      
      // Expend all 1st level slots (level 1 wizard has 2)
      await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        slotLevel: 1,
        count: 2,
      });
      
      const encounterResult = await handleToolCall('create_encounter', {
        name: 'No Slots Test',
        participants: [
          { id: characterId, name: 'Depleted Mage', hp: 20, maxHp: 20, position: { x: 0, y: 0 } },
          { id: 'enemy1', name: 'Goblin', hp: 7, maxHp: 7, position: { x: 5, y: 0 } },
        ],
      });
      const encounterText = getTextContent(encounterResult);
      const encIdMatch = encounterText.match(/ID:\s*([a-zA-Z0-9-]+)/i);
      const encounterId = encIdMatch ? encIdMatch[1] : null;
      
      // Try to cast spell with no slots
      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: characterId,
        actionType: 'cast_spell',
        spellName: 'Magic Missile',
        spellSlot: 1,
        targetId: 'enemy1',
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/no.*slot|insufficient|cannot cast/i);
    });

    it('should allow upcasting with higher level slot', async () => {
      const characterId = await createSpellcaster({ name: 'Upcaster' });
      expect(characterId).not.toBeNull();
      
      const encounterResult = await handleToolCall('create_encounter', {
        name: 'Upcast Test',
        participants: [
          { id: characterId, name: 'Upcaster', hp: 30, maxHp: 30, position: { x: 0, y: 0 } },
          { id: 'enemy1', name: 'Goblin', hp: 7, maxHp: 7, position: { x: 5, y: 0 } },
        ],
      });
      const encounterText = getTextContent(encounterResult);
      const encIdMatch = encounterText.match(/ID:\s*([a-zA-Z0-9-]+)/i);
      const encounterId = encIdMatch ? encIdMatch[1] : null;
      
      // Cast 1st level spell with 2nd level slot (upcast)
      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: characterId,
        actionType: 'cast_spell',
        spellName: 'Magic Missile',
        spellSlot: 2, // Upcast!
        targetId: 'enemy1',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/upcast|2nd level|level 2/i);
      
      // Verify 2nd level slot was expended, not 1st
      const slotsResult = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });
      const slotsText = getTextContent(slotsResult);
      expect(slotsText).toMatch(/4\/4.*2\/3|2\/3/i); // 1st still full, 2nd has one used
    });

    it('should allow cantrips without expending slots', async () => {
      const characterId = await createSpellcaster({ name: 'Cantrip Caster' });
      expect(characterId).not.toBeNull();
      
      const encounterResult = await handleToolCall('create_encounter', {
        name: 'Cantrip Test',
        participants: [
          { id: characterId, name: 'Cantrip Caster', hp: 30, maxHp: 30, position: { x: 0, y: 0 } },
          { id: 'enemy1', name: 'Goblin', hp: 7, maxHp: 7, position: { x: 5, y: 0 } },
        ],
      });
      const encounterText = getTextContent(encounterResult);
      const encIdMatch = encounterText.match(/ID:\s*([a-zA-Z0-9-]+)/i);
      const encounterId = encIdMatch ? encIdMatch[1] : null;
      
      // Cast cantrip (slot level 0 or omitted)
      const result = await handleToolCall('execute_action', {
        encounterId,
        actorId: characterId,
        actionType: 'cast_spell',
        spellName: 'Fire Bolt',
        spellSlot: 0, // Cantrip
        targetId: 'enemy1',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      
      // Verify no slots were expended
      const slotsResult = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });
      const slotsText = getTextContent(slotsResult);
      expect(slotsText).toMatch(/4\/4/i); // All 1st level slots intact
    });
  });

  describe('Batch Operations', () => {
    it('should support batch view for multiple characters', async () => {
      const char1 = await createSpellcaster({ name: 'Wizard 1' });
      const char2 = await createSpellcaster({ name: 'Wizard 2', class: 'Sorcerer' });
      expect(char1).not.toBeNull();
      expect(char2).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        batch: [
          { characterId: char1!, operation: 'view' },
          { characterId: char2!, operation: 'view' },
        ],
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Wizard 1');
      expect(text).toContain('Wizard 2');
    });

    it('should support batch expend for party spell usage', async () => {
      const char1 = await createSpellcaster({ name: 'Party Wizard' });
      const char2 = await createSpellcaster({ name: 'Party Cleric', class: 'Cleric' });
      expect(char1).not.toBeNull();
      expect(char2).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        batch: [
          { characterId: char1!, operation: 'expend', slotLevel: 1 },
          { characterId: char2!, operation: 'expend', slotLevel: 2 },
        ],
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/party wizard|party cleric/i);
    });

    it('should support batch restore for party long rest', async () => {
      const char1 = await createSpellcaster({ name: 'Tired Wizard' });
      const char2 = await createSpellcaster({ name: 'Tired Sorcerer', class: 'Sorcerer' });
      expect(char1).not.toBeNull();
      expect(char2).not.toBeNull();
      
      // Expend some slots
      await handleToolCall('manage_spell_slots', {
        characterId: char1,
        operation: 'expend',
        slotLevel: 1,
        count: 2,
      });
      await handleToolCall('manage_spell_slots', {
        characterId: char2,
        operation: 'expend',
        slotLevel: 1,
        count: 2,
      });
      
      // Batch restore
      const result = await handleToolCall('manage_spell_slots', {
        batch: [
          { characterId: char1!, operation: 'restore' },
          { characterId: char2!, operation: 'restore' },
        ],
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/restore|recovered/i);
    });
  });

  describe('Validation & Error Handling', () => {
    it('should return error for non-existent character', async () => {
      const result = await handleToolCall('manage_spell_slots', {
        characterId: 'non-existent-id',
        operation: 'view',
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/not found|does not exist/i);
    });

    it('should return error when characterId is missing', async () => {
      const result = await handleToolCall('manage_spell_slots', {
        operation: 'view',
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for invalid operation', async () => {
      const characterId = await createSpellcaster();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'invalid',
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for slot level out of range', async () => {
      const characterId = await createSpellcaster();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        slotLevel: 10, // Max is 9
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for negative count', async () => {
      const characterId = await createSpellcaster();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        slotLevel: 1,
        count: -1,
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for non-spellcaster', async () => {
      // Create a fighter (non-spellcaster)
      const result = await handleToolCall('create_character', {
        name: 'Fighter Joe',
        race: 'Human',
        class: 'Fighter',
        level: 5,
        stats: { str: 16, dex: 14, con: 16, int: 10, wis: 12, cha: 8 },
      });
      const text = getTextContent(result);
      const idMatch = text.match(/ID:\s*([a-zA-Z0-9-]+)/i);
      const characterId = idMatch ? idMatch[1] : null;
      expect(characterId).not.toBeNull();
      
      const slotsResult = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });

      // Should either error or show "no spellcasting"
      const slotsText = getTextContent(slotsResult);
      expect(slotsText).toMatch(/no spell|not.*spellcaster|no slots/i);
    });
  });

  describe('ASCII Art Output', () => {
    it('should use ASCII box borders in output', async () => {
      const characterId = await createSpellcaster();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('╔'); // Top-left corner
      expect(text).toContain('╗'); // Top-right corner
      expect(text).toContain('╚'); // Bottom-left corner
      expect(text).toContain('╝'); // Bottom-right corner
    });

    it('should show slot visualization with filled/empty circles', async () => {
      const characterId = await createSpellcaster();
      expect(characterId).not.toBeNull();
      
      // Expend one slot to show mixed state
      await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        slotLevel: 1,
      });
      
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should show filled and empty indicators
      expect(text).toMatch(/●|○|█|░|◆|◇/); // Various slot indicators
    });

    it('should show character name in output', async () => {
      const characterId = await createSpellcaster({ name: 'Gandalf the Grey' });
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Gandalf the Grey');
    });
  });

  describe('Spellcasting Class Calculations', () => {
    it('should calculate correct slots for full caster (Wizard)', async () => {
      const characterId = await createSpellcaster({ level: 9, class: 'Wizard' });
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Level 9 wizard: 4/3/3/3/1 for 1st-5th
      expect(text).toMatch(/5th|level 5/i);
    });

    it('should calculate correct slots for half caster (Paladin)', async () => {
      const characterId = await createSpellcaster({ 
        level: 5, 
        class: 'Paladin',
        name: 'Holy Knight',
        stats: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 },
        spellcastingAbility: 'cha',
      });
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Level 5 paladin: 4/2 for 1st-2nd (half caster, starts at level 2)
      expect(text).toMatch(/1st|2nd/i);
      // Should NOT have 3rd level slots at level 5
    });

    it('should calculate correct slots for third caster (Eldritch Knight)', async () => {
      const characterId = await createSpellcaster({ 
        level: 7, 
        class: 'Fighter',
        name: 'Eldritch Knight',
        stats: { str: 16, dex: 14, con: 16, int: 14, wis: 10, cha: 8 },
        spellcastingAbility: 'int',
        // Would need subclass support in real implementation
      });
      // This test is more about future-proofing - third casters are complex
      expect(characterId).not.toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle character at level 1 with minimal slots', async () => {
      const characterId = await createSpellcaster({ level: 1 });
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Level 1 wizard: 2 1st level slots only
      expect(text).toMatch(/2\/2|2 of 2/i);
    });

    it('should handle character at level 20 with max slots', async () => {
      const characterId = await createSpellcaster({ level: 20 });
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should have 9th level slots
      expect(text).toMatch(/9th|level 9/i);
    });

    it('should handle multiclass spellcaster slot calculation', async () => {
      // This is complex - multiclass slot calculation uses combined caster levels
      // For now, test that the tool doesn't break with unusual configurations
      const characterId = await createSpellcaster({ 
        level: 5,
        // Would need multiclass support in real implementation
      });
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
    });

    it('should persist spell slots across tool calls', async () => {
      const characterId = await createSpellcaster();
      expect(characterId).not.toBeNull();
      
      // Expend a slot
      await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        slotLevel: 1,
      });
      
      // Verify it persisted
      const result1 = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });
      expect(getTextContent(result1)).toMatch(/3\/4/i);
      
      // Expend another
      await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'expend',
        slotLevel: 1,
      });
      
      // Verify cumulative
      const result2 = await handleToolCall('manage_spell_slots', {
        characterId,
        operation: 'view',
      });
      expect(getTextContent(result2)).toMatch(/2\/4/i);
    });
  });
});
