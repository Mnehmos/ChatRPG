# RPG-Lite MCP: Tool Implementation Checklist

## 35 Core Tools • TDD Tracker • ASCII Art Era

> **Post-Consolidation (ADR-003):** Reduced from 50 → 35 tools through batch patterns, composite tools, and absorption.

---

## ✅ Phase 1 Complete: ASCII Art Foundation + Batch Support + Condition System (19/35 tools, enhanced)

**All tools now output immersive ASCII art instead of markdown.**
**Conversion completed:** 2025-12-17
**Test status:** 647/647 passing
**Last updated:** 2025-12-20
**Combat Module:** ✅ COMPLETE (9/9 tools implemented)
**Spell Slots:** ✅ COMPLETE (manage_spell_slots with D&D 5e rules)
**Custom Classes/Races:** ✅ COMPLETE (homebrew support for any RPG system)
**Level-Up:** ✅ COMPLETE (level_up with HP methods, batch support, custom class scaling)
**ASCII module:** [src/modules/ascii-art.ts](src/modules/ascii-art.ts)
**WebSocket module:** [src/websocket.ts](src/websocket.ts) - Real-time battlefield broadcasting
**Content-Aware Auto-Sizing:** ✅ Implemented (boxes adapt to content, min 40/max 80 chars)
**Batch Operations:** ✅ Implemented (roll_dice, update_character, manage_condition, manage_spell_slots support batch)
**Condition Effects System:** ✅ Implemented (dynamic stat modifications, generic & extensible)
**Turn Management:** ✅ Implemented (advance_turn with condition ticking, death save reminders)
**Death Saves:** ✅ Implemented (roll_death_save with D&D 5e rules, visual tracker)
**Battlefield Rendering:** ✅ Implemented (render_battlefield with ASCII tactical map)
**Terrain System:** ✅ Implemented (modify_terrain with hazards, obstacles, difficult terrain)
**Encounter Lifecycle:** ✅ Complete (create → execute → advance → end with summary)

### roll_dice ✅ 🎨 📦

