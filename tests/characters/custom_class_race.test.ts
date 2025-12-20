/**
 * @fileoverview Custom Class and Race Tests
 * 
 * Tests the flexible homebrew/non-D&D system support:
 * - Custom classes with custom hit dice, spellcasting, and resources
 * - Custom races with ability bonuses, traits, and defenses
 * - Integration with spell slot system
 * - Integration with rest mechanics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Clean up test characters
const testCharIds: string[] = [];

function getDataDir() {
  return process.env.MCP_DATA_DIR || path.join(process.cwd(), 'data');
}

afterEach(async () => {
  // Clean up any created characters
  const dataDir = path.join(getDataDir(), 'characters');
  for (const id of testCharIds) {
    const filePath = path.join(dataDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  testCharIds.length = 0;
});

/**
 * Helper to extract character ID from output
 */
function extractCharacterId(text: string): string | null {
  const match = text.match(/ID:\s*([a-zA-Z0-9-]+)/i);
  return match ? match[1] : null;
}

describe('Custom Classes', () => {
  describe('Custom Class Creation', () => {
    it('should create character with custom class', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Netrunner Jack',
        race: 'Human',
        class: 'Fighter', // Will be overridden by customClass
        level: 5,
        stats: { str: 8, dex: 14, con: 12, int: 18, wis: 10, cha: 14 },
        customClass: {
          name: 'Netrunner',
          hitDie: 6,
          spellcasting: 'full',
          spellcastingAbility: 'int',
          description: 'Hackers who interface directly with cyberspace',
        },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Netrunner'); // Custom class name used
      
      const id = extractCharacterId(text);
      if (id) testCharIds.push(id);
    });

    it('should use custom hit die for HP calculation', async () => {
      // Custom class with d6 hit die vs Fighter's d10
      const result = await handleToolCall('create_character', {
        name: 'Glass Cannon',
        race: 'Human',
        class: 'Scholar',
        level: 5,
        stats: { str: 8, dex: 14, con: 10, int: 18, wis: 14, cha: 10 }, // CON mod = 0
        customClass: {
          name: 'Scholar',
          hitDie: 6,
          spellcasting: 'none',
        },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      
      // Level 5 with d6, CON mod 0:
      // First level: 6 HP, Levels 2-5: 4 * 4 = 16 HP
      // Total: 22 HP
      expect(text).toMatch(/HP.*22|22.*HP/i);
      
      const id = extractCharacterId(text);
      if (id) testCharIds.push(id);
    });

    it('should use custom hit die d12 for tank class', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Bruiser',
        race: 'Human',
        class: 'Berserker',
        level: 5,
        stats: { str: 18, dex: 10, con: 16, int: 8, wis: 10, cha: 8 }, // CON mod = +3
        customClass: {
          name: 'Berserker',
          hitDie: 12,
          spellcasting: 'none',
          resourceName: 'Rage',
          resourceMax: 2,
          resourceScaling: 'none',
        },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      
      // Level 5 with d12, CON mod +3:
      // First level: 12 + 3 = 15 HP
      // Levels 2-5: 4 * (7 + 3) = 40 HP
      // Total: 55 HP
      expect(text).toMatch(/HP.*55|55.*HP/i);
      
      const id = extractCharacterId(text);
      if (id) testCharIds.push(id);
    });
  });

  describe('Custom Spellcasting', () => {
    it('should grant full caster spell slots to custom class', async () => {
      const createResult = await handleToolCall('create_character', {
        name: 'Psion Prime',
        race: 'Human',
        class: 'Psion',
        level: 5,
        stats: { str: 8, dex: 12, con: 14, int: 18, wis: 14, cha: 10 },
        customClass: {
          name: 'Psion',
          hitDie: 6,
          spellcasting: 'full',
          spellcastingAbility: 'int',
        },
      });

      const createText = getTextContent(createResult);
      const id = extractCharacterId(createText);
      expect(id).not.toBeNull();
      if (id) testCharIds.push(id);

      // View spell slots - should have full caster progression at level 5
      const slotsResult = await handleToolCall('manage_spell_slots', {
        characterId: id,
        operation: 'view',
      });

      const slotsText = getTextContent(slotsResult);
      expect(slotsResult.isError).toBeUndefined();
      expect(slotsText).toMatch(/1st.*4|4.*1st/i); // 4 first-level slots
      expect(slotsText).toMatch(/2nd.*3|3.*2nd/i); // 3 second-level slots
      expect(slotsText).toMatch(/3rd.*2|2.*3rd/i); // 2 third-level slots
    });

    it('should grant half caster spell slots to custom class', async () => {
      const createResult = await handleToolCall('create_character', {
        name: 'Battle Mage',
        race: 'Human',
        class: 'Battle Mage',
        level: 5,
        stats: { str: 16, dex: 12, con: 14, int: 14, wis: 10, cha: 8 },
        customClass: {
          name: 'Battle Mage',
          hitDie: 10,
          spellcasting: 'half',
          spellcastingAbility: 'int',
        },
      });

      const createText = getTextContent(createResult);
      const id = extractCharacterId(createText);
      expect(id).not.toBeNull();
      if (id) testCharIds.push(id);

      // View spell slots - should have half caster progression at level 5
      const slotsResult = await handleToolCall('manage_spell_slots', {
        characterId: id,
        operation: 'view',
      });

      const slotsText = getTextContent(slotsResult);
      expect(slotsResult.isError).toBeUndefined();
      expect(slotsText).toMatch(/1st.*4|4.*1st/i); // 4 first-level slots
      expect(slotsText).toMatch(/2nd.*2|2.*2nd/i); // 2 second-level slots
    });

    it('should expend spell slots for custom spellcaster', async () => {
      const createResult = await handleToolCall('create_character', {
        name: 'Techno Mage',
        race: 'Human',
        class: 'Technomancer',
        level: 3,
        stats: { str: 8, dex: 14, con: 12, int: 18, wis: 10, cha: 12 },
        customClass: {
          name: 'Technomancer',
          hitDie: 8,
          spellcasting: 'full',
          spellcastingAbility: 'int',
        },
      });

      const createText = getTextContent(createResult);
      const id = extractCharacterId(createText);
      if (id) testCharIds.push(id);

      // Expend a spell slot
      const expendResult = await handleToolCall('manage_spell_slots', {
        characterId: id,
        operation: 'expend',
        slotLevel: 1,
      });

      const expendText = getTextContent(expendResult);
      expect(expendResult.isError).toBeUndefined();
      expect(expendText).toContain('EXPENDED');
    });
  });

  describe('Custom Resources', () => {
    it('should track custom resource (Ki Points)', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Shadow Monk',
        race: 'Human',
        class: 'Shadow Monk',
        level: 5,
        stats: { str: 10, dex: 18, con: 14, int: 10, wis: 16, cha: 8 },
        customClass: {
          name: 'Shadow Monk',
          hitDie: 8,
          spellcasting: 'none',
          resourceName: 'Ki Points',
          resourceMax: 5,
          resourceScaling: 'level', // Ki = level
        },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('KI POINTS');
      
      const id = extractCharacterId(text);
      if (id) testCharIds.push(id);
    });

    it('should scale resource with level', async () => {
      // Level 10 character with level-scaling resource
      const result = await handleToolCall('create_character', {
        name: 'Ki Master',
        race: 'Human',
        class: 'Ki Master',
        level: 10,
        stats: { str: 10, dex: 18, con: 14, int: 10, wis: 18, cha: 8 },
        customClass: {
          name: 'Ki Master',
          hitDie: 8,
          spellcasting: 'none',
          resourceName: 'Ki Points',
          resourceMax: 1, // Base 1 + (level - 1) = level
          resourceScaling: 'level',
        },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should have 10 ki points at level 10 (1 base + 9 from scaling)
      expect(text).toMatch(/10.*10|10\/10/); // 10/10 in some format
      
      const id = extractCharacterId(text);
      if (id) testCharIds.push(id);
    });
  });
});

describe('Custom Races', () => {
  describe('Custom Race Creation', () => {
    it('should create character with custom race', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Unit-7',
        race: 'Human', // Will be overridden by customRace
        class: 'Fighter',
        level: 1,
        stats: { str: 14, dex: 12, con: 14, int: 14, wis: 10, cha: 8 },
        customRace: {
          name: 'Android',
          abilityBonuses: { con: 2, int: 1 },
          speed: 30,
          traits: ['Synthetic Body', 'Logic Core', 'Tireless'],
          conditionImmunities: ['poisoned'],
          resistances: ['poison'],
          darkvision: 60,
          description: 'Artificial beings with human-like consciousness',
        },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Android'); // Custom race name used
      expect(text).toContain('RACIAL TRAITS');
      expect(text).toContain('Synthetic Body');
      
      const id = extractCharacterId(text);
      if (id) testCharIds.push(id);
    });

    it('should apply racial ability bonuses', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Strong Orc',
        race: 'Orc',
        class: 'Fighter',
        level: 1,
        stats: { str: 15, dex: 10, con: 14, int: 8, wis: 10, cha: 8 },
        customRace: {
          name: 'Orc',
          abilityBonuses: { str: 2, con: 1 },
          speed: 30,
          traits: ['Aggressive', 'Powerful Build'],
        },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // STR: 15 + 2 = 17, CON: 14 + 1 = 15
      expect(text).toContain('17'); // STR after bonus
      expect(text).toContain('15'); // CON after bonus
      
      const id = extractCharacterId(text);
      if (id) testCharIds.push(id);
    });

    it('should merge racial resistances and immunities', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Fire Genasi',
        race: 'Genasi',
        class: 'Fighter',
        level: 1,
        stats: { str: 14, dex: 10, con: 16, int: 10, wis: 12, cha: 8 },
        resistances: ['slashing'], // Character-level resistance
        customRace: {
          name: 'Fire Genasi',
          abilityBonuses: { con: 2 },
          resistances: ['fire'], // Racial resistance
          traits: ['Fire Walk', 'Reach to the Blaze'],
        },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should have both resistances
      expect(text).toMatch(/fire/i);
      expect(text).toMatch(/slashing/i);
      
      const id = extractCharacterId(text);
      if (id) testCharIds.push(id);
    });

    it('should use racial speed override', async () => {
      const result = await handleToolCall('create_character', {
        name: 'Swift Tabaxi',
        race: 'Tabaxi',
        class: 'Rogue',
        level: 1,
        speed: 30, // Default will be overridden
        stats: { str: 10, dex: 18, con: 12, int: 12, wis: 14, cha: 14 },
        customRace: {
          name: 'Tabaxi',
          abilityBonuses: { dex: 2, cha: 1 },
          speed: 35, // Faster than standard
          traits: ['Feline Agility', 'Cat Claws'],
          darkvision: 60,
        },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('35'); // Speed should be 35
      
      const id = extractCharacterId(text);
      if (id) testCharIds.push(id);
    });
  });
});

