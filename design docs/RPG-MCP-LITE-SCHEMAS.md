# RPG-MCP Lite: Tool Schema Reference

## Complete Schema Definitions for 48 Tools

---

## Core Types (Shared Across Modules)

```typescript
// === POSITION ===
const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().default(0), // Elevation (flying, elevated terrain)
});

// === CONDITIONS (D&D 5e PHB) ===
const ConditionSchema = z.enum([
  "blinded", // Can't see, auto-fail sight checks, attacks disadvantage, attacked with advantage
  "charmed", // Can't attack charmer, charmer has advantage on social checks
  "deafened", // Can't hear, auto-fail hearing checks
  "frightened", // Disadvantage while source visible, can't willingly approach
  "grappled", // Speed 0, ends if grappler incapacitated or effect removes
  "incapacitated", // Can't take actions or reactions
  "invisible", // Impossible to see without magic, attacks advantage, attacked disadvantage
  "paralyzed", // Incapacitated, can't move/speak, auto-fail STR/DEX saves, attacked advantage, melee crits
  "petrified", // Transformed to stone, incapacitated, unaware, resistance all, immune poison/disease
  "poisoned", // Disadvantage on attacks and ability checks
  "prone", // Only crawl, disadvantage on attacks, melee advantage, ranged disadvantage
  "restrained", // Speed 0, attacks disadvantage, attacked advantage, DEX saves disadvantage
  "stunned", // Incapacitated, can't move, speak falteringly, auto-fail STR/DEX saves, attacked advantage
  "unconscious", // Incapacitated, can't move/speak, unaware, drop held items, fall prone, auto-fail STR/DEX, attacked advantage, melee crits
  "exhaustion", // Cumulative levels 1-6
]);

// === DAMAGE TYPES ===
const DamageTypeSchema = z.enum([
  "slashing",
  "piercing",
  "bludgeoning",
  "fire",
  "cold",
  "lightning",
  "thunder",
  "acid",
  "poison",
  "necrotic",
  "radiant",
  "force",
  "psychic",
]);

// === COVER ===
const CoverSchema = z.enum([
  "none", // No cover
  "half", // +2 AC, +2 DEX saves (low wall, furniture, creature)
  "three_quarters", // +5 AC, +5 DEX saves (portcullis, arrow slit)
  "full", // Can't be targeted directly
]);

// === LIGHT ===
const LightSchema = z.enum([
  "bright", // Normal vision
  "dim", // Lightly obscured, disadvantage on Perception
  "darkness", // Heavily obscured, effectively blinded
  "magical_darkness", // Darkvision doesn't help
]);

// === SIZE ===
const SizeSchema = z.enum([
  "tiny", // 2.5x2.5 ft
  "small", // 5x5 ft
  "medium", // 5x5 ft
  "large", // 10x10 ft
  "huge", // 15x15 ft
  "gargantuan", // 20x20+ ft
]);

// === ABILITY SCORES ===
const AbilitySchema = z.enum(["str", "dex", "con", "int", "wis", "cha"]);

// === SKILLS ===
const SkillSchema = z.enum([
  "acrobatics",
  "animal_handling",
  "arcana",
  "athletics",
  "deception",
  "history",
  "insight",
  "intimidation",
  "investigation",
  "medicine",
  "nature",
  "perception",
  "performance",
  "persuasion",
  "religion",
  "sleight_of_hand",
  "stealth",
  "survival",
]);

// === ACTIONS ===
const ActionTypeSchema = z.enum([
  "attack",
  "cast_spell",
  "dash",
  "disengage",
  "dodge",
  "help",
  "hide",
  "ready",
  "search",
  "use_object",
  "use_magic_item",
  "use_special_ability",
  "shove",
  "grapple",
]);

// === AOE SHAPES ===
const AoeShapeSchema = z.enum([
  "line", // Length × Width (default 5ft)
  "cone", // Origin point, spreads in direction
  "cube", // Side length, one face on origin
  "sphere", // Radius from center
  "cylinder", // Radius + height
]);
```

---

## Module 1: COMBAT (15 tools)

### 1. `create_encounter`

