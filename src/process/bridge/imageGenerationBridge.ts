/**
 * @license
 * Copyright 2025 CodeConductor (CodeConductor.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '../../common';
import { imageGenerationService } from '../services/imageGenerationService';

/**
 * Initialize IPC bridge handlers for image generation
 */
export function initImageGenerationBridge(): void {
  // Generate image using configured API
  ipcBridge.imageGeneration.generate.provider(async (params) => {
    try {
      const result = await imageGenerationService.generateImage({
        prompt: params.prompt,
        size: params.size as '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792' | undefined,
        quality: params.quality as 'standard' | 'hd' | undefined,
        n: params.n,
      });

      if (!result.success) {
        return { success: false, msg: result.error };
      }

      return { success: true, data: { images: result.images || [] } };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error generating image',
      };
    }
  });

  // Get current configuration status
  ipcBridge.imageGeneration.getStatus.provider(async () => {
    try {
      const status = await imageGenerationService.getStatus();
      return { success: true, data: status };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });
}