describe('Custom Class + Race Integration', () => {
  it('should create fully custom character (Cyberpunk style)', async () => {
    const result = await handleToolCall('create_character', {
      name: 'Johnny Silverhand',
      race: 'Human',
      class: 'Solo',
      level: 8,
      stats: { str: 14, dex: 16, con: 14, int: 12, wis: 10, cha: 16 },
      customClass: {
        name: 'Solo',
        hitDie: 10,
        spellcasting: 'none',
        primaryAbility: 'dex',
        resourceName: 'Edge',
        resourceMax: 3,
        resourceScaling: 'half',
        description: 'Street samurai and mercenaries',
      },
      customRace: {
        name: 'Cyborg',
        abilityBonuses: { str: 1, dex: 1 },
        traits: ['Chrome Implants', 'Neural Interface', 'Targeting System'],
        resistances: ['poison'],
        darkvision: 60,
        description: 'Humans augmented with cybernetic enhancements',
      },
    });

    const text = getTextContent(result);
    expect(result.isError).toBeUndefined();
    expect(text).toContain('Solo'); // Class
    expect(text).toContain('Cyborg'); // Race
    expect(text).toContain('EDGE'); // Resource
    expect(text).toContain('Chrome Implants'); // Trait
    
    const id = extractCharacterId(text);
    if (id) testCharIds.push(id);
  });

  it('should support fantasy homebrew (Blood Hunter style)', async () => {
    const result = await handleToolCall('create_character', {
      name: 'Geralt',
      race: 'Human',
      class: 'Witcher',
      level: 5,
      stats: { str: 14, dex: 16, con: 16, int: 14, wis: 12, cha: 10 },
      customClass: {
        name: 'Witcher',
        hitDie: 10,
        spellcasting: 'third', // Limited magic like signs
        spellcastingAbility: 'int',
        resourceName: 'Toxicity',
        resourceMax: 3,
        resourceScaling: 'none',
        description: 'Monster hunters mutated through alchemy',
      },
      customRace: {
        name: 'Mutant Human',
        abilityBonuses: { con: 2, dex: 1 },
        traits: ['Enhanced Senses', 'Poison Resistance', 'Slow Aging'],
        resistances: ['poison'],
        darkvision: 60,
      },
    });

    const text = getTextContent(result);
    expect(result.isError).toBeUndefined();
    expect(text).toContain('Witcher');
    expect(text).toContain('Mutant Human');
    expect(text).toContain('TOXICITY');
    
    const id = extractCharacterId(text);
    if (id) testCharIds.push(id);

    // Verify third-caster spell slots
    const slotsResult = await handleToolCall('manage_spell_slots', {
      characterId: id,
      operation: 'view',
    });

    const slotsText = getTextContent(slotsResult);
    expect(slotsResult.isError).toBeUndefined();
    // Third caster at level 5 should have limited slots
    expect(slotsText).toMatch(/1st|2nd/i);
  });
});

