# Stateful Encounter System

## Overview

The stateful encounter system allows you to create encounters by **referencing characters** (by ID or name) instead of manually providing all participant data. The system automatically pulls current character state from persistent storage.

---

## Usage Modes

### Reference Mode (Recommended for Player Characters)

Simply provide a character ID or name:

```javascript
{
  "participants": [
    {
      "characterId": "abc-123-def-456",  // UUID
      "position": { "x": 5, "y": 5, "z": 0 }
    },
    // OR use character name (case-insensitive)
    {
      "characterName": "Thorn Ironshield",
      "position": { "x": 10, "y": 5, "z": 0 }
    }
  ]
}
```

**Auto-populated fields:**
- `name` - Character's name
- `hp` - Current HP from persistent storage
- `maxHp` - Maximum HP
- `ac` - Armor Class
- `speed` - Movement speed
- `size` - Creature size (tiny/small/medium/large/huge/gargantuan)
- `initiativeBonus` - **Automatically calculated from DEX modifier**
- `resistances`, `immunities`, `vulnerabilities` - Damage modifiers
- `isEnemy` - Defaults to `true` if characterType is 'enemy', `false` otherwise
- `characterId` - Links participant to persistent character

**Optional overrides:**
- `id` - Participant ID (defaults to characterId)
- `position` - Starting position (defaults to 0,0,0)
- `hp` - Override current HP (useful for testing scenarios)
- `isEnemy` - Override enemy status

### Manual Mode (For NPCs/Enemies)

Provide all participant data explicitly:

```javascript
{
  "participants": [
    {
      "id": "goblin-1",
      "name": "Goblin Scout",
      "hp": 7,
      "maxHp": 7,
      "ac": 15,
      "initiativeBonus": 2,
      "position": { "x": 20, "y": 10, "z": 0 },
      "isEnemy": true,
      "size": "small"
    }
  ]
}
```

### Mixed Mode

You can mix both modes in the same encounter:

```javascript
{
  "participants": [
    // Reference mode
    { "characterName": "Thorn Ironshield", "position": { "x": 5, "y": 5 } },
    { "characterName": "Sage Whisperwind", "position": { "x": 10, "y": 5 } },

    // Manual mode
    {
      "id": "goblin-1",
      "name": "Goblin",
      "hp": 7,
      "maxHp": 7,
      "ac": 15,
      "initiativeBonus": 2,
      "position": { "x": 20, "y": 10 },
      "isEnemy": true
    }
  ]
}
```

---

## Initiative Calculation

### Character Sheet vs Encounter Display

**Important:** The encounter displays **ROLLED INITIATIVE**, not just the bonus.

| Display | Shows | Example |
|---------|-------|---------|
| **Character Sheet** | Initiative **Bonus** | `Initiative: +2` |
| **Encounter** | **Rolled** Initiative (d20 + bonus) | `Initiative: 15` (rolled 13, bonus +2) |

**Calculation:**
1. System calculates `initiativeBonus` from DEX modifier: `(DEX - 10) / 2` rounded down
2. On encounter creation, rolls d20 for each participant
3. Final initiative = d20 roll + initiativeBonus
4. Participants are sorted by initiative (highest first)

**Example:**
- Character has DEX 14 → initiativeBonus = +2
- Character sheet displays: "Initiative: +2"
- Encounter rolls d20: gets 13
- Encounter displays: "Initiative: 15" (13 + 2)

---

## Character Name Lookup

### Behavior

When using `characterName` instead of `characterId`:

✅ **Case-insensitive** - "thorn ironshield", "THORN IRONSHIELD", and "Thorn Ironshield" all match

⚠️ **First match wins** - If multiple characters share the same name, the system returns the **first match** found (by filesystem order)

### Best Practices

| Scenario | Recommendation | Reason |
|----------|---------------|--------|
| **Unique character names** | Use `characterName` | Convenient, readable |
| **Production encounters** | Use `characterId` | Guaranteed precision |
| **Duplicate names possible** | Use `characterId` | Avoid wrong character |
| **Scripted scenarios** | Use `characterId` | Predictable, no ambiguity |

### Example: Duplicate Name Scenario

```javascript
// Database has:
// 1. "Sage Whisperwind" (Level 3 Elf Wizard, ID: abc-123)
// 2. "Sage Whisperwind" (Level 6 Half-Elf Wizard, ID: def-456)

// Using characterName - unpredictable!
{
  "characterName": "Sage Whisperwind"  // Might get Level 3 OR Level 6
}

// Using characterId - precise!
{
  "characterId": "abc-123"  // Always gets Level 3
}
```

**Recommendation:** If you have multiple characters with the same name, either:
1. Use `characterId` for all references
2. Rename characters to be unique
3. Accept that the first match will be used

---

## State Synchronization

### What Gets Synchronized

When you reference a character, the encounter pulls their **current state** at the moment of creation:

| Field | Source | Notes |
|-------|--------|-------|
| HP | Persistent storage | Current HP (may be less than max if damaged) |
| Max HP | Persistent storage | Character's maximum HP |
| AC | Persistent storage | Current armor class |
| Speed | Persistent storage | Movement speed in feet |
| Size | Persistent storage | Creature size category |
| Stats | Persistent storage | STR, DEX, CON, INT, WIS, CHA |
| Resistances | Persistent storage | Damage resistances |
| Immunities | Persistent storage | Damage immunities |
| Vulnerabilities | Persistent storage | Damage vulnerabilities |

### What Happens During Encounter

