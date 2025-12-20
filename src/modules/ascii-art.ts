/**
 * ASCII Art Module - Immersive Game Interface Rendering
 * Box Drawing • Tables • Dice Faces • Visual Effects
 */

// ============================================================
// BOX DRAWING CHARACTERS
// ============================================================

export const BOX = {
  // Heavy borders (titles, headers)
  HEAVY: {
    TL: '╔', TR: '╗', BL: '╚', BR: '╝',
    H: '═', V: '║',
    TJ: '╦', BJ: '╩', LJ: '╠', RJ: '╣',
    X: '╬',
  },
  // Light borders (tables, data)
  LIGHT: {
    TL: '┌', TR: '┐', BL: '└', BR: '┘',
    H: '─', V: '│',
    TJ: '┬', BJ: '┴', LJ: '├', RJ: '┤',
    X: '┼',
  },
  // Double borders (critical info)
  DOUBLE: {
    TL: '╔', TR: '╗', BL: '╚', BR: '╝',
    H: '═', V: '║',
  },
};

// ============================================================
// DICE FACES (6-sided)
// ============================================================

export const DICE_FACES: Record<number, string[]> = {
  1: [
    '┌─────┐',
    '│     │',
    '│  ●  │',
    '│     │',
    '└─────┘',
  ],
  2: [
    '┌─────┐',
    '│ ●   │',
    '│     │',
    '│   ● │',
    '└─────┘',
  ],
  3: [
    '┌─────┐',
    '│ ●   │',
    '│  ●  │',
    '│   ● │',
    '└─────┘',
  ],
  4: [
    '┌─────┐',
    '│ ● ● │',
    '│     │',
    '│ ● ● │',
    '└─────┘',
  ],
  5: [
    '┌─────┐',
    '│ ● ● │',
    '│  ●  │',
    '│ ● ● │',
    '└─────┘',
  ],
  6: [
    '┌─────┐',
    '│ ● ● │',
    '│ ● ● │',
    '│ ● ● │',
    '└─────┘',
  ],
};

// ============================================================
// D20 FACES (Special results)
// ============================================================

export const D20_SPECIAL: Record<number, string[]> = {
  1: [
    '┌─────────┐',
    '│ ╔═══╗   │',
    '│ ║ 1 ║   │',
    '│ ╚═══╝   │',
    '│ CRITICAL│',
    '│  FAIL!  │',
    '└─────────┘',
  ],
  20: [
    '┌─────────┐',
    '│  ╔═══╗  │',
    '│  ║20 ║  │',
    '│  ╚═══╝  │',
    '│ CRITICAL│',
    '│   HIT!  │',
    '└─────────┘',
  ],
};

// ============================================================
// CORE UTILITIES
// ============================================================

/**
 * Create a bordered box with title
 * Content-aware auto-sizing: calculates optimal width from content if not specified
 */
export function createBox(
  title: string,
  content: string[],
  width?: number,
  style: 'HEAVY' | 'LIGHT' | 'DOUBLE' = 'HEAVY'
): string {
  const box = BOX[style];
  const lines: string[] = [];

  // Auto-calculate width from content if not provided
  let boxWidth: number;
  if (width === undefined) {
    // Find longest content line
    const maxContentLength = Math.max(
      title.length + 2, // Title needs space on both sides
      ...content.map(line => line.length + 1) // Content needs 1 space prefix
    );

    // Apply constraints: min 40, max 80 chars
    boxWidth = Math.max(40, Math.min(80, maxContentLength));
  } else {
    boxWidth = width;
  }

  // Top border with title
  const titlePadding = Math.max(0, boxWidth - title.length - 2);
  const leftPad = Math.floor(titlePadding / 2);
  const rightPad = titlePadding - leftPad;

  lines.push(
    box.TL +
    box.H.repeat(leftPad) +
    ' ' + title + ' ' +
    box.H.repeat(rightPad) +
    box.TR
  );

  // Content lines
  for (const line of content) {
    // Interior should be exactly `boxWidth` chars: 1 space + content + padding
    const padding = Math.max(0, boxWidth - line.length - 1);
    lines.push(box.V + ' ' + line + ' '.repeat(padding) + box.V);
  }

  // Bottom border
  lines.push(box.BL + box.H.repeat(boxWidth) + box.BR);

  return lines.join('\n');
}

/**
 * Create a simple divider
 */
export function createDivider(width: number = 60, style: 'HEAVY' | 'LIGHT' = 'LIGHT'): string {
  const box = BOX[style];
  return box.LJ + box.H.repeat(width) + box.RJ;
}

/**
 * Create a table row
 */
