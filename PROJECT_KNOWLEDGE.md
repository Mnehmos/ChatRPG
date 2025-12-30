# mnehmos.chatrpg.game - Knowledge Base Document

## Quick Reference

| Property | Value |
|----------|-------|
| **Repository** | https://github.com/Mnehmos/mnehmos.chatrpg.game |
| **Primary Language** | TypeScript |
| **Project Type** | MCP Server / Game |
| **Status** | Active |
| **Last Updated** | 2025-12-29 |

## Overview

mnehmos.chatrpg.game is a Model Context Protocol (MCP) server that provides 30+ D&D 5e tools for LLM-powered tabletop gaming. It enables AI assistants like Claude to act as Dungeon Masters by exposing a complete D&D 5e engine through MCP tools, featuring real-time combat tracking, character persistence, ASCII art rendering for immersive terminal/chat display, and both stdio (Claude Desktop) and SSE (web client) transports. The server handles everything from character creation and leveling to tactical combat encounters with grid-based movement, spell casting, condition tracking, and session management.

## Architecture

### System Design

The project follows an MCP server architecture built on Node.js with TypeScript. It implements the Model Context Protocol specification, exposing 30+ tools that LLMs can invoke to manage D&D 5e gameplay. The server supports dual transport modes: stdio for integration with Claude Desktop, and Server-Sent Events (SSE) for browser-based web clients. All tool outputs use ASCII art box drawing for a retro, immersive terminal aesthetic. Character and encounter data is persisted to JSON files in the user's AppData directory (Windows) or ~/.config (macOS/Linux). The architecture is module-based with separate systems for characters, combat, spatial mechanics, magic, and session data.

### Key Components

| Component | Purpose | Location |
|-----------|---------|----------|
| Main Entry Point | MCP server initialization with stdio/SSE transports | `src/index.ts` |
| Tool Registry | Static registration of all 30+ tools with Zod schemas | `src/registry.ts` |
| Type Definitions | Shared Zod schemas and D&D 5e enums with fuzzy matching | `src/types.ts` |
| Character System | Character CRUD, leveling, rests, spell slots, stat management | `src/modules/characters.ts` |
| Combat System | Encounter management, actions, conditions, death saves, initiative | `src/modules/combat.ts` |
| Spatial Mechanics | Distance calculation, AoE, line of sight, cover, movement pathfinding | `src/modules/spatial.ts` |
| Magic System | Concentration, auras, scroll usage, spell synthesis | `src/modules/magic.ts` |
| Session Data | Location graph, party management, inventory, notes | `src/modules/data.ts` |
| Dice Engine | Dice notation parser with advantage/disadvantage | `src/modules/dice.ts` |
| ASCII Art | Box drawing utilities for immersive output formatting | `src/modules/ascii-art.ts` |
| Fuzzy Enum | Fuzzy string matching for D&D enums (forgiving input) | `src/fuzzy-enum.ts` |
| WebSocket Broadcast | Real-time encounter updates to connected clients | `src/websocket.ts` |
| HTTP Server | SSE endpoint and web client serving | `src/http-server.ts` |
| Web Client | Browser interface with typing indicators | `web-client/` |
| Test Suite | Vitest tests for all modules | `tests/` |
| Package Config | Dependencies and scripts | `package.json` |

### Data Flow

```
User Input (Chat/Web)
  → MCP Tool Call (JSON-RPC)
  → Tool Registry Lookup
  → Zod Schema Validation (with fuzzy enum matching)
  → Module Handler (characters/combat/spatial/magic/data)
  → Data Layer (JSON files in AppData)
  → ASCII Art Formatter
  → MCP Response (Markdown with box drawing)
  → User (Immersive text output)

WebSocket Flow (SSE mode only):
  Encounter Update → WebSocket Broadcast → Connected Web Clients
```

## API Surface

### Public Interfaces

The server exposes 30+ MCP tools organized into functional categories. All tools accept JSON input validated by Zod schemas and return Markdown-formatted ASCII art responses.

#### Tool: `create_character`
- **Purpose**: Create a new D&D 5e character with full stats, class, race, and equipment
- **Parameters**:
  - `name` (string): Character name
  - `race` (string): Character race (e.g., "halfling", "elf", "human")
  - `class` (string): Character class (e.g., "rogue", "wizard", "fighter")
  - `level` (number): Starting level (1-20)
  - `abilityScores` (object): Six ability scores (str, dex, con, int, wis, cha)
  - `background` (string, optional): Character background
  - `alignment` (string, optional): Character alignment
