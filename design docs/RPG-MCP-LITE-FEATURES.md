# RPG-MCP Lite: Feature Matrix & Migration Guide

## Tool Count Comparison

| Category | rpg-mcp Full | rpg-mcp-lite | Reduction |
|----------|--------------|--------------|-----------|
| World/Map | 9 | 0* | -9 |
| Combat | 16 | 15 | -1 |
| Spatial | 5 | 8 | +3 |
| Magic | 7 | 10 | +3 |
| Character | 8 | 8 | 0 |
| Party | 16 | 1** | -15 |
| Inventory | 14 | 1** | -13 |
| Quest | 8 | 0*** | -8 |
| Secrets | 9 | 0*** | -9 |
| Narrative | 6 | 3 | -3 |
| Math | 5 | 0 | -5 |
| Strategy | 6 | 0 | -6 |
| Corpse/Loot | 14 | 0 | -14 |
| Theft | 10 | 0 | -10 |
| Rest | 2 | 1** | -1 |
| Concentration | 5 | 4 | -1 |
| Scroll | 6 | 1** | -5 |
| Aura | 7 | 4 | -3 |
| NPC Memory | 7 | 0 | -7 |
| Improvisation | 8 | 1** | -7 |
| Batch | 3 | 0 | -3 |
| Workflow | 3 | 0 | -3 |
| Event Inbox | 4 | 0 | -4 |
| Context | 1 | 1 | 0 |
| Progression | 3 | 1 | -2 |
| Skill Checks | 3 | 1** | -2 |
| Composite | 9 | 0 | -9 |
| **TOTAL** | **~180** | **48** | **-73%** |

\* World generation removed - locations are narrative constructs  
\*\* Consolidated into unified tools  
\*\*\* Folded into session notes system  

---

## What's IN vs OUT

### ✅ IN: Core Combat & Tactics

| Feature | Coverage | Notes |
|---------|----------|-------|
| Initiative | Full | Roll, set, surprise |
| Actions | Full | All 12 PHB actions + grapple/shove |
| Bonus Actions | Full | Via action type parameter |
| Reactions | Full | Readied actions, opportunity attacks |
| Movement | Full | Walk, fly, swim, climb, difficult terrain |
| Conditions | Full | All 15 PHB conditions + exhaustion |
| Damage Types | Full | All 13 damage types |
| Resistance/Immunity | Full | Auto-calculated on damage |
| Death Saves | Full | Nat 1 = 2 failures, nat 20 = revive |
| Cover | Full | None/half/3-4/full |
| Line of Sight | Full | With cover calculation |
| AoE Shapes | Full | Line, cone, cube, sphere, cylinder |
| Lair Actions | Full | Initiative 20, environmental effects |

### ✅ IN: Magic System

| Feature | Coverage | Notes |
|---------|----------|-------|
| Spell Slots | Full | All 9 levels + cantrips |
| Concentration | Full | CON saves, auto-break conditions |
| Ritual Casting | Full | Spell flag |
| Upcasting | Full | Slot level parameter |
| Spell Scrolls | Full | Arcana check if needed |
| Auras | Full | Persistent area effects |
| Arcane Synthesis | Full | Improvised spell creation |
| Spell Database | Partial | Core spells, extensible |

### ✅ IN: Character Management

| Feature | Coverage | Notes |
|---------|----------|-------|
| Character CRUD | Full | Create, read, update, delete |
| Ability Scores | Full | STR/DEX/CON/INT/WIS/CHA |
| Skills | Full | All 18 skills with proficiency |
| Saves | Full | 6 ability saves + proficiency |
| Equipment | Full | Give, equip, use |
| Leveling | Full | HP, slots, features |
| Resting | Full | Short and long rest |

### ✅ IN: Session Management

| Feature | Coverage | Notes |
|---------|----------|-------|
| Plot Threads | Full | Active storylines |
| Canonical Moments | Full | Important events |
| NPC Notes | Full | Voice, motivation |
| Foreshadowing | Full | Planted hints |
| Clues | New | Player-found info |
| Player Theories | New | Track speculation |
| Context Injection | Full | LLM prompt formatting |

### ❌ OUT: Removed Systems

