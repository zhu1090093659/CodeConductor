/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage, type CustomCommandConfig } from '@/common/storage';
import { dedupeCommands, getCommandNameFromPath, getNamespaceFromPath, parseCommandMarkdown, type CommandSource, type SlashCommandItem } from '@/renderer/utils/commandRegistry';
import { useCallback, useEffect, useState } from 'react';

const BUILTIN_COMMANDS: SlashCommandItem[] = [
  {
    id: 'builtin:/run',
    name: 'run',
    trigger: 'run',
    description: 'Run a terminal command',
    body: '',
    source: 'builtin',
  },
  {
    id: 'builtin:/plan',
    name: 'plan',
    trigger: 'plan',
    description: 'Generate a project plan file',
    body: '',
    source: 'builtin',
  },
  {
    id: 'builtin:/pm',
    name: 'pm',
    trigger: 'pm',
    description: 'Project management utilities',
    body: '',
    source: 'builtin',
  },
  {
    id: 'builtin:/browser',
    name: 'browser',
    trigger: 'browser',
    description: 'Run agent-browser commands',
    body: '',
    source: 'builtin',
  },
];

const SOURCE_PRIORITY: CommandSource[] = ['builtin', 'custom', 'cursor', 'claude', 'codex'];

const listMarkdownFiles = async (dir: string, maxDepth = 6): Promise<string[]> => {
  try {
    return await ipcBridge.fs.listMarkdownFiles.invoke({ dir, maxDepth });
  } catch {
    return [];
  }
};

const buildExternalCommands = async (source: CommandSource, dir: string, triggerPrefix?: string): Promise<SlashCommandItem[]> => {
  const files = await listMarkdownFiles(dir);
  if (files.length === 0) return [];
  const commands = await Promise.all(
    files.map(async (filePath) => {
      try {
        const content = await ipcBridge.fs.readFile.invoke({ path: filePath });
        const parsed = parseCommandMarkdown(content);
        const name = getCommandNameFromPath(filePath);
        const namespace = getNamespaceFromPath(dir, filePath);
        const trigger = triggerPrefix ? `${triggerPrefix}${name}` : name;
        return {
          id: `${source}:${filePath}`,
          name,
          trigger,
          description: parsed.description || name,
          argumentHint: parsed.argumentHint,
          body: parsed.body,
          source,
          sourcePath: filePath,
          namespace: namespace || undefined,
        } as SlashCommandItem;
      } catch {
        return null;
      }
    })
  );
  return commands.filter(Boolean) as SlashCommandItem[];
};

const buildCustomCommands = (items: CustomCommandConfig[]): SlashCommandItem[] => {
  return items.map((item) => {
    const parsed = parseCommandMarkdown(item.content || '');
    return {
      id: `custom:${item.id}`,
      name: item.name,
      trigger: item.name,
      description: parsed.description || item.name,
      argumentHint: parsed.argumentHint,
      body: parsed.body,
      source: 'custom',
    };
  });
};

const mergeCommands = (groups: Record<CommandSource, SlashCommandItem[]>): SlashCommandItem[] => {
  const ordered: SlashCommandItem[] = [];
  SOURCE_PRIORITY.forEach((source) => {
    ordered.push(...(groups[source] || []));
  });
  return dedupeCommands(ordered);
};

export const useSlashCommands = () => {
  const [commands, setCommands] = useState<SlashCommandItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [externalStats, setExternalStats] = useState<Record<CommandSource, { dir: string; count: number }>>({
    cursor: { dir: '', count: 0 },
    claude: { dir: '', count: 0 },
    codex: { dir: '', count: 0 },
    builtin: { dir: '', count: BUILTIN_COMMANDS.length },
    custom: { dir: '', count: 0 },
  });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      // Get command directories from main process
      const dirs = await ipcBridge.application.commandDirs.invoke();
      if (!dirs) {
        console.error('[useSlashCommands] commandDirs returned null');
        return;
      }

      const customConfigs = ((await ConfigStorage.get('commands.custom')) || []) as CustomCommandConfig[];
      const customCommands = buildCustomCommands(customConfigs);
      const [cursorCmds, claudeCmds, codexCmds] = await Promise.all([buildExternalCommands('cursor', dirs.cursor), buildExternalCommands('claude', dirs.claude), buildExternalCommands('codex', dirs.codex, 'prompts:')]);
      const nextStats: Record<CommandSource, { dir: string; count: number }> = {
        builtin: { dir: '', count: BUILTIN_COMMANDS.length },
        custom: { dir: '', count: customCommands.length },
        cursor: { dir: dirs.cursor, count: cursorCmds.length },
        claude: { dir: dirs.claude, count: claudeCmds.length },
        codex: { dir: dirs.codex, count: codexCmds.length },
      };
      const groups: Record<CommandSource, SlashCommandItem[]> = {
        builtin: BUILTIN_COMMANDS,
        custom: customCommands,
        cursor: cursorCmds,
        claude: claudeCmds,
        codex: codexCmds,
      };
      setCommands(mergeCommands(groups));
      setExternalStats(nextStats);
    } catch (err) {
      console.error('[useSlashCommands] Failed to reload commands:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    commands,
    loading,
    reload,
    externalStats,
  };
};