- **Returns**: ASCII-formatted character sheet with calculated stats, HP, AC, proficiency bonus, spell slots

#### Tool: `roll_dice`
- **Purpose**: Roll dice using standard notation with support for advantage/disadvantage and batch rolling
- **Parameters**:
  - `expression` (string): Dice notation (e.g., "2d6+4", "1d20", "4d6kh3")
  - `batch` (array, optional): Array of roll requests with labels for batch rolling
  - `reason` (string, optional): Context for the roll
  - `advantage` (boolean, optional): Roll with advantage (2d20, keep highest)
  - `disadvantage` (boolean, optional): Roll with disadvantage (2d20, keep lowest)
- **Returns**: ASCII-formatted roll results with breakdown of individual dice and modifiers

#### Tool: `create_encounter`
- **Purpose**: Initialize a D&D 5e combat encounter with participants, initiative, and terrain
- **Parameters**:
  - `participants` (array): List of combatants with position, HP, AC, initiative
  - `terrain` (array, optional): Obstacles and difficult terrain
  - `description` (string, optional): Encounter context
- **Returns**: ASCII-formatted encounter summary with initiative order and battlefield state

#### Tool: `execute_action`
- **Purpose**: Execute a combat action (attack, dash, disengage, dodge, cast spell, etc.)
- **Parameters**:
  - `actorId` (string): ID of the acting combatant
  - `actionType` (string): Type of action (attack, cast_spell, dash, dodge, etc.)
  - `targetId` (string, optional): Target combatant ID
  - `weapon` (object, optional): Weapon details for attacks
  - `spell` (object, optional): Spell details for casting
- **Returns**: ASCII-formatted action result with attack rolls, damage, and updated HP

#### Tool: `manage_condition`
- **Purpose**: Apply, remove, or query D&D 5e conditions on targets
- **Parameters**:
  - `operation` (string): "add", "remove", "query", or "tick"
  - `targetId` (string): Target character/creature ID
  - `condition` (string): Condition name (blinded, charmed, frightened, etc.)
  - `duration` (number, optional): Duration in rounds
  - `source` (string, optional): Source of condition
- **Returns**: ASCII-formatted condition status

#### Tool: `level_up`
- **Purpose**: Level up a character with HP increases, proficiency bonus, and spell slot progression
- **Parameters**:
  - `characterId` (string): Character ID or name
  - `levels` (number, optional): Number of levels to gain (default: 1)
  - `hpMethod` (string, optional): "roll", "average", "max", or "manual"
  - `hpRolls` (array, optional): Manual HP roll values
- **Returns**: ASCII-formatted level-up summary with before/after comparison

#### Tool: `manage_spell_slots`
- **Purpose**: View, expend, restore, or set spell slots for spellcasters
- **Parameters**:
  - `operation` (string): "view", "expend", "restore", or "set"
  - `characterId` (string): Character ID or name
  - `level` (number, optional): Spell slot level (1-9)
  - `count` (number, optional): Number of slots to modify
- **Returns**: ASCII-formatted spell slot tracker with current/max slots per level

#### Tool: `measure_distance`
- **Purpose**: Calculate distance between two positions using D&D 5e grid mechanics
- **Parameters**:
  - `from` (object): Starting position {x, y, z}
  - `to` (object): Ending position {x, y, z}
  - `mode` (string, optional): "grid_5e" (default), "euclidean", or "grid_alt"
- **Returns**: Distance in feet with calculation method

#### Tool: `calculate_aoe`
- **Purpose**: Determine which grid squares are affected by area-of-effect spells
- **Parameters**:
  - `shape` (string): "sphere", "cone", "line", "cube", or "cylinder"
  - `origin` (object): Origin point {x, y, z}
  - `radius` (number, optional): Radius for sphere/cylinder
  - `length` (number, optional): Length for cone/line
  - `width` (number, optional): Width for line
  - `direction` (object, optional): Direction vector for cone/line
- **Returns**: List of affected grid squares with distances

#### Tool: `manage_concentration`
- **Purpose**: Track and manage concentration on spells with automatic DC calculation
- **Parameters**:
  - `operation` (string): "set", "check", "break", or "get"
  - `characterId` (string): Concentrating character ID
  - `spellName` (string, optional): Name of concentration spell
  - `damage` (number, optional): Damage taken (for concentration checks)
  - `advantage` (boolean, optional): Roll concentration save with advantage
- **Returns**: Concentration status and check results with ASCII formatting

#### Tool: `render_battlefield`
- **Purpose**: Generate ASCII tactical map of combat encounter
- **Parameters**:
  - `encounterId` (string, optional): Encounter to render (uses active if omitted)
  - `showGrid` (boolean, optional): Display grid coordinates
