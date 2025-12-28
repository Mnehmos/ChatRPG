# RPG-MCP Lite: Design Specification

## Lightweight D&D 5e Engine • 48 Core Tools • Modular Architecture

---

## Design Philosophy

**WHAT WE'RE BUILDING:**  
A text-only LLM-as-DM engine with full D&D 5e action economy, focused on tactical combat and session management. No procedural overworld generation—locations are narrative constructs.

**WHAT WE'RE REMOVING:**

- Perlin noise world generation
- Grand Strategy (nations, diplomacy, turn management)
- Corpse/Loot tables system (DM handles narratively)
- Theft provenance tracking
- Event inbox system
- Complex workflow orchestration

**WHAT WE'RE KEEPING:**

- Full combat with spatial awareness
- D&D 5e action economy
- Conditions, boons, curses
- Spellcasting with concentration
- Skill checks and saves
- Character & Party management
- Session notes and memory

---

## Architecture: Three Modules

```
┌─────────────────────────────────────────────────────────────┐
│                     RPG-MCP LITE                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   COMBAT    │  │   SPATIAL   │  │    MAGIC    │          │
│  │   MODULE    │  │   MODULE    │  │   MODULE    │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
├─────────────────────────────────────────────────────────────┤
│                     DATA LAYER                              │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
│  │Characters │ │ Sessions  │ │ Locations │ │   Items   │   │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘   │
├─────────────────────────────────────────────────────────────┤
│                    TOOL SURFACE                             │
│         49 Tools • Meticulous Zod Schemas                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Tool Inventory (48 Tools)

### Module 1: COMBAT (15 tools)

| #   | Tool                  | Description                                                           |
| --- | --------------------- | --------------------------------------------------------------------- |
| 1   | `create_encounter`    | Initialize combat with participants, positions, terrain               |
| 2   | `get_encounter`       | Get current encounter state                                           |
| 3   | `execute_action`      | Unified action handler (Supports Batching: attack, spell, dash, etc.) |
| 4   | `advance_turn`        | Progress to next combatant                                            |
| 5   | `end_encounter`       | Conclude combat, cleanup                                              |
| 6   | `roll_initiative`     | Roll/set initiative for combatants                                    |
| 7   | `apply_damage`        | Deal damage (with type, resistance/immunity/vulnerability)            |
| 8   | `apply_healing`       | Restore HP                                                            |
| 9   | `roll_death_save`     | D20 death saving throw                                                |
| 10  | `manage_condition`    | Add/remove/query conditions (blind, charmed, etc.)                    |
| 11  | `manage_effect`       | Add/remove custom boons/curses/effects                                |
| 12  | `move_combatant`      | Move creature (with difficult terrain, opportunity attacks)           |
| 13  | `render_battlefield`  | ASCII visualization of combat grid                                    |
| 14  | `modify_terrain`      | Add/remove obstacles, difficult terrain, water, hazards               |
| 15  | `execute_lair_action` | Boss lair actions at init 20                                          |

### Module 2: SPATIAL (8 tools)

| #   | Tool                     | Description                                               |
| --- | ------------------------ | --------------------------------------------------------- |
| 16  | `calculate_aoe`          | Area of Effect: line, cone, cube, sphere, cylinder        |
| 17  | `measure_distance`       | Distance between points/entities (feet/squares)           |
| 18  | `check_line_of_sight`    | LoS with cover calculation (none/half/3-4/full)           |
| 19  | `get_creatures_in_range` | Find all creatures within X feet of point                 |
| 20  | `check_cover`            | Determine cover between attacker and target               |
| 21  | `place_prop`             | Place interactive object (climbable, destructible, cover) |
| 22  | `calculate_movement`     | Path cost with difficult terrain, flying, jumping         |
| 23  | `get_adjacent_squares`   | Get squares adjacent to a point/creature                  |

### Module 3: MAGIC (10 tools)

| #   | Tool                  | Description                                                   |
| --- | --------------------- | ------------------------------------------------------------- |
| 24  | `cast_spell`          | Full spell resolution (slot, DC, attack, save, concentration) |
| 25  | `check_concentration` | CON save after damage                                         |
| 26  | `break_concentration` | Manual concentration break                                    |
| 27  | `get_concentration`   | Query active concentration                                    |
| 28  | `manage_spell_slots`  | View/expend/restore spell slots                               |
| 29  | `use_scroll`          | Spell scroll usage (with Arcana check if needed)              |
| 30  | `create_aura`         | Persistent area effect (Spirit Guardians, Paladin auras)      |
| 31  | `process_aura`        | Trigger aura effects on movement/turn start                   |
| 32  | `synthesize_spell`    | Arcane Synthesis for improvised magic                         |
| 33  | `get_spell_info`      | Query spell database                                          |

### Module 4: CHARACTERS (8 tools)

| #   | Tool               | Description                                    |
| --- | ------------------ | ---------------------------------------------- |
| 34  | `create_character` | Full character with class/race/stats/equipment |
| 35  | `get_character`    | Retrieve character sheet                       |
| 36  | `update_character` | Modify character properties                    |
| 37  | `list_characters`  | Query characters (by type, party, etc.)        |
| 38  | `delete_character` | Remove character                               |
| 39  | `roll_check`       | Skill check, ability check, or saving throw    |
| 40  | `roll_dice`        | Full dice suite (e.g. "4d6kh3", batch rolls)   |
| 41  | `take_rest`        | Short or long rest (healing, slot recovery)    |
| 42  | `level_up`         | Increase level, update HP/slots                |

### Module 5: DATA (7 tools)

| #   | Tool                  | Description                                 |
| --- | --------------------- | ------------------------------------------- |
| 42  | `manage_inventory`    | Give/take/equip/unequip items               |
| 43  | `manage_party`        | Create/update party, add/remove members     |
| 44  | `create_location`     | Define a narrative location (room, area)    |
| 45  | `get_location`        | Retrieve location details                   |
| 46  | `add_session_note`    | Plot threads, canonical moments, NPC voices |
| 47  | `search_notes`        | Query session notes by type/tag/text        |
| 48  | `get_session_context` | Aggregated context for LLM prompt           |

---

## D&D 5e Coverage

### Conditions (Full PHB List)

```typescript
type Condition =
  | "blinded"
  | "charmed"
  | "deafened"
  | "frightened"
  | "grappled"
  | "incapacitated"
  | "invisible"
  | "paralyzed"
  | "petrified"
  | "poisoned"
  | "prone"
  | "restrained"
  | "stunned"
  | "unconscious"
  | "exhaustion";
