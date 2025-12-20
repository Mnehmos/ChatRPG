/**
 * Spatial Module - Distance & Position Calculations
 * Supports D&D 5e grid mechanics
 */

import { z } from 'zod';
import { PositionSchema } from '../types.js';
import { createBox, centerText, drawPath, BOX } from './ascii-art.js';
import { getEncounterParticipant, getEncounterState } from './combat.js';

// ============================================================
// MEASURE DISTANCE
// ============================================================

export const measureDistanceSchema = z.object({
  encounterId: z.string().optional(),
  from: z.union([z.string(), PositionSchema]),
  to: z.union([z.string(), PositionSchema]),
  mode: z.enum(['euclidean', 'grid_5e', 'grid_alt']).default('euclidean'),
  includeElevation: z.boolean().default(true),
});

export type MeasureDistanceInput = z.infer<typeof measureDistanceSchema>;

export interface MeasureDistanceResult {
  distanceFeet: number;
  distanceSquares: number;
  markdown: string;
  fromName?: string;
  toName?: string;
}

/**
 * Calculate distance between two positions
 * Supports multiple distance calculation modes
 * When using character/creature IDs (strings), encounterId must be provided
 */
export function measureDistance(input: MeasureDistanceInput): MeasureDistanceResult {
  let fromPos: any = input.from;
  let toPos: any = input.to;
  let fromName: string | undefined;
  let toName: string | undefined;

  // Handle character/creature ID lookups
  if (typeof input.from === 'string') {
    if (!input.encounterId) {
      throw new Error('encounterId is required for character position lookup');
    }
    const participant = getEncounterParticipant(input.encounterId, input.from);
    if (!participant) {
      throw new Error(`Character/creature not found in encounter: ${input.from}`);
    }
    fromPos = participant.position;
    fromName = participant.name;
  }

  if (typeof input.to === 'string') {
    if (!input.encounterId) {
      throw new Error('encounterId is required for character position lookup');
    }
    const participant = getEncounterParticipant(input.encounterId, input.to);
    if (!participant) {
      throw new Error(`Character/creature not found in encounter: ${input.to}`);
    }
    toPos = participant.position;
    toName = participant.name;
  }

  // Calculate deltas
  const dx = Math.abs(toPos.x - fromPos.x);
  const dy = Math.abs(toPos.y - fromPos.y);
  const dz = input.includeElevation ? Math.abs(toPos.z - fromPos.z) : 0;

  let distanceSquares: number;
  let distanceFeet: number;

  switch (input.mode) {
    case 'euclidean':
      // True geometric distance: √(dx² + dy² + dz²) × 5
      distanceSquares = Math.sqrt(dx * dx + dy * dy + dz * dz);
      distanceFeet = Math.round(distanceSquares * 5);
      distanceSquares = Math.round(distanceSquares);
      break;

    case 'grid_5e':
      // Simplified D&D: diagonals count as 5ft
      // Distance = max(dx, dy, dz) × 5
      distanceSquares = Math.max(dx, dy, dz);
      distanceFeet = distanceSquares * 5;
      break;

    case 'grid_alt':
      // Variant rule: diagonals alternate 5ft/10ft
      // Calculate diagonal and straight movement
      const minDim = Math.min(dx, dy);
      const maxDim = Math.max(dx, dy);
      const straight = maxDim - minDim;

      // Diagonal movement: alternate 5/10/5/10
      let diagonalCost = 0;
      for (let i = 0; i < minDim; i++) {
        diagonalCost += (i % 2 === 0) ? 5 : 10;
      }

      // Add straight movement and elevation
      distanceFeet = diagonalCost + (straight * 5) + (dz * 5);
      distanceSquares = Math.max(dx, dy, dz);
      break;

    default:
      throw new Error(`Unknown distance mode: ${input.mode}`);
  }

  // Format markdown output
  const markdown = formatDistanceResult({
    from: fromPos,
    to: toPos,
    fromName,
    toName,
    mode: input.mode,
    distanceFeet,
    distanceSquares,
    includeElevation: input.includeElevation,
    dx,
    dy,
    dz,
  });

  return {
    distanceFeet,
    distanceSquares,
    markdown,
    fromName,
    toName,
  };
}

/**
 * Format distance result as ASCII diagram
 */
function formatDistanceResult(params: {
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  fromName?: string;
  toName?: string;
  mode: string;
  distanceFeet: number;
  distanceSquares: number;
  includeElevation: boolean;
  dx: number;
  dy: number;
  dz: number;
}): string {
  const content: string[] = [];
  const box = BOX.LIGHT;

  // Title
  const modeNames = {
    'euclidean': 'Euclidean (True Distance)',
    'grid_5e': 'Grid 5e (Simplified)',
    'grid_alt': 'Grid Alternate (5/10 Diagonal)',
  };
  content.push('DISTANCE MEASUREMENT');
  content.push(modeNames[params.mode as keyof typeof modeNames]);
  content.push('');
  content.push('─'.repeat(40));
  content.push('');

  // Positions
  content.push('FROM → TO');
  let positionDisplay = `(${params.from.x}, ${params.from.y}, ${params.from.z}) → (${params.to.x}, ${params.to.y}, ${params.to.z})`;
  if (params.fromName || params.toName) {
    const fromLabel = params.fromName || `(${params.from.x}, ${params.from.y}, ${params.from.z})`;
    const toLabel = params.toName || `(${params.to.x}, ${params.to.y}, ${params.to.z})`;
    positionDisplay = `${fromLabel} → ${toLabel}`;
  }
  content.push(positionDisplay);
  content.push('');

  // Visual path representation
  const arrow = drawPath(params.from, params.to);
  content.push(`Path: ${arrow}`);
  content.push('');

  // Movement breakdown
  if (params.dx > 0 || params.dy > 0 || params.dz > 0) {
    content.push(`Movement: ${params.dx}x, ${params.dy}y, ${params.dz}z`);
    content.push('');
  }

  content.push('─'.repeat(40));
  content.push('');

  // Result
  content.push(`DISTANCE: ${params.distanceFeet} feet`);
  content.push(`(${params.distanceSquares} squares @ 5ft each)`);

  // Notes
  if (!params.includeElevation && params.to.z !== params.from.z) {
    content.push('');
    content.push('* Elevation difference ignored *');
  }

  return createBox('DISTANCE', content, undefined, 'HEAVY');
}

// ============================================================
// CALCULATE AoE
// ============================================================

/**
 * AoE shape types per D&D 5e
 */
const AoeShapeSchema = z.enum(['sphere', 'cone', 'line', 'cube', 'cylinder']);

/**
 * Direction for cones/lines
 */
const DirectionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/**
 * Schema for calculate_aoe
 */
export const calculateAoeSchema = z.object({
  encounterId: z.string().optional(),
  shape: AoeShapeSchema,
  origin: PositionSchema,

  // Shape-specific parameters
  length: z.number().optional(),    // Line, Cone
  width: z.number().default(5).optional(),  // Line
  radius: z.number().optional(),    // Sphere, Cylinder
  sideLength: z.number().optional(), // Cube
  height: z.number().optional(),    // Cylinder

  direction: DirectionSchema.optional(),

  // Options
  includeOrigin: z.boolean().default(false),
  excludeIds: z.array(z.string()).optional(),
}).refine((data) => {
  // Validate required parameters based on shape
  switch (data.shape) {
    case 'sphere':
      return data.radius !== undefined;
    case 'cone':
      return data.length !== undefined;
    case 'line':
      return data.length !== undefined;
    case 'cube':
      return data.sideLength !== undefined;
    case 'cylinder':
      return data.radius !== undefined && data.height !== undefined;
    default:
      return true;
  }
}, {
  message: 'Missing required parameters for shape',
});

