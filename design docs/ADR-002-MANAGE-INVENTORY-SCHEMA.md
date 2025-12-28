# ADR-002: manage_inventory Tool Schema Design

**Status:** PROPOSED  
**Date:** 2025-12-19  
**Deciders:** Orchestrator, Architect  
**Depends On:** ADR-001 (execute_action needs equipment stats)

---

## Context

The RPG-Lite MCP consolidates **8 inventory-related tools** from rpg-mcp into a single `manage_inventory` tool, following the same menu-driven enum pattern established in `src/types.ts`.

### Consolidation Map

| Old Tool | Lite Operation |
|----------|----------------|
| `create_item_template` | `give` with item definition |
| `give_item` | `give` |
| `remove_item` | `remove` |
| `equip_item` | `equip` |
| `unequip_item` | `unequip` |
| `get_inventory` | `view` |
| `transfer_item` | `transfer` |
| `use_item` | `use` |

### Integration Requirements (from SYSTEM-INTERSECTIONS.md)

Equipment must integrate with the **Effective Stats Model**:
- AC bonuses from armor/shields
- Stat bonuses from magic items
- Speed modifiers from boots
- Attack/damage bonuses from weapons

**Order of Operations:**
```
Base → Equipment → Conditions → Effects → Effective
```

---

## Decision: Enum Schemas

### InventoryOperationSchema

```typescript
export const InventoryOperationSchema = z.enum([
  'give',      // Add item to character (with optional item definition)
  'remove',    // Remove item from character
  'equip',     // Move item from inventory to equipment slot
  'unequip',   // Move item from equipment slot to inventory
  'view',      // List all inventory and equipped items
  'transfer',  // Move item between two characters
  'use',       // Consume or activate an item
]);
export type InventoryOperation = z.infer<typeof InventoryOperationSchema>;
```

### ItemTypeSchema

```typescript
export const ItemTypeSchema = z.enum([
  'weapon',           // Swords, bows, etc.
  'armor',            // Plate, leather, shields
  'consumable',       // Potions, scrolls, food
  'wondrous',         // Magic items (cloaks, rings)
  'tool',             // Thieves' tools, artisan's tools
  'adventuring_gear', // Rope, torches, etc.
  'treasure',         // Coins, gems, art
  'ammunition',       // Arrows, bolts, bullets
]);
export type ItemType = z.infer<typeof ItemTypeSchema>;
```

### EquipmentSlotSchema

```typescript
export const EquipmentSlotSchema = z.enum([
  'mainhand',    // Primary weapon
  'offhand',     // Shield or secondary weapon
  'armor',       // Body armor
  'head',        // Helmets, circlets
  'feet',        // Boots, shoes
  'hands',       // Gloves, gauntlets
  'cloak',       // Cloaks, capes
  'neck',        // Amulets, necklaces
  'ring1',       // First ring slot
  'ring2',       // Second ring slot
  'belt',        // Belts (Belt of Giant Strength)
  'quiver',      // Ammunition container
]);
export type EquipmentSlot = z.infer<typeof EquipmentSlotSchema>;
```

### RaritySchema

```typescript
export const RaritySchema = z.enum([
  'common',
  'uncommon',
  'rare',
  'very_rare',
  'legendary',
  'artifact',
]);
export type Rarity = z.infer<typeof RaritySchema>;
```

### WeaponCategorySchema (extends ADR-001)

```typescript
export const WeaponCategorySchema = z.enum([
  'simple_melee',
  'simple_ranged',
  'martial_melee',
  'martial_ranged',
]);
export type WeaponCategory = z.infer<typeof WeaponCategorySchema>;
```

### WeaponPropertySchema

```typescript
export const WeaponPropertySchema = z.enum([
  'ammunition',
  'finesse',
  'heavy',
  'light',
  'loading',
  'range',
  'reach',
  'special',
  'thrown',
  'two_handed',
  'versatile',
]);
export type WeaponProperty = z.infer<typeof WeaponPropertySchema>;
```

### ArmorCategorySchema

