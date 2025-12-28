# Blue Phase Orchestrator Protocol
## Code Quality Refactor • ChatRPG MCP Server

> **Status:** 1098 tests passing | 31/34 tools complete | Full Blue Phase sweep

---

## 🎯 Blue Phase Mission

Elevate code quality across the entire ChatRPG codebase without changing any behavior. Tests must pass before and after each atomic task.

### Quality Metrics
| Metric | Before | Target |
|--------|--------|--------|
| TypeScript `any` usage | Audit needed | Zero |
| JSDoc coverage | Partial | 100% exports |
| Helper extraction | Inconsistent | DRY patterns |
| Constants | Magic numbers | Named constants |
| Test isolation | Good | Verify cleanup |

---

## 📋 Atomic Task Queue

### Execution Rules
1. **One task at a time** - Complete fully before next
2. **Test before/after** - Run `npx vitest run` before starting, after completing
3. **Commit per task** - `refactor(<module>): <task description>`
4. **No behavior changes** - If tests fail, revert and investigate

---

## 🔵 Module: characters.ts

### CHAR-01: Type Safety Audit
**Objective:** Eliminate all `any` types

**Steps:**
1. Search for `any` in `src/modules/characters.ts`
2. Replace with proper types from `types.ts` or define new interfaces
3. Run `npx tsc --noEmit` to verify no type errors

**Guidance:**
```typescript
// BEFORE
const updates: any = {};

// AFTER
interface CharacterUpdatePayload {
  hp?: number;
  maxHp?: number;
  stats?: Partial<AbilityScores>;
  // ... exhaustive fields
}
const updates: CharacterUpdatePayload = {};
```

**Quality Gate:** `npx vitest run tests/characters`

---

### CHAR-02: Extract HP Calculation Helpers
**Objective:** DRY the HP calculation logic

**Current Pattern Locations:**
- `createCharacter` - Initial HP calculation
- `levelUp` - Level-up HP calculation  
- `takeRest` - Hit dice healing

**Steps:**
1. Create `calculateHitPoints(level: number, hitDie: number, conMod: number, method: HpMethod): number`
2. Create `calculateHitDiceHealing(hitDie: number, conMod: number): number`
3. Replace inline calculations with helper calls
4. Ensure minimum 1 HP per level is enforced consistently

**Guidance:**
```typescript
// Place in characters.ts near top after imports

/**
 * Calculate HP gain for a character level-up
 * @param hitDie - Class hit die (d6/d8/d10/d12)
 * @param conMod - Constitution modifier
 * @param method - Calculation method (average/max/roll)
 * @param roll - Optional manual roll value
 * @returns HP gain (minimum 1)
 */
function calculateLevelUpHp(
  hitDie: number,
  conMod: number,
  method: 'average' | 'max' | 'roll' | 'manual',
  roll?: number
): number {
  let baseHp: number;
  
  switch (method) {
    case 'average':
      baseHp = Math.floor(hitDie / 2) + 1;
      break;
    case 'max':
      baseHp = hitDie;
      break;
    case 'roll':
      baseHp = roll ?? Math.floor(Math.random() * hitDie) + 1;
      break;
    case 'manual':
      return roll ?? 1; // Manual bypasses conMod
    default:
      baseHp = Math.floor(hitDie / 2) + 1;
  }
  
  return Math.max(1, baseHp + conMod);
}
```

**Quality Gate:** `npx vitest run tests/characters/level_up.test.ts tests/characters/create_character.test.ts`

---

### CHAR-03: Constants Extraction
**Objective:** Replace magic numbers with named constants

**Targets:**
- `20` → `MAX_CHARACTER_LEVEL`
- `1` → `MIN_CHARACTER_LEVEL`
- `30` → `MAX_ABILITY_SCORE`
- `1` → `MIN_ABILITY_SCORE`
- `20` → `MAX_BATCH_SIZE`
- Hit die values by class

