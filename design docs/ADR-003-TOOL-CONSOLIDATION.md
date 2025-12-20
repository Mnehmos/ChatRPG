# ADR-003: Deep Tool Consolidation Audit

**Status:** PROPOSED  
**Date:** 2025-12-19  
**Deciders:** Orchestrator, Architect  
**Depends On:** ADR-001 (execute_action patterns), ADR-002 (manage_inventory consolidation)

---

## Executive Summary

This ADR proposes reducing the RPG-Lite MCP tool count from **50 → 35 tools** (30% reduction) through three consolidation strategies:

1. **Batch Consolidation** - Tools supporting `single_input OR { batch: [...] }` pattern
2. **Composite Tools** - Multiple tools merged into one with enum-based operation types
3. **Absorption** - Tools fully removed, functionality absorbed by existing tools

| Module     | Before | After | Change |
|------------|--------|-------|--------|
| Combat     | 14     | 9     | -5     |
| Characters | 11     | 9     | -2     |
| Magic      | 8      | 5     | -3     |
| Spatial    | 7      | 6     | -1     |
| Data       | 10     | 6     | -4     |
| **TOTAL**  | **50** | **35** | **-15** |

---

## Consolidation Patterns Reference

### Pattern 1: Batch Support
```typescript
// Tool accepts single OR batch input
const ToolSchema = z.union([
  SingleInputSchema,
  z.object({ batch: z.array(SingleInputSchema).min(1).max(20) }),
]);
```

**Already Implemented:** `roll_dice`, `update_character`, `manage_condition`, `get_character`

### Pattern 2: Composite Tool (Enum Operations)
```typescript
// Tool uses operation enum for different actions
const CompositeToolSchema = z.object({
  operation: z.enum(['create', 'read', 'update', 'delete']),
  // operation-specific fields via discriminated union
});
```

**Already Implemented:** `execute_action` (14 ActionTypes), `manage_condition` (4 operations), `manage_inventory` (7 operations per ADR-002)

### Pattern 3: Character Resolution
```typescript
// Accept ID or Name
const CharacterTargetSchema = z.object({
  characterId: z.string().optional(),
  characterName: z.string().optional(),
}).refine(data => data.characterId || data.characterName);
```

**Already Implemented:** `update_character`, `get_character`, `roll_check`, `manage_condition`

---

## Module 1: Combat (14 → 9 tools)

### Final Tool List

| # | Tool | Status | Notes |
|---|------|--------|-------|
| 1 | `create_encounter` | ✅ KEEP | Creates combat with participants |
| 2 | `get_encounter` | 🔄 ENHANCED | Add `verbosity` enum, absorbs `get_encounter_summary` |
| 3 | `execute_action` | ✅ KEEP | Hub with batch support, 14 action types |
| 4 | `advance_turn` | 🔄 ENHANCED | Integrates aura processing from `process_aura` |
| 5 | `roll_death_save` | ✅ KEEP | Death saving throw mechanics |
| 6 | `manage_condition` | ✅ KEEP | Already has batch + operation enum |
| 7 | `render_battlefield` | ✅ KEEP | ASCII grid visualization |
| 8 | `modify_terrain` | ✅ KEEP | Mid-combat terrain changes |
| 9 | `end_encounter` | ✅ KEEP | Combat cleanup + HP sync |

### Absorbed Tools

| Old Tool | Absorbed Into | Via |
|----------|---------------|-----|
| `get_encounter_summary` | `get_encounter` | `verbosity: 'summary'` enum |
| `batch_execute_action` | `execute_action` | `{ batch: [...] }` pattern |
| `resolve_attack` | `execute_action` | `actionType: 'attack'` |
| `apply_damage` | `execute_action` / `update_character` | Attack action or HP delta |
| `process_aura` | `advance_turn` | Aura tick on turn advance |

### Enum Schemas

#### GetEncounterVerbositySchema
```typescript
export const EncounterVerbositySchema = z.enum([
  'minimal',   // ID, round, current turn only
  'summary',   // + participant list, HP percentages
  'standard',  // + full HP, conditions, positions
  'detailed',  // + terrain, lighting, action history
]);
export type EncounterVerbosity = z.infer<typeof EncounterVerbositySchema>;

// Enhanced get_encounter schema
export const GetEncounterSchema = z.object({
  encounterId: z.string(),
  verbosity: EncounterVerbositySchema.default('standard'),
});
```

