/**
 * Tool Registry - Static Loading
 * All 50 tools are registered here at startup.
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Re-export SDK type for external use
export type { CallToolResult };

// ============================================================
// TYPE DEFINITIONS
// ============================================================

/**
 * JSON Schema representation for MCP tool input validation.
 * Supports standard object schemas and discriminated unions (anyOf/oneOf).
 */
export interface JsonSchema {
  type?: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  anyOf?: Array<{
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  }>;
  oneOf?: Array<{
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  }>;
}

/**
 * Generic type for MCP tool handlers.
 * Provides type safety for validated arguments from Zod schema parsing.
 *
 * @template TArgs - The validated argument type from Zod schema (defaults to unknown for untyped handlers)
 * @example
 * ```typescript
 * // Typed handler with inferred args from Zod schema
 * const handler: ToolHandler<z.infer<typeof mySchema>> = async (args) => {
 *   // args is fully typed here
 *   return success(args.name);
 * };
 * ```
 */
export type ToolHandler<TArgs = unknown> = (args: TArgs) => Promise<CallToolResult>;

/**
 * Complete tool definition with typed handler.
 * Combines tool metadata (name, description, schema) with an optionally typed handler.
 *
 * @template TArgs - The expected argument type for the handler (defaults to unknown)
 * @example
 * ```typescript
 * const myTool: TypedToolDefinition<{ name: string }> = {
 *   name: 'my_tool',
 *   description: 'Does something with a name',
 *   inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
 *   handler: async (args) => success(`Hello ${args.name}`)
 * };
 * ```
 */
export interface TypedToolDefinition<TArgs = unknown> {
  /** Unique tool identifier (snake_case by convention) */
  name: string;
  /** Human-readable description for LLM tool discovery */
  description: string;
  /** JSON Schema for input validation */
  inputSchema: JsonSchema;
  /** Async handler function that processes validated arguments */
  handler: ToolHandler<TArgs>;
}

/**
 * Tool definition interface for the registry.
 * Uses unknown args type since handlers receive unvalidated input from MCP.
 * Validation happens inside each handler via Zod parsing.
 */
export interface ToolDefinition extends TypedToolDefinition<unknown> {}

/**
 * Creates a type-safe handler function with proper schema validation.
 * Provides compile-time type checking for handler arguments based on Zod schema.
 *
 * @template T - The validated argument type inferred from the Zod schema
 * @param schema - Zod schema for runtime validation
 * @param handler - Type-safe handler function that receives validated args
 * @returns A ToolHandler that validates input before calling the typed handler
 *
 * @example
 * ```typescript
 * const mySchema = z.object({ name: z.string(), age: z.number() });
 * const myHandler = createTypedHandler(mySchema, async (args) => {
 *   // args is typed as { name: string; age: number }
 *   return success(`${args.name} is ${args.age} years old`);
 * });
 * ```
 */
export function createTypedHandler<T>(
  schema: z.ZodSchema<T>,
  handler: ToolHandler<T>
): ToolHandler<unknown> {
  return async (args: unknown): Promise<CallToolResult> => {
    try {
      const validated = schema.parse(args);
      return await handler(validated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const issues = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        return error(`Validation failed: ${issues}`);
      }
      throw err;
    }
  };
}

// ============================================================
// RESPONSE HELPERS
// ============================================================

/**
 * Format a successful tool response with Markdown content.
 * Logs output for debugging encoding issues in MCP transport.
 *
 * @param markdown - The Markdown-formatted response content
 * @returns MCP CallToolResult with text content
 */
export function success(markdown: string): CallToolResult {
  // Log raw output for debugging encoding issues
  console.error('[MCP RAW OUTPUT]', markdown.substring(0, 500));
  // Also log hex of first 100 chars to see actual bytes
  const hexPreview = [...markdown.substring(0, 100)].map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join(' ');
  console.error('[MCP RAW HEX]', hexPreview);

  return {
    content: [{ type: 'text', text: markdown }],
  };
}

/**
 * Format an error response with standardized prefix.
 *
 * @param message - The error message to return
 * @returns MCP CallToolResult with isError flag set
 */
export function error(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: `[ERROR] ${message}` }],
    isError: true,
  };
}

