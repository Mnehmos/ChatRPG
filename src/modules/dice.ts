/**
 * Dice Engine - Core Dice Rolling Logic
 * Supports: NdX+Y, NdXkh/kl/dh/dl modifiers
 */

import { createBox, renderDiceHorizontal, centerText, BOX, D20_SPECIAL } from './ascii-art.js';

// Dice roll result
export interface DiceResult {
  expression: string;
  rolls: number[];
  kept: number[];
  modifier: number;
  total: number;
}

// Parse dice expression
const DICE_REGEX = /^(\d+)d(\d+)(kh\d+|kl\d+|dh\d+|dl\d+)?([+-]\d+)?$/i;

export function parseDice(expression: string): DiceResult {
  const cleaned = expression.replace(/\s/g, '').toLowerCase();
  const match = cleaned.match(DICE_REGEX);

  if (!match) {
    throw new Error(`Invalid dice expression: "${expression}"`);
  }

  const numDice = parseInt(match[1]);
  const dieSize = parseInt(match[2]);
  const keepDrop = match[3] || '';
  const modifierStr = match[4] || '';

  if (numDice < 1 || numDice > 100) {
    throw new Error(`Invalid number of dice: ${numDice}`);
  }
  if (dieSize < 2 || dieSize > 1000) {
    throw new Error(`Invalid die size: ${dieSize}`);
  }

  // Roll dice
  const rolls: number[] = [];
  for (let i = 0; i < numDice; i++) {
    rolls.push(Math.floor(Math.random() * dieSize) + 1);
  }

  // Apply keep/drop modifier
  let kept = [...rolls];
  if (keepDrop) {
    const type = keepDrop.slice(0, 2);
    const count = parseInt(keepDrop.slice(2));
    
    if (count > rolls.length) {
      throw new Error(`Cannot keep/drop ${count} from ${rolls.length} dice`);
    }

    const sorted = [...rolls].sort((a, b) => b - a); // Descending
    
    switch (type) {
      case 'kh': // Keep highest
        kept = sorted.slice(0, count);
        break;
      case 'kl': // Keep lowest
        kept = sorted.slice(-count);
        break;
      case 'dh': // Drop highest
        kept = sorted.slice(count);
        break;
      case 'dl': // Drop lowest
        kept = sorted.slice(0, -count);
        break;
    }
  }

  // Parse modifier
  const modifier = modifierStr ? parseInt(modifierStr) : 0;

  // Calculate total
  const total = kept.reduce((sum, n) => sum + n, 0) + modifier;

  return {
    expression,
    rolls,
    kept,
    modifier,
    total,
  };
}

// Format dice result as ASCII art
export function formatDiceResult(result: DiceResult, reason?: string): string {
  const content: string[] = [];
  const box = BOX.LIGHT;

  // Title line
  content.push(`DICE ROLL: ${result.expression}`);
  if (reason) {
    content.push(`(${reason})`);
  }
  content.push('');

  // For d20 critical hits/fails, show special display
  if (result.expression.toLowerCase().includes('d20') && result.rolls.length === 1) {
    const roll = result.rolls[0];
    if (roll === 1 || roll === 20) {
      const special = D20_SPECIAL[roll];
      special.forEach(line => content.push(line));
      content.push('');
      content.push(`TOTAL: ${result.total}`);
      return createBox('DICE ROLL', content, undefined, 'HEAVY');
    }
  }

  // Show dice faces (for reasonable number of dice)
  if (result.rolls.length <= 6 && result.rolls.every(r => r <= 6)) {
    const diceFaces = renderDiceHorizontal(result.rolls);
    diceFaces.forEach(line => content.push(line));
    content.push('');

    // Show which were kept if different
    if (result.rolls.length !== result.kept.length) {
      const keptIndices = result.rolls.map((r, i) =>
        result.kept.includes(r) && !result.kept.slice(0, result.kept.indexOf(r)).includes(r) ? i : -1
      ).filter(i => i >= 0);

      content.push(`KEPT: [${result.kept.join(', ')}]`);
      content.push(`DROPPED: [${result.rolls.filter(r => !result.kept.includes(r)).join(', ')}]`);
      content.push('');
    }
  } else {
    // For many dice or large dice, show numbers
    if (result.rolls.length !== result.kept.length) {
      content.push(`ROLLED: [${result.rolls.join(', ')}]`);
      content.push(`KEPT: [${result.kept.join(', ')}]`);
    } else {
      content.push(`ROLLED: [${result.rolls.join(', ')}]`);
    }
    content.push('');
  }

  // Show calculation
  const diceSum = result.kept.reduce((sum, n) => sum + n, 0);
  if (result.modifier !== 0) {
    const sign = result.modifier > 0 ? '+' : '';
    content.push(`CALCULATION: ${diceSum} ${sign}${result.modifier} = ${result.total}`);
  } else {
    content.push(`TOTAL: ${result.total}`);
  }

  // Add bottom divider
  content.push('');
  content.push('─'.repeat(40)); // Will be adjusted by auto-sizing
  content.push(`FINAL RESULT: ${result.total}`);

  return createBox('DICE ROLL', content, undefined, 'HEAVY');
}