| System | Reason | Alternative |
|--------|--------|-------------|
| **Perlin World Gen** | Heavy, not essential for text play | DM narrates locations |
| **Grand Strategy** | Different game mode entirely | Separate server if needed |
| **Corpse/Loot Tables** | Over-engineered | DM handles narratively |
| **Theft Provenance** | Niche feature | DM handles narratively |
| **Event Inbox** | Async complexity | Direct tool responses |
| **POI Discovery** | Coupled to worldgen | Locations are narrative |
| **Workflow System** | Meta-complexity | Direct tool composition |
| **Batch Operations** | Token optimization | Single operations fine for lite |
| **Composite Tools** | Convenience wrappers | Explicit tool calls |
| **Math Engine** | Separate concern | Use dice_roll from rpg-mcp or external |

---

## Consolidation Map

### Inventory → `manage_inventory`

| Old Tool | Lite Operation |
|----------|----------------|
| `create_item_template` | `give` with item definition |
| `give_item` | `give` |
| `remove_item` | `remove` |
| `equip_item` | `equip` |
| `unequip_item` | `unequip` |
| `get_inventory` | `view` |
| `transfer_item` | `transfer` |
| `use_item` | `use` |

### Party → `manage_party`

| Old Tool | Lite Operation |
|----------|----------------|
| `create_party` | `create` |
| `get_party` | `get` |
| `update_party` | `update` |
| `delete_party` | `delete` |
| `add_party_member` | `add_member` |
| `remove_party_member` | `remove_member` |
| `set_party_leader` | `set_leader` |
| `set_active_character` | `set_active` |
| `get_party_members` | Included in `get` |
| `get_party_context` | Use `get_session_context` |

### Checks → `roll_check`

| Old Tool | Lite Parameter |
|----------|----------------|
| `roll_skill_check` | `checkType: 'skill'` |
| `roll_ability_check` | `checkType: 'ability'` |
| `roll_saving_throw` | `checkType: 'save'` |

### Rest → `take_rest`

| Old Tool | Lite Parameter |
|----------|----------------|
| `take_short_rest` | `restType: 'short'` |
| `take_long_rest` | `restType: 'long'` |

### Conditions & Effects → `manage_condition` + `manage_effect`

| Old Tool | Lite Equivalent |
|----------|-----------------|
| `update_character` (conditions) | `manage_condition` |
| `apply_custom_effect` | `manage_effect` |
| `get_custom_effects` | `manage_effect` with `operation: 'query'` |
| `remove_custom_effect` | `manage_effect` with `operation: 'remove'` |

---

## D&D 5e Reference Tables (Embedded)

### Damage by Level & Severity
```
| Severity  | 1-4   | 5-10  | 11-16 | 17-20 |
|-----------|-------|-------|-------|-------|
| Setback   | 1d10  | 2d10  | 4d10  | 10d10 |
| Dangerous | 2d10  | 4d10  | 10d10 | 18d10 |
| Deadly    | 4d10  | 10d10 | 18d10 | 24d10 |
```

### Object Durability
```
Size    | Fragile | Resilient
--------|---------|----------
Tiny    | 2 (1d4) | 5 (2d4)
Small   | 3 (1d6) | 10 (3d6)
Medium  | 4 (1d8) | 18 (4d8)
Large   | 5(1d10) | 27 (5d10)

Material      | AC
--------------|----
Cloth/paper   | 11
Glass/crystal | 13
Wood/bone     | 15
Stone         | 17
Iron/steel    | 19
Mithral       | 21
Adamantine    | 23
```

### Suffocating
- Can hold breath: 1 + CON modifier minutes (min 30 seconds)
- When out of breath or choking: survive CON modifier rounds (min 1)
- At 0 rounds: drop to 0 HP, dying

### Jumping
- **Long Jump**: STR score in feet (running) or half (standing)
- **High Jump**: 3 + STR modifier feet (running) or half (standing)

### Exhaustion Levels
```
Level | Effect
------|---------------------------------------
1     | Disadvantage on ability checks
2     | Speed halved
3     | Disadvantage on attacks and saves
4     | HP maximum halved
5     | Speed reduced to 0
6     | Death
```

### Skill/Ability Associations
```
STR: Athletics
DEX: Acrobatics, Sleight of Hand, Stealth
INT: Arcana, History, Investigation, Nature, Religion
WIS: Animal Handling, Insight, Medicine, Perception, Survival
CHA: Deception, Intimidation, Performance, Persuasion
```

### Travel Pace
```
Pace   | /Hour  | /Day    | Effect
-------|--------|---------|---------------------------
Fast   | 4 mi   | 30 mi   | -5 passive Perception
Normal | 3 mi   | 24 mi   | —
Slow   | 2 mi   | 18 mi   | Can use Stealth
```