```

### Actions (Full Action Economy)

```typescript
type Action =
  | "attack"
  | "cast_spell"
  | "dash"
  | "disengage"
  | "dodge"
  | "help"
  | "hide"
  | "ready"
  | "search"
  | "use_object"
  | "use_magic_item"
  | "use_special_ability";

type BonusAction =
  | "offhand_attack"
  | "cunning_action"
  | "spell"
  | "class_feature";
type Reaction =
  | "opportunity_attack"
  | "readied_action"
  | "spell"
  | "class_feature";
```

### Movement

```typescript
interface MovementContext {
  speed: number; // Base speed in feet
  difficult_terrain: boolean;
  flying: boolean;
  swimming: boolean;
  climbing: boolean;
  jump_type?: "long" | "high";
  jump_running?: boolean;
  prone_movement?: boolean;
}
```

### Cover Types

```typescript
type Cover = "none" | "half" | "three_quarters" | "full";
// half: +2 AC, +2 Dex saves
// three_quarters: +5 AC, +5 Dex saves
// full: Cannot be targeted directly
```

### Damage Types

```typescript
type DamageType =
  | "slashing"
  | "piercing"
  | "bludgeoning"
  | "fire"
  | "cold"
  | "lightning"
  | "thunder"
  | "acid"
  | "poison"
  | "necrotic"
  | "radiant"
  | "force"
  | "psychic";