export type CalculateAoeInput = z.infer<typeof calculateAoeSchema>;

/**
 * Display width for ASCII output
 */
const AOE_DISPLAY_WIDTH = 40;

/**
 * Calculate area of effect for various D&D 5e shapes.
 * Returns affected tiles and any creatures within.
 */
export function calculateAoe(input: CalculateAoeInput): string {
  const content: string[] = [];
  const {
    encounterId,
    shape,
    origin,
    length,
    width = 5,
    radius,
    sideLength,
    height,
    direction,
    includeOrigin = false,
    excludeIds = [],
  } = input;

  // Calculate affected tiles based on shape
  let tiles: Array<{ x: number; y: number; z: number }> = [];

  switch (shape) {
    case 'sphere':
      tiles = calculateSphereTiles(origin, radius!, includeOrigin);
      break;
    case 'cone':
      tiles = calculateConeTiles(origin, length!, direction || { x: 1, y: 0 }, includeOrigin);
      break;
    case 'line':
      tiles = calculateLineTiles(origin, length!, width, direction || { x: 1, y: 0 });
      break;
    case 'cube':
      tiles = calculateCubeTiles(origin, sideLength!, direction, includeOrigin);
      break;
    case 'cylinder':
      tiles = calculateCylinderTiles(origin, radius!, height!, includeOrigin);
      break;
  }

  // Build header
  content.push(centerText(`${shape.toUpperCase()} AoE`, AOE_DISPLAY_WIDTH));
  content.push('');
  content.push(`Origin: (${origin.x}, ${origin.y}, ${origin.z})`);
  content.push('');
  content.push(BOX.LIGHT.H.repeat(AOE_DISPLAY_WIDTH));
  content.push('');

  // Show shape parameters
  content.push(centerText('PARAMETERS', AOE_DISPLAY_WIDTH));
  content.push('');
  content.push(`Shape: ${shape}`);

  switch (shape) {
    case 'sphere':
      content.push(`Radius: ${radius} ft`);
      break;
    case 'cone':
      content.push(`Length: ${length} ft`);
      content.push(`Width at base: ${length} ft`);
      if (direction) {
        content.push(`Direction: (${direction.x}, ${direction.y})`);
      }
      break;
    case 'line':
      content.push(`Length: ${length} ft`);
      content.push(`Width: ${width} ft`);
      if (direction) {
        content.push(`Direction: (${direction.x}, ${direction.y})`);
      }
      break;
    case 'cube':
      content.push(`Side: ${sideLength} ft`);
      break;
    case 'cylinder':
      content.push(`Radius: ${radius} ft`);
      content.push(`Height: ${height} ft`);
      break;
  }

  content.push('');
  content.push(BOX.LIGHT.H.repeat(AOE_DISPLAY_WIDTH));
  content.push('');

  // Show tile count
  content.push(centerText('AFFECTED AREA', AOE_DISPLAY_WIDTH));
  content.push('');
  content.push(`Tiles affected: ${tiles.length} squares`);
  content.push(`Origin included: ${includeOrigin ? 'Yes' : 'No'}`);

  // If includeOrigin, show the origin position
  if (includeOrigin) {
    content.push(`Origin tile: (${origin.x}, ${origin.y}, ${origin.z})`);
  }

  // Show sample tiles (first few)
  if (tiles.length > 0) {
    content.push('');
    const sampleSize = Math.min(5, tiles.length);
    content.push(`Sample tiles (first ${sampleSize}):`);
    for (let i = 0; i < sampleSize; i++) {
      const t = tiles[i];
      content.push(`  (${t.x}, ${t.y}, ${t.z})`);
    }
    if (tiles.length > sampleSize) {
      content.push(`  ... and ${tiles.length - sampleSize} more`);
    }
  }

  // Find creatures in AoE if encounterId provided
  if (encounterId) {
    content.push('');
    content.push(BOX.LIGHT.H.repeat(AOE_DISPLAY_WIDTH));
    content.push('');
    content.push(centerText('CREATURES IN AoE', AOE_DISPLAY_WIDTH));
    content.push('');

    // This would check encounter participants
    // For now, show placeholder
    content.push('(Encounter integration pending)');
  }

  // Show excluded IDs if any
  if (excludeIds.length > 0) {
    content.push('');
    content.push(`Excluded: ${excludeIds.join(', ')}`);
  }

  return createBox('AREA OF EFFECT', content);
}

/**
 * Calculate tiles within a sphere radius.
 * Uses 5ft grid squares.
 */
function calculateSphereTiles(
  origin: { x: number; y: number; z: number },
  radius: number,
  includeOrigin: boolean
): Array<{ x: number; y: number; z: number }> {
  const tiles: Array<{ x: number; y: number; z: number }> = [];
  const gridRadius = Math.ceil(radius / 5);

  for (let dx = -gridRadius; dx <= gridRadius; dx++) {
    for (let dy = -gridRadius; dy <= gridRadius; dy++) {
      for (let dz = -gridRadius; dz <= gridRadius; dz++) {
        if (dx === 0 && dy === 0 && dz === 0 && !includeOrigin) {
          continue;
        }

        // Calculate distance from origin
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) * 5;
        if (distance <= radius) {
          tiles.push({
            x: origin.x + dx * 5,
            y: origin.y + dy * 5,
            z: origin.z + dz * 5,
          });
        }
      }
    }
  }

  return tiles;
}

/**
 * Calculate tiles within a cone.
 * Per D&D 5e: cone width at any point = distance from origin
 */
function calculateConeTiles(
  origin: { x: number; y: number; z: number },
  length: number,
  direction: { x: number; y: number },
  includeOrigin: boolean
): Array<{ x: number; y: number; z: number }> {
  const tiles: Array<{ x: number; y: number; z: number }> = [];

  // Normalize direction
  const dirMag = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
  const dirX = direction.x / dirMag;
  const dirY = direction.y / dirMag;

  const gridLength = Math.ceil(length / 5);

  for (let dist = 0; dist <= gridLength; dist++) {
    if (dist === 0 && !includeOrigin) continue;

    const actualDist = dist * 5;
    const widthAtDist = actualDist; // Width = distance for D&D cones
    const halfWidth = Math.ceil(widthAtDist / 10); // Grid squares for half-width

    // Calculate center of this "ring"
    const centerX = origin.x + dirX * actualDist;
    const centerY = origin.y + dirY * actualDist;

    // Perpendicular direction for width
    const perpX = -dirY;
    const perpY = dirX;

    for (let w = -halfWidth; w <= halfWidth; w++) {
      const tileX = Math.round(centerX + perpX * w * 5);
      const tileY = Math.round(centerY + perpY * w * 5);

      tiles.push({
        x: tileX,
        y: tileY,
        z: origin.z,
      });
    }
  }

  return tiles;
}

/**
 * Calculate tiles within a line.
 */
function calculateLineTiles(
  origin: { x: number; y: number; z: number },
  length: number,
  width: number,
  direction: { x: number; y: number }
): Array<{ x: number; y: number; z: number }> {
  const tiles: Array<{ x: number; y: number; z: number }> = [];

  // Normalize direction
  const dirMag = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
  const dirX = direction.x / dirMag;
  const dirY = direction.y / dirMag;

  const gridLength = Math.ceil(length / 5);
  const gridHalfWidth = Math.floor(width / 10);

  // Perpendicular direction for width
  const perpX = -dirY;
  const perpY = dirX;

  for (let dist = 0; dist <= gridLength; dist++) {
    const centerX = origin.x + dirX * dist * 5;
    const centerY = origin.y + dirY * dist * 5;

    for (let w = -gridHalfWidth; w <= gridHalfWidth; w++) {
      tiles.push({
        x: Math.round(centerX + perpX * w * 5),
        y: Math.round(centerY + perpY * w * 5),
        z: origin.z,
      });
    }
  }

  return tiles;
}