**Steps:**
1. Create constants block at top of file
2. Search and replace all occurrences
3. Export constants if needed by other modules

**Guidance:**
```typescript
// Constants
const CHARACTER_LIMITS = {
  MAX_LEVEL: 20,
  MIN_LEVEL: 1,
  MAX_ABILITY_SCORE: 30,
  MIN_ABILITY_SCORE: 1,
  MAX_BATCH_SIZE: 20,
} as const;

const CLASS_HIT_DICE: Record<string, number> = {
  barbarian: 12,
  bard: 8,
  cleric: 8,
  druid: 8,
  fighter: 10,
  monk: 8,
  paladin: 10,
  ranger: 10,
  rogue: 8,
  sorcerer: 6,
  warlock: 8,
  wizard: 6,
} as const;
```

**Quality Gate:** `npx vitest run tests/characters`

---

### CHAR-04: JSDoc Enhancement
**Objective:** Add comprehensive JSDoc to all exported functions

**Template:**
```typescript
/**
 * Brief description of what the function does
 * 
 * @param args - Validated input parameters (describe shape)
 * @returns Result object with success flag and formatted output
 * @throws Never - errors returned in result.error
 * 
 * @example
 * ```typescript
 * const result = createCharacter({ name: 'Fenric', class: 'wizard' });
 * // result.success === true
 * // result.markdown contains ASCII character sheet
 * ```
 * 
 * @see {@link updateCharacter} for modifying existing characters
 */
```

**Targets:**
- `createCharacter`
- `getCharacter`  
- `updateCharacter`
- `deleteCharacter`
- `rollCheck`
- `takeRest`
- `manageSpellSlots`
- `levelUp`

**Quality Gate:** Build with `npm run build`, check no JSDoc warnings

---

## 🔵 Module: combat.ts

### COMB-01: Type Safety Audit
**Objective:** Replace `any` with proper encounter/participant types

**Key Types to Define/Use:**
```typescript
interface EncounterParticipant {
  id: string;
  characterId?: string; // Links to persistent character
  name: string;
  hp: number;
  maxHp: number;
  ac: number;
  position: Position;
  conditions: ConditionInstance[];
  isEnemy: boolean;
  // ... full shape
}

interface EncounterState {
  id: string;
  round: number;
  turn: number;
  participants: EncounterParticipant[];
  terrain: TerrainState;
  lighting: Lighting;
  // ...
}
```

**Quality Gate:** `npx vitest run tests/combat`

---

### COMB-02: Extract Death Save Logic
**Objective:** Consolidate death save state management

**Current Issue:** Death save state scattered in multiple places

**Steps:**
1. Create `DeathSaveTracker` interface
2. Extract `checkDeathSaveOutcome()` helper
3. Extract `resetDeathSaves()` helper
4. Ensure nat 20 revive properly clears tracker

**Guidance:**
```typescript
interface DeathSaveTracker {
  successes: number;
  failures: number;
}

type DeathSaveOutcome = 
  | { status: 'success'; message: string }
  | { status: 'failure'; message: string }
  | { status: 'stable'; message: string }
  | { status: 'dead'; message: string }
  | { status: 'revived'; message: string };

function evaluateDeathSave(
  roll: number,
  tracker: DeathSaveTracker,
  modifier: number = 0
): { outcome: DeathSaveOutcome; updatedTracker: DeathSaveTracker } {
  const total = roll + modifier;
  const updatedTracker = { ...tracker };
  
  // Nat 20 - revive
  if (roll === 20) {
    return {
      outcome: { status: 'revived', message: 'NATURAL 20! You regain consciousness at 1 HP!' },
      updatedTracker: { successes: 0, failures: 0 }
    };
  }
  
  // Nat 1 - two failures
  if (roll === 1) {
    updatedTracker.failures += 2;
  } else if (total >= 10) {
    updatedTracker.successes += 1;
  } else {
    updatedTracker.failures += 1;
  }
  
  // Check for stabilization or death
  if (updatedTracker.successes >= 3) {
    return {
      outcome: { status: 'stable', message: 'You stabilize! (Unconscious but no longer dying)' },
      updatedTracker
    };
  }
  
  if (updatedTracker.failures >= 3) {
    return {
      outcome: { status: 'dead', message: 'Three failures. Death claims you.' },
      updatedTracker
    };
  }
  
  return {
    outcome: {
      status: total >= 10 ? 'success' : 'failure',
      message: total >= 10 ? 'Success!' : 'Failure...'
    },
    updatedTracker
  };
}
```

