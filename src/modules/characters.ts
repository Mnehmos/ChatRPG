/**
 * Characters Module - Character Creation & Management
 * Implements D&D 5e character system
 */

import { z } from 'zod';
import {
  createBox,
  createTableRow,
  createDivider,
  formatAbilityScore,
  createStatusBar,
  centerText,
  padText,
  BOX
} from './ascii-art.js';
import {
  AbilitySchema,
  DamageTypeSchema,
  ConditionSchema,
  SkillSchema
} from '../types.js';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as os from 'os';
import { calculateEffectiveStats, getActiveConditions, manageCondition } from './combat.js';
import { parseDice } from './dice.js';

// Use AppData for persistent character storage (cross-session persistence)
const getDataDir = () => {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'rpg-lite-mcp');
  } else {
    // For macOS/Linux, use standard config directory
    return path.join(os.homedir(), '.config', 'rpg-lite-mcp');
  }
};

const DATA_ROOT = getDataDir();

// ============================================================
// CUSTOM CLASS & RACE SCHEMAS
// ============================================================

/**
 * Custom class definition for homebrew/non-D&D systems.
 * Allows complete flexibility in defining class mechanics.
 * 
 * @example
 * // Cyberpunk Netrunner class
 * {
 *   name: 'Netrunner',
 *   hitDie: 6,
 *   spellcasting: 'full', // Uses "spells" as hacking programs
 *   spellcastingAbility: 'int',
 *   primaryAbility: 'int',
 *   saveProficiencies: ['int', 'dex'],
 *   description: 'Hackers who interface directly with the Net'
 * }
 */
export const customClassSchema = z.object({
  /** Class name (e.g., 'Netrunner', 'Blood Hunter', 'Gunslinger') */
  name: z.string().min(1),
  /** Hit die size: d4=4, d6=6, d8=8, d10=10, d12=12 */
  hitDie: z.number().min(4).max(12).default(8),
  /** Spellcasting progression type */
  spellcasting: z.enum(['full', 'half', 'third', 'warlock', 'none']).default('none'),
  /** Ability used for spellcasting (if applicable) */
  spellcastingAbility: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']).optional(),
  /** Primary ability for the class */
  primaryAbility: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']).optional(),
  /** Default saving throw proficiencies */
  saveProficiencies: z.array(z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha'])).optional(),
  /** Flavor text / description */
  description: z.string().optional(),
  /** Custom resource name (e.g., 'Ki Points', 'Rage', 'Superiority Dice') */
  resourceName: z.string().optional(),
  /** Max resource at level 1 (scales by level if resourceScaling provided) */
  resourceMax: z.number().optional(),
  /** How resource scales: 'level' = equals level, 'half' = level/2, number = fixed */
  resourceScaling: z.union([z.enum(['level', 'half', 'third', 'none']), z.number()]).optional(),
});

export type CustomClass = z.infer<typeof customClassSchema>;

/**
 * Custom race definition for homebrew/non-D&D systems.
 * Allows complete flexibility in defining racial traits.
 * 
 * @example
 * // Sci-fi Android race
 * {
 *   name: 'Android',
 *   abilityBonuses: { con: 2, int: 1 },
 *   speed: 30,
 *   traits: ['Synthetic Body', 'Logic Core', 'No Need to Breathe'],
 *   resistances: ['poison'],
 *   conditionImmunities: ['poisoned', 'diseased'],
 *   description: 'Artificial beings with human-like consciousness'
 * }
 */
export const customRaceSchema = z.object({
  /** Race name (e.g., 'Android', 'Genasi', 'Warforged') */
  name: z.string().min(1),
  /** Ability score bonuses (can be negative for weaknesses) */
  abilityBonuses: z.object({
    str: z.number().optional(),
    dex: z.number().optional(),
    con: z.number().optional(),
    int: z.number().optional(),
    wis: z.number().optional(),
    cha: z.number().optional(),
  }).optional(),
  /** Base walking speed in feet */
  speed: z.number().default(30),
  /** Other movement speeds */
  flySpeed: z.number().optional(),
  swimSpeed: z.number().optional(),
  climbSpeed: z.number().optional(),
  /** Racial traits (narrative descriptions) */
  traits: z.array(z.string()).optional(),
  /** Damage resistances */
  resistances: z.array(z.string()).optional(),
  /** Damage immunities */
  immunities: z.array(z.string()).optional(),
  /** Damage vulnerabilities */
  vulnerabilities: z.array(z.string()).optional(),
  /** Condition immunities */
  conditionImmunities: z.array(z.string()).optional(),
  /** Languages known */
  languages: z.array(z.string()).optional(),
  /** Size category */
  size: z.enum(['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']).default('medium'),
  /** Flavor text / description */
  description: z.string().optional(),
  /** Darkvision range in feet (0 = none) */
  darkvision: z.number().default(0),
});

export type CustomRace = z.infer<typeof customRaceSchema>;

// ============================================================
// SCHEMAS
// ============================================================

export const createCharacterSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  race: z.string().default('Human'),
  class: z.string().default('Fighter'),
  level: z.number().min(1, 'Level must be at least 1').max(20, 'Level cannot exceed 20').default(1),
  background: z.string().optional(),
  characterType: z.enum(['pc', 'npc', 'enemy', 'neutral']).default('pc'),
  stats: z.object({
    str: z.number().min(1, 'Ability score must be at least 1').max(30, 'Ability score cannot exceed 30').default(10),
    dex: z.number().min(1, 'Ability score must be at least 1').max(30, 'Ability score cannot exceed 30').default(10),
    con: z.number().min(1, 'Ability score must be at least 1').max(30, 'Ability score cannot exceed 30').default(10),
    int: z.number().min(1, 'Ability score must be at least 1').max(30, 'Ability score cannot exceed 30').default(10),
    wis: z.number().min(1, 'Ability score must be at least 1').max(30, 'Ability score cannot exceed 30').default(10),
    cha: z.number().min(1, 'Ability score must be at least 1').max(30, 'Ability score cannot exceed 30').default(10),
  }).optional(),
  hp: z.number().optional(),
  maxHp: z.number().optional(),
  ac: z.number().default(10),
  speed: z.number().default(30),
  resistances: z.array(DamageTypeSchema).optional(),
  immunities: z.array(DamageTypeSchema).optional(),
  vulnerabilities: z.array(DamageTypeSchema).optional(),
  conditionImmunities: z.array(ConditionSchema).optional(),
  spellcastingAbility: AbilitySchema.optional(),
  knownSpells: z.array(z.string()).optional(),
  preparedSpells: z.array(z.string()).optional(),
  cantrips: z.array(z.string()).optional(),
  skillProficiencies: z.array(SkillSchema).optional(),
  saveProficiencies: z.array(AbilitySchema).optional(),
  equipment: z.array(z.string()).optional(),
  /** Custom class definition (for homebrew/non-D&D games) */
  customClass: customClassSchema.optional(),
  /** Custom race definition (for homebrew/non-D&D games) */
  customRace: customRaceSchema.optional(),
});

export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;

// Single get object
const singleGetSchema = z.object({
  characterId: z.string().min(1).optional(),
  characterName: z.string().min(1).optional(),
}).refine(data => data.characterId || data.characterName, {
  message: 'Either characterId or characterName must be provided',
});

// Support both single and batch get
export const getCharacterSchema = z.union([
  singleGetSchema,
  z.object({
    batch: z.array(singleGetSchema).min(1).max(20),
  }),
]);

export type GetCharacterInput = z.infer<typeof getCharacterSchema>;

// Single update object
const singleUpdateSchema = z.object({
  characterId: z.string().min(1).optional(),
  characterName: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  race: z.string().optional(),
  class: z.string().optional(),
  level: z.number().min(1, 'Level must be at least 1').max(20, 'Level cannot exceed 20').optional(),
  background: z.string().optional(),
  characterType: z.enum(['pc', 'npc', 'enemy', 'neutral']).optional(),
  stats: z.object({
    str: z.number().min(1).max(30).optional(),
    dex: z.number().min(1).max(30).optional(),
    con: z.number().min(1).max(30).optional(),
    int: z.number().min(1).max(30).optional(),
    wis: z.number().min(1).max(30).optional(),
    cha: z.number().min(1).max(30).optional(),
  }).optional(),
  hp: z.union([
    z.string().regex(/^[+-]\d+$/, 'Relative HP must be in format "+5" or "-10"'),
    z.number() // Supports both absolute (positive) and delta (negative) values
  ]).optional(),
  healing: z.number().positive('Healing must be a positive number').optional(),
  maxHp: z.number().min(1).optional(),
  ac: z.number().optional(),
  speed: z.number().optional(),
  resistances: z.array(DamageTypeSchema).optional(),
  immunities: z.array(DamageTypeSchema).optional(),
  vulnerabilities: z.array(DamageTypeSchema).optional(),
  conditionImmunities: z.array(ConditionSchema).optional(),
  spellcastingAbility: AbilitySchema.optional(),
  knownSpells: z.array(z.string()).optional(),
  preparedSpells: z.array(z.string()).optional(),
  cantrips: z.array(z.string()).optional(),
  skillProficiencies: z.array(SkillSchema).optional(),
  saveProficiencies: z.array(AbilitySchema).optional(),
  equipment: z.array(z.string()).optional(),
  /** Update custom class definition */
  customClass: customClassSchema.optional(),
  /** Update custom race definition */
  customRace: customRaceSchema.optional(),
  /** Update custom resource (current value, or full object) */
  resource: z.union([
    z.number(), // Just update current value
    z.object({
      name: z.string().optional(),
      current: z.number().optional(),
      max: z.number().optional(),
    }),
  ]).optional(),
}).refine(data => data.characterId || data.characterName, {
  message: 'Either characterId or characterName must be provided',
});

// Support both single and batch updates
export const updateCharacterSchema = z.union([
  singleUpdateSchema,
  z.object({
    batch: z.array(singleUpdateSchema).min(1).max(20),
  }),
]);

export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;

// Delete character schema - single deletion
const singleDeleteSchema = z.object({
  characterId: z.string().min(1).optional(),
  characterName: z.string().min(1).optional(),
}).refine(data => data.characterId || data.characterName, {
  message: 'Either characterId or characterName must be provided',
});

// Support both single and batch deletes
export const deleteCharacterSchema = z.union([
  singleDeleteSchema,
  z.object({
    batch: z.array(singleDeleteSchema).min(1).max(20),
  }),
]);

export type DeleteCharacterInput = z.infer<typeof deleteCharacterSchema>;

// Single rest input
const singleRestSchema = z.object({
  characterId: z.string().min(1).optional(),
  characterName: z.string().min(1).optional(),
  restType: z.enum(['short', 'long']),
  hitDiceToSpend: z.number().min(0).optional(),
  restoreHp: z.boolean().default(true),
  restoreSpellSlots: z.boolean().default(true),
  restoreHitDice: z.boolean().default(true),
  clearConditions: z.array(z.string()).optional(),
  uninterrupted: z.boolean().default(true),
}).refine(data => data.characterId || data.characterName, {
  message: 'Either characterId or characterName must be provided',
});

export const takeRestSchema = z.union([
  singleRestSchema,
  z.object({
    batch: z.array(singleRestSchema).min(1).max(20),
  }),
]);

export type TakeRestInput = z.infer<typeof singleRestSchema>;

// ============================================================
// SPELL SLOT MANAGEMENT SCHEMA
// ============================================================

/**
 * Single spell slot operation schema.
 * 
 * Supports D&D 5e spell slot management including:
 * - Full casters (Wizard, Sorcerer, Cleric, Druid, Bard)
 * - Half casters (Paladin, Ranger)
 * - Third casters (Eldritch Knight, Arcane Trickster)
 * - Warlock Pact Magic (separate pool, short rest recovery)
 * 
 * @property characterId - Character's unique ID
 * @property characterName - Alternative lookup by name
 * @property operation - Action to perform: view, expend, restore, set
 * @property slotLevel - Spell slot level (1-9) for expend/restore operations
 * @property count - Number of slots to expend/restore (default: 1)
 * @property pactMagic - If true, operate on warlock pact magic slots instead
 * @property slots - DM override: directly set slot configuration { "1": { current, max }, ... }
 */
const singleSpellSlotSchema = z.object({
  characterId: z.string().min(1).optional(),
  characterName: z.string().min(1).optional(),
  operation: z.enum(['view', 'expend', 'restore', 'set']),
  slotLevel: z.number().min(1).max(9).optional(),
  count: z.number().min(1).optional(),
  pactMagic: z.boolean().optional(),
  slots: z.record(z.string(), z.object({
    current: z.number().min(0),
    max: z.number().min(0),
  })).optional(),
}).refine(data => data.characterId || data.characterName, {
  message: 'Either characterId or characterName must be provided',
});

/**
 * Spell slot management schema supporting single or batch operations.
 * 
 * **Single mode:** Pass operation parameters directly.
 * **Batch mode:** Pass `{ batch: [...] }` with array of operations (up to 20).
 * 
 * @see singleSpellSlotSchema for parameter details
 */
export const manageSpellSlotsSchema = z.union([
  singleSpellSlotSchema,
  z.object({
    batch: z.array(singleSpellSlotSchema).min(1).max(20),
  }),
]);

export type ManageSpellSlotsInput = z.infer<typeof singleSpellSlotSchema>;

// ============================================================
// LEVEL UP CONSTANTS
// ============================================================

/** Maximum character level (D&D 5e cap) */
const MAX_CHARACTER_LEVEL = 20;

/** Minimum HP gained per level (D&D 5e rule: always at least 1) */
const MIN_HP_PER_LEVEL = 1;

/** Default HP calculation method */
const DEFAULT_HP_METHOD = 'average' as const;

// ============================================================
// LEVEL UP SCHEMA
// ============================================================

/**
 * Single level-up operation schema.
 * 
 * Handles D&D 5e level advancement:
 * - HP increase by roll, average, max, or manual
 * - Proficiency bonus recalculation
 * - Spell slot updates
 * - Custom resource scaling
 * - Multi-level jumps (e.g., level 1 → 5)
 * 
 * @property characterId - Character's unique ID
 * @property characterName - Alternative lookup by name
 * @property targetLevel - Target level (default: current + 1)
 * @property hpMethod - How to calculate HP gain: 'roll', 'average', 'max', 'manual'
 * @property manualHp - HP gain when hpMethod is 'manual'
 * @property manualRoll - Override d20 roll for testing (1-20)
 * @property newFeatures - New class features gained (narrative tracking)
 * @property newSpells - New spells learned
 */
const singleLevelUpSchema = z.object({
  characterId: z.string().min(1).optional(),
  characterName: z.string().min(1).optional(),
  targetLevel: z.number().min(2).max(20).optional(),
  hpMethod: z.enum(['roll', 'average', 'max', 'manual']).default('average'),
  manualHp: z.number().min(1).optional(),
  manualRoll: z.number().min(1).max(20).optional(),
  newFeatures: z.array(z.string()).optional(),
  newSpells: z.array(z.string()).optional(),
}).refine(data => data.characterId || data.characterName, {
  message: 'Either characterId or characterName must be provided',
}).refine(data => data.hpMethod !== 'manual' || data.manualHp !== undefined, {
  message: 'manualHp is required when hpMethod is "manual"',
});

/**
 * Level-up schema supporting single or batch operations.
 * 
 * **Single mode:** Pass level-up parameters directly.
 * **Batch mode:** Pass `{ batch: [...] }` with array of operations (up to 20).
 */
export const levelUpSchema = z.union([
  singleLevelUpSchema,
  z.object({
    batch: z.array(singleLevelUpSchema).min(1).max(20),
  }),
]);

export type LevelUpInput = z.infer<typeof singleLevelUpSchema>;

// Roll check schema
export const rollCheckSchema = z.object({
  characterId: z.string().optional(),
  characterName: z.string().optional(),

  checkType: z.enum(['skill', 'ability', 'save', 'attack', 'initiative']),

  skill: SkillSchema.optional(),
  ability: AbilitySchema.optional(),

  dc: z.number().optional(),
  advantage: z.boolean().optional(),
  disadvantage: z.boolean().optional(),
  bonus: z.number().optional(),

  contestedBy: z.string().optional(),
  contestedCheck: z.object({
    type: z.enum(['skill', 'ability']),
    skillOrAbility: z.string(),
  }).optional(),
});

export type RollCheckInput = z.infer<typeof rollCheckSchema>;

// ============================================================
// CHARACTER INTERFACE
// ============================================================

