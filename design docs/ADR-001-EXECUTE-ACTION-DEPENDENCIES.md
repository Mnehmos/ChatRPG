# ADR-001: execute_action Tool Dependencies & D&D 5e Mechanics Audit

**Status:** PROPOSED  
**Date:** 2025-12-18  
**Deciders:** Orchestrator, Architect  

---

## Context

The `execute_action` tool is the **central hub** for combat actions in the RPG-Lite MCP system. Based on the D&D 5e Player's Handbook, it must handle:

- **14 Action Types** (already defined in `src/types.ts`)
- **Bonus Actions** (via action cost parameter)
- **Reactions** (opportunity attacks, readied actions)
- **Movement** (with difficult terrain, opportunity attacks)

Before implementing `execute_action`, we need to audit dependencies and ensure all required subsystems are in place.

---

## Existing Enum Schemas (src/types.ts)

The project follows a **menu-driven design** using Zod enums for LLM dropdowns:

### ActionTypeSchema (14 options)
```typescript
export const ActionTypeSchema = z.enum([
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
]);
```

### Supporting Enums
- `ConditionSchema` - 15 D&D conditions (blinded, charmed, etc.)
- `DamageTypeSchema` - 13 damage types (slashing, fire, etc.)
- `AbilitySchema` - 6 abilities (str, dex, con, int, wis, cha)
- `SkillSchema` - 18 skills
- `SizeSchema` - 6 size categories
- `CoverSchema` - none, half, three_quarters, full
- `LightSchema` - bright, dim, darkness, magical_darkness

---

## Action Type Dependencies Matrix

| Action | Dependencies | Mechanic | Priority |
|--------|--------------|----------|----------|
| **attack** | `roll_check`, `roll_dice`, `update_character` | Attack → damage → HP | P1 |
| **cast_spell** | `manage_spell_slots`*, `update_character` | Slot deduction, concentration | P3 |
| **dash** | None | Double movement | P1 |
| **disengage** | None | No opportunity attacks | P2 |
| **dodge** | `manage_condition` | Add "dodging" status | P2 |
| **help** | None | Advantage to ally | P4 |
| **hide** | `roll_check` | Stealth vs Perception | P4 |
| **ready** | None | Hold action trigger | P4 |
| **search** | `roll_check` | Investigation/Perception | P4 |
| **use_object** | `manage_inventory`* | Item interaction | P4 |
| **use_magic_item** | `manage_inventory`* | Magic item activation | P4 |
| **use_special_ability** | Varies | Class/race abilities | P4 |
| **shove** | `roll_check`, `manage_condition` | Contested Athletics | P2 |
| **grapple** | `roll_check`, `manage_condition` | Contested Athletics | P2 |

*Not yet implemented

---

## Dependency Audit

### ✅ READY (Implemented - 213 tests passing)

| Tool | Used By | Status |
|------|---------|--------|
| `roll_dice` | Attack damage, spell damage | ✅ 8 tests |
| `create_character` | Actor/target stats | ✅ 25 tests |
| `get_character` | Retrieve actor/target | ✅ 23 tests |
| `update_character` | HP changes, slot deduction | ✅ 36 tests |
| `roll_check` | Attack rolls, saves, skill checks | ✅ 46 tests |
| `measure_distance` | Range validation, OA triggers | ✅ 9 tests |
| `manage_condition` | Prone, grappled, restrained | ✅ ~20 tests |
| `create_encounter` | Encounter context, initiative | ✅ 43 tests |

### 🔶 NEEDED (Can stub for Phase 1)

| Tool | Priority | Status | Used By |
|------|----------|--------|---------|
| `advance_turn` | HIGH | ✅ DONE | Turn order, action economy reset |
| `manage_spell_slots` | MEDIUM | ✅ DONE (44 tests) | cast_spell action |
| `calculate_movement` | MEDIUM | | Difficult terrain, speed mods |
| `manage_inventory` | LOW | | use_object, use_magic_item |

---

## Decision: Phased Implementation

### Phase 1: Attack & Movement (This Sprint)

**Actions:** `attack`, `dash` (via move with 2x speed)

**Schema (minimal):**
```typescript
const ExecuteActionSchema = z.object({
  // Encounter context
  encounterId: z.string().optional(),
  
  // Actor (either/or)
  actorId: z.string().optional(),
  actorName: z.string().optional(),
  
  // Action selection (enum menu!)
  actionType: ActionTypeSchema,
  
  // Action economy (enum menu!)
  actionCost: z.enum(['action', 'bonus_action', 'reaction', 'free']).default('action'),
  
  // Target (for attack/grapple/shove)
  targetId: z.string().optional(),
  targetName: z.string().optional(),
  
  // Attack options
  weaponType: z.enum(['melee', 'ranged']).optional(),
  damageExpression: z.string().optional(), // e.g., "1d8+3"
  damageType: DamageTypeSchema.optional(),
  
  // Movement options
  moveTo: PositionSchema.optional(),
  
  // Advantage/disadvantage (enum!)
  advantage: z.boolean().optional(),
  disadvantage: z.boolean().optional(),
  
  // Manual rolls (pre-rolled dice)
  manualAttackRoll: z.number().optional(),
  manualDamageRoll: z.number().optional(),
});
```