```typescript
const createEncounterSchema = z.object({
  seed: z.string().optional(),

  participants: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        hp: z.number().positive(),
        maxHp: z.number().positive(),
        ac: z.number().min(0).default(10),
        initiativeBonus: z.number().default(0),
        position: PositionSchema,
        isEnemy: z.boolean().default(false),
        size: SizeSchema.default("medium"),
        speed: z.number().default(30),
        resistances: z.array(DamageTypeSchema).optional(),
        immunities: z.array(DamageTypeSchema).optional(),
        vulnerabilities: z.array(DamageTypeSchema).optional(),
        conditionImmunities: z.array(ConditionSchema).optional(),
      })
    )
    .min(1),

  terrain: z
    .object({
      width: z.number().min(5).max(100).default(20),
      height: z.number().min(5).max(100).default(20),
      obstacles: z.array(z.string()).optional(), // "x,y" format
      difficultTerrain: z.array(z.string()).optional(),
      water: z.array(z.string()).optional(),
      hazards: z
        .array(
          z.object({
            position: z.string(),
            type: z.string(),
            damage: z.string().optional(),
            dc: z.number().optional(),
          })
        )
        .optional(),
    })
    .optional(),

  lighting: LightSchema.default("bright"),
  surprise: z.array(z.string()).optional(), // IDs of surprised creatures
});
```

### 2. `get_encounter`

```typescript
const getEncounterSchema = z.object({
  encounterId: z.string(),
});

// Returns full encounter state including:
// - All participants with current HP, conditions, position
// - Current turn, round number
// - Active effects and auras
// - Terrain state
```

### 3. `execute_action`

```typescript
const executeActionSchema = z.object({
  encounterId: z.string(),

  // Single action OR Batch actions
  // If array is provided, it processes all in sequence
  actions: z
    .array(
      z.object({
        actorId: z.string(),
        action: ActionTypeSchema,

        // ... all other params (targetId, damage, etc.)
      })
    )
    .optional(),

  // Legacy/Single mode (kept for backward compat or simple calls)
  actorId: z.string().optional(),
  action: ActionTypeSchema.optional(),

  // === ATTACK ===
  targetId: z.string().optional(),
  attackBonus: z.number().optional(),
  damage: z.string().optional(), // Dice notation: "2d6+4"
  damageType: DamageTypeSchema.optional(),
  advantage: z.boolean().optional(),
  disadvantage: z.boolean().optional(),
  isCritical: z.boolean().optional(), // Force crit (for nat 20)

  // === SPELL ===
  spellName: z.string().optional(),
  spellSlot: z.number().min(1).max(9).optional(),
  targetIds: z.array(z.string()).optional(),
  targetPosition: PositionSchema.optional(),
  spellDC: z.number().optional(),
  spellAttackBonus: z.number().optional(),

  // === GRAPPLE/SHOVE ===
  contestedCheck: z
    .object({
      attackerSkill: z.enum(["athletics"]),
      defenderChoice: z.enum(["athletics", "acrobatics"]),
    })
    .optional(),
  shoveDirection: z.enum(["away", "prone"]).optional(),

  // === READY ===
  trigger: z.string().optional(),
  readiedAction: ActionTypeSchema.optional(),

  // === SPECIAL ===
  abilityName: z.string().optional(),
  abilityDetails: z.record(z.any()).optional(),
});
```

### 4. `advance_turn`

```typescript
const advanceTurnSchema = z.object({
  encounterId: z.string(),

  // Optional: process end-of-turn effects
  processEffects: z.boolean().default(true),
});

// Automatically handles:
// - Condition duration ticks
// - Concentration duration checks
// - Aura triggers for new active combatant
```

### 5. `end_encounter`

```typescript
const endEncounterSchema = z.object({
  encounterId: z.string(),

  // Optional outcome tracking
  outcome: z.enum(["victory", "defeat", "retreat", "negotiation"]).optional(),
  xpAwarded: z.number().optional(),
});
```

### 6. `roll_initiative`

```typescript
const rollInitiativeSchema = z.object({
  encounterId: z.string(),

  // Roll for specific creatures or all
  creatureIds: z.array(z.string()).optional(),

  // Or set initiative manually
  setInitiative: z
    .array(
      z.object({
        creatureId: z.string(),
        initiative: z.number(),
      })
    )
    .optional(),
});
```

### 7. `apply_damage`

```typescript
const applyDamageSchema = z.object({
  encounterId: z.string().optional(), // Optional if using characterId outside combat
  targetId: z.string(),

  damage: z.number().positive(),
  damageType: DamageTypeSchema,

  // Modifiers
  magical: z.boolean().default(false),
  source: z.string().optional(), // "Fireball", "Longsword"

  // For saves that halve damage
  halfOnSave: z.boolean().optional(),
  savePassed: z.boolean().optional(),
});

// Automatically calculates resistance/immunity/vulnerability
// Handles unconscious → death saves transition
```

### 8. `apply_healing`

```typescript
const applyHealingSchema = z.object({
  encounterId: z.string().optional(),
  targetId: z.string(),

  healing: z.number().positive(),
  source: z.string().optional(),

  // Special healing types
  tempHp: z.boolean().default(false),
  overheal: z.boolean().default(false), // Allow above max
});
```

