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
import { fuzzyEnum } from '../fuzzy-enum.js';
import {
  LocationNode,
  LocationEdge,
  LocationGraph,
  LocationType,
  LocationTypeSchema,
  Light,
  LightSchema,
  TerrainType,
  TerrainTypeSchema,
  Size,
  SizeSchema,
  ConnectionType,
  ConnectionTypeSchema,
  PartyMember,
  PartyState,
  PartyRole,
  PartyRoleSchema,
} from '../types.js';

// ============================================================
// CONSTANTS
// ============================================================

/** Standard display width for ASCII output */
const DISPLAY_WIDTH = 50;

/** Maximum name length */
const MAX_NAME_LENGTH = 100;

/** Arrow symbol for connections */
const ARROW = 'â†’';

/** Bullet symbol for lists */
const BULLET = 'â€¢';

// ============================================================
// SCHEMAS
// ============================================================

/** Operation types for manage_location */
const LocationOperationSchema = fuzzyEnum([
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
 * Extended location node with persistence timestamps.
 * Extends LocationNode from types.ts with createdAt/updatedAt.
 */
interface Location extends LocationNode {
  createdAt: number;
  updatedAt: number;
}

/**
 * Extended location edge with ID for persistence.
 * Extends LocationEdge from types.ts with id field.
 */
interface StoredLocationEdge extends LocationEdge {
  id: string;
}

// ============================================================
// STATE
// ============================================================

/** In-memory location storage */
const locationStore = new Map<string, Location>();

/** In-memory edge storage */
const edgeStore = new Map<string, StoredLocationEdge>();

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
function getEdgesForLocation(locationId: string): StoredLocationEdge[] {
  const edges: StoredLocationEdge[] = [];
  for (const edge of edgeStore.values()) {
    if (edge.fromId === locationId || edge.toId === locationId) {
      edges.push(edge);
    }
  }
  return edges;
}

/**
 * Get the other end of an edge from a given location
 */
function getConnectedLocationId(edge: StoredLocationEdge, fromLocationId: string): string {
  return edge.fromId === fromLocationId ? edge.toId : edge.fromId;
}

/**
 * Check if a link already exists between two locations
 */
function linkExists(fromId: string, toId: string): boolean {
  for (const edge of edgeStore.values()) {
    if (
      (edge.fromId === fromId && edge.toId === toId) ||
      (edge.fromId === toId && edge.toId === fromId)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Find edge between two locations
 */
function findEdge(fromId: string, toId: string): StoredLocationEdge | undefined {
  for (const edge of edgeStore.values()) {
    if (
      (edge.fromId === fromId && edge.toId === toId) ||
      (edge.fromId === toId && edge.toId === fromId)
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
    if (edge.fromId === locationId || edge.toId === locationId) {
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
  lighting: LightSchema.optional(),
  hazards: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  terrain: TerrainTypeSchema.optional(),
  size: SizeSchema.optional(),
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
  lighting: LightSchema.optional(),
  hazards: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  terrain: TerrainTypeSchema.optional(),
  size: SizeSchema.optional(),
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
    locationType: input.locationType || 'room',
    lighting: input.lighting || 'dim',
    hazards: input.hazards || [],
    tags: input.tags || [],
    terrain: input.terrain,
    size: input.size,
    discovered: input.discovered ?? true,
    properties: input.properties || {},
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
      if (edge.oneWay && edge.fromId !== location.id) {
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
  const edge: StoredLocationEdge = {
    id: edgeId,
    fromId: fromLocation.id,
    toId: toLocation.id,
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
// PARTY LOCATION STATE
// ============================================================

/** Party location state (for tracking party movement through locations) */
interface PartyLocationState {
  currentLocationId: string | null;
  history: { locationId: string; timestamp: number }[];
  discoveredHiddenEdges: Set<string>;
}

/** In-memory party location state */
let partyState: PartyLocationState = {
  currentLocationId: null,
  history: [],
  discoveredHiddenEdges: new Set(),
};

// ============================================================
// MOVE_PARTY SCHEMAS
// ============================================================

/** Operation types for move_party */
const MovePartyOperationSchema = fuzzyEnum(['move', 'status', 'history'] as const);

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
function getEdgeBetween(fromId: string, toId: string): StoredLocationEdge | undefined {
  for (const edge of edgeStore.values()) {
    if (
      (edge.fromId === fromId && edge.toId === toId) ||
      (!edge.oneWay && edge.fromId === toId && edge.toId === fromId)
    ) {
      return edge;
    }
  }
  return undefined;
}

/**
 * Check if edge is traversable from current location
 */
function isEdgeTraversable(edge: StoredLocationEdge, fromId: string): boolean {
  // One-way check
  if (edge.oneWay && edge.fromId !== fromId) {
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
    if (edge.fromId === locationId) {
      targetId = edge.toId;
    } else if (edge.toId === locationId && !edge.oneWay) {
      targetId = edge.fromId;
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

  // Get character info for display
  const charResult = getCharacter({ characterId: resolved.id });
  const character = charResult.character;

  // Add to party
  const member: PartyMember = {
    characterId: resolved.id,
    characterName: character?.name || resolved.id,
    role: input.role,
    joinedAt: new Date().toISOString(),
  };
  partyMemberStore.set(resolved.id, member);

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

// ============================================================
// MANAGE_INVENTORY
// ============================================================

/** Item types */
const ItemTypeSchema = fuzzyEnum([
  'weapon',
  'armor',
  'shield',
  'consumable',
  'ammunition',
  'equipment',
  'currency',
  'misc',
]);

/** Equipment slots */
const EquipmentSlotSchema = fuzzyEnum([
  'mainHand',
  'offHand',
  'armor',
  'head',
  'hands',
  'feet',
  'neck',
  'ring1',
  'ring2',
]);

/** Inventory item data */
interface InventoryItem {
  id: string;
  name: string;
  type: z.infer<typeof ItemTypeSchema>;
  quantity: number;
  weight?: number;
  value?: number;
  description?: string;
  properties?: string[];
  damage?: string;
  damageType?: string;
  ac?: number;
  container?: string;
  equipped?: z.infer<typeof EquipmentSlotSchema>;
}

/** Character inventory storage */
const inventoryStore = new Map<string, InventoryItem[]>();

/** Character equipment storage */
const equipmentStore = new Map<string, Map<string, string>>();

// ============================================================
// MANAGE_INVENTORY SCHEMAS
// ============================================================

/** Item schema for give operation */
const itemSchema = z.object({
  name: z.string().min(1),
  type: ItemTypeSchema,
  quantity: z.number().int().min(1),
  weight: z.number().optional(),
  value: z.number().optional(),
  description: z.string().optional(),
  properties: z.array(z.string()).optional(),
  damage: z.string().optional(),
  damageType: z.string().optional(),
  ac: z.number().optional(),
  container: z.string().optional(),
});

/** Give operation schema */
const giveOperationSchema = z.object({
  operation: z.literal('give'),
  characterId: z.string().optional(),
  characterName: z.string().optional(),
  item: itemSchema,
});

/** Take operation schema */
const takeOperationSchema = z.object({
  operation: z.literal('take'),
  characterId: z.string().optional(),
  characterName: z.string().optional(),
  itemName: z.string(),
  quantity: z.number().int().min(1).optional().default(1),
});

/** Equip operation schema */
const equipOperationSchema = z.object({
  operation: z.literal('equip'),
  characterId: z.string().optional(),
  characterName: z.string().optional(),
  itemName: z.string(),
  slot: EquipmentSlotSchema,
});

/** Unequip operation schema */
const unequipOperationSchema = z.object({
  operation: z.literal('unequip'),
  characterId: z.string().optional(),
  characterName: z.string().optional(),
  itemName: z.string().optional(),
  slot: EquipmentSlotSchema.optional(),
});

/** Move operation schema */
const moveItemOperationSchema = z.object({
  operation: z.literal('move'),
  characterId: z.string().optional(),
  characterName: z.string().optional(),
  itemName: z.string(),
  fromContainer: z.string().optional(),
  toContainer: z.string(),
  quantity: z.number().int().min(1).optional(),
});

/** List operation schema */
const listInventoryOperationSchema = z.object({
  operation: z.literal('list'),
  characterId: z.string().optional(),
  characterName: z.string().optional(),
  filterType: ItemTypeSchema.optional(),
});

/** Transfer operation schema */
const transferOperationSchema = z.object({
  operation: z.literal('transfer'),
  characterId: z.string().optional(),
  characterName: z.string().optional(),
  toCharacterId: z.string().optional(),
  toCharacterName: z.string().optional(),
  itemName: z.string(),
  quantity: z.number().int().min(1).optional().default(1),
});

/** Single inventory operation schema */
const singleInventoryOperationSchema = z.discriminatedUnion('operation', [
  giveOperationSchema,
  takeOperationSchema,
  equipOperationSchema,
  unequipOperationSchema,
  moveItemOperationSchema,
  listInventoryOperationSchema,
  transferOperationSchema,
]);

/** Batch operation schema */
const batchInventoryOperationSchema = z.object({
  batch: z.array(singleInventoryOperationSchema).max(20),
});

/** Combined schema for manage_inventory */
export const manageInventorySchema = z.union([
  singleInventoryOperationSchema,
  batchInventoryOperationSchema,
]);

// ============================================================
// MANAGE_INVENTORY HELPER FUNCTIONS
// ============================================================

/**
 * Get inventory for a character (by ID)
 */
function getInventory(characterId: string): InventoryItem[] {
  if (!inventoryStore.has(characterId)) {
    inventoryStore.set(characterId, []);
  }
  return inventoryStore.get(characterId)!;
}

/**
 * Get equipment for a character (by ID)
 */
function getEquipment(characterId: string): Map<string, string> {
  if (!equipmentStore.has(characterId)) {
    equipmentStore.set(characterId, new Map());
  }
  return equipmentStore.get(characterId)!;
}

/**
 * Find item in inventory by name (case-insensitive)
 */
function findItem(inventory: InventoryItem[], itemName: string, container?: string): InventoryItem | undefined {
  const lowerName = itemName.toLowerCase();
  return inventory.find(item => {
    if (item.name.toLowerCase() !== lowerName) return false;
    if (container !== undefined && item.container !== container) return false;
    return true;
  });
}

/**
 * Resolve character and get ID
 */
function resolveInventoryCharacter(characterId?: string, characterName?: string): { id: string | null; name: string; error?: string } {
  if (!characterId && !characterName) {
    return { id: null, name: '', error: 'Either characterId or characterName is required' };
  }

  const result = getCharacter({ characterId, characterName });
  if (!result.success || !result.character) {
    return { id: null, name: '', error: `Character not found: ${characterName || characterId}` };
  }

  return { id: result.character.id, name: result.character.name };
}

// ============================================================
// MANAGE_INVENTORY OPERATION HANDLERS
// ============================================================

/**
 * Handle give operation - Add item to inventory
 */
function handleInventoryGive(input: z.infer<typeof giveOperationSchema>): string {
  const resolved = resolveInventoryCharacter(input.characterId, input.characterName);
  if (!resolved.id) {
    return createBox('ERROR', [resolved.error || 'Character not found'], DISPLAY_WIDTH);
  }

  const inventory = getInventory(resolved.id);
  const item = input.item;

  // Check if identical item exists (stack)
  const existing = inventory.find(i => 
    i.name.toLowerCase() === item.name.toLowerCase() && 
    i.type === item.type &&
    i.container === item.container
  );

  if (existing) {
    existing.quantity += item.quantity;
    const lines: string[] = [];
    lines.push(`Character: ${resolved.name}`);
    lines.push(`Item: ${existing.name}`);
    lines.push(`Type: ${existing.type}`);
    lines.push(`New Total: ${existing.quantity}`);
    return createBox('ITEM ADDED', lines, DISPLAY_WIDTH);
  }

  // Create new item
  const newItem: InventoryItem = {
    id: randomUUID(),
    name: item.name,
    type: item.type,
    quantity: item.quantity,
    weight: item.weight,
    value: item.value,
    description: item.description,
    properties: item.properties,
    damage: item.damage,
    damageType: item.damageType,
    ac: item.ac,
    container: item.container,
  };

  inventory.push(newItem);

  const lines: string[] = [];
  lines.push(`Character: ${resolved.name}`);
  lines.push(`Item: ${newItem.name}`);
  lines.push(`Type: ${newItem.type}`);
  lines.push(`Quantity: ${newItem.quantity}`);
  if (newItem.weight) lines.push(`Weight: ${newItem.weight} lb`);
  if (newItem.value) lines.push(`Value: ${newItem.value} gp`);

  return createBox('ITEM ADDED', lines, DISPLAY_WIDTH);
}

/**
 * Handle take operation - Remove item from inventory
 */
function handleInventoryTake(input: z.infer<typeof takeOperationSchema>): string {
  const resolved = resolveInventoryCharacter(input.characterId, input.characterName);
  if (!resolved.id) {
    return createBox('ERROR', [resolved.error || 'Character not found'], DISPLAY_WIDTH);
  }

  const inventory = getInventory(resolved.id);
  const item = findItem(inventory, input.itemName);

  if (!item) {
    return createBox('ERROR', [`Item not found: ${input.itemName}`], DISPLAY_WIDTH);
  }

  const quantity = input.quantity;

  if (item.quantity < quantity) {
    return createBox('ERROR', [`insufficient quantity: have ${item.quantity}, need ${quantity}`], DISPLAY_WIDTH);
  }

  item.quantity -= quantity;
  const remaining = item.quantity;

  // Remove if quantity is 0
  if (item.quantity <= 0) {
    const index = inventory.indexOf(item);
    if (index > -1) {
      inventory.splice(index, 1);
    }
  }

  const lines: string[] = [];
  lines.push(`Character: ${resolved.name}`);
  lines.push(`Item: ${item.name}`);
  lines.push(`Removed: ${quantity}`);
  lines.push(`Remaining: ${remaining}`);

  return createBox('ITEM REMOVED', lines, DISPLAY_WIDTH);
}

/**
 * Handle equip operation - Equip item to slot
 */
function handleInventoryEquip(input: z.infer<typeof equipOperationSchema>): string {
  const resolved = resolveInventoryCharacter(input.characterId, input.characterName);
  if (!resolved.id) {
    return createBox('ERROR', [resolved.error || 'Character not found'], DISPLAY_WIDTH);
  }

  const inventory = getInventory(resolved.id);
  const item = findItem(inventory, input.itemName);

  if (!item) {
    return createBox('ERROR', [`Item not found: ${input.itemName}`], DISPLAY_WIDTH);
  }

  const equipment = getEquipment(resolved.id);
  const slot = input.slot;

  // Check if something already equipped in that slot
  const previousItemId = equipment.get(slot);
  let previousItemName: string | undefined;

  if (previousItemId) {
    const prevItem = inventory.find(i => i.id === previousItemId);
    if (prevItem) {
      previousItemName = prevItem.name;
      prevItem.equipped = undefined;
    }
  }

  // Equip new item
  equipment.set(slot, item.id);
  item.equipped = slot;

  const lines: string[] = [];
  lines.push(`Character: ${resolved.name}`);
  lines.push(`Item: ${item.name}`);
  lines.push(`Slot: ${slot}`);
  if (previousItemName) {
    lines.push(`Unequipped: ${previousItemName}`);
  }

  return createBox('ITEM EQUIPPED', lines, DISPLAY_WIDTH);
}

/**
 * Handle unequip operation - Remove item from equipment slot
 */
function handleInventoryUnequip(input: z.infer<typeof unequipOperationSchema>): string {
  const resolved = resolveInventoryCharacter(input.characterId, input.characterName);
  if (!resolved.id) {
    return createBox('ERROR', [resolved.error || 'Character not found'], DISPLAY_WIDTH);
  }

  const inventory = getInventory(resolved.id);
  const equipment = getEquipment(resolved.id);

  let targetItem: InventoryItem | undefined;
  let targetSlot: string | undefined;

  if (input.itemName) {
    // Find by item name
    targetItem = findItem(inventory, input.itemName);
    if (!targetItem) {
      return createBox('ERROR', [`Item not found: ${input.itemName}`], DISPLAY_WIDTH);
    }
    if (!targetItem.equipped) {
      return createBox('ERROR', [`Item is not equipped: ${input.itemName}`], DISPLAY_WIDTH);
    }
    targetSlot = targetItem.equipped;
  } else if (input.slot) {
    // Find by slot
    targetSlot = input.slot;
    const itemId = equipment.get(input.slot);
    if (!itemId) {
      return createBox('ERROR', [`Slot is empty: ${input.slot}`], DISPLAY_WIDTH);
    }
    targetItem = inventory.find(i => i.id === itemId);
  } else {
    return createBox('ERROR', ['Either itemName or slot is required'], DISPLAY_WIDTH);
  }

  if (!targetItem || !targetSlot) {
    return createBox('ERROR', ['Could not find item to unequip'], DISPLAY_WIDTH);
  }

  // Unequip
  equipment.delete(targetSlot);
  targetItem.equipped = undefined;

  const lines: string[] = [];
  lines.push(`Character: ${resolved.name}`);
  lines.push(`Item: ${targetItem.name}`);
  lines.push(`Slot: ${targetSlot}`);

  return createBox('ITEM UNEQUIPPED', lines, DISPLAY_WIDTH);
}

/**
 * Handle move operation - Move item between containers
 */
function handleInventoryMove(input: z.infer<typeof moveItemOperationSchema>): string {
  const resolved = resolveInventoryCharacter(input.characterId, input.characterName);
  if (!resolved.id) {
    return createBox('ERROR', [resolved.error || 'Character not found'], DISPLAY_WIDTH);
  }

  const inventory = getInventory(resolved.id);
  const item = findItem(inventory, input.itemName, input.fromContainer);

  if (!item) {
    const containerInfo = input.fromContainer ? ` in ${input.fromContainer}` : '';
    return createBox('ERROR', [`Item not found: ${input.itemName}${containerInfo}`], DISPLAY_WIDTH);
  }

  const quantity = input.quantity || item.quantity;
  const fromContainer = item.container || 'general inventory';
  const toContainer = input.toContainer;

  if (quantity > item.quantity) {
    return createBox('ERROR', [`insufficient quantity: have ${item.quantity}, need ${quantity}`], DISPLAY_WIDTH);
  }

  // If moving all, just change container
  if (quantity === item.quantity) {
    item.container = toContainer;
  } else {
    // Split the stack
    item.quantity -= quantity;
    
    // Check if target container already has this item
    const existing = inventory.find(i => 
      i.name.toLowerCase() === item.name.toLowerCase() && 
      i.type === item.type &&
      i.container === toContainer
    );

    if (existing) {
      existing.quantity += quantity;
    } else {
      const newItem: InventoryItem = {
        ...item,
        id: randomUUID(),
        quantity: quantity,
        container: toContainer,
        equipped: undefined,
      };
      inventory.push(newItem);
    }
  }

  const lines: string[] = [];
  lines.push(`Character: ${resolved.name}`);
  lines.push(`Item: ${item.name}`);
  lines.push(`Quantity: ${quantity}`);
  lines.push(`From: ${fromContainer}`);
  lines.push(`To: ${toContainer}`);

  return createBox('ITEM MOVED', lines, DISPLAY_WIDTH);
}

/**
 * Handle list operation - List inventory contents
 */
function handleInventoryList(input: z.infer<typeof listInventoryOperationSchema>): string {
  const resolved = resolveInventoryCharacter(input.characterId, input.characterName);
  if (!resolved.id) {
    return createBox('ERROR', [resolved.error || 'Character not found'], DISPLAY_WIDTH);
  }

  const inventory = getInventory(resolved.id);
  let filteredItems = inventory;

  if (input.filterType) {
    filteredItems = inventory.filter(i => i.type === input.filterType);
  }

  const lines: string[] = [];
  lines.push(`Character: ${resolved.name}`);
  lines.push('');

  if (filteredItems.length === 0) {
    lines.push('Inventory is empty.');
    return createBox('INVENTORY', lines, DISPLAY_WIDTH);
  }

  // Calculate total weight
  let totalWeight = 0;
  
  // Group by container
  const byContainer = new Map<string, InventoryItem[]>();
  for (const item of filteredItems) {
    const container = item.container || 'General';
    if (!byContainer.has(container)) {
      byContainer.set(container, []);
    }
    byContainer.get(container)!.push(item);
    if (item.weight) {
      totalWeight += item.weight * item.quantity;
    }
  }

  for (const [container, items] of byContainer.entries()) {
    if (byContainer.size > 1) {
      lines.push(`[${container}]`);
    }
    
    for (const item of items) {
      let line = `${BULLET} ${item.name}`;
      if (item.quantity > 1) {
        line += ` (x${item.quantity})`;
      }
      if (item.equipped) {
        line += ` [equipped: ${item.equipped}]`;
      }
      lines.push(line);
    }
    
    if (byContainer.size > 1) {
      lines.push('');
    }
  }

  if (totalWeight > 0) {
    lines.push('');
    lines.push(`Total Weight: ${totalWeight} lb`);
  }

  return createBox('INVENTORY', lines, DISPLAY_WIDTH);
}

/**
 * Handle transfer operation - Transfer item between characters
 */
function handleInventoryTransfer(input: z.infer<typeof transferOperationSchema>): string {
  // Resolve source character
  const source = resolveInventoryCharacter(input.characterId, input.characterName);
  if (!source.id) {
    return createBox('ERROR', [source.error || 'Source character not found'], DISPLAY_WIDTH);
  }

  // Resolve target character
  const target = resolveInventoryCharacter(input.toCharacterId, input.toCharacterName);
  if (!target.id) {
    return createBox('ERROR', [target.error || 'Target character not found'], DISPLAY_WIDTH);
  }

  const sourceInventory = getInventory(source.id);
  const item = findItem(sourceInventory, input.itemName);

  if (!item) {
    return createBox('ERROR', [`Item not found: ${input.itemName}`], DISPLAY_WIDTH);
  }

  const quantity = input.quantity;

  if (item.quantity < quantity) {
    return createBox('ERROR', [`insufficient quantity: have ${item.quantity}, need ${quantity}`], DISPLAY_WIDTH);
  }

  // Remove from source
  item.quantity -= quantity;
  if (item.quantity <= 0) {
    const index = sourceInventory.indexOf(item);
    if (index > -1) {
      sourceInventory.splice(index, 1);
    }
  }

  // Add to target
  const targetInventory = getInventory(target.id);
  const existingInTarget = targetInventory.find(i => 
    i.name.toLowerCase() === item.name.toLowerCase() && 
    i.type === item.type
  );

  if (existingInTarget) {
    existingInTarget.quantity += quantity;
  } else {
    const newItem: InventoryItem = {
      ...item,
      id: randomUUID(),
      quantity: quantity,
      equipped: undefined,
    };
    targetInventory.push(newItem);
  }

  const lines: string[] = [];
  lines.push(`Item: ${item.name}`);
  lines.push(`Quantity: ${quantity}`);
  lines.push(`From: ${source.name}`);
  lines.push(`To: ${target.name}`);

  return createBox('ITEM TRANSFERRED', lines, DISPLAY_WIDTH);
}

/**
 * Process single inventory operation
 */
function processSingleOperation(op: z.infer<typeof singleInventoryOperationSchema>): string {
  switch (op.operation) {
    case 'give':
      return handleInventoryGive(op);
    case 'take':
      return handleInventoryTake(op);
    case 'equip':
      return handleInventoryEquip(op);
    case 'unequip':
      return handleInventoryUnequip(op);
    case 'move':
      return handleInventoryMove(op);
    case 'list':
      return handleInventoryList(op);
    case 'transfer':
      return handleInventoryTransfer(op);
    default:
      return createBox('ERROR', ['Unknown operation'], DISPLAY_WIDTH);
  }
}

// ============================================================
// MANAGE_INVENTORY MAIN HANDLER
// ============================================================

/**
 * Main handler for manage_inventory tool
 */
export async function manageInventory(input: unknown): Promise<{ content: { type: 'text'; text: string }[] }> {
  try {
    const parsed = manageInventorySchema.parse(input);

    // Check if batch operation
    if ('batch' in parsed) {
      const results: { success: boolean; result: string }[] = [];
      
      for (const op of parsed.batch) {
        try {
          const result = processSingleOperation(op);
          const isError = result.includes('ERROR');
          results.push({ success: !isError, result });
        } catch (err) {
          results.push({ 
            success: false, 
            result: createBox('ERROR', [err instanceof Error ? err.message : 'Unknown error'], DISPLAY_WIDTH) 
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      const lines: string[] = [];
      lines.push(`Operations: ${parsed.batch.length}`);
      lines.push(`Successful: ${successCount}`);
      lines.push(`Failed: ${failCount}`);

      return { content: [{ type: 'text' as const, text: createBox('BATCH COMPLETE', lines, DISPLAY_WIDTH) }] };
    }

    // Single operation
    const result = processSingleOperation(parsed);
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

/**
 * Clear inventory data (for testing)
 */
export function clearInventoryData(): void {
  inventoryStore.clear();
  equipmentStore.clear();
}

// ============================================================
// MANAGE_NOTES
// ============================================================

/** Importance levels for notes */
const ImportanceSchema = fuzzyEnum(['low', 'medium', 'high', 'critical'] as const);

/** Note interface */
interface Note {
  id: string;
  content: string;
  tags: string[];
  importance: z.infer<typeof ImportanceSchema>;
  createdAt: Date;
}

/** Notes storage */
const notesStore = new Map<string, Note>();

// ============================================================
// MANAGE_NOTES SCHEMAS
// ============================================================

/** Add operation schema */
const addNoteOperationSchema = z.object({
  operation: z.literal('add'),
  content: z.string().min(1, 'Content is required'),
  tags: z.array(z.string()).optional(),
  importance: ImportanceSchema.optional().default('medium'),
});

/** Search operation schema */
const searchNoteOperationSchema = z.object({
  operation: z.literal('search'),
  query: z.string().optional(),
  tagFilter: z.array(z.string()).optional(),
});

/** Get operation schema */
const getNoteOperationSchema = z.object({
  operation: z.literal('get'),
  noteId: z.string(),
});

/** Delete operation schema */
const deleteNoteOperationSchema = z.object({
  operation: z.literal('delete'),
  noteId: z.string(),
});

/** List operation schema */
const listNoteOperationSchema = z.object({
  operation: z.literal('list'),
  limit: z.number().int().min(1).optional(),
});

/** Combined schema for manage_notes using discriminatedUnion */
export const manageNotesSchema = z.discriminatedUnion('operation', [
  addNoteOperationSchema,
  searchNoteOperationSchema,
  getNoteOperationSchema,
  deleteNoteOperationSchema,
  listNoteOperationSchema,
]);

// ============================================================
// MANAGE_NOTES OPERATION HANDLERS
// ============================================================

/**
 * Handle add operation - Add a new session note
 */
function handleNoteAdd(input: z.infer<typeof addNoteOperationSchema>): string {
  const note: Note = {
    id: randomUUID(),
    content: input.content,
    tags: input.tags || [],
    importance: input.importance,
    createdAt: new Date(),
  };

  notesStore.set(note.id, note);

  const lines: string[] = [];
  lines.push(`ID: ${note.id}`);
  lines.push('');
  lines.push(note.content.length > 40 ? note.content.substring(0, 40) + '...' : note.content);
  lines.push('');
  if (note.tags.length > 0) {
    lines.push(`Tags: ${note.tags.join(', ')}`);
  }
  lines.push(`Importance: ${note.importance}`);

  return createBox('NOTE ADDED', lines, DISPLAY_WIDTH);
}

/**
 * Handle search operation - Search notes by query and/or tags
 */
function handleNoteSearch(input: z.infer<typeof searchNoteOperationSchema>): string {
  const query = input.query?.toLowerCase();
  const tagFilter = input.tagFilter;

  const matchingNotes: Note[] = [];

  for (const note of notesStore.values()) {
    let matches = true;

    // Check query match (case-insensitive)
    if (query) {
      if (!note.content.toLowerCase().includes(query)) {
        matches = false;
      }
    }

    // Check tag filter (AND logic - all tags must be present)
    if (tagFilter && tagFilter.length > 0) {
      const noteTags = note.tags.map(t => t.toLowerCase());
      for (const tag of tagFilter) {
        if (!noteTags.includes(tag.toLowerCase())) {
          matches = false;
          break;
        }
      }
    }

    if (matches) {
      matchingNotes.push(note);
    }
  }

  const lines: string[] = [];

  if (matchingNotes.length === 0) {
    lines.push('No notes found matching the criteria.');
    return createBox('SEARCH RESULTS', lines, DISPLAY_WIDTH);
  }

  lines.push(`Found: ${matchingNotes.length} note${matchingNotes.length !== 1 ? 's' : ''}`);
  lines.push('');

  // Sort by createdAt descending (most recent first)
  matchingNotes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  for (const note of matchingNotes) {
    const preview = note.content.length > 35 ? note.content.substring(0, 35) + '...' : note.content;
    lines.push(`${BULLET} ${preview}`);
    if (note.tags.length > 0) {
      lines.push(`  [${note.tags.join(', ')}]`);
    }
  }

  return createBox('SEARCH RESULTS', lines, DISPLAY_WIDTH);
}

/**
 * Handle get operation - Get a specific note by ID
 */
function handleNoteGet(input: z.infer<typeof getNoteOperationSchema>): string {
  const note = notesStore.get(input.noteId);

  if (!note) {
    return createBox('ERROR', [`Note not found: ${input.noteId}`], DISPLAY_WIDTH);
  }

  const lines: string[] = [];
  lines.push(`ID: ${note.id}`);
  lines.push('');
  lines.push(note.content);
  lines.push('');
  if (note.tags.length > 0) {
    lines.push(`Tags: ${note.tags.join(', ')}`);
  }
  lines.push(`Importance: ${note.importance}`);
  lines.push(`Created: ${note.createdAt.toISOString()}`);

  return createBox('SESSION NOTE', lines, DISPLAY_WIDTH);
}

/**
 * Handle delete operation - Remove a note by ID
 */
function handleNoteDelete(input: z.infer<typeof deleteNoteOperationSchema>): string {
  const note = notesStore.get(input.noteId);

  if (!note) {
    return createBox('ERROR', [`Note not found: ${input.noteId}`], DISPLAY_WIDTH);
  }

  notesStore.delete(input.noteId);

  const lines: string[] = [];
  lines.push(`ID: ${input.noteId}`);
  lines.push('');
  const preview = note.content.length > 40 ? note.content.substring(0, 40) + '...' : note.content;
  lines.push(`Content: ${preview}`);

  return createBox('NOTE DELETED', lines, DISPLAY_WIDTH);
}

/**
 * Handle list operation - List recent notes with optional limit
 */
function handleNoteList(input: z.infer<typeof listNoteOperationSchema>): string {
  const lines: string[] = [];

  if (notesStore.size === 0) {
    lines.push('No notes.');
    lines.push('');
    lines.push('Total: 0');
    return createBox('NOTES', lines, DISPLAY_WIDTH);
  }

  // Get all notes and sort by createdAt descending
  const allNotes = Array.from(notesStore.values());
  allNotes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Apply limit if specified
  const limit = input.limit || allNotes.length;
  const displayNotes = allNotes.slice(0, limit);

  lines.push(`Total: ${notesStore.size} note${notesStore.size !== 1 ? 's' : ''}`);
  lines.push('');

  for (const note of displayNotes) {
    const preview = note.content.length > 30 ? note.content.substring(0, 30) + '...' : note.content;
    let marker = '';
    if (note.importance === 'critical') {
      marker = ' [!]';
    } else if (note.importance === 'high') {
      marker = ' [*]';
    }
    lines.push(`${BULLET} ${preview}${marker}`);
  }

  return createBox('NOTES', lines, DISPLAY_WIDTH);
}

// ============================================================
// MANAGE_NOTES MAIN HANDLER
// ============================================================

/**
 * Main handler for manage_notes tool
 */
export async function manageNotes(input: unknown): Promise<{ content: { type: 'text'; text: string }[] }> {
  try {
    const parsed = manageNotesSchema.parse(input);

    let result: string;

    switch (parsed.operation) {
      case 'add':
        result = handleNoteAdd(parsed);
        break;
      case 'search':
        result = handleNoteSearch(parsed);
        break;
      case 'get':
        result = handleNoteGet(parsed);
        break;
      case 'delete':
        result = handleNoteDelete(parsed);
        break;
      case 'list':
        result = handleNoteList(parsed);
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

/**
 * Clear all notes (for testing)
 */
export function clearAllNotes(): void {
  notesStore.clear();
}

// ============================================================
// GET SESSION CONTEXT TOOL
// ============================================================

/**
 * Schema for get_session_context tool
 */
export const getSessionContextSchema = z.object({
  include: z.array(fuzzyEnum(['location', 'party', 'notes', 'combat', 'summary'] as const)).optional(),
  format: fuzzyEnum(['detailed', 'compact', 'brief'] as const, 'verbosity').optional(),
  maxNotes: z.number().int().positive().optional(),
  includeTimestamps: z.boolean().optional(),
});

type SessionContextInput = z.infer<typeof getSessionContextSchema>;

/**
 * Get current location context
 */
function getLocationContext(format: string): string[] {
  const lines: string[] = [];
  const locationId = partyState.currentLocationId;
  const location = locationId ? locationStore.get(locationId) : null;

  if (!location) {
    lines.push('📍 Location: Not set');
    return lines;
  }

  if (format === 'brief') {
    lines.push(`📍 ${location.name}`);
  } else if (format === 'compact') {
    lines.push(`📍 ${location.name}${location.locationType ? ` (${location.locationType})` : ''}`);
  } else {
    // detailed
    lines.push(`📍 LOCATION: ${location.name}`);
    if (location.locationType) {
      lines.push(`   Type: ${location.locationType}`);
    }
    if (location.description) {
      lines.push(`   ${location.description}`);
    }
    if (location.terrain) {
      lines.push(`   Terrain: ${location.terrain}`);
    }
    if (location.lighting) {
      lines.push(`   Lighting: ${location.lighting}`);
    }
  }

  return lines;
}

/**
 * Get current party context
 */
function getPartyContext(format: string): string[] {
  const lines: string[] = [];
  const members = Array.from(partyMemberStore.values());

  if (members.length === 0) {
    lines.push('👥 Party: 0 members');
    return lines;
  }

  // Helper to get character name
  const getName = (characterId: string): string => {
    const result = getCharacter({ characterId });
    return result.character?.name || characterId;
  };

  if (format === 'brief') {
    const names = members.map(m => getName(m.characterId)).join(', ');
    lines.push(`👥 Party (${members.length}): ${names}`);
  } else if (format === 'compact') {
    lines.push(`👥 Party: ${members.length} members`);
    for (const m of members) {
      const name = getName(m.characterId);
      lines.push(`   • ${name}${m.role ? ` (${m.role})` : ''}`);
    }
  } else {
    // detailed
    lines.push(`👥 PARTY: ${members.length} members`);
    for (const m of members) {
      const name = getName(m.characterId);
      const result = getCharacter({ characterId: m.characterId });
      const char = result.character;
      lines.push(`   • ${name}`);
      if (char) {
        lines.push(`     ${char.class} (Level ${char.level})`);
      }
      if (m.role) lines.push(`     Role: ${m.role}`);
    }
  }

  return lines;
}

/**
 * Get notes context
 */
function getNotesContext(format: string, maxNotes?: number, includeTimestamps?: boolean): string[] {
  const lines: string[] = [];
  let notes = Array.from(notesStore.values());

  if (notes.length === 0) {
    lines.push('📝 Notes: 0 notes');
    return lines;
  }

  // Sort by importance (critical > high > medium > low)
  const importanceOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  notes.sort((a, b) => (importanceOrder[b.importance] || 0) - (importanceOrder[a.importance] || 0));

  // Apply limit
  if (maxNotes && maxNotes > 0) {
    notes = notes.slice(0, maxNotes);
  }

  if (format === 'brief') {
    lines.push(`📝 Notes: ${notes.length}`);
    if (notes.length > 0) {
      const truncated = notes[0].content.substring(0, 50);
      lines.push(`   "${truncated}${notes[0].content.length > 50 ? '...' : ''}"`);
    }
  } else if (format === 'compact') {
    lines.push(`📝 Notes: ${notes.length}`);
    for (const note of notes.slice(0, 3)) {
      const truncated = note.content.substring(0, 40);
      const ts = includeTimestamps ? ` [${formatTimestamp(note.createdAt)}]` : '';
      lines.push(`   • ${truncated}${note.content.length > 40 ? '...' : ''}${ts}`);
    }
  } else {
    // detailed
    lines.push(`📝 NOTES: ${notes.length} total`);
    for (const note of notes) {
      const truncated = note.content.substring(0, 60);
      lines.push(`   [${note.importance.toUpperCase()}] ${truncated}${note.content.length > 60 ? '...' : ''}`);
      if (note.tags && note.tags.length > 0) {
        lines.push(`      Tags: ${note.tags.join(', ')}`);
      }
      if (includeTimestamps) {
        lines.push(`      Created: ${formatTimestamp(note.createdAt)}`);
      }
    }
  }

  return lines;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}

/**
 * Get combat context
 */
function getCombatContext(format: string): string[] {
  const lines: string[] = [];
  // No active combat tracking in data module - would come from combat module
  lines.push('⚔️ Combat: No active encounter');
  return lines;
}

/**
 * Get session summary
 */
function getSummaryContext(): string[] {
  const lines: string[] = [];
  lines.push('📋 SUMMARY');
  const locationId = partyState.currentLocationId;
  const location = locationId ? locationStore.get(locationId) : null;
  const memberCount = partyMemberStore.size;
  const noteCount = notesStore.size;

  if (location) {
    lines.push(`   Currently at: ${location.name}`);
  } else {
    lines.push('   Location: Unknown');
  }

  lines.push(`   Party: ${memberCount} member${memberCount !== 1 ? 's' : ''}`);
  lines.push(`   Notes: ${noteCount} recorded`);

  return lines;
}

/**
 * Get comprehensive session context
 */
export async function getSessionContext(input: unknown): Promise<{ content: { type: 'text'; text: string }[] }> {
  try {
    const parsed = getSessionContextSchema.parse(input);
    const format = parsed.format || 'detailed';
    const sections = parsed.include || ['location', 'party', 'notes', 'combat', 'summary'];
    const maxNotes = parsed.maxNotes;
    const includeTimestamps = parsed.includeTimestamps || false;

    const lines: string[] = [];

    // Build context based on requested sections
    for (const section of sections) {
      switch (section) {
        case 'location':
          lines.push(...getLocationContext(format));
          break;
        case 'party':
          lines.push(...getPartyContext(format));
          break;
        case 'notes':
          lines.push(...getNotesContext(format, maxNotes, includeTimestamps));
          break;
        case 'combat':
          lines.push(...getCombatContext(format));
          break;
        case 'summary':
          lines.push(...getSummaryContext());
          break;
      }
      if (format !== 'brief') {
        lines.push(''); // spacing between sections
      }
    }

    // Remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    const output = createBox('SESSION CONTEXT', lines, DISPLAY_WIDTH);
    return { content: [{ type: 'text' as const, text: output }] };
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

