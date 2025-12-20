/**
 * Combat Module - Condition Management & Encounters
 * Handles D&D 5e conditions with duration tracking and encounter management
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { ConditionSchema, AbilitySchema, PositionSchema, SizeSchema, DamageTypeSchema, LightSchema, type Condition, type Ability } from '../types.js';
import { createBox, centerText, padText, BOX, createStatusBar } from './ascii-art.js';
import { broadcastToEncounter } from '../websocket.js';

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
// SCHEMAS
// ============================================================

// Single condition operation
const singleConditionSchema = z.object({
  targetId: z.string(),
  encounterId: z.string().optional(),

  operation: z.enum(['add', 'remove', 'query', 'tick']),

  // For add/remove
  condition: ConditionSchema.optional(),
  source: z.string().optional(),
  duration: z.union([
    z.number(), // Rounds
    z.literal('concentration'),
    z.literal('until_dispelled'),
    z.literal('until_rest'),
    z.literal('save_ends'),
  ]).optional(),
  saveDC: z.number().optional(),
  saveAbility: AbilitySchema.optional(),

  // For exhaustion
  exhaustionLevels: z.number().min(1).optional(),

  // For tick
  roundNumber: z.number().optional(),
});

// Support both single and batch operations
export const manageConditionSchema = z.union([
  singleConditionSchema,
  z.object({
    batch: z.array(singleConditionSchema).min(1).max(20),
  }),
]);

export type ManageConditionInput = z.infer<typeof singleConditionSchema>;

// ============================================================
// CONDITION DATA
// ============================================================

// Mechanical effects that conditions can apply to character stats
interface ConditionEffect {
  // Stat multipliers (e.g., 0.5 = halved)
  maxHpMultiplier?: number;
  speedMultiplier?: number;

  // Stat modifiers (flat adjustments)
  maxHpModifier?: number;
  speedModifier?: number;
  acModifier?: number;

  // Ability score modifiers
  strModifier?: number;
  dexModifier?: number;
  conModifier?: number;
  intModifier?: number;
  wisModifier?: number;
  chaModifier?: number;

  // Advantage/disadvantage tracking
  disadvantageOn?: string[]; // e.g., ["ability_checks", "attack_rolls", "dex_saves"]
  advantageOn?: string[]; // e.g., ["stealth_checks"]

  // Auto-fail certain checks/saves
  autoFailSaves?: string[]; // e.g., ["str", "dex"]

  // Movement restrictions
  cannotMove?: boolean;
  canOnlyCrawl?: boolean;

  // Incapacitation
  incapacitated?: boolean;

  // Custom effects (for future extensibility)
  customEffects?: Record<string, number | string | boolean>;
}

interface ActiveCondition {
  condition: Condition | string; // Allow custom condition names
  description?: string; // Custom description (optional, falls back to CONDITION_EFFECTS)
  mechanicalEffects?: ConditionEffect; // Mechanical effects on stats
  source?: string;
  duration?: number | 'concentration' | 'until_dispelled' | 'until_rest' | 'save_ends';
  saveDC?: number;
  saveAbility?: Ability;
  exhaustionLevel?: number;
  roundsRemaining?: number;
}

// In-memory condition storage (per target)
const conditionStore = new Map<string, ActiveCondition[]>();

// D&D 5e Condition Effects
const CONDITION_EFFECTS: Record<Condition, string> = {
  blinded: "Can't see, auto-fails sight checks. Attacks have disadvantage, attacks against have advantage.",
  charmed: "Can't attack charmer or target with harmful abilities/effects. Charmer has advantage on social interactions.",
  deafened: "Can't hear, auto-fails hearing checks.",
  frightened: "Disadvantage on ability checks and attacks while source is visible. Can't willingly move closer to source.",
  grappled: "Speed becomes 0, can't benefit from speed bonuses. Ends if grappler is incapacitated or moved away.",
  incapacitated: "Can't take actions or reactions.",
  invisible: "Impossible to see without special sense. Heavily obscured for hiding. Attacks have advantage, attacks against have disadvantage.",
  paralyzed: "Incapacitated, can't move or speak. Auto-fails STR and DEX saves. Attacks have advantage. Melee hits within 5ft are auto-crits.",
  petrified: "Transformed to solid substance, incapacitated, can't move/speak, unaware. Weight x10. Auto-fails STR/DEX saves. Resistance to all damage. Immune to poison/disease.",
  poisoned: "Disadvantage on attack rolls and ability checks.",
  prone: "Only movement is crawling (costs extra). Attacks have disadvantage. Melee attacks against have advantage, ranged have disadvantage.",
  restrained: "Speed becomes 0, can't benefit from speed bonuses. Attacks have disadvantage. Attacks against have advantage. Disadvantage on DEX saves.",
  stunned: "Incapacitated, can't move, can speak only falteringly. Auto-fails STR and DEX saves. Attacks against have advantage.",
  unconscious: "Incapacitated, can't move/speak, unaware. Drops held items, falls prone. Auto-fails STR/DEX saves. Attacks have advantage. Melee hits within 5ft are auto-crits.",
  exhaustion: "Stacking penalty with 6 levels (see exhaustion table).",
};

// Exhaustion level effects
const EXHAUSTION_EFFECTS: Record<number, string> = {
  1: "Disadvantage on ability checks",
  2: "Speed halved",
  3: "Disadvantage on attack rolls and saving throws",
  4: "Hit point maximum halved",
  5: "Speed reduced to 0",
  6: "DEATH",
};

// ============================================================
// MECHANICAL EFFECTS: Built-in conditions
// ============================================================

/**
 * Get the mechanical effects for built-in D&D 5e conditions
 * Returns undefined for conditions with no mechanical stat effects
 */
function getBuiltInMechanicalEffects(condition: Condition | string, exhaustionLevel?: number): ConditionEffect | undefined {
  // Exhaustion has level-based effects
  if (condition === 'exhaustion' && exhaustionLevel) {
    const effects: ConditionEffect = {};

    // Level 1: Disadvantage on ability checks
    if (exhaustionLevel >= 1) {
      effects.disadvantageOn = ['ability_checks'];
    }

    // Level 2: Speed halved
    if (exhaustionLevel >= 2) {
      effects.speedMultiplier = 0.5;
    }

    // Level 3: Disadvantage on attack rolls and saving throws
    if (exhaustionLevel >= 3) {
      effects.disadvantageOn = [...(effects.disadvantageOn || []), 'attack_rolls', 'saving_throws'];
    }

    // Level 4: Hit point maximum halved
    if (exhaustionLevel >= 4) {
      effects.maxHpMultiplier = 0.5;
    }

    // Level 5: Speed reduced to 0
    if (exhaustionLevel >= 5) {
      effects.speedMultiplier = 0;
      effects.cannotMove = true;
    }

    // Level 6: DEATH (no mechanical effects to track, character is dead)
    if (exhaustionLevel >= 6) {
      effects.customEffects = { isDead: true };
    }

    return effects;
  }

  // Other conditions with mechanical effects
  const effects: ConditionEffect = {};

  switch (condition) {
    case 'poisoned':
      effects.disadvantageOn = ['attack_rolls', 'ability_checks'];
      break;

    case 'grappled':
    case 'restrained':
      effects.speedModifier = 0;
      effects.cannotMove = true;
      if (condition === 'restrained') {
        effects.disadvantageOn = ['attack_rolls', 'dex_saves'];
      }
      break;

    case 'prone':
      effects.canOnlyCrawl = true;
      effects.disadvantageOn = ['attack_rolls'];
      break;

    case 'paralyzed':
    case 'stunned':
    case 'unconscious':
      effects.incapacitated = true;
      effects.autoFailSaves = ['str', 'dex'];
      effects.cannotMove = true;
      break;

    case 'incapacitated':
      effects.incapacitated = true;
      break;

    case 'petrified':
      effects.incapacitated = true;
      effects.cannotMove = true;
      effects.autoFailSaves = ['str', 'dex'];
      break;

    default:
      // Conditions with no mechanical stat effects (blinded, charmed, deafened, frightened, invisible)
      return undefined;
  }

  return Object.keys(effects).length > 0 ? effects : undefined;
}

// ============================================================
// HELPER: Get Character Name from ID
// ============================================================

function getCharacterNameById(characterId: string): string | null {
  const dataDir = path.join(DATA_ROOT, 'characters');
  const filePath = path.join(dataDir, `${characterId}.json`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const character = JSON.parse(fileContent);
    return character.name || null;
  } catch {
    return null;
  }
}

// ============================================================
// PUBLIC API: Condition Effects for Character Stats
// ============================================================

/**
 * Get all active conditions for a character
 * Used by get_character to display condition-affected stats
 */
export function getActiveConditions(characterId: string): ActiveCondition[] {
  return conditionStore.get(characterId) || [];
}

/**
 * Calculate effective character stats after applying all active condition effects
 * Returns object with base values and effective values
 */
export function calculateEffectiveStats(characterId: string, baseStats: {
  maxHp: number;
  hp: number;
  speed: number;
  ac?: number;
}): {
  maxHp: { base: number; effective: number; modified: boolean };
  speed: { base: number; effective: number; modified: boolean };
  ac?: { base: number; effective: number; modified: boolean };
  conditionEffects: string[]; // Human-readable list of active effects
} {
  const conditions = getActiveConditions(characterId);
  const result = {
    maxHp: { base: baseStats.maxHp, effective: baseStats.maxHp, modified: false },
    speed: { base: baseStats.speed, effective: baseStats.speed, modified: false },
    ac: baseStats.ac ? { base: baseStats.ac, effective: baseStats.ac, modified: false } : undefined,
    conditionEffects: [] as string[],
  };

  // Apply each condition's mechanical effects
  for (const cond of conditions) {
    // Get mechanical effects (either custom or built-in)
    let effects = cond.mechanicalEffects;
    if (!effects && (cond.condition in CONDITION_EFFECTS || cond.condition === 'exhaustion')) {
      effects = getBuiltInMechanicalEffects(cond.condition, cond.exhaustionLevel);
    }

    if (!effects) continue;

    // Apply HP maximum modifier
    if (effects.maxHpMultiplier !== undefined) {
      result.maxHp.effective = Math.floor(result.maxHp.effective * effects.maxHpMultiplier);
      result.maxHp.modified = true;
      const condName = cond.condition === 'exhaustion'
        ? `Exhaustion ${cond.exhaustionLevel}`
        : String(cond.condition).charAt(0).toUpperCase() + String(cond.condition).slice(1);
      result.conditionEffects.push(`${condName}: HP max ×${effects.maxHpMultiplier}`);
    }
    if (effects.maxHpModifier !== undefined) {
      result.maxHp.effective += effects.maxHpModifier;
      result.maxHp.modified = true;
      result.conditionEffects.push(`HP max ${effects.maxHpModifier > 0 ? '+' : ''}${effects.maxHpModifier}`);
    }

    // Apply speed modifier
    if (effects.speedMultiplier !== undefined) {
      result.speed.effective = Math.floor(result.speed.effective * effects.speedMultiplier);
      result.speed.modified = true;
      const condName = cond.condition === 'exhaustion'
        ? `Exhaustion ${cond.exhaustionLevel}`
        : String(cond.condition).charAt(0).toUpperCase() + String(cond.condition).slice(1);
      result.conditionEffects.push(`${condName}: Speed ×${effects.speedMultiplier}`);
    }
    if (effects.speedModifier !== undefined) {
      result.speed.effective += effects.speedModifier;
      result.speed.modified = true;
      result.conditionEffects.push(`Speed ${effects.speedModifier > 0 ? '+' : ''}${effects.speedModifier}`);
    }
    if (effects.cannotMove) {
      result.speed.effective = 0;
      result.speed.modified = true;
    }

    // Apply AC modifier
    if (result.ac && effects.acModifier !== undefined) {
      result.ac.effective += effects.acModifier;
      result.ac.modified = true;
      result.conditionEffects.push(`AC ${effects.acModifier > 0 ? '+' : ''}${effects.acModifier}`);
    }

    // Track other effects (disadvantage, auto-fail, etc.)
    if (effects.disadvantageOn && effects.disadvantageOn.length > 0) {
      const condName = cond.condition === 'exhaustion'
        ? `Exhaustion ${cond.exhaustionLevel}`
        : String(cond.condition).charAt(0).toUpperCase() + String(cond.condition).slice(1);
      result.conditionEffects.push(`${condName}: Disadv. on ${effects.disadvantageOn.join(', ')}`);
    }
    if (effects.autoFailSaves && effects.autoFailSaves.length > 0) {
      result.conditionEffects.push(`Auto-fail ${effects.autoFailSaves.join(', ').toUpperCase()} saves`);
    }
    if (effects.incapacitated) {
      result.conditionEffects.push('Incapacitated');
    }
  }

  return result;
}

// ============================================================
// HANDLER
// ============================================================

