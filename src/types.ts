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
