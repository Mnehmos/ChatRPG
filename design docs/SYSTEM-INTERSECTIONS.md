# RPG-Lite MCP: System Intersections & Integration Planning

## Orchestration Strategy for Cross-Module Operations

**Last Updated:** 2025-12-17 (Post-Condition System Implementation)
**Status:** Phase 1 Complete - Mapping Future Intersections

---

## Executive Summary

This document maps **critical integration points** between modules, predicting where systems will intersect and require coordination. Based on the completed condition effects system, we can now anticipate similar patterns across all modules.

---

## Core Integration Pattern: The "Effective Stats" Model

### What We Learned from Conditions

The condition system established a **critical pattern** that should be replicated across all stat-modifying systems:

```typescript
// ESTABLISHED PATTERN
interface EffectiveStatCalculation {
  base: number;           // Original value from character sheet
  effective: number;      // After all modifications
  modified: boolean;      // Was it changed?
  modifiers: string[];    // Human-readable list of what changed it
}
```

**Why This Matters:**
- ✅ LLM sees both base and modified values
- ✅ Players understand what's happening to their characters
- ✅ Extensible to ANY stat modification system
- ✅ Works for temporary and permanent changes

---

## Module Intersection Map

### 1. CHARACTER ↔ CONDITION (✅ **IMPLEMENTED**)

**Status:** COMPLETE
**Integration Points:**
- `getActiveConditions(characterId)` → Returns active conditions
- `calculateEffectiveStats(characterId, baseStats)` → Modifies HP/speed/AC
- `get_character` → Shows both base and effective stats

**Data Flow:**
```
Character Storage → Condition Store → Effective Stats → Character Display
    (JSON)         (In-Memory Map)     (Runtime Calc)    (ASCII Output)
```

**Key Learning:** Conditions must be **queryable outside combat** to support:
- Town interactions while exhausted
- Long-term curses
- Persistent boons (e.g., from blessings)

---

### 2. CHARACTER ↔ EQUIPMENT (**PLANNED - HIGH PRIORITY**)

**Predicted Intersection:** Equipment should use the SAME effective stats pattern

**Required Integration:**

```typescript
// EQUIPMENT should export (similar to conditions):
export function getEquippedItems(characterId: string): EquippedItem[]
export function calculateEquipmentBonuses(characterId: string, baseStats): EffectiveStatCalculation

// Example output:
{
  ac: { base: 10, effective: 18, modified: true },
  modifiers: [
    "Plate Armor: +18 AC",
    "Shield: +2 AC",
    "Ring of Protection: +1 AC"
  ]
}
```

**Why This Matters:**
- AC bonuses from armor/shields
- Stat bonuses from magic items (Belt of Giant Strength: STR = 21)
- Speed modifiers (Boots of Speed)
- Attack/damage bonuses from weapons

**Intersection with Conditions:**
- Exhaustion Level 4 halves HP max → Equipment can't override this
- Petrified → Equipment bonuses still apply to AC
- **Order of Operations:** Base → Equipment → Conditions → Effective

---

### 3. CHARACTER ↔ EFFECTS (manage_effect) (**PLANNED - HIGH PRIORITY**)

**Current Status:** Tool schema defined but not implemented
**Predicted Intersection:** Effects = Conditions + More

**Required Integration:**

```typescript
// EFFECTS should be a SUPERSET of conditions
interface EffectSystem {
  conditions: ActiveCondition[];    // D&D 5e conditions
  boons: CustomEffect[];            // Buffs (Bless, Haste, Bard Inspiration)
  curses: CustomEffect[];           // Debuffs (Hex, Bane, Slow)
  persistent: CustomEffect[];       // Permanent (Geas, Mark of the Beast)
}

// Effects should also export:
export function calculateEffectiveStat sWithEffects(
  characterId: string,
  baseStats: Stats
): EffectiveStatCalculation
```

**Integration Challenge:**
```
Question: Should `getActiveConditions()` return boons/curses too?
Answer: YES - all stat modifiers should be in one unified system

New Export:
export function getAllActiveModifiers(characterId: string): {
  conditions: ActiveCondition[];
  boons: CustomEffect[];
  curses: CustomEffect[];
  equipment: EquippedItem[];
  spellEffects: ActiveSpell[];
}
```

