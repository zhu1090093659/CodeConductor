/**
 * @license
 * Copyright 2025 CodeConductor (CodeConductor.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, execSync } from 'child_process';
import { ipcBridge } from '@/common';
import { acpDetector } from '@/agent/acp/AcpDetector';
import { ProcessConfig } from '@/process/initStorage';

// Installation timeout: 5 minutes
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Check if a command is available in the system PATH
 * 检查命令是否在系统 PATH 中可用
 */
function isCommandAvailable(cmd: string): boolean {
  const isWindows = process.platform === 'win32';
  const whichCommand = isWindows ? 'where' : 'which';
  try {
    execSync(`${whichCommand} ${cmd}`, { stdio: 'pipe', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute installation command and stream output
 * 执行安装命令并流式输出
 */
function executeInstall(cliId: 'claude' | 'codex', method: string, command: string): Promise<{ success: boolean; error?: string; needsRestart?: boolean }> {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    let shell: string;
    let shellArgs: string[];

    // Determine shell based on platform and method
    if (isWindows) {
      if (method === 'script') {
        // PowerShell for script installation on Windows
        shell = 'powershell.exe';
        shellArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command];
      } else {
        // CMD for other methods (winget, npm)
        shell = 'cmd.exe';
        shellArgs = ['/c', command];
      }
    } else {
      // Bash for Unix-like systems
      shell = '/bin/bash';
      shellArgs = ['-c', command];
    }

    // Emit installing status
    ipcBridge.cliInstaller.installProgress.emit({
      cliId,
      status: 'installing',
      message: `Installing ${cliId}...`,
    });

    const child = spawn(shell, shellArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      timeout: INSTALL_TIMEOUT_MS,
    });

    let _stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      _stdout += text;
      ipcBridge.cliInstaller.installProgress.emit({
        cliId,
        status: 'installing',
        output: text,
      });
    });

    child.stderr?.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      ipcBridge.cliInstaller.installProgress.emit({
        cliId,
        status: 'installing',
        output: text,
      });
    });

    child.on('error', (err) => {
      ipcBridge.cliInstaller.installProgress.emit({
        cliId,
        status: 'failed',
        message: err.message,
      });
      resolve({ success: false, error: err.message });
    });

    child.on('close', (code) => {
      if (code === 0) {
        ipcBridge.cliInstaller.installProgress.emit({
          cliId,
          status: 'success',
          message: `${cliId} installed successfully`,
        });
        // Windows may need PATH refresh
        resolve({ success: true, needsRestart: isWindows });
      } else {
        const errorMsg = stderr || `Installation failed with exit code ${code}`;
        ipcBridge.cliInstaller.installProgress.emit({
          cliId,
          status: 'failed',
          message: errorMsg,
        });
        resolve({ success: false, error: errorMsg });
      }
    });

    // Handle timeout
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGTERM');
        ipcBridge.cliInstaller.installProgress.emit({
          cliId,
          status: 'failed',
          message: 'Installation timed out',
        });
        resolve({ success: false, error: 'Installation timed out (5 minutes)' });
      }
    }, INSTALL_TIMEOUT_MS);
  });
}

/**
 * Initialize CLI Installer Bridge
 * 初始化 CLI 安装器桥接
 */
export function initCliInstallerBridge(): void {
  // Get missing CLIs with platform-specific install methods
  ipcBridge.cliInstaller.getMissingClis.provider(() => {
    try {
      const missing = acpDetector.getMissingClis();
      const platform = process.platform;

      // Check package manager availability and filter methods
      const filteredMissing = missing.map((cli) => {
        const availableMethods = cli.installMethods.filter((method) => {
          if (method.method === 'npm') {
            return isCommandAvailable('npm');
          }
          if (method.method === 'winget') {
            return isCommandAvailable('winget');
          }
          if (method.method === 'brew') {
            return isCommandAvailable('brew');
          }
          // Script method is always available
          return true;
        });

        return {
          ...cli,
          installMethods: availableMethods.length > 0 ? availableMethods : cli.installMethods,
        };
      });

      return Promise.resolve({
        success: true,
        data: {
          missing: filteredMissing,
          platform,
        },
      });
    } catch (error) {
      return Promise.resolve({
        success: false,
        msg: error instanceof Error ? error.message : 'Failed to get missing CLIs',
      });
    }
  });

  // Check if we should prompt user for installation
  ipcBridge.cliInstaller.shouldPromptInstall.provider(async () => {
    try {
      const preferences = await ProcessConfig.get('cli.installPreferences');

      // If user chose "never ask again", don't prompt
      if (preferences?.neverAskAgain) {
        return {
          success: true,
          data: { shouldPrompt: false, missing: [] },
        };
      }

      const missing = acpDetector.getMissingClis();
      const missingIds = missing.map((cli) => cli.id);

      // Filter out skipped CLIs
      const skippedClis = preferences?.skippedClis || [];
      const shouldPromptFor = missingIds.filter((id) => !skippedClis.includes(id));

      return {
        success: true,
        data: {
          shouldPrompt: shouldPromptFor.length > 0,
          missing: shouldPromptFor,
        },
      };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Failed to check install preferences',
      };
    }
  });

  // Execute CLI installation
  ipcBridge.cliInstaller.install.provider(async ({ cliId, method }) => {
    try {
      const missing = acpDetector.getMissingClis();
      const cli = missing.find((c) => c.id === cliId);

      if (!cli) {
        return {
          success: false,
          msg: `CLI ${cliId} is already installed or not recognized`,
        };
      }

      const installMethod = cli.installMethods.find((m) => m.method === method);
      if (!installMethod) {
        return {
          success: false,
          msg: `Install method ${method} not available for ${cliId}`,
        };
      }

      // Check npm availability for Codex
      if (method === 'npm' && !isCommandAvailable('npm')) {
        return {
          success: false,
          msg: 'npm is not installed. Please install Node.js from https://nodejs.org first.',
        };
      }

      const result = await executeInstall(cliId, method, installMethod.command);
      return {
        success: result.success,
        data: result,
        msg: result.error,
      };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Installation failed',
      };
    }
  });

  // Skip installation and save user preference
  ipcBridge.cliInstaller.skip.provider(async ({ cliIds, permanent }) => {
    try {
      const currentPrefs = (await ProcessConfig.get('cli.installPreferences')) || {};

      if (permanent) {
        // User chose "never ask again"
        await ProcessConfig.set('cli.installPreferences', {
          ...currentPrefs,
          neverAskAgain: true,
        });
      } else {
        // User chose "remind me later" - add to skipped list
        const skippedClis = new Set(currentPrefs.skippedClis || []);
        cliIds.forEach((id) => skippedClis.add(id));

        await ProcessConfig.set('cli.installPreferences', {
          ...currentPrefs,
          skippedClis: Array.from(skippedClis),
        });
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Failed to save preferences',
      };
    }
  });

  // Re-detect CLIs after installation
  ipcBridge.cliInstaller.redetect.provider(async () => {
    try {
      // Reset detection state and re-run detection
      await acpDetector.reinitialize();
      const detected = acpDetector.getDetectedAgents();
      const detectedIds = detected.map((agent) => agent.backend);

      return {
        success: true,
        data: { detected: detectedIds },
      };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Failed to re-detect CLIs',
      };
    }
  });
}