#### ExecuteActionSchema (existing, add batch)
```typescript
// Already has ActionTypeSchema with 14 options
export const ExecuteActionBatchSchema = z.union([
  ExecuteActionSchema,
  z.object({
    batch: z.array(ExecuteActionSchema).min(1).max(20),
  }),
]);
```

---

## Module 2: Characters (11 → 9 tools)

### Final Tool List

| # | Tool | Status | Notes |
|---|------|--------|-------|
| 1 | `roll_dice` | ✅ KEEP | Already has batch support |
| 2 | `create_character` | ✅ KEEP | Character creation |
| 3 | `get_character` | 🔄 ENHANCED | Add `filter` for list functionality |
| 4 | `update_character` | ✅ KEEP | Already has batch + HP delta |
| 5 | `delete_character` | ✅ KEEP | Character removal |
| 6 | `roll_check` | ✅ KEEP | Skill/ability/save checks |
| 7 | `manage_effect` | ✅ KEEP | Boons/curses (persistent effects) |
| 8 | `take_rest` | ✅ KEEP | Short/long rest mechanics |
| 9 | `level_up` | ✅ KEEP | Level advancement |

### Absorbed Tools

| Old Tool | Absorbed Into | Via |
|----------|---------------|-----|
| `list_characters` | `get_character` | `filter` object or `listAll: true` |
| `quick_roll` | `roll_dice` | Already supports simple expressions |
| `fetch_character_template` | `create_character` | `previewTemplate: true` flag |

### Enum Schemas

#### GetCharacterFilterSchema
```typescript
export const GetCharacterFilterSchema = z.object({
  characterId: z.string().optional(),
  characterName: z.string().optional(),
  // List mode options
  listAll: z.boolean().optional(),
  filter: z.object({
    type: z.enum(['pc', 'npc', 'enemy', 'neutral']).optional(),
    class: z.string().optional(),
    minLevel: z.number().optional(),
    maxLevel: z.number().optional(),
    hasCondition: ConditionSchema.optional(),
  }).optional(),
}).refine(
  data => data.characterId || data.characterName || data.listAll || data.filter,
  { message: 'Specify target character OR use listAll/filter' }
);
```

---

## Module 3: Magic (8 → 5 tools)

### Final Tool List

| # | Tool | Status | Notes |
|---|------|--------|-------|
| 1 | `manage_concentration` | 🆕 NEW | Composite: check, break, get, set |
| 2 | `manage_spell_slots` | ✅ KEEP | Slot tracking with batch |
| 3 | `use_scroll` | ✅ KEEP | Scroll usage mechanics |
| 4 | `manage_aura` | 🆕 NEW | Composite: create, process, remove |
| 5 | `synthesize_spell` | ✅ KEEP | Improvised magic |

### Absorbed Tools

| Old Tool | Absorbed Into | Via |
|----------|---------------|-----|
| `check_concentration` | `manage_concentration` | `operation: 'check'` |
| `break_concentration` | `manage_concentration` | `operation: 'break'` |
| `get_concentration` | `manage_concentration` | `operation: 'get'` |
| `create_aura` | `manage_aura` | `operation: 'create'` |
| `process_aura` | `manage_aura` | `operation: 'process'` (also in `advance_turn`) |

### Enum Schemas

#### ManageConcentrationSchema
```typescript
export const ConcentrationOperationSchema = z.enum([
  'check',   // Roll concentration save after damage
  'break',   // Force break concentration (manual)
  'get',     // Query current concentration state
  'set',     // Set concentration on a spell (internal use)
]);
export type ConcentrationOperation = z.infer<typeof ConcentrationOperationSchema>;

export const ManageConcentrationSchema = z.object({
  // Character targeting
  characterId: z.string().optional(),
  characterName: z.string().optional(),
  
  // Operation selection
  operation: ConcentrationOperationSchema,
  
  // Operation-specific fields
  damageAmount: z.number().optional(),  // For 'check'
  spellName: z.string().optional(),     // For 'set'
  reason: z.string().optional(),        // For 'break'
}).refine(
  data => data.characterId || data.characterName,
  { message: 'characterId or characterName required' }
);
```