**Quality Gate:** `npx vitest run tests/combat/roll_death_save.test.ts`

---

### COMB-03: Consolidate Encounter Formatters
**Objective:** DRY the verbosity-level formatters

**Current State:** `formatMinimal`, `formatSummary`, `formatStandard`, `formatDetailed` have duplicated participant iteration

**Steps:**
1. Create base `formatParticipantRow()` helper
2. Create `formatParticipantList(participants, detail: VerbosityLevel)` 
3. Refactor formatters to compose from shared helpers

**Quality Gate:** `npx vitest run tests/combat/get_encounter.test.ts`

---

### COMB-04: Action Type Registry
**Objective:** Centralize action type definitions and validation

**Steps:**
1. Create `ACTION_TYPES` constant with metadata
2. Include: cost (action/bonus/reaction), requirements, effects
3. Replace scattered validation logic with registry lookups

**Guidance:**
```typescript
interface ActionTypeDefinition {
  name: string;
  cost: 'action' | 'bonus_action' | 'reaction' | 'free';
  requiresTarget: boolean;
  requiresWeapon: boolean;
  triggersOpportunityAttack: boolean;
  description: string;
}

const ACTION_REGISTRY: Record<string, ActionTypeDefinition> = {
  attack: {
    name: 'Attack',
    cost: 'action',
    requiresTarget: true,
    requiresWeapon: true,
    triggersOpportunityAttack: false,
    description: 'Make a melee or ranged weapon attack'
  },
  dash: {
    name: 'Dash',
    cost: 'action',
    requiresTarget: false,
    requiresWeapon: false,
    triggersOpportunityAttack: false,
    description: 'Double your movement for this turn'
  },
  // ... all 14 action types
};
```

**Quality Gate:** `npx vitest run tests/combat/execute_action.test.ts`

---

## 🔵 Module: magic.ts

### MAGIC-01: Concentration State Type Safety
**Objective:** Strong typing for concentration tracking

**Steps:**
1. Define `ConcentrationState` interface
2. Define `ConcentrationCheckResult` type
3. Replace any inline object shapes

**Guidance:**
```typescript
interface ConcentrationState {
  characterId: string;
  spellName: string;
  startedRound?: number;
  duration?: number;
  targets: string[];
}

type ConcentrationCheckResult =
  | { maintained: true; roll: number; dc: number }
  | { maintained: false; roll: number; dc: number; reason: string };
```

**Quality Gate:** `npx vitest run tests/magic/manage_concentration.test.ts`

---

### MAGIC-02: Scroll Stats Table
**Objective:** Extract DMG scroll stats to constant

**Steps:**
1. Create `SCROLL_STATS` lookup table
2. Include: saveDC, attackBonus, rarity per spell level
3. Replace inline calculations

**Guidance:**
```typescript
interface ScrollStats {
  saveDC: number;
  attackBonus: number;
  rarity: string;
}

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
  9: { saveDC: 19, attackBonus: 11, rarity: 'Legendary' },
};
```

**Quality Gate:** `npx vitest run tests/magic/use_scroll.test.ts`

---

### MAGIC-03: Synthesize Spell DC Calculator
**Objective:** Extract Arcana DC calculation to helper