export function createTableRow(
  cells: string[],
  widths: number[],
  style: 'HEAVY' | 'LIGHT' = 'LIGHT'
): string {
  const box = BOX[style];
  const paddedCells = cells.map((cell, i) => {
    const width = widths[i] || 10;
    return cell.padEnd(width, ' ');
  });

  return box.V + ' ' + paddedCells.join(' ' + box.V + ' ') + ' ' + box.V;
}

/**
 * Create table header separator
 */
export function createTableHeader(
  widths: number[],
  style: 'HEAVY' | 'LIGHT' = 'LIGHT'
): string {
  const box = BOX[style];
  const segments = widths.map(w => box.H.repeat(w + 2));
  return box.LJ + segments.join(box.X) + box.RJ;
}

/**
 * Render dice faces side-by-side
 */
export function renderDiceHorizontal(values: number[]): string[] {
  const faces = values.map(v => {
    // Handle d20 special cases
    if (v === 1 && values.length === 1) return D20_SPECIAL[1];
    if (v === 20 && values.length === 1) return D20_SPECIAL[20];

    // Regular d6 faces (clamp to 1-6 for display)
    const displayValue = Math.min(Math.max(v, 1), 6);
    return DICE_FACES[displayValue];
  });

  // Combine faces horizontally
  const height = faces[0].length;
  const combined: string[] = [];

  for (let row = 0; row < height; row++) {
    const rowParts = faces.map(face => face[row]);
    combined.push(rowParts.join('  '));
  }

  return combined;
}

/**
 * Center text in a given width
 */
export function centerText(text: string, width: number): string {
  const padding = Math.max(0, width - text.length);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
}

/**
 * Pad text to width
 */
export function padText(text: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string {
  if (text.length >= width) return text.substring(0, width);

  const padding = width - text.length;

  if (align === 'left') {
    return text + ' '.repeat(padding);
  } else if (align === 'right') {
    return ' '.repeat(padding) + text;
  } else {
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
  }
}

/**
 * Create a status bar (HP, etc.)
 */
export function createStatusBar(
  current: number,
  max: number,
  width: number = 20,
  label: string = 'HP'
): string {
  const percentage = Math.max(0, Math.min(1, current / max));
  const filledWidth = Math.floor(width * percentage);
  const emptyWidth = width - filledWidth;

  const filled = '█'.repeat(filledWidth);
  const empty = '░'.repeat(emptyWidth);

  return `${label}: [${filled}${empty}] ${current}/${max}`;
}

/**
 * Create an ability score display
 */
export function formatAbilityScore(name: string, score: number): string {
  const modifier = Math.floor((score - 10) / 2);
  const modStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;
  return `${name}: ${score.toString().padStart(2)} (${modStr})`;
}

/**
 * Create a grid/map
 */
export function createGrid(
  width: number,
  height: number,
  entities: Map<string, {x: number, y: number, symbol: string}>
): string[] {
  const lines: string[] = [];
  const box = BOX.LIGHT;

  // Header with coordinates
  const header = '    ' + Array.from({length: width}, (_, i) => i.toString().padStart(3)).join(' ');
  lines.push(header);

  // Top border
  lines.push('  ' + box.TL + (box.H.repeat(3) + box.TJ).repeat(width - 1) + box.H.repeat(3) + box.TR);

  // Grid rows
  for (let y = 0; y < height; y++) {
    let row = y.toString().padStart(2) + box.V;

    for (let x = 0; x < width; x++) {
      let cell = '   ';

      // Check for entities at this position
      for (const [id, entity] of entities) {
        if (entity.x === x && entity.y === y) {
          cell = ' ' + entity.symbol + ' ';
          break;
        }
      }

      row += cell + box.V;
    }

    lines.push(row);

    // Separator (except last row)
    if (y < height - 1) {
      lines.push('  ' + box.LJ + (box.H.repeat(3) + box.X).repeat(width - 1) + box.H.repeat(3) + box.RJ);
    }
  }

  // Bottom border
  lines.push('  ' + box.BL + (box.H.repeat(3) + box.BJ).repeat(width - 1) + box.H.repeat(3) + box.BR);

  return lines;
}

/**
 * Draw an arrow/path between two points
 */
export function drawPath(from: {x: number, y: number}, to: {x: number, y: number}): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  let arrow = '';

  // Horizontal component
  if (dx > 0) arrow += '→'.repeat(Math.abs(dx));
  else if (dx < 0) arrow += '←'.repeat(Math.abs(dx));

  // Vertical component
  if (dy > 0) arrow += '↓'.repeat(Math.abs(dy));
  else if (dy < 0) arrow += '↑'.repeat(Math.abs(dy));

  return arrow || '●';
}