// ============================================================
// TOOL CALL TRACKING
// ============================================================

/** Internal counter for tool invocations (keyed by tool name) */
const toolCallCounts: Record<string, number> = {};

/**
 * Get the number of times a specific tool has been called.
 *
 * @param name - The tool name to query
 * @returns The call count (0 if never called)
 */
export function getToolCallCount(name: string): number {
  return toolCallCounts[name] || 0;
}

/**
 * Get all tool call counts as a snapshot.
 *
 * @returns Copy of the call count record
 */
export function getAllToolCallCounts(): Record<string, number> {
  return { ...toolCallCounts };
}

/**
 * Reset all tool call counters to zero.
 * Primarily used for testing isolation.
 */
export function resetToolCallCounts(): void {
  for (const key of Object.keys(toolCallCounts)) {
    delete toolCallCounts[key];
  }
}

/**
 * Increment the call counter for a tool.
 * @internal Called by handleToolCall
 */
function trackToolCall(name: string): void {
  toolCallCounts[name] = (toolCallCounts[name] || 0) + 1;
}

// ============================================================
// TOOL REGISTRY (Static)
// ============================================================

import { parseDice, formatDiceResult } from './modules/dice.js';
import {
  createCharacter,
  createCharacterSchema,
  getCharacter,
  getCharacterSchema,
  updateCharacter,
  updateCharacterSchema,
  deleteCharacter,
  deleteCharacterSchema,
  takeRest,
  takeRestSchema,
  manageSpellSlots,
  manageSpellSlotsSchema,
  rollCheck,
  rollCheckSchema,
  levelUp,
  levelUpSchema
} from './modules/characters.js';
import { measureDistance, measureDistanceSchema, calculateAoe, calculateAoeSchema, checkLineOfSight, checkLineOfSightSchema, checkCover, checkCoverSchema, placeProp, placePropSchema, calculateMovement, calculateMovementSchema } from './modules/spatial.js';
import { manageCondition, manageConditionSchema, createEncounter, createEncounterSchema, executeAction, executeActionSchema, advanceTurn, advanceTurnSchema, rollDeathSave, rollDeathSaveSchema, modifyTerrain, modifyTerrainSchema, renderBattlefield, renderBattlefieldSchema, getEncounter, getEncounterSchema, endEncounter, endEncounterSchema, manageEncounter, manageEncounterSchema } from './modules/combat.js';
import { manageConcentration, manageConcentrationSchema, manageAura, manageAuraSchema, useScroll, useScrollSchema, synthesizeSpell, synthesizeSpellSchema } from './modules/magic.js';
import { manageLocation, manageLocationSchema, moveParty, movePartySchema, manageParty, managePartySchema, manageInventory, manageInventorySchema, manageNotes, manageNotesSchema, getSessionContext, getSessionContextSchema } from './modules/data.js';
import { createBox, BOX } from './modules/ascii-art.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Convert a Zod schema to JSON Schema for MCP tool registration.
 *
 * MCP/Claude client doesn't resolve $ref, so we use 'none' strategy.
 * Union schemas (anyOf/oneOf) are flattened to a single object with
 * all properties merged, since MCP requires type: "object" at root.
 *
 * @param schema - The Zod schema to convert
 * @returns JSON Schema compatible with MCP tool definition
 */
function toJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const jsonSchema = zodToJsonSchema(schema, { $refStrategy: 'none' }) as Record<string, unknown>;

  // If schema has anyOf/oneOf at root, flatten it to a single object with all properties optional
  if (jsonSchema.anyOf || jsonSchema.oneOf) {
    const variants = (jsonSchema.anyOf || jsonSchema.oneOf) as Array<{ properties?: Record<string, unknown> }>;
    const allProperties: Record<string, unknown> = {};

    // Merge all properties from all variants
    for (const variant of variants) {
      if (variant.properties) {
        Object.assign(allProperties, variant.properties);
      }
    }

    return {
      type: 'object',
      properties: allProperties,
    };
  }

  return jsonSchema as JsonSchema;
}

