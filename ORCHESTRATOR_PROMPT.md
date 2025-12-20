# TDD Orchestrator Protocol

> **Standards & Context for Tool Implementation** • Red → Green → Blue

---

## 🎯 Purpose

This document defines our TDD workflow for implementing tools from [TOOLS_CHECKLIST.md](TOOLS_CHECKLIST.md).

**Workflow:** Pick a tool → Red Phase (tests) → Green Phase (implementation) → Blue Phase (refactor)

---

## 🔴🟢🔵 TDD Phases

### 🔴 Red Phase: Write Failing Tests

**Goal:** Define expected behavior through tests before any implementation.

**Checklist:**
- [ ] Create test file: `tests/<module>/<tool_name>.test.ts`
- [ ] Import from `../helpers.ts` for test utilities
- [ ] Write tests for:
  - Happy path (basic usage works)
  - Edge cases (empty inputs, boundaries)
  - Error conditions (invalid inputs, missing data)
  - Batch support if applicable (`{ batch: [...] }` pattern)
- [ ] Run tests: `npx vitest run <tool_name>` — all should FAIL
- [ ] Commit message: `test(<tool>): red phase - X failing tests`

**Test Structure:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext, cleanupTestData } from '../helpers';

describe('<tool_name>', () => {
  beforeEach(() => { /* setup */ });
  afterEach(() => { cleanupTestData(); });

  describe('happy path', () => {
    it('should <expected behavior>', async () => {
      // Arrange → Act → Assert
    });
  });

  describe('edge cases', () => { /* ... */ });
  describe('error handling', () => { /* ... */ });
  describe('batch operations', () => { /* ... */ }); // if applicable
});
```

---

### 🟢 Green Phase: Minimal Implementation

**Goal:** Make all tests pass with the simplest possible code.

**Checklist:**
- [ ] Add Zod schema to module file (`src/modules/<module>.ts`)
- [ ] Implement handler function (minimal, just enough to pass tests)
- [ ] Register tool in `src/registry.ts`
- [ ] Run tests: `npx vitest run <tool_name>` — all should PASS
- [ ] Run full suite: `npx vitest run` — no regressions
- [ ] Commit message: `feat(<tool>): green phase - X/X tests passing`

**Implementation Pattern:**
```typescript
// Schema
export const toolNameSchema = z.object({
  // ... parameters
}).strict();

// Handler
export async function toolName(args: z.infer<typeof toolNameSchema>): Promise<CallToolResult> {
  const parsed = toolNameSchema.parse(args);
  // ... minimal implementation
  return { content: [{ type: 'text', text: formatResult(result) }] };
}

// Formatter (ASCII output)
function formatToolNameResult(result: ResultType): string {
  const content: string[] = [];
  // ... build content array
  return createBox('Title', content);
}
```

---

### 🔵 Blue Phase: Refactor & Polish

**Goal:** Improve code quality without changing behavior.

**Checklist:**
- [ ] Extract constants (magic numbers → named constants)
- [ ] Extract helper functions (DRY principle)
- [ ] Add JSDoc comments to public functions
- [ ] Replace `any` types with proper TypeScript types
- [ ] Ensure ASCII output uses `createBox()` pattern
- [ ] Run tests: `npx vitest run` — all still pass
- [ ] Update [TOOLS_CHECKLIST.md](TOOLS_CHECKLIST.md) with completion status
- [ ] Commit message: `refactor(<tool>): blue phase complete`

**Blue Phase Improvements:**
```typescript
// Constants
const MAX_ITEMS = 20;
const DEFAULT_VALUE = 'average';

// Helper extraction
function calculateSomething(input: Input): Output {
  // ... extracted logic
}

// JSDoc
/**
 * Processes the tool request.
 * @param args - Validated input parameters
 * @returns CallToolResult with ASCII-formatted output
 */
