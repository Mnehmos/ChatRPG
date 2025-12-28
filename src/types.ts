/**
 * Core Types - Shared Enums & Interfaces
 * Menu-Driven Design: Use enums for dropdowns with fuzzy matching
 */

import { z } from 'zod';
import { fuzzyEnum } from './fuzzy-enum.js';

// ============================================================
// D&D 5e ENUMS (Menu-Driven)
// ============================================================

export const ConditionSchema = fuzzyEnum([
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
  'exhaustion',
] as const, 'condition');
export type Condition = z.infer<typeof ConditionSchema>;

export const DamageTypeSchema = fuzzyEnum([
  'slashing',
  'piercing',
  'bludgeoning',
  'fire',
  'cold',
  'lightning',
  'thunder',
  'acid',
  'poison',
  'necrotic',
  'radiant',
  'force',
  'psychic',
] as const, 'damageType');
export type DamageType = z.infer<typeof DamageTypeSchema>;

export const AbilitySchema = fuzzyEnum(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const, 'ability');
export type Ability = z.infer<typeof AbilitySchema>;

export const SkillSchema = fuzzyEnum([
  'acrobatics',
  'animal_handling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleight_of_hand',
  'stealth',
  'survival',
] as const, 'skill');
export type Skill = z.infer<typeof SkillSchema>;

export const ActionTypeSchema = fuzzyEnum([
  'attack',
  'cast_spell',
  'cast', // Alias for cast_spell
  'dash',
  'disengage',
  'dodge',
  'help',
  'hide',
  'ready',
  'search',
  'use_object',
  'use_magic_item',
  'use_special_ability',
  'shove',
  'grapple',
  'improvise',         // NEW - for custom actions
  'two_weapon_attack', // NEW - off-hand attack
] as const, 'actionType');
export type ActionType = z.infer<typeof ActionTypeSchema>;

// Action Economy (ADR-001)
export const ActionCostSchema = fuzzyEnum([
  'action',
  'bonus_action',
  'reaction',
  'free',
  'movement',
] as const, 'actionCost');
export type ActionCost = z.infer<typeof ActionCostSchema>;

// Weapon Categories (ADR-001)
export const WeaponTypeSchema = fuzzyEnum([
  'melee',
  'ranged',
  'melee_finesse',
  'ranged_thrown',
] as const, 'weaponType');
export type WeaponType = z.infer<typeof WeaponTypeSchema>;

// Attack Result (ADR-001)
export const AttackResultSchema = z.enum([
  'hit',
  'miss',
  'critical_hit',
  'critical_miss',
]);
export type AttackResult = z.infer<typeof AttackResultSchema>;

export const SizeSchema = fuzzyEnum([
  'tiny',
  'small',
  'medium',
  'large',
  'huge',
  'gargantuan',
] as const, 'size');
export type Size = z.infer<typeof SizeSchema>;

export const CoverSchema = fuzzyEnum(['none', 'half', 'three_quarters', 'full'] as const, 'cover');
export type Cover = z.infer<typeof CoverSchema>;

export const LightSchema = fuzzyEnum(['bright', 'dim', 'darkness', 'magical_darkness'] as const, 'lighting');
export type Light = z.infer<typeof LightSchema>;

// ============================================================
// ROLL MECHANICS
// ============================================================

/**
 * Roll mode for d20 checks (advantage/disadvantage system).
 * - 'normal': Single d20 roll
 * - 'advantage': Roll 2d20, keep highest
 * - 'disadvantage': Roll 2d20, keep lowest
 */
export const RollModeSchema = fuzzyEnum([
  'normal',
  'advantage',
  'disadvantage',
] as const, 'rollMode');
export type RollMode = z.infer<typeof RollModeSchema>;

// ============================================================
// ADDITIONAL FUZZY ENUM SCHEMAS (Consolidated from Modules)
// ============================================================

// Verbosity Schema (replaces inline definitions)
export const VerbositySchema = fuzzyEnum([
  'minimal',
  'summary',
  'standard',
  'detailed',
] as const, 'verbosity');
export type Verbosity = z.infer<typeof VerbositySchema>;

// Spatial Module Schemas
export const ObstacleTypeSchema = fuzzyEnum([
  'wall',
  'pillar',
  'half_cover',
  'three_quarters_cover',
  'total_cover',
] as const, 'obstacleType');
export type ObstacleType = z.infer<typeof ObstacleTypeSchema>;

export const SenseSchema = fuzzyEnum([
  'blindsight',
  'darkvision',
  'tremorsense',
  'truesight',
] as const, 'sense');
export type Sense = z.infer<typeof SenseSchema>;