export interface Character {
  id: string;
  name: string;
  race: string;
  class: string;
  level: number;
  background?: string;
  characterType: 'pc' | 'npc' | 'enemy' | 'neutral';
  stats: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  hp: number;
  maxHp: number;
  ac: number;
  speed: number;
  proficiencyBonus: number;
  resistances?: string[];
  immunities?: string[];
  vulnerabilities?: string[];
  conditionImmunities?: string[];
  spellcastingAbility?: string;
  knownSpells?: string[];
  preparedSpells?: string[];
  cantrips?: string[];
  skillProficiencies?: string[];
  saveProficiencies?: string[];
  equipment?: string[];
  /** Custom class definition (stored for homebrew classes) */
  customClass?: CustomClass;
  /** Custom race definition (stored for homebrew races) */
  customRace?: CustomRace;
  /** Custom resource tracking (Ki, Rage, etc.) */
  resource?: {
    name: string;
    current: number;
    max: number;
  };
  /** Hit dice tracking (persisted across sessions) */
  hitDice?: {
    current: number;
    max: number;
  };
  createdAt: string;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/** Minimum valid ability score (D&D 5e/generic RPG) */
const MIN_ABILITY_SCORE = 1;

/** Maximum valid ability score (D&D 5e allows 30 for deities/legendary) */
const MAX_ABILITY_SCORE = 30;

/**
 * Default hit die by class (D&D 5e standard).
 * Custom classes can override via customClass.hitDie.
 */
const HIT_DIE_BY_CLASS: Record<string, number> = {
  'Barbarian': 12,
  'Fighter': 10,
  'Paladin': 10,
  'Ranger': 10,
  'Bard': 8,
  'Cleric': 8,
  'Druid': 8,
  'Monk': 8,
  'Rogue': 8,
  'Warlock': 8,
  'Sorcerer': 6,
  'Wizard': 6,
};

/**
 * Get hit die for a character, supporting custom classes.
 * 
 * @param className - The class name
 * @param customClass - Optional custom class definition
 * @returns Hit die size (4, 6, 8, 10, or 12)
 */
function getHitDie(className: string, customClass?: CustomClass): number {
  // Custom class takes precedence
  if (customClass?.hitDie) {
    return customClass.hitDie;
  }
  // Check standard classes (case-insensitive)
  const standardHitDie = HIT_DIE_BY_CLASS[className];
  if (standardHitDie) {
    return standardHitDie;
  }
  // Check case-insensitive match
  const normalizedClass = Object.keys(HIT_DIE_BY_CLASS).find(
    k => k.toLowerCase() === className.toLowerCase()
  );
  if (normalizedClass) {
    return HIT_DIE_BY_CLASS[normalizedClass];
  }
  // Default to d8 for unknown classes
  return 8;
}

// Calculate ability modifier
function calculateModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

// Calculate proficiency bonus by level
function calculateProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

/**
 * Clamp ability score to valid range.
 * @param score - Raw ability score
 * @returns Clamped score between MIN_ABILITY_SCORE and MAX_ABILITY_SCORE
 */
function clampAbilityScore(score: number): number {
  return Math.min(MAX_ABILITY_SCORE, Math.max(MIN_ABILITY_SCORE, score));
}

/**
 * Apply racial ability bonuses to stats.
 * Supports both positive bonuses and negative penalties.
 * 
 * @param stats - Mutable stats object to modify
 * @param bonuses - Ability bonuses from custom race definition
 * @returns Modified stats (same object reference)
 * 
 * @example
 * applyRacialBonuses({ str: 15, dex: 10, ... }, { str: 2, con: 1 })
 * // Result: { str: 17, dex: 10, con: 11, ... }
 */
function applyRacialBonuses(
  stats: { str: number; dex: number; con: number; int: number; wis: number; cha: number },
  bonuses: { str?: number; dex?: number; con?: number; int?: number; wis?: number; cha?: number }
): typeof stats {
  const abilities: (keyof typeof stats)[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  
  for (const ability of abilities) {
    if (bonuses[ability]) {
      stats[ability] = clampAbilityScore(stats[ability] + bonuses[ability]);
    }
  }
  
  return stats;
}

/**
 * Calculate maximum resource pool based on class scaling rules.
 * 
 * @param baseMax - Base resource maximum at level 1
 * @param level - Current character level
 * @param scaling - Scaling rule: 'level', 'half', 'third', 'none', or numeric multiplier
 * @returns Calculated maximum resource value
 * 
 * @example
 * // Monk Ki Points: 1 base + 1 per level
 * calculateResourceMax(1, 10, 'level') // => 10
 * 
 * @example
 * // Rage with half-level scaling
 * calculateResourceMax(2, 10, 'half') // => 6 (2 + floor(9/2))
 * 
 * @example
 * // Fixed resource pool (no scaling)
 * calculateResourceMax(3, 20, 'none') // => 3
 */
function calculateResourceMax(
  baseMax: number,
  level: number,
  scaling: 'level' | 'half' | 'third' | 'none' | number | undefined
): number {
  if (!scaling || scaling === 'none') {
    return baseMax;
  }
  
  const levelsGained = level - 1;
  
  switch (scaling) {
    case 'level':
      return baseMax + levelsGained;
    case 'half':
      return baseMax + Math.floor(levelsGained / 2);
    case 'third':
      return baseMax + Math.floor(levelsGained / 3);
    default:
      // Numeric multiplier
      return baseMax + levelsGained * scaling;
  }
}

/**
 * Calculate max HP for a character.
 * Supports custom classes via customClass.hitDie.
 * 
 * @param className - The class name
 * @param level - Character level
 * @param conModifier - Constitution modifier
 * @param customClass - Optional custom class definition
 * @returns Calculated max HP
 */
function calculateMaxHP(
  className: string,
  level: number,
  conModifier: number,
  customClass?: CustomClass
): number {
  const hitDie = getHitDie(className, customClass);

  // First level: max hit die + CON mod
  // Additional levels: average of hit die (rounded up) + CON mod per level
  const firstLevelHP = hitDie + conModifier;
  const additionalLevels = level - 1;
  const avgHitDie = Math.floor(hitDie / 2) + 1;
  const additionalHP = additionalLevels * (avgHitDie + conModifier);

  return Math.max(1, firstLevelHP + additionalHP);
}

// Get character type emoji
function getCharacterTypeEmoji(type: string): string {
  const emojiMap: Record<string, string> = {
    'pc': '🎭',
    'npc': '🧑',
    'enemy': '⚔️',
    'neutral': '🤝',
  };
  return emojiMap[type] || '🎭';
}

/**
 * Warning types for character lookup operations.
 */
export enum CharacterLookupWarning {
  DUPLICATE_NAMES = 'duplicate_names',
  NONE = 'none',
}

/**
 * Result of character lookup with warning information.
 */
export interface CharacterLookupResult {
  characterId: string | null;
  warning: CharacterLookupWarning;
  duplicateCount?: number;
  duplicateIds?: string[];
}

/**
 * Find character by name with duplicate detection.
 * Used by combat module for character reference resolution.
 *
 * @param name - Character name (case-insensitive)
 * @returns Lookup result with warning if duplicates found
 */
export function findCharacterByNameWithWarnings(name: string): CharacterLookupResult {
  const dataDir = path.join(DATA_ROOT, 'characters');

  // Ensure directory exists
  if (!fs.existsSync(dataDir)) {
    return {
      characterId: null,
      warning: CharacterLookupWarning.NONE,
    };
  }

  try {
    const files = fs.readdirSync(dataDir);
    const matches: Array<{ id: string; name: string }> = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(dataDir, file);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const character: Character = JSON.parse(fileContent);

      // Case-insensitive name match
      if (character.name.toLowerCase() === name.toLowerCase()) {
        matches.push({ id: character.id, name: character.name });
      }
    }

    if (matches.length === 0) {
      return {
        characterId: null,
        warning: CharacterLookupWarning.NONE,
      };
    }

    if (matches.length > 1) {
      return {
        characterId: matches[0].id,
        warning: CharacterLookupWarning.DUPLICATE_NAMES,
        duplicateCount: matches.length,
        duplicateIds: matches.map(m => m.id),
      };
    }

    return {
      characterId: matches[0].id,
      warning: CharacterLookupWarning.NONE,
    };
  } catch (err) {
    return {
      characterId: null,
      warning: CharacterLookupWarning.NONE,
    };
  }
}

/**
 * Find character by name (returns ID only).
 * Legacy function for backward compatibility.
 *
 * @param name - Character name (case-insensitive)
 * @returns Character ID or null if not found
 * @deprecated Use findCharacterByNameWithWarnings for duplicate detection
 */
export function findCharacterByName(name: string): string | null {
  return findCharacterByNameWithWarnings(name).characterId;
}

// ============================================================
// CREATE CHARACTER HANDLER
// ============================================================

export function createCharacter(input: CreateCharacterInput): {
  success: boolean;
  character: Character;
  markdown: string;
} {
  // Generate unique ID
  const id = randomUUID();

  // Get stats with defaults
  const stats = input.stats || {
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
  };

  // Apply racial ability bonuses if custom race provided
  if (input.customRace?.abilityBonuses) {
    applyRacialBonuses(stats, input.customRace.abilityBonuses);
  }

  // Calculate derived stats
  const conModifier = calculateModifier(stats.con);
  const proficiencyBonus = calculateProficiencyBonus(input.level);

  // Calculate HP (use provided values or auto-calculate with custom class support)
  const maxHp = input.maxHp || calculateMaxHP(input.class, input.level, conModifier, input.customClass);
  const hp = input.hp !== undefined ? input.hp : maxHp;

  // Determine speed (custom race overrides default)
  const speed = input.customRace?.speed ?? input.speed;

  // Merge resistances/immunities from custom race
  const resistances = [
    ...(input.resistances || []),
    ...(input.customRace?.resistances || []),
  ];
  const immunities = [
    ...(input.immunities || []),
    ...(input.customRace?.immunities || []),
  ];
  const vulnerabilities = [
    ...(input.vulnerabilities || []),
    ...(input.customRace?.vulnerabilities || []),
  ];
  const conditionImmunities = [
    ...(input.conditionImmunities || []),
    ...(input.customRace?.conditionImmunities || []),
  ];

  // Determine spellcasting ability (custom class can set it)
  const spellcastingAbility = input.spellcastingAbility || input.customClass?.spellcastingAbility;

  // Merge save proficiencies from custom class
  const saveProficiencies = [
    ...(input.saveProficiencies || []),
    ...(input.customClass?.saveProficiencies || []),
  ];

  // Calculate custom resource if class has one
  let resource: Character['resource'];
  if (input.customClass?.resourceName && input.customClass?.resourceMax !== undefined) {
    const resourceMax = calculateResourceMax(
      input.customClass.resourceMax,
      input.level,
      input.customClass.resourceScaling
    );
    
    resource = {
      name: input.customClass.resourceName,
      current: resourceMax,
      max: resourceMax,
    };
  }

  // Build character object
  const character: Character = {
    id,
    name: input.name,
    race: input.customRace?.name || input.race,
    class: input.customClass?.name || input.class,
    level: input.level,
    background: input.background,
    characterType: input.characterType,
    stats,
    hp,
    maxHp,
    ac: input.ac,
    speed,
    proficiencyBonus,
    resistances: resistances.length > 0 ? resistances : undefined,
    immunities: immunities.length > 0 ? immunities : undefined,
    vulnerabilities: vulnerabilities.length > 0 ? vulnerabilities : undefined,
    conditionImmunities: conditionImmunities.length > 0 ? conditionImmunities : undefined,
    spellcastingAbility,
    knownSpells: input.knownSpells,
    preparedSpells: input.preparedSpells,
    cantrips: input.cantrips,
    skillProficiencies: input.skillProficiencies,
    saveProficiencies: saveProficiencies.length > 0 ? saveProficiencies : undefined,
    equipment: input.equipment,
    customClass: input.customClass,
    customRace: input.customRace,
    resource,
    createdAt: new Date().toISOString(),
  };

  // Save to file
  const dataDir = path.join(DATA_ROOT, 'characters');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const filePath = path.join(dataDir, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(character, null, 2), 'utf-8');

  // Format markdown output
  const markdown = formatCharacterSheet(character);

  return {
    success: true,
    character,
    markdown,
  };
}

// ============================================================
// FORMATTING
// ============================================================

function formatCharacterSheet(character: Character): string {
  const content: string[] = [];
  const box = BOX.LIGHT;
  const WIDTH = 68;

  // Calculate effective stats with conditions
  const effectiveStats = calculateEffectiveStats(character.id, {
    maxHp: character.maxHp,
    hp: character.hp,
    speed: character.speed,
    ac: character.ac,
  });

  // Character Header
  const typeLabel = character.characterType.toUpperCase();
  content.push(centerText(`${character.name}`, WIDTH));
  content.push(centerText(`${typeLabel} - ${character.race} ${character.class} (Level ${character.level})`, WIDTH));
  if (character.background) {
    content.push(centerText(`Background: ${character.background}`, WIDTH));
  }
  content.push('');
  content.push(box.H.repeat(WIDTH));
  content.push('');

  // Combat Stats Section
  content.push(padText('COMBAT STATS', WIDTH, 'center'));
  content.push('');

  // HP Bar - use effective maxHp if modified by conditions
  const displayMaxHp = effectiveStats.maxHp.effective;
  const displayHp = Math.min(character.hp, displayMaxHp); // Clamp current HP to effective max
  const hpBar = createStatusBar(displayHp, displayMaxHp, 40, 'HP');
  content.push(centerText(hpBar, WIDTH));

  // Show HP modification if conditions affect it
  if (effectiveStats.maxHp.modified) {
    const hpNote = `Base: ${character.hp}/${character.maxHp} → Effective: ${displayHp}/${displayMaxHp}`;
    content.push(centerText(hpNote, WIDTH));
  }
  content.push('');

  // Core combat stats in table
  content.push(createTableRow(['AC', 'Speed', 'Initiative', 'Prof Bonus'], [10, 12, 12, 14], 'LIGHT'));

  // Show effective values (with condition modifications if any)
  const displayAC = effectiveStats.ac ? effectiveStats.ac.effective : character.ac;
  const displaySpeed = effectiveStats.speed.effective;

  content.push(createTableRow([
    displayAC.toString() + (effectiveStats.ac?.modified ? '*' : ''),
    `${displaySpeed} ft` + (effectiveStats.speed.modified ? '*' : ''),
    `+${calculateModifier(character.stats.dex)}`,
    `+${character.proficiencyBonus}`
  ], [10, 12, 12, 14], 'LIGHT'));

  // Show condition notes if stats are modified
  if (effectiveStats.speed.modified && effectiveStats.speed.base !== displaySpeed) {
    content.push(padText(`  * Speed: ${effectiveStats.speed.base} ft (base)`, WIDTH, 'left'));
  }
  if (effectiveStats.ac?.modified && effectiveStats.ac.base !== displayAC) {
    content.push(padText(`  * AC: ${effectiveStats.ac.base} (base)`, WIDTH, 'left'));
  }

  content.push('');
  content.push(box.H.repeat(WIDTH));
  content.push('');

  // Ability Scores Section
  content.push(padText('ABILITY SCORES', WIDTH, 'center'));
  content.push('');

  // Ability scores in two rows of three
  const abilities = [
    { key: 'str', name: 'STR' },
    { key: 'dex', name: 'DEX' },
    { key: 'con', name: 'CON' },
    { key: 'int', name: 'INT' },
    { key: 'wis', name: 'WIS' },
    { key: 'cha', name: 'CHA' },
  ];

  // Header
  content.push(createTableRow(
    abilities.slice(0, 3).map(a => a.name),
    [10, 10, 10],
    'LIGHT'
  ));

  // Scores
  content.push(createTableRow(
    abilities.slice(0, 3).map(a => {
      const score = character.stats[a.key as keyof typeof character.stats];
      return `  ${score}`;
    }),
    [10, 10, 10],
    'LIGHT'
  ));

  // Modifiers
  content.push(createTableRow(
    abilities.slice(0, 3).map(a => {
      const score = character.stats[a.key as keyof typeof character.stats];
      const mod = calculateModifier(score);
      return ` ${mod >= 0 ? '+' : ''}${mod}`;
    }),
    [10, 10, 10],
    'LIGHT'
  ));

  content.push('');

  // Second row
  content.push(createTableRow(
    abilities.slice(3, 6).map(a => a.name),
    [10, 10, 10],
    'LIGHT'
  ));

  content.push(createTableRow(
    abilities.slice(3, 6).map(a => {
      const score = character.stats[a.key as keyof typeof character.stats];
      return `  ${score}`;
    }),
    [10, 10, 10],
    'LIGHT'
  ));

  content.push(createTableRow(
    abilities.slice(3, 6).map(a => {
      const score = character.stats[a.key as keyof typeof character.stats];
      const mod = calculateModifier(score);
      return ` ${mod >= 0 ? '+' : ''}${mod}`;
    }),
    [10, 10, 10],
    'LIGHT'
  ));

  // Proficiencies
  if (character.skillProficiencies && character.skillProficiencies.length > 0) {
    content.push('');
    content.push(box.H.repeat(WIDTH));
    content.push('');
    content.push(padText('SKILL PROFICIENCIES', WIDTH, 'center'));
    content.push('');
    const skills = character.skillProficiencies.join(', ');
    content.push(padText(skills, WIDTH, 'left'));
  }

  if (character.saveProficiencies && character.saveProficiencies.length > 0) {
    content.push('');
    content.push(padText('SAVING THROWS: ' + character.saveProficiencies.map(s => s.toUpperCase()).join(', '), WIDTH, 'left'));
  }

  // Resistances/Immunities/Vulnerabilities
  const defenses: string[] = [];
  if (character.resistances && character.resistances.length > 0) {
    defenses.push(`Resistances: ${character.resistances.join(', ')}`);
  }
  if (character.immunities && character.immunities.length > 0) {
    defenses.push(`Immunities: ${character.immunities.join(', ')}`);
  }
  if (character.vulnerabilities && character.vulnerabilities.length > 0) {
    defenses.push(`Vulnerabilities: ${character.vulnerabilities.join(', ')}`);
  }
  if (character.conditionImmunities && character.conditionImmunities.length > 0) {
    defenses.push(`Condition Immunities: ${character.conditionImmunities.join(', ')}`);
  }

  if (defenses.length > 0) {
    content.push('');
    content.push(box.H.repeat(WIDTH));
    content.push('');
    content.push(padText('DEFENSES', WIDTH, 'center'));
    content.push('');
    defenses.forEach(d => content.push(padText(d, WIDTH, 'left')));
  }

  // Custom Race Traits
  if (character.customRace?.traits && character.customRace.traits.length > 0) {
    content.push('');
    content.push(box.H.repeat(WIDTH));
    content.push('');
    content.push(padText('RACIAL TRAITS', WIDTH, 'center'));
    content.push('');
    character.customRace.traits.forEach(trait => {
      content.push(padText(`• ${trait}`, WIDTH, 'left'));
    });
    if (character.customRace.darkvision && character.customRace.darkvision > 0) {
      content.push(padText(`• Darkvision: ${character.customRace.darkvision} ft`, WIDTH, 'left'));
    }
    if (character.customRace.languages && character.customRace.languages.length > 0) {
      content.push(padText(`• Languages: ${character.customRace.languages.join(', ')}`, WIDTH, 'left'));
    }
    if (character.customRace.description) {
      content.push('');
      content.push(padText(character.customRace.description, WIDTH, 'left'));
    }
  }

  // Custom Class Info
  if (character.customClass?.description) {
    content.push('');
    content.push(box.H.repeat(WIDTH));
    content.push('');
    content.push(padText('CLASS INFO', WIDTH, 'center'));
    content.push('');
    content.push(padText(character.customClass.description, WIDTH, 'left'));
  }

  // Custom Resource (Ki, Rage, Superiority Dice, etc.)
  if (character.resource) {
    content.push('');
    content.push(box.H.repeat(WIDTH));
    content.push('');
    content.push(padText(character.resource.name.toUpperCase(), WIDTH, 'center'));
    content.push('');
    const resourceBar = createStatusBar(character.resource.current, character.resource.max, 40, character.resource.name);
    content.push(centerText(resourceBar, WIDTH));
  }

  // Spellcasting
  if (character.spellcastingAbility) {
    content.push('');
    content.push(box.H.repeat(WIDTH));
    content.push('');
    content.push(padText('SPELLCASTING', WIDTH, 'center'));
    content.push('');
    content.push(padText(`Ability: ${character.spellcastingAbility.toUpperCase()}`, WIDTH, 'left'));

    if (character.cantrips && character.cantrips.length > 0) {
      content.push(padText(`Cantrips: ${character.cantrips.join(', ')}`, WIDTH, 'left'));
    }
    if (character.knownSpells && character.knownSpells.length > 0) {
      content.push(padText(`Known: ${character.knownSpells.join(', ')}`, WIDTH, 'left'));
    }
    if (character.preparedSpells && character.preparedSpells.length > 0) {
      content.push(padText(`Prepared: ${character.preparedSpells.join(', ')}`, WIDTH, 'left'));
    }
  }

  // Equipment
  if (character.equipment && character.equipment.length > 0) {
    content.push('');
    content.push(box.H.repeat(WIDTH));
    content.push('');
    content.push(padText('EQUIPMENT', WIDTH, 'center'));
    content.push('');
    character.equipment.forEach(item => {
      content.push(padText(`• ${item}`, WIDTH, 'left'));
    });
  }

  // Active Conditions Section (if any)
  const activeConditions = getActiveConditions(character.id);
  if (activeConditions.length > 0 || effectiveStats.conditionEffects.length > 0) {
    content.push('');
    content.push(box.H.repeat(WIDTH));
    content.push('');
    content.push(padText('ACTIVE CONDITIONS', WIDTH, 'center'));
    content.push('');

    // List each condition
    for (const cond of activeConditions) {
      const condName = typeof cond.condition === 'string'
        ? cond.condition.charAt(0).toUpperCase() + cond.condition.slice(1)
        : cond.condition;

      let condLabel = cond.condition === 'exhaustion' && cond.exhaustionLevel
        ? `${condName} (Level ${cond.exhaustionLevel})`
        : condName;

      content.push(padText(`• ${condLabel}`, WIDTH, 'left'));

      // Show source if available
      if (cond.source) {
        content.push(padText(`  Source: ${cond.source}`, WIDTH, 'left'));
      }

      // Show duration
      if (cond.roundsRemaining !== undefined) {
        content.push(padText(`  Duration: ${cond.roundsRemaining} round${cond.roundsRemaining !== 1 ? 's' : ''}`, WIDTH, 'left'));
      } else if (cond.duration && typeof cond.duration === 'string') {
        content.push(padText(`  Duration: ${cond.duration.replace(/_/g, ' ')}`, WIDTH, 'left'));
      }

      content.push('');
    }

    // Show mechanical effects summary
    if (effectiveStats.conditionEffects.length > 0) {
      content.push(padText('MECHANICAL EFFECTS:', WIDTH, 'left'));
      for (const effect of effectiveStats.conditionEffects) {
        content.push(padText(`  ${effect}`, WIDTH, 'left'));
      }
    }
  }

  // Footer
  content.push('');
  content.push(box.H.repeat(WIDTH));
  content.push(centerText(`Character ID: ${character.id}`, WIDTH));
  content.push(centerText(`Created: ${new Date(character.createdAt).toLocaleString()}`, WIDTH));

  return createBox('CHARACTER SHEET', content, undefined, 'HEAVY');
}

// Format character update showing before/after comparison
function formatCharacterUpdate(
  before: Character,
  after: Character,
  updates: z.infer<typeof singleUpdateSchema>
): string {
  const content: string[] = [];
  const box = BOX.LIGHT;
  const WIDTH = 68;

  // Header
  content.push(centerText(`${after.name}`, WIDTH));
  content.push(centerText(`Update Summary`, WIDTH));
  content.push('');
  content.push(box.H.repeat(WIDTH));
  content.push('');

  // Helper function to create before/after row
  const addComparison = (label: string, beforeVal: string, afterVal: string) => {
    const labelPad = 16;
    const valuePad = 24;

    const paddedLabel = label.padEnd(labelPad);
    const beforePadded = beforeVal.padEnd(valuePad);
    const afterPadded = afterVal.padEnd(valuePad);

    content.push(padText(`${paddedLabel}${beforePadded} → ${afterPadded}`, WIDTH, 'left'));
  };

  // Track what changed
  let changesCount = 0;

  // Name
  if (updates.name !== undefined && before.name !== after.name) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    addComparison('Name:', before.name, after.name);
    changesCount++;
  }