**Why This Unified Approach:**
- LLM needs ONE source of truth for "what's affecting this character?"
- Player confusion when effects come from 3 different systems
- `get_character` should show ALL modifiers in one section

---

### 4. CHARACTER ↔ SPELL SLOTS/CONCENTRATION (**PLANNED - MEDIUM PRIORITY**)

**Predicted Intersection:** Spellcasting state lives on character

**Required Integration:**

```typescript
// CHARACTER schema should include:
interface Character {
  // ... existing fields ...
  spellSlots: {
    1: { current: number, max: number },
    2: { current: number, max: number },
    // ... up to 9
  };
  concentration: {
    active: boolean;
    spell: string;
    startedRound: number;
    duration?: number;
  } | null;
  pactMagic?: {
    slots: number;
    slotLevel: number;
    currentSlots: number;
  };
}

// MAGIC module exports:
export function getSpellcastingState(characterId: string)
export function expendSlot(characterId: string, level: number)
export function restoreSlots(characterId: string, restType: 'short' | 'long')
export function breakConcentration(characterId: string, reason: string)
```

**Intersection with Conditions:**
- **CRITICAL:** `incapacitated` condition should auto-break concentration
- `unconscious` condition should auto-break concentration
- Exhaustion Level 6 (death) should break concentration

**Implementation in `manage_condition`:**
```typescript
// When adding incapacitated/unconscious:
if (condition === 'incapacitated' || condition === 'unconscious') {
  import { breakConcentration } from './magic.js';
  breakConcentration(targetId, 'condition: ' + condition);
}
```

---

### 5. COMBAT (Encounter) ↔ CHARACTER (**PARTIAL - NEEDS BIDIRECTIONAL SYNC**)

**Current Status:** Encounter state is separate from character persistence
**Problem:** Changes to HP in combat don't persist to character JSON

**Required Integration:**

```typescript
// COMBAT module should:
export function syncEncounterToCharacter(encounterId: string): void {
  const encounter = getEncounter(encounterId);
  for (const participant of encounter.participants) {
    if (participant.isCharacter) {
      updateCharacter({
        characterId: participant.id,
        hp: participant.currentHp,
        // Conditions handled separately via manage_condition
      });
    }
  }
}

// AUTO-SYNC POINTS:
// 1. end_encounter → Sync all
// 2. take_rest → Sync HP, remove conditions
// 3. advance_turn → Optionally sync (performance concern)
```

**Intersection with Conditions:**
- Conditions added in combat should persist outside combat
- `conditionStore` Map should be serialized to disk (or SQLite)
- **Current Bug:** Conditions are in-memory only, lost on restart

**Fix Required:**
```typescript
// In combat.ts:
const CONDITION_FILE = path.join(DATA_ROOT, 'conditions.json');

function saveConditions() {
  const data = Object.fromEntries(conditionStore);
  fs.writeFileSync(CONDITION_FILE, JSON.stringify(data, null, 2));
}

function loadConditions() {
  if (fs.existsSync(CONDITION_FILE)) {
    const data = JSON.parse(fs.readFileSync(CONDITION_FILE, 'utf-8'));
    for (const [characterId, conditions] of Object.entries(data)) {
      conditionStore.set(characterId, conditions as ActiveCondition[]);
    }
  }
}

// Call loadConditions() on server start
// Call saveConditions() after every change
```

---

### 6. COMBAT (Damage) ↔ CONDITIONS (**PLANNED - HIGH PRIORITY**)

**Predicted Intersection:** Damage application should trigger condition checks

**Required Integration:**

```typescript
// In apply_damage:
export function applyDamage(input: ApplyDamageInput): string {
  // ... calculate final damage ...

  const newHp = Math.max(0, target.hp - finalDamage);

  // INTERSECTION 1: Concentration check
  if (target.concentration?.active) {
    const dc = Math.max(10, Math.floor(finalDamage / 2));
    checkConcentration({
      characterId: targetId,
      damageTaken: finalDamage,
      modifier: calculateModifier(target.stats.con)
    });
  }

  // INTERSECTION 2: Unconscious at 0 HP
  if (newHp === 0 && target.hp > 0) {
    manageCondition({
      targetId,
      operation: 'add',
      condition: 'unconscious',
      source: 'damage: 0 HP'
    });
  }

  // INTERSECTION 3: Death saves
  if (newHp === 0 && target.characterType === 'pc') {
    // Initialize death save tracking
  }

  return formatDamageResult(...);
}
```