```typescript
export const ArmorCategorySchema = z.enum([
  'light',   // Leather, padded
  'medium',  // Chain shirt, breastplate
  'heavy',   // Plate, splint
  'shield',  // All shields
]);
export type ArmorCategory = z.infer<typeof ArmorCategorySchema>;
```

---

## Item Interface with MechanicalEffects

Following the pattern from SYSTEM-INTERSECTIONS.md Section 10:

```typescript
// Weapon-specific stats
export const WeaponStatsSchema = z.object({
  damageDice: z.string(),                    // "1d8", "2d6"
  damageType: DamageTypeSchema,              // From types.ts
  category: WeaponCategorySchema,
  properties: z.array(WeaponPropertySchema).optional(),
  range: z.object({
    normal: z.number(),                      // 30ft for shortbow
    long: z.number().optional(),             // 120ft for shortbow
  }).optional(),
  versatileDamage: z.string().optional(),    // "1d10" for longsword
}).optional();

// Armor-specific stats
export const ArmorStatsSchema = z.object({
  baseAc: z.number(),                        // 14 for chain shirt
  category: ArmorCategorySchema,
  maxDexBonus: z.number().optional(),        // 2 for medium armor
  stealthDisadvantage: z.boolean().optional(),
  strengthRequirement: z.number().optional(), // 15 for plate
}).optional();

// Mechanical effects (stat modifiers)
export const MechanicalEffectsSchema = z.object({
  // Defensive
  acBonus: z.number().optional(),            // +1 for Ring of Protection
  saveBonus: z.number().optional(),          // +1 to all saves (Cloak of Protection)
  saveBonusAbility: AbilitySchema.optional(), // Specific save bonus
  
  // Offensive
  attackBonus: z.number().optional(),        // +1 weapon
  damageBonus: z.number().optional(),        // +1 weapon
  bonusDamage: z.string().optional(),        // "1d6" fire (Flame Tongue)
  bonusDamageType: DamageTypeSchema.optional(),
  
  // Stats
  strBonus: z.number().optional(),
  dexBonus: z.number().optional(),
  conBonus: z.number().optional(),
  intBonus: z.number().optional(),
  wisBonus: z.number().optional(),
  chaBonus: z.number().optional(),
  
  // Set ability to value (Belt of Giant Strength)
  strSet: z.number().optional(),
  dexSet: z.number().optional(),
  conSet: z.number().optional(),
  
  // Movement
  speedBonus: z.number().optional(),         // Boots of Speed
  speedMultiplier: z.number().optional(),    // 2x for Boots of Speed (active)
  
  // Special
  advantageOn: z.array(SkillSchema).optional(), // Cloak of Elvenkind
  resistances: z.array(DamageTypeSchema).optional(),
  immunities: z.array(DamageTypeSchema).optional(),
  conditionImmunities: z.array(ConditionSchema).optional(),
  
  // Charges
  charges: z.number().optional(),
  maxCharges: z.number().optional(),
  rechargeOn: z.enum(['dawn', 'dusk', 'short_rest', 'long_rest', 'never']).optional(),
}).optional();

// Full Item Schema
export const ItemSchema = z.object({
  // Identity
  id: z.string().optional(),                 // Auto-generated if not provided
  name: z.string(),
  description: z.string().optional(),
  
  // Classification
  type: ItemTypeSchema,
  rarity: RaritySchema.default('common'),
  requiresAttunement: z.boolean().default(false),
  attuned: z.boolean().default(false),
  
  // Equipment
  slot: EquipmentSlotSchema.optional(),
  equipped: z.boolean().default(false),
  
  // Type-specific stats
  weaponStats: WeaponStatsSchema.optional(),
  armorStats: ArmorStatsSchema.optional(),
  
  // Mechanical effects (the integration point!)
  mechanicalEffects: MechanicalEffectsSchema.optional(),
  
  // Economy
  value: z.number().optional(),              // Gold pieces
  weight: z.number().optional(),             // Pounds
  
  // Consumables
  quantity: z.number().default(1),
  usesRemaining: z.number().optional(),
  effect: z.string().optional(),             // "Heal 2d4+2 HP"
  
  // Stacking
  stackable: z.boolean().default(false),
});
export type Item = z.infer<typeof ItemSchema>;
```

