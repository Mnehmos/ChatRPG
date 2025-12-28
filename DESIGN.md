# RPG-Lite MCP: Design Document

## Lightweight D&D 5e Engine • 42 Core Tools • TDD Protocol

---

## 🎯 Vision

A **text-only LLM-as-DM engine** with full D&D 5e action economy, focused on tactical combat and session management. No procedural overworld generation—locations are narrative constructs.

---

## 🔧 Tech Stack

| Component      | Choice                       | Rationale                     |
| -------------- | ---------------------------- | ----------------------------- |
| **Runtime**    | Node.js (LTS)                | Universal, stable             |
| **Language**   | TypeScript (Strict)          | Type safety, IDE support      |
| **Testing**    | Vitest                       | Fast, native TS, watch mode   |
| **Validation** | Zod                          | Schema-first, runtime checks  |
| **Data**       | Local JSON                   | Simple, portable, no DB setup |
| **Protocol**   | MCP (Model Context Protocol) | LLM tool interface standard   |

---

## 📐 Architecture

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
│         42 Tools • Meticulous Zod Schemas                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 49 Core Tools

### Combat (15)

`create_encounter` (auto-init), `get_encounter`, `get_encounter_summary`, `execute_action` (Hub: Move, Attack, Heal, Spell, Lair), `advance_turn`, `end_encounter`, `apply_damage` (batch), `roll_death_save`, `manage_condition`, `render_battlefield`, `modify_terrain`

### Spatial (8)

`calculate_aoe`, `measure_distance`, `check_line_of_sight`, `check_cover`, `place_prop`, `calculate_movement`, `get_adjacent_squares`

### Magic (10)

`check_concentration`, `break_concentration`, `get_concentration`, `manage_spell_slots`, `use_scroll`, `create_aura`, `process_aura`, `synthesize_spell`

### Characters (9)

`create_character`, `get_character`, `update_character`, `list_characters`, `delete_character`, `roll_check`, `roll_dice`, `quick_roll`, `take_rest`, `level_up` A fully functional character sheet.

### Data (7)

`manage_inventory`, `manage_party`, `create_location`, `get_location`, `move_party`, `add_session_note`, `search_notes`, `get_session_context`

---

## ⚔️ Output Standard: Immersive ASCII Art

**ALL TOOLS MUST RETURN IMMERSIVE ASCII ART.** The chat IS the game.

All tool outputs use box drawing characters to create visually appealing, game-like interfaces:
- **Box Drawing**: Heavy borders (╔═══╗) for titles/headers, light borders (┌───┐) for tables
- **Visual Elements**: Dice faces (●), HP bars (█████░░░), arrow paths (→→↓↓)
- **Width Standard**: Content-aware auto-sizing (40-80 char range, adapts to content length)
- **Typography**: Uppercase for headers, mixed case for content, proper spacing

```
╔═══════════════════════ ATTACK RESULT ══════════════════════╗
║                    TARGET: Goblin Sniper                    ║
║                                                             ║
║ ──────────────────────────────────────────────────────────  ║
║                                                             ║
║                       Attack Roll: 18                       ║
║                      (16 + 2) vs AC 12                      ║
║                           HIT!                              ║
║                                                             ║
║ ──────────────────────────────────────────────────────────  ║
║                                                             ║
║                    Damage: 6 slashing                       ║
║              Goblin Sniper: 4/10 HP (BLOODIED)              ║
╚════════════════════════════════════════════════════════════╝
```

**Design Principles:**
- Centered titles and major headings
- Left-aligned descriptive text
- Visual separators between sections
- Consistent spacing and padding
- Terminal-friendly (works in all monospace contexts)

---

## 📊 Phase 1 Sprint: ASCII Conversion Learnings

### Implementation Pattern Established

All 6 Phase 1 tools now use consistent ASCII rendering via `src/modules/ascii-art.ts`:

**Core Utilities:**
- `createBox(title, content, width?, style)` - Main wrapper with auto-sizing (width optional)
- `centerText(text, width)` - Center alignment for titles/headers
- `padText(text, width, align)` - Left/right/center padding for body text
- `createTableRow(cells, widths, style)` - Formatted table rows
- `createStatusBar(current, max, width, label)` - Visual HP/resource bars
- `renderDiceHorizontal(values)` - Dice face visualization
- `drawPath(from, to)` - Arrow paths for spatial movement

**Box Styles:**
- `HEAVY` (╔═══╗) - Tool output wrapper, major sections
- `LIGHT` (┌───┐) - Tables, subsections, dividers
- `DOUBLE` - Reserved for critical/emergency messages

### Schema Predictions for Future Tools

Based on Phase 1, all future tools will need:

**1. Combat Tools** (`create_encounter`, `execute_action`, `resolve_attack`)
```typescript
// Expected output components:
- Initiative tracker (table with LIGHT borders)
- Turn order visualization (arrows/positioning)
- HP bars for all participants
- Damage/healing rolls (dice faces where applicable)
- Status effects (condition icons/text with separators)
```

**2. Character Management** (`update_character`, `list_characters`, `roll_check`)
```typescript
// Expected output components:
- Character sheet headers (HEAVY box)
- Stat comparison tables (before/after for updates)
- List views with pagination indicators
- Check result boxes (similar to dice rolls)
```

**3. Spatial Tools** (`calculate_aoe`, `check_line_of_sight`, `render_battlefield`)
```typescript
// Expected output components:
- Grid rendering with createGrid() utility
- AoE shape visualization (filled regions)
- Line-of-sight paths (arrow sequences)
- Cover indicators (special symbols)
```

