/**
 * Data Module - Location Graph & Session Data Management
 *
 * Handles location graph for party navigation, session notes,
 * party management, and inventory tracking.
 *
 * @module data
 */

import { z } from 'zod';
import { randomUUID } from 'crypto';
import { createBox, centerText, BOX } from './ascii-art.js';
import { getCharacter } from './characters.js';

// ============================================================
// CONSTANTS
// ============================================================

/** Standard display width for ASCII output */
const DISPLAY_WIDTH = 50;

/** Maximum name length */
const MAX_NAME_LENGTH = 100;

/** Arrow symbol for connections */
const ARROW = '→';

/** Bullet symbol for lists */
const BULLET = '•';

// ============================================================
// SCHEMAS
// ============================================================

/** Lighting levels for locations */
const LightingSchema = z.enum(['bright', 'dim', 'darkness']);

/** Location types for classification */
const LocationTypeSchema = z.enum([
  'town',
  'dungeon',
  'wilderness',
  'indoor',
  'outdoor',
  'underground',
  'planar',
  'other',
]);

/** Size classifications for locations */
const LocationSizeSchema = z.enum([
  'tiny',
  'small',
  'medium',
  'large',
  'huge',
  'gargantuan',
]);

/** Terrain types */
const TerrainSchema = z.enum([
  'urban',
  'forest',
  'mountain',
  'desert',
  'swamp',
  'arctic',
  'coastal',
  'underground',
  'planar',
  'other',
]);

/** Connection types between locations */
const ConnectionTypeSchema = z.enum([
  'door',
  'passage',
  'stairs',
  'ladder',
  'portal',
  'hidden',
]);

/** Operation types for manage_location */
const LocationOperationSchema = z.enum([
  'create',
  'get',
  'update',
  'delete',
  'link',
  'unlink',
  'list',
]);

// ============================================================
// TYPES
// ============================================================

/**
 * Represents a location node in the graph
 */