describe('Unknown Class Fallback', () => {
  it('should use d8 hit die for unknown classes without customClass', async () => {
    const result = await handleToolCall('create_character', {
      name: 'Mystery Man',
      race: 'Human',
      class: 'Mysterion', // Unknown class, no customClass
      level: 5,
      stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, // All CON mod = 0
    });

    const text = getTextContent(result);
    expect(result.isError).toBeUndefined();
    
    // Level 5 with d8 (default), CON mod 0:
    // First level: 8 HP, Levels 2-5: 4 * 5 = 20 HP
    // Total: 28 HP
    expect(text).toMatch(/HP.*28|28.*HP/i);
    
    const id = extractCharacterId(text);
    if (id) testCharIds.push(id);
  });

  it('should treat unknown class as non-caster without customClass', async () => {
    const createResult = await handleToolCall('create_character', {
      name: 'Non Magic Guy',
      race: 'Human',
      class: 'Commoner',
      level: 3,
      stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    });

    const createText = getTextContent(createResult);
    const id = extractCharacterId(createText);
    if (id) testCharIds.push(id);

    const slotsResult = await handleToolCall('manage_spell_slots', {
      characterId: id,
      operation: 'view',
    });

    const slotsText = getTextContent(slotsResult);
    expect(slotsResult.isError).toBeUndefined();
    expect(slotsText).toMatch(/no spell slots/i);
  });
});