---

## ManageInventorySchema

```typescript
// Character targeting (either/or pattern from update_character)
const CharacterTargetSchema = z.object({
  characterId: z.string().optional(),
  characterName: z.string().optional(),
}).refine(
  data => data.characterId || data.characterName,
  { message: 'Either characterId or characterName is required' }
);

// Operation-specific fields
const GiveOperationSchema = z.object({
  operation: z.literal('give'),
  item: ItemSchema,                          // Full item definition
});

const RemoveOperationSchema = z.object({
  operation: z.literal('remove'),
  itemId: z.string().optional(),
  itemName: z.string().optional(),
  quantity: z.number().optional().default(1),
});

const EquipOperationSchema = z.object({
  operation: z.literal('equip'),
  itemId: z.string().optional(),
  itemName: z.string().optional(),
  slot: EquipmentSlotSchema.optional(),      // Auto-detect if not specified
});

const UnequipOperationSchema = z.object({
  operation: z.literal('unequip'),
  slot: EquipmentSlotSchema.optional(),
  itemId: z.string().optional(),
  itemName: z.string().optional(),
});

const ViewOperationSchema = z.object({
  operation: z.literal('view'),
  showEquipped: z.boolean().default(true),
  showInventory: z.boolean().default(true),
  showStats: z.boolean().default(true),      // Show calculated bonuses
});

const TransferOperationSchema = z.object({
  operation: z.literal('transfer'),
  itemId: z.string().optional(),
  itemName: z.string().optional(),
  quantity: z.number().optional().default(1),
  toCharacterId: z.string().optional(),
  toCharacterName: z.string().optional(),
});

const UseOperationSchema = z.object({
  operation: z.literal('use'),
  itemId: z.string().optional(),
  itemName: z.string().optional(),
  targetId: z.string().optional(),           // For healing potions, etc.
  targetName: z.string().optional(),
});

// Unified schema with discriminated union
export const ManageInventorySchema = z.intersection(
  CharacterTargetSchema,
  z.discriminate [
    GiveOperationSchema,
    RemoveOperationSchema,
    EquipOperationSchema,
    UnequipOperationSchema,
    ViewOperationSchema,
    TransferOperationSchema,
    UseOperationSchema,
  ])
);

// Batch support (matches update_character pattern)
export const ManageInventoryBatchSchema = z.union([
  ManageInventorySchema,
  z.object({
    batch: z.array(ManageInventorySchema).min(1).max(20),
  }),
]);
```

---

## Integration Points

### 1. With update_character

When equipment is equipped/unequipped, stats may need updating:

```typescript
// After equipping Belt of Giant Strength
if (item.mechanicalEffects?.strSet) {
  // Note: Don't modify base stats, use calculateEffectiveStats
}
```

**Key Principle:** Equipment bonuses are calculated at runtime via `calculateEquipmentStats()`, not stored on character.

### 2. With execute_action

Attack action needs weapon stats:

```typescript
// In execute_action handler
const weapon = getEquippedWeapon(actorId, 'mainhand');
if (weapon) {
  damageExpression = weapon.weaponStats.damageDice;
  damageType = weapon.weaponStats.damageType;
  attackBonus += weapon.mechanicalEffects?.attackBonus ?? 0;
}
```

### 3. With get_character

Character display should show effective stats:

```typescript
export function calculateEffectiveStats(characterId: string): EffectiveStats {
  const base = getBaseStats(characterId);
  
  // Layer 1: Equipment bonuses
  const equipped = getEquippedItems(characterId);
  let stats = applyEquipmentBonuses(base, equipped);
  
  // Layer 2: Condition effects (already implemented)
  stats = applyConditionEffects(characterId, stats);
  
  return stats;
}
```

### 4. With manage_condition

Some equipment grants condition immunities:

```typescript
// Ring of Free Action: immune to paralyzed, restrained
const immunities = getConditionImmunitiesFromEquipment(characterId);
if (immunities.includes(condition)) {
  return { blocked: true, reason: 'immune via Ring of Free Action' };
}
```

---

## Attunement Rules

Per D&D 5e:
- Maximum 3 attuned items per character
- Attunement requires short rest
- Some items require class/race/alignment

