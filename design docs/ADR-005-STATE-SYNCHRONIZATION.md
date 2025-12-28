# ADR-005: Encounter-to-Character State Synchronization

## Status
Proposed

## Date
2025-12-20

## Context

During testing (see Engine Refactor Analysis), we discovered that rpg-lite-mcp operates on a **"Simulation vs. Commit"** architecture:

1. When a character joins an encounter via `create_encounter`, a **snapshot** (fork) of their state is created
2. Combat actions (damage, healing, conditions, spell slot usage) modify the **encounter participant state**
3. The **persistent character record** (in `data/characters/*.json`) remains unchanged
4. After combat ends, there is no automatic mechanism to sync changes back

### Verification Results
- Created character `Fenric` with 28 HP
- Combat dealt 5 damage in encounter `c8f1d567` → Encounter State: 23 HP
- Query via `get_character` returned **28 HP** (unchanged persistent state)
- Required manual `update_character(hp: 23)` to align states

### Problem Statement
The current "manual sync" requirement is error-prone. Without explicit client action:
- HP changes are lost
- Spell slot expenditure vanishes
- Applied conditions disappear
- Combat statistics become meaningless for campaign tracking

## Decision

We will enhance encounter management by adding a **commit** operation to `manage_encounter`, following the established composite tool pattern (ADR-003).

### 1. manage_encounter Composite Tool

Consolidates all encounter operations into a single tool with operation enum:

`typescript
export const manageEncounterSchema = z.object({
  operation: z.enum(['create', 'get', 'end', 'commit', 'list']),
  
  // For 'create' operation
  participants: z.array(ParticipantSchema).optional(),
  terrain: TerrainSchema.optional(),
  lighting: LightSchema.optional(),
  surprise: z.array(z.string()).optional(),
  
  // For 'get' operation
  encounterId: z.string().optional(),
  verbosity: z.enum(['minimal', 'summary', 'standard', 'detailed']).optional(),
  
  // For 'end' operation
  outcome: z.enum(['victory', 'defeat', 'fled', 'negotiated', 'other']).optional(),
  generateSummary: z.boolean().optional(),
  preserveLog: z.boolean().optional(),
  notes: z.string().optional(),
  
  // For 'commit' operation
  characterIds: z.array(z.string()).optional(),  // Selective commits
  excludeConditions: z.boolean().optional(),
  excludeSpellSlots: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});
`

### 2. State Diff Tracking (ParticipantStateDiff)

Each encounter participant tracks their **initial snapshot** and computes a diff:

`typescript
interface ParticipantStateDiff {
  participantId: string;
  characterId?: string;        // Undefined for ephemeral NPCs
  isEphemeral: boolean;        // True if not linked to persistent character
  changes: {
    hp: { initial: number; final: number; delta: number };
    conditions: {
      added: string[];
      removed: string[];
      active: string[];
    };
    spellSlots?: {
      level: number;
      initial: number;
      final: number;
      expended: number;
    }[];
    resources?: {
      name: string;
      initial: number;
      final: number;
      delta: number;
    }[];
    statistics: {
      damageDealt: number;
      damageTaken: number;
      healingDone: number;
      attacksMade: number;
      attacksHit: number;
    };
  };
}
`

### 3. Enhanced 'end' Operation Response

The `end` operation returns state diffs for all participants:

`typescript
// end operation output includes:
{
  encounterId: string;
  outcome: 'victory' | 'defeat' | 'fled' | 'negotiated' | 'other';
  summary: CombatSummary;
  participantUpdates: ParticipantStateDiff[];
  commitRequired: boolean;  // True if any persistent character was modified
}
`

### 4. New 'commit' Operation

Applies state diffs to persistent characters:

`typescript
// commit operation input
{
  operation: 'commit',
  encounterId: string,
  characterIds?: string[],    // If omitted, commit all persistent characters
  excludeConditions?: boolean,
  excludeSpellSlots?: boolean,
  dryRun?: boolean,
}

// commit operation output
{
  committed: Array<{ characterId, characterName, changes }>,
  skipped: Array<{ participantId, reason: 'ephemeral' | 'not_found' | 'excluded' }>,
  errors: Array<{ characterId, error }>,
}
`

### 5. Participant Type Enforcement

Strict separation via optional `characterId` field:

- **Persistent Characters**: Have `characterId` linking to stored character
- **Ephemeral NPCs**: No `characterId`, state discarded at encounter end

`typescript
const ParticipantSchema = z.object({
  id: z.string(),                    // Encounter-local ID
  characterId: z.string().optional(), // Link to persistent character
  name: z.string(),
  hp: z.number(),
  maxHp: z.number(),
  // ... existing fields
});
`

## Tool Consolidation (ADR-003 Pattern)

### Absorbed Tools

| Original Tool | Absorbed Into | Via |
|--------------|---------------|-----|
| `create_encounter` | `manage_encounter` | `operation: 'create'` |
| `get_encounter` | `manage_encounter` | `operation: 'get'` |
| `end_encounter` | `manage_encounter` | `operation: 'end'` |
| (NEW) commit | `manage_encounter` | `operation: 'commit'` |

### New Operations

| Operation | Purpose |
|-----------|---------|
| `create` | Initialize encounter with participants |
| `get` | Query encounter state (verbosity levels) |
| `end` | Conclude encounter with outcome |
| `commit` | Sync state diffs to persistent characters |
| `list` | List active/preserved encounters |

## Consequences

### Positive
- **Consistent Pattern**: Follows established `manage_*` composite tool pattern
- **Reduced Tool Count**: 4 tools → 1 tool (net reduction of 3)
- **Clear Separation**: Simulation state explicitly isolated from persistence
- **Intentional Commits**: State changes require explicit `commit` operation
- **Flexible Recovery**: Can preview with `dryRun` before committing

### Negative
- **Migration Required**: Existing code using separate tools needs updating
- **Larger Schema**: Single schema handles multiple operations

## Implementation Plan

### Phase 1: Red (Tests) ← CURRENT
1. Write tests for `manage_encounter` composite tool
2. Write tests for `operation: 'commit'` with state diffs
3. Write tests for `characterId` linking
4. Write tests for ephemeral vs persistent handling

### Phase 2: Green (Implementation)
1. Create `manage_encounter` composite tool
2. Add `initialSnapshot` tracking to participants
3. Implement diff calculation
4. Implement commit operation
5. Deprecate separate encounter tools

### Phase 3: Blue (Refactor)
1. Extract state diff logic into module
2. Add JSDoc documentation
3. Update TOOLS_CHECKLIST.md

## References
- Engine Refactor Analysis (user request)
- ADR-001: Execute Action Dependencies
- ADR-003: Tool Consolidation
