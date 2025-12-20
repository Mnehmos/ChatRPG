# RPG-Lite MCP: Tool Schema Reference

## Living Documentation - Updated as Tools are Implemented

---

## 50 Core Tools (Consolidated)

### Combat Module (14 Tools)

- [x] `roll_dice` (Foundation)
- [ ] `create_encounter` (Auto-rolls initiative, supports templates)
- [ ] `get_encounter` (Full state JSON)
- [ ] `get_encounter_summary` [NEW] (Tactical narrative for LLM)
- [ ] `spawn_from_template` [NEW] (Clone monster stats)
- [ ] `execute_action` (Hub: Move, Attack, Heal, Spell, Lair)
- [ ] `batch_execute_action` [NEW] (Multiple actors/turns)
- [ ] `resolve_attack` [NEW] (High-level wrapper: roll->hit->damage->death)
- [ ] `advance_turn` (Condition ticks)
- [ ] `apply_damage` (Batch support)
- [ ] `roll_death_save` (Dramatic standalone)
- [ ] `manage_condition`
- [ ] `render_battlefield` (ASCII Map)
- [ ] `modify_terrain`
- [ ] `end_encounter` (HP sync to characters)

### Characters Module (11 Tools)

- [ ] `create_character`
- [ ] `get_character`
- [ ] `update_character`
- [ ] `list_characters`
- [ ] `delete_character`
- [ ] `roll_check`
- [ ] `quick_roll` [NEW] (Named presets)
- [ ] `take_rest`
- [ ] `level_up`
- [ ] `manage_effect` (Boons/Curses)
- [ ] `fetch_character_template` [NEW] (Base stat lookup)

### Magic Module (8 Tools)

- [ ] `check_concentration`
- [ ] `break_concentration`
- [ ] `get_concentration`
- [ ] `manage_spell_slots`
- [ ] `use_scroll`
- [ ] `create_aura`
- [ ] `process_aura`
- [ ] `synthesize_spell`

### Spatial Module (7 Tools)

- [ ] `calculate_aoe`
- [ ] `measure_distance`
- [ ] `check_line_of_sight`
- [ ] `check_cover`
- [ ] `place_prop`
- [ ] `calculate_movement`
- [ ] `get_adjacent_squares`

### Data Module (10 Tools)

- [ ] `create_location` (Node)
- [ ] `get_location` (Room data + edges)
- [ ] `move_party` (Traverse edge)
- [ ] `manage_inventory`
- [ ] `manage_party`
- [ ] `add_session_note`
- [ ] `search_notes`
- [ ] `get_session_context` (The "Brain Injection")
- [ ] `link_rooms` [NEW]
- [ ] `unlink_rooms` [NEW]

---

## Implemented Details

### 1. `roll_dice`

**Status:** 🟢 Implemented

**Description:** Roll dice using standard notation with keep/drop modifiers.

**Input Schema:**

```typescript
{
  expression: string;  // Required: "2d6+4", "1d20", "4d6kh3", "2d20kl1"
  reason?: string;     // Optional: "Attack roll", "Damage"
}
```

**Output Example:**

```markdown
🎲 **Roll:** `4d6kh3`
**Dice:** [6, 4, 3, 2] → kept [6, 4, 3]
**Total:** 13
_Reason: Stat generation_
```

**Implementation:** `src/modules/dice.ts` + `src/registry.ts`
**Tests:** `tests/combat/roll_dice.test.ts` (8 passing)

---

### 2. `manage_spell_slots`

**Status:** 🟢 Implemented (2025-12-19)

**Description:** View, expend, restore, or set spell slots for spellcasting characters. Supports full D&D 5e rules including full casters (Wizard, Sorcerer, Cleric, Druid, Bard), half casters (Paladin, Ranger), third casters (Eldritch Knight, Arcane Trickster), and Warlock Pact Magic.

**Input Schema:**

```typescript
// Single character operation
{
  characterId?: string;      // Character by ID (one of characterId/characterName required)
  characterName?: string;    // Character by name
  operation: 'view' | 'expend' | 'restore' | 'set';  // Required
  slotLevel?: number;        // 1-9, for expend/restore specific level
  count?: number;            // How many slots to expend/restore (default: 1)
  pactMagic?: boolean;       // Operate on warlock pact slots instead
  slots?: {                  // DM override: set exact slot configuration
    slot_1?: { current: number; max: number };
    slot_2?: { current: number; max: number };
    // ... up to slot_9
    pact?: { current: number; max: number; level: number };
  };
}

// Batch operation
{
  batch: Array<{
    characterId?: string;
    characterName?: string;
    operation: 'view' | 'expend' | 'restore' | 'set';
    slotLevel?: number;
    count?: number;
    pactMagic?: boolean;
    slots?: { /* same as above */ };
  }>;  // Up to 20 operations
}
```

**Operations:**

| Operation | Description | Required Params |
|-----------|-------------|-----------------|
| `view` | Display current spell slot state | character |
| `expend` | Use spell slots (casts spells) | character, slotLevel (optional for pact) |
| `restore` | Regain spell slots (rest, abilities) | character, slotLevel (optional) |
| `set` | DM override for specific values | character, slots |

**D&D 5e Spell Slot Progression:**

| Caster Type | Classes | Spell Levels | Notes |
|-------------|---------|--------------|-------|
| Full | Wizard, Sorcerer, Cleric, Druid, Bard | 1st-9th | Standard PHB progression |
| Half | Paladin, Ranger | 1st-5th | Delayed, starts at level 2 |
| Third | Eldritch Knight, Arcane Trickster | 1st-4th | Further delayed, subclass-based |
| Pact Magic | Warlock | 1st-5th | All slots same level, short rest recovery |

**Output Example (ASCII Art):**

```
╔══════════════════════════════════════════════════════════╗
║             ✨ SPELL SLOTS: Gandalf ✨                   ║
╠══════════════════════════════════════════════════════════╣
║  1st Level: ●●●○ (3/4)                                   ║
║  2nd Level: ●●○  (2/3)                                   ║
║  3rd Level: ●●●  (3/3)                                   ║
╠══════════════════════════════════════════════════════════╣
║  🔄 Expended 1 slot at level 1                           ║
╚══════════════════════════════════════════════════════════╝
```

**Warlock Pact Magic Example:**

```
╔══════════════════════════════════════════════════════════╗
║          ⚡ PACT MAGIC: Hexblade ⚡                       ║
╠══════════════════════════════════════════════════════════╣
║  Pact Slots (3rd): ◆◆◇ (2/3)                             ║
╠══════════════════════════════════════════════════════════╣
║  🔄 Expended 1 pact slot                                 ║
╚══════════════════════════════════════════════════════════╝
```

**Integration Points:**

- **take_rest:** Long rest → `restoreAllSpellSlots()`, Short rest → `restorePactSlots()`
- **execute_action:** `actionType: 'cast_spell'` validates slot availability and expends

**Exported Utilities:**

| Function | Purpose |
|----------|---------|
| `expendSpellSlot(charId, level, pactMagic?)` | Called by execute_action for cast_spell |
| `hasSpellSlot(charId, level, pactMagic?)` | Check if slot available |
| `restoreAllSpellSlots(charId)` | Long rest full recovery |
| `restorePactSlots(charId)` | Short rest warlock recovery |
| `getMaxSpellSlots(charId)` | Calculates from class/level |

**Implementation:** `src/modules/characters.ts` + `src/registry.ts`
**Tests:** `tests/characters/manage_spell_slots.test.ts` (44 passing)

---