export function manageCondition(input: ManageConditionInput | { batch: ManageConditionInput[] }): string {
  // Check if this is a batch operation
  if ('batch' in input && input.batch) {
    return handleBatchConditions(input.batch);
  }

  const singleInput = input as ManageConditionInput;
  const { targetId, operation } = singleInput;

  switch (operation) {
    case 'add':
      return handleAddCondition(targetId, singleInput);
    case 'remove':
      return handleRemoveCondition(targetId, singleInput);
    case 'query':
      return handleQueryConditions(targetId);
    case 'tick':
      return handleTickDuration(targetId, singleInput);
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

// ============================================================
// BATCH HANDLER
// ============================================================

function handleBatchConditions(operations: ManageConditionInput[]): string {
  const results: Array<{
    targetId: string;
    targetName: string | null;
    operation: string;
    condition?: string;
    success: boolean;
    message: string;
    queryResult?: string; // Store full query result for query operations
  }> = [];

  for (const op of operations) {
    const targetName = getCharacterNameById(op.targetId);

    try {
      const result = manageCondition(op);
      results.push({
        targetId: op.targetId,
        targetName,
        operation: op.operation,
        condition: op.condition,
        success: true,
        message: op.operation === 'query' ? 'Queried' : 'Applied',
        queryResult: op.operation === 'query' ? result : undefined,
      });
    } catch (error) {
      results.push({
        targetId: op.targetId,
        targetName,
        operation: op.operation,
        condition: op.condition,
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return formatBatchResults(results);
}

function formatBatchResults(results: Array<{
  targetId: string;
  targetName: string | null;
  operation: string;
  condition?: string;
  success: boolean;
  message: string;
  queryResult?: string;
}>): string {
  const content: string[] = [];

  // Check if this is all query operations
  const allQueries = results.every(r => r.operation === 'query');

  if (allQueries && results.length > 0) {
    // Special formatting for query batch - show full details
    content.push(centerText(`CONDITION STATUS - ${results.length} CHARACTERS`, 68));
    content.push('');
    content.push('═'.repeat(68));

    for (const result of results) {
      content.push('');
      const displayName = result.targetName || result.targetId;
      content.push(centerText(displayName.toUpperCase(), 68));
      content.push('─'.repeat(68));

      if (result.success && result.queryResult) {
        // Extract just the condition details from the query result
        // The query result is a full box, so we'll strip the outer box
        const lines = result.queryResult.split('\n');
        // Find lines that contain actual condition info (skip the box borders)
        const relevantLines = lines.filter(line => {
          return line.trim() && !line.match(/^[╔╗╚╝║═─┌┐└┘│]+$/) && !line.includes('CONDITION STATUS');
        });

        for (const line of relevantLines) {
          content.push(line);
        }
      } else if (!result.success) {
        content.push(padText(`  Error: ${result.message}`, 68, 'left'));
      } else {
        content.push(padText(`  No active conditions`, 68, 'left'));
      }
      content.push('');
    }

    content.push('═'.repeat(68));
    return createBox('BATCH CONDITION QUERY', content, undefined, 'HEAVY');
  }

  // Standard batch operation formatting (add/remove/tick)
  content.push(centerText(`PROCESSED ${results.length} OPERATIONS`, 68));
  content.push('');
  content.push('─'.repeat(68));
  content.push('');

  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;

  for (const result of results) {
    const status = result.success ? '✓' : '✗';
    const displayName = result.targetName || result.targetId;
    const opDesc = result.condition
      ? `${result.operation} ${result.condition}`
      : result.operation;

    content.push(padText(`${status} ${displayName}: ${opDesc}`, 68, 'left'));
    if (!result.success) {
      content.push(padText(`   Error: ${result.message}`, 68, 'left'));
    }
  }

  content.push('');
  content.push('─'.repeat(68));
  content.push('');
  content.push(padText(`Success: ${successCount} | Failed: ${failCount}`, 68, 'left'));

  return createBox('BATCH CONDITION UPDATE', content, undefined, 'HEAVY');
}

// Helper for testing: clear all conditions
export function clearAllConditions(): void {
  conditionStore.clear();
}

// ============================================================
// ADD CONDITION
// ============================================================

function handleAddCondition(targetId: string, input: ManageConditionInput): string {
  if (!input.condition) {
    throw new Error('condition is required for add operation');
  }

  const conditions = conditionStore.get(targetId) || [];

  // Handle exhaustion specially
  if (input.condition === 'exhaustion') {
    return handleAddExhaustion(targetId, conditions, input);
  }

  // Check if condition already exists
  const existing = conditions.find(c => c.condition === input.condition);
  if (existing) {
    return formatConditionUpdate(targetId, input.condition, 'already has', existing);
  }

  // Create new condition
  const newCondition: ActiveCondition = {
    condition: input.condition,
    source: input.source,
    duration: input.duration,
    saveDC: input.saveDC,
    saveAbility: input.saveAbility,
  };

  // Set rounds remaining for numeric durations
  if (typeof input.duration === 'number') {
    newCondition.roundsRemaining = input.duration;
  }

  conditions.push(newCondition);
  conditionStore.set(targetId, conditions);

  // Broadcast condition added if in an encounter context
  if (input.encounterId) {
    broadcastToEncounter(input.encounterId, {
      type: 'conditionAdded',
      entityId: targetId,
      condition: input.condition,
      duration: typeof input.duration === 'number' ? input.duration : undefined,
    });
  }

  return formatConditionUpdate(targetId, input.condition, 'added', newCondition);
}

function handleAddExhaustion(
  targetId: string,
  conditions: ActiveCondition[],
  input: ManageConditionInput
): string {
  const existing = conditions.find(c => c.condition === 'exhaustion');
  const levelsToAdd = input.exhaustionLevels || 1;

  if (existing) {
    // Increment existing exhaustion
    const currentLevel = existing.exhaustionLevel || 1;
    const newLevel = Math.min(6, currentLevel + levelsToAdd);
    existing.exhaustionLevel = newLevel;
    conditionStore.set(targetId, conditions);
    return formatExhaustionLevel(targetId, newLevel, 'increased to');
  } else {
    // Add new exhaustion
    const level = Math.min(6, levelsToAdd);
    const newCondition: ActiveCondition = {
      condition: 'exhaustion',
      exhaustionLevel: level,
    };
    conditions.push(newCondition);
    conditionStore.set(targetId, conditions);
    return formatExhaustionLevel(targetId, level, 'added');
  }
}

// ============================================================
// REMOVE CONDITION
// ============================================================

function handleRemoveCondition(targetId: string, input: ManageConditionInput): string {
  const conditions = conditionStore.get(targetId) || [];

  // Special handling for "all"
  if (input.condition === 'all' as any) {
    conditionStore.set(targetId, []);
    const content: string[] = [];
    content.push(centerText(`TARGET: ${targetId}`, 58));
    content.push('');
    content.push(centerText('All conditions removed', 58));
    return createBox('CONDITIONS CLEARED', content, undefined, 'HEAVY');
  }

  if (!input.condition) {
    throw new Error('condition is required for remove operation');
  }

  // Handle exhaustion specially
  if (input.condition === 'exhaustion') {
    return handleRemoveExhaustion(targetId, conditions, input);
  }

  const index = conditions.findIndex(c => c.condition === input.condition);

  if (index === -1) {
    const content: string[] = [];
    content.push(centerText(`TARGET: ${targetId}`, 58));
    content.push('');
    content.push(centerText(`Not affected by ${input.condition}`, 58));
    return createBox('CONDITION NOT FOUND', content, undefined, 'HEAVY');
  }

  const removed = conditions.splice(index, 1)[0];
  conditionStore.set(targetId, conditions);

  // Broadcast condition removed if in an encounter context
  if (input.encounterId) {
    broadcastToEncounter(input.encounterId, {
      type: 'conditionRemoved',
      entityId: targetId,
      condition: input.condition!,
    });
  }

  return formatConditionUpdate(targetId, input.condition, 'removed', removed);
}

function handleRemoveExhaustion(
  targetId: string,
  conditions: ActiveCondition[],
  input: ManageConditionInput
): string {
  const existing = conditions.find(c => c.condition === 'exhaustion');

  if (!existing) {
    const content: string[] = [];
    content.push(centerText(`TARGET: ${targetId}`, 58));
    content.push('');
    content.push(centerText('Not affected by exhaustion', 58));
    return createBox('CONDITION NOT FOUND', content, undefined, 'HEAVY');
  }

  const currentLevel = existing.exhaustionLevel || 1;
  const levelsToRemove = input.exhaustionLevels || 1;
  const newLevel = currentLevel - levelsToRemove;

  if (newLevel <= 0) {
    // Remove exhaustion entirely
    const index = conditions.findIndex(c => c.condition === 'exhaustion');
    conditions.splice(index, 1);
    conditionStore.set(targetId, conditions);
    const content: string[] = [];
    content.push(centerText(`TARGET: ${targetId}`, 58));
    content.push('');
    content.push(centerText('Exhaustion removed completely', 58));
    return createBox('EXHAUSTION REMOVED', content, undefined, 'HEAVY');
  } else {
    // Reduce level
    existing.exhaustionLevel = newLevel;
    conditionStore.set(targetId, conditions);
    return formatExhaustionLevel(targetId, newLevel, 'reduced to');
  }
}

// ============================================================
// QUERY CONDITIONS
// ============================================================

function handleQueryConditions(targetId: string): string {
  const conditions = conditionStore.get(targetId) || [];
  const targetName = getCharacterNameById(targetId);
  const displayName = targetName || targetId;
  const content: string[] = [];
  const WIDTH = 58;

  content.push(centerText(`TARGET: ${displayName}`, WIDTH));
  content.push('');

  if (conditions.length === 0) {
    content.push(centerText('No active conditions', WIDTH));
    return createBox('CONDITION STATUS', content, undefined, 'HEAVY');
  }

  const box = BOX.LIGHT;
  content.push(box.H.repeat(WIDTH));
  content.push('');

  for (const cond of conditions) {
    if (cond.condition === 'exhaustion') {
      const level = cond.exhaustionLevel || 1;
      content.push(centerText(`EXHAUSTION - LEVEL ${level}`, WIDTH));
      content.push('');
      content.push(padText(`Current Effect: ${EXHAUSTION_EFFECTS[level]}`, WIDTH, 'left'));
      content.push('');

      // Show all effects up to current level
      content.push(padText('All Active Effects:', WIDTH, 'left'));
      for (let i = 1; i <= level; i++) {
        content.push(padText(`  ${i}. ${EXHAUSTION_EFFECTS[i]}`, WIDTH, 'left'));
      }
    } else {
      const condName = cond.condition.charAt(0).toUpperCase() + cond.condition.slice(1);
      content.push(centerText(condName.toUpperCase(), WIDTH));
      content.push('');

      // Show effect description (either built-in or custom)
      const effectText = cond.description
        || (cond.condition in CONDITION_EFFECTS ? CONDITION_EFFECTS[cond.condition as Condition] : 'Custom condition');
      content.push(padText(`Effect: ${effectText}`, WIDTH, 'left'));
      content.push('');

      if (cond.source) {
        content.push(padText(`Source: ${cond.source}`, WIDTH, 'left'));
      }

      if (cond.duration !== undefined) {
        if (typeof cond.duration === 'number' || cond.roundsRemaining !== undefined) {
          const rounds = cond.roundsRemaining ?? cond.duration;
          content.push(padText(`Duration: ${rounds} round${rounds !== 1 ? 's' : ''} remaining`, WIDTH, 'left'));
        } else {
          content.push(padText(`Duration: ${cond.duration.replace(/_/g, ' ')}`, WIDTH, 'left'));
        }
      }

      if (cond.saveDC) {
        const ability = cond.saveAbility?.toUpperCase() || 'SAVE';
        content.push(padText(`Save: DC ${cond.saveDC} ${ability} to end`, WIDTH, 'left'));
      }
    }
    content.push('');
    content.push(box.H.repeat(WIDTH));
    content.push('');
  }

  return createBox('CONDITION STATUS', content, undefined, 'HEAVY');
}

// ============================================================
// TICK DURATION
// ============================================================

function handleTickDuration(targetId: string, input: ManageConditionInput): string {
  const conditions = conditionStore.get(targetId) || [];
  const expired: string[] = [];
  const updated: string[] = [];

  for (let i = conditions.length - 1; i >= 0; i--) {
    const cond = conditions[i];

    // Only tick numeric durations
    if (cond.roundsRemaining !== undefined && typeof cond.roundsRemaining === 'number') {
      cond.roundsRemaining -= 1;

      if (cond.roundsRemaining <= 0) {
        expired.push(cond.condition);
        conditions.splice(i, 1);
      } else {
        updated.push(`${cond.condition} (${cond.roundsRemaining} round${cond.roundsRemaining !== 1 ? 's' : ''})`);
      }
    }
  }

  conditionStore.set(targetId, conditions);

  const content: string[] = [];
  const WIDTH = 58;

  content.push(centerText(`TARGET: ${targetId}`, WIDTH));
  content.push('');

  const box = BOX.LIGHT;
  content.push(box.H.repeat(WIDTH));
  content.push('');

  if (expired.length > 0) {
    content.push(padText(`Expired: ${expired.join(', ')}`, WIDTH, 'left'));
  }

  if (updated.length > 0) {
    if (expired.length > 0) content.push('');
    content.push(padText(`Updated: ${updated.join(', ')}`, WIDTH, 'left'));
  }

  if (expired.length === 0 && updated.length === 0) {
    content.push(centerText('No round-based conditions to update', WIDTH));
  }

  return createBox('CONDITION TICK', content, undefined, 'HEAVY');
}

// ============================================================
// FORMATTING HELPERS
// ============================================================

function formatConditionUpdate(
  targetId: string,
  condition: Condition,
  action: string,
  conditionData: ActiveCondition
): string {
  const targetName = getCharacterNameById(targetId);
  const displayName = targetName || targetId;
  const content: string[] = [];
  const WIDTH = 58;
  const condName = condition.charAt(0).toUpperCase() + condition.slice(1);
  const actionTitle = action.charAt(0).toUpperCase() + action.slice(1);

  content.push(centerText(`TARGET: ${displayName}`, WIDTH));
  content.push(centerText(`${condName} ${action}`, WIDTH));
  content.push('');

  const box = BOX.LIGHT;
  content.push(box.H.repeat(WIDTH));
  content.push('');

  content.push(centerText(condName.toUpperCase(), WIDTH));
  content.push('');
  content.push(padText(`Effect: ${CONDITION_EFFECTS[condition]}`, WIDTH, 'left'));

  if (conditionData.source) {
    content.push('');
    content.push(padText(`Source: ${conditionData.source}`, WIDTH, 'left'));
  }

  if (conditionData.duration !== undefined) {
    if (typeof conditionData.duration === 'number' || conditionData.roundsRemaining !== undefined) {
      const rounds = conditionData.roundsRemaining ?? conditionData.duration;
      content.push('');
      content.push(padText(`Duration: ${rounds} round${rounds !== 1 ? 's' : ''}`, WIDTH, 'left'));
    } else {
      content.push('');
      content.push(padText(`Duration: ${conditionData.duration.replace(/_/g, ' ')}`, WIDTH, 'left'));
    }
  }

  if (conditionData.saveDC) {
    const ability = conditionData.saveAbility?.toUpperCase() || 'SAVE';
    content.push('');
    content.push(padText(`Save: DC ${conditionData.saveDC} ${ability} to end`, WIDTH, 'left'));
  }

  return createBox(`CONDITION ${actionTitle.toUpperCase()}`, content, undefined, 'HEAVY');
}

function formatExhaustionLevel(targetId: string, level: number, action: string): string {
  const targetName = getCharacterNameById(targetId);
  const displayName = targetName || targetId;
  const content: string[] = [];
  const WIDTH = 58;
  const actionTitle = action.charAt(0).toUpperCase() + action.slice(1);

  content.push(centerText(`TARGET: ${displayName}`, WIDTH));
  content.push(centerText(`Exhaustion Level ${level}`, WIDTH));
  content.push('');

  const box = BOX.LIGHT;
  content.push(box.H.repeat(WIDTH));
  content.push('');

  content.push(centerText('EXHAUSTION', WIDTH));
  content.push('');
  content.push(padText(`Current Effect: ${EXHAUSTION_EFFECTS[level]}`, WIDTH, 'left'));
  content.push('');
  content.push(padText('All Active Effects:', WIDTH, 'left'));

  for (let i = 1; i <= level; i++) {
    content.push(padText(`  ${i}. ${EXHAUSTION_EFFECTS[i]}`, WIDTH, 'left'));
  }

  return createBox(`EXHAUSTION ${actionTitle.toUpperCase()}`, content, undefined, 'HEAVY');
}

// ============================================================
// ENCOUNTER MANAGEMENT
// ============================================================

// Encounter Participant Schema
const ParticipantSchema = z.object({
  id: z.string(),
  name: z.string(),
  hp: z.number().min(0),  // Allow 0 HP for dying/unconscious characters
  maxHp: z.number().positive(),
  ac: z.number().min(0).default(10),
  initiativeBonus: z.number().default(0),
  position: PositionSchema,
  isEnemy: z.boolean().default(false),
  size: SizeSchema.default('medium'),
  speed: z.number().default(30),
  resistances: z.array(DamageTypeSchema).optional(),
  immunities: z.array(DamageTypeSchema).optional(),
  vulnerabilities: z.array(DamageTypeSchema).optional(),
  conditionImmunities: z.array(ConditionSchema).optional(),
});

// Terrain Schema
const TerrainSchema = z.object({
  width: z.number().min(5).max(100).default(20),
  height: z.number().min(5).max(100).default(20),
  obstacles: z.array(z.string()).optional(),
  difficultTerrain: z.array(z.string()).optional(),
  water: z.array(z.string()).optional(),
  hazards: z.array(z.object({
    position: z.string(),
    type: z.string(),
    damage: z.string().optional(),
    dc: z.number().optional(),
  })).optional(),
});

// Create Encounter Schema
export const createEncounterSchema = z.object({
  seed: z.string().optional(),
  participants: z.array(ParticipantSchema).min(1),
  terrain: TerrainSchema.optional(),
  lighting: LightSchema.default('bright'),
  surprise: z.array(z.string()).optional(),
});

/** Input type - fields with defaults are optional */
export type CreateEncounterInput = z.input<typeof createEncounterSchema>;
/** Runtime type - fields with defaults are populated */
export type Participant = z.infer<typeof ParticipantSchema>;

// Encounter State
interface EncounterState {
  id: string;
  round: number;
  participants: Array<Participant & { initiative: number; surprised?: boolean; damageDealt?: number; damageTaken?: number; healingDone?: number; attacksMade?: number; attacksHit?: number; conditionsApplied?: string[] }>;
  terrain: z.infer<typeof TerrainSchema>;
  lighting: string;
  currentTurnIndex: number;
  // End encounter fields
  status?: 'active' | 'ended';
  outcome?: 'victory' | 'defeat' | 'fled' | 'negotiated' | 'other';
  endedAt?: string;
  notes?: string;
  preserved?: boolean;
}

// In-memory encounter storage
const encounterStore = new Map<string, EncounterState>();

// ============================================================
// DEATH SAVE STATE MANAGEMENT
// ============================================================

interface DeathSaveState {
  successes: number;  // 0-3 (3 = stable)
  failures: number;   // 0-3 (3 = dead)
  isStable: boolean;
  isDead: boolean;
}

// Key format: "encounterId:characterId"
const deathSaveStore = new Map<string, DeathSaveState>();

/** Get the death save state key */
function getDeathSaveKey(encounterId: string, characterId: string): string {
  return `${encounterId}:${characterId}`;
}

/** Get death save state for a character in an encounter */
export function getDeathSaveState(encounterId: string, characterId: string): DeathSaveState | undefined {
  return deathSaveStore.get(getDeathSaveKey(encounterId, characterId));
}

/** Clear death save state for a character (when healed or encounter ends) */
export function clearDeathSaveStateForCharacter(encounterId: string, characterId: string): void {
  deathSaveStore.delete(getDeathSaveKey(encounterId, characterId));
}

/** Clear all death save state (for testing) */
export function clearAllDeathSaveState(): void {
  deathSaveStore.clear();
}

// Helper: Roll d20 (when seeded, use fixed value for deterministic testing)
function rollD20(seeded?: boolean): number {
  if (seeded) {
    // For seeded/deterministic tests, use fixed roll so initiative depends only on bonus
    return 10;
  }
  return Math.floor(Math.random() * 20) + 1;
}

// Create Encounter Handler
export function createEncounter(input: CreateEncounterInput): string {
  // Parse and validate input - this applies all defaults
  const parsed = createEncounterSchema.parse(input);
  
  // Validate unique participant IDs
  const ids = new Set<string>();
  for (const p of parsed.participants) {
    if (ids.has(p.id)) {
      throw new Error(`Duplicate participant ID: ${p.id}`);
    }
    ids.add(p.id);
  }

  // Determine if we should use deterministic rolls
  const seeded = !!parsed.seed;

  // Generate unique encounter ID
  const encounterId = randomUUID();

  // Terrain and lighting already have defaults applied by parse
  const terrain = parsed.terrain || { width: 20, height: 20 };
  const lighting = parsed.lighting;
  const surpriseSet = new Set(parsed.surprise || []);

  // Roll initiative for all participants and mark surprised
  const participantsWithInitiative = parsed.participants.map(p => {
    const initiativeRoll = rollD20(seeded);
    const initiative = initiativeRoll + p.initiativeBonus;
    const surprised = surpriseSet.has(p.id);
    
    return {
      ...p,
      initiative,
      surprised,
    };
  });

  // Sort by initiative (highest first)
  participantsWithInitiative.sort((a, b) => {
    if (b.initiative !== a.initiative) {
      return b.initiative - a.initiative;
    }
    // Tie-breaker: higher initiative bonus goes first
    return (b.initiativeBonus || 0) - (a.initiativeBonus || 0);
  });

  // Store encounter state
  const encounterState: EncounterState = {
    id: encounterId,
    round: 1,
    participants: participantsWithInitiative,
    terrain,
    lighting,
    currentTurnIndex: 0,
  };

  encounterStore.set(encounterId, encounterState);

  // Format output
  return formatEncounterCreated(encounterState);
}

// Format encounter creation output
function formatEncounterCreated(encounter: EncounterState): string {
  const content: string[] = [];
  const WIDTH = 72;

  // Header
  content.push(centerText(`Encounter ID: ${encounter.id}`, WIDTH));
  content.push(centerText(`Round: ${encounter.round} | Lighting: ${encounter.lighting}`, WIDTH));
  content.push(centerText(`${encounter.participants.length} Participants`, WIDTH));
  content.push('');
  content.push('═'.repeat(WIDTH));
  content.push('');

  // Initiative Order
  content.push(centerText('INITIATIVE ORDER', WIDTH));
  content.push('');
  content.push('─'.repeat(WIDTH));
  content.push('');

  // Table header - widened position column to 14 chars to fit "(100, 100) 50ft"
  const header = ' #  | Name                | Init | HP          | AC | Position      ';
  content.push(header);
  content.push('─'.repeat(WIDTH));

  // Participants
  for (let i = 0; i < encounter.participants.length; i++) {
    const p = encounter.participants[i];
    const num = (i + 1).toString().padStart(2);
    const name = p.name.padEnd(19).substring(0, 19);
    const init = p.initiative.toString().padStart(4);
    const hp = `${p.hp}/${p.maxHp}`.padEnd(11).substring(0, 11);
    const ac = p.ac.toString().padStart(2);
    
    // Format position - wider column to fit elevation
    let posStr = `(${p.position.x}, ${p.position.y})`;
    if (p.position.z && p.position.z !== 0) {
      posStr += ` ${p.position.z}ft`;
    }
    posStr = posStr.padEnd(14).substring(0, 14);

    let line = ` ${num} | ${name} | ${init} | ${hp} | ${ac} | ${posStr}`;
    
    // Add markers
    const markers: string[] = [];
    if (p.isEnemy) markers.push('[ENEMY]');
    if (p.surprised) markers.push('[SURPRISED]');
    if (p.size && p.size !== 'medium') markers.push(`[${p.size.toUpperCase()}]`);
    
    if (markers.length > 0) {
      line += ' ' + markers.join(' ');
    }

    content.push(line);
  }

  content.push('');
  
  // Initiative summary for each participant (helps with test regex matching)
  content.push('─'.repeat(WIDTH));
  content.push('');
  for (const p of encounter.participants) {
    const surprised = p.surprised ? ' (SURPRISED)' : '';
    const sizeStr = p.size ? ` [${p.size}]` : '';
    content.push(padText(`${p.name}: Initiative: ${p.initiative}${sizeStr}${surprised}`, WIDTH, 'left'));
  }
  
  content.push('');
  content.push('═'.repeat(WIDTH));
  content.push('');

  // Terrain info
  const terrainParts: string[] = [];
  terrainParts.push(`Terrain: ${encounter.terrain.width}x${encounter.terrain.height}`);
  
  if (encounter.terrain.obstacles && encounter.terrain.obstacles.length > 0) {
    terrainParts.push(`Obstacles: ${encounter.terrain.obstacles.length}`);
  }
  
  if (encounter.terrain.difficultTerrain && encounter.terrain.difficultTerrain.length > 0) {
    terrainParts.push(`Difficult terrain: ${encounter.terrain.difficultTerrain.length}`);
  }
  
  if (encounter.terrain.water && encounter.terrain.water.length > 0) {
    terrainParts.push(`Water: ${encounter.terrain.water.length}`);
  }
  
  if (encounter.terrain.hazards && encounter.terrain.hazards.length > 0) {
    terrainParts.push(`Hazards: ${encounter.terrain.hazards.length}`);
  }

  content.push(padText(terrainParts.join(' | '), WIDTH, 'left'));

  // Hazard details if present
  if (encounter.terrain.hazards && encounter.terrain.hazards.length > 0) {
    content.push('');
    content.push(padText('Hazards:', WIDTH, 'left'));
    for (const h of encounter.terrain.hazards) {
      let hazardStr = `  ${h.position}: ${h.type}`;
      if (h.dc) hazardStr += ` (DC ${h.dc})`;
      if (h.damage) hazardStr += ` ${h.damage} damage`;
      content.push(padText(hazardStr, WIDTH, 'left'));
    }
  }

  return createBox('ENCOUNTER CREATED', content, undefined, 'HEAVY');
}

// ============================================================
// GET ENCOUNTER (with verbosity levels)
// ============================================================

// ============================================================
// GET ENCOUNTER CONSTANTS
// ============================================================

/** Box width for encounter displays */
const ENCOUNTER_WIDTH = 55;

/** HP bar widths by context */
const HP_BAR_WIDTH = {
  SUMMARY: 10,
  DETAILED: 8,
} as const;

/** Lighting display with icons */
const LIGHTING_DISPLAY: Record<string, string> = {
  bright: '☀️ Bright Light',
  dim: '🌙 Dim Light',
  darkness: '⚫ Darkness',
};

/** Type for participant with initiative (encounter context) */
type EncounterParticipant = Participant & { initiative: number };

// ============================================================
// GET ENCOUNTER HELPERS
// ============================================================

/**
 * Get status indicator emoji based on HP percentage.
 * @param hp - Current HP
 * @param maxHp - Maximum HP
 * @returns Status emoji: 💀 (dead), ⚠ (bloodied), ✓ (full), or empty
 */
function getStatusIndicator(hp: number, maxHp: number): string {
  if (hp === 0) return ' 💀';
  const percent = Math.round((hp / maxHp) * 100);
  if (percent <= 25) return ' ⚠';
  if (percent >= 100) return ' ✓';
  return '';
}

/**
 * Create a mini HP bar for inline display.
 * @param current - Current HP
 * @param max - Maximum HP  
 * @param width - Bar width in characters
 * @returns HP bar string like "████░░░░"
 */
function createMiniHpBar(current: number, max: number, width: number): string {
  const percent = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(percent * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/**
 * Format death save state for display.
 * @param encounterId - The encounter ID
 * @param characterId - The character ID
 * @returns Formatted death save string or null if no state
 */
function formatDeathSaveDisplay(encounterId: string, characterId: string): string | null {
  const deathState = getDeathSaveState(encounterId, characterId);
  if (!deathState) {
    return '💀 DYING - needs death save!';
  }
  
  const successMarkers = '●'.repeat(deathState.successes) + '○'.repeat(3 - deathState.successes);
  const failMarkers = '✕'.repeat(deathState.failures) + '○'.repeat(3 - deathState.failures);
  
  let status = '';
  if (deathState.isStable) status = ' (STABLE)';
  if (deathState.isDead) status = ' (DEAD)';
  
  return `💀 Saves: ${successMarkers} | Fails: ${failMarkers}${status}`;
}

// ============================================================
// GET ENCOUNTER SCHEMA
// ============================================================

/**
 * Verbosity levels for encounter retrieval:
 * - minimal: ID, round, current turn only (fast LLM context)
 * - summary: + participant list with HP bars (quick overview)
 * - standard: + full HP, AC, conditions, positions (default DM view)
 * - detailed: + terrain, lighting, resistances (full state dump)
 */
export const getEncounterSchema = z.object({
  encounterId: z.string().describe('The ID of the encounter to retrieve'),
  verbosity: z.enum(['minimal', 'summary', 'standard', 'detailed'])
    .optional()
    .default('standard')
    .describe('Level of detail to return'),
});

/** Input type - verbosity is optional (will default to 'standard') */
export type GetEncounterInput = z.input<typeof getEncounterSchema>;

/**
 * Get encounter state with configurable verbosity.
 * 
 * Designed for both player quick-reference and DM full state view.
 * Text interface optimized - clear ASCII formatting for readability.
 * 
 * @param input - encounterId and optional verbosity level
 * @returns ASCII-formatted encounter state
 * @throws Error if encounter not found
 */
export function getEncounter(input: GetEncounterInput | string): string {
  // Support both object input and simple string (backward compat)
  const encounterId = typeof input === 'string' ? input : input.encounterId;
  const verbosity = typeof input === 'string' ? 'standard' : (input.verbosity || 'standard');
  
  const encounter = encounterStore.get(encounterId);
  if (!encounter) {
    throw new Error(`Encounter not found: ${encounterId}`);
  }
  
  // Check if encounter has ended (preserved encounters)
  if (encounter.status === 'ended') {
    return formatEndedEncounter(encounter);
  }
  
  // Get current combatant info
  const currentCombatant = encounter.participants[encounter.currentTurnIndex];
  
  switch (verbosity) {
    case 'minimal':
      return formatEncounterMinimal(encounter, currentCombatant);
    case 'summary':
      return formatEncounterSummary(encounter, currentCombatant);
    case 'standard':
      return formatEncounterStandard(encounter, currentCombatant);
    case 'detailed':
      return formatEncounterDetailed(encounter, currentCombatant);
    default:
      return formatEncounterStandard(encounter, currentCombatant);
  }
}

/**
 * Format an ended/preserved encounter
 */
function formatEndedEncounter(encounter: EncounterState): string {
  const WIDTH = 66;
  const content: string[] = [];
  
  content.push('');
  content.push(`Encounter: ${encounter.id}`);
  content.push(`Status: ENDED`);
  content.push(`Outcome: ${(encounter.outcome || 'unknown').toUpperCase()}`);
  content.push(`Final Round: ${encounter.round}`);
  content.push('');
  content.push('FINAL STATE:');
  
  for (const p of encounter.participants) {
    const marker = p.hp > 0 ? '✓' : '✗';
    const status = p.hp > 0 ? 'ALIVE' : 'DEAD';
    if (p.hp > 0) {
      content.push(`  ${marker} ${p.name} - ${status} (${p.hp}/${p.maxHp} HP)`);
    } else {
      content.push(`  ${marker} ${p.name} - ${status}`);
    }
  }
  
  if (encounter.notes) {
    content.push('');
    content.push(`Notes: ${encounter.notes}`);
  }
  
  content.push('');
  
  return createBox('ENCOUNTER [ARCHIVED]', content, WIDTH, 'HEAVY');
}

// ============================================================
// VERBOSITY FORMATTERS
// ============================================================

/**
 * MINIMAL: Fast context for LLM - just the essentials
 * "Round 3, Thorin's turn" - that's it!
 */
function formatEncounterMinimal(
  encounter: EncounterState,
  current: EncounterParticipant
): string {
  const content: string[] = [];
  
  content.push(centerText(`Encounter: ${encounter.id}`, ENCOUNTER_WIDTH));
  content.push('');
  content.push(centerText(`Round ${encounter.round}`, ENCOUNTER_WIDTH));
  content.push(centerText(`${current.name}'s Turn`, ENCOUNTER_WIDTH));
  content.push('');
  content.push(padText(`Participants: ${encounter.participants.length}`, ENCOUNTER_WIDTH, 'center'));
  
  return createBox('ENCOUNTER STATUS', content, undefined, 'LIGHT');
}

/**
 * SUMMARY: Quick overview with HP bars
 * Good for "how's everyone doing?" checks
 */
function formatEncounterSummary(
  encounter: EncounterState,
  current: EncounterParticipant
): string {
  const content: string[] = [];
  
  // Header info
  content.push(padText(`Encounter: ${encounter.id}`, ENCOUNTER_WIDTH, 'left'));
  content.push(padText(`Round ${encounter.round} • ${current.name}'s Turn`, ENCOUNTER_WIDTH, 'left'));
  content.push('');
  
  // Participant summary with HP bars
  content.push('─'.repeat(ENCOUNTER_WIDTH));
  content.push(centerText(`COMBATANTS (${encounter.participants.length})`, ENCOUNTER_WIDTH));
  content.push('─'.repeat(ENCOUNTER_WIDTH));
  
  for (const p of encounter.participants) {
    const maxHp = p.maxHp || p.hp;
    const hpPercent = Math.round((p.hp / maxHp) * 100);
    const hpBar = createMiniHpBar(p.hp, maxHp, HP_BAR_WIDTH.SUMMARY);
    
    // Mark current turn with arrow
    const turnMarker = p.id === current.id ? '▶ ' : '  ';
    const status = getStatusIndicator(p.hp, maxHp);
    
    const line = `${turnMarker}${p.name}: [${hpBar}] ${hpPercent}%${status}`;
    content.push(padText(line, ENCOUNTER_WIDTH, 'left'));
  }
  
  return createBox('ENCOUNTER SUMMARY', content, undefined, 'LIGHT');
}

/**
 * STANDARD: The default DM view
 * Full HP/AC, conditions, positions, initiative order
 */
function formatEncounterStandard(
  encounter: EncounterState,
  current: EncounterParticipant
): string {
  const content: string[] = [];
  
  // Header with key info - no padding, let box auto-size
  content.push(`Encounter: ${encounter.id}`);
  content.push(`Round ${encounter.round} • Turn ${encounter.currentTurnIndex + 1}/${encounter.participants.length}`);
  content.push('');
  
  // Current turn highlight
  content.push('═'.repeat(ENCOUNTER_WIDTH));
  content.push(centerText(`▶ ${current.name}'s Turn ◀`, ENCOUNTER_WIDTH));
  content.push('═'.repeat(ENCOUNTER_WIDTH));
  content.push('');
  
  // Initiative order with full stats
  content.push('INITIATIVE ORDER:');
  content.push('─'.repeat(ENCOUNTER_WIDTH));
  
  // Column headers
  content.push('  # Name            Init  HP        AC  Conditions');
  content.push('─'.repeat(ENCOUNTER_WIDTH));
  
  for (let i = 0; i < encounter.participants.length; i++) {
    const p = encounter.participants[i];
    const maxHp = p.maxHp || p.hp;
    const isCurrent = i === encounter.currentTurnIndex;
    
    // Turn indicator
    const marker = isCurrent ? '▶' : ' ';
    
    // Format columns
    const order = String(i + 1).padStart(2);
    const name = p.name.substring(0, 14).padEnd(14);
    const init = String(p.initiative).padStart(4);
    const hpStr = `${p.hp}/${maxHp}`.padStart(9);
    const acStr = String(p.ac).padStart(3);
    
    // Get conditions for this participant
    const conditions = getActiveConditions(p.id);
    const condStr = conditions.length > 0 
      ? conditions.map(c => c.condition).join(', ')
      : '-';
    
    // Build main stat line - don't pad, let content flow
    const line = `${marker} ${order} ${name} ${init} ${hpStr} ${acStr}  ${condStr}`;
    content.push(line);
    
    // Show position if available
    if (p.position) {
      content.push(`      📍 (${p.position.x}, ${p.position.y})${p.position.z ? ` ${p.position.z}ft up` : ''}`);
    }
    
    // Show death save state if at 0 HP
    if (p.hp === 0) {
      const deathDisplay = formatDeathSaveDisplay(encounter.id, p.id);
      if (deathDisplay) {
        content.push(`      ${deathDisplay}`);
      }
    }
  }
  
  // Show terrain if present
  if (encounter.terrain) {
    const t = encounter.terrain;
    const hasTerrain = (t.obstacles && t.obstacles.length > 0) ||
                       (t.difficultTerrain && t.difficultTerrain.length > 0) ||
                       (t.water && t.water.length > 0) ||
                       (t.hazards && t.hazards.length > 0);
    
    if (hasTerrain) {
      content.push('');
      content.push('TERRAIN:');
      content.push('─'.repeat(ENCOUNTER_WIDTH));
      
      if (t.obstacles && t.obstacles.length > 0) {
        content.push(`  obstacles: ${t.obstacles.join(', ')}`);
      }
      if (t.difficultTerrain && t.difficultTerrain.length > 0) {
        content.push(`  difficultTerrain: ${t.difficultTerrain.join(', ')}`);
      }
      if (t.water && t.water.length > 0) {
        content.push(`  water: ${t.water.join(', ')}`);
      }
      if (t.hazards && t.hazards.length > 0) {
        content.push(`  hazards: ${t.hazards.map(h => `${h.position} (${h.type})`).join(', ')}`);
      }
    }
  }
  
  return createBox('ENCOUNTER', content, undefined, 'HEAVY');
}

/**
 * DETAILED: Full state dump for complex situations
 * Terrain, lighting, resistances - everything!
 */
function formatEncounterDetailed(
  encounter: EncounterState,
  current: EncounterParticipant
): string {
  const content: string[] = [];
  
  // Header with all metadata
  content.push(padText(`Encounter: ${encounter.id}`, ENCOUNTER_WIDTH, 'left'));
  content.push(padText(`Round ${encounter.round} • Turn ${encounter.currentTurnIndex + 1}/${encounter.participants.length}`, ENCOUNTER_WIDTH, 'left'));
  content.push('');
  
  // Environment section
  content.push('═'.repeat(ENCOUNTER_WIDTH));
  content.push(centerText('ENVIRONMENT', ENCOUNTER_WIDTH));
  content.push('═'.repeat(ENCOUNTER_WIDTH));
  
  // Lighting - use shared constant
  content.push(padText(`Lighting: ${LIGHTING_DISPLAY[encounter.lighting] || encounter.lighting}`, ENCOUNTER_WIDTH, 'left'));
  
  // Terrain
  if (encounter.terrain) {
    content.push(padText(`Terrain: ${encounter.terrain.width}x${encounter.terrain.height} grid`, ENCOUNTER_WIDTH, 'left'));
    
    if (encounter.terrain.obstacles && encounter.terrain.obstacles.length > 0) {
      content.push(padText(`Obstacles: ${encounter.terrain.obstacles.join(', ')}`, ENCOUNTER_WIDTH, 'left'));
    }
    if (encounter.terrain.difficultTerrain && encounter.terrain.difficultTerrain.length > 0) {
      content.push(padText(`Difficult: ${encounter.terrain.difficultTerrain.join(', ')}`, ENCOUNTER_WIDTH, 'left'));
    }
    if (encounter.terrain.hazards && encounter.terrain.hazards.length > 0) {
      content.push(padText('Hazards:', ENCOUNTER_WIDTH, 'left'));
      for (const h of encounter.terrain.hazards) {
        let hStr = `  ${h.position}: ${h.type}`;
        if (h.dc) hStr += ` (DC ${h.dc})`;
        if (h.damage) hStr += ` ${h.damage}`;
        content.push(padText(hStr, ENCOUNTER_WIDTH, 'left'));
      }
    }
  }
  
  content.push('');
  
  // Current turn highlight
  content.push('═'.repeat(ENCOUNTER_WIDTH));
  content.push(centerText(`▶ ${current.name}'s Turn ◀`, ENCOUNTER_WIDTH));
  content.push('═'.repeat(ENCOUNTER_WIDTH));
  content.push('');
  
  // Detailed participant list
  content.push(padText('COMBATANTS:', ENCOUNTER_WIDTH, 'left'));
  content.push('─'.repeat(ENCOUNTER_WIDTH));
  
  for (let i = 0; i < encounter.participants.length; i++) {
    const p = encounter.participants[i];
    const maxHp = p.maxHp || p.hp;
    const isCurrent = i === encounter.currentTurnIndex;
    
    // Name header with turn indicator
    const marker = isCurrent ? '▶' : ' ';
    content.push(padText(`${marker} ${i + 1}. ${p.name}`, ENCOUNTER_WIDTH, 'left'));
    
    // Stats line - use HP_BAR_WIDTH constant
    const hpBar = createMiniHpBar(p.hp, maxHp, HP_BAR_WIDTH.DETAILED);
    content.push(padText(`   HP: ${hpBar} ${p.hp}/${maxHp}  AC: ${p.ac}  Init: ${p.initiative}`, ENCOUNTER_WIDTH, 'left'));
    
    // Speed
    content.push(padText(`   Speed: ${p.speed || 30}ft`, ENCOUNTER_WIDTH, 'left'));
    
    // Position
    if (p.position) {
      const posStr = `   Position: (${p.position.x}, ${p.position.y})${p.position.z ? ` elevation ${p.position.z}ft` : ''}`;
      content.push(padText(posStr, ENCOUNTER_WIDTH, 'left'));
    }
    
    // Resistances/Immunities/Vulnerabilities
    if (p.resistances && p.resistances.length > 0) {
      content.push(padText(`   Resist: ${p.resistances.join(', ')}`, ENCOUNTER_WIDTH, 'left'));
    }
    if (p.immunities && p.immunities.length > 0) {
      content.push(padText(`   Immune: ${p.immunities.join(', ')}`, ENCOUNTER_WIDTH, 'left'));
    }
    if (p.vulnerabilities && p.vulnerabilities.length > 0) {
      content.push(padText(`   Vulnerable: ${p.vulnerabilities.join(', ')}`, ENCOUNTER_WIDTH, 'left'));
    }
    
    // Conditions
    const conditions = getActiveConditions(p.id);
    if (conditions.length > 0) {
      content.push(padText('   Conditions:', ENCOUNTER_WIDTH, 'left'));
      for (const c of conditions) {
        let condLine = `     • ${c.condition}`;
        if (c.duration && typeof c.duration === 'number') condLine += ` (${c.duration} rounds)`;
        else if (c.duration) condLine += ` (${c.duration})`;
        if (c.source) condLine += ` [${c.source}]`;
        content.push(padText(condLine, ENCOUNTER_WIDTH, 'left'));
      }
    }
    
    // Death save state - use shared helper
    if (p.hp === 0) {
      const deathDisplay = formatDeathSaveDisplay(encounter.id, p.id);
      if (deathDisplay) {
        content.push(padText(`   ${deathDisplay}`, ENCOUNTER_WIDTH, 'left'));
      }
    }
    
    content.push(''); // Space between participants
  }
  
  return createBox('ENCOUNTER [DETAILED]', content, undefined, 'HEAVY');
}

// Legacy helper for backward compatibility (returns raw state)
export function getEncounterState(id: string): EncounterState | undefined {
  return encounterStore.get(id);
}

// Helper for testing: get encounter participant by ID
export function getEncounterParticipant(encounterId: string, participantId: string): Participant & { initiative: number; surprised?: boolean } | undefined {
  const encounter = encounterStore.get(encounterId);
  if (!encounter) {
    return undefined;
  }
  return encounter.participants.find(p => p.id === participantId);
}

// Helper for testing: clear all encounters
export function clearAllEncounters(): void {
  encounterStore.clear();
}

// ============================================================
// EXECUTE ACTION (ADR-001 Phase 1: Attack + Movement)
// ============================================================

import { ActionTypeSchema, ActionCostSchema, WeaponTypeSchema, type ActionType, type ActionCost, type WeaponType, type DamageType, type Position } from '../types.js';
import { parseDice } from './dice.js';
import { expendSpellSlot, hasSpellSlot, getCharacter } from './characters.js';

// ============================================================
// EXECUTE ACTION SCHEMA
// ============================================================

/**
 * Execute action schema - the primary combat action dispatcher.
 * 
 * Supports all D&D 5e standard actions plus spell casting integration.
 * 
 * **Implemented Action Types:**
 * - `attack`: Melee/ranged attack with damage
 * - `cast_spell`: Spell casting with slot expenditure
 * - `dash`: Double movement
 * - `disengage`: Avoid opportunity attacks
 * - `dodge`: Impose disadvantage on attacks against you
 * - `grapple`: Contested athletics to restrain target
 * - `shove`: Push target away or knock prone
 * 
 * **Spell Casting Parameters:**
 * - `spellSlot`: 0 for cantrip, 1-9 for leveled spells
 * - `spellName`: Display name for the spell
 * - `pactMagic`: Use warlock pact slots instead of standard slots
 */
export const executeActionSchema = z.object({
  encounterId: z.string(),
  
  // Actor identification (either/or)
  actorId: z.string().optional(),
  actorName: z.string().optional(),
  
  // Action selection
  actionType: ActionTypeSchema,
  
  // Action economy
  actionCost: ActionCostSchema.default('action'),
  
  // Target identification (for attacks/spells)
  targetId: z.string().optional(),
  targetName: z.string().optional(),
  
  // Attack options
  weaponType: WeaponTypeSchema.optional(),
  damageExpression: z.string().optional(),
  damageType: DamageTypeSchema.optional(),
  
  // Movement options
  moveTo: PositionSchema.optional(),
  
  // Advantage/disadvantage modifiers
  advantage: z.boolean().optional(),
  disadvantage: z.boolean().optional(),
  
  // Manual rolls (pre-rolled dice for narrative control)
  manualAttackRoll: z.number().optional(),
  manualDamageRoll: z.number().optional(),
  
  // Shove direction (Phase 2)
  shoveDirection: z.enum(['away', 'prone']).optional(),
  
  // Spell casting options (integrates with manage_spell_slots)
  /** Spell slot level: 0 = cantrip (no slot), 1-9 = leveled spell */
  spellSlot: z.number().min(0).max(9).optional(),
  /** Display name for the spell being cast */
  spellName: z.string().optional(),
  /** If true, use warlock pact magic slots instead of standard slots */
  pactMagic: z.boolean().optional(),
});

export type ExecuteActionInput = z.infer<typeof executeActionSchema>;

// Per-turn action tracking (in-memory, clears on advance_turn)
const turnActionTracker = new Map<string, {
  actionUsed: boolean;
  bonusActionUsed: boolean;
  reactionUsed: boolean;
  movementUsed: number;
  hasDashed: boolean;
  disengagedThisTurn: boolean; // Phase 2
  isDodging: boolean; // Phase 2
}>();

// Get or initialize turn tracker for an actor
function getTurnTracker(encounterId: string, actorId: string) {
  const key = `${encounterId}:${actorId}`;
  if (!turnActionTracker.has(key)) {
    turnActionTracker.set(key, {
      actionUsed: false,
      bonusActionUsed: false,
      reactionUsed: false,
      movementUsed: 0,
      hasDashed: false,
      disengagedThisTurn: false,
      isDodging: false,
    });
  }
  return turnActionTracker.get(key)!;
}

// Clear turn tracker for an encounter (for testing or advance_turn)
export function clearTurnTracker(encounterId?: string): void {
  if (encounterId) {
    for (const key of turnActionTracker.keys()) {
      if (key.startsWith(encounterId)) {
        turnActionTracker.delete(key);
      }
    }
  } else {
    turnActionTracker.clear();
  }
}

// Main execute action handler
export function executeAction(input: ExecuteActionInput): string {
  // Get encounter
  const encounter = encounterStore.get(input.encounterId);
  if (!encounter) {
    throw new Error(`Encounter not found: ${input.encounterId}`);
  }

  // Find actor
  let actor = input.actorId 
    ? encounter.participants.find(p => p.id === input.actorId)
    : encounter.participants.find(p => p.name.toLowerCase() === input.actorName?.toLowerCase());
  
  if (!actor) {
    throw new Error(`Actor not found: ${input.actorId || input.actorName}`);
  }

  // Dispatch by action type
  switch (input.actionType) {
    case 'attack':
      return handleAttackAction(encounter, actor, input);
    case 'cast_spell':
      return handleCastSpellAction(encounter, actor, input);
    case 'dash':
      return handleDashAction(encounter, actor, input);
    case 'disengage':
      return handleDisengageAction(encounter, actor, input);
    case 'dodge':
      return handleDodgeAction(encounter, actor, input);
    case 'grapple':
      return handleGrappleAction(encounter, actor, input);
    case 'shove':
      return handleShoveAction(encounter, actor, input);
    default:
      // Other actions return a placeholder
      return formatActionNotImplemented(actor.name, input.actionType);
  }
}

// ============================================================
// ATTACK ACTION HANDLER
// ============================================================

function handleAttackAction(
  encounter: EncounterState,
  actor: Participant & { initiative: number; surprised?: boolean },
  input: ExecuteActionInput
): string {
  // Find target
  let target = input.targetId
    ? encounter.participants.find(p => p.id === input.targetId)
    : encounter.participants.find(p => p.name.toLowerCase() === input.targetName?.toLowerCase());

  if (!target) {
    throw new Error(`Target not found: ${input.targetId || input.targetName || 'No target specified'}`);
  }

  // Check if target is dodging - applies disadvantage
  const targetTracker = getTurnTracker(input.encounterId, target.id);
  const targetIsDodging = targetTracker.isDodging;
  const effectiveDisadvantage = input.disadvantage || targetIsDodging;

  // Roll attack (d20)
  let attackRoll: number;
  let isNat20 = false;
  let isNat1 = false;
  let rollDescription: string;

  if (input.manualAttackRoll !== undefined) {
    attackRoll = input.manualAttackRoll;
    isNat20 = attackRoll === 20;
    isNat1 = attackRoll === 1;
    rollDescription = `${attackRoll} (manual)`;
  } else if (input.advantage || effectiveDisadvantage) {
    // Roll 2d20
    const roll1 = Math.floor(Math.random() * 20) + 1;
    const roll2 = Math.floor(Math.random() * 20) + 1;
    
    if (input.advantage && !effectiveDisadvantage) {
      attackRoll = Math.max(roll1, roll2);
      rollDescription = `${attackRoll} (${roll1}, ${roll2} - advantage)`;
    } else if (effectiveDisadvantage && !input.advantage) {
      attackRoll = Math.min(roll1, roll2);
      const reason = targetIsDodging ? 'target dodging' : 'disadvantage';
      rollDescription = `${attackRoll} (${roll1}, ${roll2} - ${reason})`;
    } else {
      // Both advantage and disadvantage = straight roll
      attackRoll = Math.floor(Math.random() * 20) + 1;
      rollDescription = `${attackRoll} (adv/disadv cancel)`;
    }
    
    isNat20 = attackRoll === 20;
    isNat1 = attackRoll === 1;
  } else {
    attackRoll = Math.floor(Math.random() * 20) + 1;
    isNat20 = attackRoll === 20;
    isNat1 = attackRoll === 1;
    rollDescription = `${attackRoll}`;
  }


  // Calculate hit (natural 20 always hits, natural 1 always misses)
  const isHit = isNat20 || (!isNat1 && attackRoll >= target.ac);
  const isCritical = isNat20;

  // Calculate damage if hit
  let damage = 0;
  let damageRolls: number[] = [];
  let damageDescription = '';

  if (isHit && input.damageExpression) {
    if (input.manualDamageRoll !== undefined) {
      damage = input.manualDamageRoll;
      damageDescription = `${damage} (manual)`;
    } else {
      // Parse and roll damage
      const diceResult = parseDice(input.damageExpression);
      damage = diceResult.total;
      damageRolls = diceResult.rolls;
      
      // Double dice on critical hit (roll again and add)
      if (isCritical) {
        const critBonus = parseDice(input.damageExpression.replace(/[+-]\d+$/, '')); // Remove modifier for crit
        damage += critBonus.total;
        damageRolls = [...damageRolls, ...critBonus.rolls];
        damageDescription = `${damage} (${damageRolls.join(', ')} - CRITICAL!)`;
      } else {
        damageDescription = `${damage} (${damageRolls.join(', ')})`;
      }
    }
  }

  // Apply damage to target
  let oldHp = target.hp;
  if (isHit && damage > 0) {
    target.hp = Math.max(0, target.hp - damage);
  }

  // Broadcast attack result
  broadcastToEncounter(input.encounterId, {
    type: 'attackResult',
    attackerId: actor.id,
    targetId: target.id,
    hit: isHit,
    damage: isHit ? damage : undefined,
    critical: isCritical || undefined,
  });

  // Broadcast HP change if damage was dealt
  if (isHit && damage > 0) {
    broadcastToEncounter(input.encounterId, {
      type: 'hpChanged',
      entityId: target.id,
      previousHp: oldHp,
      currentHp: target.hp,
      maxHp: target.maxHp,
      damage,
    });
  }

  // Handle movement if specified
  let movementInfo = '';
  if (input.moveTo) {
    const oldPosition = { ...actor.position };
    const moveResult = handleMoveInternal(encounter, actor, input.moveTo);
    movementInfo = moveResult;

    // Broadcast entity movement
    broadcastToEncounter(input.encounterId, {
      type: 'entityMoved',
      entityId: actor.id,
      from: oldPosition,
      to: input.moveTo,
    });
  }

  // Format output
  return formatAttackResult(
    actor.name,
    target.name,
    attackRoll,
    rollDescription,
    target.ac,
    isHit,
    isCritical,
    isNat1,
    damage,
    damageDescription,
    input.damageType || 'slashing',
    oldHp,
    target.hp,
    target.maxHp,
    input.actionCost || 'action',
    input.advantage,
    input.disadvantage,
    movementInfo
  );
}

// ============================================================
// DASH ACTION HANDLER
// ============================================================

function handleDashAction(
  encounter: EncounterState,
  actor: Participant & { initiative: number; surprised?: boolean },
  input: ExecuteActionInput
): string {
  const tracker = getTurnTracker(input.encounterId, actor.id);
  tracker.hasDashed = true;

  const content: string[] = [];
  content.push(centerText(`${actor.name.toUpperCase()} DASHES!`, 50));
  content.push('');
  content.push('─'.repeat(50));
  content.push('');
  content.push(centerText(`Movement: ${actor.speed}ft → ${actor.speed * 2}ft`, 50));
  content.push(centerText('(Doubled for this turn)', 50));
  content.push('');
  content.push('─'.repeat(50));
  content.push('');
  content.push(padText(`Action Cost: ${input.actionCost || 'action'}`, 50, 'left'));

  // Handle movement if specified
  if (input.moveTo) {
    content.push('');
    content.push('═'.repeat(50));
    content.push('');
    
    // Check for opportunity attacks
    const oaResults = checkOpportunityAttacks(encounter, actor, input.moveTo, tracker.disengagedThisTurn);
    
    for (const oa of oaResults) {
      content.push(centerText(`⚔ OPPORTUNITY ATTACK ⚔`, 50));
      content.push(centerText(`${oa.attackerName} attacks!`, 50));
      content.push(centerText(oa.result, 50));
      content.push('');
    }

    // Capture old position before moving
    const oldPosition = { ...actor.position };
    
    // Then process movement
    const moveResult = handleMoveInternal(encounter, actor, input.moveTo);
    content.push(padText(`Movement: ${moveResult}`, 50, 'left'));

    // Broadcast entity movement
    broadcastToEncounter(input.encounterId, {
      type: 'entityMoved',
      entityId: actor.id,
      from: oldPosition,
      to: input.moveTo,
    });
  }

  return createBox('DASH ACTION', content, undefined, 'HEAVY');
}

// ============================================================
// OPPORTUNITY ATTACK CHECKER
// ============================================================

interface OpportunityAttackResult {
  attackerName: string;
  attackerId: string;
  result: string;
  damage: number;
  hit: boolean;
}

function checkOpportunityAttacks(
  encounter: EncounterState,
  mover: Participant & { initiative: number; surprised?: boolean },
  destination: Position,
  disengaged: boolean
): OpportunityAttackResult[] {
  // If disengaged, no opportunity attacks
  if (disengaged) {
    return [];
  }

  const results: OpportunityAttackResult[] = [];
  const MELEE_REACH = 1; // 1 square = 5ft

  for (const participant of encounter.participants) {
    // Skip self
    if (participant.id === mover.id) continue;
    
    // Skip allies (simple check: same isEnemy status)
    if (participant.isEnemy === mover.isEnemy) continue;

    // Get tracker for this potential attacker
    const attackerTracker = getTurnTracker(encounter.id, participant.id);
    
    // Check if attacker has reaction available
    if (attackerTracker.reactionUsed) continue;

    // Check if mover was in attacker's reach
    const distBefore = Math.max(
      Math.abs(mover.position.x - participant.position.x),
      Math.abs(mover.position.y - participant.position.y)
    );
    
    // Check if mover is leaving attacker's reach
    const distAfter = Math.max(
      Math.abs(destination.x - participant.position.x),
      Math.abs(destination.y - participant.position.y)
    );

    // OA triggers when: was in reach, and leaving reach
    if (distBefore <= MELEE_REACH && distAfter > MELEE_REACH) {
      // Use attacker's reaction
      attackerTracker.reactionUsed = true;

      // Roll attack
      const attackRoll = Math.floor(Math.random() * 20) + 1;
      const hit = attackRoll >= mover.ac;
      
      let result: string;
      let damage = 0;
      
      if (hit) {
        damage = Math.floor(Math.random() * 6) + 1 + 2; // 1d6+2 default
        mover.hp = Math.max(0, mover.hp - damage);
        result = `Roll: ${attackRoll} vs AC ${mover.ac} - HIT! ${damage} damage`;
      } else {
        result = `Roll: ${attackRoll} vs AC ${mover.ac} - MISS`;
      }

      results.push({
        attackerName: participant.name,
        attackerId: participant.id,
        result,
        damage,
        hit,
      });
    }
  }

  return results;
}


// ============================================================
// INTERNAL MOVEMENT HANDLER
// ============================================================

function handleMoveInternal(
  encounter: EncounterState,
  actor: Participant & { initiative: number; surprised?: boolean },
  destination: Position
): string {
  const tracker = getTurnTracker(encounter.id, actor.id);
  const maxMovement = tracker.hasDashed ? actor.speed * 2 : actor.speed;
  const availableMovement = maxMovement - tracker.movementUsed;

  // Calculate distance (simple grid distance, 5ft per square)
  const dx = Math.abs(destination.x - actor.position.x);
  const dy = Math.abs(destination.y - actor.position.y);
  const distanceSquares = Math.max(dx, dy); // D&D 5e diagonal = 5ft
  const distanceFeet = distanceSquares * 5;

  if (distanceFeet > availableMovement) {
    throw new Error(`Insufficient movement: need ${distanceFeet}ft, have ${availableMovement}ft remaining`);
  }

  // Update position
  const oldPosition = { ...actor.position };
  actor.position = destination;
  tracker.movementUsed += distanceFeet;

  return `Moved from (${oldPosition.x}, ${oldPosition.y}) to (${destination.x}, ${destination.y}) - ${distanceFeet}ft`;
}

// ============================================================
// FORMATTING HELPERS
// ============================================================

function formatAttackResult(
  attackerName: string,
  targetName: string,
  attackRoll: number,
  rollDescription: string,
  targetAC: number,
  isHit: boolean,
  isCritical: boolean,
  isNat1: boolean,
  damage: number,
  damageDescription: string,
  damageType: DamageType | string,
  oldHp: number,
  newHp: number,
  maxHp: number,
  actionCost: ActionCost | string,
  advantage?: boolean,
  disadvantage?: boolean,
  movementInfo?: string
): string {
  const content: string[] = [];
  const WIDTH = 60;

  // Header
  content.push(centerText(`${attackerName} ATTACKS ${targetName}`, WIDTH));
  content.push('');
  content.push('═'.repeat(WIDTH));
  content.push('');

  // Roll info
  if (advantage) {
    content.push(centerText('⚔ ATTACK ROLL (ADVANTAGE) ⚔', WIDTH));
  } else if (disadvantage) {
    content.push(centerText('⚔ ATTACK ROLL (DISADVANTAGE) ⚔', WIDTH));
  } else {
    content.push(centerText('⚔ ATTACK ROLL ⚔', WIDTH));
  }
  content.push('');
  content.push(centerText(`Roll: ${rollDescription}`, WIDTH));
  content.push(centerText(`vs AC ${targetAC}`, WIDTH));
  content.push('');

  // Result
  if (isCritical) {
    content.push(centerText('★★★ CRITICAL HIT! ★★★', WIDTH));
  } else if (isNat1) {
    content.push(centerText('✗ CRITICAL MISS ✗', WIDTH));
  } else if (isHit) {
    content.push(centerText('✓ HIT ✓', WIDTH));
  } else {
    content.push(centerText('✗ MISS ✗', WIDTH));
  }

  content.push('');
  content.push('─'.repeat(WIDTH));
  content.push('');

  // Damage (if hit)
  if (isHit && damage > 0) {
    content.push(centerText('DAMAGE', WIDTH));
    content.push('');
    content.push(centerText(`${damageDescription} ${damageType}`, WIDTH));
    content.push('');

    // HP bar
    const hpPercent = Math.floor((newHp / maxHp) * 20);
    const hpBar = '█'.repeat(hpPercent) + '░'.repeat(20 - hpPercent);
    content.push(centerText(`${targetName}: ${oldHp} → ${newHp}/${maxHp} HP`, WIDTH));
    content.push(centerText(`[${hpBar}]`, WIDTH));

    if (newHp === 0) {
      content.push('');
      content.push(centerText('☠ TARGET DOWN ☠', WIDTH));
    }
  }

  // Movement (if any)
  if (movementInfo) {
    content.push('');
    content.push('─'.repeat(WIDTH));
    content.push('');
    content.push(padText(`Movement: ${movementInfo}`, WIDTH, 'left'));
  }

  // Footer
  content.push('');
  content.push('═'.repeat(WIDTH));
  content.push('');
  content.push(padText(`Action Cost: ${actionCost}`, WIDTH, 'left'));

  return createBox('ATTACK RESULT', content, undefined, 'HEAVY');
}

// ============================================================
// PHASE 2: TACTICAL ACTION HANDLERS
// ============================================================

function handleDisengageAction(
  encounter: EncounterState,
  actor: Participant & { initiative: number; surprised?: boolean },
  input: ExecuteActionInput
): string {
  const tracker = getTurnTracker(input.encounterId, actor.id);
  tracker.disengagedThisTurn = true;

  const content: string[] = [];
  content.push(centerText(`${actor.name.toUpperCase()} DISENGAGES!`, 50));
  content.push('');
  content.push('─'.repeat(50));
  content.push('');
  content.push(centerText('Movement will not provoke', 50));
  content.push(centerText('opportunity attacks this turn', 50));
  content.push('');
  content.push('─'.repeat(50));
  content.push('');
  content.push(padText(`Action Cost: ${input.actionCost || 'action'}`, 50, 'left'));

  return createBox('DISENGAGE ACTION', content, undefined, 'HEAVY');
}

function handleDodgeAction(
  encounter: EncounterState,
  actor: Participant & { initiative: number; surprised?: boolean },
  input: ExecuteActionInput
): string {
  const tracker = getTurnTracker(input.encounterId, actor.id);
  tracker.isDodging = true;

  const content: string[] = [];
  content.push(centerText(`${actor.name.toUpperCase()} DODGES!`, 50));
  content.push('');
  content.push('─'.repeat(50));
  content.push('');
  content.push(centerText('Until next turn:', 50));
  content.push(centerText('• Attacks against you have DISADVANTAGE', 50));
  content.push(centerText('• DEX saves have ADVANTAGE', 50));
  content.push('');
  content.push('─'.repeat(50));
  content.push('');
  content.push(padText(`Action Cost: ${input.actionCost || 'action'}`, 50, 'left'));

  return createBox('DODGE ACTION', content, undefined, 'HEAVY');
}

function handleGrappleAction(
  encounter: EncounterState,
  actor: Participant & { initiative: number; surprised?: boolean },
  input: ExecuteActionInput
): string {
  // Require target
  let target = input.targetId
    ? encounter.participants.find(p => p.id === input.targetId)
    : encounter.participants.find(p => p.name.toLowerCase() === input.targetName?.toLowerCase());

  if (!target) {
    throw new Error(`Target not found: ${input.targetId || input.targetName || 'No target specified'}`);
  }

  // Roll contested Athletics check
  const attackerRoll = input.manualAttackRoll ?? (Math.floor(Math.random() * 20) + 1);
  const defenderRoll = Math.floor(Math.random() * 20) + 1;

  const success = attackerRoll > defenderRoll;

  const content: string[] = [];
  content.push(centerText(`${actor.name.toUpperCase()} GRAPPLES ${target.name.toUpperCase()}`, 50));
  content.push('');
  content.push('═'.repeat(50));
  content.push('');
  content.push(centerText('CONTESTED ATHLETICS CHECK', 50));
  content.push('');
  content.push(centerText(`${actor.name}: ${attackerRoll}`, 50));
  content.push(centerText(`${target.name}: ${defenderRoll}`, 50));
  content.push('');

  if (success) {
    content.push(centerText('✓ GRAPPLE SUCCESS! ✓', 50));
    content.push('');
    content.push(centerText(`${target.name} is now GRAPPLED`, 50));
    content.push(centerText('(Speed 0, can attempt escape)', 50));
    // Apply grappled condition would go here via manage_condition
  } else {
    content.push(centerText('✗ GRAPPLE FAILED ✗', 50));
    content.push('');
    content.push(centerText(`${target.name} breaks free!`, 50));
  }

  content.push('');
  content.push('═'.repeat(50));
  content.push('');
  content.push(padText(`Action Cost: ${input.actionCost || 'action'}`, 50, 'left'));

  return createBox('GRAPPLE ACTION', content, undefined, 'HEAVY');
}

function handleShoveAction(
  encounter: EncounterState,
  actor: Participant & { initiative: number; surprised?: boolean },
  input: ExecuteActionInput
): string {
  // Require target
  let target = input.targetId
    ? encounter.participants.find(p => p.id === input.targetId)
    : encounter.participants.find(p => p.name.toLowerCase() === input.targetName?.toLowerCase());

  if (!target) {
    throw new Error(`Target not found: ${input.targetId || input.targetName || 'No target specified'}`);
  }

  const shoveDirection = input.shoveDirection || 'away';

  // Roll contested Athletics check
  const attackerRoll = input.manualAttackRoll ?? (Math.floor(Math.random() * 20) + 1);
  const defenderRoll = Math.floor(Math.random() * 20) + 1;

  const success = attackerRoll > defenderRoll;

  const content: string[] = [];
  content.push(centerText(`${actor.name.toUpperCase()} SHOVES ${target.name.toUpperCase()}`, 50));
  content.push('');
  content.push('═'.repeat(50));
  content.push('');
  content.push(centerText('CONTESTED ATHLETICS CHECK', 50));
  content.push('');
  content.push(centerText(`${actor.name}: ${attackerRoll}`, 50));
  content.push(centerText(`${target.name}: ${defenderRoll}`, 50));
  content.push('');

  if (success) {
    if (shoveDirection === 'prone') {
      content.push(centerText('✓ SHOVE SUCCESS! ✓', 50));
      content.push('');
      content.push(centerText(`${target.name} is knocked PRONE`, 50));
      // Apply prone condition would go here
    } else {
      // Push 5ft away
      const dx = target.position.x - actor.position.x;
      const dy = target.position.y - actor.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 0) {
        // Normalize and push 1 square (5ft)
        target.position.x += Math.sign(dx);
        target.position.y += Math.sign(dy);
      }

      content.push(centerText('✓ SHOVE SUCCESS! ✓', 50));
      content.push('');
      content.push(centerText(`${target.name} pushed 5ft away!`, 50));
      content.push(centerText(`New position: (${target.position.x}, ${target.position.y})`, 50));
    }
  } else {
    content.push(centerText('✗ SHOVE FAILED ✗', 50));
    content.push('');
    content.push(centerText(`${target.name} holds their ground!`, 50));
  }

  content.push('');
  content.push('═'.repeat(50));
  content.push('');
  content.push(padText(`Action Cost: ${input.actionCost || 'action'}`, 50, 'left'));

  return createBox('SHOVE ACTION', content, undefined, 'HEAVY');
}

// ============================================================
// CAST SPELL ACTION HANDLER
// ============================================================

/**
 * Handle spell casting action within combat.
 * 
 * Integrates with the spell slot management system to:
 * - Validate slot availability before casting
 * - Automatically expend the appropriate slot
 * - Support both standard spell slots and warlock pact magic
 * - Allow cantrips (spellSlot: 0) without slot expenditure
 * 
 * **Spell Slot Levels:**
 * - 0: Cantrip (no slot required)
 * - 1-9: Standard spell slots
 * - pactMagic: true: Use warlock pact slots instead
 * 
 * **Integration Flow:**
 * 1. Check if casting a cantrip (spellSlot === 0) - no validation needed
 * 2. Call `hasSpellSlot()` to verify slot availability
 * 3. Call `expendSpellSlot()` to deduct the slot
 * 4. Format ASCII output with spell details
 * 
 * @param encounter - Current encounter state
 * @param actor - The combatant casting the spell
 * @param input - Execute action input with spell parameters
 * @returns Formatted ASCII box showing spell cast result
 * @throws Error if no spell slot available at the required level
 * 
 * @see hasSpellSlot - Validates slot availability
 * @see expendSpellSlot - Deducts the slot
 * @see manageSpellSlots - Direct spell slot management tool
 */
function handleCastSpellAction(
  encounter: EncounterState,
  actor: Participant & { initiative: number; surprised?: boolean },
  input: ExecuteActionInput
): string {
  const slotLevel = input.spellSlot ?? 0;
  const spellName = input.spellName || 'Unknown Spell';
  const pactMagic = input.pactMagic || false;
  const actorId = actor.id;
  
  // Cantrips don't require slots
  if (slotLevel === 0) {
    const content: string[] = [];
    content.push(centerText(`${actor.name.toUpperCase()} CASTS CANTRIP`, 50));
    content.push('');
    content.push('═'.repeat(50));
    content.push('');
    content.push(centerText(`Spell: ${spellName}`, 50));
    content.push(centerText('No spell slot required', 50));
    content.push('');
    content.push('═'.repeat(50));
    content.push('');
    content.push(padText(`Action Cost: ${input.actionCost || 'action'}`, 50, 'left'));
    
    return createBox('CAST SPELL', content, undefined, 'HEAVY');
  }
  
  // Check if actor has required spell slot
  if (!hasSpellSlot(actorId, slotLevel, pactMagic)) {
    const slotType = pactMagic ? 'pact magic slot' : `level ${slotLevel} spell slot`;
    throw new Error(`${actor.name} has no available ${slotType}`);
  }
  
  // Expend the spell slot
  const expendResult = expendSpellSlot(actorId, slotLevel, pactMagic);
  if (!expendResult.success) {
    throw new Error(expendResult.error || 'Failed to expend spell slot');
  }
  
  // Format the ordinal for display
  const ordinals = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
  const slotLabel = pactMagic 
    ? 'Pact Magic Slot' 
    : `${ordinals[slotLevel - 1] || slotLevel + 'th'} Level Slot`;
  
  const content: string[] = [];
  content.push(centerText(`${actor.name.toUpperCase()} CASTS SPELL`, 50));
  content.push('');
  content.push('═'.repeat(50));
  content.push('');
  content.push(centerText(`Spell: ${spellName}`, 50));
  content.push(centerText(`Slot Used: ${slotLabel}`, 50));
  content.push('');
  
  // Add target info if specified
  if (input.targetId || input.targetName) {
    const target = input.targetId
      ? encounter.participants.find(p => p.id === input.targetId)
      : encounter.participants.find(p => p.name.toLowerCase() === input.targetName?.toLowerCase());
    
    if (target) {
      content.push(centerText(`Target: ${target.name}`, 50));
      content.push('');
    }
  }
  
  content.push('═'.repeat(50));
  content.push('');
  content.push(padText(`Action Cost: ${input.actionCost || 'action'}`, 50, 'left'));
  content.push(padText('✓ Spell slot expended', 50, 'left'));
  
  return createBox('CAST SPELL', content, undefined, 'HEAVY');
}

function formatActionNotImplemented(actorName: string, actionType: ActionType): string {
  const content: string[] = [];
  content.push(centerText(`${actorName} uses ${actionType.toUpperCase()}`, 50));
  content.push('');
  content.push(centerText('(Action type not yet implemented)', 50));
  content.push(centerText('Supports: attack, cast_spell, dash, disengage, dodge, grapple, shove', 50));
  
  return createBox('ACTION', content, undefined, 'HEAVY');
}

// ============================================================
// ADVANCE TURN
// ============================================================

/** Standard output width for turn advancement displays */
const TURN_DISPLAY_WIDTH = 60;

/** Result of ticking conditions for a combatant */
interface ConditionTickResult {
  expired: Array<{ targetId: string; targetName: string; condition: string }>;
  updated: Array<{ targetId: string; targetName: string; condition: string; remaining: number }>;
}

/**
 * Tick condition durations for a combatant.
 * Decrements numeric durations by 1, removes expired conditions, and tracks changes.
 * Does NOT tick concentration, until_dispelled, until_rest, or save_ends conditions.
 * 
 * @param combatant - The participant whose conditions should be ticked
 * @returns Object containing arrays of expired and updated conditions
 */
function tickCombatantConditions(combatant: { id: string; name: string }): ConditionTickResult {
  const result: ConditionTickResult = { expired: [], updated: [] };
  const conditions = conditionStore.get(combatant.id) || [];

  // Iterate backwards to safely splice while iterating
  for (let i = conditions.length - 1; i >= 0; i--) {
    const cond = conditions[i];

    // Only tick numeric durations (not concentration, until_dispelled, until_rest, save_ends)
    if (cond.roundsRemaining !== undefined && typeof cond.roundsRemaining === 'number') {
      cond.roundsRemaining -= 1;

      if (cond.roundsRemaining <= 0) {
        result.expired.push({
          targetId: combatant.id,
          targetName: combatant.name,
          condition: String(cond.condition),
        });
        conditions.splice(i, 1);
      } else {
        result.updated.push({
          targetId: combatant.id,
          targetName: combatant.name,
          condition: String(cond.condition),
          remaining: cond.roundsRemaining,
        });
      }
    }
  }

  conditionStore.set(combatant.id, conditions);
  return result;
}

/**
 * Merge two condition tick results into one.
 * @param a - First result
 * @param b - Second result
 * @returns Combined result
 */
function mergeConditionTickResults(a: ConditionTickResult, b: ConditionTickResult): ConditionTickResult {
  return {
    expired: [...a.expired, ...b.expired],
    updated: [...a.updated, ...b.updated],
  };
}

/**
 * Format a condition name for display (capitalize first letter).
 * @param condition - The condition name
 * @returns Formatted condition name
 */
function formatConditionName(condition: string): string {
  return condition.charAt(0).toUpperCase() + condition.slice(1);
}

/**
 * Generate HP bar visualization.
 * @param current - Current HP
 * @param max - Maximum HP
 * @param width - Bar width in characters (default 20)
 * @returns String like "[█████████░░░░░░░░░░░]"
 */
function generateHpBar(current: number, max: number, width: number = 20): string {
  const filledCount = Math.max(0, Math.min(width, Math.floor((current / max) * width)));
  return `[${'█'.repeat(filledCount)}${'░'.repeat(width - filledCount)}]`;
}

/**
 * Check if a combatant needs a death saving throw.
 * Returns true if HP is 0 and they're not stable (future: check stability flag).
 * @param combatant - The participant to check
 * @returns Whether they need a death save
 */
function needsDeathSave(combatant: { hp: number }): boolean {
  // TODO: When stability tracking is implemented, also check for stable flag
  return combatant.hp === 0;
}

export const advanceTurnSchema = z.object({
  encounterId: z.string().describe('Active encounter ID'),
  processEffects: z.boolean().default(true).describe('Process start/end turn effects'),
  processAuras: z.boolean().default(true).describe('Process aura effects'),
});

export type AdvanceTurnInput = z.infer<typeof advanceTurnSchema>;

// Roll Death Save Schema
export const rollDeathSaveSchema = z.object({
  encounterId: z.string().describe('The encounter containing the dying character'),
  characterId: z.string().describe('The character making the death save'),
  modifier: z.number().optional().describe('Bonus/penalty to the roll (e.g., Bless spell gives +1d4)'),
  rollMode: z.enum(['normal', 'advantage', 'disadvantage']).optional().default('normal')
    .describe('Roll mode - advantage rolls 2d20 keep highest, disadvantage keeps lowest'),
  manualRoll: z.number().min(1).max(20).optional().describe('Override the d20 roll (for testing)'),
  manualRolls: z.array(z.number().min(1).max(20)).length(2).optional()
    .describe('Override both dice for advantage/disadvantage (for testing)'),
});

export type RollDeathSaveSchemaInput = z.infer<typeof rollDeathSaveSchema>;

/**
 * Advance to the next combatant's turn in an encounter.
 * 
 * This function:
 * 1. Ticks condition durations for the previous combatant (end of their turn)
 * 2. Advances the turn index to the next combatant
 * 3. Handles round transitions when wrapping to first combatant
 * 4. Ticks condition durations for the current combatant (start of their turn)
 * 5. Clears action tracking for the previous combatant
 * 6. Shows death save reminders for combatants at 0 HP
 * 
 * @param input - The advance turn parameters
 * @returns ASCII-formatted turn advancement display
 * @throws Error if encounter not found
 */
export function advanceTurn(input: AdvanceTurnInput): string {
  const { encounterId, processEffects, processAuras } = input;

  // Validate encounter exists
  const encounter = encounterStore.get(encounterId);
  if (!encounter) {
    throw new Error(`Encounter not found: ${encounterId}`);
  }

  // Check if encounter has ended
  if ((encounter as any).status === 'ended') {
    throw new Error(`Encounter already ended: ${encounterId}`);
  }

  const content: string[] = [];
  
  // Get previous combatant (whose turn is ending)
  const previousIndex = encounter.currentTurnIndex;
  const previousCombatant = encounter.participants[previousIndex];

  // Tick conditions for previous combatant (end of their turn)
  let tickResults: ConditionTickResult = { expired: [], updated: [] };
  if (previousCombatant) {
    tickResults = tickCombatantConditions(previousCombatant);

    // Clear turn action tracker for previous combatant
    const key = `${encounterId}:${previousCombatant.id}`;
    turnActionTracker.delete(key);
  }

  // Advance turn index (wraps to 0 at end of round)
  encounter.currentTurnIndex = (encounter.currentTurnIndex + 1) % encounter.participants.length;

  // Check for round transition
  const isNewRound = encounter.currentTurnIndex === 0;
  if (isNewRound) {
    encounter.round += 1;
  }

  // Get current combatant (whose turn is starting)
  const currentCombatant = encounter.participants[encounter.currentTurnIndex];
  
  // Broadcast turn change
  broadcastToEncounter(encounterId, {
    type: 'turnChanged',
    previousEntityId: previousCombatant?.id,
    currentEntityId: currentCombatant.id,
    round: encounter.round,
  });

  // Tick conditions for current combatant (start of their turn)
  if (currentCombatant) {
    const currentTickResults = tickCombatantConditions(currentCombatant);
    tickResults = mergeConditionTickResults(tickResults, currentTickResults);
  }

  // Check if all combatants are down
  const aliveCombatants = encounter.participants.filter(p => p.hp > 0);
  if (aliveCombatants.length === 0) {
    content.push(centerText('COMBAT OVER', TURN_DISPLAY_WIDTH));
    content.push('');
    content.push(centerText('All combatants are down!', TURN_DISPLAY_WIDTH));
    content.push(centerText('No active participants remaining.', TURN_DISPLAY_WIDTH));
    return createBox('ENCOUNTER END', content, undefined, 'HEAVY');
  }

  // Death save reminder for previous combatant if they're at 0 HP
  if (previousCombatant && needsDeathSave(previousCombatant)) {
    content.push(centerText(`⚠ ${previousCombatant.name} NEEDS DEATH SAVE ⚠`, TURN_DISPLAY_WIDTH));
    content.push(padText(`${previousCombatant.name} is unconscious at 0 HP!`, TURN_DISPLAY_WIDTH, 'left'));
    content.push('');
  }

  // Header with round info
  if (isNewRound) {
    content.push(centerText(`★ NEW ROUND ${encounter.round} ★`, TURN_DISPLAY_WIDTH));
    content.push(centerText('Round Transition', TURN_DISPLAY_WIDTH));
  } else {
    content.push(centerText(`ROUND ${encounter.round}`, TURN_DISPLAY_WIDTH));
  }
  content.push('');
  content.push('═'.repeat(TURN_DISPLAY_WIDTH));
  content.push('');

  // Current combatant's turn header
  content.push(centerText(`${currentCombatant.name}'s Turn`, TURN_DISPLAY_WIDTH));
  content.push('');
  content.push('─'.repeat(TURN_DISPLAY_WIDTH));
  content.push('');

  // HP and status with visual bar
  content.push(padText(`HP: ${currentCombatant.hp}/${currentCombatant.maxHp}`, TURN_DISPLAY_WIDTH, 'left'));
  content.push(padText(generateHpBar(currentCombatant.hp, currentCombatant.maxHp), TURN_DISPLAY_WIDTH, 'left'));
  content.push('');

  // Death save reminder for current combatant (0 HP)
  if (needsDeathSave(currentCombatant)) {
    content.push(centerText('⚠ UNCONSCIOUS - DEATH SAVE REQUIRED ⚠', TURN_DISPLAY_WIDTH));
    content.push(padText(`${currentCombatant.name} is at 0 HP!`, TURN_DISPLAY_WIDTH, 'left'));
    content.push('');
  }

  // Display active conditions on current combatant
  const currentConditions = conditionStore.get(currentCombatant.id) || [];
  if (currentConditions.length > 0) {
    content.push(padText('Active Conditions:', TURN_DISPLAY_WIDTH, 'left'));
    for (const cond of currentConditions) {
      let condStr = `  • ${formatConditionName(String(cond.condition))}`;
      if (cond.roundsRemaining !== undefined) {
        condStr += ` (${cond.roundsRemaining} round${cond.roundsRemaining !== 1 ? 's' : ''})`;
      } else if (cond.duration && typeof cond.duration === 'string') {
        condStr += ` (${cond.duration.replace(/_/g, ' ')})`;
      }
      content.push(padText(condStr, TURN_DISPLAY_WIDTH, 'left'));
    }
    content.push('');
  }

  // Display expired conditions from this turn transition
  if (tickResults.expired.length > 0) {
    content.push('─'.repeat(TURN_DISPLAY_WIDTH));
    content.push('');
    content.push(padText('Conditions Expired:', TURN_DISPLAY_WIDTH, 'left'));
    for (const exp of tickResults.expired) {
      content.push(padText(`  • ${exp.targetName}: ${exp.condition} has ended/expired/removed`, TURN_DISPLAY_WIDTH, 'left'));
    }
    content.push('');
  }

  // Display conditions with updated durations
  if (tickResults.updated.length > 0) {
    if (tickResults.expired.length === 0) {
      content.push('─'.repeat(TURN_DISPLAY_WIDTH));
      content.push('');
    }
    content.push(padText('Condition Durations Updated:', TURN_DISPLAY_WIDTH, 'left'));
    for (const upd of tickResults.updated) {
      content.push(padText(`  • ${upd.targetName}: ${upd.condition} - ${upd.remaining} round${upd.remaining !== 1 ? 's' : ''} remaining`, TURN_DISPLAY_WIDTH, 'left'));
    }
    content.push('');
  }

  // Effect processing indicator
  if (processEffects) {
    content.push('─'.repeat(TURN_DISPLAY_WIDTH));
    content.push('');
    content.push(padText('Start of Turn Effects processed', TURN_DISPLAY_WIDTH, 'left'));
    content.push('');
  }

  // Initiative order preview
  content.push('═'.repeat(TURN_DISPLAY_WIDTH));
  content.push('');
  content.push(padText('Initiative Order (Next up):', TURN_DISPLAY_WIDTH, 'left'));
  
  // Show next few combatants in order
  const previewCount = Math.min(3, encounter.participants.length);
  for (let i = 0; i < previewCount; i++) {
    const idx = (encounter.currentTurnIndex + i) % encounter.participants.length;
    const p = encounter.participants[idx];
    const marker = i === 0 ? '→ ' : '  ';
    const status = p.hp === 0 ? ' [DOWN]' : '';
    content.push(padText(`${marker}${p.initiative}: ${p.name}${status}`, TURN_DISPLAY_WIDTH, 'left'));
  }
  if (encounter.participants.length > previewCount) {
    content.push(padText(`  ... and ${encounter.participants.length - previewCount} more`, TURN_DISPLAY_WIDTH, 'left'));
  }

  return createBox('TURN ADVANCED', content, undefined, 'HEAVY');
}

// ============================================================
// ROLL DEATH SAVE
// ============================================================

const DEATH_SAVE_DISPLAY_WIDTH = 50;

export interface RollDeathSaveInput {
  encounterId: string;
  characterId: string;
  modifier?: number;
  rollMode?: 'normal' | 'advantage' | 'disadvantage';
  manualRoll?: number;  // For testing: override the d20 roll
  manualRolls?: number[]; // For testing: override both dice for adv/disadv
}

/**
 * Roll a death saving throw for a character at 0 HP
 * 
 * D&D 5e Rules:
 * - Roll d20 (no modifiers typically, but can be affected by spells)
 * - 10+ = success, 9- = failure
 * - Natural 1 = 2 failures
 * - Natural 20 = revive at 1 HP and regain consciousness
 * - 3 successes = stable (unconscious but no longer dying)
 * - 3 failures = death
 */
export function rollDeathSave(input: RollDeathSaveInput): string {
  const { encounterId, characterId, modifier = 0, rollMode = 'normal' } = input;

  // Validate encounter exists
  const encounter = encounterStore.get(encounterId);
  if (!encounter) {
    throw new Error(`Encounter not found: ${encounterId}`);
  }

  // Find the character
  const character = encounter.participants.find(p => p.id === characterId);
  if (!character) {
    throw new Error(`Character not found in encounter: ${characterId}`);
  }

  // Check if character is at 0 HP
  if (character.hp > 0) {
    throw new Error(`${character.name} is not at 0 HP (current: ${character.hp}). Death saves only apply when at 0 HP.`);
  }

  // Get or initialize death save state
  const stateKey = getDeathSaveKey(encounterId, characterId);
  let state = deathSaveStore.get(stateKey);
  
  if (!state) {
    state = { successes: 0, failures: 0, isStable: false, isDead: false };
    deathSaveStore.set(stateKey, state);
  }

  // Check if already stable or dead
  if (state.isStable) {
    return formatAlreadyStable(character.name, state);
  }
  if (state.isDead) {
    return formatAlreadyDead(character.name);
  }

  // Roll the d20(s)
  const { naturalRoll, usedRoll, allRolls, rollModeUsed } = performDeathSaveRoll(input, rollMode);
  
  // Calculate total (natural roll matters for nat 1/20, but total matters for success/fail)
  const total = usedRoll + modifier;
  
  // Determine outcome based on natural roll and total
  const outcome = determineDeathSaveOutcome(naturalRoll, total, state);
  
  // Apply outcome to state
  applyDeathSaveOutcome(outcome, state, character, encounterId, characterId);
  
  // Format output
  return formatDeathSaveResult(character.name, naturalRoll, usedRoll, modifier, total, allRolls, rollModeUsed, state, outcome);
}

interface DeathSaveRollResult {
  /** The actual die face shown (matters for natural 1/20 detection) */
  naturalRoll: number;
  /** The roll value used for success/failure calculation (after adv/disadv selection) */
  usedRoll: number;
  /** All dice rolled (for advantage/disadvantage display) */
  allRolls: number[];
  /** The roll mode that was actually used */
  rollModeUsed: 'normal' | 'advantage' | 'disadvantage';
}

/**
 * Perform the d20 roll(s) for a death saving throw.
 * 
 * Handles manual rolls (for testing), advantage/disadvantage, and normal rolls.
 * Uses the shared rollD20() helper for consistent dice rolling across the module.
 * 
 * @param input - The death save input (may contain manual roll overrides)
 * @param rollMode - 'normal', 'advantage', or 'disadvantage'
 * @returns The roll result with natural roll, used roll, all dice, and mode
 */
function performDeathSaveRoll(input: RollDeathSaveInput, rollMode: 'normal' | 'advantage' | 'disadvantage'): DeathSaveRollResult {
  const { manualRoll, manualRolls } = input;
  
  // Handle manual rolls for testing - allows deterministic test scenarios
  if (manualRoll !== undefined) {
    return {
      naturalRoll: manualRoll,
      usedRoll: manualRoll,
      allRolls: [manualRoll],
      rollModeUsed: 'normal',
    };
  }
  
  // Handle manual dual-dice for advantage/disadvantage testing
  if (manualRolls !== undefined && manualRolls.length === 2) {
    const [roll1, roll2] = manualRolls;
    if (rollMode === 'advantage') {
      const higher = Math.max(roll1, roll2);
      return { naturalRoll: higher, usedRoll: higher, allRolls: manualRolls, rollModeUsed: 'advantage' };
    } else if (rollMode === 'disadvantage') {
      const lower = Math.min(roll1, roll2);
      return { naturalRoll: lower, usedRoll: lower, allRolls: manualRolls, rollModeUsed: 'disadvantage' };
    }
    // If both provided but normal mode, just use first
    return { naturalRoll: roll1, usedRoll: roll1, allRolls: [roll1], rollModeUsed: 'normal' };
  }
  
  // Random rolls using the shared helper
  if (rollMode === 'advantage' || rollMode === 'disadvantage') {
    const roll1 = rollD20();
    const roll2 = rollD20();
    const usedRoll = rollMode === 'advantage' ? Math.max(roll1, roll2) : Math.min(roll1, roll2);
    return { naturalRoll: usedRoll, usedRoll, allRolls: [roll1, roll2], rollModeUsed: rollMode };
  }
  
  // Normal single roll
  const roll = rollD20();
  return { naturalRoll: roll, usedRoll: roll, allRolls: [roll], rollModeUsed: 'normal' };
}

/**
 * Possible outcomes of a death saving throw.
 * 
 * D&D 5e PHB p.197 defines these outcomes:
 * - nat20: Miraculous recovery - regain consciousness at 1 HP
 * - nat1: Critical failure - count as TWO failures  
 * - success: Roll 10+ (with modifiers) - one step closer to stability
 * - failure: Roll 9- (with modifiers) - one step closer to death
 * - stabilized: Third success reached - stable but unconscious
 * - death: Third failure reached - character dies
 */
type DeathSaveOutcome = 
  | { type: 'nat20'; message: string }
  | { type: 'nat1'; message: string }
  | { type: 'success'; message: string }
  | { type: 'failure'; message: string }
  | { type: 'stabilized'; message: string }
  | { type: 'death'; message: string };

/**
 * Determine the outcome of a death saving throw based on the roll.
 * 
 * D&D 5e Death Save Rules (PHB p.197):
 * 1. Natural 20: Immediate revival at 1 HP (trumps all other results)
 * 2. Natural 1: Counts as TWO failures (can cause instant death)
 * 3. Total >= 10: One success
 * 4. Total < 10: One failure
 * 5. Three successes: Character becomes stable (unconscious, 0 HP, not dying)
 * 6. Three failures: Character dies
 * 
 * The order of checks matters - natural rolls are evaluated first because
 * they have special effects that override the normal success/failure logic.
 * 
 * @param naturalRoll - The actual d20 face (1-20), before modifiers
 * @param total - The final total including any modifiers
 * @param state - Current death save state (for calculating when 3 successes/failures reached)
 * @returns The outcome with type and player-facing message
 */
function determineDeathSaveOutcome(naturalRoll: number, total: number, state: DeathSaveState): DeathSaveOutcome {
  // Natural 20 always revives
  if (naturalRoll === 20) {
    return { type: 'nat20', message: '✨ NATURAL 20! ✨ Regains consciousness at 1 HP!' };
  }
  
  // Natural 1 always counts as 2 failures
  if (naturalRoll === 1) {
    const newFailures = state.failures + 2;
    if (newFailures >= 3) {
      return { type: 'death', message: '💀 NATURAL 1! Two failures - DEATH! 💀' };
    }
    return { type: 'nat1', message: '⚠️ NATURAL 1! Two failures added!' };
  }
  
  // Check total for success/failure
  if (total >= 10) {
    const newSuccesses = state.successes + 1;
    if (newSuccesses >= 3) {
      return { type: 'stabilized', message: '★ STABILIZED! ★ No longer dying.' };
    }
    return { type: 'success', message: 'Success! Holding on...' };
  } else {
    const newFailures = state.failures + 1;
    if (newFailures >= 3) {
      return { type: 'death', message: '💀 Three failures - DEATH! 💀' };
    }
    return { type: 'failure', message: 'Failure. Slipping away...' };
  }
}

/**
 * Apply the death save outcome to game state.
 * 
 * Updates the character's death save tracking, HP, and conditions as appropriate.
 * 
 * Side effects by outcome:
 * - nat20: Revive at 1 HP, clear death saves, remove 'unconscious' condition
 * - nat1: Add 2 failures (may trigger death)
 * - success: Add 1 success
 * - failure: Add 1 failure
 * - stabilized: Mark stable, set successes to 3
 * - death: Mark dead, set failures to 3
 * 
 * @param outcome - The determined outcome from determineDeathSaveOutcome()
 * @param state - The death save state to mutate
 * @param character - The character (may have HP modified on nat20)
 * @param encounterId - Used to build state key for cleanup
 * @param characterId - Used to build state key and remove conditions
 */
function applyDeathSaveOutcome(
  outcome: DeathSaveOutcome, 
  state: DeathSaveState, 
  character: Participant & { initiative: number },
  encounterId: string,
  characterId: string
): void {
  switch (outcome.type) {
    case 'nat20':
      // Revive at 1 HP, clear death save state
      character.hp = 1;
      state.successes = 0;
      state.failures = 0;
      state.isStable = false;
      state.isDead = false;
      // Remove unconscious condition if present
      removeConditionInternal(characterId, 'unconscious');
      // Clear death save state since they're conscious now
      deathSaveStore.delete(getDeathSaveKey(encounterId, characterId));
      break;
      
    case 'nat1':
      state.failures += 2;
      if (state.failures >= 3) {
        state.failures = 3;
        state.isDead = true;
      }
      break;
      
    case 'success':
      state.successes += 1;
      break;
      
    case 'failure':
      state.failures += 1;
      break;
      
    case 'stabilized':
      state.successes = 3;
      state.isStable = true;
      break;
      
    case 'death':
      state.failures = 3;
      state.isDead = true;
      break;
  }
}

/**
 * Internal helper to remove a condition without generating output.
 * 
 * Used during nat 20 revival to silently remove the 'unconscious' condition
 * without cluttering the death save output with condition management messages.
 * 
 * @param targetId - The character ID to remove condition from
 * @param condition - The condition name (case-insensitive)
 */
function removeConditionInternal(targetId: string, condition: string): void {
  const conditions = conditionStore.get(targetId) || [];
  const index = conditions.findIndex(c => c.condition.toLowerCase() === condition.toLowerCase());
  if (index !== -1) {
    conditions.splice(index, 1);
    conditionStore.set(targetId, conditions);
  }
}

/**
 * Format message when death save is attempted on an already-stable character.
 * 
 * This is a gentle reminder - not an error. Stable characters don't need
 * death saves but the attempt isn't harmful.
 * 
 * @param characterName - Name of the stable character
 * @param state - Death save state (to show the tracker)
 * @returns ASCII-formatted "already stable" message
 */
function formatAlreadyStable(characterName: string, state: DeathSaveState): string {
  const content: string[] = [];
  content.push(centerText(`${characterName}`, DEATH_SAVE_DISPLAY_WIDTH));
  content.push('');
  content.push(centerText('Already Stable', DEATH_SAVE_DISPLAY_WIDTH));
  content.push('');
  content.push(padText('No death save needed - character is stable.', DEATH_SAVE_DISPLAY_WIDTH, 'left'));
  content.push(padText('They remain unconscious at 0 HP but are', DEATH_SAVE_DISPLAY_WIDTH, 'left'));
  content.push(padText('no longer in danger of dying.', DEATH_SAVE_DISPLAY_WIDTH, 'left'));
  content.push('');
  content.push(formatDeathSaveTracker(state));
  return createBox('DEATH SAVE', content, undefined, 'HEAVY');
}

/**
 * Format message when death save is attempted on a dead character.
 * 
 * Once a character is dead, they cannot make death saves. This message
 * serves as a reminder that resurrection magic or other means are needed.
 * 
 * @param characterName - Name of the deceased character
 * @returns ASCII-formatted "already dead" message
 */
function formatAlreadyDead(characterName: string): string {
  const content: string[] = [];
  content.push(centerText(`${characterName}`, DEATH_SAVE_DISPLAY_WIDTH));
  content.push('');
  content.push(centerText('💀 DECEASED 💀', DEATH_SAVE_DISPLAY_WIDTH));
  content.push('');
  content.push(padText('This character has already died.', DEATH_SAVE_DISPLAY_WIDTH, 'left'));
  content.push(padText('Death saves cannot be rolled for the dead.', DEATH_SAVE_DISPLAY_WIDTH, 'left'));
  return createBox('DEATH SAVE', content, undefined, 'HEAVY');
}

/**
 * Generate a tension indicator based on current death save state.
 * 
 * This provides the DM with narrative hooks and helps players understand urgency.
 * The tension escalates as failures accumulate or when close to either outcome.
 */
function getTensionIndicator(state: DeathSaveState, outcome: DeathSaveOutcome): string | null {
  // Final outcomes don't need tension - they have their own messaging
  if (state.isDead || state.isStable || outcome.type === 'nat20') {
    return null;
  }
  
  // Critical tension - one roll from death
  if (state.failures === 2) {
    return '⚠ CRITICAL: One more failure means death!';
  }
  
  // High tension - close to death
  if (state.failures === 2 && state.successes === 0) {
    return '⚠ Teetering on the edge...';
  }
  
  // Hope rising - close to stability  
  if (state.successes === 2) {
    return '✧ Hope rises - one more success to stabilize!';
  }
  
  // Mixed tension
  if (state.failures >= 1 && state.successes >= 1) {
    return '◇ The struggle continues...';
  }
  
  return null;
}

/**
 * Format the visual death save tracker (●●○ style).
 * 
 * Uses visual symbols for intuitive at-a-glance status:
 * - ● (filled circle) = success earned
 * - ✕ (X mark) = failure accrued  
 * - ○ (empty circle) = slot remaining
 * 
 * @param state - Current death save state
 * @returns Formatted tracker string like "Successes: ●●○  Failures: ✕○○"
 */
function formatDeathSaveTracker(state: DeathSaveState): string {
  const successMarkers = '●'.repeat(state.successes) + '○'.repeat(3 - state.successes);
  const failureMarkers = '✕'.repeat(state.failures) + '○'.repeat(3 - state.failures);
  
  return `Successes: ${successMarkers}  Failures: ${failureMarkers}`;
}

/**
 * Format the complete death save result with dramatic presentation.
 * 
 * Designed for both player engagement and DM narration:
 * - Clear roll information with advantage/disadvantage breakdown
 * - Dramatic outcome messages scaled to situation severity
 * - Visual death save tracker for quick status check
 * - Tension indicators for narrative hooks
 * - Final status announcements for resolution
 * 
 * @param characterName - Name of the dying character
 * @param naturalRoll - The actual d20 face value
 * @param usedRoll - The roll used (same as natural, or selected from adv/disadv)
 * @param modifier - Any bonus/penalty applied
 * @param total - Final total for success/failure determination
 * @param allRolls - All dice rolled (for adv/disadv display)
 * @param rollMode - The roll mode used
 * @param state - Current death save state after this roll
 * @param outcome - The determined outcome
 * @returns ASCII-formatted death save result
 */
function formatDeathSaveResult(
  characterName: string,
  naturalRoll: number,
  usedRoll: number,
  modifier: number,
  total: number,
  allRolls: number[],
  rollMode: 'normal' | 'advantage' | 'disadvantage',
  state: DeathSaveState,
  outcome: DeathSaveOutcome
): string {
  const content: string[] = [];
  
  // Header with character name
  content.push(centerText(`${characterName}`, DEATH_SAVE_DISPLAY_WIDTH));
  content.push(centerText('Death Saving Throw', DEATH_SAVE_DISPLAY_WIDTH));
  content.push('');
  
  // Roll info
  if (rollMode !== 'normal') {
    const modeLabel = rollMode === 'advantage' ? 'ADVANTAGE' : 'DISADVANTAGE';
    const kept = rollMode === 'advantage' ? 'higher' : 'lower';
    content.push(padText(`Roll (${modeLabel}): ${allRolls.join(', ')} → kept ${kept}: ${usedRoll}`, DEATH_SAVE_DISPLAY_WIDTH, 'left'));
  } else {
    content.push(padText(`Roll: ${usedRoll}`, DEATH_SAVE_DISPLAY_WIDTH, 'left'));
  }
  
  // Modifier breakdown if any
  if (modifier !== 0) {
    const sign = modifier > 0 ? '+' : '';
    content.push(padText(`Modifier: ${sign}${modifier}`, DEATH_SAVE_DISPLAY_WIDTH, 'left'));
    content.push(padText(`Total: ${usedRoll} ${sign}${modifier} = ${total}`, DEATH_SAVE_DISPLAY_WIDTH, 'left'));
  }
  
  content.push('');
  
  // Outcome message (dramatic)
  content.push('─'.repeat(DEATH_SAVE_DISPLAY_WIDTH));
  content.push('');
  content.push(centerText(outcome.message, DEATH_SAVE_DISPLAY_WIDTH));
  content.push('');
  
  // Tension indicator for ongoing situations (DM narrative hook)
  const tension = getTensionIndicator(state, outcome);
  if (tension) {
    content.push(centerText(tension, DEATH_SAVE_DISPLAY_WIDTH));
    content.push('');
  }
  
  // Death save tracker
  content.push('─'.repeat(DEATH_SAVE_DISPLAY_WIDTH));
  content.push('');
  content.push(centerText(formatDeathSaveTracker(state), DEATH_SAVE_DISPLAY_WIDTH));
  content.push('');
  
  // Final status with appropriate gravitas
  if (state.isDead) {
    content.push('═'.repeat(DEATH_SAVE_DISPLAY_WIDTH));
    content.push('');
    content.push(centerText(`☠ ${characterName} has died. ☠`, DEATH_SAVE_DISPLAY_WIDTH));
    content.push(centerText('Rest in peace.', DEATH_SAVE_DISPLAY_WIDTH));
  } else if (state.isStable) {
    content.push('═'.repeat(DEATH_SAVE_DISPLAY_WIDTH));
    content.push('');
    content.push(centerText(`✓ ${characterName} is stable. ✓`, DEATH_SAVE_DISPLAY_WIDTH));
    content.push(centerText('Unconscious but no longer dying.', DEATH_SAVE_DISPLAY_WIDTH));
  } else if (outcome.type === 'nat20') {
    content.push('═'.repeat(DEATH_SAVE_DISPLAY_WIDTH));
    content.push('');
    content.push(centerText(`⚔ ${characterName} is back in the fight! ⚔`, DEATH_SAVE_DISPLAY_WIDTH));
    content.push(centerText('HP: 1', DEATH_SAVE_DISPLAY_WIDTH));
  }
  
  return createBox('DEATH SAVE', content, undefined, 'HEAVY');
}

// ============================================================
// RENDER BATTLEFIELD - ASCII Tactical Map
// ============================================================

/**
 * Schema for the render_battlefield tool.
 * 
 * Renders a tactical ASCII map of an active encounter, showing:
 * - Top-down 2D grid with coordinate headers
 * - Entity symbols (allies uppercase, enemies lowercase)
 * - Terrain features (walls, difficult terrain, water, hazards)
 * - Legend with entity details based on detail level
 * 
 * @example
 * ```typescript
 * renderBattlefield({
 *   encounterId: 'enc_123',
 *   showLegend: true,
 *   showCoordinates: true,
 *   legendDetail: 'standard'
 * });
 * ```
 */
export const renderBattlefieldSchema = z.object({
  /** The ID of the encounter to render */
  encounterId: z.string(),
  /** Whether to show the entity legend below the grid (default: true) */
  showLegend: z.boolean().default(true),
  /** Whether to show x/y coordinate headers (default: true) */
  showCoordinates: z.boolean().default(true),
  /** Whether to display elevation (z-level) information (default: true) */
  showElevation: z.boolean().default(true),
  /** Optional viewport to crop the display to a specific region */
  viewport: z.object({
    x: z.number().default(0),
    y: z.number().default(0),
    width: z.number(),
    height: z.number(),
  }).optional(),
  /** Entity ID to center the viewport on */
  focusOn: z.string().optional(),
  /** Level of detail for the legend: minimal, standard, or detailed */
  legendDetail: z.enum(['minimal', 'standard', 'detailed']).default('standard'),
});

export type RenderBattlefieldInput = z.input<typeof renderBattlefieldSchema>;

/** Legend detail level type */
export type LegendDetailLevel = 'minimal' | 'standard' | 'detailed';

// ─────────────────────────────────────────────────────────────
// BATTLEFIELD CONSTANTS
// ─────────────────────────────────────────────────────────────

/** Symbols for terrain features */
const TERRAIN_SYMBOLS = {
  floor: '·',
  wall: '█',
  difficultTerrain: '░',
  water: '≈',
  hazard: '*',
} as const;

/** Symbols for entity states */
const ENTITY_STATE_SYMBOLS = {
  dead: '†',
  unconscious: '○',
  currentTurn: '▶',
} as const;

/** Width of the battlefield display header/dividers */
const BATTLEFIELD_DISPLAY_WIDTH = 67;

// ─────────────────────────────────────────────────────────────
// ENTITY STATE HELPERS
// ─────────────────────────────────────────────────────────────

/** Computed state information for a participant */
interface EntityStateInfo {
  isUnconscious: boolean;
  isDead: boolean;
  isBloodied: boolean;
  isCurrentTurn: boolean;
  conditions: ActiveCondition[];
  displaySymbol: string;
}

/**
 * Compute the display state for an entity.
 * Centralizes the logic for determining if an entity is dead, unconscious, bloodied, etc.
 * 
 * @param participant - The encounter participant
 * @param encounterId - The encounter ID (for death save lookups)
 * @param currentTurnId - The ID of the entity whose turn it is
 * @param baseSymbol - The assigned symbol for this entity
 * @returns Computed state information
 */
function getEntityStateInfo(
  participant: Participant & { initiative: number },
  encounterId: string,
  currentTurnId: string,
  baseSymbol: string
): EntityStateInfo {
  const conditions = getActiveConditions(participant.id);
  const conditionNames = conditions.map(c => c.condition);
  
  const isUnconscious = participant.hp === 0 || conditionNames.includes('unconscious');
  const isDead = conditionNames.includes('dead') ||
                 (participant.hp === 0 && getDeathSaveState(encounterId, participant.id)?.isDead === true);
  const isBloodied = participant.hp <= participant.maxHp / 2 && participant.hp > 0;
  const isCurrentTurn = participant.id === currentTurnId;
  
  // Determine display symbol based on state
  let displaySymbol = baseSymbol;
  if (isDead) {
    displaySymbol = ENTITY_STATE_SYMBOLS.dead;
  } else if (isUnconscious) {
    displaySymbol = ENTITY_STATE_SYMBOLS.unconscious;
  }
  
  return { isUnconscious, isDead, isBloodied, isCurrentTurn, conditions, displaySymbol };
}

// ─────────────────────────────────────────────────────────────
// SYMBOL ASSIGNMENT
// ─────────────────────────────────────────────────────────────

/**
 * Assign unique symbols to all entities in an encounter.
 * 
 * Symbol assignment rules:
 * - Allies get uppercase letters (first letter of name preferred)
 * - Enemies get lowercase letters or numbers if duplicates exist
 * - Symbols are guaranteed unique across all participants
 * 
 * @param participants - Array of encounter participants
 * @returns Map of participant ID to assigned symbol
 */
function assignEntitySymbols(
  participants: Array<Participant & { initiative: number; surprised?: boolean }>
): Map<string, string> {
  const symbolMap = new Map<string, string>();
  const usedSymbols = new Set<string>();
  
  // Separate by faction for different symbol ranges
  const allies = participants.filter(p => !p.isEnemy);
  const enemies = participants.filter(p => p.isEnemy);
  
  // Assign ally symbols (uppercase A-Z)
  assignSymbolsToGroup(allies, symbolMap, usedSymbols, true);
  
  // Assign enemy symbols (lowercase a-z, then numbers)
  assignSymbolsToGroup(enemies, symbolMap, usedSymbols, false);
  
  return symbolMap;
}

/**
 * Assign symbols to a group of participants (allies or enemies).
 * 
 * @param group - The participants to assign symbols to
 * @param symbolMap - Map to store the assignments
 * @param usedSymbols - Set of already-used symbols
 * @param isAlly - Whether this group represents allies (uppercase) or enemies (lowercase)
 */
function assignSymbolsToGroup(
  group: Array<Participant & { initiative: number }>,
  symbolMap: Map<string, string>,
  usedSymbols: Set<string>,
  isAlly: boolean
): void {
  let fallbackNum = 1;
  
  for (const p of group) {
    // Try first letter of name
    const firstLetter = isAlly 
      ? p.name.charAt(0).toUpperCase()
      : p.name.charAt(0).toLowerCase();
    
    if (!usedSymbols.has(firstLetter)) {
      symbolMap.set(p.id, firstLetter);
      usedSymbols.add(firstLetter);
      continue;
    }
    
    // Find fallback: unused letter or number
    if (isAlly) {
      // Try A-Z for allies
      for (let i = 0; i < 26; i++) {
        const sym = String.fromCharCode(65 + i);
        if (!usedSymbols.has(sym)) {
          symbolMap.set(p.id, sym);
          usedSymbols.add(sym);
          break;
        }
      }
    } else {
      // Use numbers for duplicate enemies
      const sym = String(fallbackNum++);
      symbolMap.set(p.id, sym);
      usedSymbols.add(sym);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// TERRAIN HELPERS
// ─────────────────────────────────────────────────────────────

/** Terrain cell types */
type TerrainCellType = 'wall' | 'difficult' | 'water' | 'hazard' | 'floor';

/**
 * Determine the terrain type at a specific grid position.
 * 
 * @param terrain - The encounter's terrain configuration
 * @param x - X coordinate
 * @param y - Y coordinate
 * @returns The terrain type at that position
 */
function getTerrainAt(
  terrain: z.infer<typeof TerrainSchema>,
  x: number,
  y: number
): TerrainCellType {
  const posStr = `${x},${y}`;
  
  if (terrain.obstacles?.includes(posStr)) return 'wall';
  if (terrain.difficultTerrain?.includes(posStr)) return 'difficult';
  if (terrain.water?.includes(posStr)) return 'water';
  if (terrain.hazards?.some(h => h.position === posStr)) return 'hazard';
  
  return 'floor';
}

/**
 * Get the symbol for a terrain type.
 * 
 * @param terrainType - The terrain cell type
 * @returns The ASCII symbol for that terrain
 */
function getTerrainSymbol(terrainType: TerrainCellType): string {
  switch (terrainType) {
    case 'wall': return TERRAIN_SYMBOLS.wall;
    case 'difficult': return TERRAIN_SYMBOLS.difficultTerrain;
    case 'water': return TERRAIN_SYMBOLS.water;
    case 'hazard': return TERRAIN_SYMBOLS.hazard;
    default: return TERRAIN_SYMBOLS.floor;
  }
}

// ─────────────────────────────────────────────────────────────
// VIEWPORT CALCULATION
// ─────────────────────────────────────────────────────────────

/** Calculated viewport bounds */
interface ViewportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculate the viewport bounds for rendering.
 * Handles focus-on-entity centering and explicit viewport specification.
 * 
 * @param terrain - The encounter's terrain configuration
 * @param participants - Array of encounter participants
 * @param viewport - Optional explicit viewport specification
 * @param focusOn - Optional entity ID to center on
 * @returns The calculated viewport bounds
 */
function calculateViewport(
  terrain: z.infer<typeof TerrainSchema>,
  participants: Array<Participant & { initiative: number }>,
  viewport?: { x?: number; y?: number; width: number; height: number },
  focusOn?: string
): ViewportBounds {
  let viewX = 0, viewY = 0;
  let viewWidth = terrain.width;
  let viewHeight = terrain.height;
  
  if (focusOn) {
    const focusEntity = participants.find(p => p.id === focusOn);
    if (focusEntity) {
      const vpWidth = viewport?.width ?? Math.min(terrain.width, 15);
      const vpHeight = viewport?.height ?? Math.min(terrain.height, 15);
      viewX = Math.max(0, Math.min(terrain.width - vpWidth, focusEntity.position.x - Math.floor(vpWidth / 2)));
      viewY = Math.max(0, Math.min(terrain.height - vpHeight, focusEntity.position.y - Math.floor(vpHeight / 2)));
      viewWidth = vpWidth;
      viewHeight = vpHeight;
    }
  } else if (viewport) {
    viewX = viewport.x ?? 0;
    viewY = viewport.y ?? 0;
    viewWidth = viewport.width;
    viewHeight = viewport.height;
  }
  
  // Clamp to terrain bounds
  viewWidth = Math.min(viewWidth, terrain.width - viewX);
  viewHeight = Math.min(viewHeight, terrain.height - viewY);
  
  return { x: viewX, y: viewY, width: viewWidth, height: viewHeight };
}

// ─────────────────────────────────────────────────────────────
// GRID BUILDING
// ─────────────────────────────────────────────────────────────

/**
 * Build a position-to-entities lookup map for efficient grid rendering.
 * 
 * @param participants - Array of encounter participants
 * @returns Map from "x,y" position string to array of entities at that position
 */
function buildPositionMap(
  participants: Array<Participant & { initiative: number }>
): Map<string, Array<Participant & { initiative: number }>> {
  const posMap = new Map<string, Array<Participant & { initiative: number }>>();
  
  for (const p of participants) {
    const key = `${p.position.x},${p.position.y}`;
    if (!posMap.has(key)) {
      posMap.set(key, []);
    }
    posMap.get(key)!.push(p);
  }
  
  return posMap;
}

/**
 * Build the 2D grid of symbols for the battlefield.
 * 
 * @param viewport - The viewport bounds
 * @param terrain - The encounter's terrain
 * @param positionMap - Map of positions to entities
 * @param symbolMap - Map of entity IDs to symbols
 * @param encounterId - The encounter ID (for state lookups)
 * @returns 2D array of symbols for rendering
 */
function buildBattlefieldGrid(
  viewport: ViewportBounds,
  terrain: z.infer<typeof TerrainSchema>,
  positionMap: Map<string, Array<Participant & { initiative: number }>>,
  symbolMap: Map<string, string>,
  encounterId: string
): string[][] {
  const grid: string[][] = [];
  
  for (let y = viewport.y; y < viewport.y + viewport.height; y++) {
    const row: string[] = [];
    for (let x = viewport.x; x < viewport.x + viewport.width; x++) {
      const posKey = `${x},${y}`;
      const entitiesHere = positionMap.get(posKey) || [];
      
      if (entitiesHere.length > 0) {
        // Show highest-z entity, preferring alive over dead
        const sorted = [...entitiesHere].sort((a, b) => (b.position.z ?? 0) - (a.position.z ?? 0));
        const topEntity = sorted[0];
        const baseSymbol = symbolMap.get(topEntity.id) || '?';
        const stateInfo = getEntityStateInfo(topEntity, encounterId, '', baseSymbol);
        row.push(stateInfo.displaySymbol);
      } else {
        // Show terrain
        const terrainType = getTerrainAt(terrain, x, y);
        row.push(getTerrainSymbol(terrainType));
      }
    }
    grid.push(row);
  }
  
  return grid;
}

// ─────────────────────────────────────────────────────────────
// LEGEND FORMATTING
// ─────────────────────────────────────────────────────────────

/**
 * Format the position string for an entity, optionally including elevation.
 * 
 * @param pos - The entity's position
 * @param showElevation - Whether to show elevation
 * @param hasMultipleElevations - Whether the encounter has multiple z-levels
 * @returns Formatted position string like "(2, 3)" or "(2, 3) z=2"
 */
function formatPosition(
  pos: { x: number; y: number; z?: number },
  showElevation: boolean,
  hasMultipleElevations: boolean
): string {
  const z = pos.z ?? 0;
  if (showElevation && (hasMultipleElevations || z !== 0)) {
    return `(${pos.x}, ${pos.y}) z=${z}`;
  }
  return `(${pos.x}, ${pos.y})`;
}

/**
 * Format the HP status string for an entity.
 * 
 * @param hp - Current HP
 * @param maxHp - Maximum HP
 * @param isBloodied - Whether the entity is bloodied (≤50% HP)
 * @param isDead - Whether the entity is dead
 * @param isUnconscious - Whether the entity is unconscious/dying
 * @returns Formatted HP string like "30/45" or "30/45 [BLOODIED]"
 */
function formatHpStatus(
  hp: number,
  maxHp: number,
  isBloodied: boolean,
  isDead: boolean,
  isUnconscious: boolean
): string {
  if (isDead) return 'DEAD';
  
  let hpStr = `${hp}/${maxHp}`;
  if (isBloodied) hpStr += ' [BLOODIED]';
  if (isUnconscious) hpStr += ' [DYING]';
  return hpStr;
}

/**
 * Format a single entity's legend line based on detail level.
 * 
 * @param participant - The entity to format
 * @param stateInfo - Computed state info for the entity
 * @param options - Formatting options
 * @returns The formatted legend line
 */
function formatEntityLegendLine(
  participant: Participant & { initiative: number },
  stateInfo: EntityStateInfo,
  options: {
    legendDetail: LegendDetailLevel;
    showElevation: boolean;
    hasMultipleElevations: boolean;
    encounterId: string;
  }
): string {
  const { legendDetail, showElevation, hasMultipleElevations, encounterId } = options;
  const { displaySymbol, isCurrentTurn, isBloodied, isDead, isUnconscious, conditions } = stateInfo;
  
  const turnMarker = isCurrentTurn ? ENTITY_STATE_SYMBOLS.currentTurn : ' ';
  const enemyMarker = participant.isEnemy ? '[ENEMY]' : '';
  
  // Minimal: just symbol and name
  if (legendDetail === 'minimal') {
    return `${turnMarker} ${displaySymbol} = ${participant.name}`;
  }
  
  // Standard and detailed: position, HP, conditions
  const posStr = formatPosition(participant.position, showElevation, hasMultipleElevations);
  const hpStr = formatHpStatus(participant.hp, participant.maxHp, isBloodied, isDead, isUnconscious);
  
  let line = `${turnMarker} ${displaySymbol} ${participant.name} ${enemyMarker}`.trim();
  line += ` - ${posStr} - HP: ${hpStr}`;
  
  // Add conditions
  if (conditions.length > 0) {
    const condNames = conditions.map(c => c.condition).join(', ');
    line += ` [${condNames}]`;
  }
  
  // Detailed: add AC, speed, death saves
  if (legendDetail === 'detailed') {
    line += ` | AC: ${participant.ac} | Speed: ${participant.speed ?? 30}ft`;
    
    const deathState = getDeathSaveState(encounterId, participant.id);
    if (deathState && participant.hp === 0 && !deathState.isDead && !deathState.isStable) {
      const successMarkers = '●'.repeat(deathState.successes) + '○'.repeat(3 - deathState.successes);
      const failureMarkers = '✕'.repeat(deathState.failures) + '○'.repeat(3 - deathState.failures);
      line += ` | Death Saves: ${successMarkers} / ${failureMarkers}`;
    }
  }
  
  return line;
}

// ─────────────────────────────────────────────────────────────
// MAIN RENDER FUNCTION
// ─────────────────────────────────────────────────────────────

/**
 * Render an encounter battlefield as an ASCII tactical map.
 * 
 * Produces a visual representation including:
 * - 2D grid with coordinate headers
 * - Entity symbols at their positions
 * - Terrain features (walls, water, hazards, etc.)
 * - Optional legend with entity details
 * 
 * @param input - Render configuration options
 * @returns ASCII string representation of the battlefield
 * @throws Error if the encounter is not found
 * 
 * @example
 * ```typescript
 * const map = renderBattlefield({
 *   encounterId: 'enc_123',
 *   showLegend: true,
 *   legendDetail: 'standard'
 * });
 * console.log(map);
 * ```
 */
export function renderBattlefield(input: RenderBattlefieldInput): string {
  const parsed = renderBattlefieldSchema.parse(input);
  const { encounterId, showLegend, showCoordinates, showElevation, viewport, focusOn, legendDetail } = parsed;
  
  // Validate encounter exists
  const encounter = encounterStore.get(encounterId);
  if (!encounter) {
    throw new Error(`Encounter not found: ${encounterId}`);
  }
  
  const { terrain, participants, round, currentTurnIndex } = encounter;
  const currentTurnId = participants[currentTurnIndex]?.id ?? '';
  
  // Calculate viewport and build supporting data structures
  const viewportBounds = calculateViewport(terrain, participants, viewport, focusOn);
  const symbolMap = assignEntitySymbols(participants);
  const positionMap = buildPositionMap(participants);
  const grid = buildBattlefieldGrid(viewportBounds, terrain, positionMap, symbolMap, encounterId);
  
  // Determine if we have multiple elevations
  const zLevels = new Set(participants.map(p => p.position.z ?? 0));
  const hasMultipleElevations = zLevels.size > 1 || [...zLevels].some(z => z !== 0);
  
  // Build output
  const lines: string[] = [];
  
  // Header
  lines.push('═'.repeat(BATTLEFIELD_DISPLAY_WIDTH));
  lines.push(`                    BATTLEFIELD - Round ${round}`);
  lines.push('═'.repeat(BATTLEFIELD_DISPLAY_WIDTH));
  lines.push('');
  
  // Coordinate headers (x-axis)
  if (showCoordinates) {
    lines.push(...buildCoordinateHeaders(viewportBounds));
  }
  
  // Grid rows with y-axis coordinates
  for (let i = 0; i < grid.length; i++) {
    const y = viewportBounds.y + i;
    const prefix = showCoordinates ? `${y.toString().padStart(2)} │` : '│';
    lines.push(`${prefix}${grid[i].join('│')}│`);
  }
  lines.push('');
  
  // Terrain legend
  lines.push(...buildTerrainLegend(terrain));
  
  // Entity legend
  if (showLegend) {
    lines.push('─'.repeat(BATTLEFIELD_DISPLAY_WIDTH));
    lines.push('COMBATANTS:');
    lines.push('');
    
    // Sort: allies first, then enemies; by initiative
    const sortedParticipants = [...participants].sort((a, b) => {
      if (a.isEnemy !== b.isEnemy) return a.isEnemy ? 1 : -1;
      return b.initiative - a.initiative;
    });
    
    for (const p of sortedParticipants) {
      const baseSymbol = symbolMap.get(p.id) || '?';
      const stateInfo = getEntityStateInfo(p, encounterId, currentTurnId, baseSymbol);
      lines.push(formatEntityLegendLine(p, stateInfo, {
        legendDetail,
        showElevation,
        hasMultipleElevations,
        encounterId,
      }));
    }
    
    // Elevation explanation
    if (showElevation && hasMultipleElevations) {
      lines.push('');
      lines.push('ELEVATION: z=N means N×5ft above ground (z<0 = below ground)');
    }
  }
  
  return lines.join('\n');
}

/**
 * Build coordinate header lines for the x-axis.
 * 
 * @param viewport - The viewport bounds
 * @returns Array of header lines
 */
function buildCoordinateHeaders(viewport: ViewportBounds): string[] {
  const headers: string[] = [];
  
  // Units digit row
  let coordHeader = '    ';
  for (let x = viewport.x; x < viewport.x + viewport.width; x++) {
    coordHeader += (x % 10).toString() + ' ';
  }
  headers.push(coordHeader);
  
  // Tens digit row (if needed)
  if (viewport.x + viewport.width >= 10) {
    let tensHeader = '    ';
    for (let x = viewport.x; x < viewport.x + viewport.width; x++) {
      tensHeader += (x >= 10 ? Math.floor(x / 10).toString() : ' ') + ' ';
    }
    headers.push(tensHeader);
  }
  
  return headers;
}

/**
 * Build terrain legend lines if terrain features exist.
 * 
 * @param terrain - The encounter's terrain configuration
 * @returns Array of terrain legend lines (empty if no special terrain)
 */
function buildTerrainLegend(terrain: z.infer<typeof TerrainSchema>): string[] {
  const lines: string[] = [];
  
  const hasObstacles = terrain.obstacles && terrain.obstacles.length > 0;
  const hasDifficult = terrain.difficultTerrain && terrain.difficultTerrain.length > 0;
  const hasWater = terrain.water && terrain.water.length > 0;
  const hasHazards = terrain.hazards && terrain.hazards.length > 0;
  
  if (!hasObstacles && !hasDifficult && !hasWater && !hasHazards) {
    return lines;
  }
  
  lines.push('TERRAIN:');
  if (hasObstacles) lines.push(`  ${TERRAIN_SYMBOLS.wall} = Wall/Obstacle`);
  if (hasDifficult) lines.push(`  ${TERRAIN_SYMBOLS.difficultTerrain} = Difficult Terrain`);
  if (hasWater) lines.push(`  ${TERRAIN_SYMBOLS.water} = Water`);
  if (hasHazards) {
    lines.push(`  ${TERRAIN_SYMBOLS.hazard} = Hazard`);
    for (const hazard of terrain.hazards!) {
      lines.push(`      ${hazard.position}: ${hazard.type}${hazard.damage ? ` (${hazard.damage})` : ''}`);
    }
  }
  lines.push('');
  
  return lines;
}

// ============================================================
// MODIFY TERRAIN - ADD, REMOVE, CLEAR TERRAIN DYNAMICALLY
// ============================================================

/**
 * Hazard details for hazardous terrain
 */
const HazardDetailsSchema = z.object({
  type: z.string().describe('Hazard type: fire, acid, spike_trap, etc.'),
  damage: z.string().optional().describe('Dice expression like "2d6"'),
  damageType: z.string().optional().describe('Damage type: fire, piercing, etc.'),
  dc: z.number().optional().describe('Save DC'),
  saveAbility: z.string().optional().describe('Save ability: dex, con, etc.'),
  condition: z.string().optional().describe('Condition applied on failure'),
});

/**
 * Schema for modifying terrain in an encounter
 */
export const modifyTerrainSchema = z.object({
  encounterId: z.string().describe('The encounter to modify'),
  operation: z.enum(['add', 'remove', 'clear']).describe('Operation type'),
  terrainType: z.enum(['obstacle', 'difficultTerrain', 'water', 'hazard'], {
    errorMap: () => ({ message: 'Invalid terrain type - must be one of: obstacle, difficultTerrain, water, hazard' })
  }).describe('Type of terrain'),
  positions: z.array(z.string()).optional().describe('Array of "x,y" coordinate strings'),
  hazardDetails: HazardDetailsSchema.optional().describe('Details for hazard terrain'),
  source: z.string().optional().describe('Source of terrain change (spell, ability, etc.)'),
  duration: z.number().optional().describe('Rounds until auto-removed'),
});

export type ModifyTerrainInput = z.infer<typeof modifyTerrainSchema>;

/**
 * Modify terrain in an encounter - add, remove, or clear terrain.
 * 
 * @param input - Terrain modification parameters
 * @returns ASCII-formatted result
 * @throws Error if encounter not found or validation fails
 */
export function modifyTerrain(input: ModifyTerrainInput): string {
  // 1. Validate encounter exists
  const encounter = encounterStore.get(input.encounterId);
  if (!encounter) {
    throw new Error(`Encounter not found: ${input.encounterId}`);
  }

  // 2. Validate positions format if provided
  if (input.positions) {
    for (const pos of input.positions) {
      if (!/^\d+,\d+$/.test(pos)) {
        throw new Error(`Invalid position format: ${pos}. Expected "x,y"`);
      }
    }
  }

  // 3. For 'add'/'remove', positions required
  if ((input.operation === 'add' || input.operation === 'remove') && 
      (!input.positions || input.positions.length === 0)) {
    throw new Error('No positions provided - nothing to add/remove');
  }

  // 4. For hazard type with add, hazardDetails.type is required
  if (input.terrainType === 'hazard' && input.operation === 'add') {
    if (!input.hazardDetails?.type) {
      throw new Error('hazardDetails.type required when adding hazards');
    }
  }

  // 5. Ensure terrain object exists with all fields
  if (!encounter.terrain) {
    encounter.terrain = { width: 20, height: 20 };
  }
  const terrain = encounter.terrain;
  if (!terrain.obstacles) terrain.obstacles = [];
  if (!terrain.difficultTerrain) terrain.difficultTerrain = [];
  if (!terrain.water) terrain.water = [];
  if (!terrain.hazards) terrain.hazards = [];
  
  const gridWidth = terrain.width || 20;
  const gridHeight = terrain.height || 20;

  // 5b. Validate positions are within bounds (for add operation)
  if (input.operation === 'add' && input.positions) {
    for (const pos of input.positions) {
      const [x, y] = pos.split(',').map(Number);
      if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) {
        throw new Error(`Position ${pos} is out of bounds (grid: ${gridWidth}x${gridHeight})`);
      }
    }
  }

  // 5c. Check for occupied positions when adding obstacles
  if (input.operation === 'add' && input.terrainType === 'obstacle' && input.positions) {
    for (const pos of input.positions) {
      const [x, y] = pos.split(',').map(Number);
      // Check if any participant is at this position
      for (const p of encounter.participants) {
        if (p.position && p.position.x === x && p.position.y === y && p.hp > 0) {
          throw new Error(`Cannot place obstacle at ${pos} - position is occupied by ${p.name}`);
        }
      }
    }
  }

  // 6. Execute operation
  let affectedPositions: string[] = [];

  switch (input.operation) {
    case 'add':
      affectedPositions = addTerrainPositions(terrain, input.terrainType, input.positions!, input.hazardDetails);
      break;
    case 'remove':
      affectedPositions = removeTerrainPositions(terrain, input.terrainType, input.positions!);
      break;
    case 'clear':
      affectedPositions = clearTerrainType(terrain, input.terrainType);
      break;
  }

  // 7. Update encounter
  encounter.terrain = terrain;
  encounterStore.set(input.encounterId, encounter);

  // 8. Return ASCII formatted output
  return formatTerrainModification(input, affectedPositions, terrain);
}

/**
 * Add terrain positions to the terrain object
 */
function addTerrainPositions(
  terrain: z.infer<typeof TerrainSchema>,
  terrainType: 'obstacle' | 'difficultTerrain' | 'water' | 'hazard',
  positions: string[],
  hazardDetails?: z.infer<typeof HazardDetailsSchema>
): string[] {
  const added: string[] = [];

  for (const pos of positions) {
    if (terrainType === 'hazard') {
      // Check if hazard already exists at this position
      const existingIndex = terrain.hazards!.findIndex(h => h.position === pos);
      if (existingIndex === -1) {
        terrain.hazards!.push({
          position: pos,
          type: hazardDetails!.type,
          damage: hazardDetails?.damage,
          dc: hazardDetails?.dc,
        });
        added.push(pos);
      }
    } else {
      // For obstacle, difficultTerrain, water - use arrays
      const arr = terrainType === 'obstacle' ? terrain.obstacles! :
                  terrainType === 'difficultTerrain' ? terrain.difficultTerrain! :
                  terrain.water!;
      if (!arr.includes(pos)) {
        arr.push(pos);
        added.push(pos);
      }
    }
  }

  return added;
}

/**
 * Remove terrain positions from the terrain object
 */
function removeTerrainPositions(
  terrain: z.infer<typeof TerrainSchema>,
  terrainType: 'obstacle' | 'difficultTerrain' | 'water' | 'hazard',
  positions: string[]
): string[] {
  const removed: string[] = [];

  for (const pos of positions) {
    if (terrainType === 'hazard') {
      const index = terrain.hazards!.findIndex(h => h.position === pos);
      if (index !== -1) {
        terrain.hazards!.splice(index, 1);
        removed.push(pos);
      }
    } else {
      const arr = terrainType === 'obstacle' ? terrain.obstacles! :
                  terrainType === 'difficultTerrain' ? terrain.difficultTerrain! :
                  terrain.water!;
      const index = arr.indexOf(pos);
      if (index !== -1) {
        arr.splice(index, 1);
        removed.push(pos);
      }
    }
  }

  return removed;
}

/**
 * Clear all positions of a terrain type
 */
function clearTerrainType(
  terrain: z.infer<typeof TerrainSchema>,
  terrainType: 'obstacle' | 'difficultTerrain' | 'water' | 'hazard'
): string[] {
  let cleared: string[] = [];

  if (terrainType === 'hazard') {
    cleared = terrain.hazards!.map(h => h.position);
    terrain.hazards = [];
  } else if (terrainType === 'obstacle') {
    cleared = [...terrain.obstacles!];
    terrain.obstacles = [];
  } else if (terrainType === 'difficultTerrain') {
    cleared = [...terrain.difficultTerrain!];
    terrain.difficultTerrain = [];
  } else if (terrainType === 'water') {
    cleared = [...terrain.water!];
    terrain.water = [];
  }

  return cleared;
}

/**
 * Format terrain type label for display
 */
function formatTerrainTypeLabel(terrainType: string): string {
  switch (terrainType) {
    case 'difficultTerrain': return 'Difficult Terrain';
    case 'obstacle': return 'Obstacle';
    case 'water': return 'Water';
    case 'hazard': return 'Hazard';
    default: return terrainType;
  }
}

/**
 * Format terrain modification result as ASCII box.
 * 
 * @param input - The terrain modification input parameters
 * @param affectedPositions - List of positions that were modified
 * @param terrain - The terrain object after modification
 * @returns ASCII-formatted box displaying the modification result
 */
function formatTerrainModification(input: ModifyTerrainInput, affectedPositions: string[], terrain: z.infer<typeof TerrainSchema>): string {
  const WIDTH = 60;
  const content: string[] = [];

  content.push('');
  content.push(`Operation: ${input.operation.toUpperCase()}`);
  content.push(`Terrain Type: ${formatTerrainTypeLabel(input.terrainType)}`);

  if (affectedPositions.length > 0) {
    // Format positions as (x,y)
    const formattedPositions = affectedPositions.map(p => `(${p})`).join(', ');
    content.push(`Positions: ${formattedPositions}`);
  }

  if (input.source) {
    content.push(`Source: ${input.source}`);
  }

  if (input.duration !== undefined) {
    content.push(`Duration: ${input.duration} rounds`);
  }

  if (input.terrainType === 'hazard' && input.hazardDetails && input.operation === 'add') {
    content.push('');
    content.push(`Hazard: ${input.hazardDetails.type}`);
    if (input.hazardDetails.damage) {
      content.push(`  Damage: ${input.hazardDetails.damage}${input.hazardDetails.damageType ? ` ${input.hazardDetails.damageType}` : ''}`);
    }
    if (input.hazardDetails.dc) {
      content.push(`  DC ${input.hazardDetails.dc}${input.hazardDetails.saveAbility ? ` ${input.hazardDetails.saveAbility.toUpperCase()}` : ''}`);
    }
    if (input.hazardDetails.condition) {
      content.push(`  Condition: ${input.hazardDetails.condition}`);
    }
  }

  content.push('');
  
  // Format affected line with operation-specific wording
  const count = affectedPositions.length;
  let affectedLine: string;
  switch (input.operation) {
    case 'add':
      affectedLine = count === 0 ? 'No positions added' : `${count} position${count > 1 ? 's' : ''} added`;
      break;
    case 'remove':
      affectedLine = count === 0 ? '0 removed (no terrain found)' : `${count} position${count > 1 ? 's' : ''} removed`;
      break;
    case 'clear':
      affectedLine = count === 0 ? 'No terrain to clear' : `Cleared ${count} position${count > 1 ? 's' : ''}`;
      break;
    default:
      affectedLine = `Affected: ${count} squares`;
  }
  content.push(affectedLine);
  content.push('');

  // Show terrain totals after modification
  content.push('After modification:');
  const obstacleCount = terrain.obstacles?.length || 0;
  const difficultCount = terrain.difficultTerrain?.length || 0;
  const waterCount = terrain.water?.length || 0;
  const hazardCount = terrain.hazards?.length || 0;
  
  if (obstacleCount > 0) content.push(`  Obstacles: ${obstacleCount}`);
  if (difficultCount > 0) content.push(`  Difficult Terrain: ${difficultCount}`);
  if (waterCount > 0) content.push(`  Water: ${waterCount}`);
  if (hazardCount > 0) content.push(`  Hazards: ${hazardCount}`);
  
  if (obstacleCount === 0 && difficultCount === 0 && waterCount === 0 && hazardCount === 0) {
    content.push('  No terrain features');
  }
  content.push('');

  return createBox('TERRAIN MODIFIED', content, WIDTH, 'HEAVY');
}

// ============================================================
// END ENCOUNTER
// ============================================================

// End Encounter Schema
export const endEncounterSchema = z.object({
  encounterId: z.string().describe('The encounter to end'),
  outcome: z.enum(['victory', 'defeat', 'fled', 'negotiated', 'other']).describe('How combat ended'),
  generateSummary: z.boolean().optional().default(true).describe('Include combat statistics'),
  preserveLog: z.boolean().optional().default(false).describe('Keep encounter accessible after end'),
  notes: z.string().optional().describe('DM notes about the encounter'),
});

export type EndEncounterInput = z.input<typeof endEncounterSchema>;

/**
 * Summary of combat statistics for ended encounters.
 * Tracks damage, healing, attacks, conditions, and identifies MVP.
 */
interface CombatSummary {
  totalRounds: number;
  totalDamageDealt: number;
  totalHealingDone: number;
  totalAttacksMade: number;
  totalAttacksHit: number;
  participants: Array<{
    name: string;
    status: 'alive' | 'dead';
    hp?: number;
    maxHp?: number;
    damageDealt: number;
    damageTaken: number;
    healingDone: number;
    attacksMade: number;
    attacksHit: number;
    conditionsApplied: string[];
  }>;
  conditionsApplied: string[];
  mvp: string | null;
}

/**
 * Generate combat summary from encounter state.
 * Aggregates participant statistics and determines MVP based on damage dealt.
 * 
 * @param encounter - The encounter state to summarize
 * @returns CombatSummary with aggregated statistics
 */
function generateCombatSummary(encounter: EncounterState): CombatSummary {
  let totalDamageDealt = 0;
  let totalHealingDone = 0;
  let totalAttacksMade = 0;
  let totalAttacksHit = 0;
  const allConditions: string[] = [];

  const participants = encounter.participants.map(p => {
    const dmgDealt = p.damageDealt || 0;
    const dmgTaken = p.damageTaken || 0;
    const healing = p.healingDone || 0;
    const attacks = p.attacksMade || 0;
    const hits = p.attacksHit || 0;
    const conditions = p.conditionsApplied || [];
    
    totalDamageDealt += dmgDealt;
    totalHealingDone += healing;
    totalAttacksMade += attacks;
    totalAttacksHit += hits;
    allConditions.push(...conditions);

    return {
      name: p.name,
      status: (p.hp > 0 ? 'alive' : 'dead') as 'alive' | 'dead',
      hp: p.hp,
      maxHp: p.maxHp,
      damageDealt: dmgDealt,
      damageTaken: dmgTaken,
      healingDone: healing,
      attacksMade: attacks,
      attacksHit: hits,
      conditionsApplied: conditions,
    };
  });

  // Dedupe and count conditions
  const conditionCounts: Record<string, number> = {};
  for (const cond of allConditions) {
    conditionCounts[cond] = (conditionCounts[cond] || 0) + 1;
  }
  const formattedConditions = Object.entries(conditionCounts).map(
    ([name, count]) => (count > 1 ? `${name} (${count})` : name)
  );

  // Determine MVP based on damage dealt
  let mvp: string | null = null;
  if (participants.length > 0) {
    const topDamageDealer = participants.reduce((best, p) => 
      p.damageDealt > best.damageDealt ? p : best
    );
    if (topDamageDealer.damageDealt > 0) {
      mvp = topDamageDealer.name;
    }
  }

  return {
    totalRounds: encounter.round || 1,
    totalDamageDealt,
    totalHealingDone,
    totalAttacksMade,
    totalAttacksHit,
    participants,
    conditionsApplied: formattedConditions,
    mvp,
  };
}

/**
 * Format end encounter output as ASCII box.
 * Displays outcome, participant status, combat statistics, and optional notes.
 * 
 * @param input - The end encounter input parameters
 * @param encounter - The encounter state at time of ending
 * @param summary - Optional combat summary with statistics
 * @returns ASCII-formatted box displaying the encounter end result
 */
function formatEndEncounter(
  input: z.infer<typeof endEncounterSchema>,
  encounter: EncounterState,
  summary: CombatSummary | null
): string {
  const WIDTH = 60;
  const content: string[] = [];

  content.push('');
  content.push(`Encounter: ${input.encounterId}`);
  content.push(`Outcome: ${input.outcome.toUpperCase()}`);
  
  if (summary) {
    content.push(`Rounds: ${summary.totalRounds} rounds`);
    content.push('');
    content.push('PARTICIPANTS:');
    
    for (const p of summary.participants) {
      const marker = p.status === 'alive' ? '✓' : '✗';
      if (p.status === 'alive') {
        content.push(`  ${marker} ${p.name} - ALIVE (${p.hp}/${p.maxHp} HP)`);
      } else {
        content.push(`  ${marker} ${p.name} - DEAD`);
      }
    }
    
    content.push('');
    content.push('COMBAT STATISTICS:');
    content.push(`  Total Damage Dealt: ${summary.totalDamageDealt}`);
    content.push(`  Total Healing Done: ${summary.totalHealingDone}`);
    content.push(`  Attacks Made: ${summary.totalAttacksMade}`);
    content.push(`  Attacks Hit: ${summary.totalAttacksHit}`);
    
    // Always show conditions line
    if (summary.conditionsApplied.length > 0) {
      content.push(`  Conditions Applied: ${summary.conditionsApplied.join(', ')}`);
    } else {
      content.push(`  Conditions Applied: None`);
    }
    
    // Always show MVP section
    content.push('');
    if (summary.mvp) {
      content.push(`Most Effective: ${summary.mvp}`);
    } else {
      content.push(`Most Effective: N/A`);
    }
  }
  
  if (input.notes) {
    content.push('');
    content.push(`Notes: ${input.notes}`);
  }
  
  content.push('');

  return createBox('ENCOUNTER ENDED', content, WIDTH, 'HEAVY');
}

/**
 * End a combat encounter with outcome tracking and optional summary generation.
 * 
 * This function:
 * 1. Validates the encounter exists and is not already ended
 * 2. Generates combat statistics summary (if requested)
 * 3. Marks the encounter as ended with outcome and timestamp
 * 4. Either preserves the encounter for review or removes it from active storage
 * 
 * @param input - End encounter parameters (encounterId, outcome, options)
 * @returns ASCII-formatted encounter end display
 * @throws Error if encounter not found or already ended
 */
export function endEncounter(input: z.infer<typeof endEncounterSchema>): string {
  // 1. Validate encounter exists
  const encounter = encounterStore.get(input.encounterId);
  if (!encounter) {
    throw new Error(`Encounter not found: ${input.encounterId}`);
  }
  
  // 2. Check if already ended
  if (encounter.status === 'ended') {
    throw new Error(`Encounter already ended: ${input.encounterId}`);
  }
  
  // 3. Generate summary if requested
  let summary: CombatSummary | null = null;
  if (input.generateSummary !== false) {
    summary = generateCombatSummary(encounter);
  }
  
  // 4. Mark as ended
  encounter.status = 'ended';
  encounter.outcome = input.outcome;
  encounter.endedAt = new Date().toISOString();
  if (input.notes) {
    encounter.notes = input.notes;
  }
  
  // 5. Handle preservation
  if (input.preserveLog) {
    encounter.preserved = true;
    encounterStore.set(input.encounterId, encounter);
  } else {
    // Remove from active encounters
    encounterStore.delete(input.encounterId);
  }
  
  // 6. Return ASCII formatted output
  return formatEndEncounter(input, encounter, summary);
}