**Chain Reaction:**
```
Damage → 0 HP → Unconscious → Prone → Concentration Broken → Spell Ends → Aura Removed
```

---

### 7. SPATIAL ↔ COMBAT ↔ AURAS (**PLANNED - COMPLEX**)

**Predicted Intersection:** Movement triggers aura effects

**Required Integration:**

```typescript
// In move_combatant:
export function moveCombatant(input: MoveCombatantInput): string {
  const oldPosition = target.position;
  const newPosition = input.to;

  // INTERSECTION 1: Opportunity attacks
  const enemiesInRange = getCreaturesInRange({
    from: oldPosition,
    range: 5,
    includeEnemies: true,
    excludeIds: [targetId]
  });

  if (!input.disengage && !input.forcedMovement) {
    // Trigger opportunity attacks
  }

  // INTERSECTION 2: Aura entry/exit
  const auras = getAllActiveAuras(encounterId);
  for (const aura of auras) {
    // Check if exiting aura
    if (isInAuraRange(oldPosition, aura) && !isInAuraRange(newPosition, aura)) {
      processAura({ creatureId: targetId, trigger: 'exit' });
    }

    // Check if entering aura
    if (!isInAuraRange(oldPosition, aura) && isInAuraRange(newPosition, aura)) {
      processAura({ creatureId: targetId, trigger: 'enter' });
    }
  }

  // INTERSECTION 3: Terrain effects
  if (hasHazardAt(newPosition)) {
    applyHazardDamage(targetId, newPosition);
  }

  return formatMovementResult(...);
}
```

**Performance Concern:**
- Each 5ft move could trigger 10+ aura checks
- **Solution:** Cache aura ranges at start of turn

---

### 8. REST ↔ CHARACTER ↔ CONDITIONS ↔ SPELLS (**PLANNED - CRITICAL**)

**Predicted Intersection:** Rest is a MEGA-ORCHESTRATOR

**Required Integration:**

```typescript
export function takeRest(input: TakeRestInput): string {
  const character = getCharacter(input.characterId);
  const results: string[] = [];

  if (input.restType === 'long') {
    // INTERSECTION 1: HP restoration
    if (input.restoreHp) {
      updateCharacter({
        characterId: input.characterId,
        hp: character.maxHp
      });
      results.push(`HP restored to ${character.maxHp}`);
    }

    // INTERSECTION 2: Remove exhaustion (1 level)
    const conditions = getActiveConditions(input.characterId);
    const exhaustion = conditions.find(c => c.condition === 'exhaustion');
    if (exhaustion && exhaustion.exhaustionLevel! > 1) {
      manageCondition({
        targetId: input.characterId,
        operation: 'remove',
        condition: 'exhaustion',
        exhaustionLevels: 1
      });
      results.push(`Exhaustion reduced to level ${exhaustion.exhaustionLevel! - 1}`);
    }

    // INTERSECTION 3: Restore spell slots
    if (input.restoreSpellSlots) {
      restoreAllSpellSlots(input.characterId);
      results.push('All spell slots restored');
    }

    // INTERSECTION 4: Remove specified conditions
    if (input.clearConditions) {
      for (const condition of input.clearConditions) {
        manageCondition({
          targetId: input.characterId,
          operation: 'remove',
          condition
        });
        results.push(`Removed condition: ${condition}`);
      }
    }

    // INTERSECTION 5: Restore hit dice (half, rounded up)
    const hdToRestore = Math.ceil(character.level / 2);
    // ... restore hit dice ...
    results.push(`Restored ${hdToRestore} hit dice`);
  }

  if (input.restType === 'short') {
    // INTERSECTION 6: Spend hit dice for healing
    if (input.hitDiceToSpend) {
      const healing = rollHitDice(character, input.hitDiceToSpend);
      updateCharacter({
        characterId: input.characterId,
        hp: Math.min(character.maxHp, character.hp + healing)
      });
      results.push(`Healed ${healing} HP from ${input.hitDiceToSpend} hit dice`);
    }

    // INTERSECTION 7: Warlock slots (pact magic)
    if (character.pactMagic) {
      restorePactMagicSlots(input.characterId);
      results.push('Pact magic slots restored');
    }
  }

  return createBox('REST COMPLETED', results, undefined, 'HEAVY');
}
```