export const PropTypeSchema = fuzzyEnum([
  'barrel', 'crate', 'chest', 'door', 'lever', 'pillar', 'statue',
  'table', 'chair', 'altar', 'trap', 'obstacle', 'custom',
] as const, 'propType');
export type PropType = z.infer<typeof PropTypeSchema>;

export const MovementModeSchema = fuzzyEnum([
  'path',
  'reach',
  'adjacent',
] as const, 'movementMode');
export type MovementMode = z.infer<typeof MovementModeSchema>;

export const DistanceModeSchema = fuzzyEnum([
  'euclidean',
  'grid_5e',
  'grid_alt',
] as const, 'distanceMode');
export type DistanceMode = z.infer<typeof DistanceModeSchema>;

// Data Module Schemas
export const LocationOperationSchema = fuzzyEnum([
  'create', 'get', 'update', 'delete', 'link', 'unlink', 'list',
] as const, 'locationOperation');
export type LocationOperation = z.infer<typeof LocationOperationSchema>;

export const ItemTypeSchema = fuzzyEnum([
  'weapon', 'armor', 'shield', 'consumable', 'ammunition',
  'equipment', 'currency', 'misc',
] as const, 'itemType');
export type ItemType = z.infer<typeof ItemTypeSchema>;

export const EquipmentSlotSchema = fuzzyEnum([
  'mainHand', 'offHand', 'armor', 'head', 'hands',
  'feet', 'neck', 'ring1', 'ring2',
] as const, 'equipmentSlot');
export type EquipmentSlot = z.infer<typeof EquipmentSlotSchema>;

export const ImportanceSchema = fuzzyEnum([
  'low', 'medium', 'high', 'critical',
] as const, 'importance');
export type Importance = z.infer<typeof ImportanceSchema>;

// Character Module Schemas
export const SpellcastingSchema = fuzzyEnum([
  'full', 'half', 'third', 'warlock', 'none',
] as const, 'spellcasting');
export type Spellcasting = z.infer<typeof SpellcastingSchema>;

export const CheckTypeSchema = fuzzyEnum([
  'skill', 'ability', 'save', 'attack', 'initiative',
] as const, 'checkType');
export type CheckType = z.infer<typeof CheckTypeSchema>;

// Combat Module Schemas
export const ShoveDirectionSchema = fuzzyEnum([
  'away', 'prone',
] as const, 'shoveDirection');
export type ShoveDirection = z.infer<typeof ShoveDirectionSchema>;

export const CombatOutcomeSchema = fuzzyEnum([
  'victory', 'defeat', 'fled', 'negotiated', 'other',
] as const, 'combatOutcome');
export type CombatOutcome = z.infer<typeof CombatOutcomeSchema>;

// Magic Module Schemas
export const EffectTypeSchema = fuzzyEnum([
  'damage', 'healing', 'control', 'utility', 'summon',
] as const, 'effectType');
export type EffectType = z.infer<typeof EffectTypeSchema>;

// ============================================================
// ABILITY SCORES
// ============================================================

/**
 * D&D 5e ability score object.
 * Standard six abilities used for characters and creatures.
 */
export interface AbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

/**
 * Zod schema for ability scores with defaults and validation.
 * Ability scores range from 1-30 per D&D 5e rules.
 */
export const AbilityScoresSchema = z.object({
  str: z.number().min(1).max(30).default(10),
  dex: z.number().min(1).max(30).default(10),
  con: z.number().min(1).max(30).default(10),
  int: z.number().min(1).max(30).default(10),
  wis: z.number().min(1).max(30).default(10),
  cha: z.number().min(1).max(30).default(10),
});

// ============================================================
// SPATIAL TYPES
// ============================================================

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().default(0),
});
export type Position = z.infer<typeof PositionSchema>;

export const AoeShapeSchema = fuzzyEnum(['line', 'cone', 'cube', 'sphere', 'cylinder'] as const, 'aoeShape');
export type AoeShape = z.infer<typeof AoeShapeSchema>;

// ============================================================
// ROOM / NODE TYPES
// ============================================================

export const ConnectionTypeSchema = z.enum([
  'door',
  'passage',
  'stairs',
  'ladder',
  'portal',
  'hidden',
]);
export type ConnectionType = z.infer<typeof ConnectionTypeSchema>;

export interface Room {
  id: string;
  name: string;
  description: string;
  lighting: Light;
  tags: string[];
  npcsPresent: string[];
  itemsPresent: string[];
}

export interface Connection {
  from: string;
  to: string;
  type: ConnectionType;
  locked?: boolean;
  hidden?: boolean;
  oneWay?: boolean;
  travelTime?: number;
}

