/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ProjectInfo, TChatConversation } from '@/common/storage';
import { ConfigStorage } from '@/common/storage';
import { uuid } from '@/common/utils';
import { emitter } from '@/renderer/utils/emitter';
import { getWorkspaceDisplayName } from '@/renderer/utils/workspace';
import { removeWorkspaceEntry } from '@/renderer/utils/workspaceFs';

const RECENT_LIMIT = 8;

const normalizeWorkspace = (workspace: string) => {
  const normalized = workspace.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
};

const loadProjects = async (): Promise<ProjectInfo[]> => {
  const stored = await ConfigStorage.get('project.list');
  return Array.isArray(stored) ? stored : [];
};

const saveProjects = async (projects: ProjectInfo[]) => {
  await ConfigStorage.set('project.list', projects);
};

const loadRecentIds = async (): Promise<string[]> => {
  const stored = await ConfigStorage.get('project.recentIds');
  return Array.isArray(stored) ? stored : [];
};

const saveRecentIds = async (ids: string[]) => {
  await ConfigStorage.set('project.recentIds', ids);
};

const touchRecent = async (projectId: string) => {
  const recentIds = await loadRecentIds();
  const next = [projectId, ...recentIds.filter((id) => id !== projectId)].slice(0, RECENT_LIMIT);
  await saveRecentIds(next);
};

export const getActiveProjectId = async (): Promise<string | null> => {
  const stored = await ConfigStorage.get('project.activeId');
  return stored || null;
};

export const setActiveProjectId = async (projectId: string | null) => {
  if (!projectId) {
    await ConfigStorage.set('project.activeId', '');
    emitter.emit('project.updated');
    return;
  }
  await ConfigStorage.set('project.activeId', projectId);
  await touchRecent(projectId);
  emitter.emit('project.updated');
};