**Dependencies:**
```
take_rest REQUIRES:
- get_character (read state)
- update_character (HP, hit dice)
- manage_condition (clear conditions, reduce exhaustion)
- manage_spell_slots (restore slots)
- getActiveConditions (check exhaustion)
```

---

### 9. LEVEL_UP ↔ CHARACTER ↔ SPELLS (**PLANNED - MEDIUM PRIORITY**)

**Predicted Intersection:** Level-up affects multiple systems

**Required Integration:**

```typescript
export function levelUp(input: LevelUpInput): string {
  const character = getCharacter(input.characterId);
  const newLevel = input.targetLevel || character.level + 1;
  const results: string[] = [];

  // INTERSECTION 1: HP increase
  let hpGain: number;
  if (input.hpMethod === 'roll') {
    hpGain = rollDice({ expression: character.hitDie });
  } else if (input.hpMethod === 'average') {
    hpGain = Math.ceil(parseInt(character.hitDie.split('d')[1]) / 2) + 1;
  } else if (input.hpMethod === 'max') {
    hpGain = parseInt(character.hitDie.split('d')[1]);
  } else {
    hpGain = input.manualHp!;
  }
  hpGain += calculateModifier(character.stats.con);

  updateCharacter({
    characterId: input.characterId,
    level: newLevel,
    maxHp: character.maxHp + hpGain,
    hp: character.hp + hpGain,
    proficiencyBonus: Math.ceil(newLevel / 4) + 1
  });
  results.push(`Level ${newLevel}! +${hpGain} max HP`);

  // INTERSECTION 2: Spell slots
  const newSlots = calculateSpellSlotsForLevel(character.class, newLevel);
  // Update spell slots...
  results.push('Spell slots updated');

  // INTERSECTION 3: New spells
  if (input.newSpells) {
    updateCharacter({
      characterId: input.characterId,
      knownSpells: [...character.knownSpells!, ...input.newSpells]
    });
    results.push(`Learned: ${input.newSpells.join(', ')}`);
  }

  return createBox('LEVEL UP', results, undefined, 'HEAVY');
}
```

---

### 10. INVENTORY ↔ EQUIPMENT ↔ CHARACTER STATS (**PLANNED - HIGH PRIORITY**)

**Predicted Intersection:** Items directly modify stats

**Required Integration:**

```typescript
// Item database schema:
interface Item {
  id: string;
  name: string;
  type: 'weapon' | 'armor' | 'consumable' | 'wondrous';

  // STAT MODIFIERS (same pattern as conditions!)
  mechanicalEffects?: {
    acBonus?: number;           // Armor, Shield
    strBonus?: number;           // Belt of Giant Strength
    dexBonus?: number;           // Gloves of Dexterity
    speedModifier?: number;      // Boots of Speed
    attackBonus?: number;        // +1 Longsword
    damageBonus?: string;        // +1d6 fire (Flame Tongue)
    savingThrowBonus?: number;   // Ring of Protection
    advantageOn?: string[];      // Cloak of Elvenkind (stealth)
  };

  // Equipment slots
  slot?: 'mainhand' | 'offhand' | 'armor' | 'head' | 'feet' | 'accessory';

  // Consumables
  effect?: string;               // "Heal 2d4+2 HP"
  usesRemaining?: number;
}

// INTEGRATION:
export function calculateEquipmentStats(characterId: string, baseStats): EffectiveStatCalculation {
  const equipped = getEquippedItems(characterId);
  let effective = { ...baseStats };
  const modifiers: string[] = [];

  for (const item of equipped) {
    if (item.mechanicalEffects) {
      if (item.mechanicalEffects.acBonus) {
        effective.ac += item.mechanicalEffects.acBonus;
        modifiers.push(`${item.name}: +${item.mechanicalEffects.acBonus} AC`);
      }
      if (item.mechanicalEffects.strBonus) {
        effective.stats.str = Math.max(effective.stats.str, item.mechanicalEffects.strBonus);
        modifiers.push(`${item.name}: STR = ${item.mechanicalEffects.strBonus}`);
      }
      // ... handle all effects
    }
  }

  return { base: baseStats, effective, modified: modifiers.length > 0, modifiers };
}
```