export const toolRegistry: Record<string, ToolDefinition> = {
  roll_dice: {
    name: 'roll_dice',
    description: 'Roll dice using standard notation (e.g., "2d6+4", "4d6kh3"). Supports single rolls or batch rolling multiple expressions at once. Supports advantage/disadvantage for d20 rolls. Provide either "expression" for single roll or "batch" for multiple rolls.',
    inputSchema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Dice expression for single roll (e.g., "2d6+4", "1d20", "4d6kh3")',
        },
        batch: {
          type: 'array',
          description: 'Array of roll requests for batch rolling (alternative to expression)',
          items: {
            type: 'object',
            properties: {
              expression: {
                type: 'string',
                description: 'Dice expression (e.g., "2d6+4", "1d20", "4d6kh3")',
              },
              label: {
                type: 'string',
                description: 'Label for this roll (e.g., "Attack 1", "Damage", "Goblin 1")',
              },
              advantage: {
                type: 'boolean',
                description: 'Roll with advantage (2d20, keep highest)',
              },
              disadvantage: {
                type: 'boolean',
                description: 'Roll with disadvantage (2d20, keep lowest)',
              },
            },
            required: ['expression'],
          },
          minItems: 1,
          maxItems: 20,
        },
        reason: {
          type: 'string',
          description: 'Optional reason for the roll(s)',
        },
        advantage: {
          type: 'boolean',
          description: 'Roll with advantage (2d20, keep highest). Only works with single d20 rolls.',
        },
        disadvantage: {
          type: 'boolean',
          description: 'Roll with disadvantage (2d20, keep lowest). Only works with single d20 rolls.',
        },
      },
    },
    handler: async (args) => {
      // Check if this is a batch operation
      const argsObj = args as Record<string, unknown>;
      if ('batch' in argsObj && argsObj.batch) {
        const { batch, reason } = args as {
          batch?: Array<{ expression: string; label?: string; advantage?: boolean; disadvantage?: boolean }>;
          reason?: string;
        };

        if (!batch || batch.length === 0) {
          return error('Missing required parameter: batch (must be non-empty array)');
        }

        if (batch.length > 20) {
          return error('Too many rolls (maximum 20 per batch)');
        }

        try {
          const results: Array<{ label?: string; expression: string; total: number; rolls: number[]; kept: number[] }> = [];

          for (const roll of batch) {
            if (!roll.expression) {
              return error('Each roll must have an expression');
            }

            if (roll.advantage && roll.disadvantage) {
              return error(`Roll "${roll.label || roll.expression}": Cannot have both advantage and disadvantage`);
            }

            let finalExpression = roll.expression;

            // Auto-convert d20 rolls to advantage/disadvantage
            if ((roll.advantage || roll.disadvantage) && roll.expression.match(/^1d20([+-]\d+)?$/i)) {
              const modifier = roll.expression.match(/([+-]\d+)$/)?.[1] || '';
              finalExpression = roll.advantage ? `2d20kh1${modifier}` : `2d20kl1${modifier}`;
            } else if (roll.advantage || roll.disadvantage) {
              return error(`Roll "${roll.label || roll.expression}": Advantage/disadvantage only works with single d20 rolls`);
            }

            const result = parseDice(finalExpression);
            results.push({
              label: roll.label,
              expression: finalExpression,
              total: result.total,
              rolls: result.rolls,
              kept: result.kept,
            });
          }

          // Format batch output
          const content: string[] = [];

          if (reason) {
            content.push(reason.toUpperCase());
            content.push('');
          }

          content.push(`ROLLING ${results.length} DICE ${results.length === 1 ? 'EXPRESSION' : 'EXPRESSIONS'}`);
          content.push('');
          content.push('─'.repeat(40));
          content.push('');

          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            const label = r.label || `Roll ${i + 1}`;

            content.push(`${label}:`);
            content.push(`  Expression: ${r.expression}`);

            if (r.rolls.length !== r.kept.length) {
              content.push(`  Rolled: [${r.rolls.join(', ')}]`);
              content.push(`  Kept: [${r.kept.join(', ')}]`);
            } else if (r.rolls.length > 1) {
              content.push(`  Rolled: [${r.rolls.join(', ')}]`);
            }

            content.push(`  Result: ${r.total}`);
            content.push('');
          }

          content.push('─'.repeat(40));
          content.push('');
          content.push(`TOTAL ACROSS ALL ROLLS: ${results.reduce((sum, r) => sum + r.total, 0)}`);

          return success(createBox('BATCH ROLL', content, undefined, 'HEAVY'));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return error(message);
        }
      }

      // Single roll mode
      const { expression, reason, advantage, disadvantage } = args as {
        expression?: string;
        reason?: string;
        advantage?: boolean;
        disadvantage?: boolean;
      };

      if (!expression) {
        return error('Missing required parameter: expression');
      }

      if (advantage && disadvantage) {
        return error('Cannot have both advantage and disadvantage');
      }

      try {
        let finalExpression = expression;

        // Auto-convert d20 rolls to advantage/disadvantage
        if ((advantage || disadvantage) && expression.match(/^1d20([+-]\d+)?$/i)) {
          const modifier = expression.match(/([+-]\d+)$/)?.[1] || '';
          finalExpression = advantage ? `2d20kh1${modifier}` : `2d20kl1${modifier}`;
        } else if (advantage || disadvantage) {
          return error('Advantage/disadvantage only works with single d20 rolls (e.g., "1d20" or "1d20+5")');
        }

        const result = parseDice(finalExpression);
        return success(formatDiceResult(result, reason));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  create_character: {
    name: 'create_character',
    description: 'Create a new D&D 5e character with stats, class, race, and equipment',
    inputSchema: toJsonSchema(createCharacterSchema),
    handler: async (args) => {
      try {
        const validated = createCharacterSchema.parse(args);
        const result = createCharacter(validated);
        return success(result.markdown);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  get_character: {
    name: 'get_character',
    description: 'Retrieve an existing D&D 5e character by ID',
    inputSchema: toJsonSchema(getCharacterSchema),
    handler: async (args) => {
      try {
        const validated = getCharacterSchema.parse(args);
        const result = getCharacter(validated);

        if (!result.success) {
          return error(result.error || 'Failed to retrieve character');
        }

        return success(result.markdown);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  update_character: {
    name: 'update_character',
    description: 'Update an existing D&D 5e character with new stats, HP, level, equipment, etc.',
    inputSchema: toJsonSchema(updateCharacterSchema),
    handler: async (args) => {
      try {
        const validated = updateCharacterSchema.parse(args);
        const result = updateCharacter(validated);

        if (!result.success) {
          return error(result.error || 'Failed to update character');
        }

        return success(result.markdown);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  delete_character: {
    name: 'delete_character',
    description: 'Permanently delete a D&D 5e character by ID or name. Supports batch deletion.',
    inputSchema: toJsonSchema(deleteCharacterSchema),
    handler: async (args) => {
      try {
        const validated = deleteCharacterSchema.parse(args);
        const result = deleteCharacter(validated);

        if (!result.success) {
          return error(result.error || 'Failed to delete character');
        }

        return success(result.markdown);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  take_rest: {
    name: 'take_rest',
    description: 'Process short or long rest for D&D 5e character. Short rest: spend hit dice to heal. Long rest: restore all HP, half hit dice (rounded up), and clear until_rest conditions. Supports batch for party rests.',
    inputSchema: toJsonSchema(takeRestSchema),
    handler: async (args) => {
      try {
        const validated = takeRestSchema.parse(args);
        const result = takeRest(validated);

        if (!result.success) {
          return error(result.error || 'Failed to process rest');
        }

        return success(result.markdown);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  manage_spell_slots: {
    name: 'manage_spell_slots',
    description: 'Manage D&D 5e spell slots. Operations: view (display slots), expend (use slot), restore (regain slots), set (DM override). Supports warlock pact magic (short rest recovery). Full/half/third casters calculated by class and level. Batch support for party spell tracking.',
    inputSchema: toJsonSchema(manageSpellSlotsSchema),
    handler: async (args) => {
      try {
        const validated = manageSpellSlotsSchema.parse(args);
        const result = manageSpellSlots(validated);

        if (!result.success) {
          return error(result.error || 'Failed to manage spell slots');
        }

        return success(result.markdown);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  level_up: {
    name: 'level_up',
    description: 'Level up a character. Increases level, HP (roll/average/max/manual), proficiency bonus, and spell slots. Supports custom class hit dice and resource scaling. Multi-level jumps allowed (e.g., 1→5). Batch support for party level-ups. Optionally track new features and spells learned.',
    inputSchema: toJsonSchema(levelUpSchema),
    handler: async (args) => {
      try {
        const validated = levelUpSchema.parse(args);
        const result = levelUp(validated);

        if (!result.success) {
          return error(result.error || 'Failed to level up');
        }

        return success(result.markdown);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  measure_distance: {
    name: 'measure_distance',
    description: 'Measure distance between two positions using D&D 5e grid mechanics',
    inputSchema: toJsonSchema(measureDistanceSchema),
    handler: async (args) => {
      try {
        const validated = measureDistanceSchema.parse(args);
        const result = measureDistance(validated);
        return success(result.markdown);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  calculate_aoe: {
    name: 'calculate_aoe',
    description: 'Calculate area of effect for D&D 5e spells/abilities (sphere, cone, line, cube, cylinder)',
    inputSchema: toJsonSchema(calculateAoeSchema),
    handler: async (args) => {
      try {
        const validated = calculateAoeSchema.parse(args);
        const result = calculateAoe(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  check_line_of_sight: {
    name: 'check_line_of_sight',
    description: 'Check line of sight between positions with obstacle/cover detection',
    inputSchema: toJsonSchema(checkLineOfSightSchema),
    handler: async (args) => {
      try {
        const validated = checkLineOfSightSchema.parse(args);
        const result = checkLineOfSight(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  check_cover: {
    name: 'check_cover',
    description: 'Check cover between attacker and target, returning AC and Dex save bonuses',
    inputSchema: toJsonSchema(checkCoverSchema),
    handler: async (args) => {
      try {
        const validated = checkCoverSchema.parse(args);
        const result = checkCover(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  place_prop: {
    name: 'place_prop',
    description: 'Place or manage interactive props on the battlefield (barrels, doors, chests, etc.)',
    inputSchema: toJsonSchema(placePropSchema),
    handler: async (args) => {
      try {
        const validated = placePropSchema.parse(args);
        const result = placeProp(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  calculate_movement: {
    name: 'calculate_movement',
    description: 'Calculate movement paths, reachable squares, or adjacent squares with terrain support',
    inputSchema: toJsonSchema(calculateMovementSchema),
    handler: async (args) => {
      try {
        const validated = calculateMovementSchema.parse(args);
        const result = calculateMovement(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  manage_condition: {
    name: 'manage_condition',
    description: 'Manage D&D 5e conditions on targets (add, remove, query, tick duration)',
    inputSchema: toJsonSchema(manageConditionSchema),
    handler: async (args) => {
      try {
        const validated = manageConditionSchema.parse(args);
        const result = manageCondition(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  create_encounter: {
    name: 'create_encounter',
    description: 'Create a D&D 5e combat encounter with participants, terrain, and initiative tracking',
    inputSchema: toJsonSchema(createEncounterSchema),
    handler: async (args) => {
      try {
        const validated = createEncounterSchema.parse(args);
        const result = createEncounter(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  roll_check: {
    name: 'roll_check',
    description: 'Roll D&D 5e checks including skill checks, ability checks, saving throws, attack rolls, and initiative',
    inputSchema: toJsonSchema(rollCheckSchema),
    handler: async (args) => {
      try {
        const validated = rollCheckSchema.parse(args);
        const result = rollCheck(validated);

        if (!result.success) {
          return error(result.error || 'Failed to roll check');
        }

        return success(result.markdown);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  execute_action: {
    name: 'execute_action',
    description: 'Execute a combat action in an encounter (attack, dash, disengage, dodge, etc.). Phase 1 supports attack and dash actions.',
    inputSchema: toJsonSchema(executeActionSchema),
    handler: async (args) => {
      try {
        const validated = executeActionSchema.parse(args);
        const result = executeAction(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  advance_turn: {
    name: 'advance_turn',
    description: 'Advance to the next combatant\'s turn in an encounter. Handles round transitions when all combatants have acted, ticks condition durations (removing expired conditions), clears action economy for the previous combatant, and provides death save reminders for combatants at 0 HP. Returns ASCII-formatted turn info with initiative order preview.',
    inputSchema: toJsonSchema(advanceTurnSchema),
    handler: async (args) => {
      try {
        const validated = advanceTurnSchema.parse(args);
        const result = advanceTurn(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  roll_death_save: {
    name: 'roll_death_save',
    description: 'Roll a death saving throw for a character at 0 HP. D&D 5e rules: 10+ success, 9- failure, nat 1 = 2 failures, nat 20 = revive at 1 HP. 3 successes = stable (unconscious but not dying), 3 failures = death. Supports modifiers from spells like Bless and roll modes (advantage/disadvantage). Returns ASCII-formatted death save result with visual tracker.',
    inputSchema: toJsonSchema(rollDeathSaveSchema),
    handler: async (args) => {
      try {
        const validated = rollDeathSaveSchema.parse(args);
        const result = rollDeathSave(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  modify_terrain: {
    name: 'modify_terrain',
    description: 'Add, remove, or clear terrain in a combat encounter. Supports obstacles, difficult terrain, water, and hazards. Use for dynamic battlefield changes from spells (Wall of Stone, Spike Growth), abilities, or environmental effects.',
    inputSchema: toJsonSchema(modifyTerrainSchema),
    handler: async (args) => {
      try {
        const validated = modifyTerrainSchema.parse(args);
        const result = modifyTerrain(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  render_battlefield: {
    name: 'render_battlefield',
    description: 'Render an ASCII map of the current combat state showing participant positions, obstacles, and terrain. Returns a text-based grid visualization.',
    inputSchema: toJsonSchema(renderBattlefieldSchema),
    handler: async (args) => {
      try {
        const validated = renderBattlefieldSchema.parse(args);
        const result = renderBattlefield(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  get_encounter: {
    name: 'get_encounter',
    description: 'Get the current state of a combat encounter. Supports verbosity levels: minimal (LLM context), summary (quick overview), standard (default DM view), detailed (full state dump).',
    inputSchema: toJsonSchema(getEncounterSchema),
    handler: async (args) => {
      try {
        const validated = getEncounterSchema.parse(args);
        const result = getEncounter(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  end_encounter: {
    name: 'end_encounter',
    description: 'End a combat encounter with outcome tracking and optional summary generation. Supports victory, defeat, fled, negotiated outcomes. Can preserve encounter log for review.',
    inputSchema: toJsonSchema(endEncounterSchema),
    handler: async (args) => {
      try {
        const validated = endEncounterSchema.parse(args);
        const result = endEncounter(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },


  manage_encounter: {
    name: 'manage_encounter',
    description: 'Composite tool for encounter management with state synchronization. Operations: create (with characterId linking), get (with verbosity), end (with participantUpdates), commit (sync to persistent characters), list (active encounters). Supports bridging encounter simulation state with persistent character records.',
    inputSchema: toJsonSchema(manageEncounterSchema),
    handler: async (args) => {
      try {
        const validated = manageEncounterSchema.parse(args);
        const result = manageEncounter(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },
  manage_concentration: {
    name: 'manage_concentration',
    description: 'Manage D&D 5e concentration on spells. Operations: set (begin concentrating), get (query state), check (roll save after damage), break (end concentration). DC = max(10, damage/2). Supports advantage/disadvantage on saves.',
    inputSchema: toJsonSchema(manageConcentrationSchema),
    handler: async (args) => {
      try {
        const validated = manageConcentrationSchema.parse(args);
        const result = manageConcentration(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  manage_aura: {
    name: 'manage_aura',
    description: 'Manage D&D 5e aura effects (Spirit Guardians, Aura of Protection, etc.). Operations: create (new aura), list (active auras), process (apply effects to targets in range), remove (end aura). Supports damage, healing, conditions, and saving throws.',
    inputSchema: toJsonSchema(manageAuraSchema),
    handler: async (args) => {
      try {
        const validated = manageAuraSchema.parse(args);
        const result = manageAura(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  use_scroll: {
    name: 'use_scroll',
    description: 'Use a spell scroll in D&D 5e. If spell is on your class list and same/lower level: auto-success. If spell is higher level: Arcana check DC 10 + spell level. On failure: scroll is consumed with no effect. On success: spell is cast from scroll, scroll consumed.',
    inputSchema: toJsonSchema(useScrollSchema),
    handler: async (args) => {
      try {
        const validated = useScrollSchema.parse(args);
        const result = useScroll(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  synthesize_spell: {
    name: 'synthesize_spell',
    description: 'Arcane Synthesis for improvised magic. Caster proposes a custom spell effect; Arcana check DC = 10 + (level × 2) + modifiers. Success creates temporary spell effect, failure may cause mishaps. Supports circumstance modifiers (ley lines, desperation, material components).',
    inputSchema: toJsonSchema(synthesizeSpellSchema),
    handler: async (args) => {
      try {
        const validated = synthesizeSpellSchema.parse(args);
        const result = synthesizeSpell(validated);
        return success(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  manage_location: {
    name: 'manage_location',
    description: 'Manage location graph for party navigation. Operations: create (new location), get (retrieve location + connections), update (modify properties), delete (remove location), link (connect two locations), unlink (disconnect locations), list (all locations). Supports location types, lighting, hazards, tags, and connection types (door, passage, stairs, ladder, portal, hidden).',
    inputSchema: toJsonSchema(manageLocationSchema),
    handler: async (args) => {
      try {
        const result = await manageLocation(args);
        return result;
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  move_party: {
    name: 'move_party',
    description: 'Move the party between connected locations. Operations: move (travel to connected location), status (show current location and exits), history (show travel history). Validates connections, handles locked/hidden passages, one-way paths, and tracks travel history.',
    inputSchema: toJsonSchema(movePartySchema),
    handler: async (args) => {
      try {
        const result = await moveParty(args);
        return result;
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  manage_inventory: {
    name: 'manage_inventory',
    description: 'Manage character inventory. Operations: give (add items), take (remove items), equip (equip to slot), unequip (remove from slot), move (change container), list (show inventory), transfer (move between characters).',
    inputSchema: toJsonSchema(manageInventorySchema),
    handler: async (args) => {
      try {
        const result = await manageInventory(args);
        return result;
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  manage_party: {
    name: 'manage_party',
    description: 'Manage party composition. Operations: add (add character to party with optional role), remove (remove character from party), list (show party roster), get (get party member details), set_role (assign role to party member), clear (remove all members). Roles: leader, scout, healer, tank, support, damage, utility, other.',
    inputSchema: toJsonSchema(managePartySchema),
    handler: async (args) => {
      try {
        const result = await manageParty(args);
        return result;
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  manage_notes: {
    name: 'manage_notes',
    description: 'Manage session notes. Operations: add (add note with content/tags/importance), search (search by query/tagFilter), get (get by noteId), delete (remove by noteId), list (list recent with limit).',
    inputSchema: toJsonSchema(manageNotesSchema),
    handler: async (args) => {
      try {
        const result = await manageNotes(args);
        return result;
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },

  get_session_context: {
    name: 'get_session_context',
    description: 'Get comprehensive session context snapshot. Includes location, party, notes, combat state, and summary. Options: include (array of sections), format (detailed|compact|brief), maxNotes (limit), includeTimestamps (boolean).',
    inputSchema: toJsonSchema(getSessionContextSchema),
    handler: async (args) => {
      try {
        const result = await getSessionContext(args);
        return result;
      } catch (err) {
        if (err instanceof z.ZodError) {
          const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
          return error(`Validation failed: ${messages}`);
        }
        const message = err instanceof Error ? err.message : String(err);
        return error(message);
      }
    },
  },
};

// ============================================================
// TOOL CALL HANDLER
// ============================================================

/**
 * Execute a tool by name with the provided arguments.
 *
 * This is the main entry point for MCP tool invocations.
 * It handles:
 * - Tool lookup from the registry
 * - Call tracking for analytics
 * - Error handling and formatting
 *
 * @param name - The tool name (must exist in toolRegistry)
 * @param args - The unvalidated arguments from the MCP client
 * @returns MCP CallToolResult with success or error content
 *
 * @example
 * ```typescript
 * const result = await handleToolCall('roll_dice', { expression: '2d6+4' });
 * ```
 */
export async function handleToolCall(
  name: string,
  args: unknown
): Promise<CallToolResult> {
  const tool = toolRegistry[name];

  if (!tool) {
    return error(`Unknown tool: ${name}`);
  }

  // Track the call
  trackToolCall(name);

  try {
    return await tool.handler(args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`Tool "${name}" failed: ${message}`);
  }
}
