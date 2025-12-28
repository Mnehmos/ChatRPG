/**
 * WebSocket Module - Real-time Battlefield State Broadcasting
 * 
 * Enables external visualizers (React/Three.js) to receive live encounter updates.
 * Implements a pub/sub pattern where clients subscribe to specific encounters
 * and receive delta updates when state changes occur.
 * 
 * @module websocket
 * 
 * ## Architecture
 * 
 * ```
 * ┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐
 * │  React App  │────▶│  WebSocket      │────▶│  Subscription   │
 * │  (Client)   │◀────│  Server         │◀────│  Manager        │
 * └─────────────┘     └─────────────────┘     └─────────────────┘
 *                            │                        │
 *                            ▼                        ▼
 *                     ┌─────────────────┐     ┌─────────────────┐
 *                     │  Message        │     │  Encounter      │
 *                     │  Handler        │     │  Store          │
 *                     └─────────────────┘     └─────────────────┘
 * ```
 * 
 * ## Message Flow
 * 
 * 1. Client connects via WebSocket upgrade on HTTP server port
 * 2. Client sends `{ type: 'subscribe', encounterId: '...' }`
 * 3. Server responds with `{ type: 'subscribed', state: BattlefieldState }`
 * 4. Server broadcasts `{ type: 'delta', delta: StateDelta }` on changes
 * 5. Client sends `{ type: 'unsubscribe', encounterId: '...' }` when done
 * 
 * @example
 * ```typescript
 * // Server setup
 * import { createWebSocketServer } from './websocket.js';
 * const wss = createWebSocketServer(httpServer);
 * 
 * // Broadcasting a change
 * import { broadcastToEncounter } from './websocket.js';
 * broadcastToEncounter('enc_123', {
 *   type: 'hpChanged',
 *   entityId: 'fighter_1',
 *   previousHp: 45,
 *   currentHp: 32,
 *   maxHp: 45,
 *   damage: 13
 * });
 * ```
 */

import { Server } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { getEncounterState, getActiveConditions } from './modules/combat.js';

// ════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// Core Data Types
// ─────────────────────────────────────────────────────────────────────────────

/** 3D position in the encounter space */
export interface Position {
  x: number;
  y: number;
  z: number;
}

/**
 * Entity representation for visualizers.
 * Contains all data needed to render an entity in 3D space.
 */
export interface BattlefieldEntity {
  /** Unique identifier for the entity */
  id: string;
  /** Display name */
  name: string;
  /** Single-character symbol for 2D map display */
  symbol: string;
  /** 3D position in the encounter space */
  position: Position;
  /** Current hit points */
  hp: number;
  /** Maximum hit points */
  maxHp: number;
  /** Armor class */
  ac: number;
  /** Movement speed in feet */
  speed: number;
  /** Whether this entity is hostile */
  isEnemy: boolean;
  /** Whether it's currently this entity's turn */
  isCurrentTurn: boolean;
  /** Active condition names */
  conditions: string[];
  /** Current life status */
  status: 'alive' | 'unconscious' | 'dead' | 'stable';
}

/**
 * Terrain state for the encounter.
 * All positions are converted to structured format for easy 3D rendering.
 */
export interface TerrainState {
  /** Grid width in 5-foot squares */
  width: number;
  /** Grid height in 5-foot squares */
  height: number;
  /** Obstacle regions (walls, pillars, etc.) */
  obstacles: Array<{ x: number; y: number; width: number; height: number; name?: string }>;
  /** Difficult terrain regions */
  difficultTerrain: Array<{ x: number; y: number; width: number; height: number }>;
  /** Water regions */
  water: Array<{ x: number; y: number; width: number; height: number; depth?: string }>;
  /** Hazard regions (lava, traps, etc.) */
  hazards: Array<{ x: number; y: number; width: number; height: number; type: string }>;
}

/**
 * Complete battlefield state snapshot.
 * Sent on subscription and can be requested for full sync.
 */
