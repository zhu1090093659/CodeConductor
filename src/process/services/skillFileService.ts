/**
 * @license
 * Copyright 2025 CodeConductor (CodeConductor.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import path from 'path';

export type SkillRecord = {
  name: string;
  description: string;
  filePath: string;
  dirPath: string;
};

const isSkillFile = (fileName: string) => fileName.toLowerCase() === 'skill.md';

const parseFrontMatter = (content: string) => {
  const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontMatterMatch) return { name: '', description: '' };
  const yaml = frontMatterMatch[1];
  const nameMatch = yaml.match(/^name:\s*(.+)$/m);
  const descMatch = yaml.match(/^description:\s*['"]?(.+?)['"]?$/m);
  return {
    name: nameMatch ? nameMatch[1].trim() : '',
    description: descMatch ? descMatch[1].trim() : '',
  };
};

export const scanSkills = async (skillsDir: string): Promise<Map<string, SkillRecord>> => {
  const skillMap = new Map<string, SkillRecord>();

  const walk = async (dirPath: string) => {
    let entries: Array<import('fs').Dirent>;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !isSkillFile(entry.name)) continue;

      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const { name, description } = parseFrontMatter(content);
        if (!name || skillMap.has(name)) continue;
        skillMap.set(name, {
          name,
          description,
          filePath: fullPath,
          dirPath: path.dirname(fullPath),
        });
      } catch {
        // Ignore invalid skill files
      }
    }
  };

  await walk(skillsDir);
  return skillMap;
};

export const listAvailableSkills = async (skillsDir: string): Promise<Array<{ name: string; description: string; location: string }>> => {
  const skillMap = await scanSkills(skillsDir);
  return Array.from(skillMap.values()).map((skill) => ({
    name: skill.name,
    description: skill.description,
    location: skill.filePath,
  }));
};
