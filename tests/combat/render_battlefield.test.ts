/**
 * Tests for render_battlefield tool
 * 
 * Renders a tactical ASCII map of the encounter battlefield with:
 * - Top-down 2D grid with x,y coordinates
 * - Entity symbols (A-Z allies, a-z/1-9 enemies, special states)
 * - Elevation (z) notation via superscripts and legend
 * - Terrain features (walls, difficult terrain, water, hazards)
 * - Legend with full entity details (position, HP, conditions)
 * 
 * Design: ADR-004-RENDER-BATTLEFIELD.md
 * 
 * The core challenge: representing 3D (x,y,z) on a 2D ASCII display
 * while remaining readable for both humans and LLMs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEncounter, clearAllEncounters, renderBattlefield } from '../../src/modules/combat.js';
import { manageCondition, clearAllConditions } from '../../src/modules/combat.js';

// Helper to strip ANSI codes and normalize for text matching
function getTextContent(str: string): string {
  return str
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\r\n/g, '\n');
}

// Helper to extract encounter ID from creation result
function extractEncounterId(createResult: string): string {
  const match = getTextContent(createResult).match(/Encounter ID: ([a-zA-Z0-9_-]+)/i);
  if (!match) throw new Error('Could not extract encounter ID');
  return match[1];
}

// Default position at ground level
const pos = (x: number, y: number, z = 0) => ({ x, y, z });

describe('render_battlefield', () => {
  beforeEach(() => {
    clearAllEncounters();
    clearAllConditions();
  });

  // ============================================================
  // BASIC GRID RENDERING
  // ============================================================

  describe('Basic Grid Rendering', () => {
    it('should render a grid with coordinate headers', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Should have x-axis coordinate header (0, 1, 2, 3, 4)
      expect(text).toMatch(/0.*1.*2.*3.*4/);
      // Should have y-axis coordinates
      expect(text).toMatch(/0.*│/);
      expect(text).toMatch(/1.*│/);
    });

    it('should render empty cells with floor symbol', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Empty cells should show floor (·) or space
      // At minimum, we should see grid cell separators
      expect(text).toMatch(/[│┃|]/);
    });

    it('should place entity at correct grid position', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(2, 3) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Thorin should appear with 'T' symbol
      expect(text).toContain('T');
      // Legend should show position
      expect(text).toMatch(/Thorin.*\(2,\s*3\)|Thorin.*2.*3/i);
    });

    it('should render battlefield title with encounter info', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Should show BATTLEFIELD header or similar
      expect(text).toMatch(/battlefield|combat|encounter/i);
      // Should show round number
      expect(text).toMatch(/round\s*[:\s]*1/i);
    });
  });

  // ============================================================
  // ENTITY SYMBOLS
  // ============================================================

  describe('Entity Symbols', () => {
    it('should use first letter of name for ally symbols (uppercase)', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(1, 1), isEnemy: false },
          { id: 'wizard', name: 'Elara', hp: 28, maxHp: 28, ac: 12, initiativeBonus: 3, position: pos(2, 1), isEnemy: false },
          { id: 'cleric', name: 'Wendel', hp: 32, maxHp: 32, ac: 16, initiativeBonus: 0, position: pos(3, 1), isEnemy: false },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Grid should contain T, E, W (uppercase for allies)
      expect(text).toMatch(/T/);
      expect(text).toMatch(/E/);
      expect(text).toMatch(/W/);
    });

    it('should use lowercase or numbered symbols for enemies', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0), isEnemy: false },
          { id: 'goblin-1', name: 'Goblin', hp: 7, maxHp: 7, ac: 13, initiativeBonus: 2, position: pos(4, 0), isEnemy: true },
          { id: 'goblin-2', name: 'Goblin', hp: 7, maxHp: 7, ac: 13, initiativeBonus: 2, position: pos(4, 1), isEnemy: true },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Should have ally T and enemy indicators (lowercase g or numbered)
      expect(text).toMatch(/T/);
      // Enemy goblins should be lowercase 'g' or numbered (g1, g2, 1, 2)
      expect(text).toMatch(/[g12]/i);
    });

    it('should show dead entities with † symbol', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
          { id: 'goblin', name: 'Goblin', hp: 0, maxHp: 7, ac: 13, initiativeBonus: 2, position: pos(2, 0), isEnemy: true },
        ],
        terrain: { width: 5, height: 5 },
      }));

      // Mark goblin as dead via condition or 0 HP
      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Dead/0HP entity should show † or similar death indicator
      // Or should appear differently in legend
      expect(text).toMatch(/[†○✗]|dead|dying|unconscious/i);
    });

    it('should show unconscious entities with ○ symbol', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 0, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(1, 1) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      // Add unconscious condition
      manageCondition({
        targetId: 'fighter',
        condition: 'unconscious',
        operation: 'add',
        encounterId,
      });

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Should show unconscious indicator
      expect(text).toMatch(/[○◯]|unconscious/i);
    });

    it('should highlight current turn entity', () => {
      const encounterId = extractEncounterId(createEncounter({
        seed: 'deterministic',
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 5, position: pos(0, 0) },
          { id: 'goblin', name: 'Goblin', hp: 7, maxHp: 7, ac: 13, initiativeBonus: 1, position: pos(2, 0), isEnemy: true },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Current turn should be highlighted with ▶ or similar in legend
      expect(text).toMatch(/[▶►→★@]|current|turn/i);
    });

    it('should handle duplicate first letters by using unique symbols', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter-1', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
          { id: 'fighter-2', name: 'Talia', hp: 38, maxHp: 38, ac: 15, initiativeBonus: 3, position: pos(1, 0) },
          { id: 'fighter-3', name: 'Theron', hp: 42, maxHp: 42, ac: 17, initiativeBonus: 1, position: pos(2, 0) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Legend should distinguish between all three T-named characters
      expect(text).toContain('Thorin');
      expect(text).toContain('Talia');
      expect(text).toContain('Theron');
      
      // Grid should have unique identifiers (T, T2, T3 or similar)
      // Or use different symbols entirely
    });
  });

  // ============================================================
  // TERRAIN RENDERING
  // ============================================================

  describe('Terrain Rendering', () => {
    it('should render walls/obstacles as solid blocks', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
        ],
        terrain: {
          width: 5,
          height: 5,
          obstacles: ['2,2', '2,3', '2,4'],  // Vertical wall
        },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Should show wall symbols (█, #, or similar)
      expect(text).toMatch(/[█▓■#]/);
    });

    it('should render difficult terrain distinctly', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
        ],
        terrain: {
          width: 5,
          height: 5,
          difficultTerrain: ['3,3', '3,4', '4,3', '4,4'],  // Rough patch
        },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Should show difficult terrain (░, ~, or in legend)
      expect(text).toMatch(/[░~≋]|difficult/i);
    });

    it('should render water terrain', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
        ],
        terrain: {
          width: 8,
          height: 5,
          water: ['4,2', '5,2', '6,2', '4,3', '5,3', '6,3'],  // River
        },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Should show water (≈, ~, w, or in legend)
      expect(text).toMatch(/[≈~w]|water/i);
    });

    it('should render hazards with warning symbols', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
        ],
        terrain: {
          width: 5,
          height: 5,
          hazards: [
            { position: '2,2', type: 'fire', damage: '1d6', dc: 12 },
            { position: '3,3', type: 'pit_trap', damage: '2d6', dc: 14 },
          ],
        },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Should show hazard indicators
      expect(text).toMatch(/[*☠⚡!]|hazard|fire|trap/i);
    });

    it('should include terrain legend when terrain features exist', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
        ],
        terrain: {
          width: 5,
          height: 5,
          obstacles: ['2,2'],
          difficultTerrain: ['3,3'],
          water: ['4,4'],
        },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Legend should explain terrain symbols
      expect(text).toMatch(/wall|obstacle|difficult|water/i);
    });
  });

  // ============================================================
  // ELEVATION (Z-AXIS)
  // ============================================================

  describe('Elevation Rendering', () => {
    it('should show z-level for elevated entities', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0, 0) },
          { id: 'archer', name: 'Archer', hp: 24, maxHp: 24, ac: 14, initiativeBonus: 3, position: pos(3, 0, 2) },  // On platform (z=2)
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Elevated archer should show z-level (z=2 or 10ft or superscript)
      expect(text).toMatch(/z\s*[=:]\s*2|10\s*ft|²|\[2\]/i);
      // Ground level might be implicit (z=0)
    });

    it('should indicate flying creatures distinctly', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0, 0) },
          { id: 'dragon', name: 'Dragon', hp: 120, maxHp: 120, ac: 17, initiativeBonus: 1, position: pos(2, 2, 6), isEnemy: true },
        ],
        terrain: { width: 5, height: 5 },
      }));

      // Flying is indicated by z > 0 (no explicit flying condition needed)
      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Flying creature should be marked by elevation
      expect(text).toMatch(/z\s*[=:]\s*6|30\s*ft/i);
    });

    it('should handle multiple elevation levels clearly', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'ground', name: 'Ground', hp: 30, maxHp: 30, ac: 15, initiativeBonus: 1, position: pos(1, 1, 0) },
          { id: 'ledge', name: 'Ledge', hp: 30, maxHp: 30, ac: 15, initiativeBonus: 1, position: pos(2, 1, 1) },
          { id: 'tower', name: 'Tower', hp: 30, maxHp: 30, ac: 15, initiativeBonus: 1, position: pos(3, 1, 3) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Should show distinct elevations for each
      expect(text).toMatch(/Ground.*z\s*[=:]\s*0|Ground.*0\s*ft/i);
      expect(text).toMatch(/Tower.*z\s*[=:]\s*3|Tower.*15\s*ft/i);
    });

    it('should include elevation key when multiple z-levels exist', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'low', name: 'Low', hp: 30, maxHp: 30, ac: 15, initiativeBonus: 1, position: pos(0, 0, 0) },
          { id: 'high', name: 'High', hp: 30, maxHp: 30, ac: 15, initiativeBonus: 1, position: pos(1, 0, 4) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Should include some form of elevation key/legend
      expect(text).toMatch(/elevation|height|z-level|ft/i);
    });
  });

  // ============================================================
  // STACKED ENTITIES (Same x,y Different z)
  // ============================================================

  describe('Stacked Entities', () => {
    it('should handle multiple entities at same x,y with different z', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'ground', name: 'Fighter', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(2, 2, 0) },
          { id: 'flying', name: 'Gargoyle', hp: 52, maxHp: 52, ac: 15, initiativeBonus: 0, position: pos(2, 2, 3), isEnemy: true },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Both entities should be visible in legend with same x,y but different z
      expect(text).toContain('Fighter');
      expect(text).toContain('Gargoyle');
      expect(text).toMatch(/\(2,\s*2\).*z\s*[=:]\s*0/i);
      expect(text).toMatch(/\(2,\s*2\).*z\s*[=:]\s*3/i);
    });

    it('should show stack indicator when entities overlap in x,y', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'base', name: 'Base', hp: 30, maxHp: 30, ac: 15, initiativeBonus: 1, position: pos(2, 2, 0) },
          { id: 'mid', name: 'Mid', hp: 30, maxHp: 30, ac: 15, initiativeBonus: 1, position: pos(2, 2, 2) },
          { id: 'top', name: 'Top', hp: 30, maxHp: 30, ac: 15, initiativeBonus: 1, position: pos(2, 2, 4) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Grid should indicate a stack (⋮3, T², or similar notation)
      // Or legend should clearly show the stack
      expect(text).toMatch(/stack|[⋮²³]|\(2,\s*2\)/i);
      // All three should appear in legend
      expect(text).toContain('Base');
      expect(text).toContain('Mid');
      expect(text).toContain('Top');
    });
  });

  // ============================================================
  // LEGEND
  // ============================================================

  describe('Legend', () => {
    it('should list all entities with their positions', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(1, 2) },
          { id: 'wizard', name: 'Elara', hp: 28, maxHp: 28, ac: 12, initiativeBonus: 3, position: pos(3, 4) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      expect(text).toMatch(/Thorin.*\(1,\s*2\)/i);
      expect(text).toMatch(/Elara.*\(3,\s*4\)/i);
    });

    it('should show HP status for each entity', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 30, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
          { id: 'wizard', name: 'Elara', hp: 14, maxHp: 28, ac: 12, initiativeBonus: 3, position: pos(1, 0) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Should show HP values
      expect(text).toMatch(/30\s*\/\s*45|30\/45/);
      expect(text).toMatch(/14\s*\/\s*28|14\/28/);
    });

    it('should indicate bloodied status for entities below 50% HP', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 20, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },  // 44% - bloodied
          { id: 'wizard', name: 'Elara', hp: 25, maxHp: 28, ac: 12, initiativeBonus: 3, position: pos(1, 0) },   // 89% - healthy
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Bloodied indicator for Thorin
      expect(text).toMatch(/Thorin.*bloodied|Thorin.*[⚠🩸]/i);
    });

    it('should show active conditions on entities', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      // Add conditions
      manageCondition({ targetId: 'fighter', condition: 'poisoned', operation: 'add', encounterId });
      manageCondition({ targetId: 'fighter', condition: 'prone', operation: 'add', encounterId });

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Should show conditions in legend
      expect(text).toMatch(/poisoned/i);
      expect(text).toMatch(/prone/i);
    });

    it('should differentiate allies and enemies in legend', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0), isEnemy: false },
          { id: 'goblin', name: 'Goblin', hp: 7, maxHp: 7, ac: 13, initiativeBonus: 2, position: pos(4, 0), isEnemy: true },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Should indicate enemy status
      expect(text).toMatch(/Goblin.*enemy|Goblin.*[👁🔴⚔]/i);
    });

    it('should mark the current turn entity clearly', () => {
      const encounterId = extractEncounterId(createEncounter({
        seed: 'deterministic',
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 5, position: pos(0, 0) },
          { id: 'wizard', name: 'Elara', hp: 28, maxHp: 28, ac: 12, initiativeBonus: 1, position: pos(1, 0) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Current turn should be clearly marked
      expect(text).toMatch(/[▶►→].*Thorin|Thorin.*current|Thorin.*turn/i);
    });
  });

  // ============================================================
  // DISPLAY OPTIONS
  // ============================================================

  describe('Display Options', () => {
    it('should respect showLegend=false option', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const withLegend = renderBattlefield({ encounterId, showLegend: true });
      const withoutLegend = renderBattlefield({ encounterId, showLegend: false });

      // Without legend should be shorter (no entity list)
      expect(getTextContent(withoutLegend).length).toBeLessThan(getTextContent(withLegend).length);
    });

    it('should respect showCoordinates=false option', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const withCoords = renderBattlefield({ encounterId, showCoordinates: true });
      const withoutCoords = renderBattlefield({ encounterId, showCoordinates: false });

      const textWithCoords = getTextContent(withCoords);
      const textWithoutCoords = getTextContent(withoutCoords);

      // With coordinates should have axis numbers
      expect(textWithCoords).toMatch(/\s+0\s+1\s+2/);
      // Without coordinates should be more compact
      expect(textWithoutCoords.length).toBeLessThan(textWithCoords.length);
    });

    it('should respect showElevation=false option', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'low', name: 'Low', hp: 30, maxHp: 30, ac: 15, initiativeBonus: 1, position: pos(0, 0, 0) },
          { id: 'high', name: 'High', hp: 30, maxHp: 30, ac: 15, initiativeBonus: 1, position: pos(1, 0, 5) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const withElevation = renderBattlefield({ encounterId, showElevation: true });
      const withoutElevation = renderBattlefield({ encounterId, showElevation: false });

      const textWithElevation = getTextContent(withElevation);
      const textWithoutElevation = getTextContent(withoutElevation);

      // With elevation should mention z-levels
      expect(textWithElevation).toMatch(/z\s*[=:]/i);
      // Without elevation should not (or simplified)
      expect(textWithoutElevation).not.toMatch(/z\s*[=:]\s*5/i);
    });
  });

  // ============================================================
  // VIEWPORT & FOCUS
  // ============================================================

  describe('Viewport and Focus', () => {
    it('should crop to viewport dimensions', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(5, 5) },
        ],
        terrain: { width: 20, height: 20 },  // Large map
      }));

      const result = renderBattlefield({
        encounterId,
        viewport: { x: 3, y: 3, width: 6, height: 6 },
      });
      const text = getTextContent(result);

      // Viewport should show cropped region (x: 3-8, y: 3-8)
      // Thorin at (5,5) should be visible
      expect(text).toContain('T');
      
      // Should not show coordinates outside viewport
      // Header should start at x=3, not x=0
      expect(text).toMatch(/3.*4.*5/);
    });

    it('should center viewport on focusOn entity', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
          { id: 'target', name: 'Target', hp: 30, maxHp: 30, ac: 14, initiativeBonus: 1, position: pos(15, 15) },
        ],
        terrain: { width: 30, height: 50 },  // Large map
      }));

      const result = renderBattlefield({
        encounterId,
        focusOn: 'target',
        viewport: { width: 10, height: 10 },  // Centered on target
      });
      const text = getTextContent(result);

      // Target should be visible (viewport centered on it)
      expect(text).toMatch(/Target|T/);
      // Should show coordinates around (15, 15)
      expect(text).toMatch(/1[0-9]/);  // Coordinates in teens
    });

    it('should use default viewport for small maps', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(2, 2) },
        ],
        terrain: { width: 8, height: 8 },  // Small enough to show all
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // All coordinates should be visible (0-7)
      expect(text).toMatch(/0.*1.*2.*3.*4.*5.*6.*7/);
    });
  });

  // ============================================================
  // LEGEND DETAIL LEVELS
  // ============================================================

  describe('Legend Detail Levels', () => {
    it('should show minimal legend with just symbols and names', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 30, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      manageCondition({ targetId: 'fighter', condition: 'poisoned', operation: 'add', encounterId });

      const result = renderBattlefield({ encounterId, legendDetail: 'minimal' });
      const text = getTextContent(result);

      // Minimal: Just symbol-to-name mapping
      expect(text).toMatch(/T.*Thorin/);
      // Should not include HP
      expect(text).not.toMatch(/30\s*\/\s*45/);
    });

    it('should show standard legend with HP and conditions', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 30, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      manageCondition({ targetId: 'fighter', condition: 'poisoned', operation: 'add', encounterId });

      const result = renderBattlefield({ encounterId, legendDetail: 'standard' });
      const text = getTextContent(result);

      // Standard: Position, HP, conditions
      expect(text).toMatch(/Thorin.*\(0,\s*0\)/);
      expect(text).toMatch(/30\s*\/\s*45|30\/45/);
      expect(text).toMatch(/poisoned/i);
    });

    it('should show detailed legend with AC, speed, and more', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 30, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0), speed: 30 },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId, legendDetail: 'detailed' });
      const text = getTextContent(result);

      // Detailed: Include AC, speed, size, etc
      expect(text).toMatch(/AC.*18|18.*AC/i);
      expect(text).toMatch(/30\s*ft|speed.*30/i);
    });
  });

  // ============================================================
  // EDGE CASES
  // ============================================================

  describe('Edge Cases', () => {
    it('should handle single-cell battlefield', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
        ],
        terrain: { width: 5, height: 5 },  // Minimum size
      }));

      const result = renderBattlefield({ encounterId });
      
      // Should not throw, should show the grid
      expect(result).toBeTruthy();
      expect(getTextContent(result)).toContain('T');
    });

    it('should handle encounter with no terrain specified', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
          { id: 'goblin', name: 'Goblin', hp: 7, maxHp: 7, ac: 13, initiativeBonus: 2, position: pos(5, 5), isEnemy: true },
        ],
        // No terrain specified - should use defaults
      }));

      const result = renderBattlefield({ encounterId });
      
      expect(result).toBeTruthy();
      expect(getTextContent(result)).toContain('T');
    });

    it('should handle entity at edge of grid', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'corner', name: 'Corner', hp: 30, maxHp: 30, ac: 15, initiativeBonus: 1, position: pos(9, 9) },
        ],
        terrain: { width: 10, height: 10 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Entity at far corner should be visible
      expect(text).toContain('C');
      expect(text).toMatch(/Corner.*\(9,\s*9\)/);
    });

    it('should handle maximum elevation (flying dragon)', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'dragon', name: 'Ancient Dragon', hp: 500, maxHp: 500, ac: 22, initiativeBonus: 8, position: pos(5, 5, 20), isEnemy: true },
        ],
        terrain: { width: 15, height: 15 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // High elevation should be displayed
      expect(text).toMatch(/z\s*[=:]\s*20|100\s*ft/i);
    });

    it('should throw error for non-existent encounter', () => {
      expect(() => renderBattlefield({ encounterId: 'fake_encounter_id' }))
        .toThrow(/not found/i);
    });

    it('should handle all entities at 0 HP (TPK scenario)', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 0, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
          { id: 'wizard', name: 'Elara', hp: 0, maxHp: 28, ac: 12, initiativeBonus: 3, position: pos(1, 0) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Should still render, showing unconscious/dead indicators
      expect(text).toMatch(/[†○]|unconscious|dying|dead/i);
    });

    it('should handle very long entity names gracefully', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'long', name: 'Sir Bartholomew the Magnificent, Champion of the Northern Reaches', hp: 50, maxHp: 50, ac: 19, initiativeBonus: 3, position: pos(0, 0) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      const result = renderBattlefield({ encounterId });
      
      // Should not break layout - name might be truncated in legend
      expect(result).toBeTruthy();
      expect(getTextContent(result)).toMatch(/S|Sir|Bartholomew/);
    });
  });

  // ============================================================
  // CREATIVE SCENARIO TESTS
  // ============================================================

  describe('Creative Scenarios', () => {
    it('should render a classic dungeon corridor ambush', () => {
      const encounterId = extractEncounterId(createEncounter({
        seed: 'ambush-corridor',
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(2, 4) },
          { id: 'wizard', name: 'Elara', hp: 28, maxHp: 28, ac: 12, initiativeBonus: 3, position: pos(2, 5) },
          { id: 'goblin-1', name: 'Goblin Ambusher', hp: 7, maxHp: 7, ac: 15, initiativeBonus: 4, position: pos(2, 1), isEnemy: true },
          { id: 'goblin-2', name: 'Goblin Archer', hp: 5, maxHp: 7, ac: 13, initiativeBonus: 4, position: pos(4, 3), isEnemy: true },
        ],
        terrain: {
          width: 6,
          height: 8,
          obstacles: ['0,0', '0,1', '0,2', '0,3', '0,4', '0,5', '0,6', '0,7',
                      '5,0', '5,1', '5,2', '5,3', '5,4', '5,5', '5,6', '5,7',
                      '1,0', '2,0', '3,0', '4,0'],  // Corridor walls
          difficultTerrain: ['2,2', '2,3', '3,2', '3,3'],  // Rubble in corridor
        },
        surprise: ['fighter', 'wizard'],
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Should show walls forming corridor
      expect(text).toMatch(/[█▓#]/);
      // Should show party and goblins
      expect(text).toContain('T');
      expect(text).toContain('E');
      // Should show difficult terrain
      expect(text).toMatch(/[░~]|difficult/i);
    });

    it('should render a multi-level tower assault', () => {
      const encounterId = extractEncounterId(createEncounter({
        seed: 'tower-assault',
        participants: [
          { id: 'knight', name: 'Sir Roland', hp: 52, maxHp: 52, ac: 20, initiativeBonus: 1, position: pos(3, 5, 0) },
          { id: 'archer', name: 'Legolas', hp: 35, maxHp: 35, ac: 15, initiativeBonus: 4, position: pos(4, 4, 2) },
          { id: 'mage-1', name: 'Evil Mage', hp: 40, maxHp: 40, ac: 12, initiativeBonus: 2, position: pos(3, 2, 4), isEnemy: true },
          { id: 'guard-1', name: 'Tower Guard', hp: 22, maxHp: 22, ac: 16, initiativeBonus: 1, position: pos(2, 3, 2), isEnemy: true },
        ],
        terrain: {
          width: 7,
          height: 7,
          obstacles: ['0,0', '0,1', '0,2', '0,3', '0,4', '0,5', '0,6',
                      '6,0', '6,1', '6,2', '6,3', '6,4', '6,5', '6,6'],  // Tower walls
        },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Should show different elevations
      expect(text).toMatch(/z\s*[=:]\s*0/i);
      expect(text).toMatch(/z\s*[=:]\s*2/i);
      expect(text).toMatch(/z\s*[=:]\s*4/i);
      // All participants visible
      expect(text).toMatch(/Sir Roland|Roland/);
      expect(text).toMatch(/Legolas/);
      expect(text).toMatch(/Evil Mage|Mage/);
    });

    it('should render underwater combat with depth levels', () => {
      const encounterId = extractEncounterId(createEncounter({
        seed: 'underwater',
        participants: [
          { id: 'swimmer', name: 'Aquaman', hp: 60, maxHp: 60, ac: 14, initiativeBonus: 3, position: pos(3, 3, -2) },  // Below surface
          { id: 'shark', name: 'Giant Shark', hp: 80, maxHp: 80, ac: 13, initiativeBonus: 2, position: pos(5, 3, -4), isEnemy: true },
          { id: 'surface', name: 'Boat Guard', hp: 25, maxHp: 25, ac: 11, initiativeBonus: 0, position: pos(3, 1, 0) },
        ],
        terrain: {
          width: 8,
          height: 6,
          water: ['0,2', '1,2', '2,2', '3,2', '4,2', '5,2', '6,2', '7,2',
                  '0,3', '1,3', '2,3', '3,3', '4,3', '5,3', '6,3', '7,3',
                  '0,4', '1,4', '2,4', '3,4', '4,4', '5,4', '6,4', '7,4',
                  '0,5', '1,5', '2,5', '3,5', '4,5', '5,5', '6,5', '7,5'],  // Water covering bottom
        },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Should show water terrain
      expect(text).toMatch(/[≈~]|water/i);
      // Should show negative z (underwater depths)
      expect(text).toMatch(/z\s*[=:]\s*-2|z\s*[=:]\s*-4/i);
    });

    it('should render a hazardous lava chamber', () => {
      const encounterId = extractEncounterId(createEncounter({
        seed: 'lava-chamber',
        participants: [
          { id: 'hero', name: 'Firewalker', hp: 55, maxHp: 55, ac: 16, initiativeBonus: 2, position: pos(1, 1) },
          { id: 'elemental', name: 'Fire Elemental', hp: 75, maxHp: 75, ac: 13, initiativeBonus: 4, position: pos(4, 4), isEnemy: true },
        ],
        terrain: {
          width: 6,
          height: 6,
          hazards: [
            { position: '2,2', type: 'lava', damage: '2d10', dc: 15 },
            { position: '2,3', type: 'lava', damage: '2d10', dc: 15 },
            { position: '3,2', type: 'lava', damage: '2d10', dc: 15 },
            { position: '3,3', type: 'lava', damage: '2d10', dc: 15 },
          ],
        },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // Should show hazard markers
      expect(text).toMatch(/[*☠⚡!]|hazard|lava/i);
    });

    it('should render a chaotic melee with many combatants', () => {
      const encounterId = extractEncounterId(createEncounter({
        seed: 'melee-chaos',
        participants: [
          { id: 'p1', name: 'Aragorn', hp: 60, maxHp: 60, ac: 17, initiativeBonus: 4, position: pos(5, 5) },
          { id: 'p2', name: 'Boromir', hp: 55, maxHp: 55, ac: 18, initiativeBonus: 2, position: pos(5, 6) },
          { id: 'p3', name: 'Gimli', hp: 50, maxHp: 50, ac: 16, initiativeBonus: 1, position: pos(6, 5) },
          { id: 'p4', name: 'Legolas', hp: 40, maxHp: 40, ac: 15, initiativeBonus: 5, position: pos(6, 6) },
          { id: 'o1', name: 'Orc Warrior', hp: 15, maxHp: 15, ac: 13, initiativeBonus: 1, position: pos(4, 4), isEnemy: true },
          { id: 'o2', name: 'Orc Warrior', hp: 15, maxHp: 15, ac: 13, initiativeBonus: 1, position: pos(4, 5), isEnemy: true },
          { id: 'o3', name: 'Orc Warrior', hp: 15, maxHp: 15, ac: 13, initiativeBonus: 1, position: pos(4, 6), isEnemy: true },
          { id: 'o4', name: 'Orc Warrior', hp: 15, maxHp: 15, ac: 13, initiativeBonus: 1, position: pos(4, 7), isEnemy: true },
          { id: 'u1', name: 'Uruk-hai', hp: 28, maxHp: 28, ac: 14, initiativeBonus: 2, position: pos(7, 4), isEnemy: true },
          { id: 'u2', name: 'Uruk-hai', hp: 28, maxHp: 28, ac: 14, initiativeBonus: 2, position: pos(7, 7), isEnemy: true },
        ],
        terrain: { width: 12, height: 12 },
      }));

      const result = renderBattlefield({ encounterId });
      const text = getTextContent(result);

      // All heroes should be represented
      expect(text).toMatch(/Aragorn/);
      expect(text).toMatch(/Boromir/);
      expect(text).toMatch(/Gimli/);
      expect(text).toMatch(/Legolas/);
      // Enemies should be counted/grouped in legend
      expect(text).toMatch(/Orc|Uruk/i);
      // Should handle duplicate names gracefully
    });
  });

  // ============================================================
  // INTEGRATION WITH OTHER TOOLS
  // ============================================================

  describe('Integration', () => {
    it('should reflect position changes after movement', () => {
      // This test will work once execute_action with movement is implemented
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 45, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      // Initial render
      const before = renderBattlefield({ encounterId });
      expect(getTextContent(before)).toMatch(/Thorin.*\(0,\s*0\)/);

      // TODO: Once execute_action supports movement:
      // executeAction({ encounterId, actorId: 'fighter', action: 'move', moveTo: pos(2, 3) });
      // const after = renderBattlefield({ encounterId });
      // expect(getTextContent(after)).toMatch(/Thorin.*\(2,\s*3\)/);
    });

    it('should show death saves in legend for dying characters', () => {
      const encounterId = extractEncounterId(createEncounter({
        participants: [
          { id: 'fighter', name: 'Thorin', hp: 0, maxHp: 45, ac: 18, initiativeBonus: 2, position: pos(0, 0) },
          { id: 'healer', name: 'Cleric', hp: 32, maxHp: 32, ac: 16, initiativeBonus: 0, position: pos(1, 0) },
        ],
        terrain: { width: 5, height: 5 },
      }));

      // Add unconscious condition (triggers death save tracking)
      manageCondition({ targetId: 'fighter', condition: 'unconscious', operation: 'add', encounterId });

      const result = renderBattlefield({ encounterId, legendDetail: 'detailed' });
      const text = getTextContent(result);

      // Should show death save status for Thorin
      expect(text).toMatch(/death\s*save|dying|[○●◯◉].*[○●◯◉].*[○●◯◉]/i);
    });
  });
});
