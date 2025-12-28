# RPG-Lite MCP: API Design

## Design Philosophy

1.  **Batch-First**: All mutator tools accept arrays to allow single or multiple operations in one round-trip.
2.  **Menu-Driven**: Schemas use strict `enum`s to allow UI clients to render dropdowns instead of text fields.
3.  **Static**: No dynamic loading; predictable tool list.

## Core Schemas

### Entity Operations (`manage_entity`)

Used for all CRUD operations on World Data.

```typescript
type Collection = "characters" | "items" | "locations" | "quests" | "notes";
type Action = "create" | "update" | "delete";

interface EntityOperation {
  collection: Collection;
  action: Action;
  id?: string; // Required for update/delete
  data?: any;  // Partial data for update, full for create
}

// Tool Arguments
{
  operations: EntityOperation | EntityOperation[];
}
```

### Combat Actions (`combat_action`)

Unified handler for the 5e Action Economy.

```typescript
type ActionType =
  | "Attack" | "Cast" | "Dash" | "Disengage" | "Dodge"
  | "Help" | "Hide" | "Ready" | "Search" | "UseObject"
  | "Interact"; // Free object interaction

interface CombatActionPayload {
  actorId: string;
  type: ActionType;
  targetId?: string; // For attacks, help, etc.
  hand?: "main" | "off"; // For dual wielding
  spellLevel?: number; // For Cast
  item?: string; // For UseObject
}

// Tool Arguments
{
  actions: CombatActionPayload | CombatActionPayload[];
}
```

### Inventory Management (`inventory_action`)

```typescript
type InventoryVerb = "give" | "take" | "equip" | "unequip" | "consume";

interface InventoryOp {
  characterId: string;
  verb: InventoryVerb;
  itemId: string;
  quantity?: number;
  slot?: "main_hand" | "off_hand" | "armor" | "accessory"; // For equip
}

// Tool Arguments
{
  operations: InventoryOp | InventoryOp[];
}
```

## Static Registration Architecture

All tools will be exported from `src/tools/index.ts` and registered in `src/index.ts` explicitly.

```typescript
// src/index.ts
import { server } from "./server";
import { registerAllTools } from "./tools";

registerAllTools(server);
```