/**
 * Calculate tiles within a cube.
 * Origin can be a corner or edge based on direction.
 */
function calculateCubeTiles(
  origin: { x: number; y: number; z: number },
  sideLength: number,
  direction: { x: number; y: number } | undefined,
  includeOrigin: boolean
): Array<{ x: number; y: number; z: number }> {
  const tiles: Array<{ x: number; y: number; z: number }> = [];
  const gridSide = Math.ceil(sideLength / 5);

  // If direction given, cube extends in that direction from origin
  // Otherwise, origin is center of cube
  let startX = origin.x;
  let startY = origin.y;
  let startZ = origin.z;

  if (!direction) {
    // Center origin
    startX -= Math.floor(sideLength / 2);
    startY -= Math.floor(sideLength / 2);
    startZ -= Math.floor(sideLength / 2);
  }

  for (let dx = 0; dx < gridSide; dx++) {
    for (let dy = 0; dy < gridSide; dy++) {
      for (let dz = 0; dz < gridSide; dz++) {
        const tileX = startX + dx * 5;
        const tileY = startY + dy * 5;
        const tileZ = startZ + dz * 5;

        if (tileX === origin.x && tileY === origin.y && tileZ === origin.z && !includeOrigin) {
          continue;
        }

        tiles.push({ x: tileX, y: tileY, z: tileZ });
      }
    }
  }

  return tiles;
}

/**
 * Calculate tiles within a cylinder.
 * Vertical column centered on origin.
 */
function calculateCylinderTiles(
  origin: { x: number; y: number; z: number },
  radius: number,
  height: number,
  includeOrigin: boolean
): Array<{ x: number; y: number; z: number }> {
  const tiles: Array<{ x: number; y: number; z: number }> = [];
  const gridRadius = Math.ceil(radius / 5);
  const gridHeight = Math.ceil(height / 5);

  for (let dx = -gridRadius; dx <= gridRadius; dx++) {
    for (let dy = -gridRadius; dy <= gridRadius; dy++) {
      // Check if within cylinder radius (2D)
      const dist2D = Math.sqrt(dx * dx + dy * dy) * 5;
      if (dist2D > radius) continue;

      for (let dz = 0; dz < gridHeight; dz++) {
        if (dx === 0 && dy === 0 && dz === 0 && !includeOrigin) {
          continue;
        }

        tiles.push({
          x: origin.x + dx * 5,
          y: origin.y + dy * 5,
          z: origin.z + dz * 5,
        });
      }
    }
  }

  return tiles;
}

// ============================================================
// CHECK LINE OF SIGHT
// ============================================================

/**
 * Obstacle types for line of sight calculations
 */
const ObstacleTypeSchema = z.enum([
  'wall',
  'pillar',
  'half_cover',
  'three_quarters_cover',
  'total_cover',
]);

/**
 * Obstacle schema for line of sight
 */
const ObstacleSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().default(0),
  type: ObstacleTypeSchema,
  height: z.number().optional(),
});

/**
 * Creature size for blocking calculations
 */
const CreatureSizeSchema = z.enum(['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']);

/**
 * Creature blocking info
 */
const CreatureBlockSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().default(0),
  size: CreatureSizeSchema,
});

/**
 * Special senses
 */
const SenseSchema = z.enum(['blindsight', 'darkvision', 'tremorsense', 'truesight']);

/**
 * Schema for check_line_of_sight
 */
export const checkLineOfSightSchema = z.object({
  encounterId: z.string().optional(),

  // Position can be coordinates or character ID
  from: PositionSchema.optional(),
  to: PositionSchema.optional(),
  fromId: z.string().optional(),
  toId: z.string().optional(),

  // Obstacles (manual or from encounter)
  obstacles: z.array(ObstacleSchema).optional(),

  // Creature blocking
  creatures: z.array(CreatureBlockSchema).optional(),
  creaturesBlock: z.boolean().default(false),

  // Lighting and senses
  lighting: z.enum(['bright', 'dim', 'darkness']).optional(),
  darkvision: z.number().optional(),
  senses: z.array(SenseSchema).optional(),
  blindsightRange: z.number().optional(),
  tremorsenseRange: z.number().optional(),
}).refine((data) => {
  // Must have from position or fromId
  const hasFrom = data.from !== undefined || data.fromId !== undefined;
  // Must have to position or toId
  const hasTo = data.to !== undefined || data.toId !== undefined;
  return hasFrom && hasTo;
}, {
  message: 'Must provide from/to positions or fromId/toId',
}).refine((data) => {
  // If using IDs, must have encounterId
  if ((data.fromId || data.toId) && !data.encounterId) {
    return false;
  }
  return true;
}, {
  message: 'encounterId required when using fromId/toId',
});

export type CheckLineOfSightInput = z.infer<typeof checkLineOfSightSchema>;

/**
 * Cover levels and their AC bonuses
 */
const COVER_BONUSES = {
  none: 0,
  half: 2,
  three_quarters: 5,
  total: Infinity, // Blocked
} as const;

/**
 * Display width for ASCII output
 */
const LOS_DISPLAY_WIDTH = 50;

/**
 * Check line of sight between two positions.
 * Detects obstacles, cover, and creature blocking.
 */