  // Level
  if (updates.level !== undefined && before.level !== after.level) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    addComparison('Level:', `${before.level}`, `${after.level}`);
    changesCount++;
  }

  // Proficiency Bonus (auto-calculated from level)
  if (before.proficiencyBonus !== after.proficiencyBonus) {
    addComparison('Prof Bonus:', `+${before.proficiencyBonus}`, `+${after.proficiencyBonus}`);
    changesCount++;
  }

  // HP
  if (updates.hp !== undefined && before.hp !== after.hp) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    addComparison('HP:', `${before.hp}/${before.maxHp}`, `${after.hp}/${after.maxHp}`);
    changesCount++;
  }

  // Max HP (could change from CON/level/class changes)
  if (before.maxHp !== after.maxHp && updates.hp === undefined) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    addComparison('Max HP:', `${before.maxHp}`, `${after.maxHp}`);
    changesCount++;
  }

  // AC
  if (updates.ac !== undefined && before.ac !== after.ac) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    addComparison('AC:', `${before.ac}`, `${after.ac}`);
    changesCount++;
  }

  // Speed
  if (updates.speed !== undefined && before.speed !== after.speed) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    addComparison('Speed:', `${before.speed} ft`, `${after.speed} ft`);
    changesCount++;
  }

  // Race
  if (updates.race !== undefined && before.race !== after.race) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    addComparison('Race:', before.race, after.race);
    changesCount++;
  }

  // Class
  if (updates.class !== undefined && before.class !== after.class) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    addComparison('Class:', before.class, after.class);
    changesCount++;
  }

  // Ability Scores
  const abilities: Array<{ key: keyof Character['stats']; name: string }> = [
    { key: 'str', name: 'STR' },
    { key: 'dex', name: 'DEX' },
    { key: 'con', name: 'CON' },
    { key: 'int', name: 'INT' },
    { key: 'wis', name: 'WIS' },
    { key: 'cha', name: 'CHA' },
  ];

  abilities.forEach(({ key, name }) => {
    if (before.stats[key] !== after.stats[key]) {
      if (changesCount === 0) {
        content.push(centerText('CHANGES', WIDTH));
        content.push('');
      }
      const beforeMod = calculateModifier(before.stats[key]);
      const afterMod = calculateModifier(after.stats[key]);
      addComparison(
        `${name}:`,
        `${before.stats[key]} (${beforeMod >= 0 ? '+' : ''}${beforeMod})`,
        `${after.stats[key]} (${afterMod >= 0 ? '+' : ''}${afterMod})`
      );
      changesCount++;
    }
  });

  // Equipment
  if (updates.equipment !== undefined) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    content.push('');
    content.push(padText('Equipment:', WIDTH, 'left'));
    after.equipment?.forEach(item => {
      content.push(padText(`  • ${item}`, WIDTH, 'left'));
    });
    changesCount++;
  }

  // Spellcasting
  if (updates.spellcastingAbility !== undefined || updates.cantrips !== undefined ||
      updates.knownSpells !== undefined || updates.preparedSpells !== undefined) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    content.push('');
    content.push(padText('Spellcasting:', WIDTH, 'left'));
    if (after.spellcastingAbility) {
      content.push(padText(`  Ability: ${after.spellcastingAbility.toUpperCase()}`, WIDTH, 'left'));
    }
    if (after.cantrips && after.cantrips.length > 0) {
      content.push(padText(`  Cantrips: ${after.cantrips.join(', ')}`, WIDTH, 'left'));
    }
    if (after.knownSpells && after.knownSpells.length > 0) {
      content.push(padText(`  Known: ${after.knownSpells.join(', ')}`, WIDTH, 'left'));
    }
    if (after.preparedSpells && after.preparedSpells.length > 0) {
      content.push(padText(`  Prepared: ${after.preparedSpells.join(', ')}`, WIDTH, 'left'));
    }
    changesCount++;
  }

  // Resistances/Immunities
  if (updates.resistances !== undefined && after.resistances && after.resistances.length > 0) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    content.push('');
    content.push(padText(`Resistances: ${after.resistances.join(', ')}`, WIDTH, 'left'));
    changesCount++;
  }

  if (updates.immunities !== undefined && after.immunities && after.immunities.length > 0) {
    if (changesCount === 0) {
      content.push(centerText('CHANGES', WIDTH));
      content.push('');
    }
    content.push('');
    content.push(padText(`Immunities: ${after.immunities.join(', ')}`, WIDTH, 'left'));
    changesCount++;
  }

  // Footer
  content.push('');
  content.push(box.H.repeat(WIDTH));
  content.push(centerText(`Character ID: ${after.id}`, WIDTH));
  content.push(centerText(`Updated: ${new Date().toLocaleString()}`, WIDTH));

  return createBox('CHARACTER UPDATE', content, undefined, 'HEAVY');
}

// ============================================================
// UPDATE CHARACTER HANDLER
// ============================================================

export function updateCharacter(input: UpdateCharacterInput): {
  success: boolean;
  character?: Character;
  markdown: string;
  error?: string;
} {
  // Check if this is a batch operation
  if ('batch' in input && input.batch) {
    return updateCharacterBatch(input.batch);
  }

  // Type assertion: we know it's a single update at this point
  const singleInput = input as z.infer<typeof singleUpdateSchema>;

  const dataDir = path.join(DATA_ROOT, 'characters');

  // Resolve character ID (either from direct ID or by name lookup)
  let characterId: string | undefined = singleInput.characterId;
  if (!characterId && singleInput.characterName) {
    const foundId = findCharacterByName(singleInput.characterName);
    if (!foundId) {
      return {
        success: false,
        markdown: '',
        error: `Character not found with name: ${singleInput.characterName}`,
      };
    }
    characterId = foundId;
  }

  if (!characterId) {
    return {
      success: false,
      markdown: '',
      error: 'Character ID or name is required',
    };
  }

  const filePath = path.join(dataDir, `${characterId}.json`);

  // Check if character exists
  if (!fs.existsSync(filePath)) {
    return {
      success: false,
      markdown: '',
      error: `Character not found: ${characterId}`,
    };
  }

  // Read existing character
  let originalCharacter: Character;
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    originalCharacter = JSON.parse(fileContent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: '',
      error: `Failed to read character: ${message}`,
    };
  }

  // Create updated character by merging changes
  const updatedCharacter: Character = { ...originalCharacter };

  // Apply updates
  if (singleInput.name !== undefined) updatedCharacter.name = singleInput.name;
  if (singleInput.race !== undefined) updatedCharacter.race = singleInput.race;
  if (singleInput.class !== undefined) updatedCharacter.class = singleInput.class;
  if (singleInput.level !== undefined) updatedCharacter.level = singleInput.level;
  if (singleInput.background !== undefined) updatedCharacter.background = singleInput.background;
  if (singleInput.characterType !== undefined) updatedCharacter.characterType = singleInput.characterType;
  if (singleInput.ac !== undefined) updatedCharacter.ac = singleInput.ac;
  if (singleInput.speed !== undefined) updatedCharacter.speed = singleInput.speed;
  if (singleInput.resistances !== undefined) updatedCharacter.resistances = singleInput.resistances;
  if (singleInput.immunities !== undefined) updatedCharacter.immunities = singleInput.immunities;
  if (singleInput.vulnerabilities !== undefined) updatedCharacter.vulnerabilities = singleInput.vulnerabilities;
  if (singleInput.conditionImmunities !== undefined) updatedCharacter.conditionImmunities = singleInput.conditionImmunities;
  if (singleInput.spellcastingAbility !== undefined) updatedCharacter.spellcastingAbility = singleInput.spellcastingAbility;
  if (singleInput.knownSpells !== undefined) updatedCharacter.knownSpells = singleInput.knownSpells;
  if (singleInput.preparedSpells !== undefined) updatedCharacter.preparedSpells = singleInput.preparedSpells;
  if (singleInput.cantrips !== undefined) updatedCharacter.cantrips = singleInput.cantrips;
  if (singleInput.skillProficiencies !== undefined) updatedCharacter.skillProficiencies = singleInput.skillProficiencies;
  if (singleInput.saveProficiencies !== undefined) updatedCharacter.saveProficiencies = singleInput.saveProficiencies;
  if (singleInput.equipment !== undefined) updatedCharacter.equipment = singleInput.equipment;

  // Handle stats (partial update)
  if (singleInput.stats !== undefined) {
    updatedCharacter.stats = {
      ...originalCharacter.stats,
      ...singleInput.stats,
    };
  }

  // Recalculate derived stats if needed
  const conModifier = calculateModifier(updatedCharacter.stats.con);

  // Recalculate proficiency bonus if level changed
  if (singleInput.level !== undefined) {
    updatedCharacter.proficiencyBonus = calculateProficiencyBonus(updatedCharacter.level);
  }

  // Recalculate maxHp if class, level, or CON changed
  if (singleInput.class !== undefined || singleInput.level !== undefined || singleInput.stats?.con !== undefined) {
    const newMaxHp = calculateMaxHP(updatedCharacter.class, updatedCharacter.level, conModifier);
    updatedCharacter.maxHp = newMaxHp;

    // If current HP is over the new max, cap it
    if (updatedCharacter.hp > newMaxHp) {
      updatedCharacter.hp = newMaxHp;
    }
  }

  // Apply maxHp override if provided
  if (singleInput.maxHp !== undefined) {
    updatedCharacter.maxHp = singleInput.maxHp;
  }

  // Apply healing if provided (explicit healing parameter takes precedence)
  if (singleInput.healing !== undefined) {
    const newHp = Math.min(updatedCharacter.maxHp, updatedCharacter.hp + singleInput.healing);
    updatedCharacter.hp = newHp;
  }
  // Apply HP update if provided (supports relative values like "+8" or "-15")
  else if (singleInput.hp !== undefined) {
    let newHp: number;

    if (typeof singleInput.hp === 'string') {
      // String delta notation (e.g., "+8" for healing, "-15" for damage)
      const delta = parseInt(singleInput.hp, 10);
      newHp = Math.max(0, Math.min(updatedCharacter.maxHp, updatedCharacter.hp + delta));
    } else if (singleInput.hp < 0) {
      // Numeric delta notation (e.g., -12 for damage)
      // Negative numbers are always treated as deltas
      const delta = singleInput.hp;
      newHp = Math.max(0, Math.min(updatedCharacter.maxHp, updatedCharacter.hp + delta));
    } else {
      // Absolute HP update (positive number or zero)
      newHp = singleInput.hp;

      // Validate HP doesn't exceed maxHp
      if (newHp > updatedCharacter.maxHp) {
        return {
          success: false,
          markdown: '',
          error: `HP (${newHp}) cannot exceed max HP (${updatedCharacter.maxHp})`,
        };
      }
    }

    updatedCharacter.hp = newHp;
  }

  // Handle resource update (Ki, Rage, Superiority Dice, etc.)
  if (singleInput.resource !== undefined) {
    if (typeof singleInput.resource === 'number') {
      // Just update current value
      if (updatedCharacter.resource) {
        updatedCharacter.resource.current = singleInput.resource;
      } else {
        // Create new resource with default name
        updatedCharacter.resource = {
          name: 'Resource',
          current: singleInput.resource,
          max: singleInput.resource,
        };
      }
    } else {
      // Full resource object update
      updatedCharacter.resource = {
        name: singleInput.resource.name ?? updatedCharacter.resource?.name ?? 'Resource',
        current: singleInput.resource.current ?? updatedCharacter.resource?.current ?? 0,
        max: singleInput.resource.max ?? updatedCharacter.resource?.max ?? 0,
      };
    }
  }

  // Save updated character
  try {
    fs.writeFileSync(filePath, JSON.stringify(updatedCharacter, null, 2), 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: '',
      error: `Failed to save character: ${message}`,
    };
  }

  // Format output showing before/after comparison
  const markdown = formatCharacterUpdate(originalCharacter, updatedCharacter, singleInput);

  return {
    success: true,
    character: updatedCharacter,
    markdown,
  };
}

// ============================================================
// BATCH UPDATE CHARACTER
// ============================================================

function updateCharacterBatch(updates: Array<z.infer<typeof singleUpdateSchema>>): {
  success: boolean;
  markdown: string;
  error?: string;
} {
  const results: Array<{
    name: string;
    success: boolean;
    hpBefore?: number;
    hpAfter?: number;
    maxHp?: number;
    changes: string[];
    error?: string;
  }> = [];

  // Process each update
  for (const update of updates) {
    // Resolve character ID
    let characterId: string | undefined = update.characterId;
    if (!characterId && update.characterName) {
      const foundId = findCharacterByName(update.characterName);
      if (!foundId) {
        results.push({
          name: update.characterName || update.characterId || 'Unknown',
          success: false,
          changes: [],
          error: `Character not found: ${update.characterName}`,
        });
        continue;
      }
      characterId = foundId;
    }

    if (!characterId) {
      results.push({
        name: 'Unknown',
        success: false,
        changes: [],
        error: 'No character ID or name provided',
      });
      continue;
    }

    // Perform single update
    const singleResult = updateCharacter(update as any);

    if (!singleResult.success) {
      results.push({
        name: update.characterName || update.characterId || 'Unknown',
        success: false,
        changes: [],
        error: singleResult.error,
      });
      continue;
    }

    // Track what changed
    const changes: string[] = [];
    const char = singleResult.character!;

    if (update.hp !== undefined) {
      results.push({
        name: char.name,
        success: true,
        hpBefore: typeof update.hp === 'string' ? char.hp - parseInt(update.hp, 10) : undefined,
        hpAfter: char.hp,
        maxHp: char.maxHp,
        changes,
      });
    } else {
      results.push({
        name: char.name,
        success: true,
        changes,
      });
    }
  }

  // Format batch output
  return {
    success: true,
    markdown: formatBatchUpdate(results),
  };
}

