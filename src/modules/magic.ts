/**
 * Magic Module - Concentration & Aura Management
 *
 * Handles D&D 5e concentration tracking with save mechanics.
 * Per PHB p.203: "Some spells require you to maintain concentration."
 *
 * Also handles aura effects (Spirit Guardians, Aura of Protection, etc.)
 *
 * @module magic
 */

import { z } from 'zod';
import { randomUUID } from 'crypto';
import { createBox, centerText, BOX } from './ascii-art.js';
import {
  AbilitySchema,
  ConditionSchema,
  DamageTypeSchema,
  AoeShapeSchema,
  PositionSchema,
  RollModeSchema,
  type RollMode,
  type ConcentrationState,
  type AuraState,
} from '../types.js';
import { fuzzyEnum } from '../fuzzy-enum.js';

// ============================================================
// CONSTANTS
// ============================================================

/** Minimum DC for concentration save per D&D 5e rules */
const MIN_CONCENTRATION_DC = 10;

/** Maximum value for a d20 roll */
const MAX_MANUAL_ROLL = 20;

/** Minimum value for a d20 roll */
const MIN_MANUAL_ROLL = 1;

/** Standard display width for ASCII output */
const DISPLAY_WIDTH = 40;

/** Number of sides on a d20 */
const D20_SIDES = 20;

// ============================================================
// TYPES
// ============================================================

/**
 * Result of a concentration check after taking damage.
 * Discriminated union type for maintained vs broken concentration.
 */
type ConcentrationCheckResult =
  | { maintained: true; roll: number; dc: number }
  | { maintained: false; roll: number; dc: number; reason: string };

// ConcentrationState imported from ../types.js
// RollMode imported from ../types.js

// ============================================================
// STATE
// ============================================================

/**
 * In-memory concentration storage, keyed by character ID.
 * Each character can only concentrate on one spell at a time.
 */
const concentrationStore = new Map<string, ConcentrationState>();

// ============================================================
// SCHEMAS
// ============================================================

/** Schema for the 'set' operation - begin concentrating on a spell */
const setOperationSchema = z.object({
  characterId: z.string(),
  operation: z.literal('set'),
  spellName: z.string(),
  targets: z.array(z.string()).optional(),
  duration: z.number().optional(),
});

/** Schema for the 'get' operation - query concentration state */
const getOperationSchema = z.object({
  characterId: z.string(),
  operation: z.literal('get'),
});

/** Schema for the 'break' operation - manually end concentration */
const breakOperationSchema = z.object({
  characterId: z.string(),
  operation: z.literal('break'),
  reason: z.string().optional(),
});

/** Schema for the 'check' operation - roll a concentration save after damage */
const checkOperationSchema = z.object({
  characterId: z.string(),
  operation: z.literal('check'),
  damage: z.number(),
  conSaveModifier: z.number().optional(),
  rollMode: RollModeSchema.optional(),
  manualRoll: z.number().min(MIN_MANUAL_ROLL).max(MAX_MANUAL_ROLL).optional(),
  manualRolls: z.array(z.number().min(MIN_MANUAL_ROLL).max(MAX_MANUAL_ROLL)).length(2).optional(),
});

/**
 * Combined schema for all manage_concentration operations.
 * Supports: set, get, break, check
 */
export const manageConcentrationSchema = z.union([
  setOperationSchema,
  getOperationSchema,
  breakOperationSchema,
  checkOperationSchema,
]);

export type ManageConcentrationInput = z.infer<typeof manageConcentrationSchema>;

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Get current concentration state for a character.
 * Useful for integration with other modules (e.g., execute_action).
 *
 * @param characterId - The character ID to query
 * @returns The concentration state, or undefined if not concentrating
 */
export function getConcentrationState(characterId: string): ConcentrationState | undefined {
  return concentrationStore.get(characterId);
}

/**
 * Check if a character is currently concentrating on a spell.
 *
 * @param characterId - The character ID to check
 * @returns True if the character is concentrating
 */
export function isConcentrating(characterId: string): boolean {
  return concentrationStore.has(characterId);
}

/**
 * Clear all concentration states.
 * Primarily used for testing to ensure clean state between tests.
 */
export function clearAllConcentration(): void {
  concentrationStore.clear();
}

/**
 * Break concentration for a specific character programmatically.
 * Useful for integration when a character becomes incapacitated.
 *
 * @param characterId - The character whose concentration to break
 * @returns The spell name that was being concentrated on, or undefined
 */
export function breakConcentration(characterId: string): string | undefined {
  const state = concentrationStore.get(characterId);
  if (state) {
    concentrationStore.delete(characterId);
    return state.spellName;
  }
  return undefined;
}

// ============================================================
// HANDLER
// ============================================================

/**
 * Main handler for the manage_concentration tool.
 * Dispatches to operation-specific handlers.
 *
 * @param input - Validated input from the schema
 * @returns ASCII-formatted result string
 * @throws Error if operation is unknown (should not happen with proper validation)
 */