- [x] Schema defined
- [x] Tests written (13/13 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (dice faces, critical hit/fail frames)
- [x] **Batch support** (roll multiple expressions in one call, up to 20)
- [x] Error handling
- **File:** [src/modules/dice.ts](src/modules/dice.ts#L88-L153)
- **Tests:** [tests/combat/roll_dice.test.ts](tests/combat/roll_dice.test.ts), [tests/combat/batch_roll.test.ts](tests/combat/batch_roll.test.ts)
- **ASCII Features:** d6 faces (●), d20 special frames, calculation boxes
- **Batch Features:** Labeled rolls, summary table, individual result tracking
- **Touches:** Standalone
- **Called By:** `execute_action`, `roll_check`
- **Absorbs:** ⚫ `quick_roll` (simple expressions already supported)

### create_character ✅ 🎨 🔧 🔵

- [x] Schema defined
- [x] Tests written (14/14 passing + 16 custom class/race tests)
- [x] Handler implemented
- [x] **ASCII Art output** (character sheet with HP bar, stat tables)
- [x] **Custom class support** (homebrew classes with custom hit dice, spellcasting, resources)
- [x] **Custom race support** (homebrew races with ability bonuses, traits, resistances)
- [x] **Blue Phase complete** (extracted helper functions, JSDoc comments, constants)
- [x] Error handling
- **File:** [src/modules/characters.ts](src/modules/characters.ts)
- **Tests:** [tests/characters/create_character.test.ts](tests/characters/create_character.test.ts), [tests/characters/custom_class_race.test.ts](tests/characters/custom_class_race.test.ts)
- **ASCII Features:** HP bars (█░), ability score tables, combat stats, racial traits, custom resources
- **Custom Class Schema:**
  - `name` (string) - Class name (e.g., 'Netrunner', 'Witcher')
  - `hitDie` (4-12) - Hit die size (default: 8)
  - `spellcasting` ('full'|'half'|'third'|'warlock'|'none') - Casting progression
  - `spellcastingAbility` ('str'|'dex'|'con'|'int'|'wis'|'cha') - Casting stat
  - `resourceName` (string) - Custom resource name (e.g., 'Ki Points', 'Rage')
  - `resourceMax` (number) - Base resource pool
  - `resourceScaling` ('level'|'half'|'third'|'none'|number) - How resource scales
  - `description` (string) - Flavor text
- **Custom Race Schema:**
  - `name` (string) - Race name (e.g., 'Android', 'Genasi')
  - `abilityBonuses` ({ str?, dex?, con?, int?, wis?, cha? }) - Stat modifiers
  - `speed` (number) - Walking speed (default: 30)
  - `traits` (string[]) - Racial feature names
  - `resistances`, `immunities`, `vulnerabilities` (string[]) - Damage types
  - `conditionImmunities` (string[]) - Immune conditions
  - `darkvision` (number) - Darkvision range in feet
  - `size` ('tiny'|'small'|'medium'|'large'|'huge'|'gargantuan')
  - `description` (string) - Flavor text
- **Touches:** Creates JSON in `data/characters/`
- **Called By:** Standalone
- **Absorbs:** ⚫ `fetch_character_template` (via `previewTemplate: true` flag)
- **Refactoring (Blue Phase):**
  - Extracted `applyRacialBonuses()` - Applies racial ability bonuses with clamping
  - Extracted `calculateResourceMax()` - Calculates scaled resource pools
  - Extracted `clampAbilityScore()` - Bounds checking helper
  - Added `MIN_ABILITY_SCORE`, `MAX_ABILITY_SCORE` constants
  - Enhanced JSDoc documentation on all helper functions

### measure_distance ✅ 🎨

- [x] Schema defined
- [x] Tests written (15/15 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (distance diagram with arrow paths)
- [x] Error handling
- **File:** [src/modules/spatial.ts](src/modules/spatial.ts#L34-L108)
- **Tests:** [tests/spatial/measure_distance.test.ts](tests/spatial/measure_distance.test.ts)
- **ASCII Features:** Arrow paths (→→↓↓), distance box, movement breakdown
- **Touches:** Standalone (pure calculation)
- **Called By:** `calculate_movement`, `check_line_of_sight`, `calculate_aoe`

### manage_condition ✅ 🎨 📦 ⚡

- [x] Schema defined
- [x] Tests written (19/19 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (condition status boxes with effect descriptions)
- [x] **Batch support** (manage multiple conditions in one call, up to 20)
- [x] **Mechanical effects system** (dynamic stat modifications)
- [x] **Character name display** (shows name instead of just ID)
- [x] Error handling
- **File:** [src/modules.ts](src/modules/combat.ts)
- **Tests:** [tests/combat/manage_condition.test.ts](tests/combat/manage_condition.test.ts)
- **ASCII Features:** Condition boxes, exhaustion level tables, duration tracking
- **Batch Features:** Mixed operations (add/remove/query), success/failure summary
- **Mechanical Effects:** HP/speed modifiers, advantage/disadvantage tracking, auto-fail saves
- **Effect Types:** Exhaustion (level-based), Poisoned, Grappled, Paralyzed, Custom conditions
- **Touches:** In-memory condition store, integrates with character stats
- **Called By:** `execute_action`, `advance_turn`
- **Exports:** `getActiveConditions()`, `calculateEffectiveStats()` for character integration

### get_character ✅ 🎨 📦 ⚡

- [x] Schema defined
- [x] Tests written (7/7 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (enhanced character sheet with condition integration)
- [x] **Batch support** (retrieve multiple characters, roster view)
- [x] **Condition integration** (shows active conditions and mechanical effects)
- [x] **Effective stats display** (base stats → effective stats with conditions)
- [x] Error handling
- **File:** [src/modules/characters.ts](src/modules/characters.ts)
- **Tests:** [tests/characters/get_character.test.ts](tests/characters/get_character.test.ts)
- **ASCII Features:** HP bars, ability tables, combat stats, optional fields
- **Condition Features:**
  - Active Conditions section (lists all conditions with sources/durations)
  - Mechanical Effects section (shows stat modifications from conditions)
  - HP bar shows effective max (e.g., 22/22 if halved by Exhaustion 4)
  - Speed/AC marked with `*` if modified, shows base value
  - Example: "Base: 44/44 → Effective: 22/22" for Exhaustion 4
- **Touches:** Reads JSON from `data/characters/`, queries condition store
- **Called By:** `update_character`, `roll_check`, `execute_action`
- **Absorbs:** ⚫ `list_characters` (via `filter` object or `listAll: true`)

### update_character ✅ 🎨 📦

- [x] Schema defined
- [x] Tests written (22/22 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (before → after comparison)
- [x] **Batch support** (update multiple characters in one call, up to 20)
- [x] **Relative HP updates** ("+8", "-15" format for damage/healing)
- [x] Error handling
- **File:** [src/modules/characters.ts](src/modules/characters.ts)
- **Tests:** [tests/characters/update_character.test.ts](tests/characters/update_character.test.ts)
- **ASCII Features:** Change comparison with arrow format (→), field-specific updates
- **Batch Features:** HP tracking table, success/failure summary, relative value support
- **Relative HP:** Auto-clamps to 0-maxHp range (e.g., "-10" from 30 HP → 20 HP)
- **Touches:** Reads/writes JSON from `data/characters/`, recalculates derived stats
- **Called By:** `end_encounter` (HP sync), `take_rest`, `level_up`

---

## 🔴 Combat Module (9 tools)

### create_encounter ✅ 🎨

- [x] Schema defined
- [x] Tests written (43/43 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (initiative tracker, participant roster)
- [x] Error handling
- **File:** [src/modules/combat.ts](src/modules/combat.ts)
- **Tests:** [tests/combat/create_encounter.test.ts](tests/combat/create_encounter.test.ts)
- **ASCII Features:** Initiative order, participant table, terrain/lighting info
- **Touches:** → `roll_initiative` (internal)
- **Called By:** Standalone (Combat Entry)

### get_encounter ✅ 🎨 📊 🔵

- [x] Schema defined
- [x] Tests written (24/24 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (verbosity-based encounter display)
- [x] Error handling
- [x] **Blue Phase refactoring complete**
- **File:** [src/modules/combat.ts](src/modules/combat.ts)
- **Tests:** [tests/combat/get_encounter.test.ts](tests/combat/get_encounter.test.ts)
- **Verbosity Levels:**
  - `minimal` - ID, round, current turn only (fast LLM context)
  - `summary` - + participant list, HP bars/percentages (quick overview)
  - `standard` - + full HP/AC, conditions, positions, initiative order (default DM view)
  - `detailed` - + terrain, lighting, resistances/immunities, death saves (full state dump)
- **ASCII Features:** HP bars (█░), turn markers (▶), status indicators (💀⚠✓), death save tracker
- **Integration:** Shows active conditions from manage_condition, death save state from roll_death_save
- **Refactoring:**
  - Extracted `EncounterParticipant` type alias
  - Extracted `ENCOUNTER_WIDTH`, `HP_BAR_WIDTH`, `LIGHTING_DISPLAY` constants
  - Extracted `getStatusIndicator()`, `createMiniHpBar()`, `formatDeathSaveDisplay()` helpers
  - Added `createStatusBar` import from ascii-art.ts
  - Removed duplicate code across verbosity formatters
- **Touches:** Reads encounter state
- **Called By:** `render_battlefield`, LLM context
- **Absorbs:** ⚫ `get_encounter_summary` (via `verbosity: 'summary'`)

### execute_action (The Hub) ✅ 🎨 📦

- [x] Schema defined
- [x] Tests written (37/37 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (attack results, damage display, HP bars)
- [x] Error handling
- **File:** [src/modules/combat.ts](src/modules/combat.ts)
- **Tests:** [tests/combat/execute_action.test.ts](tests/combat/execute_action.test.ts)
- **Supported Actions:**
  - **attack** - Melee/ranged attacks with advantage/disadvantage, critical hits, damage application
  - **dash** - Double movement for the turn
  - **disengage** - Prevents opportunity attacks
  - **dodge** - Disadvantage on attacks against until next turn
  - **grapple** - Contested Athletics check, applies grappled condition
  - **shove** - Push 5ft away or knock prone
  - **cast_spell** - Spell casting with slot tracking
  - **move** - Movement with opportunity attack detection
  - **heal** - Healing application
  - **lair_action** - Lair action execution
- **Batch Support:** Accepts `{ batch: [...] }` pattern for multiple actions
- **Features:** Opportunity attack detection, movement tracking, action economy (action/bonus_action/reaction)
- **Touches:** → `roll_dice`, `manage_condition`, `update_character`
- **Reads:** Encounter state, Character state
- **Writes:** HP, Condition, Position
- **Absorbs:**
  - ⚫ `batch_execute_action` (via `{ batch: [...] }` pattern)
  - ⚫ `resolve_attack` (internal to attack action)
  - ⚫ `apply_damage` (via attack action or `update_character.hp`)

### advance_turn ✅ 🎨 🔄 ENHANCED

- [x] Schema defined
- [x] Tests written (36/36 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (turn info, HP bars, initiative order, condition tracking)
- [x] Error handling
- **File:** [src/modules/combat.ts](src/modules/combat.ts) (advanceTurn function)
- **Tests:** [tests/combat/advance_turn.test.ts](tests/combat/advance_turn.test.ts)
- **ASCII Features:** HP bars (█░), initiative order preview, round transition banners, death save reminders
- **Enhancement:** Integrates condition duration ticking, clears action economy, death save tracking
- **Touches:** → `manage_condition` (duration tick), encounter state
- **Writes:** Increments turn/round, clears turn action tracker
- **Refactored:** Blue Phase - extracted helper functions for condition ticking, DRY code

### roll_death_save ✅ 🎨

- [x] Schema defined
- [x] Tests written (41/41 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (death save tracker with visual indicators)
- [x] Error handling
- **File:** [src/modules/combat.ts](src/modules/combat.ts)
- **Tests:** [tests/combat/roll_death_save.test.ts](tests/combat/roll_death_save.test.ts)
- **Schema Parameters:**
  - `encounterId` (string, required) - The encounter containing the dying character
  - `characterId` (string, required) - The character making the death save
  - `modifier` (number, optional) - Bonus/penalty to the roll (e.g., Bless spell)
  - `rollMode` (enum, optional) - `'normal'` | `'advantage'` | `'disadvantage'`
  - `manualRoll` (1-20, optional) - Override the d20 roll (for testing)
  - `manualRolls` (array[2], optional) - Override both dice for adv/disadv testing
- **D&D 5e Rules:**
  - 10+ = success, 9- = failure
  - Natural 1 = 2 failures
  - Natural 20 = revive at 1 HP, clear death saves
  - 3 successes = stable (no more rolls needed)
  - 3 failures = death
- **ASCII Features:** Visual death save tracker (●○○ / ✕○○), dramatic messaging, box borders
- **Touches:** → `manage_condition` (removes unconscious on nat 20), encounter state
- **Writes:** Death save successes/failures, HP (on nat 20)
- **Called By:** `advance_turn` (reminder), LLM narrative

### render_battlefield ✅ 🎨

- [x] Schema defined
- [x] Tests written (50/50 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (tactical grid map with entities, terrain, legend)
- [x] Error handling
- **File:** [src/modules/combat.ts](src/modules/combat.ts) (renderBattlefield section)
- **Tests:** [tests/combat/render_battlefield.test.ts](tests/combat/render_battlefield.test.ts)
- **ASCII Features:**
  - 2D grid with x/y coordinate headers
  - Entity symbols (uppercase allies, lowercase enemies)
  - Special state symbols: † (dead), ○ (unconscious), ▶ (current turn)
  - Terrain markers: █ (wall), ░ (difficult), ≈ (water), * (hazard)
  - Legend with HP, conditions, position, elevation
  - Three detail levels: minimal, standard, detailed
  - Viewport/focus support for large maps
  - Elevation (z-level) display
- **Options:**
  - `showLegend` (default: true)
  - `showCoordinates` (default: true)
  - `showElevation` (default: true)
  - `viewport` (crop to region)
  - `focusOn` (center on entity)
  - `legendDetail` ('minimal' | 'standard' | 'detailed')
- **Touches:** → `get_encounter` (reads encounter state)
- **Called By:** LLM for tactical visualization

### modify_terrain ✅ 🎨 🔵

- [x] Schema defined
- [x] Tests written (37/37 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (terrain modification box with totals)
- [x] **Blue Phase complete** (extracted helper functions, JSDoc comments)
- [x] Error handling
- **File:** [src/modules/combat.ts](src/modules/combat.ts)
- **Tests:** [tests/combat/modify_terrain.test.ts](tests/combat/modify_terrain.test.ts)
- **Schema Parameters:**
  - `encounterId` (string, required) - The encounter to modify
  - `operation` (enum, required) - 'add' | 'remove' | 'clear'
  - `terrainType` (enum, required) - 'obstacle' | 'difficultTerrain' | 'water' | 'hazard'
  - `positions` (array, optional) - Array of "x,y" coordinate strings
  - `hazardDetails` (object, optional) - Details for hazard terrain (type, damage, dc)
  - `source` (string, optional) - Source of terrain change
  - `duration` (number, optional) - Rounds until auto-removed
- **ASCII Features:** Operation result box, affected positions, terrain totals after modification
- **Validation:** Bounds checking, occupied position detection for obstacles
- **Touches:** Encounter terrain state
- **Called By:** LLM for dynamic battlefield changes

### end_encounter ✅ 🎨 🔵

- [x] Schema defined
- [x] Tests written (39/39 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (encounter summary box with statistics)
- [x] **Blue Phase complete** (JSDoc comments, consistent error messages, WIDTH=60)
- [x] Error handling
- **File:** [src/modules/combat.ts](src/modules/combat.ts)
- **Tests:** [tests/combat/end_encounter.test.ts](tests/combat/end_encounter.test.ts)
- **Schema Parameters:**
  - `encounterId` (string, required) - The encounter to end
  - `outcome` (enum, required) - 'victory' | 'defeat' | 'fled' | 'negotiated' | 'other'
  - `generateSummary` (boolean, optional, default: true) - Include combat statistics
  - `preserveLog` (boolean, optional, default: false) - Keep encounter accessible after end
  - `notes` (string, optional) - DM notes about the encounter
- **ASCII Features:** Outcome display, participant status (alive/dead), combat statistics summary
- **Statistics:** Total rounds, damage dealt, healing done, attacks made/hit, conditions applied, MVP
- **Touches:** → Encounter state (marks as ended or deletes)
- **Called By:** LLM to conclude combat

### ⚫ REMOVED Combat Tools (Absorbed)

| Tool | Absorbed Into | Via |
|------|---------------|-----|
| `get_encounter_summary` | `get_encounter` | `verbosity: 'summary'` enum |
| `batch_execute_action` | `execute_action` | `{ batch: [...] }` pattern |
| `resolve_attack` | `execute_action` | Internal to `actionType: 'attack'` |
| `apply_damage` | `execute_action` / `update_character` | Attack action or HP delta |
| `process_aura` | `manage_aura` / `advance_turn` | Aura tick on turn advance |

---

## 🔵 Characters Module (9 tools) ✅ COMPLETE

### roll_check ✅ 🎨

- [x] Schema defined
- [x] Tests written (46/46 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (check result box, modifier breakdown)
- [x] **Blue Phase complete** (refactored with helper functions, critical roll indicators)
- [x] Error handling
- **File:** [src/modules/characters.ts](src/modules/characters.ts)
- **Tests:** [tests/characters/roll_check.test.ts](tests/characters/roll_check.test.ts)
- **ASCII Features:** Advantage/disadvantage display, DC result (✓/✗), critical indicators (⭐/💀)
- **Touches:** → `roll_dice`
- **Reads:** Character bonuses/proficiencies
- **Features:** Skill/ability/save/attack/initiative checks, contested rolls, DC evaluation

### delete_character ✅ 🎨 📦 🔵

- [x] Schema defined
- [x] Tests written (17/17 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (deletion confirmation box with character details)
- [x] **Batch support** (delete multiple characters in one call, up to 20)
- [x] **Blue Phase complete** (enhanced JSDoc, removed unused variables)
- [x] Error handling
- **File:** [src/modules/characters.ts](src/modules/characters.ts)
- **Tests:** [tests/characters/delete_character.test.ts](tests/characters/delete_character.test.ts)
- **Schema Parameters:**
  - `characterId` (string, optional) - ID of character to delete
  - `characterName` (string, optional) - Name of character to delete
  - `batch` (array, optional) - Array of delete requests for batch deletion
- **ASCII Features:** Deletion confirmation box, character details, batch summary with success/failure counts
- **Validation:** Character existence check, either ID or name required
- **Touches:** Deletes JSON from `data/characters/`
- **Called By:** LLM for character cleanup

### take_rest ✅ 🎨 📦 🔵

- [x] Schema defined
- [x] Tests written (26/26 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (rest completion boxes with HP/hit dice tracking)
- [x] **Batch support** (rest entire party in one call)
- [x] Error handling
- **File:** [src/modules/characters.ts](src/modules/characters.ts)
- **Tests:** [tests/characters/take_rest.test.ts](tests/characters/take_rest.test.ts)
- **Schema:**
  - `characterId` (string) or `characterName` (string) - Required (one of)
  - `restType` (enum: 'short' | 'long') - Required
  - `hitDiceToSpend` (number, optional) - Short rest: how many hit dice to spend
  - `restoreHp` (boolean, default: true) - Long rest: restore HP
  - `restoreSpellSlots` (boolean, default: true) - Long rest: restore spell slots
  - `restoreHitDice` (boolean, default: true) - Long rest: restore half hit dice
  - `clearConditions` (string[], optional) - Specific conditions to clear
  - `uninterrupted` (boolean, default: true) - Whether rest was interrupted
  - `batch` (array, optional) - Array of rest requests for party rest
- **D&D 5e Rules:**
  - **Short Rest:** Spend hit dice to heal (1d[class die] + CON mod per die, min 1 HP), restore warlock pact slots
  - **Long Rest:** Restore all HP, half hit dice (rounded up), reduce exhaustion by 1, restore all spell slots
  - Clear conditions with `duration: 'until_rest'` automatically
- **ASCII Features:** Rest completion box with HP changes, hit dice tracking, conditions cleared
- **Validation:** Character existence check, valid rest type
- **Integration:** → `manage_spell_slots` (restores slots), `manage_condition` (clear conditions)

### manage_spell_slots ✅ 🎨 📦 🔵

- [x] Schema defined
- [x] Tests written (44/44 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (spell slot visualization with filled/empty indicators)
- [x] **Batch support** (manage multiple characters in one call, up to 20)
- [x] **Blue Phase complete** (comprehensive JSDoc, type definitions, integration docs)
- [x] Error handling
- **File:** [src/modules/characters.ts](src/modules/characters.ts)
- **Tests:** [tests/characters/manage_spell_slots.test.ts](tests/characters/manage_spell_slots.test.ts)
- **Schema:**
  - `characterId` (string) or `characterName` (string) - Required (one of)
  - `operation` (enum: 'view' | 'expend' | 'restore' | 'set') - Required
  - `slotLevel` (number 1-9, optional) - For expend/restore specific level
  - `count` (number, optional) - How many slots to expend/restore
  - `pactMagic` (boolean, optional) - Operate on warlock pact slots instead
  - `slots` (object, optional) - DM override: set exact slot configuration
  - `batch` (array, optional) - Array of operations for batch processing
- **D&D 5e Rules:**
  - **Full Casters:** Wizard, Sorcerer, Cleric, Druid, Bard (1st-9th level spells)
  - **Half Casters:** Paladin, Ranger (1st-5th level spells, delayed progression)
  - **Third Casters:** Eldritch Knight, Arcane Trickster (1st-4th level, subclass-based)
  - **Warlock Pact Magic:** Separate pool, all slots same level, short rest recovery
- **ASCII Features:** ● (available) / ○ (expended) for regular slots, ◆/◇ for pact slots
- **Integration:**
  - → `take_rest`: Long rest restores all, short rest restores warlock pact
  - → `execute_action`: `actionType: 'cast_spell'` validates and expends slots
- **Exports:** `restoreAllSpellSlots()`, `restorePactSlots()`, `expendSpellSlot()`, `hasSpellSlot()`

### level_up ✅ 🎨 📦 🔵

- [x] Schema defined
- [x] Tests written (32/32 passing)
- [x] Handler implemented
- [x] **ASCII Art output** (level-up celebration box with HP bar, stat changes)
- [x] **Batch support** (level up entire party at once, up to 20 characters)
- [x] **Custom class support** (uses stored customClass.hitDie for HP calculations)
- [x] **Blue Phase complete** (extracted helpers, constants, enhanced JSDoc)
- [x] Error handling
- **File:** [src/modules/characters.ts](src/modules/characters.ts#L4503-L4546)
- **Tests:** [tests/characters/level_up.test.ts](tests/characters/level_up.test.ts)
- **ASCII Features:** Level-up celebration, HP bar, stat change arrows (→), feature/spell lists
- **Batch Features:** Party level-up summary, success/failure counts, individual results
- **Schema:**
  - `characterId` (string) - Character ID (or use characterName)
  - `characterName` (string) - Character name for lookup
  - `targetLevel` (2-20) - Target level (default: current + 1)
  - `hpMethod` ('roll'|'average'|'max'|'manual') - HP calculation method (default: 'average')
  - `manualHp` (number) - Manual HP gain (required when hpMethod is 'manual')
  - `manualRoll` (1-20) - Override die roll for testing
  - `newFeatures` (string[]) - New class features to record
  - `newSpells` (string[]) - New spells learned
  - `batch` - Array of level-up operations (up to 20)
- **HP Methods:**
  - `average` - (hitDie/2 + 1) + CON mod per level (D&D 5e standard)
  - `max` - hitDie + CON mod per level (heroic mode)
  - `roll` - Random 1d[hitDie] + CON mod (minimum 1 HP per level)
  - `manual` - Use provided manualHp value
- **Level-Up Effects:**
  - HP increase (calculated per method, minimum 1 HP per level)
  - Proficiency bonus recalculation (based on new level)
  - Spell slot refresh (for spellcasting classes)
  - Custom resource scaling (for homebrew classes)
  - Multi-level jumps supported (e.g., level 1 → 5)
- **Touches:** → `updateCharacter`, `restoreAllSpellSlots`, `calculateResourceMax`
- **Called By:** Standalone (post-session advancement)
- **Integration Points:**
  - Uses `getHitDie()` for class hit die (supports customClass.hitDie)
  - Uses `calculateProficiencyBonus()` for proficiency updates
  - Uses `restoreAllSpellSlots()` to refresh spell slots for new level
  - Uses `calculateResourceMax()` for custom resource scaling
- **Refactoring (Blue Phase):**
  - Added `MAX_CHARACTER_LEVEL` constant (20)
  - Added `MIN_HP_PER_LEVEL` constant (1)
  - Added `DEFAULT_HP_METHOD` constant ('average')
  - Extracted `calculateCustomResourceUpdate()` - Calculates resource scaling changes
  - Enhanced `LevelUpResult` interface with comprehensive JSDoc
  - Enhanced `levelUpSingle()` with detailed JSDoc documentation
  - Replaced `any` type with proper `Partial<z.infer<typeof singleUpdateSchema>>` typing

### ⚫ REMOVED Character Tools (Absorbed)

| Tool | Absorbed Into | Via |
|------|---------------|-----|
| `list_characters` | `get_character` | `filter` object or `listAll: true` |
| `quick_roll` | `roll_dice` | Already supports simple expressions |
| `fetch_character_template` | `create_character` | `previewTemplate: true` flag |
| `manage_effect` | `manage_condition` | Custom conditions + `duration: 'until_rest'/'until_dispelled'` |

---

## 🔴 Magic Module (5 tools)

### manage_concentration 🆕 COMPOSITE

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Operations:**
  - `check` - Roll concentration save after damage (DC = max(10, damage/2))
  - `break` - Force break concentration (manual)
  - `get` - Query current concentration state
  - `set` - Set concentration on a spell (internal use)
- **Touches:** → `roll_dice` (for save), Character concentration state
- **Called By:** `execute_action` (damage triggers check)
- **Absorbs:**
  - ⚫ `check_concentration`
  - ⚫ `break_concentration`
  - ⚫ `get_concentration`

### manage_spell_slots

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### use_scroll

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### manage_aura 🆕 COMPOSITE

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Operations:**
  - `create` - Create new aura centered on character (Spirit Guardians, etc.)
  - `process` - Process aura effects for targets in range
  - `remove` - Remove an aura by ID
  - `list` - List active auras
- **Parameters (create):** ownerId, spellName, radius, duration, effect, damageType, saveDC, saveAbility
- **Touches:** Aura state, → `roll_dice` (damage), `manage_condition`
- **Called By:** `execute_action` (cast_spell), `advance_turn` (process)
- **Absorbs:**
  - ⚫ `create_aura`
  - ⚫ `process_aura`

### synthesize_spell

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### ⚫ REMOVED Magic Tools (Absorbed)

| Tool | Absorbed Into | Via |
|------|---------------|-----|
| `check_concentration` | `manage_concentration` | `operation: 'check'` |
| `break_concentration` | `manage_concentration` | `operation: 'break'` |
| `get_concentration` | `manage_concentration` | `operation: 'get'` |
| `create_aura` | `manage_aura` | `operation: 'create'` |
| `process_aura` | `manage_aura` / `advance_turn` | `operation: 'process'` or integrated |

---

## 🔴 Spatial Module (6 tools)

### calculate_aoe

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Called By:** `execute_action` (Spell)

### check_line_of_sight

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### check_cover

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Returns:** AC/Dex Save bonuses

### place_prop

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### calculate_movement 🔄 ENHANCED

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Enhancement:** Add `mode` parameter
  - `path` - Calculate path from A to B with terrain (default)
  - `reach` - All reachable squares from position
  - `adjacent` - Simple 8-square adjacency check
- **Touches:** Encounter terrain state
- **Called By:** `execute_action` (Move)
- **Absorbs:** ⚫ `get_adjacent_squares` (via `mode: 'adjacent'`)

### ⚫ REMOVED Spatial Tools (Absorbed)

| Tool | Absorbed Into | Via |
|------|---------------|-----|
| `get_adjacent_squares` | `calculate_movement` | `mode: 'adjacent'` |

---

## 🔴 Data Module (6 tools)

### manage_location 🆕 COMPOSITE

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Operations:**
  - `create` - Create new room node
  - `get` - Retrieve room + edges
  - `update` - Update room properties
  - `delete` - Remove room
  - `link` - Create edge between rooms
  - `unlink` - Remove edge between rooms
- **Parameters (link/unlink):** fromLocationId, toLocationId, connectionType, locked, hidden, oneWay
- **Connection Types:** door, passage, stairs, ladder, portal, hidden
- **Touches:** Location graph, edge state
- **Absorbs:**
  - ⚫ `create_location`
  - ⚫ `get_location`
  - ⚫ `link_rooms`
  - ⚫ `unlink_rooms`

### move_party

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Touches:** → `manage_location` (get), `get_session_context`
- **Writes:** Current location state

### manage_party

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented

### manage_inventory

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Note:** Per ADR-002, supports 7 operations (give, take, equip, unequip, move, list, transfer)

### manage_notes 🆕 COMPOSITE

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Operations:**
  - `add` - Add a session note
  - `search` - Search notes by query/tags
  - `get` - Get specific note by ID
  - `delete` - Remove a note
  - `list` - List recent notes
- **Parameters:** content, tags, importance, query, tagFilter, noteId, limit
- **Importance Levels:** low, medium, high, critical
- **Absorbs:**
  - ⚫ `add_session_note`
  - ⚫ `search_notes`

### get_session_context

- [ ] Schema defined
- [ ] Tests written
- [ ] Handler implemented
- **Touches:** Aggregates Location + Party + Notes + Encounter

### ⚫ REMOVED Data Tools (Absorbed)

| Tool | Absorbed Into | Via |
|------|---------------|-----|
| `create_location` | `manage_location` | `operation: 'create'` |
| `get_location` | `manage_location` | `operation: 'get'` |
| `link_rooms` | `manage_location` | `operation: 'link'` |
| `unlink_rooms` | `manage_location` | `operation: 'unlink'` |
| `add_session_note` | `manage_notes` | `operation: 'add'` |
| `search_notes` | `manage_notes` | `operation: 'search'` |

---

## 🔮 Phase 2 Predictions: Schema Evolution

### ASCII Pattern Will Require for Future Tools:

**1. Combat Encounters:**
- Initiative tracker with turn order arrows (→ for current turn)
- Multi-combatant HP bars in table format
- Battlefield grid rendering using `createGrid()`
- Action result summaries with damage dice visualization
- Status effect badges/icons per combatant

**2. Character Updates:**
- Before/after comparison boxes for stat changes
- List views with pagination (characters 1-10 of 45)
- Level-up progression trees (visual skill selection)
- Equipment inventory grids

**3. Magic System:**
- Spell slot visualization: `1st: ●●●○○ 2nd: ●●○○○○`
- Concentration indicators with duration timers
- AoE templates overlaid on grid
- Spell effect stacking displays

**4. Spatial Mechanics:**
- Line-of-sight path rendering (walls as █, clear as ·)
- Cover indicators (½ = half cover, ¾ = three-quarters)
- Movement range highlighting (current pos ◆, valid moves ·)
- Elevation changes (stair symbols)

**5. Session Management:**
- Timeline visualization for session notes
- Location connection graphs (ASCII node diagrams)
- Party roster with quick stats (mini character cards)
- Context summary boxes (DM brain injection)

### Schema Changes Required:

All future `format*Result()` functions must:
1. Import from `ascii-art.ts`
2. Use `createBox()` as primary wrapper (width parameter optional - auto-sizes to content)
3. Build `content: string[]` arrays instead of template literals
4. Let createBox handle sizing (40-80 char range, content-aware)
5. Avoid emoji (except for special dice/icons already in spec)
6. Test for ASCII borders (`╔`) not markdown (`#`, `**`)

---

## 📚 System Integration Reference

**Critical Reading:** [SYSTEM-INTERSECTIONS.md](design%20docs/SYSTEM-INTERSECTIONS.md)

This document maps all integration points between modules and predicts future intersections.

**Key Patterns Established:**
1. **Effective Stats Model** - Base → Equipment → Conditions → Effective (✅ Implemented for conditions)
2. **Batch Operations** - Single OR { batch: [...] } pattern (✅ 3 tools)
3. **Character Name Resolution** - characterId OR characterName (✅ 3 tools)
4. **Mechanical Effects Interface** - Generic stat modification system (✅ Implemented)
5. **Composite Tools** - operation enum pattern (🆕 4 new tools per ADR-003)

**Critical Intersections to Implement:**
- Damage → Concentration check (execute_action needs manage_concentration)
- 0 HP → Unconscious condition (execute_action needs manage_condition)
- Incapacitated → Break concentration (manage_condition needs manage_concentration hooks)
- Rest → Multi-system orchestration (HP + slots + conditions + hit dice)
- Equipment → Stats calculation (same pattern as conditions)

---

## 📊 Consolidation Summary (ADR-003)

### Tools Absorbed (19 total)

| Original Tool | Absorbed Into | Method |
|--------------|---------------|--------|
| `get_encounter_summary` | `get_encounter` | `verbosity` enum |
| `batch_execute_action` | `execute_action` | `{ batch: [...] }` |
| `resolve_attack` | `execute_action` | Internal |
| `apply_damage` | `execute_action` / `update_character` | Action/HP delta |
| `process_aura` | `manage_aura` / `advance_turn` | Operation enum |
| `list_characters` | `get_character` | Filter options |
| `quick_roll` | `roll_dice` | Already supported |
| `fetch_character_template` | `create_character` | Flag |
| `check_concentration` | `manage_concentration` | Operation enum |
| `break_concentration` | `manage_concentration` | Operation enum |
| `get_concentration` | `manage_concentration` | Operation enum |
| `create_aura` | `manage_aura` | Operation enum |
| `get_adjacent_squares` | `calculate_movement` | Mode enum |
| `create_location` | `manage_location` | Operation enum |
| `get_location` | `manage_location` | Operation enum |
| `link_rooms` | `manage_location` | Operation enum |
| `unlink_rooms` | `manage_location` | Operation enum |
| `add_session_note` | `manage_notes` | Operation enum |
| `search_notes` | `manage_notes` | Operation enum |

### New Composite Tools (4)

| Tool | Operations | Module |
|------|------------|--------|
| `manage_concentration` | check, break, get, set | Magic |
| `manage_aura` | create, process, remove, list | Magic |
| `manage_location` | create, get, update, delete, link, unlink | Data |
| `manage_notes` | add, search, get, delete, list | Data |

### Enhanced Tools (2)

| Tool | Enhancement | Module |
|------|-------------|--------|
| `get_encounter` | `verbosity` enum (minimal/summary/standard/detailed) | Combat |
| `calculate_movement` | `mode` enum (path/reach/adjacent) | Spatial |

---

## Summary

| Module     | Total | Done | Remaining |
| ---------- | ----- | ---- | --------- |
| Combat     | 9     | 9    | 0         |
| Characters | 9     | 9    | 0         |
| Magic      | 5     | 0    | 5         |
| Spatial    | 6     | 1    | 5         |
| Data       | 6     | 0    | 6         |
| **TOTAL**  | **35**| **19** | **16** |

**Progress**: 54% complete (19/35 tools)
**Test Status**: ✅ 647/647 passing
**Next Priority**: Magic module or Spatial module

_Last Updated: 2025-12-19 17:45 UTC - ADR-003 consolidation applied (35 tools)_