export function checkLineOfSight(input: CheckLineOfSightInput): string {
  const content: string[] = [];

  // Resolve positions
  let fromPos: { x: number; y: number; z: number };
  let toPos: { x: number; y: number; z: number };
  let fromName: string | undefined;
  let toName: string | undefined;

  if (input.fromId && input.encounterId) {
    const participant = getEncounterParticipant(input.encounterId, input.fromId);
    if (!participant) {
      throw new Error(`Participant not found: ${input.fromId}`);
    }
    fromPos = participant.position || { x: 0, y: 0, z: 0 };
    fromName = participant.name;
  } else if (input.from) {
    fromPos = { x: input.from.x, y: input.from.y, z: input.from.z ?? 0 };
  } else {
    throw new Error('From position required');
  }

  if (input.toId && input.encounterId) {
    const participant = getEncounterParticipant(input.encounterId, input.toId);
    if (!participant) {
      throw new Error(`Participant not found: ${input.toId}`);
    }
    toPos = participant.position || { x: 0, y: 0, z: 0 };
    toName = participant.name;
  } else if (input.to) {
    toPos = { x: input.to.x, y: input.to.y, z: input.to.z ?? 0 };
  } else {
    throw new Error('To position required');
  }

  // Calculate distance
  const dx = toPos.x - fromPos.x;
  const dy = toPos.y - fromPos.y;
  const dz = toPos.z - fromPos.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) * 5;

  // Build header
  content.push(centerText('LINE OF SIGHT', LOS_DISPLAY_WIDTH));
  content.push('');

  // Show positions
  if (fromName) {
    content.push(`From: ${fromName} (${fromPos.x}, ${fromPos.y}, ${fromPos.z})`);
  } else {
    content.push(`From: (${fromPos.x}, ${fromPos.y}, ${fromPos.z})`);
  }

  if (toName) {
    content.push(`To: ${toName} (${toPos.x}, ${toPos.y}, ${toPos.z})`);
  } else {
    content.push(`To: (${toPos.x}, ${toPos.y}, ${toPos.z})`);
  }

  content.push(`Distance: ${Math.round(distance)} feet`);
  content.push('');
  content.push(BOX.LIGHT.H.repeat(LOS_DISPLAY_WIDTH));
  content.push('');

  // Handle same position
  if (distance === 0) {
    content.push(centerText('CLEAR - SAME POSITION', LOS_DISPLAY_WIDTH));
    content.push('');
    content.push('Observer and target at same position.');
    return createBox('LINE OF SIGHT', content);
  }

  // Collect all obstacles to check
  const allObstacles = [...(input.obstacles || [])];

  // Get terrain obstacles from encounter if available
  // (For now, just use provided obstacles - encounter terrain integration pending)

  // Check for blocking and cover
  let coverLevel: 'none' | 'half' | 'three_quarters' | 'total' = 'none';
  let blockingObstacle: typeof allObstacles[0] | undefined;
  let blockingCreature: { size: string } | undefined;

  // Check static obstacles
  for (const obstacle of allObstacles) {
    if (isOnLine(fromPos, toPos, obstacle)) {
      // Check height if specified
      if (obstacle.height !== undefined) {
        // Calculate z-height at obstacle position
        const t = getLineParameter(fromPos, toPos, obstacle);
        const lineZ = fromPos.z + t * dz;

        // If line passes over the obstacle, it doesn't block
        if (lineZ > obstacle.height / 5) {
          continue;
        }
      }

      // Determine cover level from obstacle type
      const obstacleCover = getObstacleCover(obstacle.type);
      if (compareCover(obstacleCover, coverLevel) > 0) {
        coverLevel = obstacleCover;
        blockingObstacle = obstacle;
      }
    }
  }

  // Check creature blocking
  if (input.creaturesBlock && input.creatures) {
    for (const creature of input.creatures) {
      if (isOnLine(fromPos, toPos, creature)) {
        const creatureCover = getCreatureCover(creature.size);
        if (compareCover(creatureCover, coverLevel) > 0) {
          coverLevel = creatureCover;
          blockingCreature = creature;
        }
      }
    }
  }

  // Handle special senses
  if (input.senses?.includes('blindsight') && input.blindsightRange) {
    if (distance <= input.blindsightRange) {
      content.push('BLINDSIGHT Active');
      content.push('');
      content.push(`blindsight range: ${input.blindsightRange} ft (target within range)`);
      content.push('Can perceive through normal obstacles.');
      content.push('');
      content.push(BOX.LIGHT.H.repeat(LOS_DISPLAY_WIDTH));
      content.push('');
    }
  }

  if (input.senses?.includes('tremorsense') && input.tremorsenseRange) {
    content.push('TREMORSENSE NOTES');
    content.push('');
    if (toPos.z > 0) {
      content.push(`Target is airborne (z=${toPos.z}) - flying creatures`);
      content.push('cannot be detected by tremorsense.');
    } else if (distance <= input.tremorsenseRange) {
      content.push(`Range: ${input.tremorsenseRange} ft (target within range)`);
    }
    content.push('');
    content.push(BOX.LIGHT.H.repeat(LOS_DISPLAY_WIDTH));
    content.push('');
  }

  // Handle lighting
  if (input.lighting === 'darkness') {
    content.push('LIGHTING: DARKNESS');
    content.push('');
    if (input.darkvision) {
      if (distance <= input.darkvision) {
        content.push(`Darkvision range: ${input.darkvision} ft`);
        content.push('Target within darkvision range (dim light for you).');
      } else {
        content.push(`Darkvision range: ${input.darkvision} ft`);
        content.push(`Target at ${Math.round(distance)} ft - heavily obscured!`);
      }
    } else {
      content.push('No darkvision - target is heavily obscured.');
    }
    content.push('');
    content.push(BOX.LIGHT.H.repeat(LOS_DISPLAY_WIDTH));
    content.push('');
  }

  // Display result
  content.push(centerText('RESULT', LOS_DISPLAY_WIDTH));
  content.push('');

  if (coverLevel === 'total') {
    content.push('STATUS: BLOCKED');
    content.push('');
    content.push('Total cover - no line of sight!');
    if (blockingObstacle) {
      content.push(`Blocked by: ${blockingObstacle.type} at (${blockingObstacle.x}, ${blockingObstacle.y})`);
    }
  } else if (coverLevel === 'three_quarters') {
    content.push('STATUS: THREE-QUARTERS COVER');
    content.push('');
    content.push('Target has three-quarters cover.');
    content.push(`AC Bonus: +${COVER_BONUSES.three_quarters}`);
    content.push(`Dex Save Bonus: +${COVER_BONUSES.three_quarters}`);
    if (blockingObstacle) {
      content.push(`Cover from: ${blockingObstacle.type}`);
    }
    if (blockingCreature) {
      content.push(`Cover from: ${blockingCreature.size} creature`);
    }
  } else if (coverLevel === 'half') {
    content.push('STATUS: HALF COVER');
    content.push('');
    content.push('Target has half cover.');
    content.push(`AC Bonus: +${COVER_BONUSES.half}`);
    content.push(`Dex Save Bonus: +${COVER_BONUSES.half}`);
    if (blockingObstacle) {
      content.push(`Cover from: ${blockingObstacle.type}`);
    }
    if (blockingCreature) {
      content.push(`Cover from: ${blockingCreature.size} creature`);
    }
  } else {
    content.push('STATUS: CLEAR');
    content.push('');
    content.push('Line of sight is unobstructed.');
  }

  const title = coverLevel === 'total' ? 'BLOCKED' : 'LINE OF SIGHT';
  return createBox(title, content);
}

/**
 * Check if a point is approximately on the line between two points.
 * Uses a tolerance for grid-based checking.
 */
function isOnLine(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  point: { x: number; y: number; z: number }
): boolean {
  // Calculate distance from point to line
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;

  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (length === 0) return false;

  // Vector from 'from' to 'point'
  const px = point.x - from.x;
  const py = point.y - from.y;
  const pz = point.z - from.z;

  // Project point onto line
  const t = (px * dx + py * dy + pz * dz) / (length * length);

  // Check if projection is between from and to
  if (t < 0 || t > 1) return false;

  // Calculate closest point on line
  const closestX = from.x + t * dx;
  const closestY = from.y + t * dy;
  const closestZ = from.z + t * dz;

  // Calculate distance from point to closest point on line
  const distX = point.x - closestX;
  const distY = point.y - closestY;
  const distZ = point.z - closestZ;
  const dist = Math.sqrt(distX * distX + distY * distY + distZ * distZ);

  // Within 1 grid square (5 feet / 5 = 1 unit) tolerance
  return dist <= 1;
}

/**
 * Get the parameter t for a point's projection onto the line.
 * Returns value between 0 (at 'from') and 1 (at 'to').
 */
function getLineParameter(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  point: { x: number; y: number; z: number }
): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (length === 0) return 0;

  const px = point.x - from.x;
  const py = point.y - from.y;
  const pz = point.z - from.z;

  return (px * dx + py * dy + pz * dz) / (length * length);
}

/**
 * Convert obstacle type to cover level.
 */
function getObstacleCover(type: string): 'none' | 'half' | 'three_quarters' | 'total' {
  switch (type) {
    case 'half_cover':
      return 'half';
    case 'three_quarters_cover':
      return 'three_quarters';
    case 'total_cover':
    case 'wall':
    case 'pillar':
      return 'total';
    default:
      return 'none';
  }
}

/**
 * Convert creature size to cover level.
 * Small/Medium creatures provide half cover, Large/Huge provide 3/4 cover.
 * Gargantuan provides total cover, tiny creatures don't provide cover.
 */
function getCreatureCover(size: string): 'none' | 'half' | 'three_quarters' | 'total' {
  switch (size) {
    case 'tiny':
      return 'none';
    case 'small':
    case 'medium':
      return 'half';
    case 'large':
    case 'huge':
      return 'three_quarters';
    case 'gargantuan':
      return 'total';
    default:
      return 'none';
  }
}

/**
 * Compare two cover levels. Returns >0 if a > b, <0 if a < b, 0 if equal.
 */