**Order of Operations for AC:**
```
Base (10)
→ + DEX modifier
→ + Armor (replaces base + DEX for heavy armor)
→ + Shield (+2)
→ + Magic armor bonus (+1)
→ + Magic item (Ring of Protection +1)
→ + Spell effects (Mage Armor, Shield)
→ + Conditions (none affect AC in 5e... YET)
```

---

## Cross-Cutting Concerns

### A. Character Name Resolution (✅ **SOLVED**)

**Problem:** Tools accept characterId (UUID) but users think in names
**Solution:** All tools now accept EITHER `characterId` OR `characterName`

```typescript
// Pattern used in update_character, manage_condition:
let characterId = input.characterId;
if (!characterId && input.characterName) {
  characterId = findCharacterByName(input.characterName);
  if (!characterId) throw new Error('Character not found');
}
```

**Remaining Work:** Extend to ALL character-referencing tools:
- ✅ manage_condition
- ✅ update_character
- ✅ get_character
- ⬜ roll_check
- ⬜ take_rest
- ⬜ level_up
- ⬜ manage_inventory
- ⬜ ALL combat tools (execute_action, apply_damage, etc.)

---

### B. Batch Operation Pattern (✅ **ESTABLISHED**)

**Pattern:** Tools accept `single` OR `{ batch: single[] }`

```typescript
// Established in:
// - roll_dice: expression OR { batch: [...] }
// - update_character: single OR { batch: [...] }
// - manage_condition: single OR { batch: [...] }

// TO EXTEND TO:
// - execute_action (attack multiple targets)
// - apply_damage (AoE spells)
// - apply_healing (Mass Cure Wounds)
// - manage_spell_slots (restore multiple characters)
// - manage_inventory (loot distribution)
```

**Why Batch Matters:**
- Fireball hits 6 enemies → 1 tool call, not 6
- DM applies exhaustion to whole party → 1 call
- End of turn effects → 1 call per mechanic

---

### C. Persistence Strategy (**CRITICAL - MIXED STATUS**)

**Current State:**
- ✅ Characters: JSON files in AppData
- ❌ Conditions: In-memory Map (lost on restart)
- ❌ Encounters: Not implemented
- ❌ Spell slots: Part of character JSON (good!)
- ❌ Equipment: Not implemented
- ❌ Session notes: Not implemented

**Required Fix:**
```typescript
// Option 1: Extend JSON persistence
const PERSISTENCE_FILES = {
  characters: path.join(DATA_ROOT, 'characters/'),
  conditions: path.join(DATA_ROOT, 'conditions.json'),
  encounters: path.join(DATA_ROOT, 'encounters.json'),
  equipment: path.join(DATA_ROOT, 'equipment.json'), // Maps characterId → itemIds
  items: path.join(DATA_ROOT, 'items.json'),         // Item database
  notes: path.join(DATA_ROOT, 'notes.json'),
};

// Option 2: SQLite (as originally planned)
// - Better for queries (search_notes, list_characters)
// - Worse for direct file inspection
// - Requires migration tooling
```

**Recommendation:** JSON for now, SQLite in Phase 2

---

### D. Testing Intersections (**CRITICAL**)

**Current Gap:** Integration tests don't exist

**Required Test Suite:**