function formatBatchUpdate(results: Array<{
  name: string;
  success: boolean;
  hpBefore?: number;
  hpAfter?: number;
  maxHp?: number;
  changes: string[];
  error?: string;
}>): string {
  const content: string[] = [];
  const box = BOX.LIGHT;

  content.push(centerText(`Updated ${results.length} character${results.length !== 1 ? 's' : ''}`, 68));
  content.push('');
  content.push(box.H.repeat(68));
  content.push('');

  for (const result of results) {
    if (!result.success) {
      content.push(padText(`✗ ${result.name}`, 68, 'left'));
      content.push(padText(`  Error: ${result.error}`, 68, 'left'));
    } else {
      content.push(padText(`✓ ${result.name}`, 68, 'left'));

      if (result.hpBefore !== undefined && result.hpAfter !== undefined) {
        const hpBar = createStatusBar(result.hpAfter, result.maxHp || result.hpAfter, 40, 'HP');
        content.push(padText(`  HP: ${result.hpBefore} → ${result.hpAfter}/${result.maxHp}`, 68, 'left'));
        content.push(padText(`  ${hpBar}`, 68, 'left'));
      }
    }

    content.push('');
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;

  content.push(box.H.repeat(68));
  content.push(centerText(`Success: ${successCount} | Failed: ${failCount}`, 68));

  return createBox('BATCH CHARACTER UPDATE', content, undefined, 'HEAVY');
}

// ============================================================
// GET CHARACTER HANDLER
// ============================================================

export function getCharacter(input: GetCharacterInput): {
  success: boolean;
  character?: Character;
  markdown: string;
  error?: string;
} {
  // Check if this is a batch operation
  if ('batch' in input && input.batch) {
    return getCharacterBatch(input.batch);
  }

  // Type assertion: we know it's a single get at this point
  const singleInput = input as z.infer<typeof singleGetSchema>;

  const dataDir = path.join(DATA_ROOT, 'characters');

  // Resolve character ID (either from direct ID or by name lookup)
  let characterId: string | undefined = singleInput.characterId;
  if (!characterId && singleInput.characterName) {
    const foundId = findCharacterByName(singleInput.characterName);
    if (!foundId) {
      return {
        success: false,
        markdown: '',
        error: `Character not found with name: ${singleInput.characterName}`,
      };
    }
    characterId = foundId;
  }

  if (!characterId) {
    return {
      success: false,
      markdown: '',
      error: 'Character ID or name is required',
    };
  }

  const filePath = path.join(dataDir, `${characterId}.json`);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return {
      success: false,
      markdown: '',
      error: `Character not found: ${characterId}`,
    };
  }

  // Read and parse character data
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const character: Character = JSON.parse(fileContent);

    // Format markdown output using the same formatter as create
    const markdown = formatCharacterSheet(character);

    return {
      success: true,
      character,
      markdown,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: '',
      error: `Failed to read character: ${message}`,
    };
  }
}

// ============================================================
// BATCH GET CHARACTER
// ============================================================

function getCharacterBatch(requests: Array<z.infer<typeof singleGetSchema>>): {
  success: boolean;
  markdown: string;
  error?: string;
} {
  const characters: Character[] = [];
  const errors: Array<{ name: string; error: string }> = [];

  // Fetch each character
  for (const request of requests) {
    const result = getCharacter(request as any);

    if (result.success && result.character) {
      characters.push(result.character);
    } else {
      errors.push({
        name: request.characterName || request.characterId || 'Unknown',
        error: result.error || 'Unknown error',
      });
    }
  }

  // Format party roster
  return {
    success: true,
    markdown: formatPartyRoster(characters, errors),
  };
}

function formatPartyRoster(characters: Character[], errors: Array<{ name: string; error: string }>): string {
  const content: string[] = [];
  const box = BOX.LIGHT;

  content.push(centerText(`Party Roster (${characters.length} character${characters.length !== 1 ? 's' : ''})`, 68));
  content.push('');
  content.push(box.H.repeat(68));
  content.push('');

  for (const char of characters) {
    // Character name and class/level
    content.push(padText(`${char.name} - ${char.race} ${char.class} ${char.level}`, 68, 'left'));

    // HP bar
    const hpBar = createStatusBar(char.hp, char.maxHp, 40, 'HP');
    content.push(padText(`  ${hpBar}`, 68, 'left'));

    // Quick stats
    const stats = `AC ${char.ac} | SPD ${char.speed}ft | INIT +${calculateModifier(char.stats.dex)}`;
    content.push(padText(`  ${stats}`, 68, 'left'));

    content.push('');
  }

  // Show errors if any
  if (errors.length > 0) {
    content.push(box.H.repeat(68));
    content.push(centerText('ERRORS', 68));
    content.push('');

    for (const err of errors) {
      content.push(padText(`✗ ${err.name}: ${err.error}`, 68, 'left'));
    }

    content.push('');
  }

  return createBox('PARTY STATUS', content, undefined, 'HEAVY');
}

// ============================================================
// ROLL CHECK HANDLER
// ============================================================

// Skill to ability mapping (D&D 5e standard)
const SKILL_ABILITIES: Record<string, string> = {
  acrobatics: 'dex',
  animal_handling: 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  sleight_of_hand: 'dex',
  stealth: 'dex',
  survival: 'wis',
};

// ============================================================
// ROLL CHECK HELPER FUNCTIONS
// ============================================================

/**
 * Formats a snake_case skill name to Title Case
 * Example: "sleight_of_hand" -> "Sleight Of Hand"
 */
function formatSkillName(skill: string): string {
  return skill.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Formats a modifier with sign prefix
 * Example: 3 -> "+3", -2 -> "-2", 0 -> "+0"
 */
function formatModifierSign(modifier: number): string {
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

/**
 * Determines the roll mode based on advantage/disadvantage flags
 */
function determineRollMode(
  advantage?: boolean,
  disadvantage?: boolean
): 'normal' | 'advantage' | 'disadvantage' | 'cancelled' {
  if (advantage && disadvantage) {
    return 'cancelled';
  } else if (advantage) {
    return 'advantage';
  } else if (disadvantage) {
    return 'disadvantage';
  }
  return 'normal';
}

/**
 * Builds a dice expression string based on modifier and roll mode
 */
function buildDiceExpression(totalMod: number, rollMode: 'normal' | 'advantage' | 'disadvantage' | 'cancelled'): string {
  const modPart = totalMod >= 0 ? `+${totalMod}` : `${totalMod}`;
  
  switch (rollMode) {
    case 'advantage':
      return `2d20kh1${modPart}`;
    case 'disadvantage':
      return `2d20kl1${modPart}`;
    default:
      return `1d20${modPart}`;
  }
}

/**
 * Extracts the natural roll from dice results based on roll mode
 */
function extractNaturalRoll(rolls: number[], rollMode: 'normal' | 'advantage' | 'disadvantage' | 'cancelled'): number {
  if (rollMode === 'advantage') {
    return Math.max(...rolls);
  } else if (rollMode === 'disadvantage') {
    return Math.min(...rolls);
  }
  return rolls[0];
}

/**
 * Result interface for internal roll data (used by contested checks)
 */
interface RollResult {
  checkName: string;
  abilityKey: string;
  abilityMod: number;
  profMod: number;
  bonusMod: number;
  totalMod: number;
  rollMode: 'normal' | 'advantage' | 'disadvantage' | 'cancelled';
  rolls: number[];
  naturalRoll: number;
  total: number;
  dcResult?: 'success' | 'failure';
}

/**
 * Performs the core roll logic and returns structured data
 * Used internally by rollCheck() and handleContestedCheck()
 */
function performRoll(
  input: RollCheckInput,
  character?: Character
): { success: true; result: RollResult } | { success: false; error: string } {
  // Determine ability to use and check name
  let abilityKey: string;
  let checkName: string;

  if (input.checkType === 'initiative') {
    abilityKey = 'dex';
    checkName = 'Initiative';
  } else if (input.checkType === 'skill') {
    abilityKey = SKILL_ABILITIES[input.skill!];
    checkName = formatSkillName(input.skill!);
  } else {
    abilityKey = input.ability!;
    checkName = input.ability!.toUpperCase();
    if (input.checkType === 'save') {
      checkName += ' Save';
    } else if (input.checkType === 'attack') {
      checkName = 'Attack Roll';
    } else {
      checkName += ' Check';
    }
  }

  // Calculate modifiers from character (if provided)
  let abilityMod = 0;
  let proficiencyBonus = 0;
  let isProficient = false;

  if (character) {
    const abilityScore = character.stats[abilityKey as keyof typeof character.stats];
    abilityMod = calculateModifier(abilityScore);
    proficiencyBonus = character.proficiencyBonus;

    // Check proficiency based on check type
    if (input.checkType === 'skill' && character.skillProficiencies) {
      isProficient = character.skillProficiencies.includes(input.skill!);
    } else if (input.checkType === 'save' && character.saveProficiencies) {
      isProficient = character.saveProficiencies.includes(input.ability!);
    } else if (input.checkType === 'attack') {
      isProficient = true; // Always add proficiency to attacks
    }
  }

  const profMod = isProficient ? proficiencyBonus : 0;
  const bonusMod = input.bonus || 0;
  const totalMod = abilityMod + profMod + bonusMod;

  // Determine roll mode and build dice expression using helpers
  const rollMode = determineRollMode(input.advantage, input.disadvantage);
  const diceExpression = buildDiceExpression(totalMod, rollMode);

  // Execute the roll
  const diceResult = parseDice(diceExpression);
  const naturalRoll = extractNaturalRoll(diceResult.rolls, rollMode);
  const total = diceResult.total;

  return {
    success: true,
    result: {
      checkName,
      abilityKey,
      abilityMod,
      profMod,
      bonusMod,
      totalMod,
      rollMode,
      rolls: diceResult.rolls,
      naturalRoll,
      total,
    },
  };
}

/**
 * Evaluates DC check result, handling auto-success/fail for saving throws
 */
function evaluateDCResult(
  checkType: string,
  naturalRoll: number,
  total: number,
  dc: number
): 'success' | 'failure' {
  // Natural 20 on saves = auto success
  if (checkType === 'save' && naturalRoll === 20) {
    return 'success';
  }
  // Natural 1 on saves = auto fail
  if (checkType === 'save' && naturalRoll === 1) {
    return 'failure';
  }
  // Normal DC check
  return total >= dc ? 'success' : 'failure';
}

export function rollCheck(input: RollCheckInput): {
  success: boolean;
  markdown: string;
  error?: string;
} {
  // Validate check-specific requirements
  if (input.checkType === 'skill' && !input.skill) {
    return {
      success: false,
      markdown: '',
      error: 'skill is required for skill checks',
    };
  }

  if ((input.checkType === 'ability' || input.checkType === 'save' || input.checkType === 'attack') && !input.ability) {
    return {
      success: false,
      markdown: '',
      error: `ability is required for ${input.checkType} checks`,
    };
  }

  // Load character if provided
  let character: Character | undefined;
  if (input.characterId || input.characterName) {
    const charResult = getCharacter({
      characterId: input.characterId,
      characterName: input.characterName,
    } as any);

    if (!charResult.success || !charResult.character) {
      return {
        success: false,
        markdown: '',
        error: charResult.error || 'Character not found',
      };
    }

    character = charResult.character;
  }

  // Handle contested checks separately
  if (input.contestedBy && input.contestedCheck) {
    return handleContestedCheck(input, character);
  }

  // Perform the roll using helper function
  const rollResult = performRoll(input, character);
  if (!rollResult.success) {
    return {
      success: false,
      markdown: '',
      error: rollResult.error,
    };
  }

  const result = rollResult.result;

  // Evaluate DC if provided
  let dcResult: 'success' | 'failure' | undefined;
  if (input.dc !== undefined) {
    dcResult = evaluateDCResult(input.checkType, result.naturalRoll, result.total, input.dc);
  }

  // Format output
  const markdown = formatCheckResult({
    checkType: input.checkType,
    checkName: result.checkName,
    character: character?.name,
    abilityKey: result.abilityKey,
    abilityMod: result.abilityMod,
    profMod: result.profMod,
    bonusMod: result.bonusMod,
    totalMod: result.totalMod,
    rollMode: result.rollMode,
    rolls: result.rolls,
    naturalRoll: result.naturalRoll,
    total: result.total,
    dc: input.dc,
    dcResult,
  });

  return {
    success: true,
    markdown,
  };
}

/**
 * Handles contested checks between two characters
 * Uses performRoll() directly for structured data instead of parsing markdown
 */
function handleContestedCheck(
  input: RollCheckInput,
  character1: Character | undefined
): {
  success: boolean;
  markdown: string;
  error?: string;
} {
  // Load contested character
  const charResult = getCharacter({ characterId: input.contestedBy } as any);
  if (!charResult.success || !charResult.character) {
    return {
      success: false,
      markdown: '',
      error: charResult.error || 'Contested character not found',
    };
  }

  const character2 = charResult.character;

  // Perform roll for character 1 using structured data (avoids regex parsing)
  const roll1 = performRoll(input, character1);
  if (!roll1.success) {
    return {
      success: false,
      markdown: '',
      error: roll1.error,
    };
  }

  // Build input for character 2's contested check
  const contestedInput: RollCheckInput = {
    characterId: character2.id,
    checkType: input.contestedCheck!.type,
    skill: input.contestedCheck!.type === 'skill' ? input.contestedCheck!.skillOrAbility as any : undefined,
    ability: input.contestedCheck!.type === 'ability' ? input.contestedCheck!.skillOrAbility as any : undefined,
  };

  // Perform roll for character 2 using structured data (avoids regex parsing)
  const roll2 = performRoll(contestedInput, character2);
  if (!roll2.success) {
    return {
      success: false,
      markdown: '',
      error: roll2.error,
    };
  }

  // Use structured data directly instead of parsing markdown
  const total1 = roll1.result.total;
  const total2 = roll2.result.total;

  // Get check names from structured result (already formatted by performRoll)
  const check1Name = roll1.result.checkName;
  const check2Name = roll2.result.checkName;

  // Determine winner (ties favor defender - character 2)
  let winner: string;
  if (total1 > total2) {
    winner = character1?.name || 'Character 1';
  } else if (total2 > total1) {
    winner = character2.name;
  } else {
    winner = 'Tie (defender wins)';
  }

  // Format contested output
  const content: string[] = [];
  const WIDTH = 68;

  content.push(centerText('CONTESTED CHECK', WIDTH));
  content.push('');
  content.push(BOX.LIGHT.H.repeat(WIDTH));
  content.push('');

  const char1Name = character1?.name || 'Unknown';
  const char2Name = character2.name;

  content.push(padText(`${char1Name} (${check1Name}): ${total1}`, WIDTH, 'left'));
  content.push(padText(`${char2Name} (${check2Name}): ${total2}`, WIDTH, 'left'));
  content.push('');
  content.push(centerText(`${total1} vs ${total2}`, WIDTH));
  content.push('');
  content.push(BOX.LIGHT.H.repeat(WIDTH));
  content.push('');
  content.push(centerText(`WINNER: ${winner}`, WIDTH));

  return {
    success: true,
    markdown: createBox('CONTESTED CHECK', content, undefined, 'HEAVY'),
  };
}

/**
 * Formats a roll check result into rich ASCII art output
 * Uses helper functions for DRY code and consistent formatting
 */
function formatCheckResult(params: {
  checkType: string;
  checkName: string;
  character?: string;
  abilityKey: string;
  abilityMod: number;
  profMod: number;
  bonusMod: number;
  totalMod: number;
  rollMode: 'normal' | 'advantage' | 'disadvantage' | 'cancelled';
  rolls: number[];
  naturalRoll: number;
  total: number;
  dc?: number;
  dcResult?: 'success' | 'failure';
}): string {
  const content: string[] = [];
  const WIDTH = 68;
  const box = BOX.LIGHT;

  // Determine critical roll status for visual indicators
  const isNat20 = params.naturalRoll === 20;
  const isNat1 = params.naturalRoll === 1;
  const criticalIndicator = isNat20 ? ' ⭐' : isNat1 ? ' 💀' : '';

  // Title - build properly based on check type (using formatSkillName helper)
  let title: string;

  if (params.checkType === 'save') {
    title = 'SAVING THROW';
  } else if (params.checkType === 'attack') {
    title = 'ATTACK ROLL';
  } else if (params.checkType === 'initiative') {
    title = 'INITIATIVE';
  } else if (params.checkType === 'skill') {
    // Use helper function for consistent title-casing
    const skillName = formatSkillName(params.checkName);
    title = skillName.toUpperCase() + ' CHECK';
  } else {
    // Ability check
    title = params.abilityKey.toUpperCase() + ' Check';
  }

  content.push(centerText(title, WIDTH));

  if (params.character) {
    content.push(centerText(`Character: ${params.character}`, WIDTH));
  }

  content.push('');
  content.push(box.H.repeat(WIDTH));
  content.push('');

  // Add check type description for certain types (using helper)
  if (params.checkType === 'skill' && params.checkName) {
    const skillName = formatSkillName(params.checkName);
    content.push(padText(`Check Type: ${skillName}`, WIDTH, 'left'));
  } else if (params.checkType === 'save') {
    content.push(padText('Check Type: Save (SAVE)', WIDTH, 'left'));
  } else if (params.checkType === 'initiative') {
    content.push(padText('Check Type: Initiative', WIDTH, 'left'));
  } else if (params.checkType === 'attack') {
    content.push(padText('Check Type: Attack Roll', WIDTH, 'left'));
  }

  // Roll information with Advantage/Disadvantage indication and critical indicators
  if (params.rollMode === 'advantage') {
    const keptRoll = Math.max(...params.rolls);
    const keptIndicator = keptRoll === 20 ? ' ⭐' : keptRoll === 1 ? ' 💀' : '';
    content.push(padText(`Rolls: [${params.rolls.join(', ')}] (Advantage - kept ${keptRoll}${keptIndicator})`, WIDTH, 'left'));
  } else if (params.rollMode === 'disadvantage') {
    const keptRoll = Math.min(...params.rolls);
    const keptIndicator = keptRoll === 20 ? ' ⭐' : keptRoll === 1 ? ' 💀' : '';
    content.push(padText(`Rolls: [${params.rolls.join(', ')}] (Disadvantage - kept ${keptRoll}${keptIndicator})`, WIDTH, 'left'));
  } else if (params.rollMode === 'cancelled') {
    // Both advantage and disadvantage cancel out
    content.push(padText(`Roll: ${params.naturalRoll}${criticalIndicator} (Cancel - Advantage and Disadvantage neither apply)`, WIDTH, 'left'));
  } else {
    content.push(padText(`Roll: ${params.naturalRoll}${criticalIndicator}`, WIDTH, 'left'));
  }

  // Modifier breakdown using helper function for consistent sign formatting
  const abilityName = params.abilityKey.toUpperCase();
  content.push(padText(`${abilityName} Modifier: ${formatModifierSign(params.abilityMod)}`, WIDTH, 'left'));

  if (params.profMod > 0) {
    content.push(padText(`Proficiency Bonus: ${formatModifierSign(params.profMod)}`, WIDTH, 'left'));
  }

  if (params.bonusMod !== 0) {
    content.push(padText(`Additional Bonus: ${formatModifierSign(params.bonusMod)}`, WIDTH, 'left'));
  }

  // Display total modifier if there are multiple components
  if (params.profMod > 0 || params.bonusMod !== 0) {
    content.push(padText(`Total Modifier: ${formatModifierSign(params.totalMod)}`, WIDTH, 'left'));
  }

  content.push('');
  content.push(box.H.repeat(WIDTH));
  content.push(centerText(`Total: ${params.total}`, WIDTH));

  // DC result with enhanced visual feedback
  if (params.dc !== undefined && params.dcResult) {
    content.push('');
    const resultSymbol = params.dcResult === 'success' ? '✓ SUCCESS' : '✗ FAILURE';
    content.push(centerText(`DC ${params.dc}: ${resultSymbol}`, WIDTH));
  }

  return createBox(title, content, undefined, 'HEAVY');
}

// ============================================================
// DELETE CHARACTER HANDLER
// ============================================================

/**
 * Delete a character permanently from storage.
 * 
 * This function:
 * 1. Resolves the character by ID or name lookup
 * 2. Verifies the character exists
 * 3. Reads character data for confirmation display
 * 4. Deletes the character JSON file
 * 5. Returns ASCII-formatted confirmation
 * 
 * @param input - Delete parameters (characterId or characterName, or batch)
 * @returns Result with success status and ASCII-formatted confirmation
 * @throws Never throws - errors returned in result object
 */
export function deleteCharacter(input: DeleteCharacterInput): {
  success: boolean;
  markdown: string;
  error?: string;
} {
  // Check if this is a batch operation
  if ('batch' in input && input.batch) {
    return deleteCharacterBatch(input.batch);
  }

  // Type assertion: we know it's a single delete at this point
  const singleInput = input as z.infer<typeof singleDeleteSchema>;

  const dataDir = path.join(DATA_ROOT, 'characters');

  // Resolve character ID (either from direct ID or by name lookup)
  let characterId: string | undefined = singleInput.characterId;

  if (!characterId && singleInput.characterName) {
    const foundId = findCharacterByName(singleInput.characterName);
    if (!foundId) {
      return {
        success: false,
        markdown: '',
        error: `Character not found with name: ${singleInput.characterName}`,
      };
    }
    characterId = foundId;
  }

  if (!characterId) {
    return {
      success: false,
      markdown: '',
      error: 'Either characterId or characterName must be provided',
    };
  }

  const filePath = path.join(dataDir, `${characterId}.json`);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return {
      success: false,
      markdown: '',
      error: `Character not found: ${characterId}`,
    };
  }

  // Read character data before deletion for confirmation display
  let character: Character;
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    character = JSON.parse(fileContent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: '',
      error: `Failed to read character: ${message}`,
    };
  }

  // Delete the file
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdown: '',
      error: `Failed to delete character: ${message}`,
    };
  }

  // Format confirmation output
  const markdown = formatDeleteConfirmation(character);

  return {
    success: true,
    markdown,
  };
}