export interface BattlefieldState {
  /** Encounter identifier */
  encounterId: string;
  /** Current combat round */
  round: number;
  /** ID of the entity whose turn it is */
  currentTurnId: string;
  /** Terrain configuration */
  terrain: TerrainState;
  /** All entities in the encounter */
  entities: BattlefieldEntity[];
  /** Lighting condition (bright, dim, darkness) */
  lighting: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Message Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Messages sent from client to server.
 * 
 * @example Subscribe to an encounter
 * ```json
 * { "type": "subscribe", "encounterId": "enc_abc123" }
 * ```
 * 
 * @example Unsubscribe from an encounter
 * ```json
 * { "type": "unsubscribe", "encounterId": "enc_abc123" }
 * ```
 * 
 * @example Keep-alive ping
 * ```json
 * { "type": "ping" }
 * ```
 */
export type WSClientMessage =
  | { type: 'subscribe'; encounterId: string }
  | { type: 'unsubscribe'; encounterId: string }
  | { type: 'ping' };

/**
 * Messages sent from server to client.
 * 
 * @example Subscription confirmed with full state
 * ```json
 * { "type": "subscribed", "encounterId": "enc_abc123", "state": { ... } }
 * ```
 * 
 * @example Delta update
 * ```json
 * { "type": "delta", "encounterId": "enc_abc123", "delta": { "type": "hpChanged", ... } }
 * ```
 */
export type WSServerMessage =
  | { type: 'subscribed'; encounterId: string; state: BattlefieldState }
  | { type: 'unsubscribed'; encounterId: string }
  | { type: 'delta'; encounterId: string; delta: StateDelta }
  | { type: 'pong' }
  | { type: 'error'; message: string };

// ─────────────────────────────────────────────────────────────────────────────
// Delta Types (Incremental Updates)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delta types for incremental state updates.
 * 
 * Rather than sending full state on every change, deltas describe
 * specific mutations that clients can apply to their local state.
 * This reduces bandwidth and enables smooth animations.
 */
export type StateDelta =
  | { type: 'entityMoved'; entityId: string; from: Position; to: Position }
  | { type: 'hpChanged'; entityId: string; previousHp: number; currentHp: number; maxHp: number; damage?: number; healing?: number }
  | { type: 'conditionAdded'; entityId: string; condition: string; duration?: number }
  | { type: 'conditionRemoved'; entityId: string; condition: string }
  | { type: 'turnChanged'; previousEntityId: string; currentEntityId: string; round: number }
  | { type: 'entityAdded'; entity: BattlefieldEntity }
  | { type: 'entityRemoved'; entityId: string }
  | { type: 'statusChanged'; entityId: string; previousStatus: string; currentStatus: string }
  | { type: 'attackResult'; attackerId: string; targetId: string; hit: boolean; damage?: number; critical?: boolean };

// ─────────────────────────────────────────────────────────────────────────────
// Manager Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Public interface for subscription management.
 * Allows external code to query subscription state.
 */
export interface SubscriptionManager {
  /** Get the number of clients subscribed to an encounter */
  getSubscriberCount(encounterId: string): number;
  /** Get all encounter IDs a client is subscribed to */
  getEncounterIdsForClient(ws: WebSocket): string[];
}

// ════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION MANAGER
// ════════════════════════════════════════════════════════════════════════════

/**
 * Manages WebSocket client subscriptions to encounters.
 * 
 * Maintains bidirectional mappings for efficient lookups:
 * - Encounter → Clients (for broadcasting to all subscribers)
 * - Client → Encounters (for cleanup on disconnect)
 * 
 * Thread-safe for concurrent operations (single-threaded JS).
 */
class SubscriptionManagerImpl implements SubscriptionManager {
  /** Map of encounterId → Set of subscribed WebSocket clients */
  private readonly encounterSubscriptions = new Map<string, Set<WebSocket>>();
  /** Map of WebSocket client → Set of subscribed encounter IDs */
  private readonly clientSubscriptions = new Map<WebSocket, Set<string>>();

  /**
   * Subscribe a client to an encounter.
   * Idempotent - subscribing multiple times has no additional effect.
   */
  subscribe(ws: WebSocket, encounterId: string): void {
    // Add to encounter → clients map
    if (!this.encounterSubscriptions.has(encounterId)) {
      this.encounterSubscriptions.set(encounterId, new Set());
    }
    this.encounterSubscriptions.get(encounterId)!.add(ws);

    // Add to client → encounters map
    if (!this.clientSubscriptions.has(ws)) {
      this.clientSubscriptions.set(ws, new Set());
    }
    this.clientSubscriptions.get(ws)!.add(encounterId);
  }

