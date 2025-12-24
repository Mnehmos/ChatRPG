/**
 * add_participant Tests - HIGH-006
 * Tests for adding participants mid-encounter via manage_encounter add_participant operation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';
import { clearAllEncounters, getEncounterParticipant, getEncounterState } from '../../src/modules/combat.js';

describe('manage_encounter add_participant', () => {
  beforeEach(() => {
    clearAllEncounters();
  });

  // Helper to create a basic encounter
  async function createTestEncounter(): Promise<string> {
    const result = await handleToolCall('manage_encounter', {
      operation: 'create',
      participants: [
        {
          id: 'fighter-1',
          name: 'Thorin',
          hp: 44,
          maxHp: 44,
          ac: 18,
          initiativeBonus: 2,
          position: { x: 5, y: 5 },
          isEnemy: false,
          speed: 30,
        },
        {
          id: 'goblin-1',
          name: 'Goblin Scout',
          hp: 7,
          maxHp: 7,
          ac: 13,
          initiativeBonus: 2,
          position: { x: 10, y: 10 },
          isEnemy: true,
          speed: 30,
        },
      ],
      terrain: { width: 20, height: 20 },
    });

    const text = getTextContent(result);
    const match = text.match(/Encounter ID:\s*([a-zA-Z0-9-]+)/i);
    return match ? match[1] : '';
  }

  it('should add a new participant mid-encounter', async () => {
    const encounterId = await createTestEncounter();
    expect(encounterId).not.toBe('');

    // Add a new goblin mid-encounter
    const result = await handleToolCall('manage_encounter', {
      operation: 'add_participant',
      encounterId,
      participant: {
        id: 'goblin-2',
        name: 'Goblin Reinforcement',
        hp: 7,
        maxHp: 7,
        ac: 13,
        initiativeBonus: 2,
        position: { x: 15, y: 15 },
        isEnemy: true,
        speed: 30,
      },
    });

    expect(result.isError).toBeUndefined();
    const text = getTextContent(result);
    expect(text).toContain('Goblin Reinforcement');
    expect(text).toMatch(/added|joined|participant/i);

    // Verify the new participant exists in the encounter
    const participant = getEncounterParticipant(encounterId, 'goblin-2');
    expect(participant).toBeDefined();
    expect(participant?.name).toBe('Goblin Reinforcement');
    expect(participant?.hp).toBe(7);
  });

  it('should roll initiative for the new participant', async () => {
    const encounterId = await createTestEncounter();

    const result = await handleToolCall('manage_encounter', {
      operation: 'add_participant',
      encounterId,
      participant: {
        id: 'goblin-2',
        name: 'Late Arrival',
        hp: 7,
        maxHp: 7,
        ac: 13,
        initiativeBonus: 5,
        position: { x: 15, y: 15 },
        isEnemy: true,
        speed: 30,
      },
    });

    expect(result.isError).toBeUndefined();

    // Verify the new participant has initiative
    const participant = getEncounterParticipant(encounterId, 'goblin-2');
    expect(participant).toBeDefined();
    expect(participant?.initiative).toBeDefined();
    expect(typeof participant?.initiative).toBe('number');
  });

  it('should add participant to initiative order correctly', async () => {
    const encounterId = await createTestEncounter();

    // Add with a manual initiative to test ordering
    const result = await handleToolCall('manage_encounter', {
      operation: 'add_participant',
      encounterId,
      participant: {
        id: 'dragon-1',
        name: 'Young Dragon',
        hp: 100,
        maxHp: 100,
        ac: 18,
        initiativeBonus: 10,
        position: { x: 0, y: 0 },
        isEnemy: true,
        speed: 40,
      },
      manualInitiative: 25, // Very high, should be first
    });

    expect(result.isError).toBeUndefined();

    const encounter = getEncounterState(encounterId);
    expect(encounter).toBeDefined();
    expect(encounter?.participants.length).toBe(3);
    // Dragon with initiative 25 should be first (participants are sorted by initiative)
    expect(encounter?.participants[0].id).toBe('dragon-1');
    expect(encounter?.participants[0].initiative).toBe(25);
  });

  it('should error when encounter does not exist', async () => {
    const result = await handleToolCall('manage_encounter', {
      operation: 'add_participant',
      encounterId: 'nonexistent-encounter',
      participant: {
        id: 'goblin-2',
        name: 'Goblin',
        hp: 7,
        maxHp: 7,
        ac: 13,
        initiativeBonus: 2,
        position: { x: 15, y: 15 },
        isEnemy: true,
        speed: 30,
      },
    });

    expect(result.isError).toBe(true);
    const text = getTextContent(result);
    expect(text).toMatch(/not found|does not exist/i);
  });

  it('should error when participant ID already exists', async () => {
    const encounterId = await createTestEncounter();

    // Try to add with existing ID
    const result = await handleToolCall('manage_encounter', {
      operation: 'add_participant',
      encounterId,
      participant: {
        id: 'goblin-1', // Already exists
        name: 'Duplicate Goblin',
        hp: 7,
        maxHp: 7,
        ac: 13,
        initiativeBonus: 2,
        position: { x: 15, y: 15 },
        isEnemy: true,
        speed: 30,
      },
    });

    expect(result.isError).toBe(true);
    const text = getTextContent(result);
    expect(text).toMatch(/already exists|duplicate/i);
  });

  it('should support adding a persistent character by characterId', async () => {
    // First create a character and extract the ID
    const createResult = await handleToolCall('create_character', {
      name: 'Ally Wizard',
      class: 'Wizard',
      level: 5,
      abilities: { str: 8, dex: 14, con: 12, int: 18, wis: 13, cha: 10 },
    });
    const createText = getTextContent(createResult);
    const idMatch = createText.match(/Character ID:\s*([a-zA-Z0-9-]+)/);
    const characterId = idMatch ? idMatch[1] : '';
    expect(characterId).not.toBe('');

    const encounterId = await createTestEncounter();

    const result = await handleToolCall('manage_encounter', {
      operation: 'add_participant',
      encounterId,
      participant: {
        id: 'ally-wizard-participant',
        characterId: characterId,
        name: 'Ally Wizard',
        hp: 27,
        maxHp: 27,
        ac: 12,
        initiativeBonus: 2,
        position: { x: 3, y: 3 },
        isEnemy: false,
        speed: 30,
      },
    });

    expect(result.isError).toBeUndefined();

    // Verify character is linked
    const encounter = getEncounterState(encounterId);
    const participant = encounter?.participants.find(p => p.name === 'Ally Wizard');
    expect(participant).toBeDefined();
    expect(participant?.characterId).toBe(characterId);
  });

  it('should validate position is within terrain bounds', async () => {
    const encounterId = await createTestEncounter();

    const result = await handleToolCall('manage_encounter', {
      operation: 'add_participant',
      encounterId,
      participant: {
        id: 'out-of-bounds',
        name: 'Far Away',
        hp: 10,
        maxHp: 10,
        ac: 10,
        initiativeBonus: 0,
        position: { x: 100, y: 100 }, // Way outside 20x20 terrain
        isEnemy: true,
        speed: 30,
      },
    });

    expect(result.isError).toBe(true);
    const text = getTextContent(result);
    expect(text).toMatch(/out of bounds|position|terrain/i);
  });
});
