# mnehmos.chatrpg.game

**D&D 5e MCP Server for AI Dungeon Masters**

A Model Context Protocol (MCP) server providing 30+ D&D 5e tools for LLM-powered tabletop gaming. Features real-time combat tracking, character persistence, ASCII art rendering, and a web client interface.

![Build](https://img.shields.io/badge/build-passing-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![License](https://img.shields.io/badge/license-proprietary-red)

---

## Features

- **30+ D&D 5e Tools** - Character creation, combat encounters, spell tracking, dice rolling
- **ASCII Art Output** - Retro-style box drawing for immersive terminal/chat display
- **Dual Transport** - stdio for Claude Desktop, SSE for web client
- **Real-time Sync** - WebSocket broadcasting for encounter updates
- **Persistent Storage** - Characters and encounters saved to AppData
- **Web Client** - Browser-based interface with typing indicators

---

## Quick Start

### 1. Build & Run

```bash
npm install
npm run build

# Run with stdio (for Claude Desktop)
npm start

# Run with SSE (for web client, port 3001)
node dist/index.js --sse
```

### 2. Configure Claude Desktop

Add to your Claude Desktop config:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "chatrpg": {
      "command": "node",
      "args": ["C:\\path\\to\\ChatRPG\\dist\\index.js"]
    }
  }
}
```

### 3. Web Client

The web client connects to the SSE endpoint:

```bash
# Start server with SSE
node dist/index.js --sse

# Open web-client/index.html in browser
```

---

## Available Tools

### Character Management
| Tool | Description |
|------|-------------|
| `create_character` | Full D&D 5e character creation with auto-calculated stats |
| `get_character` | Retrieve by ID/name, supports listing and filtering |
| `update_character` | Modify stats with before/after comparison |
| `delete_character` | Remove with cascade cleanup, batch support |
| `level_up` | Level progression with HP rolls, spell slots |
| `take_rest` | Short/long rest with hit dice and recovery |
| `manage_spell_slots` | Full/half/third casters, warlock pact magic |
| `roll_check` | Skill checks, saves, attacks, initiative |

### Combat System
| Tool | Description |
|------|-------------|
| `create_encounter` | Initialize combat with participants and terrain |
| `get_encounter` | Retrieve state with verbosity levels |
| `execute_action` | Attack, dash, dodge, disengage, grapple, shove, cast |
| `advance_turn` | Turn management with condition ticking |
| `end_encounter` | Close with outcome tracking |
| `roll_death_save` | D&D 5e death save mechanics |
| `manage_condition` | Apply/remove conditions with duration |
| `manage_encounter` | Composite operations with state sync |
| `render_battlefield` | ASCII tactical map |
| `modify_terrain` | Hazards, obstacles, difficult terrain |

### Magic System
| Tool | Description |
|------|-------------|
| `manage_concentration` | Concentration checks and tracking |
| `manage_aura` | Spirit Guardians, Paladin auras, etc. |
| `use_scroll` | Spell scroll mechanics |
| `synthesize_spell` | Improvised magic with Arcana checks |

### Spatial Mechanics
| Tool | Description |
|------|-------------|
| `measure_distance` | Grid-based distance (5e rules) |
| `calculate_aoe` | Sphere, cone, line, cube, cylinder |
| `check_line_of_sight` | Obstacle detection |
| `check_cover` | Half, three-quarters, full cover |
| `place_prop` | Interactive battlefield objects |
| `calculate_movement` | Pathfinding with terrain |

### World & Session
| Tool | Description |
|------|-------------|
| `manage_location` | Location graph for navigation |
| `move_party` | Travel between locations |
| `manage_party` | Party composition and roles |
| `manage_inventory` | Item management and equipping |
| `manage_notes` | Session notes with tagging |
| `get_session_context` | Comprehensive state snapshot |

### Dice
| Tool | Description |
|------|-------------|
| `roll_dice` | Standard notation, advantage/disadvantage, batch rolls |

---

## Project Structure

```
ChatRPG/
├── src/
│   ├── index.ts           # MCP server (stdio + SSE transports)
│   ├── registry.ts        # Tool registration (30+ tools)
│   ├── types.ts           # Shared Zod schemas
│   ├── fuzzy-enum.ts      # Fuzzy enum matching
│   ├── websocket.ts       # Real-time broadcasting
│   └── modules/
│       ├── ascii-art.ts   # Box drawing, formatting
│       ├── characters.ts  # Character CRUD, leveling
│       ├── combat.ts      # Encounters, conditions, actions
│       ├── data.ts        # Locations, party, inventory, notes
│       ├── dice.ts        # Dice parsing and rolling
│       ├── magic.ts       # Spells, concentration, auras
│       └── spatial.ts     # Distance, AoE, movement
├── web-client/            # Browser-based interface
├── tests/                 # Vitest test suites
├── dist/                  # Compiled output
└── design docs/           # ADRs and documentation
```

---

## Development

### Commands

```bash
# Development with auto-rebuild
npm run dev