/**
 * Batch delete multiple characters.
 * Reports partial success - some deletions may fail while others succeed.
 * 
 * @param requests - Array of delete requests (by ID or name)
 * @returns Result with success status and batch summary
 */
function deleteCharacterBatch(
  requests: Array<z.infer<typeof singleDeleteSchema>>
): {
  success: boolean;
  markdown: string;
  error?: string;
} {
  const deleted: Character[] = [];
  const errors: Array<{ name: string; error: string }> = [];

  for (const request of requests) {
    // Need to get character info before deleting
    const getResult = getCharacter(request as any);
    
    if (getResult.success && getResult.character) {
      const result = deleteCharacter(request as any);
      if (result.success) {
        deleted.push(getResult.character);
      } else {
        errors.push({
          name: getResult.character.name,
          error: result.error || 'Unknown error',
        });
      }
    } else {
      errors.push({
        name: request.characterName || request.characterId || 'Unknown',
        error: getResult.error || 'Character not found',
      });
    }
  }

  return {
    success: true,
    markdown: formatBatchDeleteResult(deleted, errors),
  };
}

/**
 * Format deletion confirmation as ASCII box.
 * Shows character details before confirming permanent removal.
 * 
 * @param character - The character that was deleted
 * @returns ASCII-formatted box with deletion confirmation
 */
function formatDeleteConfirmation(character: Character): string {
  const WIDTH = 60;
  const content: string[] = [];

  content.push('');
  content.push(`Name: ${character.name}`);
  content.push(`Class: Level ${character.level} ${character.class}`);
  content.push(`Race: ${character.race}`);
  content.push(`Type: ${character.characterType.toUpperCase()}`);
  content.push('');
  content.push('Character data has been permanently removed.');
  content.push('');

  return createBox('CHARACTER DELETED', content, WIDTH, 'HEAVY');
}

/**
 * Format batch deletion result as ASCII box.
 * Shows summary of successful deletions and any failures.
 * 
 * @param deleted - Characters that were successfully deleted
 * @param errors - Deletion failures with character name and error message
 * @returns ASCII-formatted box with batch deletion summary
 */
function formatBatchDeleteResult(
  deleted: Character[],
  errors: Array<{ name: string; error: string }>
): string {
  const WIDTH = 60;
  const content: string[] = [];

  content.push('');
  content.push(`Deleted: ${deleted.length}`);
  content.push(`Failed: ${errors.length}`);
  content.push('');

  if (deleted.length > 0) {
    content.push('DELETED:');
    for (const char of deleted) {
      content.push(`  ✓ ${char.name} (${char.class} ${char.level})`);
    }
    content.push('');
  }

  if (errors.length > 0) {
    content.push('FAILED:');
    for (const err of errors) {
      content.push(`  ✗ ${err.name}: ${err.error}`);
    }
    content.push('');
  }

  return createBox('BATCH DELETE RESULT', content, WIDTH, 'HEAVY');
}

// ============================================================
// TAKE REST HANDLER
// ============================================================

/**
 * In-memory store for hit dice tracking.
 * Maps characterId to { current, max } hit dice counts.
 * Max hit dice = character level, restored by half (rounded up) on long rest.
 * 
 * @remarks
 * Hit dice are tracked separately from the character file to allow
 * runtime tracking without modifying persistent character data.
 */
const hitDiceStore = new Map<string, { current: number; max: number }>();

/**
 * Tracks changes made during rest processing.
 * Used for building the result output.
 */
interface RestChanges {
  /** HP before rest started */
  hpBefore: number;
  /** HP after rest completed */
  hpAfter: number;
  /** Hit dice count before rest */
  hitDiceBefore: number;
  /** Hit dice count after rest */
  hitDiceAfter: number;
  /** Maximum hit dice (equals character level) */
  hitDiceMax: number;
  /** Number of hit dice spent (short rest only) */
  hitDiceSpent?: number;
  /** Total healing rolled from hit dice (short rest only) */
  healingRolled?: number;
  /** List of condition names that were cleared */
  conditionsCleared: string[];
  /** Whether exhaustion was reduced by 1 level */
  exhaustionReduced: boolean;
  /** Whether spell slots were restored (placeholder for manage_spell_slots) */
  spellSlotsRestored: boolean;
  /** Whether the rest was marked as interrupted */
  interrupted: boolean;
}

/**
 * Get hit dice info for a character, initializing if needed.
 * Loads from persisted character JSON if available.
 *
 * @param characterId - The character's unique ID
 * @param level - Character level (for initialization)
 * @returns Hit dice state { current, max }
 */
function getHitDice(characterId: string, level: number): { current: number; max: number } {
  if (!hitDiceStore.has(characterId)) {
    // Try to load from character JSON file first
    const charFilePath = path.join(DATA_ROOT, 'characters', `${characterId}.json`);
    if (fs.existsSync(charFilePath)) {
      try {
        const charData = JSON.parse(fs.readFileSync(charFilePath, 'utf-8'));
        if (charData.hitDice && typeof charData.hitDice.current === 'number' && typeof charData.hitDice.max === 'number') {
          hitDiceStore.set(characterId, { current: charData.hitDice.current, max: charData.hitDice.max });
          return hitDiceStore.get(characterId)!;
        }
      } catch {
        // Fall through to default initialization
      }
    }
    // Default: initialize with full hit dice
    hitDiceStore.set(characterId, { current: level, max: level });
  }
  return hitDiceStore.get(characterId)!;
}

/**
 * Process a rest for a character following D&D 5e rules.
 * 
 * **Short Rest (1+ hour):**
 * - Spend hit dice to heal (roll hit die + CON mod per die, minimum 1 HP)
 * - Clear conditions with `until_rest` duration
 * 
 * **Long Rest (8+ hours):**
 * - Restore all HP (unless `restoreHp: false`)
 * - Restore half hit dice rounded up (unless `restoreHitDice: false`)
 * - Note spell slot restoration (actual tracking via manage_spell_slots)
 * - Reduce exhaustion by 1 level
 * - Clear conditions with `until_rest` duration
 * 
 * @param input - Rest parameters including restType, hitDiceToSpend, restore flags
 * @returns Result with success status and formatted ASCII output
 * 
 * @example
 * // Short rest spending 2 hit dice
 * takeRest({ characterId: 'abc', restType: 'short', hitDiceToSpend: 2 })
 * 
 * @example
 * // Long rest without HP restoration (for narrative reasons)
 * takeRest({ characterId: 'abc', restType: 'long', restoreHp: false })
 */
export function takeRest(input: TakeRestInput | { batch: TakeRestInput[] }): {
  success: boolean;
  markdown: string;
  error?: string;
} {
  // Check if this is a batch operation
  if ('batch' in input && input.batch) {
    return takeRestBatch(input.batch);
  }

  const singleInput = input as TakeRestInput;
  
  // Resolve character ID from name if needed
  let characterId = singleInput.characterId;
  if (!characterId && singleInput.characterName) {
    characterId = findCharacterByName(singleInput.characterName) || undefined;
    if (!characterId) {
      return {
        success: false,
        markdown: '',
        error: `Character "${singleInput.characterName}" not found`,
      };
    }
  }

  if (!characterId) {
    return {
      success: false,
      markdown: '',
      error: 'Either characterId or characterName must be provided',
    };
  }

  // Load character
  const getResult = getCharacter({ characterId });
  if (!getResult.success || !getResult.character) {
    return {
      success: false,
      markdown: '',
      error: `Character not found: ${characterId}`,
    };
  }

  const character = getResult.character;
  const hitDice = getHitDice(characterId, character.level);
  const restType = singleInput.restType;
  const isLongRest = restType === 'long';

  // Track changes for output
  const changes: RestChanges = {
    hpBefore: character.hp,
    hpAfter: character.hp,
    hitDiceBefore: hitDice.current,
    hitDiceAfter: hitDice.current,
    hitDiceMax: hitDice.max,
    conditionsCleared: [],
    exhaustionReduced: false,
    spellSlotsRestored: false,
    interrupted: !singleInput.uninterrupted,
  };

  // Process based on rest type
  if (isLongRest) {
    // Long rest: restore HP if enabled
    if (singleInput.restoreHp !== false) {
      changes.hpAfter = character.maxHp;
    }

    // Long rest: restore half hit dice (rounded up)
    if (singleInput.restoreHitDice !== false) {
      const hitDiceToRestore = Math.ceil(character.level / 2);
      changes.hitDiceAfter = Math.min(hitDice.max, hitDice.current + hitDiceToRestore);
    }

    // Long rest: restore spell slots (supports custom classes)
    if (singleInput.restoreSpellSlots !== false) {
      changes.spellSlotsRestored = true;
      // Actually restore spell slots (with custom class support)
      restoreAllSpellSlots(characterId, character.class, character.level, character.customClass);
    }

    // Long rest: reduce exhaustion by 1
    const conditions = getActiveConditions(characterId);
    const exhaustionCondition = conditions.find(c => c.condition === 'exhaustion');
    if (exhaustionCondition && exhaustionCondition.exhaustionLevel && exhaustionCondition.exhaustionLevel > 1) {
      try {
        manageCondition({
          targetId: characterId,
          operation: 'add',
          condition: 'exhaustion',
          exhaustionLevels: exhaustionCondition.exhaustionLevel - 1,
        });
        changes.exhaustionReduced = true;
      } catch {
        // Ignore exhaustion reduction errors
      }
    } else if (exhaustionCondition) {
      // Remove exhaustion entirely if at level 1
      try {
        manageCondition({
          targetId: characterId,
          operation: 'remove',
          condition: 'exhaustion',
        });
        changes.exhaustionReduced = true;
      } catch {
        // Ignore exhaustion removal errors
      }
    }
  } else {
    // Short rest: spend hit dice to heal
    const hitDiceToSpend = singleInput.hitDiceToSpend || 0;
    if (hitDiceToSpend > 0 && hitDice.current > 0) {
      const actualSpent = Math.min(hitDiceToSpend, hitDice.current);
      changes.hitDiceAfter = hitDice.current - actualSpent;
      
      // Calculate healing: roll hit dice + CON modifier per die
      const hitDieSize = HIT_DIE_BY_CLASS[character.class] || 8;
      const conMod = calculateModifier(character.stats.con);
      
      let totalHealing = 0;
      for (let i = 0; i < actualSpent; i++) {
        const roll = Math.floor(Math.random() * hitDieSize) + 1;
        totalHealing += Math.max(1, roll + conMod); // Minimum 1 HP per die
      }
      
      changes.hpAfter = Math.min(character.maxHp, character.hp + totalHealing);
      changes.hitDiceSpent = actualSpent;
      changes.healingRolled = totalHealing;
    }

    // Short rest: restore warlock pact magic slots
    if (character.class === 'Warlock') {
      restorePactSlots(characterId);
    }
  }

  // Clear conditions with until_rest duration (both rest types)
  const conditions = getActiveConditions(characterId);
  for (const condition of conditions) {
    if (condition.duration === 'until_rest') {
      try {
        manageCondition({
          targetId: characterId,
          operation: 'remove',
          condition: condition.condition as 'blinded' | 'charmed' | 'deafened' | 'frightened' | 'grappled' | 'incapacitated' | 'invisible' | 'paralyzed' | 'petrified' | 'poisoned' | 'prone' | 'restrained' | 'stunned' | 'unconscious' | 'exhaustion',
        });
        changes.conditionsCleared.push(condition.condition);
      } catch {
        // Ignore removal errors
      }
    }
  }

  // Clear explicitly specified conditions
  if (singleInput.clearConditions && singleInput.clearConditions.length > 0) {
    for (const conditionName of singleInput.clearConditions) {
      const hasCondition = conditions.some(c => c.condition === conditionName);
      if (hasCondition && !changes.conditionsCleared.includes(conditionName)) {
        try {
          manageCondition({
            targetId: characterId,
            operation: 'remove',
            condition: conditionName as 'blinded' | 'charmed' | 'deafened' | 'frightened' | 'grappled' | 'incapacitated' | 'invisible' | 'paralyzed' | 'petrified' | 'poisoned' | 'prone' | 'restrained' | 'stunned' | 'unconscious' | 'exhaustion',
          });
          changes.conditionsCleared.push(conditionName);
        } catch {
          // Ignore removal errors
        }
      }
    }
  }

  // Apply HP changes
  if (changes.hpAfter !== changes.hpBefore) {
    updateCharacter({
      characterId,
      hp: changes.hpAfter,
    });
  }

  // Update hit dice store and persist to character JSON
  hitDiceStore.set(characterId, { current: changes.hitDiceAfter, max: changes.hitDiceMax });

  // Persist hit dice to character JSON file
  const charFilePath = path.join(DATA_ROOT, 'characters', `${characterId}.json`);
  try {
    if (fs.existsSync(charFilePath)) {
      const charData = JSON.parse(fs.readFileSync(charFilePath, 'utf-8'));
      charData.hitDice = { current: changes.hitDiceAfter, max: changes.hitDiceMax };
      fs.writeFileSync(charFilePath, JSON.stringify(charData, null, 2), 'utf-8');
    }
  } catch {
    // Silent fail - in-memory store is still updated
  }

  return {
    success: true,
    markdown: formatRestResult(character, restType, changes),
  };
}

/**
 * Format rest result as ASCII box.
 * Shows character name, rest type, and all changes made.
 * 
 * @param character - The character who rested
 * @param restType - 'short' or 'long'
 * @param changes - Changes that occurred during rest
 * @returns ASCII-formatted box with rest summary
 */
function formatRestResult(
  character: Character,
  restType: 'short' | 'long',
  changes: RestChanges
): string {
  const WIDTH = 60;
  const content: string[] = [];
  const isLongRest = restType === 'long';
  const title = isLongRest ? 'LONG REST COMPLETED' : 'SHORT REST COMPLETED';

  content.push('');
  content.push(`Character: ${character.name}`);
  content.push(`Rest Type: ${restType.charAt(0).toUpperCase() + restType.slice(1)} Rest`);
  
  if (changes.interrupted) {
    content.push('⚠ WARNING: Rest was interrupted');
  }
  
  content.push('');
  content.push('─'.repeat(WIDTH - 4));
  content.push('');

  // HP Changes
  if (changes.hpAfter !== changes.hpBefore) {
    const hpGained = changes.hpAfter - changes.hpBefore;
    content.push(`HP: ${changes.hpBefore} → ${changes.hpAfter}/${character.maxHp} (+${hpGained})`);
    if (changes.healingRolled) {
      content.push(`  Healing from hit dice: ${changes.healingRolled}`);
    }
  } else if (changes.hpBefore >= character.maxHp) {
    content.push(`HP: ${changes.hpAfter}/${character.maxHp} (already full)`);
  } else {
    content.push(`HP: ${changes.hpAfter}/${character.maxHp} (no change)`);
  }

  // Hit Dice Changes
  if (changes.hitDiceSpent) {
    content.push(`Hit Dice Spent: ${changes.hitDiceSpent}`);
  }
  if (changes.hitDiceAfter !== changes.hitDiceBefore) {
    content.push(`Hit Dice: ${changes.hitDiceBefore} → ${changes.hitDiceAfter}/${changes.hitDiceMax}`);
  } else {
    content.push(`Hit Dice: ${changes.hitDiceAfter}/${changes.hitDiceMax}`);
  }

  // Spell Slots (deferred to manage_spell_slots)
  if (isLongRest && changes.spellSlotsRestored) {
    content.push(`Spell Slots: All restored`);
  }

  // Conditions Cleared
  if (changes.conditionsCleared.length > 0) {
    content.push('');
    content.push('Conditions Cleared:');
    for (const cond of changes.conditionsCleared) {
      content.push(`  ✓ ${cond}`);
    }
  }

  // Exhaustion
  if (changes.exhaustionReduced) {
    content.push('');
    content.push('Exhaustion: Reduced by 1 level');
  }

  content.push('');

  return createBox(title, content, WIDTH, 'HEAVY');
}