### 9. `roll_death_save`

```typescript
const rollDeathSaveSchema = z.object({
  encounterId: z.string(),
  characterId: z.string(),

  // Optional modifier (e.g., Bless, Diamond Soul)
  modifier: z.number().optional(),
  advantage: z.boolean().optional(),
});

// Returns: { roll, total, successes, failures, stabilized, revived, dead }
// nat 1 = 2 failures, nat 20 = revive at 1 HP
```

### 10. `manage_condition`

```typescript
const manageConditionSchema = z.object({
  targetId: z.string(),
  encounterId: z.string().optional(),

  operation: z.enum(["add", "remove", "query", "tick"]),

  // For add
  condition: ConditionSchema.optional(),
  source: z.string().optional(),
  duration: z
    .union([
      z.number(), // Rounds
      z.literal("concentration"),
      z.literal("until_dispelled"),
      z.literal("until_rest"),
      z.literal("save_ends"), // Save at end of each turn
    ])
    .optional(),
  saveDC: z.number().optional(),
  saveAbility: AbilitySchema.optional(),

  // For exhaustion
  exhaustionLevels: z.number().min(1).max(6).optional(),
  exhaustionChange: z.enum(["add", "remove"]).optional(),

  // For tick
  roundNumber: z.number().optional(),
});
```

### 11. `manage_effect`

```typescript
const manageEffectSchema = z.object({
  targetId: z.string(),
  encounterId: z.string().optional(),

  operation: z.enum(["add", "remove", "query", "tick"]),

  // Effect definition
  effect: z
    .object({
      name: z.string(),
      type: z.enum(["boon", "curse", "neutral"]),
      source: z.string().optional(),

      // Mechanical effects
      acBonus: z.number().optional(),
      attackBonus: z.number().optional(),
      damageBonus: z.string().optional(),
      savingThrowBonus: z.number().optional(),
      speedModifier: z.number().optional(),

      resistances: z.array(DamageTypeSchema).optional(),
      immunities: z.array(DamageTypeSchema).optional(),
      vulnerabilities: z.array(DamageTypeSchema).optional(),

      advantageOn: z.array(z.string()).optional(),
      disadvantageOn: z.array(z.string()).optional(),

      // Duration
      duration: z
        .union([
          z.number(),
          z.literal("concentration"),
          z.literal("until_dispelled"),
          z.literal("until_rest"),
        ])
        .optional(),

      // Triggers
      trigger: z
        .enum([
          "start_of_turn",
          "end_of_turn",
          "on_attack",
          "on_hit",
          "on_damage_taken",
          "on_death",
        ])
        .optional(),
      triggerEffect: z.string().optional(),
    })
    .optional(),

  effectId: z.string().optional(), // For remove
});
```

### 12. `move_combatant`

```typescript
const moveCombatantSchema = z.object({
  encounterId: z.string(),
  creatureId: z.string(),

  // Destination
  to: PositionSchema,

  // Movement type
  movementType: z
    .enum(["walk", "fly", "swim", "climb", "burrow", "teleport"])
    .default("walk"),

  // Options
  dash: z.boolean().default(false),
  disengage: z.boolean().default(false),
  forcedMovement: z.boolean().default(false), // No opportunity attacks

  // For jumps
  jumpType: z.enum(["long", "high"]).optional(),
  runningStart: z.boolean().optional(),
});

// Returns: { path, distanceMoved, difficultTerrain, opportunityAttacks, newPosition }
```

### 13. `render_battlefield`

```typescript
const renderBattlefieldSchema = z.object({
  encounterId: z.string(),

  width: z.number().min(5).max(50).default(20),
  height: z.number().min(5).max(50).default(20),

  // Focus area (for large maps)
  centerOn: z
    .union([
      z.string(), // Creature ID
      PositionSchema,
    ])
    .optional(),

  showLegend: z.boolean().default(true),
  showGrid: z.boolean().default(true),

  // Highlight options
  highlightRange: z
    .object({
      from: z.string(),
      range: z.number(),
    })
    .optional(),
  highlightAoe: z
    .object({
      shape: AoeShapeSchema,
      origin: PositionSchema,
      size: z.number(),
    })
    .optional(),
});

// Returns ASCII map with legend:
// A-Z = allies, 1-9 = enemies, █ = obstacle, ░ = difficult, ~ = water
```

### 14. `modify_terrain`

