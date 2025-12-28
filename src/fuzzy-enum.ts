/**
 * Fuzzy Enum Matching Utility
 *
 * Provides forgiving input handling for enum values, allowing:
 * 1. Exact matches (case-insensitive)
 * 2. Alias mappings (interior -> indoor)
 * 3. Levenshtein distance fallback for typos
 */

import { z, ZodEnum } from 'zod';

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Alias mappings for common synonyms
 * Key: input value (lowercase), Value: canonical enum value
 */
const GLOBAL_ALIASES: Record<string, Record<string, string>> = {
  locationType: {
    'interior': 'indoor',
    'inside': 'indoor',
    'indoors': 'indoor',
    'exterior': 'outdoor',
    'outside': 'outdoor',
    'outdoors': 'outdoor',
    'cave': 'underground',
    'cavern': 'underground',
    'subterranean': 'underground',
    'city': 'town',
    'village': 'town',
    'settlement': 'town',
    'forest': 'wilderness',
    'wild': 'wilderness',
    'nature': 'wilderness',
    'otherworldly': 'planar',
    'extraplanar': 'planar',
    'plane': 'planar',
  },
  lighting: {
    'light': 'bright',
    'lit': 'bright',
    'well-lit': 'bright',
    'shadowy': 'dim',
    'low': 'dim',
    'twilight': 'dim',
    'dark': 'darkness',
    'pitch-black': 'darkness',
    'none': 'darkness',
  },
  terrain: {
    'flat': 'open',
    'clear': 'open',
    'trees': 'forest',
    'woods': 'forest',
    'rocky': 'mountain',
    'hilly': 'mountain',
    'wet': 'swamp',
    'marsh': 'swamp',
    'boggy': 'swamp',
    'sandy': 'desert',
    'arid': 'desert',
    'snowy': 'arctic',
    'frozen': 'arctic',
    'icy': 'arctic',
    'underwater': 'aquatic',
    'water': 'aquatic',
    'ocean': 'aquatic',
    'lava': 'volcanic',
    'magma': 'volcanic',
    'stone': 'cavern',
    'tunnel': 'cavern',
    'city': 'urban',
    'town': 'urban',
    'street': 'urban',
  },
  condition: {
    'blind': 'blinded',
    'charm': 'charmed',
    'deaf': 'deafened',
    'exhaust': 'exhaustion',
    'exhausted': 'exhaustion',
    'fear': 'frightened',
    'scared': 'frightened',
    'grapple': 'grappled',
    'grabbed': 'grappled',
    'incapable': 'incapacitated',
    'invisible': 'invisible',
    'paralyze': 'paralyzed',
    'petrify': 'petrified',
    'stone': 'petrified',
    'poison': 'poisoned',
    'prone': 'prone',
    'restrain': 'restrained',
    'stun': 'stunned',
    'unconscious': 'unconscious',
    'ko': 'unconscious',
  },
  damageType: {
    'slash': 'slashing',
    'pierce': 'piercing',
    'bludgeon': 'bludgeoning',
    'blunt': 'bludgeoning',
    'flame': 'fire',
    'heat': 'fire',
    'ice': 'cold',
    'frost': 'cold',
    'electric': 'lightning',
    'shock': 'lightning',
    'sonic': 'thunder',
    'sound': 'thunder',
    'corrosive': 'acid',
    'venom': 'poison',
    'death': 'necrotic',
    'holy': 'radiant',
    'divine': 'radiant',
    'light': 'radiant',
    'magic': 'force',
    'mental': 'psychic',
    'psionic': 'psychic',
  },
  ability: {
    'strength': 'str',
    'dexterity': 'dex',
    'constitution': 'con',
    'intelligence': 'int',
    'wisdom': 'wis',
    'charisma': 'cha',
  },
  skill: {
    'acro': 'acrobatics',
    'animal': 'animal_handling',
    'handle': 'animal_handling',
    'athletics': 'athletics',
    'athl': 'athletics',
    'deception': 'deception',
    'decep': 'deception',
    'hist': 'history',
    'insight': 'insight',
    'intimidate': 'intimidation',
    'intim': 'intimidation',
    'investigate': 'investigation',
    'invest': 'investigation',
    'med': 'medicine',
    'nat': 'nature',
    'perc': 'perception',
    'perform': 'performance',
    'perf': 'performance',
    'persuade': 'persuasion',
    'pers': 'persuasion',
    'relig': 'religion',
    'sleight': 'sleight_of_hand',
    'stealth': 'stealth',
    'sneak': 'stealth',
    'survive': 'survival',
    'surv': 'survival',
  },
  actionType: {
    'strike': 'attack',
    'hit': 'attack',
    'spell': 'cast_spell',
    'magic': 'cast_spell',
    'run': 'dash',
    'move': 'dash',
    'special': 'use_special_ability',
    'ability': 'use_special_ability',
    'item': 'use_object',
    'push': 'shove',
    'grab': 'grapple',
  },
  actionCost: {
    'act': 'action',
    'standard': 'action',
    'bonus': 'bonus_action',
    'swift': 'bonus_action',
    'react': 'reaction',
    'move': 'movement',
  },
  weaponType: {
    'melee': 'melee',
    'close': 'melee',
    'range': 'ranged',
    'ranged': 'ranged',
    'thrown': 'ranged_thrown',
    'throw': 'ranged_thrown',
    'finesse': 'melee_finesse',
  },
  size: {
    'tiny': 'tiny',
    'small': 'small',
    'med': 'medium',
    'large': 'large',
    'lg': 'large',
    'huge': 'huge',
    'garg': 'gargantuan',
    'colossal': 'gargantuan',
  },
  cover: {
    'no': 'none',
    'no cover': 'none',
    '1/2': 'half',
    'partial': 'half',
    '3/4': 'three_quarters',
    'total': 'full',
    'complete': 'full',
  },
  aoeShape: {
    'straight': 'line',
    'linear': 'line',
    'triangle': 'cone',
    'square': 'cube',
    'box': 'cube',
    'circle': 'sphere',
    'ball': 'sphere',
    'tube': 'cylinder',
  },
  restType: {
    'short rest': 'short',
    'brief': 'short',
    'long rest': 'long',
    'extended': 'long',
  },
  characterType: {
    'player': 'pc',
    'hero': 'pc',
    'villain': 'enemy',
    'monster': 'enemy',
    'hostile': 'enemy',
    'ally': 'npc',
    'friendly': 'npc',
  },
  rollMode: {
    'adv': 'advantage',
    'disadvantage': 'disadvantage',
    'disadv': 'disadvantage',
    'dadv': 'disadvantage',
    'standard': 'normal',
  },
  spellSchool: {
    'abjur': 'abjuration',
    'conj': 'conjuration',
    'div': 'divination',
    'ench': 'enchantment',
    'evoc': 'evocation',
    'illu': 'illusion',
    'necro': 'necromancy',
    'trans': 'transmutation',
  },
  verbosity: {
    'min': 'minimal',
    'sum': 'summary',
    'std': 'standard',
    'normal': 'standard',
    'detail': 'detailed',
    'verbose': 'detailed',
  },
};