### Phase 2: Tactical Actions

**Actions:** `disengage`, `dodge`, `grapple`, `shove`

Add to schema:
```typescript
// Shove direction (enum!)
shoveDirection: z.enum(['away', 'prone']).optional(),
```

### Phase 3: Magic Integration

**Actions:** `cast_spell`

Add to schema:
```typescript
// Spell options
spellName: z.string().optional(),
spellLevel: z.number().min(0).max(9).optional(),
spellSlotLevel: z.number().min(1).max(9).optional(), // Upcasting
```

Requires: `manage_spell_slots` tool

### Phase 4: Utility Actions

**Actions:** `help`, `hide`, `ready`, `search`, `use_object`, `use_magic_item`, `use_special_ability`

---

## Opportunity Attack Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   MOVEMENT TRIGGER                          │
├─────────────────────────────────────────────────────────────┤
│  Actor at position A requests move to position B            │
│                                                             │
│  For each enemy in encounter:                               │
│  ├─ Was actor in enemy's reach at A?                       │
│  ├─ Is actor leaving enemy's reach?                        │
│  ├─ Did actor Disengage this turn?                         │
│  └─ Does enemy have reaction available?                    │
│                                                             │
│  If all YES → Enemy gets opportunity attack                 │
│  └─ Enemy rolls attack (advantage if target prone)         │
│  └─ If hit → Apply damage to moving actor                  │
│  └─ Continue movement (unless incapacitated)               │
╚═════════════════════════════════════════════════════════════╝
```

Uses: `measure_distance` (✅), `roll_check` (✅), `update_character` (✅)

---

## State Changes per Action

| Action | Modifies | Dependencies |
|--------|----------|--------------|
| attack | target.hp, attacker.reaction (if OA) | roll_check, update_character |
| dash | actor.movementRemaining ×2 | None |
| disengage | actor.disengagedThisTurn = true | None |
| dodge | actor.conditions.add('dodging') | manage_condition |
| grapple | target.conditions.add('grappled'), actor.speed = halved | roll_check, manage_condition |
| shove | target.position OR target.conditions.add('prone') | roll_check, manage_condition |
| cast_spell | actor.spellSlots, possibly concentration | manage_spell_slots* |
| ready | actor.readiedAction = {trigger, action} | None |

---

## New Enums Needed (for src/types.ts)

```typescript
// Action Economy
export const ActionCostSchema = z.enum([
  'action',
  'bonus_action', 
  'reaction',
  'free',
  'movement',
]);
export type ActionCost = z.infer<typeof ActionCostSchema>;

// Weapon Categories
export const WeaponTypeSchema = z.enum([
  'melee',
  'ranged',
  'melee_finesse',
  'ranged_thrown',
]);
export type WeaponType = z.infer<typeof WeaponTypeSchema>;

// Attack Result (for output)
export const AttackResultSchema = z.enum([
  'hit',
  'miss', 
  'critical_hit',
  'critical_miss',
]);
export type AttackResult = z.infer<typeof AttackResultSchema>;

// Shove Options
export const ShoveDirectionSchema = z.enum([
  'away',   // Push 5ft away
  'prone',  // Knock prone
]);
export type ShoveDirection = z.infer<typeof ShoveDirectionSchema>;
```

---

## Consequences

### Positive
- Uses existing enum pattern for LLM menu selection
- Phased approach validates attack loop early
- All Phase 1 dependencies are ready (8 tools, 213 tests)

### Negative
- Initial implementation lacks spell slot tracking
- Turn order requires manual management until `advance_turn`

### Risks
- Opportunity attack logic is complex
- Concentration breaking needs `manage_spell_slots`

---

## Recommended Next Steps

1. **Architect:** Add new enums to `src/types.ts` (ActionCost, WeaponType, etc.)
2. **Red Phase:** Write failing tests for `execute_action` (attack only)
3. **Green Phase:** Implement minimal attack handler
4. **Blue Phase:** Refactor with ASCII output, opportunity attacks

---

## References

- [src/types.ts](../src/types.ts) - Existing enum schemas
- [SYSTEM-INTERSECTIONS.md](./SYSTEM-INTERSECTIONS.md) - Cross-module patterns
- [RPG-MCP-LITE-FEATURES.md](./RPG-MCP-LITE-FEATURES.md) - Full action list

---

_ADR-001 | execute_action Dependencies | Menu-Driven Enum Design_  
_Last Updated: 2025-12-18_
