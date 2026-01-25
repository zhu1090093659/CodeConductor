/**
 * @license
 * Copyright 2025 CodeConductor (CodeConductor.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Divider, Form, Input, Message, Switch, Popconfirm } from '@arco-design/web-react';
import { IconDelete } from '@arco-design/web-react/icon';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import { ipcBridge } from '@/common';
import { ConfigStorage, type SkillRepoConfig } from '@/common/storage';
import type { AcpBackend } from '@/types/acpTypes';

type SkillInfo = { name: string; description: string; location: string };

const AGENTS: Array<{ key: AcpBackend; label: string }> = [
  { key: 'claude', label: 'Claude' },
  { key: 'codex', label: 'Codex' },
];

const SkillSettings: React.FC = () => {
  const [message, messageContext] = Message.useMessage();
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [repos, setRepos] = useState<SkillRepoConfig[]>([]);
  const [enabledByAgent, setEnabledByAgent] = useState<Record<string, string[]>>({});
  const [newRepoUrl, setNewRepoUrl] = useState('');

  const loadSkills = useCallback(async () => {
    const list = await ipcBridge.fs.listAvailableSkills.invoke();
    setSkills(list || []);
  }, []);

  useEffect(() => {
    loadSkills().catch(() => {
      setSkills([]);
    });
  }, [loadSkills]);

  useEffect(() => {
    ConfigStorage.get('skills.repos')
      .then((data) => setRepos(data || []))
      .catch(() => setRepos([]));
    ConfigStorage.get('skills.enabledByAgent')
      .then((data) => setEnabledByAgent(data || {}))
      .catch(() => setEnabledByAgent({}));
  }, []);

  const saveRepos = useCallback(async (next: SkillRepoConfig[]) => {
    setRepos(next);
    await ConfigStorage.set('skills.repos', next);
  }, []);

  const saveEnabled = useCallback(async (next: Record<string, string[]>) => {
    setEnabledByAgent(next);
    await ConfigStorage.set('skills.enabledByAgent', next);
  }, []);

  const handleDeleteSkill = useCallback(
    async (skill: SkillInfo) => {
      const result = await ipcBridge.skills.deleteSkill.invoke({ location: skill.location });
      if (result.success) {
        // Remove skill from all agents' enabled lists
        const nextEnabled = { ...enabledByAgent };
        for (const agentKey of Object.keys(nextEnabled)) {
          nextEnabled[agentKey] = nextEnabled[agentKey].filter((name) => name !== skill.name);
        }
        await saveEnabled(nextEnabled);
        await loadSkills();
        message.success('Skill deleted');
      } else {
        message.error(result.msg || 'Failed to delete skill');
      }
    },
    [enabledByAgent, saveEnabled, loadSkills, message]
  );

  const handleSyncRepos = useCallback(async () => {
    const result = await ipcBridge.skills.syncRepos.invoke({ repos });
    if (result.success && result.data) {
      await saveRepos(result.data.repos);
      await loadSkills();
      if (result.data.errors?.length) {
        message.warning(`Some repos failed: ${result.data.errors.map((e) => e.id).join(', ')}`);
      } else {
        message.success('Repos synced');
      }
      return;
    }
    message.error(result.msg || 'Failed to sync repos');
  }, [repos, saveRepos, loadSkills, message]);

  const handleAddRepo = useCallback(async () => {
    if (!newRepoUrl.trim()) {
      message.warning('Repository URL is required');
      return;
    }
    const repo: SkillRepoConfig = {
      id: String(Date.now()),
      url: newRepoUrl.trim(),
    };
    const next = [...repos, repo];
    await saveRepos(next);
    setNewRepoUrl('');
  }, [newRepoUrl, repos, saveRepos, message]);

  const handleRemoveRepo = useCallback(
    async (repoId: string) => {
      const next = repos.filter((r) => r.id !== repoId);
      await saveRepos(next);
    },
    [repos, saveRepos]
  );

  const sortedSkills = useMemo(() => {
    return [...skills].sort((a, b) => a.name.localeCompare(b.name));
  }, [skills]);

  // Calculate enabled counts for each agent
  const enabledCounts = useMemo(() => {
    return AGENTS.map((agent) => ({
      key: agent.key,
      label: agent.label,
      count: (enabledByAgent[agent.key] || []).length,
    }));
  }, [enabledByAgent]);

  // Check if all skills are enabled for all agents
  const allSkillNames = useMemo(() => skills.map((s) => s.name), [skills]);
  const isAllEnabled = useMemo(() => {
    if (allSkillNames.length === 0) return false;
    return AGENTS.every((agent) => {
      const enabledSet = new Set(enabledByAgent[agent.key] || []);
      return allSkillNames.every((name) => enabledSet.has(name));
    });
  }, [allSkillNames, enabledByAgent]);

  // Toggle all skills for all agents
  const handleToggleAll = useCallback(() => {
    const targetList = isAllEnabled ? [] : allSkillNames;
    const nextEnabled = Object.fromEntries(AGENTS.map((a) => [a.key, [...targetList]]));
    void saveEnabled(nextEnabled);
  }, [allSkillNames, isAllEnabled, saveEnabled]);

  // Toggle single skill for single agent
  const toggleSkillForAgent = useCallback(
    (agentKey: AcpBackend, skillName: string, enabled: boolean) => {
      const current = enabledByAgent[agentKey] || [];
      const next = enabled ? [...current, skillName] : current.filter((n) => n !== skillName);
      void saveEnabled({ ...enabledByAgent, [agentKey]: next });
    },
    [enabledByAgent, saveEnabled]
  );

  const renderSkillCard = (skill: SkillInfo) => {
    return (
      <div key={skill.name} className='flex items-start justify-between p-16px rounded-12px bg-bg-1 border border-border-2'>
        {/* Left: Skill info */}
        <div className='flex-1 min-w-0 pr-16px'>
          <div className='text-14px font-medium text-t-primary'>{skill.name}</div>
          {skill.description && <div className='text-12px text-t-secondary mt-4px line-clamp-2'>{skill.description}</div>}
        </div>

        {/* Right: Agent switches + Delete button */}
        <div className='flex items-center gap-16px shrink-0'>
          {/* Agent switches column */}
          <div className='flex flex-col gap-8px'>
            {AGENTS.map((agent) => (
              <div key={agent.key} className='flex items-center justify-between gap-12px min-w-120px'>
                <span className='text-13px text-t-secondary'>{agent.label}</span>
                <Switch size='small' checked={(enabledByAgent[agent.key] || []).includes(skill.name)} onChange={(checked) => toggleSkillForAgent(agent.key, skill.name, checked)} />
              </div>
            ))}
          </div>

          {/* Delete button */}
          <Popconfirm title='Delete Skill' content={`Are you sure you want to delete "${skill.name}"? This will remove the skill files from disk.`} onOk={() => handleDeleteSkill(skill)} okText='Delete' cancelText='Cancel' okButtonProps={{ status: 'danger' }}>
            <Button type='text' icon={<IconDelete />} className='text-t-tertiary hover:text-danger-6' />
          </Popconfirm>
        </div>
      </div>
    );
  };

  return (
    <SettingsPageWrapper contentClassName='max-w-1200px'>
      {messageContext}
      <div className='space-y-16px'>
        <div className='bg-2 rd-16px px-20px py-16px space-y-12px'>
          <div className='text-14px text-t-primary'>Skill Repositories</div>
          <Form layout='inline' className='gap-8px'>
            <Form.Item>
              <Input placeholder='Repo URL' value={newRepoUrl} onChange={(value) => setNewRepoUrl(value)} style={{ width: 400 }} />
            </Form.Item>
            <Form.Item>
              <Button type='primary' onClick={handleAddRepo}>
                Add Repo
              </Button>
            </Form.Item>
            <Form.Item>
              <Button onClick={handleSyncRepos}>Sync Repos</Button>
            </Form.Item>
          </Form>
          <Divider className='my-12px' />
          {repos.length === 0 ? (
            <div className='text-12px text-t-secondary'>No repositories configured.</div>
          ) : (
            <div className='space-y-8px'>
              {repos.map((repo) => (
                <div key={repo.id} className='flex items-center justify-between bg-bg-1 px-12px py-8px rd-8px border border-border-2'>
                  <div className='text-13px text-t-primary'>{repo.url}</div>
                  <Button size='mini' status='danger' onClick={() => handleRemoveRepo(repo.id)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className='bg-2 rd-16px px-20px py-16px space-y-12px'>
          <div className='flex items-center justify-between'>
            <div className='text-14px text-t-primary'>Skills</div>
            <div className='flex items-center gap-8px'>
              {sortedSkills.length > 0 && (
                <Button size='mini' onClick={handleToggleAll}>
                  {isAllEnabled ? '全不选' : '全选'}
                </Button>
              )}
              <Button size='mini' onClick={loadSkills}>
                Refresh
              </Button>
            </div>
          </div>
          {/* Stats bar */}
          <div className='text-12px text-t-secondary'>已安装 · {enabledCounts.map((item) => `${item.label}: ${item.count}`).join(' · ')}</div>
          <Divider className='my-12px' />
          {sortedSkills.length === 0 ? <div className='text-12px text-t-secondary'>No skills found.</div> : <div className='space-y-12px'>{sortedSkills.map((skill) => renderSkillCard(skill))}</div>}
        </div>
      </div>
    </SettingsPageWrapper>
  );
};

export default SkillSettings;