**During the encounter:**
- Participant HP is **isolated** from persistent storage
- Damage taken in encounter does NOT affect persistent character HP
- Changes are only synced back on encounter commit (future feature)

**Example:**
```
1. Character HP in storage: 28/28
2. Create encounter → Participant HP: 28/28
3. Participant takes 10 damage → Participant HP: 18/28
4. Persistent character HP: STILL 28/28 (unchanged)
5. End encounter → Changes are NOT committed yet
```

---

## Error Handling

### Character Not Found (by ID)

```javascript
{
  "characterId": "00000000-0000-0000-0000-000000000000"
}
```

**Error:** `"Character not found: 00000000-0000-0000-0000-000000000000"`

### Character Not Found (by Name)

```javascript
{
  "characterName": "Definitely Does Not Exist"
}
```

**Error:** `"Character not found with name: Definitely Does Not Exist"`

### Missing Required Fields

```javascript
{
  "characterName": ""  // Empty string
}
```

**Error:** `"Either characterId or characterName must be provided in reference mode"`

### Invalid Character ID Format

```javascript
{
  "characterId": "not-a-valid-uuid"
}
```

**Error:** `"Character not found: not-a-valid-uuid"` (no special handling for malformed UUIDs)

---

## Performance Considerations

### Character Lookup Cost

- **By ID:** O(1) - Direct file read
- **By Name:** O(n) - Scans all character files

**Recommendation:** For encounters with many participants (>10), prefer `characterId` to minimize lookup time.

### State Polling

Each character reference triggers:
1. File system read (character JSON)
2. JSON parsing
3. Stat calculations (initiative bonus)

**Impact:** Minimal for typical encounters (1-10 participants), may be noticeable for mass battles (50+ participants)

---

## Migration Guide

### From Old System

**Before (Manual Mode):**
```javascript
{
  "participants": [
    {
      "id": "thorn",
      "name": "Thorn Ironshield",
      "hp": 28,
      "maxHp": 28,
      "ac": 18,
      "initiativeBonus": 2,
      "position": { "x": 5, "y": 5, "z": 0 },
      "isEnemy": false,
      "size": "medium",
      "speed": 30
    }
  ]
}
```

**After (Reference Mode):**
```javascript
{
  "participants": [
    {
      "characterId": "a3d92071-dce4-47c1-868e-fc5ee46afb00",  // or characterName
      "position": { "x": 5, "y": 5, "z": 0 }
    }
  ]
}
```

**Savings:** 75% reduction in JSON size, no manual stat copying

---

## Examples

### Example 1: Simple Combat

```javascript
await handleToolCall('create_encounter', {
  participants: [
    { characterName: "Fighter", position: { x: 0, y: 0 } },
    { characterName: "Wizard", position: { x: 5, y: 0 } },
    {
      id: "goblin-1",
      name: "Goblin",
      hp: 7,
      maxHp: 7,
      ac: 15,
      initiativeBonus: 2,
      position: { x: 10, y: 10 },
      isEnemy: true
    }
  ]
});
```

### Example 2: Position Override

```javascript
{
  characterName: "Rogue",
  position: { x: 20, y: 5, z: 10 }  // 10 feet up (on a ledge)
}
```

### Example 3: HP Override (Testing)

```javascript
{
  characterId: "abc-123",
  hp: 1,  // Override to test "near death" scenario
  position: { x: 0, y: 0 }
}
```

### Example 4: Enemy Character Reference

```javascript
// Character "Bandit Leader" has characterType: 'enemy'
{
  characterName: "Bandit Leader",  // isEnemy will auto-default to true
  position: { x: 15, y: 15 }
}
```

---

## FAQ

### Q: Can I override AC or maxHp?

**A:** No. Only `hp`, `position`, `id`, and `isEnemy` can be overridden in reference mode. For full control, use manual mode.

### Q: What if I update a character's HP after creating an encounter?

**A:** Encounter participants are snapshots at creation time. Updating the persistent character does NOT affect active encounter participants.

### Q: Can I mix characterId and characterName in the same encounter?

**A:** Yes! You can use different lookup methods for different participants.

### Q: What happens if a character is deleted during an active encounter?

**A:** The encounter participant remains intact (it's a copy). Deleting the persistent character does NOT affect active encounters.

### Q: Does this work with custom races/classes?

**A:** Yes! All character data is pulled from persistent storage, including custom class/race definitions.

---

## Troubleshooting

### Problem: Wrong character in encounter

**Cause:** Duplicate character names, `characterName` returned first match

**Solution:** Use `characterId` instead of `characterName`

### Problem: Initiative seems wrong

**Cause:** Encounter shows rolled initiative (d20 + bonus), not just bonus

**Solution:** This is expected behavior. See "Initiative Calculation" section above.

### Problem: Character HP doesn't match

**Cause:** Character was damaged after encounter creation, or HP was overridden

**Solution:** Check persistent character HP vs encounter creation time

### Problem: "Character not found" error

**Cause:** Typo in name, character deleted, or wrong ID

**Solution:** Verify character exists with `get_character`, check spelling (case-insensitive but must match exactly)

---

## Related Documentation

- [ADR-005: Simulation vs Commit Architecture](../ADR-005.md) - Encounter state isolation
- [Character Management Guide](./CHARACTER_MANAGEMENT.md) - Creating and managing characters
- [Combat System](./COMBAT_SYSTEM.md) - Full encounter lifecycle

---

**Last Updated:** 2025-12-20
**Version:** 1.0.0
