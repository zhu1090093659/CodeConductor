/**
 * @license
 * Copyright 2025 CodeConductor (CodeConductor.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import OpenAI from 'openai';
import { ConfigStorage, type IConfigStorageRefer } from '@/common/storage';

export interface ImageGenerationParams {
  prompt: string;
  size?: '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  n?: number;
}

export interface ImageGenerationResult {
  success: boolean;
  images?: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
  error?: string;
}

type ImageGenerationConfig = IConfigStorageRefer['tools.imageGeneration'];

/**
 * Image Generation Service
 * Provides image generation capabilities using OpenAI-compatible APIs
 */
class ImageGenerationService {
  private client: OpenAI | null = null;
  private currentConfig: ImageGenerationConfig | null = null;

  /**
   * Initialize or reinitialize the OpenAI client with current configuration
   */
  private async initializeClient(): Promise<boolean> {
    const config = await ConfigStorage.get('tools.imageGeneration');

    if (!config || !config.enabled || !config.apiKey || !config.baseUrl) {
      this.client = null;
      this.currentConfig = null;
      return false;
    }

    // Check if config has changed and needs reinitialization
    if (this.client && this.currentConfig && this.currentConfig.baseUrl === config.baseUrl && this.currentConfig.apiKey === config.apiKey) {
      return true;
    }

    try {
      this.client = new OpenAI({
        apiKey: config.apiKey.trim(),
        baseURL: config.baseUrl.trim(),
      });
      this.currentConfig = config;
      return true;
    } catch (error) {
      console.error('[ImageGenerationService] Failed to initialize client:', error);
      this.client = null;
      this.currentConfig = null;
      return false;
    }
  }

  /**
   * Generate images based on a text prompt
   */
  async generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    const config = await ConfigStorage.get('tools.imageGeneration');

    if (!config || !config.enabled) {
      return { success: false, error: 'Image generation is not enabled' };
    }

    if (!config.baseUrl || !config.apiKey) {
      return { success: false, error: 'Image generation is not configured properly' };
    }

    const initialized = await this.initializeClient();
    if (!initialized || !this.client) {
      return { success: false, error: 'Failed to initialize image generation client' };
    }

    try {
      const response = await this.client.images.generate({
        model: config.model || 'dall-e-3',
        prompt: params.prompt,
        size: params.size || '1024x1024',
        quality: params.quality || 'standard',
        n: params.n || 1,
        response_format: 'url',
      });

      return {
        success: true,
        images: response.data.map((img) => ({
          url: img.url,
          b64_json: img.b64_json,
          revised_prompt: img.revised_prompt,
        })),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ImageGenerationService] Image generation failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get the current configuration status
   */
  async getStatus(): Promise<{ enabled: boolean; configured: boolean }> {
    const config = await ConfigStorage.get('tools.imageGeneration');
    const enabled = config?.enabled ?? false;
    const configured = !!(config?.baseUrl && config?.apiKey && config?.model);
    return { enabled, configured };
  }

  /**
   * Reset the client (useful when configuration changes)
   */
  reset(): void {
    this.client = null;
    this.currentConfig = null;
  }
}

// Export singleton instance
export const imageGenerationService = new ImageGenerationService();