/**
 * Find the best match for an input value against valid enum values
 */
export function findBestMatch(
  input: string,
  validValues: readonly string[],
  aliasCategory?: string
): { match: string | null; confidence: 'exact' | 'alias' | 'fuzzy' | 'none'; distance?: number } {
  const normalizedInput = input.toLowerCase().trim();

  // 1. Check for exact match (case-insensitive)
  const exactMatch = validValues.find(v => v.toLowerCase() === normalizedInput);
  if (exactMatch) {
    return { match: exactMatch, confidence: 'exact' };
  }

  // 2. Check alias mappings
  if (aliasCategory && GLOBAL_ALIASES[aliasCategory]) {
    const aliasedValue = GLOBAL_ALIASES[aliasCategory][normalizedInput];
    if (aliasedValue && validValues.includes(aliasedValue)) {
      return { match: aliasedValue, confidence: 'alias' };
    }
  }

  // 3. Levenshtein distance fallback (max distance = 2 for short words, 3 for longer)
  let bestMatch: string | null = null;
  let bestDistance = Infinity;

  for (const validValue of validValues) {
    const distance = levenshteinDistance(normalizedInput, validValue.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = validValue;
    }
  }

  // Accept fuzzy match if distance is reasonable
  const maxDistance = normalizedInput.length <= 5 ? 2 : 3;
  if (bestDistance <= maxDistance && bestMatch) {
    return { match: bestMatch, confidence: 'fuzzy', distance: bestDistance };
  }

  return { match: null, confidence: 'none' };
}

/**
 * Create a fuzzy-matching Zod enum that accepts close matches
 *
 * @param validValues - Array of valid enum values
 * @param aliasCategory - Optional category name for alias lookup (e.g., 'locationType')
 * @returns Zod schema that transforms fuzzy inputs to valid values
 */
export function fuzzyEnum<T extends readonly [string, ...string[]]>(
  validValues: T,
  aliasCategory?: string
): z.ZodEffects<z.ZodString, T[number], string> {
  return z.string().transform((val, ctx) => {
    const result = findBestMatch(val, validValues, aliasCategory);

    if (result.match) {
      return result.match as T[number];
    }

    // No match found - add Zod error
    ctx.addIssue({
      code: z.ZodIssueCode.invalid_enum_value,
      options: [...validValues],
      received: val,
      message: `Invalid value "${val}". Did you mean: ${validValues.slice(0, 5).join(', ')}?`,
    });
    return z.NEVER;
  });
}

/**
 * Pre-process an input object, normalizing enum fields to their canonical values
 * Useful for bulk normalization before schema validation
 */
export function normalizeEnumFields<T extends Record<string, unknown>>(
  input: T,
  fieldMappings: Record<string, { values: readonly string[]; category?: string }>
): T {
  const result = { ...input };

  for (const [field, config] of Object.entries(fieldMappings)) {
    if (field in result && typeof result[field] === 'string') {
      const match = findBestMatch(result[field] as string, config.values, config.category);
      if (match.match) {
        (result as Record<string, unknown>)[field] = match.match;
      }
    }
  }

  return result;
}

/**
 * Add custom aliases for a category
 */
export function addAliases(category: string, aliases: Record<string, string>): void {
  if (!GLOBAL_ALIASES[category]) {
    GLOBAL_ALIASES[category] = {};
  }
  Object.assign(GLOBAL_ALIASES[category], aliases);
}

/**
 * Get all registered aliases for a category
 */
export function getAliases(category: string): Record<string, string> {
  return GLOBAL_ALIASES[category] ? { ...GLOBAL_ALIASES[category] } : {};
}
