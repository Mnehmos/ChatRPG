import { describe, it, expect, beforeEach } from 'vitest';
import { 
  toolRegistry, 
  handleToolCall, 
  success, 
  error,
  getToolCallCount,
  getAllToolCallCounts,
  resetToolCallCounts
} from '../../src/registry.js';

describe('Tool Registry', () => {
  beforeEach(() => {
    resetToolCallCounts();
  });

  describe('Static Loading', () => {
    it('should have at least one tool registered', () => {
      const toolCount = Object.keys(toolRegistry).length;
      expect(toolCount).toBeGreaterThan(0);
    });

    it('should have roll_dice tool registered', () => {
      expect(toolRegistry['roll_dice']).toBeDefined();
      expect(toolRegistry['roll_dice'].name).toBe('roll_dice');
    });

    it('should have valid inputSchema for each tool', () => {
      for (const [name, tool] of Object.entries(toolRegistry)) {
        // Schema should have either type: 'object' OR anyOf/oneOf (for unions)
        const hasType = tool.inputSchema.type === 'object';
        const hasAnyOf = 'anyOf' in tool.inputSchema;
        const hasOneOf = 'oneOf' in tool.inputSchema;

        expect(hasType || hasAnyOf || hasOneOf).toBe(true);

        if (hasType) {
          expect(tool.inputSchema.properties).toBeDefined();
        }
      }
    });
  });

  describe('handleToolCall', () => {
    it('should return error for unknown tool', async () => {
      const result = await handleToolCall('nonexistent_tool', {});
      expect(result.isError).toBe(true);
    });

    it('should call tool handler and return result', async () => {
      const result = await handleToolCall('roll_dice', { expression: '2d6' });
      const content = result.content[0];
      if (content.type === 'text') {
        expect(content.text).toContain('╔'); // ASCII box border
        expect(content.text).toContain('2d6');
      }
    });
  });

  describe('Response Helpers', () => {
    it('success() should return formatted markdown', () => {
      const result = success('# Test\n**Bold**');
      expect(result.content[0].type).toBe('text');
      const content = result.content[0];
      if (content.type === 'text') {
        expect(content.text).toBe('# Test\n**Bold**');
      }
      expect(result.isError).toBeUndefined();
    });

    it('error() should return formatted error with isError flag', () => {
      const result = error('Something went wrong');
      expect(result.isError).toBe(true);
      const content = result.content[0];
      if (content.type === 'text') {
        expect(content.text).toContain('[ERROR]');
        expect(content.text).toContain('Something went wrong');
      }
    });
  });

  describe('Tool Call Tracking', () => {
    it('should start with zero counts', () => {
      expect(getToolCallCount('roll_dice')).toBe(0);
      expect(getAllToolCallCounts()).toEqual({});
    });

    it('should track tool calls', async () => {
      await handleToolCall('roll_dice', { expression: '1d20' });
      expect(getToolCallCount('roll_dice')).toBe(1);
      
      await handleToolCall('roll_dice', { expression: '2d6' });
      expect(getToolCallCount('roll_dice')).toBe(2);
    });

    it('should track multiple tools separately', async () => {
      await handleToolCall('roll_dice', { expression: '1d20' });
      await handleToolCall('roll_dice', { expression: '1d20' });
      // Unknown tool call doesn't increment
      await handleToolCall('unknown_tool', {});
      
      const counts = getAllToolCallCounts();
      expect(counts['roll_dice']).toBe(2);
      expect(counts['unknown_tool']).toBeUndefined();
    });

    it('should reset counts', async () => {
      await handleToolCall('roll_dice', { expression: '1d20' });
      expect(getToolCallCount('roll_dice')).toBe(1);
      
      resetToolCallCounts();
      expect(getToolCallCount('roll_dice')).toBe(0);
    });
  });
});