function compareCover(a: string, b: string): number {
  const order = ['none', 'half', 'three_quarters', 'total'];
  return order.indexOf(a) - order.indexOf(b);
}

// ============================================================
// CHECK COVER
// ============================================================

/**
 * Position schema for check_cover (allows optional z)
 */
const CoverPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().default(0),
});

/**
 * Schema for check_cover tool.
 * Returns AC and Dex save bonuses based on cover between attacker and target.
 */
export const checkCoverSchema = z.object({
  attacker: CoverPositionSchema,
  target: CoverPositionSchema,
  obstacles: z.array(ObstacleSchema).optional(),
  creatures: z.array(CreatureBlockSchema).optional(),
  creaturesProvideCover: z.boolean().default(false),
});

export type CheckCoverInput = z.infer<typeof checkCoverSchema>;

/**
 * Display width for cover check ASCII output
 */
const COVER_DISPLAY_WIDTH = 50;

/**
 * Check cover between attacker and target positions.
 * Returns AC and Dex save bonuses based on D&D 5e cover rules.
 *
 * @param input - The cover check parameters
 * @returns ASCII formatted cover status with bonuses
 */
export function checkCover(input: CheckCoverInput): string {
  const content: string[] = [];

  const attackerPos = {
    x: input.attacker.x,
    y: input.attacker.y,
    z: input.attacker.z ?? 0,
  };

  const targetPos = {
    x: input.target.x,
    y: input.target.y,
    z: input.target.z ?? 0,
  };

  // Calculate distance
  const dx = targetPos.x - attackerPos.x;
  const dy = targetPos.y - attackerPos.y;
  const dz = targetPos.z - attackerPos.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) * 5; // Convert to feet

  // Build header
  content.push(centerText('COVER CHECK', COVER_DISPLAY_WIDTH));
  content.push('');
  content.push(`Attacker: (${attackerPos.x}, ${attackerPos.y}, ${attackerPos.z})`);
  content.push(`Target: (${targetPos.x}, ${targetPos.y}, ${targetPos.z})`);
  content.push(`Distance: ${Math.round(distance)} feet`);
  content.push('');
  content.push(BOX.LIGHT.H.repeat(COVER_DISPLAY_WIDTH));
  content.push('');

  // Find highest cover level from all obstacles
  let coverLevel: 'none' | 'half' | 'three_quarters' | 'total' = 'none';
  const coverSources: Array<{ type: string; position: string }> = [];

  // Check static obstacles
  const obstacles = input.obstacles || [];
  for (const obstacle of obstacles) {
    // Skip obstacles at the attacker's position
    if (
      obstacle.x === attackerPos.x &&
      obstacle.y === attackerPos.y &&
      obstacle.z === attackerPos.z
    ) {
      continue;
    }

    if (isOnLine(attackerPos, targetPos, obstacle)) {
      // Check height if specified
      if (obstacle.height !== undefined) {
        const t = getLineParameter(attackerPos, targetPos, obstacle);
        const lineZ = attackerPos.z + t * dz;

        // If line passes over the obstacle, it doesn't block
        if (lineZ > obstacle.height / 5) {
          continue;
        }
      }

      const obstacleCover = getObstacleCover(obstacle.type);
      if (compareCover(obstacleCover, coverLevel) > 0) {
        coverLevel = obstacleCover;
      }
      if (obstacleCover !== 'none') {
        coverSources.push({
          type: obstacle.type,
          position: `(${obstacle.x}, ${obstacle.y}, ${obstacle.z})`,
        });
      }
    }
  }

  // Check creature cover
  if (input.creaturesProvideCover && input.creatures) {
    for (const creature of input.creatures) {
      if (isOnLine(attackerPos, targetPos, creature)) {
        const creatureCover = getCreatureCover(creature.size);
        if (compareCover(creatureCover, coverLevel) > 0) {
          coverLevel = creatureCover;
        }
        if (creatureCover !== 'none') {
          coverSources.push({
            type: `${creature.size} creature`,
            position: `(${creature.x}, ${creature.y}, ${creature.z})`,
          });
        }
      }
    }
  }

  // Display cover sources if any
  if (coverSources.length > 0) {
    content.push(centerText('COVER SOURCES', COVER_DISPLAY_WIDTH));
    content.push('');
    for (const source of coverSources) {
      content.push(`  ${source.type} at ${source.position}`);
    }
    content.push('');
    content.push(BOX.LIGHT.H.repeat(COVER_DISPLAY_WIDTH));
    content.push('');
  }

  // Display result
  content.push(centerText('RESULT', COVER_DISPLAY_WIDTH));
  content.push('');

  switch (coverLevel) {
    case 'total':
      content.push('TOTAL COVER');
      content.push('');
      content.push('Target cannot be directly targeted.');
      content.push('No line of effect for attacks or spells.');
      break;

    case 'three_quarters':
      content.push('THREE-QUARTERS COVER');
      content.push('');
      content.push(`AC Bonus: +${COVER_BONUSES.three_quarters}`);
      content.push(`Dex Save Bonus: +${COVER_BONUSES.three_quarters}`);
      break;

    case 'half':
      content.push('HALF COVER');
      content.push('');
      content.push(`AC Bonus: +${COVER_BONUSES.half}`);
      content.push(`Dex Save Bonus: +${COVER_BONUSES.half}`);
      break;

    default:
      content.push('NO COVER');
      content.push('');
      content.push('AC Bonus: +0');
      content.push('Dex Save Bonus: +0');
      break;
  }

  return createBox('COVER CHECK', content);
}

// ============================================================
// PLACE PROP
// ============================================================

/**
 * Prop types supported by the system
 */
const PropTypeSchema = z.enum([
  'barrel',
  'crate',
  'chest',
  'door',
  'lever',
  'pillar',
  'statue',
  'table',
  'chair',
  'altar',
  'trap',
  'obstacle',
  'custom',
]);

/**
 * Cover types a prop can provide
 */
const PropCoverTypeSchema = z.enum(['none', 'half', 'three_quarters', 'total']);

/**
 * Prop size options
 */
const PropSizeSchema = z.enum(['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']);

/**
 * Position schema for props
 */
const PropPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().default(0),
});

/**
 * Operation types for prop management
 */
const PropOperationSchema = z.enum(['place', 'remove', 'update', 'move', 'list']);

/**
 * Schema for place_prop tool
 */
export const placePropSchema = z.object({
  encounterId: z.string(),
  operation: PropOperationSchema.default('place'),

  // For place operation
  name: z.string().optional(),
  type: PropTypeSchema.optional(),
  position: PropPositionSchema.optional(),

  // For remove/update/move operations
  propId: z.string().optional(),

  // Prop properties
  state: z.string().optional(), // 'open', 'closed', 'on', 'off', etc.
  locked: z.boolean().optional(),
  lockDC: z.number().min(1).max(30).optional(),
  coverType: PropCoverTypeSchema.optional(),
  blocksMovement: z.boolean().optional(),
  destructible: z.boolean().optional(),
  hp: z.number().min(1).optional(),
  ac: z.number().min(1).max(30).optional(),
  size: PropSizeSchema.optional(),
  description: z.string().optional(),

  // Trap properties
  hidden: z.boolean().optional(),
  trapDC: z.number().min(1).max(30).optional(),
  trapDamage: z.string().optional(),
  trigger: z.string().optional(),
}).refine((data) => {
  // For place operation, name, type, and position are required
  if (data.operation === 'place') {
    return data.name !== undefined && data.type !== undefined && data.position !== undefined;
  }
  // For remove/update/move, propId is required
  if (['remove', 'update', 'move'].includes(data.operation)) {
    return data.propId !== undefined;
  }
  return true;
}, {
  message: 'Place operation requires name, type, and position. Remove/update/move require propId.',
});