/**
 * Process batch rest for multiple characters.
 * 
 * @param requests - Array of rest requests
 * @returns Result with batch summary
 */
function takeRestBatch(
  requests: TakeRestInput[]
): {
  success: boolean;
  markdown: string;
  error?: string;
} {
  const results: Array<{
    name: string;
    restType: string;
    success: boolean;
    hpChange?: string;
    error?: string;
  }> = [];

  for (const request of requests) {
    // Get character name for display
    let charName = request.characterName || request.characterId || 'Unknown';
    if (request.characterId && !request.characterName) {
      const getResult = getCharacter({ characterId: request.characterId });
      if (getResult.success && getResult.character) {
        charName = getResult.character.name;
      }
    }

    const result = takeRest(request);
    if (result.success) {
      results.push({
        name: charName,
        restType: request.restType,
        success: true,
      });
    } else {
      results.push({
        name: charName,
        restType: request.restType,
        success: false,
        error: result.error,
      });
    }
  }

  return {
    success: true,
    markdown: formatBatchRestResult(results),
  };
}

/**
 * Format batch rest result as ASCII box.
 * 
 * @param results - Array of individual rest results
 * @returns ASCII-formatted box with batch summary
 */
function formatBatchRestResult(
  results: Array<{
    name: string;
    restType: string;
    success: boolean;
    error?: string;
  }>
): string {
  const WIDTH = 60;
  const content: string[] = [];

  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  content.push('');
  content.push(`Rested: ${succeeded.length}`);
  content.push(`Failed: ${failed.length}`);
  content.push('');

  if (succeeded.length > 0) {
    content.push('RESTED:');
    for (const r of succeeded) {
      const typeLabel = r.restType === 'long' ? 'Long' : 'Short';
      content.push(`  ✓ ${r.name} (${typeLabel} Rest)`);
    }
    content.push('');
  }

  if (failed.length > 0) {
    content.push('FAILED:');
    for (const r of failed) {
      content.push(`  ✗ ${r.name}: ${r.error || 'Unknown error'}`);
    }
    content.push('');
  }

  return createBox('BATCH REST RESULT', content, WIDTH, 'HEAVY');
}

// ============================================================
// MANAGE SPELL SLOTS HANDLER
// ============================================================

/**
 * Standard ASCII output width for spell slot displays.
 * Matches other character module outputs for visual consistency.
 */
const SPELL_SLOT_WIDTH = 60;

/**
 * Ordinal suffixes for spell slot levels.
 * Used for human-readable output: "1st", "2nd", "3rd", etc.
 */
const SLOT_ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'] as const;

// ============================================================
// D&D 5E SPELL SLOT PROGRESSION TABLES
// ============================================================

/**
 * D&D 5e full caster spell slot progression table (PHB p.201).
 * 
 * Maps character level → array of slots per spell level [1st, 2nd, 3rd, 4th, 5th, 6th, 7th, 8th, 9th].
 * 
 * **Full casters:** Wizard, Sorcerer, Bard, Cleric, Druid
 * 
 * @example
 * FULL_CASTER_SLOTS[5] // [4, 3, 2, 0, 0, 0, 0, 0, 0] = 4 1st-level, 3 2nd-level, 2 3rd-level
 */
const FULL_CASTER_SLOTS: Record<number, number[]> = {
  1:  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  2:  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  3:  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  4:  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  5:  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  6:  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  7:  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  8:  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  9:  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  10: [4, 3, 3, 3, 2, 0, 0, 0, 0],
  11: [4, 3, 3, 3, 2, 1, 0, 0, 0],
  12: [4, 3, 3, 3, 2, 1, 0, 0, 0],
  13: [4, 3, 3, 3, 2, 1, 1, 0, 0],
  14: [4, 3, 3, 3, 2, 1, 1, 0, 0],
  15: [4, 3, 3, 3, 2, 1, 1, 1, 0],
  16: [4, 3, 3, 3, 2, 1, 1, 1, 0],
  17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
  18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
  19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
  20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
};

/**
 * D&D 5e half caster spell slot progression table (PHB).
 * 
 * Maps character level → array of slots per spell level [1st, 2nd, 3rd, 4th, 5th].
 * Half casters gain spell slots at half the rate of full casters.
 * 
 * **Half casters:** Paladin, Ranger
 * 
 * @remarks
 * Spellcasting begins at level 2. Half casters max out at 5th-level spells.
 * 
 * @example
 * HALF_CASTER_SLOTS[5] // [4, 2, 0, 0, 0] = 4 1st-level, 2 2nd-level slots
 */
const HALF_CASTER_SLOTS: Record<number, number[]> = {
  1:  [0, 0, 0, 0, 0],
  2:  [2, 0, 0, 0, 0],
  3:  [3, 0, 0, 0, 0],
  4:  [3, 0, 0, 0, 0],
  5:  [4, 2, 0, 0, 0],
  6:  [4, 2, 0, 0, 0],
  7:  [4, 3, 0, 0, 0],
  8:  [4, 3, 0, 0, 0],
  9:  [4, 3, 2, 0, 0],
  10: [4, 3, 2, 0, 0],
  11: [4, 3, 3, 0, 0],
  12: [4, 3, 3, 0, 0],
  13: [4, 3, 3, 1, 0],
  14: [4, 3, 3, 1, 0],
  15: [4, 3, 3, 2, 0],
  16: [4, 3, 3, 2, 0],
  17: [4, 3, 3, 3, 1],
  18: [4, 3, 3, 3, 1],
  19: [4, 3, 3, 3, 2],
  20: [4, 3, 3, 3, 2],
};

/**
 * D&D 5e third caster spell slot progression table (PHB).
 * 
 * Maps character level → array of slots per spell level [1st, 2nd, 3rd, 4th].
 * Third casters (subclass-granted) gain slots at one-third the rate.
 * 
 * **Third casters:** Eldritch Knight (Fighter), Arcane Trickster (Rogue)
 * 
 * @remarks
 * Spellcasting begins at level 3. Third casters max out at 4th-level spells.
 * Note: Base Fighter/Rogue classes are non-casters; these are subclass progressions.
 * 
 * @example
 * THIRD_CASTER_SLOTS[7] // [4, 2, 0, 0] = 4 1st-level, 2 2nd-level slots
 */
const THIRD_CASTER_SLOTS: Record<number, number[]> = {
  1:  [0, 0, 0, 0],
  2:  [0, 0, 0, 0],
  3:  [2, 0, 0, 0],
  4:  [3, 0, 0, 0],
  5:  [3, 0, 0, 0],
  6:  [3, 0, 0, 0],
  7:  [4, 2, 0, 0],
  8:  [4, 2, 0, 0],
  9:  [4, 2, 0, 0],
  10: [4, 3, 0, 0],
  11: [4, 3, 0, 0],
  12: [4, 3, 0, 0],
  13: [4, 3, 2, 0],
  14: [4, 3, 2, 0],
  15: [4, 3, 2, 0],
  16: [4, 3, 3, 0],
  17: [4, 3, 3, 0],
  18: [4, 3, 3, 0],
  19: [4, 3, 3, 1],
  20: [4, 3, 3, 1],
};

/**
 * D&D 5e Warlock Pact Magic progression table (PHB p.107).
 * 
 * Maps warlock level → { slots: number of pact slots, slotLevel: spell level for all slots }.
 * 
 * **Key differences from standard spellcasting:**
 * - All pact slots are the same level (determined by warlock level)
 * - Pact slots refresh on short rest, not just long rest
 * - Tracked separately from multiclass spell slots
 * - Warlocks gain Mystic Arcanum (6th-9th) separately at higher levels
 * 
 * @remarks
 * At level 5, a warlock has 2 pact slots that cast at 3rd level.
 * At level 11+, warlocks have 3 slots. At level 17+, they have 4 slots.
 * Slot level caps at 5th (reached at level 9).
 * 
 * @example
 * WARLOCK_PACT_MAGIC[5] // { slots: 2, slotLevel: 3 } = Two 3rd-level slots
 */
const WARLOCK_PACT_MAGIC: Record<number, { slots: number; slotLevel: number }> = {
  1:  { slots: 1, slotLevel: 1 },
  2:  { slots: 2, slotLevel: 1 },
  3:  { slots: 2, slotLevel: 2 },
  4:  { slots: 2, slotLevel: 2 },
  5:  { slots: 2, slotLevel: 3 },
  6:  { slots: 2, slotLevel: 3 },
  7:  { slots: 2, slotLevel: 4 },
  8:  { slots: 2, slotLevel: 4 },
  9:  { slots: 2, slotLevel: 5 },
  10: { slots: 2, slotLevel: 5 },
  11: { slots: 3, slotLevel: 5 },
  12: { slots: 3, slotLevel: 5 },
  13: { slots: 3, slotLevel: 5 },
  14: { slots: 3, slotLevel: 5 },
  15: { slots: 3, slotLevel: 5 },
  16: { slots: 3, slotLevel: 5 },
  17: { slots: 4, slotLevel: 5 },
  18: { slots: 4, slotLevel: 5 },
  19: { slots: 4, slotLevel: 5 },
  20: { slots: 4, slotLevel: 5 },
};

// ============================================================
// SPELLCASTING CLASS CONFIGURATION
// ============================================================

/**
 * Spellcasting progression type enumeration.
 * Determines which slot table to use for a given class.
 */
type SpellcastingType = 'full' | 'half' | 'third' | 'warlock' | 'none';

/**
 * Spellcasting type mapped by D&D 5e class name.
 * 
 * | Type | Classes | Max Spell Level | Slot Progression |
 * |------|---------|-----------------|------------------|
 * | full | Wizard, Sorcerer, Cleric, Druid, Bard | 9th | Full table |
 * | half | Paladin, Ranger | 5th | Half rate, starts L2 |
 * | third | Eldritch Knight, Arcane Trickster | 4th | Third rate, starts L3 |
 * | warlock | Warlock | 5th (Pact) + Arcanum | Short rest recovery |
 * | none | Fighter, Rogue, Barbarian, Monk | - | No spellcasting |
 * 
 * @remarks
 * Base Fighter and Rogue are listed as 'none' since the subclass-granted
 * spellcasting (Eldritch Knight, Arcane Trickster) would require subclass
 * tracking. For those builds, use DM override via `operation: 'set'`.
 */
const SPELLCASTING_BY_CLASS: Record<string, SpellcastingType> = {
  'Wizard': 'full',
  'Sorcerer': 'full',
  'Cleric': 'full',
  'Druid': 'full',
  'Bard': 'full',
  'Paladin': 'half',
  'Ranger': 'half',
  'Warlock': 'warlock',
  'Fighter': 'none',
  'Rogue': 'none',
  'Barbarian': 'none',
  'Monk': 'none',
};

/**
 * Get spellcasting type for a class, supporting custom classes.
 * 
 * @param className - The class name
 * @param customClass - Optional custom class definition
 * @returns Spellcasting progression type
 */
function getSpellcastingType(className: string, customClass?: CustomClass): SpellcastingType {
  // Custom class takes precedence
  if (customClass?.spellcasting) {
    return customClass.spellcasting;
  }
  // Check standard classes
  return SPELLCASTING_BY_CLASS[className] || 'none';
}

// ============================================================
// SPELL SLOT DATA STRUCTURES
// ============================================================

/**
 * Single spell slot level tracking.
 * @property current - Currently available slots at this level
 * @property max - Maximum slots at this level (determined by class/level)
 */
interface SlotLevel {
  current: number;
  max: number;
}

/**
 * Warlock pact magic slot tracking.
 * Pact slots are separate from regular spell slots and have unique behavior.
 * 
 * @property current - Currently available pact slots
 * @property max - Maximum pact slots (1-4 based on warlock level)
 * @property slotLevel - Spell level for ALL pact slots (1-5, determined by warlock level)
 */
interface PactSlotData {
  current: number;
  max: number;
  slotLevel: number;
}

/**
 * Complete spell slot state for a character.
 * 
 * Tracks both standard spell slots (by level) and warlock pact magic slots.
 * This separation allows for proper multiclass handling and short/long rest
 * recovery differences.
 * 
 * @property slots - Standard spell slots indexed by level (1-9)
 * @property pactSlots - Optional warlock pact magic pool (separate from regular slots)
 * 
 * @example
 * // Level 5 Wizard
 * { slots: { 1: { current: 4, max: 4 }, 2: { current: 3, max: 3 }, 3: { current: 2, max: 2 }, ... } }
 * 
 * @example  
 * // Level 5 Warlock
 * { slots: { ... }, pactSlots: { current: 2, max: 2, slotLevel: 3 } }
 */
interface SpellSlotData {
  slots: Record<number, SlotLevel>;
  pactSlots?: PactSlotData;
}

/**
 * In-memory store for spell slot tracking.
 * 
 * Maps `characterId` → `SpellSlotData`.
 * 
 * @remarks
 * Spell slots are tracked in-memory (not persisted to character JSON files)
 * because they change frequently during play and should reset on server restart.
 * This matches how hit dice are tracked in `hitDiceStore`.
 * 
 * **Lifecycle:**
 * - Initialized on first access (view, expend, or via take_rest/execute_action)
 * - Long rest restores all slots via `restoreAllSpellSlots()`
 * - Short rest restores warlock pact slots via `restorePactSlots()`
 * - Cleared on server restart (stateless session)
 * 
 * @see hitDiceStore - Analogous tracking for hit dice
 */
const spellSlotStore = new Map<string, SpellSlotData>();

/**
 * Calculate maximum spell slots for a character based on class and level.
 * Supports custom classes via customClass.spellcasting field.
 * 
 * Looks up the appropriate progression table based on spellcasting type:
 * - Full casters: 9 spell levels, full progression
 * - Half casters: 5 spell levels, delayed progression
 * - Third casters: 4 spell levels, very delayed progression
 * - Warlocks/Non-casters: No standard slots (warlocks use pact magic)
 * 
 * @param className - The character's class (case-sensitive: "Wizard", "Fighter", etc.)
 * @param level - The character's level (1-20)
 * @param customClass - Optional custom class definition
 * @returns Array of 9 slot counts indexed by spell level [1st, 2nd, 3rd, 4th, 5th, 6th, 7th, 8th, 9th]
 * 
 * @example
 * getMaxSpellSlots('Wizard', 5)  // [4, 3, 2, 0, 0, 0, 0, 0, 0]
 * getMaxSpellSlots('Paladin', 5) // [4, 2, 0, 0, 0, 0, 0, 0, 0]
 * getMaxSpellSlots('Fighter', 5) // [0, 0, 0, 0, 0, 0, 0, 0, 0]
 * getMaxSpellSlots('Netrunner', 5, { spellcasting: 'full' }) // [4, 3, 2, 0, 0, 0, 0, 0, 0]
 */
function getMaxSpellSlots(className: string, level: number, customClass?: CustomClass): number[] {
  const casterType = getSpellcastingType(className, customClass);
  
  switch (casterType) {
    case 'full':
      return FULL_CASTER_SLOTS[level] || [0, 0, 0, 0, 0, 0, 0, 0, 0];
    case 'half':
      // Half casters only have up to 5th level spells
      const halfSlots = HALF_CASTER_SLOTS[level] || [0, 0, 0, 0, 0];
      return [...halfSlots, 0, 0, 0, 0];
    case 'third':
      // Third casters only have up to 4th level spells
      const thirdSlots = THIRD_CASTER_SLOTS[level] || [0, 0, 0, 0];
      return [...thirdSlots, 0, 0, 0, 0, 0];
    case 'warlock':
    case 'none':
    default:
      return [0, 0, 0, 0, 0, 0, 0, 0, 0];
  }
}

/**
 * Initialize spell slots for a character based on their class and level.
 * 
 * @param characterId - The character's unique ID
 * @param className - The character's class
 * @param level - The character's level
 * @param customClass - Optional custom class definition
 * @returns Initialized spell slot data
 */
function initializeSpellSlots(
  characterId: string,
  className: string,
  level: number,
  customClass?: CustomClass
): SpellSlotData {
  const maxSlots = getMaxSpellSlots(className, level, customClass);
  const casterType = getSpellcastingType(className, customClass);
  
  const data: SpellSlotData = {
    slots: {},
  };
  
  // Initialize regular slots
  for (let i = 1; i <= 9; i++) {
    const max = maxSlots[i - 1] || 0;
    data.slots[i] = { current: max, max };
  }
  
  // Initialize warlock pact magic if applicable
  if (casterType === 'warlock') {
    const pactInfo = WARLOCK_PACT_MAGIC[level] || { slots: 1, slotLevel: 1 };
    data.pactSlots = {
      current: pactInfo.slots,
      max: pactInfo.slots,
      slotLevel: pactInfo.slotLevel,
    };
  }
  
  spellSlotStore.set(characterId, data);
  return data;
}

/**
 * Get spell slot data for a character, initializing if needed.
 * Supports custom classes via stored customClass field.
 * 
 * @param characterId - The character's unique ID
 * @param className - The character's class
 * @param level - The character's level
 * @param customClass - Optional custom class definition
 * @returns Spell slot data
 */
function getSpellSlots(
  characterId: string,
  className: string,
  level: number,
  customClass?: CustomClass
): SpellSlotData {
  if (!spellSlotStore.has(characterId)) {
    return initializeSpellSlots(characterId, className, level, customClass);
  }
  return spellSlotStore.get(characterId)!;
}

/**
 * Get current spell slot data for a character if it exists in the store.
 * Used by encounter commit to check if spell slots need to be persisted.
 *
 * @param characterId - The character's unique ID
 * @returns Spell slot data or undefined if not tracked
 */