**Steps:**
1. Create `calculateSynthesisDC()` function
2. Handle all modifiers: level, ley line, components, desperation
3. Add JSDoc with DC breakdown

**Quality Gate:** `npx vitest run tests/magic/synthesize_spell.test.ts`

---

## 🔵 Module: spatial.ts

### SPAT-01: Position Type Consistency
**Objective:** Use `Position` type everywhere

**Steps:**
1. Audit all `{x, y, z}` inline types
2. Replace with `Position` from types.ts
3. Ensure optional z defaults to 0

**Quality Gate:** `npx vitest run tests/spatial`

---

### SPAT-02: Movement Cost Constants
**Objective:** Centralize terrain movement costs

**Steps:**
1. Create `TERRAIN_COSTS` constant
2. Document D&D 5e rules (difficult = 2x, obstacle = impassable)

**Guidance:**
```typescript
const TERRAIN_COSTS: Record<string, number> = {
  normal: 1,
  difficultTerrain: 2,
  water: 2,
  obstacle: Infinity,
} as const;
```

**Quality Gate:** `npx vitest run tests/spatial/calculate_movement.test.ts`

---

### SPAT-03: Cover Calculation Helpers
**Objective:** DRY cover/LoS calculations

**Steps:**
1. Extract `calculateCoverFromObstacle()` 
2. Extract `determineCoverLevel()` (none/half/three-quarters/total)
3. Share between `check_cover` and `check_line_of_sight`

**Quality Gate:** `npx vitest run tests/spatial/check_cover.test.ts tests/spatial/check_line_of_sight.test.ts`

---

## 🔵 Module: data.ts

### DATA-01: Location Graph Type Safety
**Objective:** Strong typing for location graph

**Steps:**
1. Define `LocationNode` interface
2. Define `LocationEdge` interface  
3. Define `LocationGraph` type

**Guidance:**
```typescript
interface LocationNode {
  id: string;
  name: string;
  description?: string;
  locationType: LocationType;
  lighting: Lighting;
  terrain?: TerrainType;
  size?: Size;
  hazards: string[];
  tags: string[];
  discovered: boolean;
  properties: Record<string, unknown>;
}

interface LocationEdge {
  fromId: string;
  toId: string;
  connectionType: ConnectionType;
  locked: boolean;
  lockDC?: number;
  hidden: boolean;
  findDC?: number;
  oneWay: boolean;
  description?: string;
}

interface LocationGraph {
  nodes: Map<string, LocationNode>;
  edges: LocationEdge[];
  currentLocationId: string | null;
}
```

**Quality Gate:** `npx vitest run tests/data/manage_location.test.ts`

---

### DATA-02: Party State Type
**Objective:** Define party composition types

**Steps:**
1. Define `PartyMember` interface
2. Define `PartyState` interface
3. Strong type role assignments

**Guidance:**
```typescript
type PartyRole = 'leader' | 'scout' | 'healer' | 'tank' | 'support' | 'damage' | 'utility' | 'other';

interface PartyMember {
  characterId: string;
  characterName: string;
  role?: PartyRole;
  joinedAt: string; // ISO timestamp
}

interface PartyState {
  members: PartyMember[];
  currentLocationId?: string;
}
```

**Quality Gate:** `npx vitest run tests/data/manage_party.test.ts`

---

## 🔵 Module: ascii-art.ts

### ASCII-01: Box Style Type Safety
**Objective:** Type the box style parameter

**Steps:**
1. Define `BoxStyle` type
2. Type `createBox` signature properly
3. Document available styles

**Guidance:**
```typescript
type BoxStyle = 'HEAVY' | 'LIGHT' | 'DOUBLE';

/**
 * Create an ASCII art box with content
 * 
 * @param title - Box title (centered)
 * @param content - Array of content lines
 * @param width - Optional fixed width (auto-sizes to content if omitted, 40-80 range)
 * @param style - Box border style (HEAVY/LIGHT/DOUBLE)
 * @returns Formatted ASCII box string
 */
export function createBox(
  title: string,
  content: string[],
  width?: number,
  style: BoxStyle = 'HEAVY'
): string;
```