### Services & Costs
```
Service               | Cost
----------------------|-------------
Coach (city)          | 1 cp
Hireling (untrained)  | 2 sp/day
Hireling (skilled)    | 2 gp/day
Messenger             | 2 cp/mile
Ship passage          | 1 sp/mile
Toll (road/gate)      | 1 cp
```

### Lodging & Meals
```
Quality      | Inn/Night | Meal
-------------|-----------|------
Squalid      | 7 cp      | 3 cp
Poor         | 1 sp      | 6 cp
Modest       | 5 sp      | 3 sp
Comfortable  | 8 sp      | 5 sp
Wealthy      | 2 gp      | 8 sp
Aristocratic | 4 gp      | 2 gp
```

---

## Implementation Phases

### Phase 1: Combat MVP (Week 1)
**Goal**: Playable combat with full action economy

Tools:
1. `create_encounter`
2. `get_encounter`
3. `execute_action`
4. `advance_turn`
5. `end_encounter`
6. `apply_damage`
7. `apply_healing`
8. `roll_death_save`
9. `manage_condition`
10. `render_battlefield`

Tests:
- [ ] Create 3v3 encounter
- [ ] Full round of combat
- [ ] Condition application (prone, grappled)
- [ ] Death saves
- [ ] Map rendering

### Phase 2: Spatial (Week 2)
**Goal**: Tactical positioning matters

Tools:
11. `calculate_aoe`
12. `measure_distance`
13. `check_line_of_sight`
14. `check_cover`
15. `move_combatant`
16. `get_creatures_in_range`

Tests:
- [ ] Fireball hits correct targets
- [ ] Cover calculation affects AC
- [ ] Movement through difficult terrain
- [ ] Opportunity attack triggers

### Phase 3: Magic (Week 3)
**Goal**: Full spellcasting support

Tools:
17. `cast_spell`
18. `check_concentration`
19. `break_concentration`
20. `get_concentration`
21. `manage_spell_slots`
22. `create_aura`
23. `process_aura`

Tests:
- [ ] Spell slot tracking
- [ ] Concentration breaks on damage
- [ ] Spirit Guardians aura
- [ ] Upcast damage scaling

### Phase 4: Characters (Week 4)
**Goal**: Character lifecycle

Tools:
24. `create_character`
25. `get_character`
26. `update_character`
27. `list_characters`
28. `delete_character`
29. `roll_check`
30. `take_rest`
31. `level_up`

Tests:
- [ ] Create fighter with equipment
- [ ] Skill check with proficiency
- [ ] Long rest restores all
- [ ] Level up updates HP

### Phase 5: Data Layer (Week 5)
**Goal**: Session persistence

Tools:
32. `manage_inventory`
33. `manage_party`
34. `create_location`
35. `get_location`
36. `add_session_note`
37. `search_notes`
38. `get_session_context`

Tests:
- [ ] Equip weapon affects attack
- [ ] Party formation
- [ ] Note retrieval by tag
- [ ] Context injection

### Phase 6: Advanced (Week 6)
**Goal**: Complete feature set

Tools:
39. `roll_initiative`
40. `manage_effect` (boons/curses)
41. `modify_terrain`
42. `execute_lair_action`
43. `place_prop`
44. `get_adjacent_squares`
45. `calculate_movement`
46. `use_scroll`
47. `synthesize_spell`
48. `get_spell_info`

Tests:
- [ ] Custom curse application
- [ ] Dynamic terrain modification
- [ ] Scroll Arcana check
- [ ] Spell synthesis DC calculation

---

## Token Budget

### Full Schema Mode (All 48 tools)
~6,000-8,000 tokens

### Comparison
- rpg-mcp full: ~50,000 tokens
- rpg-mcp-lite full: ~8,000 tokens
- rpg-mcp-lite dynamic: ~2,000 tokens

**85-96% reduction in context overhead**

---

## Open Design Questions

1. **Spell Database**: Full SRD (~300 spells) or minimal + lookup?
   - Recommendation: Minimal (50 common) + `get_spell_info` for rest

2. **Creature Presets**: Keep or remove?
   - Recommendation: Keep minimal (goblin, orc, skeleton, etc.)

3. **Meta-tools**: Keep `search_tools` / `load_tool_schema`?
   - Recommendation: Yes, enables same dynamic loading pattern

4. **Session Persistence**: SQLite or JSON?
   - Recommendation: SQLite for consistency with rpg-mcp

5. **Dice Rolling**: Built-in or defer to external?
   - Recommendation: Built into `roll_check` / `execute_action`

---

*Version: 0.1.0*  
*Status: Design Complete*