  /**
   * Unsubscribe a client from an encounter.
   * Cleans up empty sets to prevent memory leaks.
   */
  unsubscribe(ws: WebSocket, encounterId: string): void {
    // Remove from encounter → clients map
    const clients = this.encounterSubscriptions.get(encounterId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.encounterSubscriptions.delete(encounterId);
      }
    }

    // Remove from client → encounters map
    const encounters = this.clientSubscriptions.get(ws);
    if (encounters) {
      encounters.delete(encounterId);
      if (encounters.size === 0) {
        this.clientSubscriptions.delete(ws);
      }
    }
  }

  /**
   * Unsubscribe a client from all encounters.
   * Called on client disconnect to clean up all subscriptions.
   */
  unsubscribeAll(ws: WebSocket): void {
    const encounters = this.clientSubscriptions.get(ws);
    if (encounters) {
      for (const encounterId of encounters) {
        const clients = this.encounterSubscriptions.get(encounterId);
        if (clients) {
          clients.delete(ws);
          if (clients.size === 0) {
            this.encounterSubscriptions.delete(encounterId);
          }
        }
      }
      this.clientSubscriptions.delete(ws);
    }
  }

  /**
   * Get all WebSocket clients subscribed to an encounter.
   * Returns empty Set if no subscribers.
   */
  getSubscribersForEncounter(encounterId: string): Set<WebSocket> {
    return this.encounterSubscriptions.get(encounterId) || new Set();
  }

  /** Get the number of clients subscribed to an encounter */
  getSubscriberCount(encounterId: string): number {
    return this.encounterSubscriptions.get(encounterId)?.size || 0;
  }

  /** Get all encounter IDs a client is subscribed to */
  getEncounterIdsForClient(ws: WebSocket): string[] {
    return Array.from(this.clientSubscriptions.get(ws) || []);
  }

  /** Check if a client is subscribed to a specific encounter */
  isSubscribed(ws: WebSocket, encounterId: string): boolean {
    return this.clientSubscriptions.get(ws)?.has(encounterId) || false;
  }
}

/** Singleton subscription manager instance */
const subscriptionManager = new SubscriptionManagerImpl();

// ════════════════════════════════════════════════════════════════════════════
// BATTLEFIELD STATE BUILDER
// ════════════════════════════════════════════════════════════════════════════

/**
 * Determine entity status based on HP and conditions.
 */
function determineEntityStatus(
  hp: number,
  conditionNames: string[]
): 'alive' | 'unconscious' | 'dead' | 'stable' {
  if (hp > 0) return 'alive';
  
  if (conditionNames.includes('dead')) return 'dead';
  if (conditionNames.includes('stable')) return 'stable';
  return 'unconscious';
}

/**
 * Generate a display symbol for an entity.
 * Allies get uppercase letters, enemies get lowercase.
 */
function generateEntitySymbol(name: string, isEnemy: boolean): string {
  return isEnemy 
    ? name.charAt(0).toLowerCase() 
    : name.charAt(0).toUpperCase();
}

/**
 * Parse a terrain position string "x,y" or "x,y,w,h" into structured data.
 * 
 * @param posStr - Position string like "5,3" or "5,3,2,2"
 * @returns Parsed position with optional dimensions
 */
function parseTerrainPosition(posStr: string): { x: number; y: number; width: number; height: number } | null {
  const parts = posStr.split(',').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
    return null;
  }
  return {
    x: parts[0],
    y: parts[1],
    width: parts[2] || 1,
    height: parts[3] || 1,
  };
}

/**
 * Parse terrain array (strings or objects) into structured terrain features.
 * 
 * @param items - Array of position strings or terrain objects
 * @returns Array of structured terrain features
 */