```typescript
// tests/integration/condition-character.test.ts
describe('Condition → Character Integration', () => {
  it('should show effective stats in get_character', () => {
    const charId = createCharacter({ name: 'Test' });
    manageCondition({ targetId: charId, operation: 'add', condition: 'exhaustion', exhaustionLevels: 4 });

    const result = getCharacter({ characterName: 'Test' });
    expect(result.markdown).toContain('22/22'); // Halved from 44
    expect(result.markdown).toContain('Exhaustion 4');
  });
});

// tests/integration/damage-condition-concentration.test.ts
describe('Damage → Condition → Concentration Chain', () => {
  it('should break concentration when unconscious', () => {
    // Cast concentration spell
    // Take damage to 0 HP
    // Verify unconscious added
    // Verify concentration broken
  });
});

// tests/integration/rest-multi-system.test.ts
describe('Rest → Multi-System Integration', () => {
  it('should restore HP, slots, and remove exhaustion', () => {
    // Damage character, expend slots, add exhaustion
    // Long rest
    // Verify all restored
  });
});
```

---

## Recommended Implementation Order

### Phase 2: Equipment & Inventory (Next Sprint)
1. Implement `manage_inventory` (give/take/equip/unequip)
2. Create item database JSON
3. Extend `calculateEffectiveStats` to include equipment
4. Add equipment section to `get_character` output
5. Test equipment + condition interaction

**Priority:** HIGH - Equipment is core to D&D gameplay

### Phase 3: Combat Orchestration
1. Implement `create_encounter`
2. Implement `execute_action`
3. Implement `apply_damage` with concentration checks
4. Implement encounter → character HP sync
5. Add condition persistence to disk

**Priority:** HIGH - Combat is the main use case

### Phase 4: Magic System
1. Implement `manage_spell_slots`
2. Implement `check_concentration` / `break_concentration`
3. Implement `create_aura`
4. Integrate magic with combat actions

**Priority:** MEDIUM - Spellcasting enhances combat

### Phase 5: Rest & Recovery
1. Implement `take_rest` with multi-system orchestration
2. Implement `level_up` with spell slot updates
3. Test long rest clearing conditions

**Priority:** MEDIUM - Session transitions

### Phase 6: Session Management
1. Implement `add_session_note`
2. Implement `search_notes`
3. Implement `get_session_context`
4. Test note → character → condition linkage

**Priority:** LOW - DM tooling, not player-facing

---

## Anti-Patterns to Avoid

### ❌ DON'T: Duplicate Stat Modification Logic

```typescript
// BAD: Each system calculates AC independently
function calculateAC_inCombat(char): number {
  return char.ac + armorBonus + conditionPenalty;
}

function calculateAC_inDisplay(char): number {
  return char.ac + equipmentBonus;
}
```

**DO:** Centralize in `calculateEffectiveStats`

```typescript
// GOOD: One source of truth
function calculateEffectiveStats(charId, baseStats): EffectiveStats {
  let stats = { ...baseStats };

  // Layer 1: Equipment
  stats = applyEquipmentBonuses(charId, stats);

  // Layer 2: Conditions
  stats = applyConditionEffects(charId, stats);

  // Layer 3: Effects (boons/curses)
  stats = applyCustomEffects(charId, stats);

  // Layer 4: Spells (active effects)
  stats = applySpellEffects(charId, stats);

  return stats;
}
```

### ❌ DON'T: Hard-Code Cross-Module Logic

```typescript
// BAD: Conditions module knows about magic
if (condition === 'incapacitated') {
  magic.breakConcentration(characterId);
}
```

**DO:** Use event system or callbacks

```typescript
// GOOD: Register hooks
conditionHooks.on('conditionAdded', (charId, condition) => {
  if (['incapacitated', 'unconscious'].includes(condition)) {
    magicSystem.handleConditionChange(charId, condition);
  }
});
```

### ❌ DON'T: Assume In-Memory State Persists

```typescript
// BAD: Conditions lost on restart
const conditionStore = new Map<string, ActiveCondition[]>();
```

**DO:** Persist immediately

```typescript
// GOOD: Save to disk after every change
function setConditions(characterId: string, conditions: ActiveCondition[]) {
  conditionStore.set(characterId, conditions);
  saveConditionsToDisk(); // Persist immediately
}
```

---

## Success Metrics

✅ **Integration is successful when:**
- get_character shows ALL modifiers from ALL systems
- Damage correctly triggers concentration checks
- Exhaustion persists across server restarts
- Equipment bonuses combine correctly with conditions
- Rest operations touch all relevant systems
- Tests cover cross-module interactions

---

_This is a living document. Update as new intersections are discovered._