#### ManageAuraSchema
```typescript
export const AuraOperationSchema = z.enum([
  'create',   // Create new aura centered on character
  'process',  // Process aura effects for targets in range
  'remove',   // Remove an aura
  'list',     // List active auras
]);
export type AuraOperation = z.infer<typeof AuraOperationSchema>;

export const ManageAuraSchema = z.object({
  operation: AuraOperationSchema,
  
  // For create
  ownerId: z.string().optional(),
  spellName: z.string().optional(),
  radius: z.number().optional(),
  duration: z.number().optional(),
  effect: z.string().optional(),
  damageType: DamageTypeSchema.optional(),
  saveDC: z.number().optional(),
  saveAbility: AbilitySchema.optional(),
  
  // For process
  encounterId: z.string().optional(),
  
  // For remove
  auraId: z.string().optional(),
});
```

---

## Module 4: Spatial (7 → 6 tools)

### Final Tool List

| # | Tool | Status | Notes |
|---|------|--------|-------|
| 1 | `measure_distance` | ✅ KEEP | Grid distance calculation |
| 2 | `calculate_aoe` | ✅ KEEP | Area of effect calculations |
| 3 | `check_line_of_sight` | ✅ KEEP | LoS with obstacles |
| 4 | `check_cover` | ✅ KEEP | Cover AC/Dex bonuses |
| 5 | `place_prop` | ✅ KEEP | Add terrain features |
| 6 | `calculate_movement` | 🔄 ENHANCED | Add adjacent squares mode |

### Absorbed Tools

| Old Tool | Absorbed Into | Via |
|----------|---------------|-----|
| `get_adjacent_squares` | `calculate_movement` | `mode: 'adjacent'` |

### Enum Schemas

#### CalculateMovementModeSchema
```typescript
export const MovementModeSchema = z.enum([
  'path',      // Calculate path from A to B with terrain
  'reach',     // All reachable squares from position
  'adjacent',  // Simple 8-square adjacency check
]);
export type MovementMode = z.infer<typeof MovementModeSchema>;

export const CalculateMovementSchema = z.object({
  encounterId: z.string(),
  
  // Mode selection
  mode: MovementModeSchema.default('path'),
  
  // Common
  fromPosition: PositionSchema.optional(),
  combatantId: z.string().optional(),
  
  // For 'path' mode
  toPosition: PositionSchema.optional(),
  
  // For 'reach' mode
  movementRemaining: z.number().optional(),
  
  // Options
  ignoreDifficultTerrain: z.boolean().optional(),
  ignoreOpportunityAttacks: z.boolean().optional(),
});
```

---

## Module 5: Data (10 → 6 tools)

### Final Tool List

| # | Tool | Status | Notes |
|---|------|--------|-------|
| 1 | `create_location` | ✅ KEEP | Create room nodes |
| 2 | `get_location` | ✅ KEEP | Retrieve room + edges |
| 3 | `manage_room_connections` | 🆕 NEW | Composite: link, unlink, list |
| 4 | `move_party` | ✅ KEEP | Party traversal |
| 5 | `manage_party` | ✅ KEEP | Party membership |
| 6 | `manage_inventory` | ✅ KEEP | Per ADR-002 (7 operations) |
| 7 | `manage_notes` | 🆕 NEW | Composite: add, search, delete |
| 8 | `get_session_context` | ✅ KEEP | Aggregated context |

Wait - that's 8, not 6. Let me reconsider...

Actually, looking at the original Data module more carefully:

Original (10):
1. create_location
2. get_location
3. move_party
4. manage_inventory
5. manage_party
6. add_session_note
7. search_notes
8. get_session_context
9. link_rooms
10. unlink_rooms

After consolidation (6):
1. create_location
2. get_location
3. move_party
4. manage_inventory
5. manage_party
6. manage_notes (absorbs add_session_note, search_notes)
7. manage_room_connections (absorbs link_rooms, unlink_rooms)
8. get_session_context

Still 8. Let me look for more consolidation:

- `move_party` could be an operation of `manage_party`? No, semantically different (spatial vs membership)
- `create_location` and `get_location` could merge into `manage_location`? Yes!

Revised:
1. `manage_location` (create, get, update, delete)
2. `manage_room_connections` (link, unlink, list)
3. `move_party`
4. `manage_party`
5. `manage_inventory`
6. `manage_notes`
7. `get_session_context`

That's 7. Still not 6. Let me consider:
- `manage_room_connections` could be part of `manage_location`? Yes, link/unlink are location operations