export type PlacePropInput = z.infer<typeof placePropSchema>;

/**
 * Prop storage interface
 */
interface Prop {
  id: string;
  name: string;
  type: string;
  position: { x: number; y: number; z: number };
  state?: string;
  locked?: boolean;
  lockDC?: number;
  coverType?: string;
  blocksMovement?: boolean;
  destructible?: boolean;
  hp?: number;
  maxHp?: number;
  ac?: number;
  size?: string;
  description?: string;
  hidden?: boolean;
  trapDC?: number;
  trapDamage?: string;
  trigger?: string;
}

/**
 * In-memory prop storage per encounter
 */
const encounterProps: Map<string, Prop[]> = new Map();

/**
 * Get props for an encounter
 */
export function getEncounterProps(encounterId: string): Prop[] {
  return encounterProps.get(encounterId) || [];
}

/**
 * Clear props for an encounter
 */
export function clearEncounterProps(encounterId: string): void {
  encounterProps.delete(encounterId);
}

/**
 * Generate a unique prop ID
 */
function generatePropId(): string {
  return `prop-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Display width for prop ASCII output
 */
const PROP_DISPLAY_WIDTH = 50;

/**
 * Place or manage props on the battlefield.
 *
 * @param input - The prop operation parameters
 * @returns ASCII formatted result
 */
export function placeProp(input: PlacePropInput): string {
  const content: string[] = [];
  const operation = input.operation || 'place';

  // Validate encounter exists
  const encounter = getEncounterState(input.encounterId);
  if (!encounter) {
    throw new Error(`Encounter not found: ${input.encounterId}`);
  }

  // Get grid bounds from terrain
  const gridWidth = encounter.terrain?.width || 20;
  const gridHeight = encounter.terrain?.height || 20;

  // Initialize props array for this encounter if needed
  if (!encounterProps.has(input.encounterId)) {
    encounterProps.set(input.encounterId, []);
  }
  const props = encounterProps.get(input.encounterId)!;

  switch (operation) {
    case 'place': {
      // Validate position bounds
      const pos = input.position!;
      if (pos.x < 0 || pos.x >= gridWidth || pos.y < 0 || pos.y >= gridHeight) {
        throw new Error(`Position (${pos.x}, ${pos.y}) is out of bounds (grid is ${gridWidth}x${gridHeight})`);
      }

      // Create new prop
      const prop: Prop = {
        id: generatePropId(),
        name: input.name!,
        type: input.type!,
        position: { x: pos.x, y: pos.y, z: pos.z ?? 0 },
      };

      // Add optional properties
      if (input.state !== undefined) prop.state = input.state;
      if (input.locked !== undefined) prop.locked = input.locked;
      if (input.lockDC !== undefined) prop.lockDC = input.lockDC;
      if (input.coverType !== undefined) prop.coverType = input.coverType;
      if (input.blocksMovement !== undefined) prop.blocksMovement = input.blocksMovement;
      if (input.destructible !== undefined) {
        prop.destructible = input.destructible;
        if (input.hp !== undefined) {
          prop.hp = input.hp;
          prop.maxHp = input.hp;
        }
        if (input.ac !== undefined) prop.ac = input.ac;
      }
      if (input.size !== undefined) prop.size = input.size;
      if (input.description !== undefined) prop.description = input.description;
      if (input.hidden !== undefined) prop.hidden = input.hidden;
      if (input.trapDC !== undefined) prop.trapDC = input.trapDC;
      if (input.trapDamage !== undefined) prop.trapDamage = input.trapDamage;
      if (input.trigger !== undefined) prop.trigger = input.trigger;

      props.push(prop);

      // Build output
      content.push(centerText('PROP PLACED', PROP_DISPLAY_WIDTH));
      content.push('');
      content.push(`Name: ${prop.name}`);
      content.push(`Type: ${prop.type}`);
      content.push(`Position: (${prop.position.x}, ${prop.position.y}, ${prop.position.z})`);
      content.push(`ID: ${prop.id}`);
      content.push('');
      content.push(BOX.LIGHT.H.repeat(PROP_DISPLAY_WIDTH));
      content.push('');

      // Show properties
      content.push(centerText('PROPERTIES', PROP_DISPLAY_WIDTH));
      content.push('');

      if (prop.state) content.push(`State: ${prop.state}`);
      if (prop.size) content.push(`Size: ${prop.size}`);
      if (prop.coverType) content.push(`Cover: ${prop.coverType}`);
      if (prop.blocksMovement) content.push('Blocks Movement: Yes');
      if (prop.destructible) {
        content.push('Destructible: Yes');
        if (prop.hp) content.push(`HP: ${prop.hp}`);
        if (prop.ac) content.push(`AC: ${prop.ac}`);
      }
      if (prop.locked) {
        content.push('Locked: Yes');
        if (prop.lockDC) content.push(`Lock DC: ${prop.lockDC}`);
      }
      if (prop.hidden) content.push('Hidden: Yes');
      if (prop.trapDC) content.push(`Trap DC: ${prop.trapDC}`);
      if (prop.trapDamage) content.push(`Trap Damage: ${prop.trapDamage}`);
      if (prop.trigger) content.push(`Trigger: ${prop.trigger}`);
      if (prop.description) {
        content.push('');
        content.push(`Description: ${prop.description}`);
      }

      return createBox('PROP PLACED', content);
    }

    case 'list': {
      content.push(centerText('ENCOUNTER PROPS', PROP_DISPLAY_WIDTH));
      content.push('');
      content.push(`Encounter: ${input.encounterId}`);
      content.push(`Total Props: ${props.length}`);
      content.push('');
      content.push(BOX.LIGHT.H.repeat(PROP_DISPLAY_WIDTH));
      content.push('');

      if (props.length === 0) {
        content.push('No props placed.');
      } else {
        for (const prop of props) {
          content.push(`${prop.name} (${prop.type})`);
          content.push(`  ID: ${prop.id}`);
          content.push(`  Position: (${prop.position.x}, ${prop.position.y}, ${prop.position.z})`);
          if (prop.state) content.push(`  State: ${prop.state}`);
          content.push('');
        }
      }

      return createBox('PROP LIST', content);
    }

    case 'remove': {
      const propIndex = props.findIndex(p => p.id === input.propId);
      if (propIndex === -1) {
        throw new Error(`Prop not found: ${input.propId}`);
      }

      const removedProp = props.splice(propIndex, 1)[0];

      content.push(centerText('PROP REMOVED', PROP_DISPLAY_WIDTH));
      content.push('');
      content.push(`Name: ${removedProp.name}`);
      content.push(`Type: ${removedProp.type}`);
      content.push(`ID: ${removedProp.id}`);
      content.push('');
      content.push('Prop has been removed from the encounter.');

      return createBox('PROP REMOVED', content);
    }

    case 'update': {
      const prop = props.find(p => p.id === input.propId);
      if (!prop) {
        throw new Error(`Prop not found: ${input.propId}`);
      }

      // Update properties
      if (input.state !== undefined) prop.state = input.state;
      if (input.locked !== undefined) prop.locked = input.locked;
      if (input.lockDC !== undefined) prop.lockDC = input.lockDC;
      if (input.coverType !== undefined) prop.coverType = input.coverType;
      if (input.blocksMovement !== undefined) prop.blocksMovement = input.blocksMovement;
      if (input.hp !== undefined) prop.hp = input.hp;
      if (input.hidden !== undefined) prop.hidden = input.hidden;

      content.push(centerText('PROP UPDATED', PROP_DISPLAY_WIDTH));
      content.push('');
      content.push(`Name: ${prop.name}`);
      content.push(`ID: ${prop.id}`);
      content.push('');
      content.push(BOX.LIGHT.H.repeat(PROP_DISPLAY_WIDTH));
      content.push('');
      content.push(centerText('CURRENT STATE', PROP_DISPLAY_WIDTH));
      content.push('');
      if (prop.state) content.push(`State: ${prop.state}`);
      if (prop.locked) content.push('Locked: Yes');
      if (prop.hidden) content.push('Hidden: Yes');
      content.push(`Position: (${prop.position.x}, ${prop.position.y}, ${prop.position.z})`);

      return createBox('PROP UPDATED', content);
    }

    case 'move': {
      const prop = props.find(p => p.id === input.propId);
      if (!prop) {
        throw new Error(`Prop not found: ${input.propId}`);
      }

      if (!input.position) {
        throw new Error('New position required for move operation');
      }

      const newPos = input.position;
      if (newPos.x < 0 || newPos.x >= gridWidth || newPos.y < 0 || newPos.y >= gridHeight) {
        throw new Error(`Position (${newPos.x}, ${newPos.y}) is out of bounds`);
      }

      const oldPos = { ...prop.position };
      prop.position = { x: newPos.x, y: newPos.y, z: newPos.z ?? 0 };

      content.push(centerText('PROP MOVED', PROP_DISPLAY_WIDTH));
      content.push('');
      content.push(`Name: ${prop.name}`);
      content.push(`ID: ${prop.id}`);
      content.push('');
      content.push(`From: (${oldPos.x}, ${oldPos.y}, ${oldPos.z})`);
      content.push(`To: (${prop.position.x}, ${prop.position.y}, ${prop.position.z})`);

      return createBox('PROP MOVED', content);
    }

    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

// ============================================================
// CALCULATE MOVEMENT
// ============================================================

/**
 * Movement calculation modes
 */
const MovementModeSchema = z.enum(['path', 'reach', 'adjacent']);

/**
 * Position schema for movement (optional z)
 */
const MovementPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().default(0),
});

/**
 * Schema for calculate_movement tool
 */
export const calculateMovementSchema = z.object({
  mode: MovementModeSchema.default('path'),
  encounterId: z.string().optional(),
  from: MovementPositionSchema,
  to: MovementPositionSchema.optional(),
  movement: z.number().min(0).default(30),
  gridWidth: z.number().min(5).max(100).default(20),
  gridHeight: z.number().min(5).max(100).default(20),
  creaturesBlock: z.boolean().default(false),
}).refine((data) => {
  // Path mode requires 'to' position
  if (data.mode === 'path' && !data.to) {
    return false;
  }
  return true;
}, {
  message: 'Path mode requires "to" position',
});

export type CalculateMovementInput = z.infer<typeof calculateMovementSchema>;

/**
 * Display width for movement ASCII output
 */
const MOVEMENT_DISPLAY_WIDTH = 50;

/**
 * Terrain cost multipliers
 */
const TERRAIN_COSTS: Record<string, number> = {
  normal: 1,
  difficultTerrain: 2,
  water: 2,
  obstacle: Infinity,
};

interface GridCell {
  x: number;
  y: number;
  cost: number;
  terrain?: string;
  occupied?: boolean;
  occupiedBy?: string;
}

/**
 * Calculate movement paths, reachable squares, or adjacent squares.
 *
 * @param input - Movement calculation parameters
 * @returns ASCII formatted result
 */
export function calculateMovement(input: CalculateMovementInput): string {
  const content: string[] = [];
  const mode = input.mode || 'path';

  // Get encounter state if provided
  let encounter: ReturnType<typeof getEncounterState> | undefined;
  let terrain: Map<string, string> = new Map();
  let creatures: Map<string, string> = new Map();

  if (input.encounterId) {
    encounter = getEncounterState(input.encounterId);
    if (!encounter) {
      throw new Error(`Encounter not found: ${input.encounterId}`);
    }

    // Build terrain map
    if (encounter.terrain) {
      for (const pos of encounter.terrain.obstacles || []) {
        terrain.set(pos, 'obstacle');
      }
      for (const pos of encounter.terrain.difficultTerrain || []) {
        terrain.set(pos, 'difficultTerrain');
      }
      for (const pos of encounter.terrain.water || []) {
        terrain.set(pos, 'water');
      }
    }

    // Build creature positions map
    for (const p of encounter.participants || []) {
      if (p.position) {
        creatures.set(`${p.position.x},${p.position.y}`, p.name);
      }
    }
  }

  const gridWidth = encounter?.terrain?.width || input.gridWidth || 20;
  const gridHeight = encounter?.terrain?.height || input.gridHeight || 20;

  const fromPos = { x: input.from.x, y: input.from.y };

  switch (mode) {
    case 'path': {
      const toPos = { x: input.to!.x, y: input.to!.y };

      content.push(centerText('PATH CALCULATION', MOVEMENT_DISPLAY_WIDTH));
      content.push('');
      content.push(`From: (${fromPos.x}, ${fromPos.y})`);
      content.push(`To: (${toPos.x}, ${toPos.y})`);
      content.push('');
      content.push(BOX.LIGHT.H.repeat(MOVEMENT_DISPLAY_WIDTH));
      content.push('');

      // Same position check
      if (fromPos.x === toPos.x && fromPos.y === toPos.y) {
        content.push('Distance: 0 feet');
        content.push('');
        content.push('Already at destination!');
        return createBox('PATH', content);
      }

      // Simple A* pathfinding
      const path = findPath(fromPos, toPos, gridWidth, gridHeight, terrain, creatures, input.creaturesBlock);

      if (path.length === 0) {
        content.push('STATUS: BLOCKED');
        content.push('');
        content.push('No path available - destination is unreachable.');
        return createBox('PATH', content);
      }

      // Calculate total cost
      let totalCost = 0;
      let hasDifficultTerrain = false;
      for (let i = 1; i < path.length; i++) {
        const pos = path[i];
        const key = `${pos.x},${pos.y}`;
        const terrainType = terrain.get(key) || 'normal';
        const cost = TERRAIN_COSTS[terrainType] || 1;
        if (cost === 2) hasDifficultTerrain = true;
        totalCost += cost * 5;
      }

      content.push(`Distance: ${totalCost} feet`);
      if (hasDifficultTerrain) {
        content.push('(includes difficult terrain)');
      }
      content.push('');

      // Show path
      content.push(centerText('PATH WAYPOINTS', MOVEMENT_DISPLAY_WIDTH));
      content.push('');
      for (let i = 0; i < path.length; i++) {
        const pos = path[i];
        const key = `${pos.x},${pos.y}`;
        const terrainType = terrain.get(key);
        let marker = '';
        if (i === 0) marker = ' (start)';
        else if (i === path.length - 1) marker = ' (end)';
        else if (terrainType === 'difficultTerrain') marker = ' [difficult]';
        else if (terrainType === 'water') marker = ' [water]';
        content.push(`  ${i + 1}. (${pos.x}, ${pos.y})${marker}`);
      }

      return createBox('PATH', content);
    }

    case 'reach': {
      const movementBudget = input.movement || 30;

      content.push(centerText('REACHABLE SQUARES', MOVEMENT_DISPLAY_WIDTH));
      content.push('');
      content.push(`From: (${fromPos.x}, ${fromPos.y})`);
      content.push(`Movement: ${movementBudget} feet`);
      content.push('');
      content.push(BOX.LIGHT.H.repeat(MOVEMENT_DISPLAY_WIDTH));
      content.push('');

      // Flood fill to find reachable squares
      const reachable = findReachable(fromPos, movementBudget, gridWidth, gridHeight, terrain, creatures, input.creaturesBlock);

      let hasDifficultTerrain = false;
      for (const pos of reachable) {
        const key = `${pos.x},${pos.y}`;
        if (terrain.get(key) === 'difficultTerrain' || terrain.get(key) === 'water') {
          hasDifficultTerrain = true;
          break;
        }
      }

      content.push(`Reachable: ${reachable.length} squares`);
      if (hasDifficultTerrain) {
        content.push('(movement reduced by difficult terrain)');
      }
      content.push('');

      // List reachable positions (limited to prevent huge output)
      const maxShow = 20;
      content.push(centerText('POSITIONS', MOVEMENT_DISPLAY_WIDTH));
      content.push('');
      for (let i = 0; i < Math.min(reachable.length, maxShow); i++) {
        const pos = reachable[i];
        content.push(`  (${pos.x}, ${pos.y})`);
      }
      if (reachable.length > maxShow) {
        content.push(`  ... and ${reachable.length - maxShow} more`);
      }

      return createBox('REACHABLE', content);
    }

    case 'adjacent': {
      content.push(centerText('ADJACENT SQUARES', MOVEMENT_DISPLAY_WIDTH));
      content.push('');
      content.push(`Position: (${fromPos.x}, ${fromPos.y})`);
      content.push('');
      content.push(BOX.LIGHT.H.repeat(MOVEMENT_DISPLAY_WIDTH));
      content.push('');

      // Find 8 adjacent squares
      const adjacent: Array<{ x: number; y: number; status: string }> = [];
      const directions = [
        { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
        { dx: -1, dy: 0 },                      { dx: 1, dy: 0 },
        { dx: -1, dy: 1 },  { dx: 0, dy: 1 },  { dx: 1, dy: 1 },
      ];

      for (const dir of directions) {
        const nx = fromPos.x + dir.dx;
        const ny = fromPos.y + dir.dy;

        // Check bounds
        if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) {
          continue;
        }

        const key = `${nx},${ny}`;
        let status = 'open';

        if (terrain.get(key) === 'obstacle') {
          status = 'blocked (obstacle)';
        } else if (creatures.has(key)) {
          status = `occupied (${creatures.get(key)})`;
        } else if (terrain.get(key) === 'difficultTerrain') {
          status = 'difficult terrain';
        } else if (terrain.get(key) === 'water') {
          status = 'water';
        }

        adjacent.push({ x: nx, y: ny, status });
      }

      content.push(`Adjacent: ${adjacent.length} squares`);
      content.push('');

      content.push(centerText('POSITIONS', MOVEMENT_DISPLAY_WIDTH));
      content.push('');
      for (const pos of adjacent) {
        content.push(`  (${pos.x}, ${pos.y}) - ${pos.status}`);
      }

      return createBox('ADJACENT', content);
    }

    default:
      throw new Error(`Unknown mode: ${mode}`);
  }
}

/**
 * A* pathfinding algorithm
 */
function findPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  gridWidth: number,
  gridHeight: number,
  terrain: Map<string, string>,
  creatures: Map<string, string>,
  creaturesBlock: boolean
): Array<{ x: number; y: number }> {
  interface Node {
    x: number;
    y: number;
    g: number;
    h: number;
    f: number;
    parent?: Node;
  }

  const openSet: Node[] = [];
  const closedSet = new Set<string>();

  const heuristic = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  };

  const startNode: Node = {
    x: from.x,
    y: from.y,
    g: 0,
    h: heuristic(from, to),
    f: heuristic(from, to),
  };

  openSet.push(startNode);

  const directions = [
    { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
    { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 1 }, { dx: -1, dy: 1 },
  ];

  while (openSet.length > 0) {
    // Find node with lowest f
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift()!;

    // Check if we reached the goal
    if (current.x === to.x && current.y === to.y) {
      // Reconstruct path
      const path: Array<{ x: number; y: number }> = [];
      let node: Node | undefined = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path;
    }

    closedSet.add(`${current.x},${current.y}`);

    // Check neighbors
    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      const key = `${nx},${ny}`;

      // Bounds check
      if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) {
        continue;
      }

      // Already visited
      if (closedSet.has(key)) {
        continue;
      }

      // Obstacle check
      const terrainType = terrain.get(key);
      if (terrainType === 'obstacle') {
        continue;
      }

      // Creature blocking (allow destination even if occupied)
      if (creaturesBlock && creatures.has(key) && !(nx === to.x && ny === to.y)) {
        continue;
      }

      // Calculate cost
      const baseCost = (dir.dx !== 0 && dir.dy !== 0) ? 1.414 : 1; // Diagonal vs cardinal
      const terrainCost = TERRAIN_COSTS[terrainType || 'normal'] || 1;
      const moveCost = baseCost * terrainCost;

      const g = current.g + moveCost;
      const h = heuristic({ x: nx, y: ny }, to);
      const f = g + h;

      // Check if already in open set with lower cost
      const existing = openSet.find(n => n.x === nx && n.y === ny);
      if (existing && existing.g <= g) {
        continue;
      }

      const neighbor: Node = {
        x: nx,
        y: ny,
        g,
        h,
        f,
        parent: current,
      };

      if (existing) {
        const idx = openSet.indexOf(existing);
        openSet[idx] = neighbor;
      } else {
        openSet.push(neighbor);
      }
    }
  }

  // No path found
  return [];
}

/**
 * Flood fill to find reachable squares within movement budget
 */
function findReachable(
  from: { x: number; y: number },
  movementBudget: number,
  gridWidth: number,
  gridHeight: number,
  terrain: Map<string, string>,
  creatures: Map<string, string>,
  creaturesBlock: boolean
): Array<{ x: number; y: number }> {
  const reachable: Array<{ x: number; y: number; cost: number }> = [];
  const visited = new Map<string, number>();

  const queue: Array<{ x: number; y: number; cost: number }> = [];
  queue.push({ x: from.x, y: from.y, cost: 0 });
  visited.set(`${from.x},${from.y}`, 0);

  const directions = [
    { dx: 0, dy: -1, cost: 5 },
    { dx: 1, dy: 0, cost: 5 },
    { dx: 0, dy: 1, cost: 5 },
    { dx: -1, dy: 0, cost: 5 },
    { dx: -1, dy: -1, cost: 7 },
    { dx: 1, dy: -1, cost: 7 },
    { dx: 1, dy: 1, cost: 7 },
    { dx: -1, dy: 1, cost: 7 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      const key = `${nx},${ny}`;

      // Bounds check
      if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) {
        continue;
      }

      // Obstacle check
      const terrainType = terrain.get(key);
      if (terrainType === 'obstacle') {
        continue;
      }

      // Creature blocking
      if (creaturesBlock && creatures.has(key)) {
        continue;
      }

      // Calculate cost
      const terrainCost = TERRAIN_COSTS[terrainType || 'normal'] || 1;
      const moveCost = dir.cost * terrainCost;
      const totalCost = current.cost + moveCost;

      // Check budget
      if (totalCost > movementBudget) {
        continue;
      }

      // Already visited with lower cost
      const existingCost = visited.get(key);
      if (existingCost !== undefined && existingCost <= totalCost) {
        continue;
      }

      visited.set(key, totalCost);
      reachable.push({ x: nx, y: ny, cost: totalCost });
      queue.push({ x: nx, y: ny, cost: totalCost });
    }
  }

  // Add starting position
  reachable.unshift({ x: from.x, y: from.y, cost: 0 });

  // Sort by distance from origin
  reachable.sort((a, b) => {
    const distA = Math.abs(a.x - from.x) + Math.abs(a.y - from.y);
    const distB = Math.abs(b.x - from.x) + Math.abs(b.y - from.y);
    return distA - distB;
  });

  return reachable.map(r => ({ x: r.x, y: r.y }));
}