interface Location {
  id: string;
  name: string;
  description: string;
  locationType?: z.infer<typeof LocationTypeSchema>;
  lighting?: z.infer<typeof LightingSchema>;
  hazards?: string[];
  tags?: string[];
  terrain?: z.infer<typeof TerrainSchema>;
  size?: z.infer<typeof LocationSizeSchema>;
  discovered: boolean;
  properties?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/**
 * Represents an edge/connection between locations
 */
interface LocationEdge {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  connectionType: z.infer<typeof ConnectionTypeSchema>;
  locked: boolean;
  lockDC?: number;
  hidden: boolean;
  findDC?: number;
  oneWay: boolean;
  description?: string;
}

// ============================================================
// STATE
// ============================================================

/** In-memory location storage */
const locationStore = new Map<string, Location>();

/** In-memory edge storage */
const edgeStore = new Map<string, LocationEdge>();

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Find location by ID or name
 */
function findLocation(idOrName: string): Location | undefined {
  // Try by ID first
  const byId = locationStore.get(idOrName);
  if (byId) return byId;

  // Try by name
  for (const location of locationStore.values()) {
    if (location.name.toLowerCase() === idOrName.toLowerCase()) {
      return location;
    }
  }

  return undefined;
}

/**
 * Get all edges connected to a location
 */
function getEdgesForLocation(locationId: string): LocationEdge[] {
  const edges: LocationEdge[] = [];
  for (const edge of edgeStore.values()) {
    if (edge.fromLocationId === locationId || edge.toLocationId === locationId) {
      edges.push(edge);
    }
  }
  return edges;
}

/**
 * Get the other end of an edge from a given location
 */
function getConnectedLocationId(edge: LocationEdge, fromLocationId: string): string {
  return edge.fromLocationId === fromLocationId ? edge.toLocationId : edge.fromLocationId;
}

/**
 * Check if a link already exists between two locations
 */
function linkExists(fromId: string, toId: string): boolean {
  for (const edge of edgeStore.values()) {
    if (
      (edge.fromLocationId === fromId && edge.toLocationId === toId) ||
      (edge.fromLocationId === toId && edge.toLocationId === fromId)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Find edge between two locations
 */
function findEdge(fromId: string, toId: string): LocationEdge | undefined {
  for (const edge of edgeStore.values()) {
    if (
      (edge.fromLocationId === fromId && edge.toLocationId === toId) ||
      (edge.fromLocationId === toId && edge.toLocationId === fromId)
    ) {
      return edge;
    }
  }
  return undefined;
}

/**
 * Remove all edges connected to a location
 */
function removeEdgesForLocation(locationId: string): void {
  const edgesToRemove: string[] = [];
  for (const [id, edge] of edgeStore.entries()) {
    if (edge.fromLocationId === locationId || edge.toLocationId === locationId) {
      edgesToRemove.push(id);
    }
  }
  for (const id of edgesToRemove) {
    edgeStore.delete(id);
  }
}

// ============================================================
// SCHEMAS FOR OPERATIONS
// ============================================================

const createOperationSchema = z.object({
  operation: z.literal('create'),
  name: z.string().min(1).max(MAX_NAME_LENGTH),
  description: z.string().optional().default(''),
  locationType: LocationTypeSchema.optional(),
  lighting: LightingSchema.optional(),
  hazards: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  terrain: TerrainSchema.optional(),
  size: LocationSizeSchema.optional(),
  discovered: z.boolean().optional().default(true),
  properties: z.record(z.unknown()).optional(),
});

const getOperationSchema = z.object({
  operation: z.literal('get'),
  locationId: z.string().optional(),
  name: z.string().optional(),
});

const updateOperationSchema = z.object({
  operation: z.literal('update'),
  locationId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  locationType: LocationTypeSchema.optional(),
  lighting: LightingSchema.optional(),
  hazards: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  terrain: TerrainSchema.optional(),
  size: LocationSizeSchema.optional(),
  discovered: z.boolean().optional(),
  properties: z.record(z.unknown()).optional(),
});

const deleteOperationSchema = z.object({
  operation: z.literal('delete'),
  locationId: z.string().optional(),
  name: z.string().optional(),
});

const linkOperationSchema = z.object({
  operation: z.literal('link'),
  fromLocationId: z.string(),
  toLocationId: z.string(),
  connectionType: ConnectionTypeSchema.optional().default('passage'),
  locked: z.boolean().optional().default(false),
  lockDC: z.number().min(1).max(30).optional(),
  hidden: z.boolean().optional().default(false),
  findDC: z.number().min(1).max(30).optional(),
  oneWay: z.boolean().optional().default(false),
  description: z.string().optional(),
});

const unlinkOperationSchema = z.object({
  operation: z.literal('unlink'),
  fromLocationId: z.string(),
  toLocationId: z.string(),
});

const listOperationSchema = z.object({
  operation: z.literal('list'),
  filterTag: z.string().optional(),
  filterType: LocationTypeSchema.optional(),
});

/** Combined schema for all operations */
export const manageLocationSchema = z.discriminatedUnion('operation', [
  createOperationSchema,
  getOperationSchema,
  updateOperationSchema,
  deleteOperationSchema,
  linkOperationSchema,
  unlinkOperationSchema,
  listOperationSchema,
]);

// ============================================================
// OPERATION HANDLERS
// ============================================================

/**
 * Create a new location
 */
function handleCreate(input: z.infer<typeof createOperationSchema>): string {
  const id = randomUUID();
  const now = Date.now();

  const location: Location = {
    id,
    name: input.name,
    description: input.description || '',
    locationType: input.locationType,
    lighting: input.lighting,
    hazards: input.hazards,
    tags: input.tags,
    terrain: input.terrain,
    size: input.size,
    discovered: input.discovered ?? true,
    properties: input.properties,
    createdAt: now,
    updatedAt: now,
  };

  locationStore.set(id, location);

  // Build output
  const lines: string[] = [];
  lines.push(`Name: ${location.name}`);
  lines.push(`ID: ${id}`);

  if (location.locationType) {
    lines.push(`Type: ${location.locationType}`);
  }
  if (location.lighting) {
    lines.push(`Lighting: ${location.lighting}`);
  }
  if (location.terrain) {
    lines.push(`Terrain: ${location.terrain}`);
  }
  if (location.size) {
    lines.push(`Size: ${location.size}`);
  }
  if (!location.discovered) {
    lines.push(`Status: undiscovered`);
  }
  if (location.hazards && location.hazards.length > 0) {
    lines.push(`Hazards: ${location.hazards.join(', ')}`);
  }
  if (location.tags && location.tags.length > 0) {
    lines.push(`Tags: ${location.tags.join(', ')}`);
  }
  if (location.description) {
    lines.push('');
    lines.push(`Description: ${location.description}`);
  }
  if (location.properties) {
    lines.push('');
    lines.push('Properties:');
    for (const [key, value] of Object.entries(location.properties)) {
      lines.push(`  ${key}: ${JSON.stringify(value)}`);
    }
  }

  return createBox('LOCATION CREATED', lines, DISPLAY_WIDTH);
}

/**
 * Get a location by ID or name
 */
function handleGet(input: z.infer<typeof getOperationSchema>): string {
  // Validate that at least one identifier is provided
  if (!input.locationId && !input.name) {
    return createBox('ERROR', ['Either locationId or name is required for get operation'], DISPLAY_WIDTH);
  }

  const location = findLocation(input.locationId || input.name || '');

  if (!location) {
    return createBox('ERROR', [`Location not found: ${input.locationId || input.name}`], DISPLAY_WIDTH);
  }

  // Get connected locations
  const edges = getEdgesForLocation(location.id);
  const connections: { location: Location; edge: LocationEdge }[] = [];

  for (const edge of edges) {
    const connectedId = getConnectedLocationId(edge, location.id);
    const connectedLocation = locationStore.get(connectedId);
    if (connectedLocation) {
      connections.push({ location: connectedLocation, edge });
    }
  }

  // Build output
  const lines: string[] = [];
  lines.push(`ID: ${location.id}`);

  if (location.locationType) {
    lines.push(`Type: ${location.locationType}`);
  }
  if (location.lighting) {
    lines.push(`Lighting: ${location.lighting}`);
  }
  if (location.terrain) {
    lines.push(`Terrain: ${location.terrain}`);
  }
  if (location.size) {
    lines.push(`Size: ${location.size}`);
  }
  if (!location.discovered) {
    lines.push(`Status: undiscovered`);
  }
  if (location.hazards && location.hazards.length > 0) {
    lines.push(`Hazards: ${location.hazards.join(', ')}`);
  }
  if (location.tags && location.tags.length > 0) {
    lines.push(`Tags: ${location.tags.join(', ')}`);
  }
  if (location.description) {
    lines.push('');
    lines.push(location.description);
  }
  if (location.properties) {
    lines.push('');
    lines.push('Properties:');
    for (const [key, value] of Object.entries(location.properties)) {
      lines.push(`  ${key}: ${JSON.stringify(value)}`);
    }
  }

  // Show connections
  if (connections.length > 0) {
    lines.push('');
    lines.push(BOX.LIGHT.H.repeat(DISPLAY_WIDTH - 4));
    lines.push('CONNECTIONS');
    lines.push('');

    for (const { location: connLoc, edge } of connections) {
      let connStr = `${ARROW} ${connLoc.name}`;
      connStr += ` (${edge.connectionType})`;
      if (edge.locked) {
        connStr += ` [locked DC ${edge.lockDC || '?'}]`;
      }
      if (edge.hidden) {
        connStr += ` [hidden]`;
      }
      if (edge.oneWay && edge.fromLocationId !== location.id) {
        connStr += ` [one-way from]`;
      } else if (edge.oneWay) {
        connStr += ` [one-way to]`;
      }
      lines.push(connStr);
    }
  }

  return createBox(location.name.toUpperCase(), lines, DISPLAY_WIDTH);
}

/**
 * Update a location
 */
function handleUpdate(input: z.infer<typeof updateOperationSchema>): string {
  // Validate that locationId is provided
  if (!input.locationId) {
    return createBox('ERROR', ['locationId is required for update operation'], DISPLAY_WIDTH);
  }

  const location = findLocation(input.locationId || '');

  if (!location) {
    return createBox('ERROR', [`Location not found: ${input.locationId}`], DISPLAY_WIDTH);
  }

  // Track changes
  const changes: string[] = [];

  if (input.name !== undefined && input.name !== location.name) {
    changes.push(`Name: ${location.name} ${ARROW} ${input.name}`);
    location.name = input.name;
  }
  if (input.description !== undefined && input.description !== location.description) {
    changes.push(`Description: Updated`);
    location.description = input.description;
  }
  if (input.locationType !== undefined && input.locationType !== location.locationType) {
    changes.push(`Type: ${location.locationType || 'none'} ${ARROW} ${input.locationType}`);
    location.locationType = input.locationType;
  }
  if (input.lighting !== undefined && input.lighting !== location.lighting) {
    changes.push(`Lighting: ${location.lighting || 'none'} ${ARROW} ${input.lighting}`);
    location.lighting = input.lighting;
  }
  if (input.terrain !== undefined && input.terrain !== location.terrain) {
    changes.push(`Terrain: ${location.terrain || 'none'} ${ARROW} ${input.terrain}`);
    location.terrain = input.terrain;
  }
  if (input.size !== undefined && input.size !== location.size) {
    changes.push(`Size: ${location.size || 'none'} ${ARROW} ${input.size}`);
    location.size = input.size;
  }
  if (input.discovered !== undefined && input.discovered !== location.discovered) {
    changes.push(`Status: ${location.discovered ? 'discovered' : 'undiscovered'} ${ARROW} ${input.discovered ? 'discovered' : 'undiscovered'}`);
    location.discovered = input.discovered;
  }
  if (input.hazards !== undefined) {
    changes.push(`Hazards: ${input.hazards.join(', ')}`);
    location.hazards = input.hazards;
  }
  if (input.tags !== undefined) {
    changes.push(`Tags: ${input.tags.join(', ')}`);
    location.tags = input.tags;
  }
  if (input.properties !== undefined) {
    changes.push(`Properties: Updated`);
    location.properties = { ...location.properties, ...input.properties };
  }

  location.updatedAt = Date.now();

  // Build output
  const lines: string[] = [];
  lines.push(`Name: ${location.name}`);
  lines.push(`ID: ${location.id}`);
  lines.push('');

  if (changes.length > 0) {
    lines.push('Changes:');
    for (const change of changes) {
      lines.push(`  ${ARROW} ${change}`);
    }
  }

  if (location.properties) {
    lines.push('');
    lines.push('Current Properties:');
    for (const [key, value] of Object.entries(location.properties)) {
      lines.push(`  ${key}: ${JSON.stringify(value)}`);
    }
  }

  return createBox('LOCATION UPDATED', lines, DISPLAY_WIDTH);
}

/**
 * Delete a location
 */
function handleDelete(input: z.infer<typeof deleteOperationSchema>): string {
  // Validate that at least one identifier is provided
  if (!input.locationId && !input.name) {
    return createBox('ERROR', ['Either locationId or name is required for delete operation'], DISPLAY_WIDTH);
  }

  const location = findLocation(input.locationId || input.name || '');

  if (!location) {
    return createBox('ERROR', [`Location not found: ${input.locationId || input.name}`], DISPLAY_WIDTH);
  }

  // Remove edges first
  removeEdgesForLocation(location.id);

  // Remove location
  locationStore.delete(location.id);

  // Build output
  const lines: string[] = [];
  lines.push(`Name: ${location.name}`);
  lines.push(`ID: ${location.id}`);

  return createBox('LOCATION DELETED', lines, DISPLAY_WIDTH);
}

/**
 * Link two locations
 */
function handleLink(input: z.infer<typeof linkOperationSchema>): string {
  const fromLocation = findLocation(input.fromLocationId);
  const toLocation = findLocation(input.toLocationId);

  if (!fromLocation) {
    return createBox('ERROR', [`From location not found: ${input.fromLocationId}`], DISPLAY_WIDTH);
  }

  if (!toLocation) {
    return createBox('ERROR', [`To location not found: ${input.toLocationId}`], DISPLAY_WIDTH);
  }

  if (input.fromLocationId === input.toLocationId) {
    return createBox('ERROR', ['Cannot link a location to itself'], DISPLAY_WIDTH);
  }

  if (linkExists(fromLocation.id, toLocation.id)) {
    return createBox('ERROR', ['Link already exists between these locations'], DISPLAY_WIDTH);
  }

  const edgeId = randomUUID();
  const edge: LocationEdge = {
    id: edgeId,
    fromLocationId: fromLocation.id,
    toLocationId: toLocation.id,
    connectionType: input.connectionType || 'passage',
    locked: input.locked || false,
    lockDC: input.lockDC,
    hidden: input.hidden || false,
    findDC: input.findDC,
    oneWay: input.oneWay || false,
    description: input.description,
  };

  edgeStore.set(edgeId, edge);

  // Build output
  const lines: string[] = [];
  lines.push(`${fromLocation.name} ${ARROW}${ARROW} ${toLocation.name}`);
  lines.push('');
  lines.push(`Connection: ${edge.connectionType}`);

  if (edge.locked) {
    lines.push(`Status: locked (DC ${edge.lockDC || '?'})`);
  }
  if (edge.hidden) {
    lines.push(`Visibility: hidden (DC ${edge.findDC || '?'} to find)`);
  }
  if (edge.oneWay) {
    lines.push(`Direction: one-way`);
  }
  if (edge.description) {
    lines.push('');
    lines.push(`Description: ${edge.description}`);
  }

  return createBox('LOCATIONS LINKED', lines, DISPLAY_WIDTH);
}

/**
 * Unlink two locations
 */
function handleUnlink(input: z.infer<typeof unlinkOperationSchema>): string {
  const fromLocation = findLocation(input.fromLocationId);
  const toLocation = findLocation(input.toLocationId);

  if (!fromLocation) {
    return createBox('ERROR', [`From location not found: ${input.fromLocationId}`], DISPLAY_WIDTH);
  }

  if (!toLocation) {
    return createBox('ERROR', [`To location not found: ${input.toLocationId}`], DISPLAY_WIDTH);
  }

  const edge = findEdge(fromLocation.id, toLocation.id);

  if (!edge) {
    return createBox('ERROR', ['No link found between these locations'], DISPLAY_WIDTH);
  }

  edgeStore.delete(edge.id);

  // Build output
  const lines: string[] = [];
  lines.push(`${fromLocation.name} X ${toLocation.name}`);

  return createBox('LOCATIONS UNLINKED', lines, DISPLAY_WIDTH);
}

/**
 * List all locations
 */
function handleList(input: z.infer<typeof listOperationSchema>): string {
  let locations = Array.from(locationStore.values());

  // Apply filters
  if (input.filterTag) {
    locations = locations.filter((loc) =>
      loc.tags?.some((tag) => tag.toLowerCase() === input.filterTag!.toLowerCase())
    );
  }
  if (input.filterType) {
    locations = locations.filter((loc) => loc.locationType === input.filterType);
  }

  // Build output
  const lines: string[] = [];

  if (locations.length === 0) {
    lines.push('No locations found.');
  } else {
    lines.push(`Total: ${locations.length} location${locations.length !== 1 ? 's' : ''}`);
    lines.push('');

    for (const loc of locations) {
      let locLine = `${BULLET} ${loc.name}`;
      if (loc.locationType) {
        locLine += ` [${loc.locationType}]`;
      }
      if (!loc.discovered) {
        locLine += ` (undiscovered)`;
      }
      lines.push(locLine);

      // Show connection count
      const edgeCount = getEdgesForLocation(loc.id).length;
      if (edgeCount > 0) {
        lines.push(`    ${edgeCount} connection${edgeCount !== 1 ? 's' : ''}`);
      }
    }
  }

  return createBox('LOCATION LIST', lines, DISPLAY_WIDTH);
}

// ============================================================
// MAIN HANDLER
// ============================================================

/**
 * Main handler for manage_location tool
 */
export async function manageLocation(input: unknown): Promise<{ content: { type: 'text'; text: string }[] }> {
  try {
    const parsed = manageLocationSchema.parse(input);

    let result: string;

    switch (parsed.operation) {
      case 'create':
        result = handleCreate(parsed);
        break;
      case 'get':
        result = handleGet(parsed);
        break;
      case 'update':
        result = handleUpdate(parsed);
        break;
      case 'delete':
        result = handleDelete(parsed);
        break;
      case 'link':
        result = handleLink(parsed);
        break;
      case 'unlink':
        result = handleUnlink(parsed);
        break;
      case 'list':
        result = handleList(parsed);
        break;
      default:
        result = createBox('ERROR', ['Unknown operation'], DISPLAY_WIDTH);
    }

    return { content: [{ type: 'text' as const, text: result }] };
  } catch (error) {
    const lines: string[] = [];

    if (error instanceof z.ZodError) {
      for (const issue of error.issues) {
        lines.push(`${issue.path.join('.')}: ${issue.message}`);
      }
    } else if (error instanceof Error) {
      lines.push(error.message);
    } else {
      lines.push('An unknown error occurred');
    }

    return { content: [{ type: 'text' as const, text: createBox('ERROR', lines, DISPLAY_WIDTH) }] };
  }
}

// ============================================================
// PARTY STATE
// ============================================================

/** Party location state */
interface PartyState {
  currentLocationId: string | null;
  history: { locationId: string; timestamp: number }[];
  discoveredHiddenEdges: Set<string>;
}

/** In-memory party state */
let partyState: PartyState = {
  currentLocationId: null,
  history: [],
  discoveredHiddenEdges: new Set(),
};

// ============================================================
// MOVE_PARTY SCHEMAS
// ============================================================

/** Operation types for move_party */
const MovePartyOperationSchema = z.enum(['move', 'status', 'history']);

/** Move operation schema */
const moveOperationSchema = z.object({
  operation: z.literal('move').optional().default('move'),
  toLocationId: z.string().optional(),
  toLocationName: z.string().optional(),
  force: z.boolean().optional().default(false),
  unlocked: z.boolean().optional().default(false),
  discovered: z.boolean().optional().default(false),
});

/** Status operation schema */
const statusOperationSchema = z.object({
  operation: z.literal('status'),
  showHidden: z.boolean().optional().default(false),
});

/** History operation schema */
const historyOperationSchema = z.object({
  operation: z.literal('history'),
});

/** Combined schema for move_party */
export const movePartySchema = z.union([
  moveOperationSchema,
  statusOperationSchema,
  historyOperationSchema,
]);

// ============================================================
// MOVE_PARTY HANDLERS
// ============================================================

/**
 * Get edge between current location and target
 */
function getEdgeBetween(fromId: string, toId: string): LocationEdge | undefined {
  for (const edge of edgeStore.values()) {
    if (
      (edge.fromLocationId === fromId && edge.toLocationId === toId) ||
      (!edge.oneWay && edge.fromLocationId === toId && edge.toLocationId === fromId)
    ) {
      return edge;
    }
  }
  return undefined;
}

/**
 * Check if edge is traversable from current location
 */
function isEdgeTraversable(edge: LocationEdge, fromId: string): boolean {
  // One-way check
  if (edge.oneWay && edge.fromLocationId !== fromId) {
    return false;
  }
  return true;
}

/**
 * Handle move operation
 */
function handleMove(input: z.infer<typeof moveOperationSchema>): string {
  // Validate input
  if (!input.toLocationId && !input.toLocationName) {
    return createBox('ERROR', ['Either toLocationId or toLocationName is required'], DISPLAY_WIDTH);
  }

  // Find target location
  const target = findLocation(input.toLocationId || input.toLocationName || '');
  if (!target) {
    return createBox('ERROR', [`Location not found: ${input.toLocationId || input.toLocationName}`], DISPLAY_WIDTH);
  }

  // Check if already at target
  if (partyState.currentLocationId === target.id) {
    return createBox('ALREADY HERE', [`The party is already at ${target.name}.`], DISPLAY_WIDTH);
  }

  // Get current location
  const current = partyState.currentLocationId ? locationStore.get(partyState.currentLocationId) : null;

  // If no current location or force, just place the party
  if (!current || input.force) {
    partyState.currentLocationId = target.id;
    partyState.history.push({ locationId: target.id, timestamp: Date.now() });

    const lines: string[] = [];
    lines.push(`Location: ${target.name}`);
    if (target.locationType) {
      lines.push(`Type: ${target.locationType}`);
    }
    if (target.lighting) {
      lines.push(`Lighting: ${target.lighting}`);
    }
    if (target.description) {
      lines.push('');
      lines.push(target.description);
    }

    // Show exits
    const exits = getExitsForLocation(target.id, false);
    if (exits.length > 0) {
      lines.push('');
      lines.push('Exits:');
      for (const exit of exits) {
        lines.push(`  ${ARROW} ${exit.locationName} (${exit.connectionType})`);
      }
    }

    return createBox('PARTY ARRIVED', lines, DISPLAY_WIDTH);
  }

  // Check if connected
  const edge = getEdgeBetween(current.id, target.id);
  if (!edge) {
    return createBox('CANNOT TRAVEL', [`${target.name} is not connected to ${current.name}.`], DISPLAY_WIDTH);
  }

  // Check one-way
  if (!isEdgeTraversable(edge, current.id)) {
    return createBox('ONE-WAY PATH', [`Cannot travel back through this one-way passage.`], DISPLAY_WIDTH);
  }

  // Check locked
  if (edge.locked && !input.unlocked) {
    const lines: string[] = [];
    lines.push(`The ${edge.connectionType} to ${target.name} is locked.`);
    if (edge.lockDC) {
      lines.push(`Lock DC: ${edge.lockDC}`);
    }
    lines.push('');
    lines.push('Use unlocked: true to bypass the lock.');
    return createBox('LOCKED', lines, DISPLAY_WIDTH);
  }

  // Check hidden
  if (edge.hidden && !input.discovered && !partyState.discoveredHiddenEdges.has(edge.id)) {
    return createBox('CANNOT TRAVEL', [`No visible path to ${target.name} from here.`], DISPLAY_WIDTH);
  }

  // Mark hidden edge as discovered if using discovered flag
  if (edge.hidden && input.discovered) {
    partyState.discoveredHiddenEdges.add(edge.id);
  }

  // Perform the move
  const previousLocation = current.name;
  partyState.currentLocationId = target.id;
  partyState.history.push({ locationId: target.id, timestamp: Date.now() });

  // Build output
  const lines: string[] = [];
  lines.push(`From: ${previousLocation}`);
  lines.push(`To: ${target.name}`);
  lines.push(`Via: ${edge.connectionType}`);

  if (target.locationType) {
    lines.push(`Type: ${target.locationType}`);
  }
  if (target.lighting) {
    lines.push(`Lighting: ${target.lighting}`);
  }
  if (target.description) {
    lines.push('');
    lines.push(target.description);
  }

  // Show exits
  const exits = getExitsForLocation(target.id, false);
  if (exits.length > 0) {
    lines.push('');
    lines.push('Exits:');
    for (const exit of exits) {
      lines.push(`  ${ARROW} ${exit.locationName} (${exit.connectionType})`);
    }
  }

  return createBox('PARTY MOVED', lines, DISPLAY_WIDTH);
}

/**
 * Get exits for a location
 */
interface Exit {
  locationId: string;
  locationName: string;
  connectionType: string;
  locked: boolean;
  hidden: boolean;
  oneWay: boolean;
}

function getExitsForLocation(locationId: string, showHidden: boolean): Exit[] {
  const exits: Exit[] = [];

  for (const edge of edgeStore.values()) {
    let targetId: string | null = null;

    // Check if this edge connects from current location
    if (edge.fromLocationId === locationId) {
      targetId = edge.toLocationId;
    } else if (edge.toLocationId === locationId && !edge.oneWay) {
      targetId = edge.fromLocationId;
    }

    if (targetId) {
      const targetLoc = locationStore.get(targetId);
      if (targetLoc) {
        // Skip hidden unless showHidden or discovered
        if (edge.hidden && !showHidden && !partyState.discoveredHiddenEdges.has(edge.id)) {
          continue;
        }

        exits.push({
          locationId: targetId,
          locationName: targetLoc.name,
          connectionType: edge.connectionType,
          locked: edge.locked,
          hidden: edge.hidden,
          oneWay: edge.oneWay,
        });
      }
    }
  }

  return exits;
}

/**
 * Handle status operation
 */
function handlePartyStatus(input: z.infer<typeof statusOperationSchema>): string {
  if (!partyState.currentLocationId) {
    return createBox('PARTY STATUS', ['The party has not been placed at any location.'], DISPLAY_WIDTH);
  }

  const current = locationStore.get(partyState.currentLocationId);
  if (!current) {
    return createBox('ERROR', ['Current location no longer exists.'], DISPLAY_WIDTH);
  }

  const lines: string[] = [];
  lines.push(`Current Location: ${current.name}`);

  if (current.locationType) {
    lines.push(`Type: ${current.locationType}`);
  }
  if (current.lighting) {
    lines.push(`Lighting: ${current.lighting}`);
  }
  if (current.hazards && current.hazards.length > 0) {
    lines.push(`Hazards: ${current.hazards.join(', ')}`);
  }
  if (current.description) {
    lines.push('');
    lines.push(current.description);
  }

  // Show exits
  const exits = getExitsForLocation(current.id, input.showHidden);
  if (exits.length > 0) {
    lines.push('');
    lines.push(BOX.LIGHT.H.repeat(DISPLAY_WIDTH - 4));
    lines.push('AVAILABLE EXITS');
    lines.push('');

    for (const exit of exits) {
      let exitStr = `${ARROW} ${exit.locationName} (${exit.connectionType})`;
      if (exit.locked) {
        exitStr += ' [locked]';
      }
      if (exit.hidden) {
        exitStr += ' [hidden]';
      }
      lines.push(exitStr);
    }
  } else {
    lines.push('');
    lines.push('No exits available. The party is trapped!');
  }

  return createBox('PARTY STATUS', lines, DISPLAY_WIDTH);
}

/**
 * Handle history operation
 */
function handlePartyHistory(): string {
  if (partyState.history.length === 0) {
    return createBox('TRAVEL HISTORY', ['No travel history yet.'], DISPLAY_WIDTH);
  }

  const lines: string[] = [];
  lines.push(`Total moves: ${partyState.history.length}`);
  lines.push('');

  for (let i = 0; i < partyState.history.length; i++) {
    const entry = partyState.history[i];
    const location = locationStore.get(entry.locationId);
    const name = location ? location.name : '[deleted location]';
    lines.push(`${i + 1}. ${name}`);
  }

  return createBox('TRAVEL HISTORY', lines, DISPLAY_WIDTH);
}

/**
 * Main handler for move_party tool
 */
export async function moveParty(input: unknown): Promise<{ content: { type: 'text'; text: string }[] }> {
  try {
    const parsed = movePartySchema.parse(input);

    let result: string;

    // Determine operation type
    const op = (parsed as any).operation || 'move';

    switch (op) {
      case 'move':
        result = handleMove(parsed as z.infer<typeof moveOperationSchema>);
        break;
      case 'status':
        result = handlePartyStatus(parsed as z.infer<typeof statusOperationSchema>);
        break;
      case 'history':
        result = handlePartyHistory();
        break;
      default:
        result = createBox('ERROR', ['Unknown operation'], DISPLAY_WIDTH);
    }

    return { content: [{ type: 'text' as const, text: result }] };
  } catch (error) {
    const lines: string[] = [];

    if (error instanceof z.ZodError) {
      for (const issue of error.issues) {
        lines.push(`${issue.path.join('.')}: ${issue.message}`);
      }
    } else if (error instanceof Error) {
      lines.push(error.message);
    } else {
      lines.push('An unknown error occurred');
    }

    return { content: [{ type: 'text' as const, text: createBox('ERROR', lines, DISPLAY_WIDTH) }] };
  }
}

// ============================================================
// MANAGE_PARTY
// ============================================================

/** Party role types */
const PartyRoleSchema = z.enum([
  'leader',
  'scout',
  'healer',
  'tank',
  'support',
  'damage',
  'utility',
  'other',
]);

/** Party member data */
interface PartyMember {
  characterId: string;
  role?: z.infer<typeof PartyRoleSchema>;
  addedAt: number;
}

/** In-memory party member storage */
const partyMemberStore = new Map<string, PartyMember>();

// ============================================================
// MANAGE_PARTY SCHEMAS
// ============================================================

/** Add operation schema */
const addPartyOperationSchema = z.object({
  operation: z.literal('add'),
  characterId: z.string().optional(),
  characterName: z.string().optional(),
  role: PartyRoleSchema.optional(),
});

/** Remove operation schema */
const removePartyOperationSchema = z.object({
  operation: z.literal('remove'),
  characterId: z.string().optional(),
  characterName: z.string().optional(),
});

/** List operation schema */
const listPartyOperationSchema = z.object({
  operation: z.literal('list'),
});

/** Get operation schema */
const getPartyMemberOperationSchema = z.object({
  operation: z.literal('get'),
  characterId: z.string().optional(),
  characterName: z.string().optional(),
});

/** Set role operation schema */
const setRoleOperationSchema = z.object({
  operation: z.literal('set_role'),
  characterId: z.string().optional(),
  characterName: z.string().optional(),
  role: PartyRoleSchema.optional(),
});

/** Clear operation schema */
const clearPartyOperationSchema = z.object({
  operation: z.literal('clear'),
});

/** Combined schema for manage_party */
export const managePartySchema = z.discriminatedUnion('operation', [
  addPartyOperationSchema,
  removePartyOperationSchema,
  listPartyOperationSchema,
  getPartyMemberOperationSchema,
  setRoleOperationSchema,
  clearPartyOperationSchema,
]);

// ============================================================
// MANAGE_PARTY HELPER FUNCTIONS
// ============================================================

/**
 * Resolve character ID from either characterId or characterName
 */
function resolveCharacterId(characterId?: string, characterName?: string): { id: string | null; error?: string } {
  if (characterId) {
    // Verify character exists
    const result = getCharacter({ characterId });
    if (result.success) {
      return { id: characterId };
    }
    return { id: null, error: `Character not found: ${characterId}` };
  }

  if (characterName) {
    // Look up by name
    const result = getCharacter({ characterName });
    if (result.success && result.character) {
      return { id: result.character.id };
    }
    return { id: null, error: `Character not found: ${characterName}` };
  }

  return { id: null, error: 'Either characterId or characterName is required' };
}

/**
 * Find party member by character ID
 */
function findPartyMember(characterId: string): PartyMember | undefined {
  return partyMemberStore.get(characterId);
}

/**
 * Find party member by name
 */
function findPartyMemberByName(characterName: string): PartyMember | undefined {
  const result = getCharacter({ characterName });
  if (result.success && result.character) {
    return partyMemberStore.get(result.character.id);
  }
  return undefined;
}

// ============================================================
// MANAGE_PARTY OPERATION HANDLERS
// ============================================================

/**
 * Handle add operation
 */
function handlePartyAdd(input: z.infer<typeof addPartyOperationSchema>): string {
  const resolved = resolveCharacterId(input.characterId, input.characterName);

  if (!resolved.id) {
    return createBox('ERROR', [resolved.error || 'Character not found'], DISPLAY_WIDTH);
  }

  // Check if already in party
  if (partyMemberStore.has(resolved.id)) {
    const charResult = getCharacter({ characterId: resolved.id });
    const name = charResult.character?.name || resolved.id;
    return createBox('ERROR', [`${name} is already in the party.`], DISPLAY_WIDTH);
  }

  // Add to party
  const member: PartyMember = {
    characterId: resolved.id,
    role: input.role,
    addedAt: Date.now(),
  };
  partyMemberStore.set(resolved.id, member);

  // Get character info for display
  const charResult = getCharacter({ characterId: resolved.id });
  const character = charResult.character;

  const lines: string[] = [];
  lines.push(`Name: ${character?.name || resolved.id}`);
  if (character) {
    lines.push(`Class: ${character.class} (Level ${character.level})`);
  }
  if (input.role) {
    lines.push(`Role: ${input.role}`);
  }
  lines.push('');
  lines.push(`Party size: ${partyMemberStore.size}`);

  return createBox('PARTY MEMBER ADDED', lines, DISPLAY_WIDTH);
}

/**
 * Handle remove operation
 */
function handlePartyRemove(input: z.infer<typeof removePartyOperationSchema>): string {
  const resolved = resolveCharacterId(input.characterId, input.characterName);

  // For remove, we allow removal even if character is deleted
  // First try direct ID
  let targetId = input.characterId;
  if (!targetId && input.characterName) {
    const result = getCharacter({ characterName: input.characterName });
    if (result.success && result.character) {
      targetId = result.character.id;
    }
  }

  // Check if neither provided
  if (!input.characterId && !input.characterName) {
    return createBox('ERROR', ['Either characterId or characterName is required'], DISPLAY_WIDTH);
  }

  // Try to find in party store by either method
  let member: PartyMember | undefined;
  let memberId: string | undefined;

  if (targetId && partyMemberStore.has(targetId)) {
    member = partyMemberStore.get(targetId);
    memberId = targetId;
  } else if (input.characterName) {
    // Search by name in store
    for (const [id, m] of partyMemberStore.entries()) {
      const charResult = getCharacter({ characterId: id });
      if (charResult.success && charResult.character?.name.toLowerCase() === input.characterName.toLowerCase()) {
        member = m;
        memberId = id;
        break;
      }
    }
  }

  if (!member || !memberId) {
    const identifier = input.characterName || input.characterId;
    return createBox('ERROR', [`${identifier} is not in the party.`], DISPLAY_WIDTH);
  }

  // Get name before removing
  const charResult = getCharacter({ characterId: memberId });
  const name = charResult.character?.name || memberId;

  partyMemberStore.delete(memberId);

  const lines: string[] = [];
  lines.push(`Name: ${name}`);
  lines.push('');
  lines.push(`Party size: ${partyMemberStore.size}`);

  return createBox('PARTY MEMBER REMOVED', lines, DISPLAY_WIDTH);
}

/**
 * Handle list operation
 */
function handlePartyList(): string {
  const lines: string[] = [];

  if (partyMemberStore.size === 0) {
    lines.push('No party members.');
    return createBox('PARTY ROSTER', lines, DISPLAY_WIDTH);
  }

  lines.push(`Total: ${partyMemberStore.size} member${partyMemberStore.size !== 1 ? 's' : ''}`);
  lines.push('');

  for (const [id, member] of partyMemberStore.entries()) {
    const charResult = getCharacter({ characterId: id });

    if (charResult.success && charResult.character) {
      const char = charResult.character;
      let memberLine = `${BULLET} ${char.name}`;
      memberLine += ` - ${char.class} ${char.level}`;
      if (member.role) {
        memberLine += ` [${member.role}]`;
      }
      lines.push(memberLine);
    } else {
      // Character was deleted
      let memberLine = `${BULLET} [deleted character]`;
      if (member.role) {
        memberLine += ` [${member.role}]`;
      }
      lines.push(memberLine);
    }
  }

  return createBox('PARTY ROSTER', lines, DISPLAY_WIDTH);
}

/**
 * Handle get operation
 */
function handlePartyGet(input: z.infer<typeof getPartyMemberOperationSchema>): string {
  if (!input.characterId && !input.characterName) {
    return createBox('ERROR', ['Either characterId or characterName is required'], DISPLAY_WIDTH);
  }

  // Find the party member
  let member: PartyMember | undefined;
  let memberId: string | undefined;

  if (input.characterId && partyMemberStore.has(input.characterId)) {
    member = partyMemberStore.get(input.characterId);
    memberId = input.characterId;
  } else if (input.characterName) {
    for (const [id, m] of partyMemberStore.entries()) {
      const charResult = getCharacter({ characterId: id });
      if (charResult.success && charResult.character?.name.toLowerCase() === input.characterName.toLowerCase()) {
        member = m;
        memberId = id;
        break;
      }
    }
  }

  if (!member || !memberId) {
    const identifier = input.characterName || input.characterId;
    return createBox('ERROR', [`${identifier} is not in the party.`], DISPLAY_WIDTH);
  }

  // Get character details
  const charResult = getCharacter({ characterId: memberId });

  const lines: string[] = [];
  if (charResult.success && charResult.character) {
    const char = charResult.character;
    lines.push(`Name: ${char.name}`);
    lines.push(`Class: ${char.class}`);
    lines.push(`Level: ${char.level}`);
    if (member.role) {
      lines.push(`Role: ${member.role}`);
    }
    lines.push('');
    lines.push(`HP: ${char.hp}/${char.maxHp}`);
    lines.push(`AC: ${char.ac}`);
  } else {
    lines.push('Character data unavailable (may have been deleted).');
    if (member.role) {
      lines.push(`Role: ${member.role}`);
    }
  }

  return createBox('PARTY MEMBER', lines, DISPLAY_WIDTH);
}

/**
 * Handle set_role operation
 */
function handlePartySetRole(input: z.infer<typeof setRoleOperationSchema>): string {
  if (!input.characterId && !input.characterName) {
    return createBox('ERROR', ['Either characterId or characterName is required'], DISPLAY_WIDTH);
  }

  if (!input.role) {
    return createBox('ERROR', ['role is required for set_role operation'], DISPLAY_WIDTH);
  }

  // Find the party member
  let member: PartyMember | undefined;
  let memberId: string | undefined;

  if (input.characterId && partyMemberStore.has(input.characterId)) {
    member = partyMemberStore.get(input.characterId);
    memberId = input.characterId;
  } else if (input.characterName) {
    for (const [id, m] of partyMemberStore.entries()) {
      const charResult = getCharacter({ characterId: id });
      if (charResult.success && charResult.character?.name.toLowerCase() === input.characterName.toLowerCase()) {
        member = m;
        memberId = id;
        break;
      }
    }
  }

  if (!member || !memberId) {
    const identifier = input.characterName || input.characterId;
    return createBox('ERROR', [`${identifier} is not in the party.`], DISPLAY_WIDTH);
  }

  const oldRole = member.role || 'none';
  member.role = input.role;

  // Get character name for display
  const charResult = getCharacter({ characterId: memberId });
  const name = charResult.character?.name || memberId;

  const lines: string[] = [];
  lines.push(`Name: ${name}`);
  lines.push(`Role: ${oldRole} ${ARROW} ${input.role}`);

  return createBox('ROLE UPDATED', lines, DISPLAY_WIDTH);
}

/**
 * Handle clear operation
 */
function handlePartyClear(): string {
  const count = partyMemberStore.size;
  partyMemberStore.clear();

  const lines: string[] = [];
  lines.push(`${count} member${count !== 1 ? 's' : ''} removed from party.`);

  return createBox('PARTY CLEARED', lines, DISPLAY_WIDTH);
}

// ============================================================
// MANAGE_PARTY MAIN HANDLER
// ============================================================

/**
 * Main handler for manage_party tool
 */
export async function manageParty(input: unknown): Promise<{ content: { type: 'text'; text: string }[] }> {
  try {
    const parsed = managePartySchema.parse(input);

    let result: string;

    switch (parsed.operation) {
      case 'add':
        result = handlePartyAdd(parsed);
        break;
      case 'remove':
        result = handlePartyRemove(parsed);
        break;
      case 'list':
        result = handlePartyList();
        break;
      case 'get':
        result = handlePartyGet(parsed);
        break;
      case 'set_role':
        result = handlePartySetRole(parsed);
        break;
      case 'clear':
        result = handlePartyClear();
        break;
      default:
        result = createBox('ERROR', ['Unknown operation'], DISPLAY_WIDTH);
    }

    return { content: [{ type: 'text' as const, text: result }] };
  } catch (error) {
    const lines: string[] = [];

    if (error instanceof z.ZodError) {
      for (const issue of error.issues) {
        lines.push(`${issue.path.join('.')}: ${issue.message}`);
      }
    } else if (error instanceof Error) {
      lines.push(error.message);
    } else {
      lines.push('An unknown error occurred');
    }

    return { content: [{ type: 'text' as const, text: createBox('ERROR', lines, DISPLAY_WIDTH) }] };
  }
}

// ============================================================
// EXPORTS
// ============================================================

/**
 * Clear all locations and edges (for testing)
 */
export function clearAllLocations(): void {
  locationStore.clear();
  edgeStore.clear();
}

/**
 * Clear party state (for testing)
 */
export function clearPartyState(): void {
  partyState = {
    currentLocationId: null,
    history: [],
    discoveredHiddenEdges: new Set(),
  };
}

/**
 * Get location by ID (for other modules)
 */
export function getLocation(locationId: string): Location | undefined {
  return locationStore.get(locationId);
}

/**
 * Get all locations (for other modules)
 */
export function getAllLocations(): Location[] {
  return Array.from(locationStore.values());
}

/**
 * Get current party location ID (for other modules)
 */
export function getPartyLocationId(): string | null {
  return partyState.currentLocationId;
}

/**
 * Clear party members (for testing)
 */
export function clearPartyMembers(): void {
  partyMemberStore.clear();
}
