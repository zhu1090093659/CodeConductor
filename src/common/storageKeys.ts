/**
 * @license
 * Copyright 2025 CodeConductor (CodeConductor.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Centralized localStorage keys for the application
 * 应用程序的集中式 localStorage 键管理
 *
 * All localStorage keys should be defined here to:
 * - Avoid key conflicts
 * - Make it easy to find and manage all persisted states
 * - Provide a single source of truth for storage key names
 */
export const STORAGE_KEYS = {
  /** Workspace tree collapse state / 工作空间目录树折叠状态 */
  WORKSPACE_TREE_COLLAPSE: 'CodeConductor_workspace_collapse_state',

  /** Workspace tree expanded keys (per-workspace) / 工作空间目录树展开 keys（按 workspace 区分） */
  WORKSPACE_TREE_EXPANDED_KEYS_PREFIX: 'CodeConductor_workspace_tree_expanded_keys:',

  /** Workspace panel collapse state / 工作空间面板折叠状态 */
  WORKSPACE_PANEL_COLLAPSE: 'CodeConductor_workspace_panel_collapsed',

  /** Conversation tabs state / 会话 tabs 状态 */
  CONVERSATION_TABS: 'CodeConductor_conversation_tabs',

  /** Sidebar collapse state / 侧边栏折叠状态 */
  SIDEBAR_COLLAPSE: 'CodeConductor_sider_collapsed',

  /** Project list collapse state / 项目列表折叠状态 */
  PROJECT_LIST_COLLAPSE: 'CodeConductor_project_list_collapsed',

  /** Project workspace tree collapse state / 项目工作区树折叠状态 */
  PROJECT_TREE_COLLAPSE: 'CodeConductor_project_tree_collapsed',

  /** Theme preference / 主题偏好 */
  THEME: 'CodeConductor_theme',

  /** Language preference / 语言偏好 */
  LANGUAGE: 'CodeConductor_language',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