```

### Light Levels

```typescript
type Light = "bright" | "dim" | "darkness" | "magical_darkness";
```

---

## Reference Tables (Embedded in Tool Descriptions)

### Damage by Level & Severity

| Severity  | Level 1-4 | Level 5-10 | Level 11-16 | Level 17-20 |
| --------- | --------- | ---------- | ----------- | ----------- |
| Setback   | 1d10      | 2d10       | 4d10        | 10d10       |
| Dangerous | 2d10      | 4d10       | 10d10       | 18d10       |
| Deadly    | 4d10      | 10d10      | 18d10       | 24d10       |

### Object HP by Size

| Size   | Fragile  | Resilient |
| ------ | -------- | --------- |
| Tiny   | 2 (1d4)  | 5 (2d4)   |
| Small  | 3 (1d6)  | 10 (3d6)  |
| Medium | 4 (1d8)  | 18 (4d8)  |
| Large  | 5 (1d10) | 27 (5d10) |

### Object AC by Material

| Material            | AC  |
| ------------------- | --- |
| Cloth, paper, rope  | 11  |
| Crystal, glass, ice | 13  |
| Wood, bone          | 15  |
| Stone               | 17  |
| Iron, steel         | 19  |
| Mithral             | 21  |
| Adamantine          | 23  |

### Travel Pace

| Pace   | Distance/Hour | Distance/Day | Effect                |
| ------ | ------------- | ------------ | --------------------- |
| Fast   | 4 miles       | 30 miles     | -5 passive Perception |
| Normal | 3 miles       | 24 miles     | —                     |
| Slow   | 2 miles       | 18 miles     | Can stealth           |

### Services

| Service              | Cost      |
| -------------------- | --------- |
| Coach cab (city)     | 1 cp      |
| Hireling (untrained) | 2 sp/day  |
| Hireling (skilled)   | 2 gp/day  |
| Messenger            | 2 cp/mile |
| Road/gate toll       | 1 cp      |
| Ship passage         | 1 sp/mile |

### Food, Drink, Lodging

| Item                                                       | Cost                                    |
| ---------------------------------------------------------- | --------------------------------------- |
| Ale (gallon/mug)                                           | 2 sp / 4 cp                             |
| Inn (squalid/poor/modest/comfortable/wealthy/aristocratic) | 7 cp / 1 sp / 5 sp / 8 sp / 2 gp / 4 gp |
| Meals                                                      | 3 cp - 8 sp                             |
| Wine                                                       | 2 sp - 10 gp                            |

---

## Schema Design: `execute_action` Example

```typescript
const executeActionSchema = z.object({
  encounterId: z.string(),
  actorId: z.string(),
  action: z.enum([
    "attack",
    "cast_spell",
    "dash",
    "disengage",
    "dodge",
    "help",
    "hide",
    "ready",
    "search",
    "use_object",
    "use_magic_item",
    "use_special_ability",
    "shove",
    "grapple",
  ]),

  // Attack-specific
  targetId: z.string().optional(),
  attackBonus: z.number().optional(),
  damage: z.string().optional(), // "2d6+4"
  damageType: DamageTypeSchema.optional(),
  advantage: z.boolean().optional(),
  disadvantage: z.boolean().optional(),

  // Spell-specific
  spellName: z.string().optional(),
  spellSlot: z.number().min(1).max(9).optional(),
  targetIds: z.array(z.string()).optional(), // For AoE
  targetPosition: PositionSchema.optional(),

  // Movement within action (shove/grapple result)
  forceMovement: z
    .object({
      targetId: z.string(),
      direction: z.enum(["away", "toward", "left", "right"]),
      distance: z.number(),
    })
    .optional(),

  // Ready action
  trigger: z.string().optional(),
  readiedAction: z.string().optional(),

  // Special ability
  abilityName: z.string().optional(),
  abilityDetails: z.record(z.any()).optional(),
});
```

---

## Schema Design: `manage_condition` Example

```typescript
const manageConditionSchema = z.object({
  characterId: z.string(),
  operation: z.enum(["add", "remove", "query", "tick"]),

  // For add
  condition: ConditionSchema.optional(),
  source: z.string().optional(), // "Blindness/Deafness spell"
  duration: z
    .union([
      z.number(), // Rounds
      z.literal("concentration"),
      z.literal("until_dispelled"),
      z.literal("until_rest"),
    ])
    .optional(),

  // For exhaustion specifically
  exhaustionLevels: z.number().min(1).max(6).optional(),

  // For remove
  removeAll: z.boolean().optional(), // Remove all instances

  // For tick (end of turn processing)
  roundNumber: z.number().optional(),
});

