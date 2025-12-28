/**
 * Test Helpers - Utils for working with SDK types
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Extract text content from a CallToolResult
 * Handles the SDK's union type for content
 */
export function getTextContent(result: CallToolResult): string {
  const content = result.content[0];
  if (content && content.type === 'text') {
    return content.text;
  }
  return '';
}