**4. Magic Tools** (`manage_spell_slots` ✅, `check_concentration`, `create_aura`)
```typescript
// manage_spell_slots IMPLEMENTED (44 tests):
// - Spell slot visualization: ●●●○ (available/expended)
// - Pact magic slots: ◆◆◇ (warlock-specific)
// - Full/Half/Third caster progression by class
// - Operations: view, expend, restore, set (DM override)
// - Integration: take_rest restores, execute_action expends
// - Batch support for party spell tracking

// Future concentration/aura features:
- Concentration indicators (special frames)
- Aura radii (visual circles/squares on grid)
- Spell effect descriptions (formatted boxes)
```

### Breaking Changes from Markdown Era

**Test Assertion Updates Required:**
- ❌ `expect(text).toContain('**HP:**')` (Markdown bold)
- ✅ `expect(text).toContain('HP: [')` (ASCII bar)
- ❌ `expect(text).toContain('# Title')` (Markdown header)
- ✅ `expect(text).toContain('╔')` (ASCII box border)
- ❌ `expect(text).toMatch(/\*\*(.*?)\*\*/)` (Bold extraction)
- ✅ `expect(text).toMatch(/Character ID: ([a-z0-9-]+)/)` (Plain text)

**Output Pattern Evolution:**
```typescript
// OLD: Markdown concatenation
return `## Title\n**Field:** ${value}\n- List item`;

// NEW: ASCII composition with auto-sizing
const content: string[] = [];
content.push('TITLE');
content.push(`Field: ${value}`);
return createBox('SECTION', content, undefined, 'HEAVY'); // Auto-sizes to content
```

### Future Tool Scaffold Template

```typescript
// src/modules/[module].ts
import { createBox, BOX } from './ascii-art.js';

export function formatToolResult(data: SomeType): string {
  const content: string[] = [];
  const box = BOX.LIGHT;

  // Header
  content.push('TOOL RESULT');
  content.push('');

  // Divider (auto-adjusts to box width)
  content.push('─'.repeat(40));
  content.push('');

  // Content sections (no manual padding needed, createBox handles it)
  content.push(`Key: ${data.value}`);

  // Footer divider if needed
  content.push('');
  content.push('─'.repeat(40));

  // Auto-sizes to content (40-80 char range)
  return createBox('TOOL NAME', content, undefined, 'HEAVY');
}
```

---

## 🧪 TDD Protocol: Red → Green → Refactor

> **"No logic code is written until a test fails for it."**

1. **🔴 RED**: Write a failing test.
2. **🟢 GREEN**: Write minimum code to pass.
3. **🔵 REFACTOR**: Clean up, run tests again.

---

## 🎮 Key Design Decisions (From Gladiator Playtest)

| Learning                  | Solution                                       |
| ------------------------- | ---------------------------------------------- |
| Permission-seeking LLM    | Rich Markdown output with momentum cues        |
| Manual HP sync            | Write-through persistence (combat → character) |
| Dice before action        | `manualRoll` param in `execute_action`         |
| Condition effects ignored | Automatic penalty application                  |
| Context window limits     | `get_session_context` ("DM Brain Injection")   |

---

## 🗺️ Node-Based Room Management

Locations are **nodes** in a graph, connected by **edges**. This enables narrative exploration without coordinate grids.

### Structure

```
      [Tavern]
         │
      [door]
         ↓
      [Street] ──[alley]──> [Warehouse]
         │
     [stairs]
         ↓
      [Sewers] ~~[hidden]~~> [Thieves Guild]
```

### Node (Room) Properties

```typescript
interface Room {
  id: string;
  name: string;
  description: string;
  lighting: "bright" | "dim" | "darkness";
  tags: string[]; // ['tavern', 'safe', 'rest']
  npcsPresent: string[]; // Character IDs
  itemsPresent: string[]; // Item IDs
  combatGrid?: CombatGrid; // Optional: only when combat starts
}
```

### Edge (Connection) Properties

```typescript
interface Connection {
  from: string; // Room ID
  to: string; // Room ID
  type: "door" | "passage" | "stairs" | "ladder" | "portal" | "hidden";
  locked?: boolean;
  hidden?: boolean; // Requires Perception/Investigation
  oneWay?: boolean; // e.g., trapdoor, cliff
  travelTime?: number; // Minutes (optional for pacing)
}
```

### Tools Impact

| Tool               | Node Integration                      |
| ------------------ | ------------------------------------- |
| `create_location`  | Creates a node                        |
| `get_location`     | Returns node + connected edges        |
| `create_encounter` | Attaches a combatGrid to current room |
| `move_party`       | Traverse an edge (new tool?)          |

---

## 📂 Directory Structure

```
rpg-lite-mcp/
├── DESIGN.md              # This file
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts           # MCP Server Entry
│   ├── types/             # Shared Enums & Interfaces
│   └── modules/
│       ├── combat/        # Combat Logic + Tools
│       ├── spatial/       # Spatial Logic + Tools
│       ├── magic/         # Magic Logic + Tools
│       └── data/          # Persistence + Session Tools
├── tests/
│   └── modules/           # Mirror of src/modules
└── data/                  # Runtime JSON stores
```

---

_Version: 0.2.0-tdd_
_Author: Mnehmos + Claude_
_Date: 2025-12-17_