Final Data (6):
1. `manage_location` (create, get, update, delete, link, unlink)
2. `move_party`
3. `manage_party`
4. `manage_inventory`
5. `manage_notes`
6. `get_session_context`

### Absorbed Tools

| Old Tool | Absorbed Into | Via |
|----------|---------------|-----|
| `create_location` | `manage_location` | `operation: 'create'` |
| `get_location` | `manage_location` | `operation: 'get'` |
| `link_rooms` | `manage_location` | `operation: 'link'` |
| `unlink_rooms` | `manage_location` | `operation: 'unlink'` |
| `add_session_note` | `manage_notes` | `operation: 'add'` |
| `search_notes` | `manage_notes` | `operation: 'search'` |

### Enum Schemas

#### ManageLocationSchema
```typescript
export const LocationOperationSchema = z.enum([
  'create',   // Create new room node
  'get',      // Retrieve room + edges
  'update',   // Update room properties
  'delete',   // Remove room
  'link',     // Create edge between rooms
  'unlink',   // Remove edge between rooms
]);
export type LocationOperation = z.infer<typeof LocationOperationSchema>;

export const ConnectionTypeSchema = z.enum([
  'door',
  'passage',
  'stairs',
  'ladder',
  'portal',
  'hidden',
]);
export type ConnectionType = z.infer<typeof ConnectionTypeSchema>;

export const ManageLocationSchema = z.object({
  operation: LocationOperationSchema,
  
  // For create/get/update/delete
  locationId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  lighting: LightSchema.optional(),
  tags: z.array(z.string()).optional(),
  
  // For link/unlink
  fromLocationId: z.string().optional(),
  toLocationId: z.string().optional(),
  connectionType: ConnectionTypeSchema.optional(),
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
  oneWay: z.boolean().optional(),
});
```

#### ManageNotesSchema
```typescript
export const NotesOperationSchema = z.enum([
  'add',      // Add a session note
  'search',   // Search notes by query/tags
  'get',      // Get specific note by ID
  'delete',   // Remove a note
  'list',     // List recent notes
]);
export type NotesOperation = z.infer<typeof NotesOperationSchema>;

export const ManageNotesSchema = z.object({
  operation: NotesOperationSchema,
  
  // For add
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  importance: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  
  // For search
  query: z.string().optional(),
  tagFilter: z.array(z.string()).optional(),
  
  // For get/delete
  noteId: z.string().optional(),
  
  // For list
  limit: z.number().optional(),
});
```

---

## Complete Tool Inventory (35 tools)

### Combat Module (9 tools)
1. `create_encounter` - Create combat encounter
2. `get_encounter` - Retrieve encounter state (with verbosity enum)
3. `execute_action` - Hub for all actions (with batch support)
4. `advance_turn` - Turn/round advancement
5. `roll_death_save` - Death saving throws
6. `manage_condition` - Condition CRUD (batch + operations)
7. `render_battlefield` - ASCII grid visualization
8. `modify_terrain` - Mid-combat terrain changes
9. `end_encounter` - Combat cleanup

### Characters Module (9 tools)
1. `roll_dice` - Dice rolling (batch support)
2. `create_character` - Character creation
3. `get_character` - Character retrieval (batch + filter/list)
4. `update_character` - Character updates (batch + HP delta)
5. `delete_character` - Character removal
6. `roll_check` - Skill/ability/save checks
7. `manage_effect` - Boons/curses management
8. `take_rest` - Rest mechanics
9. `level_up` - Level advancement

### Magic Module (5 tools)
1. `manage_concentration` - Concentration (check/break/get/set)
2. `manage_spell_slots` - Slot tracking
3. `use_scroll` - Scroll usage
4. `manage_aura` - Aura lifecycle (create/process/remove)
5. `synthesize_spell` - Improvised magic

### Spatial Module (6 tools)
1. `measure_distance` - Distance calculation
2. `calculate_aoe` - Area of effect
3. `check_line_of_sight` - LoS calculation
4. `check_cover` - Cover bonuses
5. `place_prop` - Terrain features
6. `calculate_movement` - Movement/pathing (with adjacent mode)

### Data Module (6 tools)
1. `manage_location` - Location CRUD + connections
2. `move_party` - Party traversal
3. `manage_party` - Party membership
4. `manage_inventory` - Item management (per ADR-002)
5. `manage_notes` - Session notes
6. `get_session_context` - Aggregated context