```typescript
const modifyTerrainSchema = z.object({
  encounterId: z.string(),

  operation: z.enum(["add", "remove", "clear"]),

  terrainType: z.enum(["obstacle", "difficult", "water", "pit", "hazard"]),

  // Positions to modify
  positions: z.array(z.string()), // "x,y" format

  // For hazards
  hazardDetails: z
    .object({
      name: z.string(),
      damage: z.string().optional(),
      damageType: DamageTypeSchema.optional(),
      dc: z.number().optional(),
      saveAbility: AbilitySchema.optional(),
    })
    .optional(),

  // Range shortcuts
  range: z.string().optional(), // "rect:5,5,10,10", "line:0,5,20,5"
});
```

### 15. `execute_lair_action`

```typescript
const executeLairActionSchema = z.object({
  encounterId: z.string(),

  description: z.string(),

  // Targeting
  targetIds: z.array(z.string()).optional(),
  targetArea: z
    .object({
      shape: AoeShapeSchema,
      origin: PositionSchema,
      size: z.number(),
    })
    .optional(),

  // Effects
  damage: z.number().optional(),
  damageType: DamageTypeSchema.optional(),

  savingThrow: z
    .object({
      ability: AbilitySchema,
      dc: z.number(),
      halfOnSave: z.boolean().default(true),
    })
    .optional(),

  condition: ConditionSchema.optional(),
  conditionDuration: z.number().optional(),

  terrainChange: z
    .object({
      type: z.enum(["add_obstacle", "add_difficult", "add_hazard"]),
      positions: z.array(z.string()),
    })
    .optional(),
});
```

---

## Module 2: SPATIAL (8 tools)

### 16. `calculate_aoe`

```typescript
const calculateAoeSchema = z.object({
  encounterId: z.string(),

  shape: AoeShapeSchema,
  origin: PositionSchema,

  // Shape-specific parameters
  length: z.number().optional(), // Line, Cone
  width: z.number().default(5).optional(), // Line
  radius: z.number().optional(), // Sphere, Cylinder
  sideLength: z.number().optional(), // Cube
  height: z.number().optional(), // Cylinder

  direction: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),

  // Options
  includeOrigin: z.boolean().default(false),
  excludeIds: z.array(z.string()).optional(),
});

// Returns: { tiles: Position[], creatures: string[], visualization: string }
```

### 17. `measure_distance`

```typescript
const measureDistanceSchema = z.object({
  encounterId: z.string().optional(),

  from: z.union([z.string(), PositionSchema]),
  to: z.union([z.string(), PositionSchema]),

  // Measurement mode
  mode: z
    .enum([
      "euclidean", // √(x² + y²)
      "grid_5e", // Diagonal = 5ft (simplified)
      "grid_alt", // Diagonal alternates 5/10
    ])
    .default("grid_5e"),

  includeElevation: z.boolean().default(true),
});

// Returns: { distanceFeet: number, distanceSquares: number }
```

### 18. `check_line_of_sight`

```typescript
const checkLineOfSightSchema = z.object({
  encounterId: z.string(),

  from: z.union([z.string(), PositionSchema]),
  to: z.union([z.string(), PositionSchema]),

  // Check type
  checkType: z
    .enum([
      "vision", // Can they see the target?
      "targeting", // Can they target with spell/attack?
      "cover", // What cover does target have?
    ])
    .default("vision"),
});

// Returns: { hasLoS: boolean, cover: Cover, blocked: boolean, reason?: string }
```

### 19. `get_creatures_in_range`

```typescript
const getCreaturesInRangeSchema = z.object({
  encounterId: z.string(),

  from: z.union([z.string(), PositionSchema]),
  range: z.number(),

  // Filters
  includeAllies: z.boolean().default(true),
  includeEnemies: z.boolean().default(true),
  includeUnconscious: z.boolean().default(true),
  excludeIds: z.array(z.string()).optional(),

  // LoS requirement
  requireLoS: z.boolean().default(false),
});

// Returns: { creatures: Array<{ id, name, distance, position, isEnemy }> }
```

### 20. `check_cover`

```typescript
const checkCoverSchema = z.object({
  encounterId: z.string(),

  attackerId: z.string(),
  targetId: z.string(),

  // Attack type affects cover calculation
  attackType: z.enum(["melee", "ranged", "spell"]).default("ranged"),
});

// Returns: { cover: Cover, acBonus: number, dexSaveBonus: number }
```

### 21. `place_prop`