export async function toolName(args: Args): Promise<CallToolResult> {
  // ...
}
```

---

## 📁 Project Structure

```
src/
├── index.ts           # MCP Server entry (don't modify)
├── registry.ts        # Tool registration
├── types.ts           # Shared types
└── modules/
    ├── ascii-art.ts   # ASCII output helpers
    ├── characters.ts  # Character tools
    ├── combat.ts      # Combat tools
    ├── dice.ts        # Dice tools
    └── spatial.ts     # Spatial tools

tests/
├── helpers.ts         # Test utilities
├── characters/        # Character tool tests
├── combat/            # Combat tool tests
└── spatial/           # Spatial tool tests

data/
└── characters/        # JSON persistence
```

---

## 🔧 Tech Stack

| Component  | Choice                    | Notes                           |
| ---------- | ------------------------- | ------------------------------- |
| Runtime    | Node.js ESM               | Imports use `.js` extension     |
| Language   | TypeScript (strict)       | No `any` in final code          |
| Testing    | Vitest                    | `npx vitest run`                |
| Validation | Zod                       | Every tool has schema           |
| Protocol   | @modelcontextprotocol/sdk | `CallToolResult` return type    |
| Output     | ASCII Art                 | Use `createBox()` from ascii-art|

---

## 🎨 ASCII Output Pattern

All tools output ASCII art using helpers from `src/modules/ascii-art.ts`:

```typescript
import { createBox, createStatusBar, box } from './ascii-art.js';

function formatResult(data: Data): string {
  const content: string[] = [
    `Name: ${data.name}`,
    box.H.repeat(40),  // horizontal divider
    `Value: ${data.value}`,
  ];
  return createBox('Result Title', content);
}
```

**Output Example:**
```
╔══════════════════════════════════════╗
║         RESULT TITLE                 ║
╠══════════════════════════════════════╣
║ Name: Example                        ║
║ ──────────────────────────────────── ║
║ Value: 42                            ║
╚══════════════════════════════════════╝
```

---

## 📦 Batch Support Pattern

Tools supporting multiple operations use the batch pattern actively search for batch patterns and implement them proactively:

```typescript
// Schema supports single OR batch
const schema = z.union([
  singleOperationSchema,
  z.object({ batch: z.array(singleOperationSchema).max(20) })
]);

// Handler dispatches appropriately
if ('batch' in args) {
  return handleBatch(args.batch);
} else {
  return handleSingle(args);
}
```

---

## ✅ Quality Gates

Before marking a tool complete:

| Check      | Command              | Criteria        |
| ---------- | -------------------- | --------------- |
| TypeScript | `npm run build`      | No errors       |
| Tests      | `npx vitest run`     | All passing     |
| Tool Tests | `npx vitest run <t>` | Tool-specific   |

---

## 📋 Workflow Commands

```powershell
# Run specific tool tests
npx vitest run <tool_name>

# Run all tests
npx vitest run

# Run tests in watch mode
npx vitest

# Build TypeScript
npm run build

# Check for errors without building
npx tsc --noEmit
```

---

## 📖 Reference Documents

| Document                                           | Purpose                |
| -------------------------------------------------- | ---------------------- |
| [TOOLS_CHECKLIST.md](TOOLS_CHECKLIST.md)           | Tool status & specs    |
| [SCHEMAS.md](SCHEMAS.md)                           | Schema documentation   |
| [DESIGN.md](DESIGN.md)                             | Architecture overview  |
| [design docs/](design%20docs/)                     | ADRs & design decisions|

---

## 🚀 Quick Start

1. **Pick a tool** from [TOOLS_CHECKLIST.md](TOOLS_CHECKLIST.md) (🔴 status)
2. **Red Phase:** Write failing tests in `tests/<module>/<tool>.test.ts`
3. **Green Phase:** Implement in `src/modules/<module>.ts`, register in `registry.ts`
4. **Blue Phase:** Refactor, add JSDoc, extract helpers
5. **Update checklist** with ✅ status and test count

---

_TDD Protocol v4.0 • Red → Green → Blue_