---

## Removal Summary

### ⚫ FULLY REMOVED (absorbed, no separate implementation needed)

| Tool | Absorbed Into | Rationale |
|------|---------------|-----------|
| `apply_damage` | `execute_action` / `update_character` | Damage is action outcome |
| `quick_roll` | `roll_dice` | Simple expressions already supported |
| `resolve_attack` | `execute_action` | Attack is an action type |
| `batch_execute_action` | `execute_action` | Batch pattern on main tool |
| `get_encounter_summary` | `get_encounter` | Verbosity parameter |
| `list_characters` | `get_character` | Filter/listAll parameter |
| `fetch_character_template` | `create_character` | Preview mode |
| `check_concentration` | `manage_concentration` | Operation enum |
| `break_concentration` | `manage_concentration` | Operation enum |
| `get_concentration` | `manage_concentration` | Operation enum |
| `create_aura` | `manage_aura` | Operation enum |
| `process_aura` | `manage_aura` / `advance_turn` | Operation enum |
| `get_adjacent_squares` | `calculate_movement` | Mode parameter |
| `create_location` | `manage_location` | Operation enum |
| `get_location` | `manage_location` | Operation enum |
| `link_rooms` | `manage_location` | Operation enum |
| `unlink_rooms` | `manage_location` | Operation enum |
| `add_session_note` | `manage_notes` | Operation enum |
| `search_notes` | `manage_notes` | Operation enum |

**Total Removed: 19 tools**

---

## Implementation Recommendations

### Priority Order

1. **Phase 1: Already Established**
   - `execute_action` - Add batch support ✅ (pattern exists)
   - `get_encounter` - Add verbosity enum
   - `get_character` - Add filter/listAll options

2. **Phase 2: New Composites**
   - `manage_concentration` - New composite tool
   - `manage_aura` - New composite tool
   - `manage_location` - New composite tool
   - `manage_notes` - New composite tool

3. **Phase 3: Enhanced Tools**
   - `calculate_movement` - Add adjacent mode
   - `advance_turn` - Integrate aura processing

### Backward Compatibility

For tools being absorbed, consider providing aliases during transition:
```typescript
// Alias for backward compatibility
server.tool('check_concentration', schema, async (input) => {
  return manageConcentration({ ...input, operation: 'check' });
});
```

---

## Consequences

### Positive
- 30% reduction in tool count (50 → 35)
- Consistent patterns across all modules
- Enum menus improve LLM usability (dropdown selections)
- Batch operations reduce multi-call overhead
- Cleaner mental model for developers

### Negative
- More complex schemas (discriminated unions)
- Slightly higher initial learning curve
- Backward compatibility aliases add code

### Risks
- Over-consolidation could hurt discoverability
- Some edge cases may require schema adjustments
- Test coverage must be updated for all consolidated tools

---

## Appendix: Complete Enum Registry

For reference, all enum schemas proposed in this ADR:

```typescript
// Combat
export const EncounterVerbositySchema = z.enum(['minimal', 'summary', 'standard', 'detailed']);

// Magic
export const ConcentrationOperationSchema = z.enum(['check', 'break', 'get', 'set']);
export const AuraOperationSchema = z.enum(['create', 'process', 'remove', 'list']);

// Spatial
export const MovementModeSchema = z.enum(['path', 'reach', 'adjacent']);

// Data
export const LocationOperationSchema = z.enum(['create', 'get', 'update', 'delete', 'link', 'unlink']);
export const ConnectionTypeSchema = z.enum(['door', 'passage', 'stairs', 'ladder', 'portal', 'hidden']);
export const NotesOperationSchema = z.enum(['add', 'search', 'get', 'delete', 'list']);
```

---

## References

- [ADR-001](./ADR-001-EXECUTE-ACTION-DEPENDENCIES.md) - execute_action patterns
- [ADR-002](./ADR-002-MANAGE-INVENTORY-SCHEMA.md) - manage_inventory consolidation
- [TOOLS_CHECKLIST.md](../TOOLS_CHECKLIST.md) - Current tool inventory
- [ORCHESTRATOR_PROMPT.md](../ORCHESTRATOR_PROMPT.md) - Redundancy analysis

---

_ADR-003 | Deep Tool Consolidation | 50 → 35 Tools_  
_Last Updated: 2025-12-19_
