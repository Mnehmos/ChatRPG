/**
 * Fuzzy Enum Matching Tests
 */

import { describe, it, expect } from 'vitest';
import { findBestMatch, fuzzyEnum, normalizeEnumFields } from '../src/fuzzy-enum.js';
import { z } from 'zod';

describe('findBestMatch', () => {
  const validValues = ['indoor', 'outdoor', 'dungeon', 'town', 'wilderness'] as const;

  describe('exact matches', () => {
    it('should match exact value', () => {
      const result = findBestMatch('indoor', validValues);
      expect(result.match).toBe('indoor');
      expect(result.confidence).toBe('exact');
    });

    it('should match case-insensitively', () => {
      const result = findBestMatch('INDOOR', validValues);
      expect(result.match).toBe('indoor');
      expect(result.confidence).toBe('exact');
    });

    it('should trim whitespace', () => {
      const result = findBestMatch('  outdoor  ', validValues);
      expect(result.match).toBe('outdoor');
      expect(result.confidence).toBe('exact');
    });
  });

  describe('alias matches', () => {
    it('should match "interior" to "indoor"', () => {
      const result = findBestMatch('interior', validValues, 'locationType');
      expect(result.match).toBe('indoor');
      expect(result.confidence).toBe('alias');
    });

    it('should match "exterior" to "outdoor"', () => {
      const result = findBestMatch('exterior', validValues, 'locationType');
      expect(result.match).toBe('outdoor');
      expect(result.confidence).toBe('alias');
    });

    it('should match "inside" to "indoor"', () => {
      const result = findBestMatch('inside', validValues, 'locationType');
      expect(result.match).toBe('indoor');
      expect(result.confidence).toBe('alias');
    });

    it('should match "outside" to "outdoor"', () => {
      const result = findBestMatch('outside', validValues, 'locationType');
      expect(result.match).toBe('outdoor');
      expect(result.confidence).toBe('alias');
    });

    it('should match "city" to "town"', () => {
      const result = findBestMatch('city', validValues, 'locationType');
      expect(result.match).toBe('town');
      expect(result.confidence).toBe('alias');
    });

    it('should match "forest" to "wilderness"', () => {
      const result = findBestMatch('forest', validValues, 'locationType');
      expect(result.match).toBe('wilderness');
      expect(result.confidence).toBe('alias');
    });
  });

  describe('fuzzy matches (typos)', () => {
    it('should match "indor" (typo) to "indoor"', () => {
      const result = findBestMatch('indor', validValues);
      expect(result.match).toBe('indoor');
      expect(result.confidence).toBe('fuzzy');
    });

    it('should match "oudoor" (typo) to "outdoor"', () => {
      const result = findBestMatch('oudoor', validValues);
      expect(result.match).toBe('outdoor');
      expect(result.confidence).toBe('fuzzy');
    });

    it('should match "dungon" (typo) to "dungeon"', () => {
      const result = findBestMatch('dungon', validValues);
      expect(result.match).toBe('dungeon');
      expect(result.confidence).toBe('fuzzy');
    });
  });

  describe('no match', () => {
    it('should return null for completely unrelated values', () => {
      const result = findBestMatch('spaceship', validValues);
      expect(result.match).toBeNull();
      expect(result.confidence).toBe('none');
    });
  });
});

describe('fuzzyEnum', () => {
  const schema = fuzzyEnum(['indoor', 'outdoor', 'dungeon'] as const, 'locationType');

  it('should accept exact values', () => {
    const result = schema.parse('indoor');
    expect(result).toBe('indoor');
  });

  it('should transform aliases to canonical values', () => {
    const result = schema.parse('interior');
    expect(result).toBe('indoor');
  });

  it('should transform typos to canonical values', () => {
    const result = schema.parse('indor');
    expect(result).toBe('indoor');
  });

  it('should throw for invalid values', () => {
    expect(() => schema.parse('spaceship')).toThrow();
  });
});

describe('fuzzyEnum in object schema', () => {
  const locationSchema = z.object({
    name: z.string(),
    locationType: fuzzyEnum(['indoor', 'outdoor', 'dungeon'] as const, 'locationType').optional(),
  });

  it('should work in complex schemas', () => {
    const result = locationSchema.parse({
      name: 'Test Room',
      locationType: 'interior',
    });
    expect(result.locationType).toBe('indoor');
  });

  it('should handle missing optional fields', () => {
    const result = locationSchema.parse({
      name: 'Test Room',
    });
    expect(result.locationType).toBeUndefined();
  });
});

describe('lighting aliases', () => {
  const lightingValues = ['bright', 'dim', 'darkness'] as const;

  it('should match "light" to "bright"', () => {
    const result = findBestMatch('light', lightingValues, 'lighting');
    expect(result.match).toBe('bright');
    expect(result.confidence).toBe('alias');
  });

  it('should match "dark" to "darkness"', () => {
    const result = findBestMatch('dark', lightingValues, 'lighting');
    expect(result.match).toBe('darkness');
    expect(result.confidence).toBe('alias');
  });

  it('should match "shadowy" to "dim"', () => {
    const result = findBestMatch('shadowy', lightingValues, 'lighting');
    expect(result.match).toBe('dim');
    expect(result.confidence).toBe('alias');
  });
});

describe('condition aliases', () => {
  const conditionValues = ['blinded', 'charmed', 'frightened', 'poisoned', 'stunned'] as const;

  it('should match "blind" to "blinded"', () => {
    const result = findBestMatch('blind', conditionValues, 'condition');
    expect(result.match).toBe('blinded');
    expect(result.confidence).toBe('alias');
  });

  it('should match "scared" to "frightened"', () => {
    const result = findBestMatch('scared', conditionValues, 'condition');
    expect(result.match).toBe('frightened');
    expect(result.confidence).toBe('alias');
  });

  it('should match "poison" to "poisoned"', () => {
    const result = findBestMatch('poison', conditionValues, 'condition');
    expect(result.match).toBe('poisoned');
    expect(result.confidence).toBe('alias');
  });
});

describe('normalizeEnumFields', () => {
  it('should normalize multiple fields in an object', () => {
    const input = {
      name: 'Test Location',
      locationType: 'interior',
      lighting: 'dark',
    };

    const result = normalizeEnumFields(input, {
      locationType: { values: ['indoor', 'outdoor'], category: 'locationType' },
      lighting: { values: ['bright', 'dim', 'darkness'], category: 'lighting' },
    });

    expect(result.locationType).toBe('indoor');
    expect(result.lighting).toBe('darkness');
    expect(result.name).toBe('Test Location');
  });

  it('should leave unrecognized values unchanged', () => {
    const input = {
      locationType: 'spaceship',
    };

    const result = normalizeEnumFields(input, {
      locationType: { values: ['indoor', 'outdoor'], category: 'locationType' },
    });

    expect(result.locationType).toBe('spaceship');
  });
});