export function getSpellSlotDataForCharacter(characterId: string): {
  slots: Record<number, { current: number; max: number }>;
  pactSlots?: { current: number; max: number; slotLevel: number };
} | undefined {
  const data = spellSlotStore.get(characterId);
  if (!data) return undefined;

  // Convert to simplified format for persistence
  const result: {
    slots: Record<number, { current: number; max: number }>;
    pactSlots?: { current: number; max: number; slotLevel: number };
  } = {
    slots: {},
  };

  for (const [level, slot] of Object.entries(data.slots)) {
    result.slots[Number(level)] = {
      current: slot.current,
      max: slot.max,
    };
  }

  if (data.pactSlots) {
    result.pactSlots = {
      current: data.pactSlots.current,
      max: data.pactSlots.max,
      slotLevel: data.pactSlots.slotLevel,
    };
  }

  return result;
}

/**
 * Check if a character is a spellcaster.
 * Supports custom classes via customClass.spellcasting field.
 * 
 * @param className - The character's class
 * @param customClass - Optional custom class definition
 * @returns True if the class has any spellcasting ability
 */
function isSpellcaster(className: string, customClass?: CustomClass): boolean {
  const type = getSpellcastingType(className, customClass);
  return type !== 'none';
}

/**
 * Restore all spell slots for a character.
 * 
 * Called by `take_rest` when a character completes a long rest.
 * Restores both standard spell slots AND warlock pact magic to maximum.
 * 
 * @param characterId - The character's unique ID
 * @param className - The character's class (for slot table lookup)
 * @param level - The character's level (for slot table lookup)
 * @param customClass - Optional custom class definition
 * 
 * @remarks
 * This function initializes spell slots if they don't exist yet,
 * so it's safe to call even if the character hasn't used spell slots before.
 * 
 * @example
 * // Called internally by take_rest on long rest
 * restoreAllSpellSlots('char-123', 'Wizard', 5);
 * 
 * @see restorePactSlots - For short rest warlock recovery
 * @see take_rest - Primary caller of this function
 */
export function restoreAllSpellSlots(
  characterId: string,
  className: string,
  level: number,
  customClass?: CustomClass
): void {
  const data = getSpellSlots(characterId, className, level, customClass);
  const maxSlots = getMaxSpellSlots(className, level, customClass);
  
  // Restore regular slots to max
  for (let i = 1; i <= 9; i++) {
    data.slots[i] = { current: maxSlots[i - 1], max: maxSlots[i - 1] };
  }
  
  // Restore pact slots if applicable
  if (data.pactSlots) {
    const pactInfo = WARLOCK_PACT_MAGIC[level] || { slots: 1, slotLevel: 1 };
    data.pactSlots.current = pactInfo.slots;
  }
  
  spellSlotStore.set(characterId, data);
}

/**
 * Restore warlock pact magic slots to maximum.
 * 
 * Called by `take_rest` when a warlock completes a short rest.
 * Only affects pact magic slots, NOT standard spell slots.
 * 
 * @param characterId - The character's unique ID
 * 
 * @remarks
 * Per D&D 5e rules, warlock pact slots refresh on short rest while
 * standard spell slots (from multiclassing) only refresh on long rest.
 * This is a key differentiator of the warlock class.
 * 
 * Does nothing if character has no pact slots (non-warlock or not yet initialized).
 * 
 * @example
 * // Called internally by take_rest on short rest for warlocks
 * restorePactSlots('warlock-123');
 * 
 * @see restoreAllSpellSlots - For long rest full recovery
 * @see take_rest - Primary caller of this function
 */
export function restorePactSlots(characterId: string): void {
  const data = spellSlotStore.get(characterId);
  if (data?.pactSlots) {
    data.pactSlots.current = data.pactSlots.max;
    spellSlotStore.set(characterId, data);
  }
}

/**
 * Format spell slot visualization as ASCII art.
 * 
 * Creates a human-readable display of current spell slot status:
 * - Regular slots: ● (filled) and ○ (empty) circles
 * - Pact slots: ◆ (filled) and ◇ (empty) diamonds
 * 
 * @param slots - Spell slot data to visualize
 * @returns Array of formatted lines for ASCII box content
 * 
 * @example
 * // Level 5 Wizard with 2 1st-level slots expended:
 * formatSpellSlotVisualization(slotData)
 * // Returns:
 * // ["1st  ●●○○ (2/4)",
 * //  "2nd  ●●● (3/3)",
 * //  "3rd  ●● (2/2)"]
 * 
 * @example
 * // Level 5 Warlock with 1 pact slot expended:
 * // ["Pact (3rd) ◆◇ (1/2)"]
 */
function formatSpellSlotVisualization(slots: SpellSlotData): string[] {
  const lines: string[] = [];
  const ordinals = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
  
  // Regular slots
  let hasAnySlots = false;
  for (let i = 1; i <= 9; i++) {
    const slot = slots.slots[i];
    if (slot && slot.max > 0) {
      hasAnySlots = true;
      const filled = '●'.repeat(slot.current);
      const empty = '○'.repeat(slot.max - slot.current);
      lines.push(`${ordinals[i - 1].padEnd(4)} ${filled}${empty} (${slot.current}/${slot.max})`);
    }
  }
  
  // Pact slots
  if (slots.pactSlots && slots.pactSlots.max > 0) {
    hasAnySlots = true;
    if (lines.length > 0) lines.push('');
    const filled = '◆'.repeat(slots.pactSlots.current);
    const empty = '◇'.repeat(slots.pactSlots.max - slots.pactSlots.current);
    lines.push(`Pact (${ordinals[slots.pactSlots.slotLevel - 1]}) ${filled}${empty} (${slots.pactSlots.current}/${slots.pactSlots.max})`);
  }
  
  if (!hasAnySlots) {
    lines.push('No spell slots available');
  }
  
  return lines;
}

/**
 * Manage spell slots for a character following D&D 5e rules.
 * 
 * Provides complete spell slot tracking for all spellcasting classes including
 * automatic slot calculation based on class/level and warlock pact magic support.
 * 
 * ## Operations
 * 
 * | Operation | Description | Required Params |
 * |-----------|-------------|-----------------|
 * | `view` | Display current spell slot status | - |
 * | `expend` | Use one or more spell slots | `slotLevel` or `pactMagic` |
 * | `restore` | Restore slots (all or specific) | - (optional: `slotLevel`, `count`) |
 * | `set` | DM override to set exact values | `slots` object |
 * 
 * ## Warlock Pact Magic
 * 
 * Warlocks have special pact magic slots that differ from standard spellcasting:
 * - All slots cast at the same level (determined by warlock level, caps at 5th)
 * - Slots refresh on short rest (not just long rest)
 * - Tracked separately from any multiclass spell slots
 * - Use `pactMagic: true` to operate on pact slots
 * 
 * ## Integration Points
 * 
 * - **take_rest:** Long rest calls `restoreAllSpellSlots()`, short rest calls `restorePactSlots()`
 * - **execute_action:** `actionType: 'cast_spell'` validates and expends slots automatically
 * - **Character lookup:** Supports both `characterId` and `characterName`
 * 
 * ## ASCII Output
 * 
 * All operations return formatted ASCII boxes with visual slot indicators:
 * - Regular slots: ● (available) / ○ (expended)
 * - Pact slots: ◆ (available) / ◇ (expended)
 * 
 * @param input - Spell slot management parameters (single or batch)
 * @returns Result object with `success`, `markdown` (ASCII output), and optional `error`
 * 
 * @example
 * // View current spell slots
 * manageSpellSlots({ characterId: 'abc', operation: 'view' })
 * 
 * @example
 * // Expend a 3rd level slot
 * manageSpellSlots({ characterName: 'Gandalf', operation: 'expend', slotLevel: 3 })
 * 
 * @example
 * // Expend a warlock pact slot
 * manageSpellSlots({ characterId: 'abc', operation: 'expend', pactMagic: true })
 * 
 * @example
 * // Restore all slots (long rest effect)
 * manageSpellSlots({ characterId: 'abc', operation: 'restore' })
 * 
 * @example
 * // DM override: set specific slot configuration
 * manageSpellSlots({ 
 *   characterId: 'abc', 
 *   operation: 'set',
 *   slots: { '1': { current: 2, max: 4 }, '2': { current: 3, max: 3 } }
 * })
 * 
 * @example
 * // Batch: restore entire party's spell slots
 * manageSpellSlots({ batch: [
 *   { characterName: 'Wizard', operation: 'restore' },
 *   { characterName: 'Cleric', operation: 'restore' },
 *   { characterName: 'Warlock', operation: 'restore' },
 * ]})
 */
export function manageSpellSlots(input: ManageSpellSlotsInput | { batch: ManageSpellSlotsInput[] }): {
  success: boolean;
  markdown: string;
  error?: string;
} {
  // Check if this is a batch operation
  if ('batch' in input && input.batch) {
    return manageSpellSlotsBatch(input.batch);
  }

  const singleInput = input as ManageSpellSlotsInput;
  
  // Resolve character ID from name if needed
  let characterId = singleInput.characterId;
  if (!characterId && singleInput.characterName) {
    characterId = findCharacterByName(singleInput.characterName) || undefined;
    if (!characterId) {
      return {
        success: false,
        markdown: '',
        error: `Character "${singleInput.characterName}" not found`,
      };
    }
  }

  if (!characterId) {
    return {
      success: false,
      markdown: '',
      error: 'Either characterId or characterName must be provided',
    };
  }

  // Load character
  const getResult = getCharacter({ characterId });
  if (!getResult.success || !getResult.character) {
    return {
      success: false,
      markdown: '',
      error: `Character not found: ${characterId}`,
    };
  }

  const character = getResult.character;
  const { operation, slotLevel, count = 1, pactMagic } = singleInput;

  // Check if character is a spellcaster (except for view and set which are always allowed)
  // Now supports custom classes with spellcasting
  if (operation !== 'view' && operation !== 'set' && !isSpellcaster(character.class, character.customClass)) {
    return {
      success: false,
      markdown: '',
      error: `${character.name} is not a spellcaster (${character.class} has no spell slots)`,
    };
  }

  // Get or initialize spell slots (with custom class support)
  const slotData = getSpellSlots(characterId, character.class, character.level, character.customClass);
  const WIDTH = 60;

  switch (operation) {
    case 'view': {
      const content: string[] = [];
      content.push('');
      content.push(`Character: ${character.name}`);
      content.push(`Class: ${character.class} ${character.level}`);
      content.push('');
      
      if (!isSpellcaster(character.class, character.customClass)) {
        content.push('This character has no spell slots.');
        content.push('');
      } else {
        content.push(...formatSpellSlotVisualization(slotData));
        content.push('');
      }
      
      return {
        success: true,
        markdown: createBox('SPELL SLOTS', content, WIDTH, 'HEAVY'),
      };
    }

    case 'expend': {
      if (!slotLevel && !pactMagic) {
        return {
          success: false,
          markdown: '',
          error: 'Slot level is required for expend operation',
        };
      }

      // Handle pact magic expend
      if (pactMagic) {
        if (!slotData.pactSlots) {
          return {
            success: false,
            markdown: '',
            error: `${character.name} does not have pact magic slots`,
          };
        }
        
        if (slotData.pactSlots.current < count) {
          return {
            success: false,
            markdown: '',
            error: `Not enough pact slots. Have ${slotData.pactSlots.current}, need ${count}`,
          };
        }
        
        slotData.pactSlots.current -= count;
        spellSlotStore.set(characterId, slotData);
        
        const content: string[] = [];
        content.push('');
        content.push(`Character: ${character.name}`);
        content.push(`Expended: ${count} pact slot(s)`);
        content.push('');
        content.push(...formatSpellSlotVisualization(slotData));
        content.push('');
        
        return {
          success: true,
          markdown: createBox('SPELL SLOT EXPENDED', content, WIDTH, 'HEAVY'),
        };
      }

      // Handle regular slot expend
      const slot = slotData.slots[slotLevel!];
      if (!slot || slot.max === 0) {
        return {
          success: false,
          markdown: '',
          error: `${character.name} has no ${getOrdinal(slotLevel!)} level spell slots`,
        };
      }

      if (slot.current < count) {
        return {
          success: false,
          markdown: '',
          error: `Not enough ${getOrdinal(slotLevel!)} level slots. Have ${slot.current}, need ${count}`,
        };
      }

      slot.current -= count;
      spellSlotStore.set(characterId, slotData);

      const content: string[] = [];
      content.push('');
      content.push(`Character: ${character.name}`);
      content.push(`Expended: ${count} ${getOrdinal(slotLevel!)} level slot(s)`);
      content.push('');
      content.push(...formatSpellSlotVisualization(slotData));
      content.push('');

      return {
        success: true,
        markdown: createBox('SPELL SLOT EXPENDED', content, WIDTH, 'HEAVY'),
      };
    }

    case 'restore': {
      // If no slot level specified, restore all
      if (!slotLevel && !pactMagic) {
        restoreAllSpellSlots(characterId, character.class, character.level, character.customClass);
        const updatedData = getSpellSlots(characterId, character.class, character.level, character.customClass);
        
        const content: string[] = [];
        content.push('');
        content.push(`Character: ${character.name}`);
        content.push('All spell slots restored!');
        content.push('');
        content.push(...formatSpellSlotVisualization(updatedData));
        content.push('');
        
        return {
          success: true,
          markdown: createBox('SPELL SLOTS RESTORED', content, WIDTH, 'HEAVY'),
        };
      }

      // Restore pact slots only
      if (pactMagic) {
        if (!slotData.pactSlots) {
          return {
            success: false,
            markdown: '',
            error: `${character.name} does not have pact magic slots`,
          };
        }
        
        const restoreCount = count || slotData.pactSlots.max;
        slotData.pactSlots.current = Math.min(
          slotData.pactSlots.current + restoreCount,
          slotData.pactSlots.max
        );
        spellSlotStore.set(characterId, slotData);
        
        const content: string[] = [];
        content.push('');
        content.push(`Character: ${character.name}`);
        content.push('Pact magic slots restored!');
        content.push('');
        content.push(...formatSpellSlotVisualization(slotData));
        content.push('');
        
        return {
          success: true,
          markdown: createBox('PACT SLOTS RESTORED', content, WIDTH, 'HEAVY'),
        };
      }

      // Restore specific slot level (slotLevel is guaranteed to be defined here)
      const targetLevel = slotLevel!;
      const slot = slotData.slots[targetLevel];
      if (!slot) {
        return {
          success: false,
          markdown: '',
          error: `Invalid slot level: ${targetLevel}`,
        };
      }

      const restoreCount = count || slot.max;
      slot.current = Math.min(slot.current + restoreCount, slot.max);
      spellSlotStore.set(characterId, slotData);

      const content: string[] = [];
      content.push('');
      content.push(`Character: ${character.name}`);
      content.push(`Restored: ${getOrdinal(targetLevel)} level slot(s)`);
      content.push('');
      content.push(...formatSpellSlotVisualization(slotData));
      content.push('');

      return {
        success: true,
        markdown: createBox('SPELL SLOTS RESTORED', content, WIDTH, 'HEAVY'),
      };
    }

    case 'set': {
      if (!singleInput.slots) {
        return {
          success: false,
          markdown: '',
          error: 'Slots configuration is required for set operation',
        };
      }

      // DM override - set slots directly
      for (const [levelStr, config] of Object.entries(singleInput.slots)) {
        const level = parseInt(levelStr, 10);
        if (level >= 1 && level <= 9) {
          slotData.slots[level] = { current: config.current, max: config.max };
        } else if (levelStr === 'pact') {
          // Handle pact slot setting
          const currentPact = slotData.pactSlots;
          slotData.pactSlots = {
            current: config.current,
            max: config.max,
            slotLevel: currentPact?.slotLevel || 5,
          };
        }
      }
      spellSlotStore.set(characterId, slotData);

      const content: string[] = [];
      content.push('');
      content.push(`Character: ${character.name}`);
      content.push('Spell slots set by DM override!');
      content.push('');
      content.push(...formatSpellSlotVisualization(slotData));
      content.push('');

      return {
        success: true,
        markdown: createBox('SPELL SLOTS SET', content, WIDTH, 'HEAVY'),
      };
    }

    default:
      return {
        success: false,
        markdown: '',
        error: `Unknown operation: ${operation}`,
      };
  }
}

/**
 * Get ordinal string for a number.
 * @param n - Number to convert
 * @returns Ordinal string (1st, 2nd, 3rd, etc.)
 */
function getOrdinal(n: number): string {
  const ordinals = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
  return ordinals[n - 1] || `${n}th`;
}

/**
 * Process batch spell slot operations.
 * 
 * @param requests - Array of spell slot operation requests
 * @returns Combined result with batch summary
 */
function manageSpellSlotsBatch(requests: ManageSpellSlotsInput[]): {
  success: boolean;
  markdown: string;
  error?: string;
} {
  const results: Array<{
    name: string;
    operation: string;
    success: boolean;
    error?: string;
  }> = [];

  for (const request of requests) {
    // Get character name for reporting
    let charName = request.characterName || request.characterId || 'Unknown';
    if (request.characterId && !request.characterName) {
      const getResult = getCharacter({ characterId: request.characterId });
      if (getResult.success && getResult.character) {
        charName = getResult.character.name;
      }
    }

    const result = manageSpellSlots(request);
    if (result.success) {
      results.push({
        name: charName,
        operation: request.operation,
        success: true,
      });
    } else {
      results.push({
        name: charName,
        operation: request.operation,
        success: false,
        error: result.error,
      });
    }
  }

  return {
    success: true,
    markdown: formatBatchSpellSlotResult(results),
  };
}

/**
 * Format batch spell slot result as ASCII box.
 * 
 * @param results - Array of individual operation results
 * @returns ASCII-formatted box with batch summary
 */
function formatBatchSpellSlotResult(
  results: Array<{
    name: string;
    operation: string;
    success: boolean;
    error?: string;
  }>
): string {
  const WIDTH = 60;
  const content: string[] = [];

  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  content.push('');
  content.push(`Successful: ${succeeded.length}`);
  content.push(`Failed: ${failed.length}`);
  content.push('');

  if (succeeded.length > 0) {
    content.push('SUCCESSFUL:');
    for (const r of succeeded) {
      content.push(`  ✓ ${r.name} (${r.operation})`);
    }
    content.push('');
  }

  if (failed.length > 0) {
    content.push('FAILED:');
    for (const r of failed) {
      content.push(`  ✗ ${r.name}: ${r.error || 'Unknown error'}`);
    }
    content.push('');
  }

  return createBox('BATCH SPELL SLOT RESULT', content, WIDTH, 'HEAVY');
}

