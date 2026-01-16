/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import path from 'path';
import { copyDirectoryRecursively } from '../utils';
import { getSkillsDir } from '../initStorage';
import { scanSkills } from './skillFileService';

type SkillAgent = 'claude' | 'codex';

export type CopySkillEntry = {
  agent: SkillAgent;
  skill: string;
  targetDir: string;
};

export type CopySkillsToProjectResult = {
  copied: CopySkillEntry[];
  skipped: CopySkillEntry[];
  errors: Array<{ agent: SkillAgent; skill: string; error: string }>;
};

type EnabledSkillsByAgent = Record<string, string[] | undefined>;

const AGENT_SKILL_DIR: Record<SkillAgent, string> = {
  claude: path.join('.claude', 'skills'),
  codex: path.join('.codex', 'skills'),
};

const resolveEnabledSkills = (enabledByAgent: EnabledSkillsByAgent | undefined, agent: SkillAgent) => {
  const enabled = enabledByAgent?.[agent];
  if (!Array.isArray(enabled) || enabled.length === 0) return [];
  return Array.from(new Set(enabled.filter((name) => !!name && name.trim()).map((name) => name.trim())));
};

const pathExists = async (targetPath: string) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

export const copySkillsToProject = async (workspace: string, enabledByAgent?: EnabledSkillsByAgent): Promise<CopySkillsToProjectResult> => {
  const result: CopySkillsToProjectResult = { copied: [], skipped: [], errors: [] };
  if (!workspace || !workspace.trim()) {
    return result;
  }

  const agentConfigs = (['claude', 'codex'] as const)
    .map((agent) => ({ agent, skills: resolveEnabledSkills(enabledByAgent, agent) }))
    .filter((config) => config.skills.length > 0);
  if (agentConfigs.length === 0) {
    return result;
  }

  const targetWorkspace = path.resolve(workspace);
  const skillsDir = getSkillsDir();
  const skillMap = await scanSkills(skillsDir);

  for (const { agent, skills } of agentConfigs) {
    const targetRoot = path.join(targetWorkspace, AGENT_SKILL_DIR[agent]);
    await fs.mkdir(targetRoot, { recursive: true });

    for (const skillName of skills) {
      const record = skillMap.get(skillName);
      const targetDir = path.join(targetRoot, skillName);
      const entry = { agent, skill: skillName, targetDir };
      if (!record) {
        console.warn(`[SkillProject] Skill not found: ${skillName}`);
        result.skipped.push(entry);
        continue;
      }

      if (await pathExists(targetDir)) {
        result.skipped.push(entry);
        continue;
      }

      try {
        await copyDirectoryRecursively(record.dirPath, targetDir, { overwrite: false });
        result.copied.push(entry);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push({ agent, skill: skillName, error: message });
      }
    }
  }

  return result;
};