```typescript
const placePropSchema = z.object({
  encounterId: z.string(),

  position: z.string(), // "x,y"

  prop: z.object({
    name: z.string(),
    type: z.enum(["structure", "cover", "climbable", "hazard", "interactive"]),

    // Physical properties
    size: SizeSchema.default("medium"),
    height: z.number().optional(), // Feet

    // Cover
    coverProvided: CoverSchema.optional(),

    // Interaction
    climbable: z.boolean().optional(),
    climbDC: z.number().optional(),
    breakable: z.boolean().optional(),
    hp: z.number().optional(),
    ac: z.number().optional(),

    // Description
    description: z.string().optional(),
  }),
});
```

### 22. `calculate_movement`

```typescript
const calculateMovementSchema = z.object({
  encounterId: z.string(),
  creatureId: z.string(),

  from: PositionSchema.optional(), // Default: current position
  to: PositionSchema,

  movementType: z.enum(["walk", "fly", "swim", "climb"]).default("walk"),
});

// Returns: {
//   totalCost: number,
//   path: Position[],
//   difficultSquares: number,
//   canReach: boolean,
//   requiredMovement: number
// }
```

### 23. `get_adjacent_squares`

```typescript
const getAdjacentSquaresSchema = z.object({
  encounterId: z.string(),

  from: z.union([z.string(), PositionSchema]),

  // Include diagonals
  includeDiagonals: z.boolean().default(true),

  // Filter results
  onlyEmpty: z.boolean().default(false),
  onlyOccupied: z.boolean().default(false),
});

// Returns: { squares: Array<{ position: Position, occupied?: string, terrain?: string }> }
```

---

## Module 3: MAGIC (10 tools)

### 24. `cast_spell`

```typescript
const castSpellSchema = z.object({
  encounterId: z.string().optional(),
  casterId: z.string(),

  spellName: z.string(),
  slotLevel: z.number().min(0).max(9), // 0 = cantrip

  // Targeting
  targetId: z.string().optional(),
  targetIds: z.array(z.string()).optional(),
  targetPosition: PositionSchema.optional(),

  // Spell attack/DC
  spellAttackBonus: z.number().optional(),
  spellSaveDC: z.number().optional(),

  // Options
  upcast: z.boolean().default(false),
  ritual: z.boolean().default(false),
  subtle: z.boolean().default(false), // Subtle Spell metamagic

  // For spells with choices
  damageType: DamageTypeSchema.optional(), // Chromatic Orb
  creatureType: z.string().optional(), // Summons
  effectChoice: z.string().optional(), // Various
});
```

### 25. `check_concentration`

```typescript
const checkConcentrationSchema = z.object({
  encounterId: z.string().optional(),
  characterId: z.string(),

  damageTaken: z.number(),

  // Modifiers
  modifier: z.number().optional(), // CON save bonus
  advantage: z.boolean().optional(),
  warCaster: z.boolean().optional(), // Advantage on CON saves
});

// DC = max(10, damageTaken / 2)
// Returns: { roll, total, dc, success, concentrationMaintained, spellName }
```

### 26. `break_concentration`

```typescript
const breakConcentrationSchema = z.object({
  characterId: z.string(),
  encounterId: z.string().optional(),

  reason: z.enum([
    "failed_save",
    "incapacitated",
    "new_spell",
    "voluntary",
    "death",
    "duration_expired",
  ]),
});
```

### 27. `get_concentration`

```typescript
const getConcentrationSchema = z.object({
  characterId: z.string(),
  encounterId: z.string().optional(),
});

// Returns: { concentrating: boolean, spell?: string, startRound?: number, duration?: number }
```

### 28. `manage_spell_slots`

```typescript
const manageSpellSlotsSchema = z.object({
  characterId: z.string(),

  operation: z.enum(["view", "expend", "restore", "set"]),

  slotLevel: z.number().min(1).max(9).optional(),
  count: z.number().optional(),

  // For warlocks
  pactMagic: z.boolean().default(false),

  // For set operation (DM override)
  slots: z
    .record(
      z.object({
        current: z.number(),
        max: z.number(),
      })
    )
    .optional(),
});
```

### 29. `use_scroll`

```typescript
const useScrollSchema = z.object({
  characterId: z.string(),
  encounterId: z.string().optional(),

  scrollItemId: z.string(),

  // Targeting
  targetId: z.string().optional(),
  targetIds: z.array(z.string()).optional(),
  targetPosition: PositionSchema.optional(),

  // If scroll is above caster's level, Arcana check required
  arcanaBonus: z.number().optional(),
});

// Returns: { success, arcanaCheck?, spellCast?, consumed }
```

### 30. `create_aura`