// ============================================================
// MAGIC SYSTEM TYPES
// ============================================================

/**
 * Tracks concentration on a spell for a character.
 * Concentration can be broken by taking damage, being incapacitated, or casting another concentration spell.
 */
export interface ConcentrationState {
  characterId: string;
  spellName: string;
  targets: string[];
  duration?: number;
  startedRound?: number;
}

/**
 * Tracks an active magical aura effect.
 * Auras typically affect all creatures within a certain radius.
 */
export interface AuraState {
  sourceId: string;
  auraName: string;
  radius: number;
  effect: string;
  duration?: number;
  startedRound?: number;
}

// ============================================================
// CHARACTER TYPES
// ============================================================

/**
 * Core character data structure for D&D 5e characters.
 * Includes ability scores, HP, spell slots, proficiencies, and more.
 */
export interface Character {
  id: string;
  name: string;
  race: string;
  class: string;
  level: number;
  abilityScores: AbilityScores;
  maxHp: number;
  currentHp: number;
  tempHp?: number;
  armorClass: number;
  proficiencyBonus: number;
  speed: number;
  hitDice: {
    total: number;
    current: number;
    sides: number;
  };
  spellSlots?: {
    [level: number]: {
      max: number;
      current: number;
    };
  };
  conditions: ActiveCondition[];
  equipment: string[];
  features: string[];
  spells: string[];
  inventory: string[];
  gold?: number;
  experience?: number;
  background?: string;
  alignment?: string;
  inspiration?: boolean;
  deathSaves?: {
    successes: number;
    failures: number;
  };
  skills?: Partial<Record<Skill, boolean>>;
  savingThrows?: Partial<Record<Ability, boolean>>;
}

/**
 * Represents a condition effect applied to a character or creature.
 * Includes the condition type and any associated metadata.
 */
export interface ConditionEffect {
  condition: Condition;
  duration?: number;
  source?: string;
  saveType?: Ability;
  saveDC?: number;
}

/**
 * An active condition on a character with tracking information.
 */
export interface ActiveCondition {
  name: Condition;
  duration?: number;
  source?: string;
  startedRound?: number;
}

/**
 * Represents a prop or object in the game world.
 * Can be interacted with, moved, or used in combat.
 */
export interface Prop {
  id: string;
  name: string;
  description?: string;
  position?: Position;
  size?: Size;
  blocking?: boolean;
  cover?: Cover;
  hp?: number;
  ac?: number;
  properties?: Record<string, unknown>;
}

// ============================================================
// LOCATION GRAPH TYPES
// ============================================================

export const LocationTypeSchema = fuzzyEnum([
  'room',
  'hallway',
  'indoor',
  'outdoor',
  'cave',
  'building',
  'dungeon',
  'town',
  'wilderness',
] as const, 'locationType');
export type LocationType = z.infer<typeof LocationTypeSchema>;

export const TerrainTypeSchema = fuzzyEnum([
  'normal',
  'difficult',
  'water',
  'lava',
  'ice',
  'mud',
  'sand',
] as const, 'terrainType');
export type TerrainType = z.infer<typeof TerrainTypeSchema>;

/**
 * A node in the location graph representing a discrete location.
 */
export interface LocationNode {
  id: string;
  name: string;
  description?: string;
  locationType: LocationType;
  lighting: Light;
  terrain?: TerrainType;
  size?: Size;
  hazards: string[];
  tags: string[];
  discovered: boolean;
  properties: Record<string, unknown>;
}

/**
 * An edge in the location graph representing a connection between locations.
 */
export interface LocationEdge {
  fromId: string;
  toId: string;
  connectionType: ConnectionType;
  locked: boolean;
  lockDC?: number;
  hidden: boolean;
  findDC?: number;
  oneWay: boolean;
  description?: string;
}

/**
 * The complete location graph with nodes, edges, and current location.
 */
export interface LocationGraph {
  nodes: Map<string, LocationNode>;
  edges: LocationEdge[];
  currentLocationId: string | null;
}

// ============================================================
// PARTY TYPES
// ============================================================

export const PartyRoleSchema = fuzzyEnum([
  'leader',
  'scout',
  'healer',
  'tank',
  'support',
  'damage',
  'utility',
  'other',
] as const, 'partyRole');
export type PartyRole = z.infer<typeof PartyRoleSchema>;

/**
 * Represents a member of the adventuring party.
 */
export interface PartyMember {
  characterId: string;
  characterName: string;
  role?: PartyRole;
  joinedAt: string;
}

/**
 * The current state of the adventuring party.
 */
export interface PartyState {
  members: PartyMember[];
  currentLocationId?: string;
  history: string[];
}