**Quality Gate:** `npx vitest run` (any test using ASCII output)

---

## 🔵 Module: registry.ts

### REG-01: Handler Type Safety
**Objective:** Properly type tool handlers

**Steps:**
1. Define `ToolHandler<TArgs, TResult>` generic type
2. Replace `(args: unknown)` with proper types
3. Ensure Zod parsing provides type inference

**Guidance:**
```typescript
type ToolHandler<TArgs = unknown> = (args: TArgs) => Promise<CallToolResult>;

interface TypedToolDefinition<TArgs = unknown> {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  handler: ToolHandler<TArgs>;
}
```

**Quality Gate:** `npm run build` (TypeScript compilation)

---

## 🔵 Global: types.ts

### TYPES-01: Centralize Shared Types
**Objective:** Move repeated types to types.ts

**Candidates:**
- `Position` (already there, ensure used everywhere)
- `AbilityScores` 
- `Condition` enum/union
- `DamageType` enum
- `Size` enum
- `Lighting` enum

**Steps:**
1. Audit each module for inline type definitions
2. Move shared types to types.ts
3. Update imports across all modules

**Quality Gate:** `npm run build`

---

## 📋 Execution Order

### Phase 1: Foundation (types.ts, ascii-art.ts, registry.ts)
```
TYPES-01 → ASCII-01 → REG-01
```
*Establishes type foundation for other modules*

### Phase 2: Core Modules (characters.ts, combat.ts)
```
CHAR-01 → CHAR-02 → CHAR-03 → CHAR-04
COMB-01 → COMB-02 → COMB-03 → COMB-04
```
*Can parallelize between characters and combat*

### Phase 3: Support Modules (magic.ts, spatial.ts)
```
MAGIC-01 → MAGIC-02 → MAGIC-03
SPAT-01 → SPAT-02 → SPAT-03
```
*Can parallelize between magic and spatial*

### Phase 4: Data Module (data.ts)
```
DATA-01 → DATA-02
```
*Final module, may need types from Phase 1*

---

## ✅ Completion Checklist

### Per-Module Sign-Off
- [ ] **types.ts** - TYPES-01 complete
- [ ] **ascii-art.ts** - ASCII-01 complete  
- [ ] **registry.ts** - REG-01 complete
- [ ] **characters.ts** - CHAR-01, CHAR-02, CHAR-03, CHAR-04 complete
- [ ] **combat.ts** - COMB-01, COMB-02, COMB-03, COMB-04 complete
- [ ] **magic.ts** - MAGIC-01, MAGIC-02, MAGIC-03 complete
- [ ] **spatial.ts** - SPAT-01, SPAT-02, SPAT-03 complete
- [ ] **data.ts** - DATA-01, DATA-02 complete

### Quality Gates
- [ ] `npx vitest run` - All 1098 tests passing
- [ ] `npm run build` - No TypeScript errors
- [ ] `npx tsc --noEmit` - No type warnings
- [ ] Zero `any` usage in src/
- [ ] JSDoc on all exported functions

---

## 🔧 Commands Reference

```bash
# Run all tests
npx vitest run

# Run specific module tests
npx vitest run tests/characters
npx vitest run tests/combat
npx vitest run tests/magic
npx vitest run tests/spatial
npx vitest run tests/data

# Run specific tool tests
npx vitest run tests/characters/level_up.test.ts

# Type check without building
npx tsc --noEmit

# Full build
npm run build

# Search for any types
grep -r "any" src/modules/ --include="*.ts"

# Count test assertions
npx vitest run --reporter=verbose 2>&1 | grep -c "✓"
```

---

_Blue Phase Orchestrator v1.0 • ChatRPG MCP Server_
_Generated: 2025-12-21_
