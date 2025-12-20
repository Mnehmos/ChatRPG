import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Server } from 'http';
import WebSocket from 'ws';

// Import the WebSocket module we'll create
import {
  createWebSocketServer,
  handleWebSocketConnection,
  broadcastToEncounter,
  getSubscriptionManager,
  type WSClientMessage,
  type WSServerMessage,
  type BattlefieldState,
  type StateDelta
} from '../../src/websocket.js';

// Import handleToolCall for integration tests
import { handleToolCall } from '../../src/registry.js';
import { clearAllEncounters, getEncounterState } from '../../src/modules/combat.js';
import { getTextContent } from '../helpers.js';

// Helper to extract encounter ID from create_encounter output
function extractEncounterId(text: string): string {
  const match = text.match(/Encounter ID:\s*([a-f0-9-]+)/i);
  return match ? match[1] : '';
}

describe('WebSocket Battlefield Broadcasting', () => {
  let httpServer: Server;
  let wsServer: ReturnType<typeof createWebSocketServer>;
  let clientWs: WebSocket;
  const TEST_PORT = 8081; // Use different port for tests

  beforeEach(() => {
    clearAllEncounters();
    httpServer = new Server();
    httpServer.listen(TEST_PORT);
  });

  afterEach(async () => {
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
    if (wsServer) {
      wsServer.close();
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  // Helper to create a WebSocket client and wait for connection
  const createClient = (): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
  };

  // Helper to wait for a specific message type
  const waitForMessage = <T extends WSServerMessage['type']>(
    ws: WebSocket,
    type: T,
    timeout = 5000
  ): Promise<Extract<WSServerMessage, { type: T }>> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeout);
      const handler = (data: WebSocket.Data) => {
        const msg = JSON.parse(data.toString()) as WSServerMessage;
        if (msg.type === type) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(msg as Extract<WSServerMessage, { type: T }>);
        }
      };
      ws.on('message', handler);
    });
  };

  describe('Connection Handling', () => {
    it('should accept WebSocket connections on the same port as HTTP', async () => {
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      expect(clientWs.readyState).toBe(WebSocket.OPEN);
    });

    it('should handle HTTP upgrade request for WebSocket', async () => {
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      // If we got here without error, upgrade worked
      expect(clientWs.readyState).toBe(WebSocket.OPEN);
    });

    it('should respond to ping with pong', async () => {
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      const pingMsg: WSClientMessage = { type: 'ping' };
      clientWs.send(JSON.stringify(pingMsg));
      
      const pong = await waitForMessage(clientWs, 'pong');
      expect(pong.type).toBe('pong');
    });

    it('should send error for malformed JSON', async () => {
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      clientWs.send('not valid json {{{');
      
      const error = await waitForMessage(clientWs, 'error');
      expect(error.type).toBe('error');
      expect(error.message).toContain('parse');
    });

    it('should send error for unknown message type', async () => {
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      clientWs.send(JSON.stringify({ type: 'unknownType', data: {} }));
      
      const error = await waitForMessage(clientWs, 'error');
      expect(error.type).toBe('error');
      expect(error.message).toContain('unknown');
    });

    it('should clean up subscriptions when client disconnects', async () => {
      // Create an encounter first
      const result = await handleToolCall('create_encounter', {
        participants: [{ id: 'p1', name: 'Hero', hp: 20, maxHp: 20, ac: 12, position: { x: 0, y: 0 } }],
        terrain: { width: 10, height: 10 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      // Subscribe to an encounter
      const subscribeMsg: WSClientMessage = { 
        type: 'subscribe', 
        encounterId: encId
      };
      clientWs.send(JSON.stringify(subscribeMsg));
      await waitForMessage(clientWs, 'subscribed');
      
      // Verify subscription exists
      const manager = getSubscriptionManager();
      expect(manager.getSubscriberCount(encId)).toBe(1);
      
      // Close client
      clientWs.close();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify subscription cleaned up
      expect(manager.getSubscriberCount(encId)).toBe(0);
    });
  });

  describe('Subscription Management', () => {
    it('should allow subscribing to an encounter', async () => {
      // Create an encounter first
      const result = await handleToolCall('create_encounter', {
        participants: [{ id: 'hero-1', name: 'Hero', hp: 20, maxHp: 20, ac: 12, position: { x: 0, y: 0 } }],
        terrain: { width: 10, height: 10 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      const subscribeMsg: WSClientMessage = { 
        type: 'subscribe', 
        encounterId: encId
      };
      clientWs.send(JSON.stringify(subscribeMsg));
      
      const response = await waitForMessage(clientWs, 'subscribed');
      expect(response.encounterId).toBe(encId);
    });

    it('should send full BattlefieldState on subscribe', async () => {
      // First create an encounter using handleToolCall
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'hero-1', name: 'Test Hero', hp: 30, maxHp: 30, ac: 15, position: { x: 0, y: 0 } }
        ],
        terrain: { width: 10, height: 10 }
      });
      const encounterId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      const subscribeMsg: WSClientMessage = { 
        type: 'subscribe', 
        encounterId
      };
      clientWs.send(JSON.stringify(subscribeMsg));
      
      const response = await waitForMessage(clientWs, 'subscribed');
      expect(response.state).toBeDefined();
      expect(response.state.encounterId).toBe(encounterId);
      expect(response.state.terrain).toBeDefined();
      expect(response.state.entities).toBeDefined();
    });

    it('should allow subscribing to multiple encounters', async () => {
      // Create two encounters first
      const result1 = await handleToolCall('create_encounter', {
        participants: [{ id: 'p1', name: 'Hero1', hp: 20, maxHp: 20, ac: 12, position: { x: 0, y: 0 } }],
        terrain: { width: 10, height: 10 }
      });
      const result2 = await handleToolCall('create_encounter', {
        participants: [{ id: 'p2', name: 'Hero2', hp: 20, maxHp: 20, ac: 12, position: { x: 0, y: 0 } }],
        terrain: { width: 10, height: 10 }
      });
      const enc1 = extractEncounterId(getTextContent(result1));
      const enc2 = extractEncounterId(getTextContent(result2));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      // Subscribe to first encounter
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: enc1 }));
      const resp1 = await waitForMessage(clientWs, 'subscribed');
      expect(resp1.encounterId).toBe(enc1);
      
      // Subscribe to second encounter
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: enc2 }));
      const resp2 = await waitForMessage(clientWs, 'subscribed');
      expect(resp2.encounterId).toBe(enc2);
      
      // Verify subscriber counts - both encounters should have 1 subscriber from this client
      const manager = getSubscriptionManager();
      expect(manager.getSubscriberCount(enc1)).toBe(1);
      expect(manager.getSubscriberCount(enc2)).toBe(1);
    });

    it('should allow unsubscribing from an encounter', async () => {
      // Create encounter first
      const result = await handleToolCall('create_encounter', {
        participants: [{ id: 'p1', name: 'Hero', hp: 20, maxHp: 20, ac: 12, position: { x: 0, y: 0 } }],
        terrain: { width: 10, height: 10 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      // Subscribe
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      await waitForMessage(clientWs, 'subscribed');
      
      // Unsubscribe
      const unsubMsg: WSClientMessage = { type: 'unsubscribe', encounterId: encId };
      clientWs.send(JSON.stringify(unsubMsg));
      
      const response = await waitForMessage(clientWs, 'unsubscribed');
      expect(response.encounterId).toBe(encId);
    });

    it('should not receive deltas after unsubscribing', async () => {
      // Create encounter first
      const result = await handleToolCall('create_encounter', {
        participants: [{ id: 'p1', name: 'Hero', hp: 20, maxHp: 20, ac: 12, position: { x: 0, y: 0 } }],
        terrain: { width: 10, height: 10 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      // Subscribe then unsubscribe
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      await waitForMessage(clientWs, 'subscribed');
      
      clientWs.send(JSON.stringify({ type: 'unsubscribe', encounterId: encId }));
      await waitForMessage(clientWs, 'unsubscribed');
      
      // Try to broadcast - should not receive
      const receivedMessages: WSServerMessage[] = [];
      clientWs.on('message', (data) => {
        receivedMessages.push(JSON.parse(data.toString()));
      });
      
      broadcastToEncounter(encId, {
        type: 'entityMoved',
        entityId: 'char-1',
        from: { x: 0, y: 0, z: 0 },
        to: { x: 1, y: 1, z: 0 }
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      const deltas = receivedMessages.filter(m => m.type === 'delta');
      expect(deltas).toHaveLength(0);
    });

    it('should error when subscribing to non-existent encounter', async () => {
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      clientWs.send(JSON.stringify({ 
        type: 'subscribe', 
        encounterId: 'does-not-exist-12345' 
      }));
      
      const error = await waitForMessage(clientWs, 'error');
      expect(error.message).toContain('not found');
    });
  });

  describe('Delta Broadcasts', () => {
    it('should broadcast entity movement delta', async () => {
      // Create encounter to subscribe to
      const result = await handleToolCall('create_encounter', {
        participants: [{ id: 'hero-1', name: 'Hero', hp: 30, maxHp: 30, ac: 15, position: { x: 0, y: 0 } }],
        terrain: { width: 10, height: 10 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      await waitForMessage(clientWs, 'subscribed');
      
      const delta: StateDelta = {
        type: 'entityMoved',
        entityId: 'hero-1',
        from: { x: 0, y: 0, z: 0 },
        to: { x: 5, y: 3, z: 0 }
      };
      
      broadcastToEncounter(encId, delta);
      
      const msg = await waitForMessage(clientWs, 'delta');
      expect(msg.encounterId).toBe(encId);
      expect(msg.delta.type).toBe('entityMoved');
      expect((msg.delta as any).to).toEqual({ x: 5, y: 3, z: 0 });
    });

    it('should broadcast HP change delta', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [{ id: 'hero-1', name: 'Hero', hp: 30, maxHp: 30, ac: 15, position: { x: 0, y: 0 } }],
        terrain: { width: 10, height: 10 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      await waitForMessage(clientWs, 'subscribed');
      
      const delta: StateDelta = {
        type: 'hpChanged',
        entityId: 'hero-1',
        previousHp: 30,
        currentHp: 22,
        maxHp: 30,
        damage: 8
      };
      
      broadcastToEncounter(encId, delta);
      
      const msg = await waitForMessage(clientWs, 'delta');
      expect(msg.delta.type).toBe('hpChanged');
      expect((msg.delta as any).damage).toBe(8);
    });

    it('should broadcast condition added delta', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [{ id: 'target-1', name: 'Target', hp: 20, maxHp: 20, ac: 12, position: { x: 0, y: 0 } }],
        terrain: { width: 10, height: 10 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      await waitForMessage(clientWs, 'subscribed');
      
      const delta: StateDelta = {
        type: 'conditionAdded',
        entityId: 'target-1',
        condition: 'prone',
        duration: 1
      };
      
      broadcastToEncounter(encId, delta);
      
      const msg = await waitForMessage(clientWs, 'delta');
      expect(msg.delta.type).toBe('conditionAdded');
      expect((msg.delta as any).condition).toBe('prone');
    });

    it('should broadcast turn change delta', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [
          { id: 'hero-1', name: 'Hero', hp: 20, maxHp: 20, ac: 12, position: { x: 0, y: 0 } },
          { id: 'goblin-1', name: 'Goblin', hp: 10, maxHp: 10, ac: 12, position: { x: 5, y: 0 }, isEnemy: true }
        ],
        terrain: { width: 10, height: 10 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      await waitForMessage(clientWs, 'subscribed');
      
      const delta: StateDelta = {
        type: 'turnChanged',
        previousEntityId: 'hero-1',
        currentEntityId: 'goblin-1',
        round: 2
      };
      
      broadcastToEncounter(encId, delta);
      
      const msg = await waitForMessage(clientWs, 'delta');
      expect(msg.delta.type).toBe('turnChanged');
      expect((msg.delta as any).currentEntityId).toBe('goblin-1');
    });

    it('should broadcast to multiple subscribers', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [{ id: 'char-1', name: 'Char', hp: 20, maxHp: 20, ac: 12, position: { x: 0, y: 0 } }],
        terrain: { width: 10, height: 10 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      
      // Create two clients
      const client1 = await createClient();
      const client2 = await createClient();
      
      // Both subscribe to same encounter
      client1.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      client2.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      
      await waitForMessage(client1, 'subscribed');
      await waitForMessage(client2, 'subscribed');
      
      // Broadcast delta
      const delta: StateDelta = {
        type: 'entityMoved',
        entityId: 'char-1',
        from: { x: 0, y: 0, z: 0 },
        to: { x: 1, y: 1, z: 0 }
      };
      
      broadcastToEncounter(encId, delta);
      
      // Both should receive
      const [msg1, msg2] = await Promise.all([
        waitForMessage(client1, 'delta'),
        waitForMessage(client2, 'delta')
      ]);
      
      expect((msg1.delta as any).entityId).toBe('char-1');
      expect((msg2.delta as any).entityId).toBe('char-1');
      
      client1.close();
      client2.close();
    });
  });

  describe('BattlefieldState Structure', () => {
    it('should include terrain dimensions in state', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [{ id: 'p1', name: 'Hero', hp: 20, maxHp: 20, ac: 12, position: { x: 0, y: 0 } }],
        terrain: { width: 15, height: 20 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      
      const response = await waitForMessage(clientWs, 'subscribed');
      expect(response.state.terrain.width).toBe(15);
      expect(response.state.terrain.height).toBe(20);
    });

    it('should include entity positions in state', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [{ id: 'hero-1', name: 'Positioned Hero', hp: 25, maxHp: 25, ac: 15, position: { x: 3, y: 4 } }],
        terrain: { width: 10, height: 10 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      
      const response = await waitForMessage(clientWs, 'subscribed');
      const hero = response.state.entities.find((e: any) => e.name === 'Positioned Hero');
      expect(hero).toBeDefined();
      expect(hero!.position).toEqual({ x: 3, y: 4, z: 0 });
    });

    it('should include entity conditions in state', async () => {
      // Create encounter with participant
      const result = await handleToolCall('create_encounter', {
        participants: [{ id: 'conditioned-1', name: 'Conditioned', hp: 20, maxHp: 20, ac: 12, position: { x: 0, y: 0 } }],
        terrain: { width: 10, height: 10 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      // Add condition
      await handleToolCall('manage_condition', {
        encounterId: encId,
        targetId: 'conditioned-1',
        operation: 'add',
        condition: 'poisoned'
      });
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      
      const response = await waitForMessage(clientWs, 'subscribed');
      const entity = response.state.entities.find((e: any) => e.name === 'Conditioned');
      expect(entity).toBeDefined();
      expect(entity!.conditions).toContain('poisoned');
    });

    it('should include current turn info in state', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [{ id: 'turn-hero', name: 'Turn Hero', hp: 30, maxHp: 30, ac: 16, position: { x: 0, y: 0 }, initiativeBonus: 5 }],
        terrain: { width: 10, height: 10 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      
      const response = await waitForMessage(clientWs, 'subscribed');
      expect(response.state.round).toBeDefined();
      expect(response.state.currentTurnId).toBeDefined();
    });

    it('should include obstacles in terrain state', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [{ id: 'p1', name: 'Hero', hp: 20, maxHp: 20, ac: 12, position: { x: 0, y: 0 } }],
        terrain: { 
          width: 10, 
          height: 10,
          obstacles: ['2,2,2,2']
        }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      
      const response = await waitForMessage(clientWs, 'subscribed');
      expect(response.state.terrain.obstacles).toBeDefined();
      expect(response.state.terrain.obstacles).toHaveLength(1);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle rapid subscribe/unsubscribe', async () => {
      // Create encounters first
      const encIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const result = await handleToolCall('create_encounter', {
          participants: [{ id: `p${i}`, name: `Hero${i}`, hp: 20, maxHp: 20, ac: 12, position: { x: 0, y: 0 } }],
          terrain: { width: 10, height: 10 }
        });
        encIds.push(extractEncounterId(getTextContent(result)));
      }
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      // Rapid fire subscribe/unsubscribe
      for (const encId of encIds) {
        clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
        clientWs.send(JSON.stringify({ type: 'unsubscribe', encounterId: encId }));
      }
      
      // Give time for processing
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const manager = getSubscriptionManager();
      for (const encId of encIds) {
        expect(manager.getSubscriberCount(encId)).toBe(0);
      }
    });

    it('should handle duplicate subscription gracefully', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [{ id: 'p1', name: 'Hero', hp: 20, maxHp: 20, ac: 12, position: { x: 0, y: 0 } }],
        terrain: { width: 10, height: 10 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      // Subscribe twice to same encounter
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      await waitForMessage(clientWs, 'subscribed');
      
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      const response = await waitForMessage(clientWs, 'subscribed');
      
      // Should still work, not error
      expect(response.encounterId).toBe(encId);
      
      const manager = getSubscriptionManager();
      // Should only have one subscription, not two
      expect(manager.getSubscriberCount(encId)).toBe(1);
    });

    it('should handle unsubscribe from non-subscribed encounter', async () => {
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      // Unsubscribe without subscribing first
      clientWs.send(JSON.stringify({ type: 'unsubscribe', encounterId: 'never-subbed' }));
      
      // Should either succeed silently or send an appropriate response
      const response = await waitForMessage(clientWs, 'unsubscribed');
      expect(response.encounterId).toBe('never-subbed');
    });

    it('should handle broadcast to encounter with no subscribers', () => {
      wsServer = createWebSocketServer(httpServer);
      
      // This should not throw
      expect(() => {
        broadcastToEncounter('no-subscribers', {
          type: 'entityMoved',
          entityId: 'test',
          from: { x: 0, y: 0, z: 0 },
          to: { x: 1, y: 1, z: 0 }
        });
      }).not.toThrow();
    });

    it('should handle client sending empty message', async () => {
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      clientWs.send('');
      
      const error = await waitForMessage(clientWs, 'error');
      expect(error.type).toBe('error');
    });
  });

  describe('Integration with Combat System', () => {
    // These tests verify the combat module auto-broadcasts deltas to WebSocket subscribers.
    // Combat actions (attacks, movement, conditions, turns) trigger real-time updates.
    
    it('should auto-broadcast when executeAction causes damage', async () => {
      const result = await handleToolCall('create_encounter', {
        seed: 'broadcast-attack-test',
        participants: [
          { id: 'attacker', name: 'Attacker', hp: 30, maxHp: 30, ac: 15, initiativeBonus: 10, position: { x: 0, y: 0 } },
          { id: 'defender', name: 'Defender', hp: 30, maxHp: 30, ac: 10, initiativeBonus: 0, position: { x: 1, y: 0 }, isEnemy: true }
        ],
        terrain: { width: 10, height: 10 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      await waitForMessage(clientWs, 'subscribed');
      
      // Execute attack - should trigger delta broadcast
      await handleToolCall('execute_action', {
        encounterId: encId,
        actorId: 'attacker',
        actionType: 'attack',
        targetId: 'defender',
        damageExpression: '1d8+3',
        damageType: 'slashing'
      });
      
      // Should receive HP change delta
      const delta = await waitForMessage(clientWs, 'delta');
      expect(['hpChanged', 'attackResult']).toContain(delta.delta.type);
    });

    it('should auto-broadcast when advanceTurn changes current entity', async () => {
      const result = await handleToolCall('create_encounter', {
        seed: 'broadcast-turn-test',
        participants: [
          { id: 'first', name: 'First', hp: 20, maxHp: 20, ac: 12, initiativeBonus: 10, position: { x: 0, y: 0 } },
          { id: 'second', name: 'Second', hp: 20, maxHp: 20, ac: 12, initiativeBonus: 0, position: { x: 1, y: 0 }, isEnemy: true }
        ],
        terrain: { width: 10, height: 10 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      await waitForMessage(clientWs, 'subscribed');
      
      // Advance turn
      await handleToolCall('advance_turn', { encounterId: encId });
      
      const delta = await waitForMessage(clientWs, 'delta');
      expect(delta.delta.type).toBe('turnChanged');
    });

    it('should auto-broadcast when manageCondition adds condition', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [{ id: 'target', name: 'CondTarget', hp: 25, maxHp: 25, ac: 14, position: { x: 0, y: 0 } }],
        terrain: { width: 10, height: 10 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      await waitForMessage(clientWs, 'subscribed');
      
      // Add condition
      await handleToolCall('manage_condition', {
        encounterId: encId,
        targetId: 'target',
        operation: 'add',
        condition: 'frightened'
      });
      
      const delta = await waitForMessage(clientWs, 'delta');
      expect(delta.delta.type).toBe('conditionAdded');
      expect((delta.delta as any).condition).toBe('frightened');
    });

    it('should auto-broadcast when manageCondition removes condition', async () => {
      const result = await handleToolCall('create_encounter', {
        participants: [{ id: 'target', name: 'CondTarget', hp: 25, maxHp: 25, ac: 14, position: { x: 0, y: 0 } }],
        terrain: { width: 10, height: 10 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      // Add condition first
      await handleToolCall('manage_condition', {
        encounterId: encId,
        targetId: 'target',
        operation: 'add',
        condition: 'poisoned'
      });
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      await waitForMessage(clientWs, 'subscribed');
      
      // Remove condition
      await handleToolCall('manage_condition', {
        encounterId: encId,
        targetId: 'target',
        operation: 'remove',
        condition: 'poisoned'
      });
      
      const delta = await waitForMessage(clientWs, 'delta');
      expect(delta.delta.type).toBe('conditionRemoved');
      expect((delta.delta as any).condition).toBe('poisoned');
    });

    it('should auto-broadcast when entity moves via executeAction', async () => {
      const result = await handleToolCall('create_encounter', {
        seed: 'broadcast-move-test',
        participants: [
          { id: 'mover', name: 'Mover', hp: 30, maxHp: 30, ac: 15, initiativeBonus: 10, position: { x: 0, y: 0 }, speed: 30 }
        ],
        terrain: { width: 10, height: 10 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      await waitForMessage(clientWs, 'subscribed');
      
      // Move entity (dash + move)
      await handleToolCall('execute_action', {
        encounterId: encId,
        actorId: 'mover',
        actionType: 'dash',
        moveTo: { x: 5, y: 3, z: 0 }
      });
      
      const delta = await waitForMessage(clientWs, 'delta');
      expect(delta.delta.type).toBe('entityMoved');
      expect((delta.delta as any).entityId).toBe('mover');
      expect((delta.delta as any).from).toEqual({ x: 0, y: 0, z: 0 });
      expect((delta.delta as any).to).toEqual({ x: 5, y: 3, z: 0 });
    });

    it('should auto-broadcast attackResult with hit details', async () => {
      const result = await handleToolCall('create_encounter', {
        seed: 'broadcast-attack-details',
        participants: [
          { id: 'attacker', name: 'Fighter', hp: 40, maxHp: 40, ac: 16, initiativeBonus: 5, position: { x: 0, y: 0 } },
          { id: 'target', name: 'Goblin', hp: 10, maxHp: 10, ac: 12, initiativeBonus: 2, position: { x: 1, y: 0 }, isEnemy: true }
        ],
        terrain: { width: 10, height: 10 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      await waitForMessage(clientWs, 'subscribed');
      
      // Execute attack with manual roll to guarantee hit
      await handleToolCall('execute_action', {
        encounterId: encId,
        actorId: 'attacker',
        actionType: 'attack',
        targetId: 'target',
        damageExpression: '2d6+4',
        damageType: 'slashing',
        manualAttackRoll: 18  // Guaranteed hit vs AC 12
      });
      
      // Should receive attack result delta
      const delta = await waitForMessage(clientWs, 'delta');
      expect(delta.delta.type).toBe('attackResult');
      expect((delta.delta as any).attackerId).toBe('attacker');
      expect((delta.delta as any).targetId).toBe('target');
      expect((delta.delta as any).hit).toBe(true);
    });

    it('should broadcast hpChanged after attackResult when damage dealt', async () => {
      const result = await handleToolCall('create_encounter', {
        seed: 'broadcast-hp-change',
        participants: [
          { id: 'attacker', name: 'Fighter', hp: 40, maxHp: 40, ac: 16, initiativeBonus: 5, position: { x: 0, y: 0 } },
          { id: 'target', name: 'Goblin', hp: 10, maxHp: 10, ac: 5, initiativeBonus: 2, position: { x: 1, y: 0 }, isEnemy: true }
        ],
        terrain: { width: 10, height: 10 }
      });
      const encId = extractEncounterId(getTextContent(result));
      
      wsServer = createWebSocketServer(httpServer);
      clientWs = await createClient();
      
      clientWs.send(JSON.stringify({ type: 'subscribe', encounterId: encId }));
      await waitForMessage(clientWs, 'subscribed');
      
      // Set up collector for deltas BEFORE triggering the action
      const deltas: any[] = [];
      const collectDeltas = new Promise<void>((resolve) => {
        const handler = (data: WebSocket.Data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'delta') {
            deltas.push(msg);
            // We expect 2 deltas: attackResult and hpChanged
            if (deltas.length >= 2) {
              clientWs.off('message', handler);
              resolve();
            }
          }
        };
        clientWs.on('message', handler);
        // Timeout safety
        setTimeout(() => {
          clientWs.off('message', handler);
          resolve();
        }, 2000);
      });
      
      // Execute attack with manual rolls
      await handleToolCall('execute_action', {
        encounterId: encId,
        actorId: 'attacker',
        actionType: 'attack',
        targetId: 'target',
        damageExpression: '1d6+2',
        damageType: 'slashing',
        manualAttackRoll: 15,  // Hit
        manualDamageRoll: 5   // Total damage = 5 (manualDamageRoll is total, not dice only)
      });
      
      // Wait for deltas to be collected
      await collectDeltas;
      
      const types = deltas.map(d => d.delta.type);
      expect(types).toContain('attackResult');
      expect(types).toContain('hpChanged');
      
      const hpDelta = deltas.find(d => d.delta.type === 'hpChanged');
      expect(hpDelta.delta.entityId).toBe('target');
      expect(hpDelta.delta.previousHp).toBe(10);
      expect(hpDelta.delta.damage).toBe(5);  // manualDamageRoll sets total damage
    });
  });
});