function parseTerrainArray<T extends { x: number; y: number; width: number; height: number }>(
  items: unknown[] | undefined
): T[] {
  if (!items) return [];
  
  const result: T[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      const parsed = parseTerrainPosition(item);
      if (parsed) {
        result.push(parsed as T);
      }
    } else if (typeof item === 'object' && item !== null) {
      result.push(item as T);
    }
  }
  return result;
}

/**
 * Build a complete BattlefieldState from an encounter.
 * 
 * Transforms the internal encounter representation into a format
 * optimized for external visualizers.
 * 
 * @param encounterId - The encounter to build state for
 * @returns BattlefieldState or null if encounter not found
 */
function buildBattlefieldState(encounterId: string): BattlefieldState | null {
  const encounter = getEncounterState(encounterId);
  if (!encounter) {
    return null;
  }

  const currentParticipant = encounter.participants[encounter.currentTurnIndex];
  const currentTurnId = currentParticipant?.id || '';

  // Transform participants to BattlefieldEntity format
  const entities: BattlefieldEntity[] = encounter.participants.map(p => {
    const activeConditions = getActiveConditions(p.id);
    const conditionNames = activeConditions.map(c => c.condition);
    const status = determineEntityStatus(p.hp, conditionNames);
    const symbol = generateEntitySymbol(p.name, p.isEnemy || false);

    return {
      id: p.id,
      name: p.name,
      symbol,
      position: {
        x: p.position.x,
        y: p.position.y,
        z: p.position.z || 0,
      },
      hp: p.hp,
      maxHp: p.maxHp,
      ac: p.ac,
      speed: p.speed || 30,
      isEnemy: p.isEnemy || false,
      isCurrentTurn: p.id === currentTurnId,
      conditions: conditionNames,
      status,
    };
  });

  // Parse terrain features
  const terrain = encounter.terrain;
  const obstacles = parseTerrainArray<TerrainState['obstacles'][0]>(terrain.obstacles);
  const difficultTerrain = parseTerrainArray<TerrainState['difficultTerrain'][0]>(terrain.difficultTerrain);
  const water = parseTerrainArray<TerrainState['water'][0]>(terrain.water);
  
  // Hazards have special format with position and type
  const hazards: TerrainState['hazards'] = [];
  if (terrain.hazards) {
    for (const h of terrain.hazards) {
      if (typeof h === 'object' && 'position' in h) {
        const [x, y] = (h.position as string).split(',').map(Number);
        hazards.push({ x, y, width: 1, height: 1, type: h.type });
      }
    }
  }

  return {
    encounterId: encounter.id,
    round: encounter.round,
    currentTurnId,
    terrain: {
      width: terrain.width,
      height: terrain.height,
      obstacles,
      difficultTerrain,
      water,
      hazards,
    },
    entities,
    lighting: encounter.lighting,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// WEBSOCKET SERVER
// ════════════════════════════════════════════════════════════════════════════

/** Singleton WebSocket server instance */
let wsServer: WebSocketServer | null = null;

/**
 * Create and attach a WebSocket server to an existing HTTP server.
 * 
 * Uses HTTP upgrade to handle WebSocket connections on the same port
 * as the HTTP server. This is the recommended setup for production.
 * 
 * @param httpServer - The HTTP server to attach to
 * @returns The created WebSocketServer instance
 * 
 * @example
 * ```typescript
 * const httpServer = createServer(app);
 * const wss = createWebSocketServer(httpServer);
 * httpServer.listen(8080);
 * ```
 */
export function createWebSocketServer(httpServer: Server): WebSocketServer {
  wsServer = new WebSocketServer({ server: httpServer });

  wsServer.on('connection', (ws: WebSocket) => {
    handleWebSocketConnection(ws);
  });

  return wsServer;
}

// ════════════════════════════════════════════════════════════════════════════
// CONNECTION HANDLING
// ════════════════════════════════════════════════════════════════════════════

/**
 * Handle a new WebSocket connection.
 * Sets up message handling and cleanup on disconnect.
 * 
 * @param ws - The WebSocket connection to handle
 */
export function handleWebSocketConnection(ws: WebSocket): void {
  ws.on('message', (data: WebSocket.Data) => {
    handleIncomingMessage(ws, data);
  });

  ws.on('close', () => {
    subscriptionManager.unsubscribeAll(ws);
  });

  ws.on('error', () => {
    subscriptionManager.unsubscribeAll(ws);
  });
}

/**
 * Process an incoming WebSocket message.
 * Parses JSON and routes to appropriate handler.
 */
function handleIncomingMessage(ws: WebSocket, data: WebSocket.Data): void {
  try {
    const raw = data.toString();
    
    // Reject empty messages
    if (!raw || raw.trim() === '') {
      sendError(ws, 'Empty message received');
      return;
    }

    // Parse JSON
    let message: WSClientMessage;
    try {
      message = JSON.parse(raw);
    } catch {
      sendError(ws, 'Failed to parse JSON message');
      return;
    }

    // Route by message type
    switch (message.type) {
      case 'ping':
        sendMessage(ws, { type: 'pong' });
        break;

      case 'subscribe':
        handleSubscribe(ws, message.encounterId);
        break;

      case 'unsubscribe':
        handleUnsubscribe(ws, message.encounterId);
        break;

      default:
        sendError(ws, `Unknown message type: ${(message as { type: string }).type}`);
    }
  } catch (err) {
    sendError(ws, `Error processing message: ${err}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MESSAGE HANDLERS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Handle subscription request from a client.
 * Idempotent - re-subscribing sends current state.
 */
function handleSubscribe(ws: WebSocket, encounterId: string): void {
  // Build battlefield state (validates encounter exists)
  const state = buildBattlefieldState(encounterId);
  if (!state) {
    sendError(ws, `Encounter not found: ${encounterId}`);
    return;
  }

  // Add subscription (idempotent)
  if (!subscriptionManager.isSubscribed(ws, encounterId)) {
    subscriptionManager.subscribe(ws, encounterId);
  }

  // Always send current state on subscribe
  sendMessage(ws, { type: 'subscribed', encounterId, state });
}

/**
 * Handle unsubscription request from a client.
 */
function handleUnsubscribe(ws: WebSocket, encounterId: string): void {
  subscriptionManager.unsubscribe(ws, encounterId);
  sendMessage(ws, { type: 'unsubscribed', encounterId });
}

// ════════════════════════════════════════════════════════════════════════════
// MESSAGE SENDING
// ════════════════════════════════════════════════════════════════════════════

/**
 * Send a message to a WebSocket client.
 * Only sends if the connection is open.
 */
function sendMessage(ws: WebSocket, message: WSServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Send an error message to a WebSocket client.
 */
function sendError(ws: WebSocket, message: string): void {
  sendMessage(ws, { type: 'error', message });
}

// ════════════════════════════════════════════════════════════════════════════
// BROADCASTING
// ════════════════════════════════════════════════════════════════════════════

/**
 * Broadcast a state delta to all clients subscribed to an encounter.
 * 
 * Call this from combat actions (movement, attacks, condition changes, etc.)
 * to push real-time updates to connected visualizers.
 * 
 * @param encounterId - The encounter that changed
 * @param delta - The state change to broadcast
 * 
 * @example
 * ```typescript
 * // After moving an entity
 * broadcastToEncounter('enc_123', {
 *   type: 'entityMoved',
 *   entityId: 'fighter_1',
 *   from: { x: 5, y: 3, z: 0 },
 *   to: { x: 7, y: 3, z: 0 }
 * });
 * ```
 */
export function broadcastToEncounter(encounterId: string, delta: StateDelta): void {
  const subscribers = subscriptionManager.getSubscribersForEncounter(encounterId);
  
  if (subscribers.size === 0) {
    return; // No subscribers, skip serialization
  }

  const message: WSServerMessage = {
    type: 'delta',
    encounterId,
    delta,
  };

  const messageStr = JSON.stringify(message);

  for (const ws of subscribers) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(messageStr);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════════════════════

/**
 * Get the subscription manager for querying subscription state.
 * 
 * @returns The subscription manager instance
 * 
 * @example
 * ```typescript
 * const manager = getSubscriptionManager();
 * const count = manager.getSubscriberCount('enc_123');
 * console.log(`${count} clients watching this encounter`);
 * ```
 */
export function getSubscriptionManager(): SubscriptionManager {
  return subscriptionManager;
}