```typescript
export function canAttune(characterId: string, item: Item): boolean {
  if (!item.requiresAttunement) return true;
  
  const currentlyAttuned = getAttunedItems(characterId);
  if (currentlyAttuned.length >= 3) return false;
  
  // Check class/race requirements if specified
  // ...
  
  return true;
}
```

---

## Example Usage

### Give a magic sword

```json
{
  "characterName": "Thorin",
  "operation": "give",
  "item": {
    "name": "Flame Tongue Longsword",
    "type": "weapon",
    "rarity": "rare",
    "requiresAttunement": true,
    "slot": "mainhand",
    "weaponStats": {
      "damageDice": "1d8",
      "damageType": "slashing",
      "category": "martial_melee",
      "properties": ["versatile"],
      "versatileDamage": "1d10"
    },
    "mechanicalEffects": {
      "bonusDamage": "2d6",
      "bonusDamageType": "fire"
    },
    "value": 5000
  }
}
```

### Equip armor

```json
{
  "characterName": "Thorin",
  "operation": "equip",
  "itemName": "Plate Armor"
}
```

### View inventory with stats

```json
{
  "characterName": "Thorin",
  "operation": "view",
  "showStats": true
}
```

### Batch: Loot distribution

```json
{
  "batch": [
    { "characterName": "Thorin", "operation": "give", "item": { "name": "Gold", "type": "treasure", "quantity": 150 } },
    { "characterName": "Elara", "operation": "give", "item": { "name": "Gold", "type": "treasure", "quantity": 150 } },
    { "characterName": "Thorin", "operation": "give", "item": { "name": "Healing Potion", "type": "consumable", "effect": "Heal 2d4+2 HP" } }
  ]
}
```

---

## Implementation Order

### Phase 1: Core CRUD
1. `give` - Add items to inventory
2. `remove` - Remove items from inventory
3. `view` - List inventory (no stats yet)

### Phase 2: Equipment
4. `equip` - Move to slot, validate slot type
5. `unequip` - Move to inventory
6. Update `view` to show equipped items

### Phase 3: Stats Integration
7. Implement `calculateEquipmentStats()`
8. Integrate with `get_character` display
9. Add `showStats` to `view` operation

### Phase 4: Advanced
10. `transfer` - Character-to-character
11. `use` - Consumable activation
12. Attunement enforcement
13. Batch operations

---

## Persistence Strategy

### Option A: Items on Character JSON

```json
{
  "id": "char_123",
  "name": "Thorin",
  "inventory": [
    { "id": "item_1", "name": "Longsword", "equipped": true, "slot": "mainhand" }
  ]
}
```

**Pros:** Single source of truth  
**Cons:** Character files get large

### Option B: Separate Items Store

```
data/
  characters/thor_1.json
  items/
    thor_1.json  ← Thorin's items
```

**Pros:** Cleaner separation  
**Cons:** More files to manage

### Recommendation: Option A (start simple)

Items are stored directly on character JSON. This matches how `update_character` already works and keeps all character data in one place.

---

## Consequences

### Positive
- 8 tools → 1 tool (87% reduction)
- Menu-driven enums for all item properties
- Mechanical effects use same pattern as conditions
- Full D&D 5e equipment categories supported

### Negative
- Complex discriminated union schema
- Equipment stats calculation adds runtime overhead
- Attunement rules add validation complexity

### Risks
- Item database could grow large (consider item templates)
- Two-weapon fighting requires careful slot handling
- Magic item identification system not specified

---

## References

- [src/types.ts](../src/types.ts) - Existing enum patterns
- [SYSTEM-INTERSECTIONS.md](./SYSTEM-INTERSECTIONS.md) - Section 10: Inventory ↔ Equipment
- [RPG-MCP-LITE-FEATURES.md](./RPG-MCP-LITE-FEATURES.md) - Consolidation map
- [ADR-001](./ADR-001-EXECUTE-ACTION-DEPENDENCIES.md) - execute_action dependencies

---

_ADR-002 | manage_inventory Schema | Unified Item Management_  
_Last Updated: 2025-12-19_
