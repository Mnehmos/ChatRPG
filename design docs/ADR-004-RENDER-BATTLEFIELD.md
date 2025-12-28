# ADR-004: render_battlefield - 3D Tactical Grid Visualization

## Status: PROPOSED

## Context

We need to render a 3D tactical battlefield (x, y, z coordinates) on a 2D ASCII display. 
The system must clearly convey:
- Entity positions (PCs, NPCs, monsters)
- Elevation (z-axis) differences
- Obstacles (walls, pillars, platforms)
- Terrain types (difficult, water, hazards)
- Conditions affecting movement (flying, prone)

This is the **most complex ASCII rendering** in the system due to dimensionality collapse.

## Current Data Structures

```typescript
// Position (from types.ts)
{ x: number, y: number, z: number }  // z defaults to 0

// Terrain (from combat.ts TerrainSchema)
{
  width: number,           // x-axis size (5-100)
  height: number,          // y-axis size (5-100)
  obstacles: string[],     // e.g., ["5,5", "5,6", "5,7"]
  difficultTerrain: string[],
  water: string[],
  hazards: [{
    position: string,      // e.g., "10,10"
    type: string,
    damage?: string,
    dc?: number
  }]
}

// Participant position
{ x: number, y: number, z: number }
```

## Problem: Obstacles Lack Z-Data

**Current limitation:** Obstacles are stored as `"x,y"` strings without z-information.

**Proposal:** Extend terrain schema to support z-ranges:
```typescript
obstacles: z.array(z.union([
  z.string(),  // "x,y" - ground level (z=0)
  z.object({
    position: z.string(),  // "x,y"
    zMin: z.number().default(0),  // Floor level
    zMax: z.number().default(10), // Ceiling/top (10 = blocks all heights)
  })
])).optional()
```

**For now (MVP):** Treat all obstacles as full-height blockers (z: 0-∞).

---

## Design Decision: Top-Down View with Elevation Legend

### Approach: Single 2D Grid + Elevation Legend

Rather than layered slices or perspective views, use:
1. **Top-down (x,y) grid** - Primary battlefield view
2. **Elevation superscripts** - Numbers next to entities showing z-level
3. **Legend table** - Full detail for each entity (elevation, HP, conditions)

### Why This Approach?
- Text interfaces favor information density over spatial intuition
- LLMs parse legends well
- Avoids cluttered multi-layer views
- Matches D&D VTT mental model (top-down battle maps)

---

## Symbol Vocabulary

### Entities (Single Character)
```
Players/Allies:
  A-Z  = Named characters (first letter of name)
  @    = Current turn (highlighted)
  
Enemies:
  a-z  = Named enemies (lowercase)
  1-9  = Generic enemies (Goblin 1, Goblin 2...)
  
Special:
  ?    = Unknown/hidden
  !    = Surprised
  †    = Dead
  ○    = Unconscious (0 HP)
```

### Terrain Symbols
```
Ground:
  ·    = Empty floor (z=0)
  ░    = Difficult terrain
  ≈    = Water/liquid
  ▓    = Deep water
  
Obstacles:
  █    = Wall/solid obstacle
  ▄    = Half-height obstacle (half cover)
  ◘    = Pillar/column
  ■    = Destructible obstacle
  
Elevation:
  ▲    = Stairs/ramp up
  ▼    = Stairs/ramp down
  ═    = Platform/elevated floor
  
Hazards:
  ☠    = Deadly hazard
  ⚡   = Trap (detected)
  *    = Fire/environmental damage
```

### Elevation Notation (Superscript Style)
Since ASCII can't do true superscripts, use bracketed notation:
```
G[3]  = Goblin at z=3 (30ft elevation)
T[0]  = Thorin at ground level
F[2]  = Flying creature at z=2 (20ft up)
```

Or compact: `G³` if terminal supports unicode superscripts.

---

## Grid Rendering Example

### Simple Battle (8x6 grid)
```
╔═══════════════════════════════════════════════════════╗
║              BATTLEFIELD: Round 3                     ║
╠═══════════════════════════════════════════════════════╣
║     0   1   2   3   4   5   6   7                     ║
║   ┌───┬───┬───┬───┬───┬───┬───┬───┐                   ║
║ 0 │ · │ · │ · │ █ │ █ │ · │ · │ · │                   ║
║   ├───┼───┼───┼───┼───┼───┼───┼───┤                   ║
║ 1 │ · │ T │ · │ █ │ · │ g1│ · │ · │                   ║
║   ├───┼───┼───┼───┼───┼───┼───┼───┤                   ║
║ 2 │ · │ · │ E │ · │ · │ · │ g2│ · │                   ║
║   ├───┼───┼───┼───┼───┼───┼───┼───┤                   ║
║ 3 │ · │ · │ · │ ░ │ ░ │ · │ · │ █ │                   ║
║   ├───┼───┼───┼───┼───┼───┼───┼───┤                   ║
║ 4 │ · │ W │ · │ ░ │ ░ │ · │ · │ █ │                   ║
║   ├───┼───┼───┼───┼───┼───┼───┼───┤                   ║
║ 5 │ · │ · │ · │ · │ · │ · │ B │ · │                   ║
║   └───┴───┴───┴───┴───┴───┴───┴───┘                   ║
╠═══════════════════════════════════════════════════════╣
║ LEGEND                                                ║
║ ───────────────────────────────────────────────────── ║
║ T  Thorin      (1,1) z=0  HP:45/45  ▶ CURRENT TURN    ║
║ E  Elara       (2,2) z=0  HP:32/32                    ║
║ W  Wizard      (1,4) z=0  HP:18/28  ⚠ Bloodied       ║
║ g1 Goblin 1    (5,1) z=0  HP:7/7    👁 Enemy          ║
║ g2 Goblin 2    (6,2) z=0  HP:5/7    👁 Enemy          ║
║ B  Bugbear     (6,5) z=2  HP:27/27  🦅 Flying         ║
║ ───────────────────────────────────────────────────── ║
║ █ Wall  ░ Difficult  ▶ Current Turn  🦅 Flying        ║
╚═══════════════════════════════════════════════════════╝
```