export const getProjectsOrdered = async (): Promise<ProjectInfo[]> => {
  const [projects, recentIds] = await Promise.all([loadProjects(), loadRecentIds()]);
  if (recentIds.length === 0) {
    return [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
  }
  const byId = new Map(projects.map((project) => [project.id, project]));
  const ordered: ProjectInfo[] = [];
  recentIds.forEach((id) => {
    const project = byId.get(id);
    if (project) {
      ordered.push(project);
      byId.delete(id);
    }
  });
  const rest = Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  return [...ordered, ...rest];
};

export const getProjectByWorkspace = async (workspace: string): Promise<ProjectInfo | null> => {
  const normalized = normalizeWorkspace(workspace);
  const projects = await loadProjects();
  return projects.find((project) => normalizeWorkspace(project.workspace) === normalized) || null;
};

export const createProject = async (workspace: string, name?: string): Promise<ProjectInfo> => {
  const now = Date.now();
  const project: ProjectInfo = {
    id: uuid(),
    name: name?.trim() || getWorkspaceDisplayName(workspace),
    workspace: normalizeWorkspace(workspace),
    createdAt: now,
    updatedAt: now,
  };
  const projects = await loadProjects();
  const next = [project, ...projects];
  await saveProjects(next);
  await setActiveProjectId(project.id);
  try {
    const enabledByAgent = await ConfigStorage.get('skills.enabledByAgent').catch(() => ({}));
    if (enabledByAgent && Object.keys(enabledByAgent).length > 0) {
      const result = await ipcBridge.skills.copyToProject.invoke({
        workspace: project.workspace,
        enabledByAgent,
      });
      if (!result.success) {
        console.warn('[ProjectService] Failed to copy skills to project:', result.msg || project.workspace);
      }
    }
  } catch (error) {
    console.warn('[ProjectService] Failed to load skill settings:', error);
  }
  return project;
};

export const ensureProjectForWorkspace = async (workspace: string, name?: string): Promise<ProjectInfo> => {
  const normalized = normalizeWorkspace(workspace);
  const existing = await getProjectByWorkspace(normalized);
  if (existing) {
    await setActiveProjectId(existing.id);
    return existing;
  }
  return createProject(normalized, name);
};

export const renameProject = async (projectId: string, nextName: string): Promise<boolean> => {
  const name = nextName.trim();
  if (!name) return false;
  const projects = await loadProjects();
  const next = projects.map((project) => {
    if (project.id !== projectId) return project;
    return { ...project, name, updatedAt: Date.now() };
  });
  await saveProjects(next);
  emitter.emit('project.updated');
  return true;
};

export interface DeleteProjectResult {
  success: boolean;
  workspaceRemoved: boolean;
  workspace?: string;
}

export const deleteProject = async (projectId: string): Promise<DeleteProjectResult> => {
  const [projects, activeId, recentIds] = await Promise.all([loadProjects(), getActiveProjectId(), loadRecentIds()]);
  const targetProject = projects.find((project) => project.id === projectId);
  if (!targetProject) return { success: false, workspaceRemoved: true };

  const isActiveProject = activeId === projectId;
  const nextProjects = projects.filter((project) => project.id !== projectId);
  const nextRecent = recentIds.filter((id) => id !== projectId);
  const fallbackId = nextRecent[0] || nextProjects[0]?.id || null;

  if (isActiveProject) {
    await setActiveProjectId(fallbackId);
    emitter.emit('project.updated');
  }

  if (targetProject.workspace) {
    // Step 1: Close UI components that may be reading the workspace
    emitter.emit('conversation.workspace.close', targetProject.workspace);
    emitter.emit('workspace.preview.close', targetProject.workspace);

    // Step 2: Abort any ongoing workspace reads
    try {
      await ipcBridge.conversation.abortWorkspaceRead.invoke();
    } catch {
      // Ignore abort errors
    }

    // Step 3: Kill all tasks using this workspace FIRST (before removing conversations)
    // This ensures child processes are terminated before we try to delete anything
    try {
      const cleanupResult = await ipcBridge.conversation.cleanupWorkspace.invoke({ workspace: targetProject.workspace });
      console.log('[ProjectService] Cleanup workspace result:', cleanupResult);
    } catch (cleanupError) {
      console.warn('[ProjectService] Failed to cleanup workspace tasks:', cleanupError);
    }

    // Step 4: Dispose terminals
    try {
      await ipcBridge.terminal.disposeByCwd.invoke({ cwd: targetProject.workspace });
    } catch {
      // Ignore terminal dispose errors
    }

    // Step 5: Wait for processes to fully terminate
    // Windows needs extra time to release file handles after process termination
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Step 6: Remove related conversations from database
  const normalizedWorkspace = normalizeWorkspace(targetProject.workspace);
  try {
    const conversations = await ipcBridge.database.getUserConversations.invoke({ page: 0, pageSize: 10000 });
    const relatedConversations = (conversations || []).filter((conv) => {
      const convProjectId = conv.extra?.projectId;
      if (convProjectId && convProjectId === projectId) return true;
      const workspace = conv.extra?.workspace;
      if (!workspace) return false;
      return normalizeWorkspace(workspace) === normalizedWorkspace;
    });

    for (const conv of relatedConversations) {
      try {
        await ipcBridge.conversation.remove.invoke({ id: conv.id });
        emitter.emit('conversation.deleted', conv.id);
      } catch (convError) {
        // Log but don't fail - continue removing other conversations
        console.warn('[ProjectService] Failed to remove conversation:', conv.id, convError);
      }
    }
    if (relatedConversations.length > 0) {
      emitter.emit('chat.history.refresh');
    }
  } catch (error) {
    console.warn('[ProjectService] Error removing conversations:', error);
    // Don't return false - continue to remove project from list
  }

  // Step 7: Try to remove the workspace directory with multiple attempts
  let workspaceRemoved = false;
  if (targetProject.workspace) {
    // Try multiple times with increasing delays - Windows may need more time to release handles
    for (let attempt = 0; attempt < 3 && !workspaceRemoved; attempt++) {
      if (attempt > 0) {
        // Wait before retry with exponential backoff
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        console.log(`[ProjectService] Retry attempt ${attempt + 1} to remove workspace...`);
      }
      try {
        const res = await removeWorkspaceEntry(targetProject.workspace);
        if (res?.success) {
          console.log('[ProjectService] Successfully removed workspace directory:', targetProject.workspace);
          workspaceRemoved = true;
        } else {
          console.warn(`[ProjectService] Remove attempt ${attempt + 1} failed:`, res?.msg || 'Unknown error');
        }
      } catch (fsError) {
        console.warn(`[ProjectService] Remove attempt ${attempt + 1} exception:`, fsError);
      }
    }
    if (!workspaceRemoved) {
      console.error('[ProjectService] All attempts to remove workspace failed:', targetProject.workspace);
      // The rename-then-delete strategy in fsBridge should handle EBUSY
      // and leave a temp directory that can be cleaned up later
    }
  } else {
    workspaceRemoved = true; // No workspace to remove
  }

  // Step 8: ALWAYS remove project from list - this must succeed
  try {
    await saveProjects(nextProjects);
    await saveRecentIds(nextRecent);
    console.log('[ProjectService] Project removed from list:', projectId);
  } catch (saveError) {
    console.error('[ProjectService] Failed to save project list:', saveError);
    return { success: false, workspaceRemoved, workspace: targetProject.workspace };
  }

  emitter.emit('project.updated');

  return {
    success: true,
    workspaceRemoved,
    workspace: workspaceRemoved ? undefined : targetProject.workspace,
  };
};

export const getActiveProject = async (): Promise<ProjectInfo | null> => {
  const [projects, activeId] = await Promise.all([loadProjects(), getActiveProjectId()]);
  if (!activeId) return null;
  return projects.find((project) => project.id === activeId) || null;
};

export const resolveProjectIdForConversation = (conversation: TChatConversation, projects: ProjectInfo[]): string | null => {
  const directId = conversation.extra?.projectId;
  if (directId) return directId;
  const workspace = conversation.extra?.workspace;
  if (!workspace) return null;
  const normalized = normalizeWorkspace(workspace);
  return projects.find((project) => normalizeWorkspace(project.workspace) === normalized)?.id || null;
};
