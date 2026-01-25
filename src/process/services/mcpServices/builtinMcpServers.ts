/**
 * @license
 * Copyright 2025 CodeConductor (CodeConductor.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMcpServer } from '@/common/storage';
import { imageGenerationService } from '../imageGenerationService';

/**
 * Built-in image generation MCP server configuration
 * This virtual server exposes image generation capabilities via MCP protocol
 */
export const BUILTIN_IMAGE_GENERATION_SERVER: IMcpServer = {
  id: 'builtin-image-generation',
  name: 'CodeConductor Image Generation',
  description: 'Built-in image generation tool using OpenAI-compatible API',
  enabled: true,
  transport: {
    type: 'http',
    url: 'builtin://image-generation', // Special marker for built-in handling
  },
  tools: [
    {
      name: 'generate_image',
      description: 'Generate an image based on a text prompt using the configured image generation API',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'The text prompt describing the image to generate',
          },
          size: {
            type: 'string',
            enum: ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'],
            description: 'The size of the generated image (default: 1024x1024)',
          },
          quality: {
            type: 'string',
            enum: ['standard', 'hd'],
            description: 'The quality of the generated image (default: standard)',
          },
        },
        required: ['prompt'],
      },
    },
  ],
  status: 'connected',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  originalJson: '{}',
};

/**
 * Check if a server ID represents a built-in server
 */
export function isBuiltinServer(serverId: string): boolean {
  return serverId === BUILTIN_IMAGE_GENERATION_SERVER.id;
}

/**
 * Check if a transport URL indicates a built-in server
 */
export function isBuiltinTransportUrl(url: string): boolean {
  return url.startsWith('builtin://');
}

/**
 * Handle tool calls for built-in MCP servers
 * @returns Tool call result or throws error if tool/server not found
 */
export async function handleBuiltinMcpTool(serverId: string, toolName: string, toolArgs: Record<string, unknown>): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }> {
  if (serverId === BUILTIN_IMAGE_GENERATION_SERVER.id) {
    if (toolName === 'generate_image') {
      const result = await imageGenerationService.generateImage({
        prompt: toolArgs.prompt as string,
        size: toolArgs.size as '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792' | undefined,
        quality: toolArgs.quality as 'standard' | 'hd' | undefined,
      });

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${result.error}`,
            },
          ],
        };
      }

      // Return image URLs in MCP format
      const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [];

      for (const img of result.images || []) {
        if (img.url) {
          content.push({
            type: 'text',
            text: `Generated image URL: ${img.url}`,
          });
        }
        if (img.revised_prompt) {
          content.push({
            type: 'text',
            text: `Revised prompt: ${img.revised_prompt}`,
          });
        }
      }

      if (content.length === 0) {
        content.push({
          type: 'text',
          text: 'Image generation completed but no images were returned.',
        });
      }

      return { content };
    }

    throw new Error(`Unknown tool: ${toolName} for server ${serverId}`);
  }

  throw new Error(`Unknown built-in server: ${serverId}`);
}