export function manageConcentration(input: ManageConcentrationInput): string {
  switch (input.operation) {
    case 'set':
      return handleSetConcentration(input);
    case 'get':
      return handleGetConcentration(input);
    case 'break':
      return handleBreakConcentration(input);
    case 'check':
      return handleCheckConcentration(input);
    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = input;
      throw new Error(`Unknown operation: ${(_exhaustive as { operation: string }).operation}`);
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Roll a d20, optionally using manual test values.
 *
 * @param manualValue - Optional predetermined roll value (for testing)
 * @returns A number between 1 and 20
 */
function rollD20(manualValue?: number): number {
  if (manualValue !== undefined) {
    return manualValue;
  }
  return Math.floor(Math.random() * D20_SIDES) + 1;
}

/**
 * Calculate the DC for a concentration save.
 * Per D&D 5e rules: DC = max(10, damage/2)
 *
 * @param damage - The damage taken
 * @returns The DC for the concentration save
 */
function calculateConcentrationDC(damage: number): number {
  return Math.max(MIN_CONCENTRATION_DC, Math.floor(damage / 2));
}

/**
 * Format a modifier as a string with sign.
 *
 * @param modifier - The numeric modifier
 * @returns String like "+5" or "-2"
 */
function formatModifier(modifier: number): string {
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

/**
 * Build target list display string.
 *
 * @param targets - Array of target IDs
 * @returns Formatted string of targets
 */
function formatTargetList(targets?: string[]): string | undefined {
  if (!targets || targets.length === 0) {
    return undefined;
  }
  return targets.join(', ');
}

// ============================================================
// SET OPERATION
// ============================================================

/**
 * Handle the 'set' operation - begin concentrating on a spell.
 * If already concentrating, the previous spell's concentration is broken.
 *
 * @param input - Validated set operation input
 * @returns ASCII-formatted result
 */
function handleSetConcentration(input: z.infer<typeof setOperationSchema>): string {
  const { characterId, spellName, targets, duration } = input;
  const content: string[] = [];

  // Check if already concentrating (need to break first)
  const existing = concentrationStore.get(characterId);
  if (existing) {
    content.push(`Previously concentrating on: ${existing.spellName}`);
    content.push('Concentration BROKEN!');
    content.push('');
    content.push(BOX.LIGHT.H.repeat(DISPLAY_WIDTH));
    content.push('');
  }

  // Set new concentration
  const newState: ConcentrationState = {
    characterId,
    spellName,
    targets: targets || [],
    duration,
  };
  concentrationStore.set(characterId, newState);

  content.push(centerText('CONCENTRATING', DISPLAY_WIDTH));
  content.push('');
  content.push(`Caster: ${characterId}`);
  content.push(`Spell: ${spellName}`);

  const targetDisplay = formatTargetList(targets);
  if (targetDisplay) {
    content.push(`Targets: ${targetDisplay}`);
  }

  if (duration !== undefined) {
    content.push(`Duration: ${duration} rounds`);
  }

  return createBox('CONCENTRATION SET', content);
}

// ============================================================
// GET OPERATION
// ============================================================

/**
 * Handle the 'get' operation - query current concentration state.
 *
 * @param input - Validated get operation input
 * @returns ASCII-formatted concentration status
 */
function handleGetConcentration(input: z.infer<typeof getOperationSchema>): string {
  const { characterId } = input;
  const content: string[] = [];

  const state = concentrationStore.get(characterId);

  if (!state) {
    content.push(centerText('Not concentrating', DISPLAY_WIDTH));
    content.push('');
    content.push(`Character: ${characterId}`);
    return createBox('CONCENTRATION STATUS', content);
  }

  content.push(centerText('CONCENTRATING', DISPLAY_WIDTH));
  content.push('');
  content.push(`Character: ${characterId}`);
  content.push(`Spell: ${state.spellName}`);

  const targetDisplay = formatTargetList(state.targets);
  if (targetDisplay) {
    content.push(`Targets: ${targetDisplay}`);
  }

  if (state.duration !== undefined) {
    content.push(`Duration remaining: ${state.duration} rounds`);
  }

  return createBox('CONCENTRATION STATUS', content);
}

// ============================================================
// BREAK OPERATION
// ============================================================

/**
 * Handle the 'break' operation - manually end concentration.
 * Used when a caster voluntarily ends concentration or becomes incapacitated.
 *
 * @param input - Validated break operation input
 * @returns ASCII-formatted break confirmation
 */
function handleBreakConcentration(input: z.infer<typeof breakOperationSchema>): string {
  const { characterId, reason } = input;
  const content: string[] = [];

  const state = concentrationStore.get(characterId);

  if (!state) {
    content.push(centerText('Not concentrating', DISPLAY_WIDTH));
    content.push('');
    content.push(`Character: ${characterId}`);
    content.push('No concentration to break.');
    return createBox('CONCENTRATION', content);
  }

  // Remove concentration
  concentrationStore.delete(characterId);

  content.push(centerText('CONCENTRATION BROKEN', DISPLAY_WIDTH));
  content.push('');
  content.push(`Character: ${characterId}`);
  content.push(`Spell: ${state.spellName}`);

  const targetDisplay = formatTargetList(state.targets);
  if (targetDisplay) {
    content.push(`Affected targets: ${targetDisplay}`);
  }

  if (reason) {
    content.push('');
    content.push(`Reason: ${reason}`);
  }

  return createBox('CONCENTRATION BROKEN', content);
}

// ============================================================
// CHECK OPERATION
// ============================================================

/**
 * Handle the 'check' operation - roll a Constitution save after taking damage.
 * Per D&D 5e rules: DC = max(10, damage/2)
 *
 * @param input - Validated check operation input
 * @returns ASCII-formatted save result
 */
function handleCheckConcentration(input: z.infer<typeof checkOperationSchema>): string {
  const {
    characterId,
    damage,
    conSaveModifier = 0,
    rollMode = 'normal',
    manualRoll,
    manualRolls
  } = input;
  const content: string[] = [];

  // Check if concentrating
  const state = concentrationStore.get(characterId);
  if (!state) {
    content.push(centerText('Not concentrating', DISPLAY_WIDTH));
    content.push('');
    content.push(`Character: ${characterId}`);
    content.push('No concentration check needed.');
    return createBox('CONCENTRATION CHECK', content);
  }

  // Calculate DC
  const dc = calculateConcentrationDC(damage);

  // Roll the save
  const { finalRoll, rollDisplay } = resolveRoll(rollMode, manualRoll, manualRolls);
  const totalRoll = finalRoll + conSaveModifier;
  const success = totalRoll >= dc;

  // Build output
  content.push(centerText('CONCENTRATION CHECK', DISPLAY_WIDTH));
  content.push('');
  content.push(`Spell: ${state.spellName}`);
  content.push(`Damage taken: ${damage}`);
  content.push('');
  content.push(BOX.LIGHT.H.repeat(DISPLAY_WIDTH));
  content.push('');
  content.push(`DC ${dc} Constitution Save`);
  content.push('');
  content.push(`Roll: ${rollDisplay}`);

  if (conSaveModifier !== 0) {
    const modDisplay = formatModifier(conSaveModifier);
    content.push(`Modifier: ${modDisplay}`);
    content.push(`Total: ${finalRoll} ${modDisplay} = ${totalRoll}`);
  } else {
    content.push(`Total: ${totalRoll}`);
  }

  content.push('');
  content.push(BOX.LIGHT.H.repeat(DISPLAY_WIDTH));
  content.push('');

  if (success) {
    content.push(centerText('SUCCESS', DISPLAY_WIDTH));
    content.push('Concentration maintained!');
  } else {
    content.push(centerText('FAILED', DISPLAY_WIDTH));
    content.push(centerText('CONCENTRATION BROKEN', DISPLAY_WIDTH));

    // Break concentration
    concentrationStore.delete(characterId);
  }

  return createBox('CONCENTRATION CHECK', content);
}

/**
 * Resolve a d20 roll with optional advantage/disadvantage.
 *
 * @param rollMode - 'normal', 'advantage', or 'disadvantage'
 * @param manualRoll - Optional single roll override (for normal mode testing)
 * @param manualRolls - Optional pair of rolls override (for adv/disadv testing)
 * @returns Object with finalRoll and rollDisplay string
 */
function resolveRoll(
  rollMode: RollMode,
  manualRoll?: number,
  manualRolls?: number[]
): { finalRoll: number; rollDisplay: string } {
  if (rollMode === 'advantage') {
    const roll1 = manualRolls ? manualRolls[0] : rollD20();
    const roll2 = manualRolls ? manualRolls[1] : rollD20();
    const finalRoll = Math.max(roll1, roll2);
    return {
      finalRoll,
      rollDisplay: `${roll1}, ${roll2} (advantage, took ${finalRoll})`,
    };
  }

  if (rollMode === 'disadvantage') {
    const roll1 = manualRolls ? manualRolls[0] : rollD20();
    const roll2 = manualRolls ? manualRolls[1] : rollD20();
    const finalRoll = Math.min(roll1, roll2);
    return {
      finalRoll,
      rollDisplay: `${roll1}, ${roll2} (disadvantage, took ${finalRoll})`,
    };
  }

  // Normal roll
  const finalRoll = rollD20(manualRoll);
  return {
    finalRoll,
    rollDisplay: `${finalRoll}`,
  };
}

// ============================================================
// AURA MANAGEMENT
// ============================================================

/**
 * Extended aura state with additional mechanical properties.
 * Extends the base AuraState from types.ts with game-specific fields.
 */
interface ExtendedAuraState {
  id: string;
  ownerId: string;
  spellName: string;
  radius: number;
  duration?: number;
  damage?: string;
  damageType?: string;
  healing?: string;
  effect?: string;
  condition?: string;
  saveDC?: number;
  saveAbility?: string;
  halfOnSave?: boolean;
  affectsEnemies?: boolean;
  affectsAllies?: boolean;
}

/**
 * In-memory aura storage, keyed by aura ID.
 */
const auraStore = new Map<string, ExtendedAuraState>();

// ============================================================
// AURA SCHEMAS
// ============================================================

const auraTargetSchema = z.object({
  targetId: z.string(),
  distance: z.number(),
  saveModifier: z.number().optional(),
});

const manualSaveRollSchema = z.object({
  targetId: z.string(),
  roll: z.number().min(1).max(20),
});

const createAuraSchema = z.object({
  operation: z.literal('create'),
  ownerId: z.string(),
  spellName: z.string(),
  radius: z.number().min(1),
  duration: z.number().optional(),
  damage: z.string().optional(),
  damageType: DamageTypeSchema.optional(),
  healing: z.string().optional(),
  effect: z.string().optional(),
  condition: ConditionSchema.optional(),
  saveDC: z.number().optional(),
  saveAbility: AbilitySchema.optional(),
  halfOnSave: z.boolean().optional(),
  affectsEnemies: z.boolean().optional(),
  affectsAllies: z.boolean().optional(),
});

const listAuraSchema = z.object({
  operation: z.literal('list'),
  ownerId: z.string().optional(),
});

const removeAuraSchema = z.object({
  operation: z.literal('remove'),
  auraId: z.string(),
  reason: z.string().optional(),
});

const processAuraSchema = z.object({
  operation: z.literal('process'),
  auraId: z.string(),
  targets: z.array(auraTargetSchema),
  decrementDuration: z.boolean().optional(),
  manualDamageRolls: z.array(z.number()).optional(),
  manualHealingRolls: z.array(z.number()).optional(),
  manualSaveRolls: z.array(manualSaveRollSchema).optional(),
});

export const manageAuraSchema = z.union([
  createAuraSchema,
  listAuraSchema,
  removeAuraSchema,
  processAuraSchema,
]);

export type ManageAuraInput = z.infer<typeof manageAuraSchema>;

// ============================================================
// AURA PUBLIC API
// ============================================================

/**
 * Get an aura by ID.
 */
export function getAura(auraId: string): ExtendedAuraState | undefined {
  return auraStore.get(auraId);
}

/**
 * Get all auras for an owner.
 */
export function getAurasForOwner(ownerId: string): ExtendedAuraState[] {
  return Array.from(auraStore.values()).filter(a => a.ownerId === ownerId);
}

/**
 * Clear all auras (for testing).
 */
export function clearAllAuras(): void {
  auraStore.clear();
}

// ============================================================
// AURA HANDLER
// ============================================================

/**
 * Main handler for the manage_aura tool.
 */
export function manageAura(input: ManageAuraInput): string {
  switch (input.operation) {
    case 'create':
      return handleCreateAura(input);
    case 'list':
      return handleListAuras(input);
    case 'remove':
      return handleRemoveAura(input);
    case 'process':
      return handleProcessAura(input);
    default:
      const _exhaustive: never = input;
      throw new Error(`Unknown operation: ${(_exhaustive as { operation: string }).operation}`);
  }
}

// ============================================================
// AURA CREATE OPERATION
// ============================================================

function handleCreateAura(input: z.infer<typeof createAuraSchema>): string {
  const id = `aura-${randomUUID().slice(0, 8)}`;
  const content: string[] = [];

  const aura: ExtendedAuraState = {
    id,
    ownerId: input.ownerId,
    spellName: input.spellName,
    radius: input.radius,
    duration: input.duration,
    damage: input.damage,
    damageType: input.damageType,
    healing: input.healing,
    effect: input.effect,
    condition: input.condition,
    saveDC: input.saveDC,
    saveAbility: input.saveAbility,
    halfOnSave: input.halfOnSave,
    affectsEnemies: input.affectsEnemies,
    affectsAllies: input.affectsAllies,
  };

  auraStore.set(id, aura);

  content.push(centerText('AURA CREATED', DISPLAY_WIDTH));
  content.push('');
  content.push(`ID: ${id}`);
  content.push(`Spell: ${input.spellName}`);
  content.push(`Owner: ${input.ownerId}`);
  content.push(`Radius: ${input.radius} ft`);

  if (input.duration !== undefined) {
    content.push(`Duration: ${input.duration} rounds`);
  }

  content.push('');
  content.push(BOX.LIGHT.H.repeat(DISPLAY_WIDTH));

  if (input.damage) {
    content.push('');
    content.push(`Damage: ${input.damage} ${input.damageType || ''}`);
    if (input.saveDC && input.saveAbility) {
      content.push(`Save: DC ${input.saveDC} ${input.saveAbility.toUpperCase()}`);
      if (input.halfOnSave) {
        content.push('Half damage on save');
      }
    }
  }

  if (input.healing) {
    content.push('');
    content.push(`Healing: ${input.healing}`);
  }

  if (input.condition) {
    content.push('');
    content.push(`Applies: ${input.condition}`);
  }

  if (input.affectsEnemies !== undefined || input.affectsAllies !== undefined) {
    content.push('');
    const targets: string[] = [];
    if (input.affectsEnemies) targets.push('enemies');
    if (input.affectsAllies) targets.push('allies');
    if (targets.length === 0) {
      targets.push(input.affectsEnemies === false ? 'allies only' : 'all');
    }
    content.push(`Affects: ${targets.join(', ')}`);
  }

  return createBox('AURA CREATED', content);
}

// ============================================================
// AURA LIST OPERATION
// ============================================================

function handleListAuras(input: z.infer<typeof listAuraSchema>): string {
  const content: string[] = [];

  let auras = Array.from(auraStore.values());
  if (input.ownerId) {
    auras = auras.filter(a => a.ownerId === input.ownerId);
  }

  if (auras.length === 0) {
    content.push(centerText('No active auras', DISPLAY_WIDTH));
    return createBox('ACTIVE AURAS', content);
  }

  content.push(centerText(`${auras.length} ACTIVE AURA${auras.length === 1 ? '' : 'S'}`, DISPLAY_WIDTH));
  content.push('');

  for (const aura of auras) {
    content.push(BOX.LIGHT.H.repeat(DISPLAY_WIDTH));
    content.push(`ID: ${aura.id}`);
    content.push(`Spell: ${aura.spellName}`);
    content.push(`Owner: ${aura.ownerId}`);
    content.push(`Radius: ${aura.radius} ft`);

    if (aura.duration !== undefined) {
      content.push(`Duration: ${aura.duration} rounds`);
    }

    if (aura.damage) {
      content.push(`Damage: ${aura.damage} ${aura.damageType || ''}`);
    }

    if (aura.healing) {
      content.push(`Healing: ${aura.healing}`);
    }

    content.push('');
  }

  return createBox('ACTIVE AURAS', content);
}

// ============================================================
// AURA REMOVE OPERATION
// ============================================================

function handleRemoveAura(input: z.infer<typeof removeAuraSchema>): string {
  const content: string[] = [];
  const aura = auraStore.get(input.auraId);

  if (!aura) {
    content.push(centerText('Aura not found', DISPLAY_WIDTH));
    content.push('');
    content.push(`ID: ${input.auraId}`);
    content.push('This aura does not exist.');
    return createBox('AURA REMOVE', content);
  }

  auraStore.delete(input.auraId);

  content.push(centerText('AURA REMOVED', DISPLAY_WIDTH));
  content.push('');
  content.push(`ID: ${aura.id}`);
  content.push(`Spell: ${aura.spellName}`);
  content.push(`Owner: ${aura.ownerId}`);

  if (input.reason) {
    content.push('');
    content.push(`Reason: ${input.reason}`);
  }

  return createBox('AURA REMOVED', content);
}

// ============================================================
// AURA PROCESS OPERATION
// ============================================================

function handleProcessAura(input: z.infer<typeof processAuraSchema>): string {
  const content: string[] = [];
  const aura = auraStore.get(input.auraId);

  if (!aura) {
    content.push(centerText('Aura not found', DISPLAY_WIDTH));
    content.push('');
    content.push(`ID: ${input.auraId}`);
    content.push('This aura does not exist.');
    return createBox('AURA PROCESS', content);
  }

  content.push(centerText('AURA PROCESSING', DISPLAY_WIDTH));
  content.push('');
  content.push(`Spell: ${aura.spellName}`);
  content.push(`Owner: ${aura.ownerId}`);
  content.push('');
  content.push(BOX.LIGHT.H.repeat(DISPLAY_WIDTH));

  const inRange: typeof input.targets = [];
  const outOfRange: typeof input.targets = [];

  for (const target of input.targets) {
    if (target.distance <= aura.radius) {
      inRange.push(target);
    } else {
      outOfRange.push(target);
    }
  }

  // Process targets in range
  for (const target of inRange) {
    content.push('');
    content.push(`Target: ${target.targetId} (${target.distance} ft)`);

    // Check for save if required
    let saveSucceeded = false;
    if (aura.saveDC && aura.saveAbility) {
      const manualSave = input.manualSaveRolls?.find(s => s.targetId === target.targetId);
      const roll = manualSave ? manualSave.roll : rollD20();
      const modifier = target.saveModifier || 0;
      const total = roll + modifier;
      saveSucceeded = total >= aura.saveDC;

      content.push(`  Save: DC ${aura.saveDC} ${aura.saveAbility.toUpperCase()}`);
      content.push(`  Roll: ${roll}${modifier !== 0 ? ` ${formatModifier(modifier)} = ${total}` : ''}`);
      content.push(`  Result: ${saveSucceeded ? 'SAVED' : 'FAILED'}`);
    }

    // Apply damage
    if (aura.damage) {
      const damageRoll = rollDice(aura.damage, input.manualDamageRolls);
      let finalDamage = damageRoll.total;

      if (saveSucceeded && aura.halfOnSave) {
        finalDamage = Math.floor(finalDamage / 2);
        content.push(`  Damage: ${damageRoll.total} ${aura.damageType || ''} (halved to ${finalDamage})`);
      } else if (!saveSucceeded || !aura.saveDC) {
        content.push(`  Damage: ${finalDamage} ${aura.damageType || ''}`);
      }
    }

    // Apply healing
    if (aura.healing) {
      const healingRoll = rollDice(aura.healing, input.manualHealingRolls);
      content.push(`  Healing: ${healingRoll.total} HP restored`);
    }

    // Apply condition
    if (aura.condition && !saveSucceeded) {
      content.push(`  Condition: ${aura.condition} applied`);
    } else if (aura.condition && saveSucceeded) {
      content.push(`  Condition: resisted ${aura.condition}`);
    }
  }

  // Show out of range targets
  if (outOfRange.length > 0) {
    content.push('');
    content.push(BOX.LIGHT.H.repeat(DISPLAY_WIDTH));
    content.push('');
    content.push('Out of range (skipped):');
    for (const target of outOfRange) {
      content.push(`  ${target.targetId} (${target.distance} ft)`);
    }
  }

  // Handle duration
  if (input.decrementDuration && aura.duration !== undefined) {
    aura.duration -= 1;
    content.push('');
    content.push(BOX.LIGHT.H.repeat(DISPLAY_WIDTH));

    if (aura.duration <= 0) {
      auraStore.delete(aura.id);
      content.push('');
      content.push(centerText('AURA EXPIRED', DISPLAY_WIDTH));
      content.push('Duration ended - aura removed');
    } else {
      content.push('');
      content.push(`Duration remaining: ${aura.duration} rounds`);
    }
  }

  return createBox('AURA PROCESS', content);
}

/**
 * Simple dice roller for aura damage/healing.
 * Parses expressions like "3d8" or "2d6".
 */
function rollDice(expression: string, manualRolls?: number[]): { total: number; rolls: number[] } {
  const match = expression.match(/^(\d+)d(\d+)$/i);
  if (!match) {
    return { total: 0, rolls: [] };
  }

  const numDice = parseInt(match[1]);
  const dieSize = parseInt(match[2]);

  const rolls: number[] = [];
  for (let i = 0; i < numDice; i++) {
    if (manualRolls && i < manualRolls.length) {
      rolls.push(manualRolls[i]);
    } else {
      rolls.push(Math.floor(Math.random() * dieSize) + 1);
    }
  }

  return {
    total: rolls.reduce((sum, r) => sum + r, 0),
    rolls,
  };
}

// ============================================================
// USE SCROLL
// ============================================================

/**
 * Scroll statistics per spell level
 */
interface ScrollStats {
  saveDC: number;
  attackBonus: number;
  rarity: string;
}

/**
 * Scroll statistics by spell level per DMG.
 * Keyed by spell level (0-9)
 */
const SCROLL_STATS: Record<number, ScrollStats> = {
  0: { saveDC: 13, attackBonus: 5, rarity: 'Common' },
  1: { saveDC: 13, attackBonus: 5, rarity: 'Common' },
  2: { saveDC: 13, attackBonus: 5, rarity: 'Uncommon' },
  3: { saveDC: 15, attackBonus: 7, rarity: 'Uncommon' },
  4: { saveDC: 15, attackBonus: 7, rarity: 'Rare' },
  5: { saveDC: 17, attackBonus: 9, rarity: 'Rare' },
  6: { saveDC: 17, attackBonus: 9, rarity: 'Very Rare' },
  7: { saveDC: 18, attackBonus: 10, rarity: 'Very Rare' },
  8: { saveDC: 18, attackBonus: 10, rarity: 'Very Rare' },
  9: { saveDC: 19, attackBonus: 11, rarity: 'Legendary' }
};

// PositionSchema imported from ../types.js

export const useScrollSchema = z.object({
  characterId: z.string(),
  scrollName: z.string(),
  spellLevel: z.number().min(0).max(9),
  casterLevel: z.number().min(1).max(20),

  // Targeting (all optional)
  targetId: z.string().optional(),
  targetIds: z.array(z.string()).optional(),
  targetPosition: PositionSchema.optional(),

  // Arcana check for higher-level scrolls
  arcanaBonus: z.number().optional(),
  rollMode: RollModeSchema.optional(),
  manualRoll: z.number().min(1).max(20).optional(),
  manualRolls: z.array(z.number().min(1).max(20)).length(2).optional(),

  // Optional spell properties
  isAttackSpell: z.boolean().optional(),
  spellSchool: z.string().optional(),
});

export type UseScrollInput = z.infer<typeof useScrollSchema>;

/**
 * Use a spell scroll per D&D 5e rules.
 * - If spell level <= caster level: auto success
 * - If spell level > caster level: Arcana check DC 10 + spell level
 */
export function useScroll(input: UseScrollInput): string {
  const content: string[] = [];
  const {
    characterId,
    scrollName,
    spellLevel,
    casterLevel,
    targetId,
    targetIds,
    targetPosition,
    arcanaBonus = 0,
    rollMode = 'normal',
    manualRoll,
    manualRolls,
    isAttackSpell,
    spellSchool,
  } = input;

  // Get scroll stats
  const stats = SCROLL_STATS[spellLevel];

  // Extract spell name from scroll name
  const spellName = scrollName.replace(/^Scroll of /i, '');

  content.push(centerText('SPELL SCROLL', DISPLAY_WIDTH));
  content.push('');
  content.push(`Caster: ${characterId}`);
  content.push(`Scroll: ${scrollName}`);
  content.push(`Spell Level: ${spellLevel}`);

  if (spellSchool) {
    content.push(`School: ${spellSchool}`);
  }

  content.push('');
  content.push(BOX.LIGHT.H.repeat(DISPLAY_WIDTH));
  content.push('');

  // Check if Arcana roll is needed
  const needsArcanaCheck = spellLevel > casterLevel;
  let success = true;

  if (needsArcanaCheck) {
    const arcanaDC = 10 + spellLevel;
    content.push(`Spell level (${spellLevel}) exceeds caster level (${casterLevel})`);
    content.push(`Arcana Check Required: DC ${arcanaDC}`);
    content.push('');

    // Roll Arcana check
    const { finalRoll, rollDisplay } = resolveArcanaRoll(rollMode, manualRoll, manualRolls);
    const total = finalRoll + arcanaBonus;
    success = total >= arcanaDC;

    content.push(`Roll: ${rollDisplay}`);
    if (arcanaBonus !== 0) {
      content.push(`Modifier: ${formatModifier(arcanaBonus)}`);
      content.push(`Total: ${finalRoll} ${formatModifier(arcanaBonus)} = ${total}`);
    } else {
      content.push(`Total: ${total}`);
    }
    content.push('');
    content.push(BOX.LIGHT.H.repeat(DISPLAY_WIDTH));
    content.push('');
  }

  // Show targeting info if provided
  if (targetId || targetIds || targetPosition) {
    content.push('Targeting:');
    if (targetId) {
      content.push(`  Target: ${targetId}`);
    }
    if (targetIds && targetIds.length > 0) {
      content.push(`  Targets: ${targetIds.join(', ')}`);
    }
    if (targetPosition) {
      content.push(`  Position: (${targetPosition.x}, ${targetPosition.y}${targetPosition.z !== undefined ? `, ${targetPosition.z}` : ''})`);
    }
    content.push('');
  }

  // Show spell stats
  content.push(`Spell Save DC: DC ${stats.saveDC}`);
  if (isAttackSpell) {
    content.push(`Spell Attack: +${stats.attackBonus}`);
  }
  content.push('');
  content.push(BOX.LIGHT.H.repeat(DISPLAY_WIDTH));
  content.push('');

  // Result
  if (success) {
    content.push(centerText('SUCCESS', DISPLAY_WIDTH));
    content.push('');
    content.push(`${spellName} has been cast!`);
    content.push('The scroll crumbles to dust (consumed).');
  } else {
    content.push(centerText('FAILED', DISPLAY_WIDTH));
    content.push('');
    content.push('The magic fizzles and the scroll is lost!');
    content.push('The scroll crumbles to dust (consumed).');
  }

  const title = success ? 'SCROLL CAST' : 'SCROLL FAILED';
  return createBox(title, content);
}

/**
 * Resolve an Arcana check roll with advantage/disadvantage.
 */
function resolveArcanaRoll(
  rollMode: 'normal' | 'advantage' | 'disadvantage',
  manualRoll?: number,
  manualRolls?: number[]
): { finalRoll: number; rollDisplay: string } {
  if (rollMode === 'advantage') {
    const roll1 = manualRolls ? manualRolls[0] : rollD20();
    const roll2 = manualRolls ? manualRolls[1] : rollD20();
    const finalRoll = Math.max(roll1, roll2);
    return {
      finalRoll,
      rollDisplay: `${roll1}, ${roll2} (advantage, took ${finalRoll})`,
    };
  }

  if (rollMode === 'disadvantage') {
    const roll1 = manualRolls ? manualRolls[0] : rollD20();
    const roll2 = manualRolls ? manualRolls[1] : rollD20();
    const finalRoll = Math.min(roll1, roll2);
    return {
      finalRoll,
      rollDisplay: `${roll1}, ${roll2} (disadvantage, took ${finalRoll})`,
    };
  }

  const finalRoll = manualRoll !== undefined ? manualRoll : rollD20();
  return {
    finalRoll,
    rollDisplay: `${finalRoll}`,
  };
}

// ============================================================
// SYNTHESIZE SPELL
// ============================================================

/**
 * Spell schools for synthesized spells
 */
const SpellSchoolSchema = fuzzyEnum([
  'abjuration',
  'conjuration',
  'divination',
  'enchantment',
  'evocation',
  'illusion',
  'necromancy',
  'transmutation',
]);

/**
 * AoE shapes for synthesized spells
 */
// Using AoeShapeSchema from types.ts

/**
 * Effect types for synthesized spells
 */
const EffectTypeSchema = fuzzyEnum(['damage', 'healing', 'control', 'utility', 'summon'] as const);

/**
 * Proposed spell effect schema
 */
const SpellEffectSchema = z.object({
  type: EffectTypeSchema,
  damage: z.string().optional(),
  damageType: DamageTypeSchema.optional(),
  healing: z.string().optional(),
  condition: ConditionSchema.optional(),
});

/**
 * Area of effect schema
 */
const SpellAreaSchema = z.object({
  shape: AoeShapeSchema,
  size: z.number(),
});

/**
 * Saving throw schema
 */
const SpellSavingThrowSchema = z.object({
  ability: AbilitySchema,
  dc: z.number(),
});

/**
 * Proposed spell schema
 */
const ProposedSpellSchema = z.object({
  name: z.string(),
  level: z.number().min(1).max(9),
  school: SpellSchoolSchema,
  effect: SpellEffectSchema,
  range: z.number(),
  area: SpellAreaSchema.optional(),
  savingThrow: SpellSavingThrowSchema.optional(),
  concentration: z.boolean().optional(),
  duration: z.string().optional(),
});

/**
 * Main synthesize_spell schema
 */
export const synthesizeSpellSchema = z.object({
  encounterId: z.string().optional(),
  casterId: z.string(),
  intent: z.string(),
  proposedSpell: ProposedSpellSchema,

  // Arcana check modifiers
  arcanaBonus: z.number().optional(),
  rollMode: RollModeSchema.optional(),
  manualRoll: z.number().min(1).max(20).optional(),
  manualRolls: z.array(z.number().min(1).max(20)).length(2).optional(),

  // Circumstance modifiers
  nearLeyLine: z.boolean().optional(),
  desperationBonus: z.boolean().optional(),
  materialComponentValue: z.number().optional(),
});

export type SynthesizeSpellInput = z.infer<typeof synthesizeSpellSchema>;

/** Ley line DC reduction */
const LEY_LINE_DC_REDUCTION = 2;

/** Desperation roll bonus */
const DESPERATION_ROLL_BONUS = 2;

/** Material component value thresholds for DC reduction */
const MATERIAL_DC_THRESHOLDS = [
  { value: 100, reduction: 1 },
  { value: 500, reduction: 2 },
  { value: 1000, reduction: 3 },
];

/** Mastery level thresholds (beat DC by X) */
const ENHANCED_MASTERY_THRESHOLD = 5;

/**
 * Calculates the Arcana check DC for spell synthesis.
 * Base DC = 10 + (spell level * 2)
 *
 * @param level - Spell level (0-9)
 * @param nearLeyLine - Proximity to ley line (-2 DC)
 * @param materialComponentValue - Value of components in GP (reduces DC)
 * @returns Object with final DC and modifier breakdown
 */
function calculateSynthesisDC(
  level: number,
  nearLeyLine?: boolean,
  materialComponentValue?: number
): { dc: number; modifiers: string[] } {
  let dc = 10 + (level * 2);
  const modifiers: string[] = [];

  if (nearLeyLine) {
    dc -= 2;
    modifiers.push('Near ley line: -2');
  }

  if (materialComponentValue && materialComponentValue >= 100) {
    const reduction = Math.floor(materialComponentValue / 100);
    dc -= reduction;
    modifiers.push(`Components (${materialComponentValue}gp): -${reduction}`);
  }

  return { dc, modifiers };
}

/**
 * Main handler for synthesize_spell.
 * Arcana check DC = 10 + (level × 2) + modifiers
 */
export function synthesizeSpell(input: SynthesizeSpellInput): string {
  const content: string[] = [];
  const {
    encounterId,
    casterId,
    intent,
    proposedSpell,
    arcanaBonus = 0,
    rollMode = 'normal',
    manualRoll,
    manualRolls,
    nearLeyLine,
    desperationBonus,
    materialComponentValue,
  } = input;

  // Calculate DC using helper function
  const { dc, modifiers: dcModifiers } = calculateSynthesisDC(
    proposedSpell.level,
    nearLeyLine,
    materialComponentValue
  );

  // Build header
  content.push(centerText('ARCANE SYNTHESIS', DISPLAY_WIDTH));
  content.push('');
  content.push(`Caster: ${casterId}`);
  if (encounterId) {
    content.push(`Encounter: ${encounterId}`);
  }
  content.push('');
  content.push(`Intent: "${intent}"`);
  content.push('');
  content.push(BOX.LIGHT.H.repeat(DISPLAY_WIDTH));
  content.push('');

  // Show proposed spell
  content.push(centerText('PROPOSED SPELL', DISPLAY_WIDTH));
  content.push('');
  content.push(`Name: ${proposedSpell.name}`);
  content.push(`Level: ${proposedSpell.level}`);
  content.push(`School: ${proposedSpell.school}`);
  content.push(`Range: ${proposedSpell.range} ft`);

  // Effect details
  content.push('');
  content.push(`Effect Type: ${proposedSpell.effect.type}`);
  if (proposedSpell.effect.damage) {
    content.push(`Damage: ${proposedSpell.effect.damage} ${proposedSpell.effect.damageType || ''}`);
  }
  if (proposedSpell.effect.healing) {
    content.push(`Healing: ${proposedSpell.effect.healing}`);
  }
  if (proposedSpell.effect.condition) {
    content.push(`Condition: ${proposedSpell.effect.condition}`);
  }

  // Area of effect
  if (proposedSpell.area) {
    content.push(`Area: ${proposedSpell.area.size} ft ${proposedSpell.area.shape}`);
  }

  // Saving throw
  if (proposedSpell.savingThrow) {
    content.push(`Save: DC ${proposedSpell.savingThrow.dc} ${proposedSpell.savingThrow.ability.toUpperCase()}`);
  }

  // Concentration and duration
  if (proposedSpell.concentration) {
    content.push(`Concentration: Yes`);
  }
  if (proposedSpell.duration) {
    content.push(`Duration: ${proposedSpell.duration}`);
  }

  content.push('');
  content.push(BOX.LIGHT.H.repeat(DISPLAY_WIDTH));
  content.push('');

  // Show DC calculation
  content.push(centerText('ARCANA CHECK', DISPLAY_WIDTH));
  content.push('');
  content.push(`Base DC: 10 + (${proposedSpell.level} × 2) = ${10 + proposedSpell.level * 2}`);
  if (dcModifiers.length > 0) {
    content.push(`Modifiers: ${dcModifiers.join(', ')}`);
  }
  content.push(`Final DC: DC ${dc}`);
  content.push('');

  // Show circumstance bonuses
  if (nearLeyLine) {
    content.push('Near ley line: DC reduced');
  }
  if (desperationBonus) {
    content.push(`Desperation: +${DESPERATION_ROLL_BONUS} to roll (mishap on failure)`);
  }
  if (materialComponentValue !== undefined) {
    content.push(`Material components: ${materialComponentValue}gp`);
  }

  // Roll the check
  const { finalRoll, rollDisplay } = resolveArcanaRoll(rollMode, manualRoll, manualRolls);

  // Apply desperation bonus to roll
  let rollBonus = arcanaBonus;
  if (desperationBonus) {
    rollBonus += DESPERATION_ROLL_BONUS;
  }

  const total = finalRoll + rollBonus;
  const isNat1 = finalRoll === 1;
  const isNat20 = finalRoll === 20;

  content.push('');
  content.push(`Roll: ${rollDisplay}`);
  if (rollBonus !== 0) {
    content.push(`Modifier: ${formatModifier(rollBonus)}`);
    content.push(`Total: ${finalRoll} ${formatModifier(rollBonus)} = ${total}`);
  } else {
    content.push(`Total: ${total}`);
  }

  content.push('');
  content.push(BOX.LIGHT.H.repeat(DISPLAY_WIDTH));
  content.push('');

  // Determine outcome
  const success = total >= dc && !isNat1;
  const marginOfSuccess = total - dc;
  const enhancedSuccess = success && marginOfSuccess >= ENHANCED_MASTERY_THRESHOLD;
  const criticalSuccess = success && isNat20;
  const mishap = isNat1 || (desperationBonus && !success);

  // Display result
  if (criticalSuccess) {
    content.push(centerText('CRITICAL SUCCESS!', DISPLAY_WIDTH));
    content.push('');
    content.push('The magic flows flawlessly!');
    content.push('The spell manifests with perfect clarity.');
    content.push('');
    content.push(`${proposedSpell.name} created successfully!`);
    if (proposedSpell.effect.damage) {
      content.push(`Deals maximum damage: ${proposedSpell.effect.damage}`);
    }
  } else if (enhancedSuccess) {
    content.push(centerText('ENHANCED SUCCESS!', DISPLAY_WIDTH));
    content.push('');
    content.push('Exceptional mastery of the arcane!');
    content.push(`Beat DC by ${marginOfSuccess} - enhanced effect`);
    content.push('');
    content.push(`${proposedSpell.name} created with bonus!`);
  } else if (success) {
    content.push(centerText('SUCCESS', DISPLAY_WIDTH));
    content.push('');
    content.push('The improvised magic takes form!');
    content.push('');
    content.push(`${proposedSpell.name} created successfully!`);
    if (proposedSpell.effect.damage) {
      content.push(`Damage: ${proposedSpell.effect.damage} ${proposedSpell.effect.damageType || ''}`);
    }
    if (proposedSpell.effect.healing) {
      content.push(`Healing: ${proposedSpell.effect.healing}`);
    }
  } else if (mishap) {
    if (isNat1) {
      content.push(centerText('MISHAP!', DISPLAY_WIDTH));
      content.push('');
      content.push('The magic surges wildly!');
      content.push('A critical failure causes a magical backfire!');
    } else {
      content.push(centerText('SEVERE MISHAP!', DISPLAY_WIDTH));
      content.push('');
      content.push('Desperation magic gone wrong!');
      content.push('The risky casting has backfired terribly!');
    }
    content.push('');
    content.push('The DM should determine the mishap effect:');
    content.push('- Wild magic surge');
    content.push('- Damage to caster');
    content.push('- Unintended effect');
  } else {
    content.push(centerText('FAILED', DISPLAY_WIDTH));
    content.push('');
    content.push('The magic fails to coalesce.');
    content.push('The spell fizzles without taking form.');
    content.push('');
    content.push(`Missed DC by ${dc - total}`);
  }

  const title = mishap ? 'SPELL MISHAP' : success ? 'SPELL SYNTHESIZED' : 'SYNTHESIS FAILED';
  return createBox(title, content);
}