/**
 * Expend a spell slot for casting.
 * 
 * Called by `execute_action` when `actionType: 'cast_spell'` is used.
 * Automatically initializes spell slots if not already done.
 * 
 * @param characterId - The character's unique ID
 * @param slotLevel - The spell slot level to expend (1-9)
 * @param pactMagic - If true, expend from warlock pact magic pool instead
 * @returns Result object with `success` boolean and optional `error` message
 * 
 * @remarks
 * This function auto-initializes spell slots on first use by loading the
 * character's class and level. This ensures seamless integration with
 * execute_action even if manage_spell_slots hasn't been called yet.
 * 
 * @example
 * const result = expendSpellSlot('char-123', 3); // Expend 3rd level slot
 * if (!result.success) {
 *   console.log(result.error); // "No 3rd level slots available"
 * }
 * 
 * @see hasSpellSlot - Check availability before expending
 * @see execute_action - Primary caller for spell casting
 */
export function expendSpellSlot(
  characterId: string,
  slotLevel: number,
  pactMagic?: boolean
): { success: boolean; error?: string } {
  // Try to load character and initialize slots if needed (with custom class support)
  const charResult = getCharacter({ characterId });
  if (charResult.success && charResult.character) {
    // This will initialize slots if needed
    getSpellSlots(
      characterId,
      charResult.character.class,
      charResult.character.level,
      charResult.character.customClass
    );
  }

  const data = spellSlotStore.get(characterId);
  if (!data) {
    return { success: false, error: 'No spell slot data found' };
  }

  if (pactMagic) {
    if (!data.pactSlots || data.pactSlots.current < 1) {
      return { success: false, error: 'No pact slots available' };
    }
    data.pactSlots.current--;
    return { success: true };
  }

  const slot = data.slots[slotLevel];
  if (!slot || slot.current < 1) {
    return { success: false, error: `No ${getOrdinal(slotLevel)} level slots available` };
  }
  
  slot.current--;
  return { success: true };
}

/**
 * Check if a character has a spell slot available at the given level.
 * 
 * Called by `execute_action` to validate spell casting before attempting.
 * Automatically initializes spell slots if not already done.
 * Supports custom classes with spellcasting.
 * 
 * @param characterId - The character's unique ID
 * @param slotLevel - The spell slot level to check (1-9)
 * @param pactMagic - If true, check warlock pact magic pool instead
 * @returns `true` if at least one slot is available at the requested level
 * 
 * @remarks
 * Returns `false` for:
 * - Non-existent characters
 * - Characters without spellcasting
 * - Characters with no slots remaining at that level
 * - Invalid slot levels for the character's caster type
 * 
 * @example
 * if (hasSpellSlot('wizard-123', 3)) {
 *   // Cast 3rd level spell
 * } else {
 *   // No 3rd level slots available
 * }
 * 
 * @see expendSpellSlot - Expend a slot after checking
 * @see execute_action - Primary caller for spell validation
 */
export function hasSpellSlot(
  characterId: string,
  slotLevel: number,
  pactMagic?: boolean
): boolean {
  // Try to load character and initialize slots if needed (with custom class support)
  const charResult = getCharacter({ characterId });
  if (charResult.success && charResult.character) {
    // This will initialize slots if needed
    getSpellSlots(
      characterId,
      charResult.character.class,
      charResult.character.level,
      charResult.character.customClass
    );
  }

  const data = spellSlotStore.get(characterId);
  if (!data) return false;

  if (pactMagic) {
    return (data.pactSlots?.current ?? 0) > 0;
  }

  const slot = data.slots[slotLevel];
  return (slot?.current ?? 0) > 0;
}
// ============================================================
// LEVEL UP HANDLER
// ============================================================

/**
 * Level up result for a single character.
 */
/**
 * Result of a successful level-up operation.
 * 
 * Contains all changes made during level advancement for display
 * and tracking purposes.
 * 
 * @property characterId - Unique character identifier
 * @property characterName - Character's display name
 * @property oldLevel - Level before advancement
 * @property newLevel - Level after advancement
 * @property hpGain - Total HP gained across all levels
 * @property oldMaxHp - Max HP before advancement
 * @property newMaxHp - Max HP after advancement
 * @property oldProficiency - Proficiency bonus before
 * @property newProficiency - Proficiency bonus after
 * @property newFeatures - Class features gained (narrative)
 * @property newSpells - Spells learned during advancement
 * @property hpMethod - HP calculation method used
 * @property rollDetails - Die roll breakdown (for 'roll' method)
 * @property resourceUpdate - Custom resource changes (Ki, Rage, etc.)
 */
interface LevelUpResult {
  characterId: string;
  characterName: string;
  oldLevel: number;
  newLevel: number;
  hpGain: number;
  oldMaxHp: number;
  newMaxHp: number;
  oldProficiency: number;
  newProficiency: number;
  newFeatures?: string[];
  newSpells?: string[];
  hpMethod: string;
  rollDetails?: string;
  resourceUpdate?: {
    name: string;
    oldMax: number;
    newMax: number;
  };
}

/**
 * Calculate HP gain for a single level.
 * 
 * @param hitDie - Hit die size (4, 6, 8, 10, 12)
 * @param conMod - Constitution modifier
 * @param method - HP calculation method
 * @param manualHp - Manual HP value (when method is 'manual')
 * @param manualRoll - Override roll value (for testing)
 * @returns HP gain and roll details
 */
function calculateLevelHpGain(
  hitDie: number,
  conMod: number,
  method: 'roll' | 'average' | 'max' | 'manual',
  manualHp?: number,
  manualRoll?: number
): { hpGain: number; rollDetails?: string } {
  let baseGain: number;
  let rollDetails: string | undefined;

  switch (method) {
    case 'roll':
      const roll = manualRoll ?? Math.floor(Math.random() * hitDie) + 1;
      baseGain = roll;
      rollDetails = `d${hitDie}: ${roll}`;
      break;
    case 'average':
      // Average rounded up: (hitDie / 2) + 1
      baseGain = Math.floor(hitDie / 2) + 1;
      break;
    case 'max':
      baseGain = hitDie;
      break;
    case 'manual':
      // Manual already includes everything - return as-is
      return { hpGain: manualHp!, rollDetails: 'manual' };
  }

  // Add CON modifier, enforce minimum HP per level (D&D 5e rule)
  const totalGain = Math.max(MIN_HP_PER_LEVEL, baseGain + conMod);
  
  if (rollDetails) {
    rollDetails += ` + ${conMod} CON = ${totalGain}`;
  }

  return { hpGain: totalGain, rollDetails };
}

/**
 * Calculate custom resource update for level advancement.
 * 
 * Checks if a character's custom class has a scaling resource
 * (like Ki Points or Rage) and calculates the new maximum.
 * 
 * @param customClass - Custom class definition with resource info
 * @param oldLevel - Character's previous level
 * @param newLevel - Character's new level
 * @returns Resource update info if resource max changed, undefined otherwise
 * 
 * @example
 * // Monk Ki Points (level-based scaling)
 * calculateCustomResourceUpdate(monkClass, 4, 5) // => { name: 'Ki Points', oldMax: 4, newMax: 5 }
 */
function calculateCustomResourceUpdate(
  customClass: CustomClass | undefined,
  oldLevel: number,
  newLevel: number
): LevelUpResult['resourceUpdate'] {
  if (!customClass?.resourceName || customClass?.resourceMax === undefined) {
    return undefined;
  }

  const oldResourceMax = calculateResourceMax(
    customClass.resourceMax,
    oldLevel,
    customClass.resourceScaling
  );
  const newResourceMax = calculateResourceMax(
    customClass.resourceMax,
    newLevel,
    customClass.resourceScaling
  );

  if (newResourceMax === oldResourceMax) {
    return undefined;
  }

  return {
    name: customClass.resourceName,
    oldMax: oldResourceMax,
    newMax: newResourceMax,
  };
}

/**
 * Level up a single character.
 * 
 * Handles all level advancement mechanics:
 * - HP calculation (roll, average, max, or manual methods)
 * - Proficiency bonus updates
 * - Custom resource scaling (Ki, Rage, etc.)
 * - Spell slot refresh
 * - Multi-level jumps (e.g., level 1 → 5)
 * 
 * @param input - Level-up parameters
 * @returns Level-up result with all changes, or error
 */
function levelUpSingle(input: LevelUpInput): {
  success: boolean;
  result?: LevelUpResult;
  error?: string;
} {
  // Resolve character ID
  let characterId: string | undefined = input.characterId;
  
  if (!characterId && input.characterName) {
    const foundId = findCharacterByName(input.characterName);
    if (!foundId) {
      return { success: false, error: `Character not found: ${input.characterName}` };
    }
    characterId = foundId;
  }

  if (!characterId) {
    return { success: false, error: 'Either characterId or characterName must be provided' };
  }

  // Load character
  const charResult = getCharacter({ characterId });
  if (!charResult.success || !charResult.character) {
    return { success: false, error: `Character not found: ${characterId}` };
  }

  const character = charResult.character;
  const oldLevel = character.level;
  const targetLevel = input.targetLevel ?? oldLevel + 1;

  // Validation: enforce level cap
  if (targetLevel > MAX_CHARACTER_LEVEL) {
    return { success: false, error: `Cannot level up past ${MAX_CHARACTER_LEVEL} (target: ${targetLevel})` };
  }

  if (targetLevel <= oldLevel) {
    return { success: false, error: `Target level ${targetLevel} must be higher than current level ${oldLevel}` };
  }

  // Calculate HP gain for each level
  const hitDie = getHitDie(character.class, character.customClass);
  const conMod = calculateModifier(character.stats.con);
  const levelsGained = targetLevel - oldLevel;
  
  let totalHpGain = 0;
  const rollDetailsList: string[] = [];

  for (let i = 0; i < levelsGained; i++) {
    const { hpGain, rollDetails } = calculateLevelHpGain(
      hitDie,
      conMod,
      input.hpMethod,
      input.manualHp,
      input.manualRoll
    );
    totalHpGain += hpGain;
    if (rollDetails && input.hpMethod === 'roll') {
      rollDetailsList.push(`Level ${oldLevel + i + 1}: ${rollDetails}`);
    }
  }

  // Calculate new proficiency bonus
  const oldProficiency = calculateProficiencyBonus(oldLevel);
  const newProficiency = calculateProficiencyBonus(targetLevel);

  // Calculate custom resource scaling (Ki, Rage, etc.)
  const resourceUpdate = calculateCustomResourceUpdate(
    character.customClass,
    oldLevel,
    targetLevel
  );

  // Update character
  const newMaxHp = character.maxHp + totalHpGain;
  const newHp = character.hp + totalHpGain; // Heal on level up

  // Build update payload with proper typing
  const updateInput: Partial<z.infer<typeof singleUpdateSchema>> & { characterId: string } = {
    characterId,
    level: targetLevel,
    maxHp: newMaxHp,
    hp: newHp,
  };

  // Update known spells if provided
  if (input.newSpells && input.newSpells.length > 0) {
    const existingSpells = character.knownSpells || [];
    updateInput.knownSpells = [...existingSpells, ...input.newSpells];
  }

  // Update resource if it changed
  if (resourceUpdate) {
    updateInput.resource = {
      name: resourceUpdate.name,
      current: resourceUpdate.newMax, // Refresh to new max
      max: resourceUpdate.newMax,
    };
  }

  const updateResult = updateCharacter(updateInput);
  if (!updateResult.success) {
    return { success: false, error: updateResult.error || 'Failed to update character' };
  }

  // Refresh spell slots for the new level
  restoreAllSpellSlots(characterId, character.class, targetLevel, character.customClass);

  return {
    success: true,
    result: {
      characterId,
      characterName: character.name,
      oldLevel,
      newLevel: targetLevel,
      hpGain: totalHpGain,
      oldMaxHp: character.maxHp,
      newMaxHp,
      oldProficiency,
      newProficiency,
      newFeatures: input.newFeatures,
      newSpells: input.newSpells,
      hpMethod: input.hpMethod,
      rollDetails: rollDetailsList.length > 0 ? rollDetailsList.join('\n') : undefined,
      resourceUpdate,
    },
  };
}

/**
 * Format level-up result as ASCII art.
 */
function formatLevelUpResult(result: LevelUpResult): string {
  const WIDTH = 60;
  const content: string[] = [];
  const box = BOX.HEAVY;

  // Header
  content.push(centerText(`⬆️ LEVEL UP! ⬆️`, WIDTH));
  content.push(centerText(`${result.characterName}`, WIDTH));
  content.push('');

  // Level change
  content.push(centerText(`Level ${result.oldLevel} → Level ${result.newLevel}`, WIDTH));
  content.push('');

  // Stats changes
  content.push(box.H.repeat(WIDTH));
  content.push('');

  // HP
  const hpBar = createStatusBar(result.newMaxHp, result.newMaxHp, 30, 'HP');
  content.push(padText(`HP: ${result.oldMaxHp} → ${result.newMaxHp} (+${result.hpGain} ${result.hpMethod})`, WIDTH, 'left'));
  content.push(centerText(hpBar, WIDTH));
  
  if (result.rollDetails) {
    content.push(padText(`  ${result.rollDetails}`, WIDTH, 'left'));
  }
  content.push('');

  // Proficiency bonus (if changed)
  if (result.oldProficiency !== result.newProficiency) {
    content.push(padText(`Proficiency: +${result.oldProficiency} → +${result.newProficiency}`, WIDTH, 'left'));
    content.push('');
  }

  // Resource (if changed)
  if (result.resourceUpdate) {
    content.push(padText(
      `${result.resourceUpdate.name}: ${result.resourceUpdate.oldMax} → ${result.resourceUpdate.newMax}`,
      WIDTH,
      'left'
    ));
    content.push('');
  }

  // Spell slots update
  content.push(padText('Spell slots updated for new level', WIDTH, 'left'));
  content.push('');

  // New features
  if (result.newFeatures && result.newFeatures.length > 0) {
    content.push(box.H.repeat(WIDTH));
    content.push(padText('NEW FEATURES', WIDTH, 'center'));
    content.push('');
    for (const feature of result.newFeatures) {
      content.push(padText(`• ${feature}`, WIDTH, 'left'));
    }
    content.push('');
  }

  // New spells
  if (result.newSpells && result.newSpells.length > 0) {
    content.push(box.H.repeat(WIDTH));
    content.push(padText('NEW SPELLS LEARNED', WIDTH, 'center'));
    content.push('');
    for (const spell of result.newSpells) {
      content.push(padText(`• ${spell}`, WIDTH, 'left'));
    }
    content.push('');
  }

  return createBox('LEVEL UP', content, WIDTH, 'HEAVY');
}

/**
 * Format batch level-up results.
 */
function formatBatchLevelUpResults(
  results: Array<{ success: boolean; result?: LevelUpResult; error?: string; name: string }>
): string {
  const WIDTH = 60;
  const content: string[] = [];
  const box = BOX.HEAVY;

  const successes = results.filter(r => r.success);
  const failures = results.filter(r => !r.success);

  // Header
  content.push(centerText('⬆️ PARTY LEVEL UP ⬆️', WIDTH));
  content.push('');
  content.push(centerText(`${successes.length} success, ${failures.length} failed`, WIDTH));
  content.push('');
  content.push(box.H.repeat(WIDTH));

  // Successes
  if (successes.length > 0) {
    content.push('');
    content.push(padText('LEVELED UP:', WIDTH, 'left'));
    for (const s of successes) {
      if (s.result) {
        content.push(padText(
          `  ✓ ${s.result.characterName}: ${s.result.oldLevel} → ${s.result.newLevel} (+${s.result.hpGain} HP)`,
          WIDTH,
          'left'
        ));
      }
    }
  }

  // Failures
  if (failures.length > 0) {
    content.push('');
    content.push(padText('FAILED:', WIDTH, 'left'));
    for (const f of failures) {
      content.push(padText(`  ✗ ${f.name}: ${f.error}`, WIDTH, 'left'));
    }
  }

  content.push('');
  return createBox('PARTY LEVEL UP', content, WIDTH, 'HEAVY');
}

/**
 * Level up one or more characters.
 * 
 * Handles D&D 5e level advancement:
 * - HP increase (roll, average, max, or manual methods)
 * - Proficiency bonus recalculation  
 * - Spell slot updates (full refresh for new level)
 * - Custom resource scaling for homebrew classes
 * - Multi-level jumps (e.g., level 1 → 5)
 * - Batch support for leveling entire parties
 * 
 * @param input - Level-up parameters (single or batch)
 * @returns Result with success status and ASCII-formatted output
 * 
 * @example
 * // Single level-up with average HP
 * levelUp({ characterId: 'hero-123' })
 * 
 * @example
 * // Level to specific level with max HP
 * levelUp({ characterName: 'Gandalf', targetLevel: 10, hpMethod: 'max' })
 * 
 * @example
 * // Batch party level-up
 * levelUp({ batch: [
 *   { characterId: 'hero-1' },
 *   { characterId: 'hero-2' },
 *   { characterId: 'hero-3' }
 * ]})
 */
export function levelUp(input: z.infer<typeof levelUpSchema>): {
  success: boolean;
  markdown: string;
  error?: string;
} {
  // Check if this is a batch operation
  if ('batch' in input && input.batch) {
    const results: Array<{ success: boolean; result?: LevelUpResult; error?: string; name: string }> = [];
    
    for (const req of input.batch) {
      const singleResult = levelUpSingle(req);
      results.push({
        success: singleResult.success,
        result: singleResult.result,
        error: singleResult.error,
        name: req.characterName || req.characterId || 'Unknown',
      });
    }

    const anySuccess = results.some(r => r.success);
    return {
      success: anySuccess,
      markdown: formatBatchLevelUpResults(results),
      error: anySuccess ? undefined : 'All level-ups failed',
    };
  }

  // Single level-up
  const singleInput = input as LevelUpInput;
  const result = levelUpSingle(singleInput);

  if (!result.success || !result.result) {
    return {
      success: false,
      markdown: '',
      error: result.error || 'Failed to level up',
    };
  }

  return {
    success: true,
    markdown: formatLevelUpResult(result.result),
  };
}