// Response includes all active conditions with metadata
```

---

## Schema Design: `calculate_aoe` Example

```typescript
const calculateAoeSchema = z.object({
  encounterId: z.string(),

  shape: z.enum(["line", "cone", "cube", "sphere", "cylinder"]),

  origin: PositionSchema, // Point of origin

  // Shape-specific
  length: z.number().optional(), // Line, Cone
  width: z.number().optional(), // Line (default 5ft)
  radius: z.number().optional(), // Sphere, Cylinder, Cone angle
  sideLength: z.number().optional(), // Cube
  height: z.number().optional(), // Cylinder

  direction: z
    .object({
      // For line/cone
      x: z.number(),
      y: z.number(),
    })
    .optional(),

  // Options
  includeOrigin: z.boolean().default(false),
  ignoreIds: z.array(z.string()).optional(), // Don't count these
});

// Returns: { affectedTiles: Position[], affectedCreatures: string[] }
```

---

## Migration Path

### From rpg-mcp to rpg-mcp-lite

| rpg-mcp Tool                                                    | Lite Equivalent       | Notes              |
| --------------------------------------------------------------- | --------------------- | ------------------ |
| `create_encounter`                                              | `create_encounter`    | Simplified terrain |
| `execute_combat_action`                                         | `execute_action`      | Unified actions    |
| `update_character` + `add_condition`                            | `manage_condition`    | Consolidated       |
| `apply_custom_effect`                                           | `manage_effect`       | Renamed            |
| `calculate_aoe`                                                 | `calculate_aoe`       | Same               |
| `measure_distance`                                              | `measure_distance`    | Same               |
| `cast_spell` (via execute)                                      | `cast_spell`          | Dedicated tool     |
| `roll_skill_check` + `roll_ability_check` + `roll_saving_throw` | `roll_check`          | Unified            |
| `take_long_rest` + `take_short_rest`                            | `take_rest`           | Unified            |
| `give_item` + `remove_item` + `equip_item`                      | `manage_inventory`    | Consolidated       |
| `create_party` + `add_party_member`                             | `manage_party`        | Consolidated       |
| `add_narrative_note`                                            | `add_session_note`    | Renamed            |
| `get_narrative_context`                                         | `get_session_context` | Renamed            |

### Removed (Handled Narratively by DM)

- All worldgen tools (Perlin, biomes, rivers)
- All grand strategy tools (nations, diplomacy)
- Corpse/loot table system
- Theft provenance
- Event inbox
- POI discovery system
- Workflow orchestration

---

## Implementation Priority

### Phase 1: Combat Core (MVP)

1. `create_encounter`
2. `execute_action`
3. `advance_turn`
4. `apply_damage`
5. `manage_condition`
6. `roll_check`
7. `render_battlefield`

### Phase 2: Spatial

8. `calculate_aoe`
9. `measure_distance`
10. `check_line_of_sight`
11. `check_cover`
12. `move_combatant`

### Phase 3: Magic

13. `cast_spell`
14. `check_concentration`
15. `manage_spell_slots`
16. `create_aura`

### Phase 4: Data Layer

17. `create_character`
18. `manage_inventory`
19. `manage_party`
20. `add_session_note`
21. `get_session_context`

### Phase 5: Polish

- Remaining tools
- Reference table integration
- Schema refinement

---

## File Structure

```
rpg-mcp-lite/
├── src/
│   ├── index.ts              # Server entry
│   ├── modules/
│   │   ├── combat/
│   │   │   ├── tools.ts      # Combat tool definitions
│   │   │   ├── engine.ts     # Combat state machine
│   │   │   └── conditions.ts # Condition effects
│   │   ├── spatial/
│   │   │   ├── tools.ts
│   │   │   ├── geometry.ts   # AoE shapes, LoS
│   │   │   └── grid.ts       # Grid utilities
│   │   └── magic/
│   │       ├── tools.ts
│   │       ├── spells.ts     # Spell database
│   │       └── concentration.ts
│   ├── data/
│   │   ├── tools.ts          # Character, inventory, party tools
│   │   ├── session.ts        # Session notes
│   │   └── reference.ts      # D&D 5e tables
│   ├── schema/
│   │   ├── combat.ts
│   │   ├── spatial.ts
│   │   ├── magic.ts
│   │   ├── character.ts
│   │   └── session.ts
│   └── storage/
│       ├── db.ts             # SQLite setup
│       └── repos/            # Repository pattern
├── tests/
├── package.json
└── tsconfig.json
```

---

## Phase 1 Completion Report (2025-12-17)

### ✅ Completed Systems

**6 Core Tools Operational (112/112 tests passing):**
1. `roll_dice` - Full dice notation support + batch rolling (up to 20)
2. `create_character` - D&D 5e character creation with ASCII art output
3. `get_character` - Character sheets with **condition integration**
4. `update_character` - Batch updates + relative HP ("+10", "-15")
5. `manage_condition` - Full D&D 5e condition system with mechanical effects
6. `measure_distance` - Spatial calculations

### 🎯 Key Architectural Decisions Made

**1. Effective Stats Pattern (CRITICAL)**

Established the "base → effective" calculation pattern for ALL stat modifications:

```typescript
interface EffectiveStatCalculation {
  base: number;           // Original from character sheet
  effective: number;      // After modifiers
  modified: boolean;      // Was it changed?
  modifiers: string[];    // Human-readable explanations
}
```

**Why This Matters:** This pattern must be replicated for:
- Equipment bonuses (armor, weapons, magic items)
- Custom effects (boons, curses)
- Spell effects (Mage Armor, Shield, Haste)
- Environmental effects (altitude, underwater)

**2. Condition System = Blueprint for All Modifiers**

`manage_condition` established:
- Generic `ConditionEffect` interface (extensible to custom effects)
- Mechanical effects: HP/speed/AC modifiers, advantage/disadvantage
- Character integration: `getActiveConditions()`, `calculateEffectiveStats()`
- Display integration: `get_character` shows base vs effective stats

**Implications:**
- `manage_effect` (boons/curses) should use SAME interface
- Equipment bonuses should use SAME calculation
- ALL systems that modify stats should export similar functions

**3. Batch Operations = First-Class Citizens**

Pattern: `single_input OR { batch: single_input[] }`

Implemented in:
- `roll_dice`: Roll multiple expressions in one call
- `update_character`: Update multiple characters (e.g., AoE damage)
- `manage_condition`: Batch add/remove/query conditions

**To Extend To:**
- `execute_action` (multi-target attacks)
- `apply_damage` (AoE spells)
- `manage_inventory` (loot distribution)
- `manage_spell_slots` (rest affects whole party)

**4. Character Names > IDs**

All tools now accept `characterName` OR `characterId` for better UX.

**Status:**
- ✅ manage_condition
- ✅ update_character
- ✅ get_character
- ⬜ Roll out to ALL character-referencing tools

**5. Persistence Strategy: JSON First**

**Decided:** Use JSON files in AppData, defer SQLite to Phase 2

**Current:**
- ✅ Characters: JSON per character
- ❌ Conditions: In-memory (BUG - lost on restart)
- ⬜ Encounters: Not implemented
- ⬜ Equipment: Not implemented
- ⬜ Session notes: Not implemented

**Critical Fix Required:** Persist condition store to `conditions.json`

---

## Critical Intersections Identified

**See: [SYSTEM-INTERSECTIONS.md](./SYSTEM-INTERSECTIONS.md)**

Key findings:
1. **Damage → Concentration**: apply_damage must call check_concentration
2. **0 HP → Unconscious**: apply_damage must add condition
3. **Incapacitated → Break Concentration**: condition system needs magic system hooks
4. **Rest → Multi-System**: take_rest orchestrates 5+ different systems
5. **Equipment → Stats**: Must use same effective stats pattern as conditions

---

## Open Questions

1. **Creature presets**: Keep inline in tool descriptions or separate lookup?
2. **Spell database**: Full 5e SRD or just structure + lookup tool?
3. **Session persistence**: Confirmed JSON, but when to migrate to SQLite?
4. **Meta-tools**: Keep `search_tools` / `load_tool_schema` pattern?
5. **Condition Persistence**: Save on every change or batch at intervals?

---

_Version: 0.2.0-design (Post-Condition System)_
_Author: Mnehmos + Claude_
_Date: 2025-12-17_
