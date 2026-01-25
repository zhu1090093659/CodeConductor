/**
 * @license
 * Copyright 2025 CodeConductor (CodeConductor.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ipcBridge } from '@/common';
import CliInstallModal from './index';

interface UseCliInstallModalOptions {
  /** Auto-check on mount, default true */
  autoCheck?: boolean;
  /** Callback when installation completes */
  onInstallComplete?: () => void;
}

interface UseCliInstallModalReturn {
  /** The modal component to render */
  modal: React.ReactNode;
  /** Open the modal manually */
  open: () => void;
  /** Close the modal */
  close: () => void;
  /** Whether the modal is currently visible */
  visible: boolean;
  /** Manually trigger the check for missing CLIs */
  checkMissingClis: () => Promise<void>;
}

/**
 * Hook for managing CLI Install Modal
 * Automatically checks for missing CLIs on app startup
 * CLI 安装弹窗 Hook
 * 在应用启动时自动检查缺失的 CLI
 *
 * @example
 * ```tsx
 * const { modal, checkMissingClis } = useCliInstallModal();
 *
 * return (
 *   <>
 *     {modal}
 *     <App />
 *   </>
 * );
 * ```
 */
export function useCliInstallModal(options: UseCliInstallModalOptions = {}): UseCliInstallModalReturn {
  const { autoCheck = true, onInstallComplete } = options;
  const [visible, setVisible] = useState(false);

  const open = useCallback(() => {
    setVisible(true);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
  }, []);

  const checkMissingClis = useCallback(async () => {
    try {
      const result = await ipcBridge.cliInstaller.shouldPromptInstall.invoke();
      if (result.success && result.data?.shouldPrompt) {
        setVisible(true);
      }
    } catch (error) {
      console.error('[CliInstallModal] Failed to check missing CLIs:', error);
    }
  }, []);

  // Auto-check on mount
  useEffect(() => {
    if (autoCheck) {
      // Delay check slightly to avoid blocking initial render
      const timer = setTimeout(() => {
        void checkMissingClis();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [autoCheck, checkMissingClis]);

  const handleInstallComplete = useCallback(() => {
    onInstallComplete?.();
  }, [onInstallComplete]);

  const modal = <CliInstallModal visible={visible} onClose={close} onInstallComplete={handleInstallComplete} />;

  return {
    modal,
    open,
    close,
    visible,
    checkMissingClis,
  };
}

export default useCliInstallModal;