- **Returns**: ASCII grid map with combatant positions, terrain, and obstacles

#### Tool: `manage_location`
- **Purpose**: Create and manage location graph for party navigation
- **Parameters**:
  - `operation` (string): "create", "get", "update", "delete", "link", "unlink", or "list"
  - `locationId` (string, optional): Location identifier
  - `name` (string, optional): Location name
  - `description` (string, optional): Location description
  - `locationType` (string, optional): "room", "hallway", "outdoor", "cave", etc.
  - `lighting` (string, optional): "bright", "dim", "darkness", "magical_darkness"
- **Returns**: Location details and connections with ASCII formatting

#### Tool: `manage_party`
- **Purpose**: Manage adventuring party composition and roles
- **Parameters**:
  - `operation` (string): "add", "remove", "list", "get", "set_role", or "clear"
  - `characterId` (string, optional): Character to add/remove
  - `role` (string, optional): "leader", "scout", "healer", "tank", "support", "damage", "utility"
- **Returns**: Party roster with roles and member details

#### Tool: `get_session_context`
- **Purpose**: Retrieve comprehensive snapshot of current game state
- **Parameters**:
  - `include` (array, optional): Sections to include (location, party, notes, combat, summary)
  - `format` (string, optional): "detailed", "compact", or "brief"
  - `maxNotes` (number, optional): Limit number of notes returned
  - `includeTimestamps` (boolean, optional): Include timestamps in output
- **Returns**: Comprehensive session state in ASCII-formatted sections

### Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `APPDATA` (Windows) | string | `%APPDATA%` | Base directory for persistent data storage |
| `HOME` (Unix) | string | `~/.config` | Base directory for persistent data storage on macOS/Linux |
| `--sse` | CLI flag | false | Enable SSE transport mode (default is stdio) |
| Data directory | path | `rpg-lite-mcp/` | Subdirectory for character/encounter/session data |

## Usage Examples

### Basic Usage

```typescript
// Create a D&D 5e character
{
  "tool": "create_character",
  "arguments": {
    "name": "Finn",
    "race": "halfling",
    "class": "rogue",
    "level": 5,
    "abilityScores": {
      "str": 10,
      "dex": 18,
      "con": 14,
      "int": 12,
      "wis": 13,
      "cha": 8
    },
    "background": "Criminal",
    "alignment": "Chaotic Neutral"
  }
}

// Response:
╔═══════════════════════ CHARACTER SHEET ════════════════════════╗
║                             Finn                                ║
║                  PC - Halfling Rogue (Level 5)                  ║
║                                                                 ║
║                   HP: [████████████████] 35/35                  ║
║                                                                 ║
║ ────────────────────────────────────────────────────────────── ║
║                                                                 ║
║ AC         │ Speed        │ Initiative   │ Prof Bonus          ║
║ 15         │ 25 ft        │ +4           │ +3                  ║
╚════════════════════════════════════════════════════════════════╝
```

### Advanced Patterns

```typescript
// Start combat encounter with initiative and execute attack action
// Step 1: Create encounter
{
  "tool": "create_encounter",
  "arguments": {
    "participants": [
      {
        "id": "finn",
        "name": "Finn",
        "hp": 35,
        "ac": 15,
        "initiative": 18,
        "position": { "x": 0, "y": 0 }
      },
      {
        "id": "goblin-1",
        "name": "Goblin Sniper",
        "hp": 10,
        "ac": 12,
        "initiative": 14,
        "position": { "x": 5, "y": 3 }
      }
    ]
  }
}

// Step 2: Execute attack on Finn's turn
{
  "tool": "execute_action",
  "arguments": {
    "actorId": "finn",
    "actionType": "attack",
    "targetId": "goblin-1",
    "weapon": {
      "name": "Shortbow",
      "attackBonus": 7,
      "damageExpression": "1d6+4",
      "damageType": "piercing",
      "range": 80
    }
  }
}

// Response shows attack roll vs AC, damage dealt, and updated HP with ASCII art
```

## Dependencies

### Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| @modelcontextprotocol/sdk | ^1.0.0 | MCP protocol implementation and types |
| ws | ^8.18.3 | WebSocket server for real-time broadcasting |
| zod | ^3.23.0 | Runtime schema validation and type inference |
| zod-to-json-schema | ^3.23.0 | Convert Zod schemas to JSON Schema for MCP |

### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| @smithery/cli | ^1.4.6 | MCP server deployment tooling |
| @types/node | ^20.0.0 | TypeScript types for Node.js |
| @types/ws | ^8.18.1 | TypeScript types for WebSocket library |
| tsx | ^4.0.0 | TypeScript execution with watch mode |
| typescript | ^5.3.0 | TypeScript compiler (strict mode) |
| vitest | ^2.0.0 | Fast testing framework with native TypeScript |

## Integration Points

### Works With

| Project | Integration Type | Description |
|---------|-----------------|-------------|
| Claude Desktop | MCP Client | Primary integration - Claude Desktop connects via stdio transport to use D&D tools |
| Web Browsers | SSE Client | Web client connects to SSE endpoint for browser-based gameplay |

### External Services

| Service | Purpose | Required |
|---------|---------|----------|
| Railway | Deployment hosting for SSE endpoint | No (optional, for hosted web client) |

## Development Guide

### Prerequisites

- Node.js 18.0.0 or higher
- npm (comes with Node.js)
- Git for version control

### Setup

```bash
# Clone the repository
git clone https://github.com/Mnehmos/mnehmos.chatrpg.game
cd mnehmos.chatrpg.game

# Install dependencies
npm install

# Build the project
npm run build
```

### Running Locally

```bash
# Development mode with auto-rebuild on file changes
npm run dev

# Production build
npm run build

# Run with stdio transport (for Claude Desktop)
npm start

# Run with SSE transport (for web client on port 3001)
node dist/index.js --sse
```

### Testing

```bash
# Run tests in watch mode
npm test

# Run tests once
npm test -- --run

# Run tests with coverage
npm run test:coverage
```

### Building

```bash
# Build for production
npm run build

# Output location
dist/
```

## Maintenance Notes

### Known Issues

1. ASCII art box drawing characters may display incorrectly if terminal/client doesn't support UTF-8 encoding. Ensure source files are UTF-8 encoded and client supports Unicode.
2. Fuzzy enum matching can occasionally accept ambiguous input. For critical enums, consider adding explicit validation or user confirmation.
3. SSE transport mode does not currently support graceful shutdown of active encounters when server restarts.

### Future Considerations

1. Add support for multiclass characters with proper spell slot progression and hit point calculation.
2. Implement undo/redo functionality for combat actions to support DM corrections.
3. Add export/import functionality for characters and encounters to enable campaign portability.
4. Consider migrating from JSON files to SQLite for better concurrent access and query performance.
5. Add support for custom homebrew content (classes, races, spells) through configuration files.

### Code Quality

| Metric | Status |
|--------|--------|
| Tests | Partial - Core modules have Vitest tests, coverage not tracked |
| Linting | None - No ESLint configuration currently |
| Type Safety | TypeScript strict mode enabled with full type coverage |
| Documentation | JSDoc comments on public APIs, README with examples |

---

## Appendix: File Structure

```
mnehmos.chatrpg.game/
├── src/
│   ├── index.ts                 # Main MCP server entry point
│   ├── registry.ts              # Tool registry with 30+ tool definitions
│   ├── types.ts                 # Shared Zod schemas and D&D 5e type definitions
│   ├── fuzzy-enum.ts            # Fuzzy string matching for forgiving enum input
│   ├── websocket.ts             # WebSocket broadcasting for real-time updates
│   ├── http-server.ts           # SSE endpoint and static file serving
│   └── modules/
│       ├── ascii-art.ts         # Box drawing utilities for immersive output
│       ├── characters.ts        # Character CRUD, leveling, rests, spell slots
│       ├── combat.ts            # Encounters, actions, conditions, death saves
│       ├── data.ts              # Locations, party, inventory, session notes
│       ├── dice.ts              # Dice notation parser and rolling engine
│       ├── magic.ts             # Concentration, auras, scrolls, spell synthesis
│       └── spatial.ts           # Distance, AoE, line of sight, movement
├── web-client/                  # Browser-based interface
│   └── index.html               # Web client with typing indicators
├── tests/                       # Vitest test suites
├── dist/                        # Compiled TypeScript output
├── design docs/                 # Architecture Decision Records
├── package.json                 # Dependencies and npm scripts
├── tsconfig.json                # TypeScript compiler configuration
├── vitest.config.ts             # Vitest test configuration
├── README.md                    # User documentation with quick start
├── DESIGN.md                    # Technical design document
├── LICENSE                      # Proprietary license
└── PROJECT_KNOWLEDGE.md         # This document
```

---

*Generated by Project Review Orchestrator | 2025-12-29*
*Source: https://github.com/Mnehmos/mnehmos.chatrpg.game*