# Type check
npx tsc --noEmit

# Build
npm run build

# Run tests
npm test

# Run tests once
npm test -- --run
```

### Adding a New Tool

1. Define Zod schema in `src/modules/[module].ts`
2. Write handler function
3. Export schema from module
4. Register in `src/registry.ts`
5. Add tests in `tests/[module]/`

### Git Workflow

- **main** - Production-ready, auto-deploys to Railway
- **development** - Active development branch

---

## Data Storage

Character and session data is stored in:

- **Windows:** `%APPDATA%\rpg-lite-mcp\`
- **macOS/Linux:** `~/.config/rpg-lite-mcp/`

```
rpg-lite-mcp/
├── characters/     # Character JSON files
├── encounters/     # Active encounter state
├── locations/      # Location graph
├── party/          # Party composition
└── notes/          # Session notes
```

---

## Example Usage

Ask Claude:

> "Create a level 5 halfling rogue named Finn with high dexterity"

Response:
```
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

Other commands:
- "Roll 4d6 drop lowest for ability scores"
- "Start a combat encounter with 3 goblins"
- "Cast fireball centered at position 5,5"
- "Move the party to the tavern"

---

## Deployment

The server is deployed on Railway and auto-deploys from the `main` branch.

**SSE Endpoint:** `https://chatrpg-production.up.railway.app/`

---

## Troubleshooting

### Server Won't Start
1. Verify build: `npm run build`
2. Check path in config is absolute
3. Test manually: `node dist/index.js`

### Tool Calls Failing
1. Rebuild: `npm run build`
2. Run tests: `npm test -- --run`
3. Check TypeScript: `npx tsc --noEmit`

### Encoding Issues
If ASCII art displays as garbled text (e.g., `Ã¢â€â‚¬` instead of `─`), ensure:
- Source files are UTF-8 encoded
- Terminal/client supports Unicode
- No double-encoding in transport layer

---

## Architecture

### MCP Protocol
- **Transports:** stdio, SSE (Server-Sent Events)
- **Format:** JSON-RPC 2.0
- **Capabilities:** Tools (30+)

### Design Principles
1. **ASCII Art First** - All output uses box drawing for terminal aesthetics
2. **Zod Validation** - Strict input schemas with fuzzy enum matching
3. **Stateful Persistence** - JSON files in AppData
4. **D&D 5e Accurate** - SRD-compliant mechanics
5. **Real-time Updates** - WebSocket broadcasting for encounters

---

## Contributing

This project follows TDD:
1. Write failing tests
2. Implement minimal code to pass
3. Refactor

PRs must:
- Include tests
- Pass TypeScript strict mode
- Follow existing patterns

---

## License

Proprietary - Personal, non-commercial use permitted. See [LICENSE](LICENSE).

---

## Credits

- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk) - MCP TypeScript SDK
- [Zod](https://zod.dev) - Schema validation
- [Vitest](https://vitest.dev) - Testing framework
- D&D 5e SRD (System Reference Document)