```typescript
const createAuraSchema = z.object({
  encounterId: z.string(),
  ownerId: z.string(),

  aura: z.object({
    name: z.string(),
    radius: z.number(), // Feet

    // Who it affects
    affectsSelf: z.boolean().default(false),
    affectsAllies: z.boolean().default(false),
    affectsEnemies: z.boolean().default(false),

    // Effects
    effects: z.array(
      z.object({
        trigger: z.enum(["enter", "start_of_turn", "end_of_turn", "exit"]),

        damage: z.string().optional(),
        damageType: DamageTypeSchema.optional(),
        healing: z.string().optional(),

        saveDC: z.number().optional(),
        saveAbility: AbilitySchema.optional(),
        halfOnSave: z.boolean().optional(),

        condition: ConditionSchema.optional(),
        conditionDuration: z.number().optional(),

        bonus: z
          .object({
            type: z.enum(["ac", "attack", "damage", "save", "all_saves"]),
            value: z.number(),
          })
          .optional(),
      })
    ),

    // Duration
    requiresConcentration: z.boolean().default(false),
    duration: z.number().optional(), // Rounds
  }),
});
```

### 31. `process_aura`

```typescript
const processAuraSchema = z.object({
  encounterId: z.string(),
  creatureId: z.string(),

  trigger: z.enum([
    "enter",
    "start_of_turn",
    "end_of_turn",
    "exit",
    "movement",
  ]),
});

// Returns: { triggeredAuras: Array<{ auraName, effect, result }> }
```

### 32. `synthesize_spell`

```typescript
const synthesizeSpellSchema = z.object({
  encounterId: z.string().optional(),
  casterId: z.string(),

  intent: z.string(), // "I want to create a wall of thorns"

  proposedSpell: z.object({
    name: z.string(),
    level: z.number().min(1).max(9),
    school: z.enum([
      "abjuration",
      "conjuration",
      "divination",
      "enchantment",
      "evocation",
      "illusion",
      "necromancy",
      "transmutation",
    ]),

    effect: z.object({
      type: z.enum(["damage", "healing", "control", "utility", "summon"]),
      damage: z.string().optional(),
      damageType: DamageTypeSchema.optional(),
      healing: z.string().optional(),
      condition: ConditionSchema.optional(),
    }),

    range: z.number(),
    area: z
      .object({
        shape: AoeShapeSchema,
        size: z.number(),
      })
      .optional(),

    savingThrow: z
      .object({
        ability: AbilitySchema,
        dc: z.number(),
      })
      .optional(),

    concentration: z.boolean().default(false),
    duration: z.string().optional(),
  }),

  // Circumstance modifiers
  nearLeyLine: z.boolean().optional(),
  desperationBonus: z.boolean().optional(),
  materialComponentValue: z.number().optional(),
});

// Arcana check DC = 10 + (level × 2) + modifiers
// Returns: { success, masteryLevel, outcome, spell?, mishap? }
```

### 33. `get_spell_info`

```typescript
const getSpellInfoSchema = z.object({
  spellName: z.string().optional(),

  // Or search
  searchQuery: z.string().optional(),
  school: z.string().optional(),
  level: z.number().optional(),
  class: z.string().optional(),

  limit: z.number().default(10),
});
```

---

## Module 4: CHARACTERS (8 tools)

### 34. `create_character`

```typescript
const createCharacterSchema = z.object({
  name: z.string(),

  // Core
  race: z.string().default("Human"),
  class: z.string().default("Fighter"),
  level: z.number().min(1).max(20).default(1),
  background: z.string().optional(),

  // Type
  characterType: z.enum(["pc", "npc", "enemy", "neutral"]).default("pc"),

  // Stats
  stats: z
    .object({
      str: z.number().min(1).max(30).default(10),
      dex: z.number().min(1).max(30).default(10),
      con: z.number().min(1).max(30).default(10),
      int: z.number().min(1).max(30).default(10),
      wis: z.number().min(1).max(30).default(10),
      cha: z.number().min(1).max(30).default(10),
    })
    .optional(),

  // Combat
  hp: z.number().optional(), // Auto-calculated if not provided
  maxHp: z.number().optional(),
  ac: z.number().default(10),
  speed: z.number().default(30),

  // Defenses
  resistances: z.array(DamageTypeSchema).optional(),
  immunities: z.array(DamageTypeSchema).optional(),
  vulnerabilities: z.array(DamageTypeSchema).optional(),
  conditionImmunities: z.array(ConditionSchema).optional(),

  // Spellcasting
  spellcastingAbility: AbilitySchema.optional(),
  knownSpells: z.array(z.string()).optional(),
  preparedSpells: z.array(z.string()).optional(),
  cantrips: z.array(z.string()).optional(),

  // Skills (proficiencies)
  skillProficiencies: z.array(SkillSchema).optional(),
  saveProficiencies: z.array(AbilitySchema).optional(),

  // Starting equipment
  equipment: z.array(z.string()).optional(),
});
```

