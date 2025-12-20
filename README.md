# ChatRPG

**Lightweight D&D 5e LLM-as-DM Engine**
A Model Context Protocol (MCP) server providing 35 core D&D 5e tools for AI Dungeon Masters.

![Status](https://img.shields.io/badge/tests-599%2F599%20passing-brightgreen)
![Progress](https://img.shields.io/badge/tools-18%2F35%20complete-blue)
![Build](https://img.shields.io/badge/build-passing-brightgreen)

---

## Quick Start

### 1. Build the Server

```bash
npm install
npm run build
```

### 2. Test the Server

```bash
# Run the built-in test
node test-server.mjs

# Or manually test a tool call
npm start
# (Server runs on stdio - send JSON-RPC messages)
```

### 3. Register with Claude Desktop

Add this configuration to your Claude Desktop config file:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "rpg-lite": {
      "command": "node",
      "args": [
        "C:\\Users\\mnehm\\AppData\\Roaming\\Roo-Code\\MCP\\rpg-lite-mcp\\dist\\index.js"
      ]
    }
  }
}
```

**Important:** Replace the path with your actual installation directory!

### 4. Restart Claude Desktop

The server will auto-start when Claude Desktop launches.

---

## Available Tools (18/35)

### Combat Module (9 tools - COMPLETE)

- ✅ **roll_dice** - Standard dice notation with modifiers (`2d6+3`, `4d6kh3`)
- ✅ **create_encounter** - Initialize combat encounters with participants and terrain
- ✅ **get_encounter** - Retrieve encounter state with filtering options
- ✅ **execute_action** - Combat hub: attack, cast_spell, dash, disengage, dodge, grapple, shove
- ✅ **advance_turn** - Turn management with condition ticking
- ✅ **end_encounter** - Close encounter with XP/HP summary
- ✅ **roll_death_save** - D&D 5e death save mechanics with visual tracker
- ✅ **manage_condition** - Apply/remove D&D 5e conditions with duration tracking
- ✅ **render_battlefield** - ASCII tactical map rendering
- ✅ **modify_terrain** - Terrain hazards, obstacles, difficult terrain

### Characters Module (8 tools)

- ✅ **create_character** - Full D&D 5e character creation with auto-calculated stats
- ✅ **get_character** - Retrieve character by ID/name with filtering and listing
- ✅ **update_character** - Update stats with before/after comparison, batch support
- ✅ **delete_character** - Remove character with cascade cleanup
- ✅ **roll_check** - Skill checks, saving throws, ability checks
- ✅ **hp_delta** - Apply damage/healing with bloodied/death tracking
- ✅ **take_rest** - Short/long rest mechanics with hit dice, spell slots
- ✅ **manage_spell_slots** - D&D 5e spell slot management (full/half/third casters, warlock pact magic)

### Spatial Module (1 tool)

- ✅ **measure_distance** - Grid-based distance calculation (5e rules)

---

## Testing

```bash
# Run all tests
npm test

# Run tests once (no watch mode)
npm test -- --run

# Run with coverage
npm run test:coverage
```

**Current Status:** 599/599 tests passing across 22 test files

---

## Project Structure

```
ChatRPG/
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── registry.ts        # Tool registration hub
│   ├── types.ts           # Shared TypeScript types
│   ├── websocket.ts       # Real-time battlefield broadcasting
│   └── modules/
│       ├── ascii-art.ts   # ASCII output rendering
│       ├── dice.ts        # Dice rolling engine
│       ├── characters.ts  # Character CRUD + spell slots
│       ├── combat.ts      # Encounter management
│       └── spatial.ts     # Grid mechanics
├── tests/                 # Vitest test suites (22 files)
├── data/                  # Runtime JSON storage
│   └── characters/        # Character persistence
├── design docs/           # ADRs and design documentation
└── dist/                  # Compiled output (npm run build)
```

---

## Development

### Watch Mode (Auto-rebuild)

```bash
npm run dev
```

### Adding a New Tool

1. **Define Schema** in `src/modules/[module].ts`
2. **Write Tests** in `tests/[module]/[tool].test.ts` (TDD: Red phase)
3. **Implement Handler** (Green phase)
4. **Register Tool** in `src/registry.ts`
5. **Verify** with `npm test -- --run`

### Git Workflow

This project acts as a **Lite Gitflow** repository:

- **main**: Stable, production-ready code. Only checked-out for release.
- **development**: Active development branch. All features merged here first.

---

## Architecture

### MCP Protocol

- **Transport:** stdio (standard input/output)
- **Format:** JSON-RPC 2.0
- **Capabilities:** Tools only (no resources/prompts yet)

### Tool Design Principles

1. **Immersive ASCII Art** - All responses use box drawing for a retro-game aesthetic
2. **Zod Validation** - Every tool has strict input schema validation
3. **Stateful Persistence** - Characters/encounters saved to `./data/`
4. **D&D 5e Accurate** - Proficiency bonuses, hit dice, grid mechanics all SRD-compliant
5. **Terminal-First** - Monospace-optimized, works in any CLI/chat interface

---

## Example Usage

Once registered with Claude Desktop, you can ask:

> "Create a level 5 halfling rogue named Finn with high dexterity"

Claude will call `create_character` and return:

```
╔═══════════════════════ CHARACTER SHEET ════════════════════════╗
║                             Finn                                ║
║                  PC - Halfling Rogue (Level 5)                  ║
║                                                                 ║
║                   HP: [████████████████] 35/35                  ║
║                                                                 ║
║ ──────────────────────────────────────────────────────────────  ║
║                                                                 ║
║ AC         │ Speed        │ Initiative   │ Prof Bonus          ║
║ 15         │ 25 ft        │ +4           │ +3                  ║
║                                                                 ║
║ ──────────────────────────────────────────────────────────────  ║
║                                                                 ║
║            STR              DEX              CON                ║
║             10               18               14                ║
║            (+0)             (+4)             (+2)               ║
║                                                                 ║
║            INT              WIS              CHA                ║
║             12               13               10                ║
║            (+1)             (+1)             (+0)               ║
║                                                                 ║
║ ──────────────────────────────────────────────────────────────  ║
║                                                                 ║
║ Character ID: a7f3e8d1-4c2b-9f3a-8d6e-1b2c3d4e5f6g             ║
║ Created: 2025-12-17 18:45:00                                   ║
║ ╚════════════════════════════════════════════════════════════════╝
```

Try other commands:

- "Roll 2d6+3 for damage"
- "Measure distance from (0,0) to (5,8)"
- "Add the blinded condition to goblin-1 for 3 rounds"

---

## Roadmap

### Tier 1: Foundation (In Progress)

- [x] roll_dice
- [x] create_character, get_character, update_character
- [x] manage_condition
- [x] measure_distance
- [ ] list_characters
- [x] create_encounter, execute_action(Phases 1-2), apply_damage(merged)

### Tier 2: Combat Support

- [ ] advance_turn, render_battlefield
- [x] roll_check
- [ ] resolve_attack (merged into execute_action)
- [ ] roll_death_save

### Tier 3: Advanced Features

- [ ] Magic system (spell slots, concentration)
- [ ] Spatial mechanics (AoE, line of sight, cover)
- [ ] Session management (notes, locations, party)

See [TOOLS_CHECKLIST.md](TOOLS_CHECKLIST.md) for full implementation status.

---

## Troubleshooting

### Server Won't Start in Claude Desktop

1. **Check the path** in `claude_desktop_config.json` is absolute and correct
2. **Verify build** with `npm run build`
3. **Test manually** with `node dist/index.js` (should print "RPG-Lite MCP Server running on stdio")
4. **Check Claude logs** (usually in `%APPDATA%\Claude\logs` on Windows)

### Tool Calls Failing

1. **Rebuild** with `npm run build`
2. **Check test suite** with `npm test -- --run`
3. **Verify data directory** exists: `mkdir -p data/characters`

---

## Contributing

This project follows **strict TDD protocol**:

1. Red: Write failing tests first
2. Green: Implement minimal code to pass
3. Refactor: Clean up and optimize

All PRs must:

- Include tests for new functionality
- Maintain 100% test pass rate
- Pass TypeScript strict mode compilation
- Follow existing code structure

---

## License

Proprietary - See [LICENSE](LICENSE) for details. Personal, non-commercial use permitted.

---

## Credits

Built with:

- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk) - MCP TypeScript SDK
- [Zod](https://zod.dev) - Schema validation
- [Vitest](https://vitest.dev) - Testing framework
- D&D 5e SRD (System Reference Document)

---

**Status:** Alpha - 9/50 tools operational | TDD-driven development | 250/250 tests passing