### With Elevation (Multi-Level)
```
╔═══════════════════════════════════════════════════════╗
║        BATTLEFIELD: Tower Assault - Round 2           ║
╠═══════════════════════════════════════════════════════╣
║     0   1   2   3   4                                 ║
║   ┌───┬───┬───┬───┬───┐                               ║
║ 0 │ · │ · │ █ │ · │ · │  Elevation Key:               ║
║   ├───┼───┼───┼───┼───┤  [0] Ground    (0ft)         ║
║ 1 │ · │T⁰ │ █ │A² │ · │  [1] Low       (5ft)         ║
║   ├───┼───┼───┼───┼───┤  [2] Platform  (10ft)        ║
║ 2 │ · │ · │ ▲ │ · │ · │  [3] Tower Top (15ft)        ║
║   ├───┼───┼───┼───┼───┤                               ║
║ 3 │g¹ │ · │ · │ · │g¹ │  ▲ = Stairs Up               ║
║   └───┴───┴───┴───┴───┘                               ║
╠═══════════════════════════════════════════════════════╣
║ COMBATANTS                          z   HP    Status  ║
║ ───────────────────────────────────────────────────── ║
║ T  Thorin (1,1)                     0   38/45         ║
║ A  Archer (3,1)                     2   24/24 🏹      ║
║ g  Goblin x2 (0,3)(4,3)             1   7/7   👁      ║
╚═══════════════════════════════════════════════════════╝
```

---

## Handling Overlapping Entities (Same x,y, Different z)

When multiple entities share x,y coordinates:

### Option A: Stack Notation (Recommended)
Show the "top" entity with a stack indicator:
```
│ T² │   = Thorin + 2 others below (see legend)
│ ⋮3 │   = Stack of 3 entities (details in legend)
```

### Option B: Split Cell
```
│T/g│    = Thorin and goblin at same x,y (different z)
```

### Legend shows full stack:
```
STACKED @ (3,3):
  T  Thorin    z=2  (on platform)
  g1 Goblin    z=0  (ground level)
```

---

## Schema Design

```typescript
export const renderBattlefieldSchema = z.object({
  encounterId: z.string().describe('The encounter to render'),
  
  // Viewport (optional - for large maps)
  viewport: z.object({
    x: z.number().default(0),
    y: z.number().default(0),
    width: z.number().default(20),
    height: z.number().default(15),
  }).optional().describe('Render only a portion of the map'),
  
  // Display options
  showLegend: z.boolean().default(true),
  showCoordinates: z.boolean().default(true),
  showElevation: z.boolean().default(true),
  
  // Focus on specific entity (centers viewport)
  focusOn: z.string().optional().describe('Entity ID to center view on'),
  
  // Highlight options
  highlightCurrent: z.boolean().default(true),
  highlightEnemies: z.boolean().default(true),
  
  // Verbosity
  legendDetail: z.enum(['minimal', 'standard', 'detailed']).default('standard'),
});
```

---

## Implementation Phases

### Phase 1: MVP (Red Phase Target)
- Basic x,y grid rendering
- Entity symbols (first letter)
- Simple legend with positions
- Current turn highlighting
- Wall/obstacle rendering

### Phase 2: Elevation Support
- z-level superscripts on entities
- Elevation key in legend
- Flying/climbing condition display
- Stacked entity handling

### Phase 3: Advanced Features
- Viewport/scrolling for large maps
- Terrain type rendering (difficult, water)
- Hazard visualization
- Cover indicators
- Line-of-sight hints

---

## Testing Strategy

```typescript
describe('render_battlefield', () => {
  describe('Basic Grid', () => {
    it('should render empty grid with coordinates');
    it('should place entities at correct positions');
    it('should show obstacles as █');
    it('should highlight current turn with ▶');
  });
  
  describe('Legend', () => {
    it('should list all entities with positions');
    it('should show HP and status');
    it('should indicate enemies');
  });
  
  describe('Elevation', () => {
    it('should show z-level on entities');
    it('should indicate flying creatures');
    it('should handle stacked entities at same x,y');
  });
  
  describe('Viewport', () => {
    it('should crop to viewport dimensions');
    it('should center on focusOn entity');
  });
});
```

---

## Decision Summary

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| View | Top-down 2D | Most familiar, LLM-friendly |
| Elevation | Superscript notation + legend | Compact, informative |
| Overlaps | Stack indicator + legend detail | Avoids visual clutter |
| Obstacles | Full-height for MVP | Schema extension later |
| Symbols | Single-char with legend | Fits grid cells |

---

## Open Questions

1. **Grid cell width:** 3 chars (`│ T │`) or 1 char (`│T│`)? 3-char allows superscripts.
2. **Max grid size:** What's reasonable before viewport becomes mandatory?
3. **Color support:** Should we detect terminal color support for enemy highlighting?

---

## Related ADRs

- ADR-001: execute_action dependencies (movement/position)
- ADR-003: Tool consolidation (render absorbs nothing, is standalone)

## Related Files

- `src/modules/spatial.ts` - Distance calculations
- `src/modules/ascii-art.ts` - Grid rendering utilities
- `src/modules/combat.ts` - Encounter/terrain state