### 35. `get_character`

```typescript
const getCharacterSchema = z.object({
  characterId: z.string(),
});
```

### 36. `update_character`

```typescript
const updateCharacterSchema = z.object({
  characterId: z.string(),

  // Any field from create_character
  updates: z.object({
    name: z.string().optional(),
    level: z.number().optional(),
    hp: z.number().optional(),
    maxHp: z.number().optional(),
    ac: z.number().optional(),
    stats: z
      .object({
        str: z.number().optional(),
        dex: z.number().optional(),
        con: z.number().optional(),
        int: z.number().optional(),
        wis: z.number().optional(),
        cha: z.number().optional(),
      })
      .optional(),
    // ... other fields
  }),
});
```

### 37. `list_characters`

```typescript
const listCharactersSchema = z.object({
  characterType: z.enum(["pc", "npc", "enemy", "neutral"]).optional(),
  partyId: z.string().optional(),
  nameSearch: z.string().optional(),
  limit: z.number().default(50),
});
```

### 38. `delete_character`

```typescript
const deleteCharacterSchema = z.object({
  characterId: z.string(),
});
```

### 39. `roll_check`

```typescript
const rollCheckSchema = z.object({
  characterId: z.string(),

  checkType: z.enum(["skill", "ability", "save", "attack", "initiative"]),

  // For skill checks
  skill: SkillSchema.optional(),

  // For ability checks and saves
  ability: AbilitySchema.optional(),

  // Modifiers
  dc: z.number().optional(),
  advantage: z.boolean().optional(),
  disadvantage: z.boolean().optional(),
  bonus: z.number().optional(), // Guidance, etc.

  // Contest
  contestedBy: z.string().optional(),
  contestedCheck: z
    .object({
      type: z.enum(["skill", "ability"]),
      skillOrAbility: z.string(),
    })
    .optional(),
});

// Returns: { roll, modifier, total, dc?, success?, nat20?, nat1?, contested? }
```

### 40. `roll_dice`

```typescript
const rollDiceSchema = z.object({
  // Single roll expression
  expression: z.string(), // "2d6+4", "1d20", "4d6kh3"

  // Or batch rolls
  rolls: z
    .array(
      z.object({
        name: z.string().optional(),
        expression: z.string(),
      })
    )
    .optional(),

  detailed: z.boolean().default(false),
});

// Returns: { total, formula, rolls: [], detailedResult? }
```

### 40. `take_rest`

```typescript
const takeRestSchema = z.object({
  characterId: z.string(),

  restType: z.enum(["short", "long"]),

  // Short rest options
  hitDiceToSpend: z.number().optional(),

  // Long rest requirements
  uninterrupted: z.boolean().default(true),

  // What to restore (DM can limit)
  restoreHp: z.boolean().default(true),
  restoreSpellSlots: z.boolean().default(true),
  restoreHitDice: z.boolean().default(true), // Long rest only
  clearConditions: z.array(ConditionSchema).optional(),
});

// Long rest: Full HP, half hit dice, all spell slots
// Short rest: Spend hit dice, warlock slots
```

### 41. `level_up`

```typescript
const levelUpSchema = z.object({
  characterId: z.string(),

  targetLevel: z.number().min(2).max(20).optional(), // Default: current + 1

  // HP increase
  hpMethod: z.enum(["roll", "average", "max", "manual"]).default("average"),
  manualHp: z.number().optional(),

  // New features (for tracking)
  newFeatures: z.array(z.string()).optional(),
  newSpells: z.array(z.string()).optional(),
});
```

---

## Module 5: DATA (7 tools)

### 42. `manage_inventory`

```typescript
const manageInventorySchema = z.object({
  characterId: z.string(),

  operation: z.enum([
    "view",
    "give",
    "remove",
    "equip",
    "unequip",
    "transfer",
    "use",
  ]),

  // Item specification
  itemName: z.string().optional(),
  itemId: z.string().optional(),

  // For give
  item: z
    .object({
      name: z.string(),
      type: z.enum(["weapon", "armor", "consumable", "quest", "misc"]),
      description: z.string().optional(),
      properties: z.record(z.any()).optional(),
      value: z.number().optional(),
      weight: z.number().optional(),
    })
    .optional(),

  quantity: z.number().default(1),

  // For equip
  slot: z
    .enum(["mainhand", "offhand", "armor", "head", "feet", "accessory"])
    .optional(),

  // For transfer
  toCharacterId: z.string().optional(),

  // For use (consumable)
  targetId: z.string().optional(),
});
```

