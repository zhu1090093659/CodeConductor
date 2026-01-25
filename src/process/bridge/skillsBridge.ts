/**
 * @license
 * Copyright 2025 CodeConductor (CodeConductor.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { ipcBridge } from '@/common';
import { syncSkillRepos } from '../services/skillRepoService';
import { copySkillsToProject } from '../services/skillProjectService';

export function initSkillsBridge(): void {
  ipcBridge.skills.syncRepos.provider(async ({ repos }) => {
    try {
      const result = await syncSkillRepos(repos || []);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcBridge.skills.copyToProject.provider(async ({ workspace, enabledByAgent }) => {
    try {
      const result = await copySkillsToProject(workspace, enabledByAgent);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcBridge.skills.deleteSkill.provider(async ({ location }) => {
    try {
      // Delete the skill directory (parent of skill.md file)
      const skillDir = path.dirname(location);
      await fs.rm(skillDir, { recursive: true, force: true });
      return { success: true };
    } catch (error) {
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });
}