### 43. `manage_party`

```typescript
const managePartySchema = z.object({
  operation: z.enum([
    "create",
    "get",
    "update",
    "delete",
    "add_member",
    "remove_member",
    "set_leader",
    "set_active",
  ]),

  partyId: z.string().optional(),

  // For create
  name: z.string().optional(),
  worldId: z.string().optional(),
  initialMembers: z
    .array(
      z.object({
        characterId: z.string(),
        role: z
          .enum(["leader", "member", "companion", "hireling"])
          .default("member"),
      })
    )
    .optional(),

  // For add/remove/set
  characterId: z.string().optional(),
  role: z.enum(["leader", "member", "companion", "hireling"]).optional(),
});
```

### 44. `create_location`

```typescript
const createLocationSchema = z.object({
  name: z.string(),
  description: z.string(),

  locationType: z.enum([
    "room",
    "area",
    "building",
    "dungeon",
    "town",
    "wilderness",
    "tavern",
    "shop",
    "temple",
    "other",
  ]),

  // Connections
  exits: z
    .array(
      z.object({
        direction: z.enum([
          "north",
          "south",
          "east",
          "west",
          "up",
          "down",
          "other",
        ]),
        description: z.string().optional(),
        destination: z.string().optional(), // Location ID if known
        locked: z.boolean().optional(),
        hidden: z.boolean().optional(),
      })
    )
    .optional(),

  // Environment
  lighting: LightSchema.optional(),

  // Contents
  npcsPresent: z.array(z.string()).optional(),
  itemsPresent: z.array(z.string()).optional(),

  // Tags for searching
  tags: z.array(z.string()).optional(),
});
```

### 45. `get_location`

```typescript
const getLocationSchema = z.object({
  locationId: z.string().optional(),
  locationName: z.string().optional(),
});
```

### 46. `add_session_note`

```typescript
const addSessionNoteSchema = z.object({
  worldId: z.string().optional(),

  type: z.enum([
    "plot_thread", // Active storyline
    "canonical_moment", // Important event that happened
    "npc_voice", // NPC speech patterns/motivations
    "foreshadowing", // Hints dropped
    "session_log", // What happened this session
    "secret", // DM-only info
    "clue", // Something players found
    "player_theory", // What players think is happening
  ]),

  content: z.string(),

  // Optional links
  entityId: z.string().optional(),
  entityType: z.enum(["character", "npc", "location", "item"]).optional(),

  // Status tracking (for plot threads)
  status: z.enum(["active", "resolved", "dormant", "archived"]).optional(),

  // Visibility
  visibility: z.enum(["dm_only", "player_visible"]).default("dm_only"),

  // Tags
  tags: z.array(z.string()).optional(),
});
```

### 47. `search_notes`

```typescript
const searchNotesSchema = z.object({
  worldId: z.string().optional(),

  // Filters
  type: z
    .enum([
      "plot_thread",
      "canonical_moment",
      "npc_voice",
      "foreshadowing",
      "session_log",
      "secret",
      "clue",
      "player_theory",
    ])
    .optional(),

  status: z.enum(["active", "resolved", "dormant", "archived"]).optional(),

  entityId: z.string().optional(),

  tags: z.array(z.string()).optional(), // AND match

  query: z.string().optional(), // Text search

  visibility: z.enum(["dm_only", "player_visible"]).optional(),

  limit: z.number().default(20),
});
```

### 48. `get_session_context`

```typescript
const getSessionContextSchema = z.object({
  worldId: z.string().optional(),
  partyId: z.string().optional(),
  characterId: z.string().optional(), // Active character POV
  encounterId: z.string().optional(),

  // What to include
  includeTypes: z
    .array(
      z.enum([
        "plot_threads",
        "recent_events",
        "npc_context",
        "party_status",
        "active_effects",
        "location",
        "combat_state",
      ])
    )
    .default(["plot_threads", "recent_events", "party_status"]),

  // Verbosity
  verbosity: z.enum(["minimal", "standard", "detailed"]).default("standard"),

  // For DM vs player view
  forPlayer: z.boolean().default(false), // Hides DM-only content
});

// Returns formatted context string for LLM injection
```

---

## Reference: Setting DCs

| Difficulty        | DC  |
| ----------------- | --- |
| Very Easy         | 5   |
| Easy              | 10  |
| Medium            | 15  |
| Hard              | 20  |
| Very Hard         | 25  |
| Nearly Impossible | 30  |

---

_Schema Version: 0.1.0_  
_D&D 5e SRD Compliant_
