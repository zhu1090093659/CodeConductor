/**
 * @license
 * Copyright 2025 CodeConductor (CodeConductor.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, Message, Select, Tabs, Switch } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { Download } from '@icon-park/react';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import { ConfigStorage, type CliProviderConfig, type CliProviderPresetConfig, type CliProviderTarget, type CliProvidersStorage } from '@/common/storage';
import { ipcBridge } from '@/common';
import useModeModeList from '@/renderer/hooks/useModeModeList';
import { buildClaudeEnv, patchCodexConfig, isOfficialCliPreset, CLAUDE_PROVIDER_PRESETS, CODEX_PROVIDER_PRESETS, CLAUDE_THIRD_PARTY_ENV_KEYS } from '@/renderer/utils/cliProviderUtils';

type ProviderPreset = {
  name: string;
  websiteUrl: string;
  apiKeyUrl?: string;
  endpointCandidates?: string[];
  settingsConfig?: { env?: Record<string, string | number> };
  templateValues?: Record<string, { label: string; placeholder: string; defaultValue?: string }>;
  category?: string;
  isOfficial?: boolean;
  apiKeyField?: 'ANTHROPIC_AUTH_TOKEN' | 'ANTHROPIC_API_KEY';
};

const DEFAULT_CONFIG: CliProvidersStorage = {
  claude: {},
  codex: {},
};

const getProviderScopedConfig = (config: CliProviderConfig): CliProviderPresetConfig => {
  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    enabledModels: config.enabledModels,
    templateValues: config.templateValues,
    reasoningEffort: config.reasoningEffort,
  };
};

const getDefaultProviderConfig = (target: CliProviderTarget, preset?: ProviderPreset): CliProviderPresetConfig => {
  const baseUrl = target === 'claude' ? preset?.settingsConfig?.env?.['ANTHROPIC_BASE_URL'] || preset?.endpointCandidates?.[0] || '' : preset?.endpointCandidates?.[0] || '';
  const model = target === 'claude' ? (preset as { model?: string })?.model || preset?.settingsConfig?.env?.['ANTHROPIC_MODEL']?.toString() || '' : '';
  return {
    apiKey: '',
    baseUrl: baseUrl ? String(baseUrl) : '',
    model: model ? String(model) : '',
    enabledModels: [],
    templateValues: undefined,
    reasoningEffort: undefined,
  };
};

const CliProviderSettings: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { t } = useTranslation();
  const [message, messageContext] = Message.useMessage();
  const [configs, setConfigs] = useState<CliProvidersStorage>(DEFAULT_CONFIG);

  useEffect(() => {
    ConfigStorage.get('cli.providers')
      .then((stored) => {
        if (stored) {
          setConfigs({ ...DEFAULT_CONFIG, ...stored });
        }
      })
      .catch(() => {
        setConfigs(DEFAULT_CONFIG);
      });
  }, []);

  const saveConfigs = useCallback(
    async (next: CliProvidersStorage) => {
      setConfigs(next);
      await ConfigStorage.set('cli.providers', next);
    },
    [setConfigs]
  );

  const updateConfigForTarget = useCallback(
    (target: CliProviderTarget, patch: Partial<CliProviderConfig>) => {
      const current = configs[target] || {};
      const next: CliProviderConfig = { ...current, ...patch };
      const presetName = next.presetName;
      const providerConfigs = { ...(next.providerConfigs || {}) };
      if (presetName) {
        providerConfigs[presetName] = {
          ...providerConfigs[presetName],
          ...getProviderScopedConfig(next),
        };
      }
      next.providerConfigs = providerConfigs;
      void saveConfigs({ ...configs, [target]: next });
    },
    [configs, saveConfigs]
  );

  const handleApply = useCallback(
    async (target: CliProviderTarget) => {
      const applyProvider = ipcBridge.provider.apply.invoke as (payload: unknown) => Promise<{ success: boolean; msg?: string }>;
      const config = configs[target] || {};
      if (target === 'claude') {
        const preset = CLAUDE_PROVIDER_PRESETS.find((p) => p.name === config.presetName);
        if (!preset) return;
        const shouldUseOfficial = isOfficialCliPreset(preset) && !config.apiKey;
        const selectedModel = config.model || config.enabledModels?.[0];
        const env = buildClaudeEnv(preset, { ...config, model: selectedModel });
        const clearEnvKeys: string[] = [];
        if (shouldUseOfficial) {
          clearEnvKeys.push(...CLAUDE_THIRD_PARTY_ENV_KEYS);
          for (const key of CLAUDE_THIRD_PARTY_ENV_KEYS) {
            delete env[key];
          }
        }
        // Only clear MAX_THINKING_TOKENS if thinking mode is explicitly disabled
        const thinkingEnabled = typeof config.alwaysThinkingEnabled === 'boolean' ? config.alwaysThinkingEnabled : true;
        if (!thinkingEnabled) {
          clearEnvKeys.push('MAX_THINKING_TOKENS');
        }
        const settingsPatch = { alwaysThinkingEnabled: typeof config.alwaysThinkingEnabled === 'boolean' ? config.alwaysThinkingEnabled : true };
        const result = await applyProvider({ target, env, clearEnvKeys: clearEnvKeys.length ? clearEnvKeys : undefined, settingsPatch });
        if (result.success) {
          message.success('Claude Code settings updated');
        } else {
          message.error(result.msg || 'Failed to update Claude Code settings');
        }
        return;
      }
      if (target === 'codex') {
        const preset = CODEX_PROVIDER_PRESETS.find((p) => p.name === config.presetName);
        if (!preset) return;
        const shouldUseOfficial = isOfficialCliPreset(preset) && !config.apiKey && !config.baseUrl;
        const selectedModel = config.model || config.enabledModels?.[0];
        const authPatch = config.apiKey ? ({ OPENAI_API_KEY: config.apiKey } as Record<string, unknown>) : undefined;
        const clearAuthKeys = shouldUseOfficial ? (['OPENAI_API_KEY'] as string[]) : undefined;
        const configToml = patchCodexConfig(preset.config, config.baseUrl, selectedModel, config.reasoningEffort);
        const result = await applyProvider({
          target,
          authPatch,
          clearAuthKeys,
          configToml: configToml && configToml.trim() ? configToml : undefined,
          clearConfigToml: shouldUseOfficial && !selectedModel,
        });
        if (result.success) {
          message.success('Codex settings updated');
        } else {
          message.error(result.msg || 'Failed to update Codex settings');
        }
        return;
      }
      return;
    },
    [configs, message]
  );

  const ProviderForm: React.FC<{ target: CliProviderTarget; presets: ProviderPreset[] }> = useMemo(
    () =>
      ({ target, presets }) => {
        const config = configs[target] || {};
        const preset = presets.find((p) => p.name === config.presetName);
        const isOfficial = isOfficialCliPreset(preset);
        const endpointCandidates = preset?.endpointCandidates || [];
        const modelListState = useModeModeList(target === 'codex' ? 'openai' : 'anthropic', config.baseUrl, config.apiKey, undefined, isOfficial);
        const modelOptions = useMemo(() => modelListState.data?.models || [], [modelListState.data?.models]);
        const modelError = typeof modelListState.error === 'string' ? modelListState.error : modelListState.error?.message;
        const availableModels = useMemo(() => {
          const fetched = modelOptions.map((option) => option.value);
          if (fetched.length > 0) return fetched;
          return config.model ? [config.model] : [];
        }, [modelOptions, config.model]);
        const enabledModels = config.enabledModels || [];
        const effectiveEnabledModels = enabledModels.length > 0 ? enabledModels : availableModels.slice(0, 1);

        useEffect(() => {
          if (!availableModels.length || enabledModels.length > 0) return;
          updateConfigForTarget(target, { enabledModels: availableModels.slice(0, 1) });
        }, [availableModels, enabledModels.length, target, updateConfigForTarget]);

        const toggleModel = (modelName: string, nextEnabled: boolean) => {
          const nextModels = nextEnabled ? [...effectiveEnabledModels, modelName] : effectiveEnabledModels.filter((name) => name !== modelName);
          updateConfigForTarget(target, { enabledModels: nextModels });
        };

        useEffect(() => {
          if (!enabledModels.length) return;
          if (!availableModels.length) return;
          const validEnabled = enabledModels.filter((modelName) => availableModels.includes(modelName));
          if (validEnabled.length === enabledModels.length) return;
          updateConfigForTarget(target, { enabledModels: validEnabled });
        }, [availableModels, enabledModels, target, updateConfigForTarget]);

        const handleFetchModels = async () => {
          await modelListState.mutate();
        };

        const showClaudeThinking = target === 'claude';

        const renderTemplateValues = (templatePreset: ProviderPreset | undefined) => {
          if (!templatePreset?.templateValues) return null;
          const entries = Object.entries(templatePreset.templateValues);
          if (entries.length === 0) return null;
          return (
            <div className='space-y-12px'>
              {entries.map(([key, value]) => (
                <Form.Item key={key} label={value.label || key}>
                  <Input
                    placeholder={value.placeholder}
                    value={configs[target]?.templateValues?.[key] || value.defaultValue || ''}
                    onChange={(next) => {
                      updateConfigForTarget(target, { templateValues: { ...(configs[target]?.templateValues || {}), [key]: next } });
                    }}
                  />
                </Form.Item>
              ))}
            </div>
          );
        };

        return (
          <div className='space-y-16px'>
            <Form layout='vertical'>
              <Form.Item label='Provider'>
                <Select
                  value={config.presetName}
                  placeholder='Select provider'
                  onChange={(value) => {
                    const currentConfig = configs[target] || {};
                    const providerConfigs = { ...(currentConfig.providerConfigs || {}) };
                    if (currentConfig.presetName) {
                      providerConfigs[currentConfig.presetName] = {
                        ...providerConfigs[currentConfig.presetName],
                        ...getProviderScopedConfig(currentConfig),
                      };
                    }
                    const nextPreset = presets.find((p) => p.name === value);
                    const defaultConfig = getDefaultProviderConfig(target, nextPreset);
                    const storedConfig = providerConfigs[value];
                    const mergedConfig = { ...defaultConfig, ...storedConfig };
                    const nextConfig: CliProviderConfig = {
                      ...currentConfig,
                      presetName: value,
                      apiKey: mergedConfig.apiKey,
                      baseUrl: mergedConfig.baseUrl,
                      model: mergedConfig.model,
                      enabledModels: mergedConfig.enabledModels,
                      templateValues: mergedConfig.templateValues,
                      reasoningEffort: mergedConfig.reasoningEffort,
                      providerConfigs,
                    };
                    void saveConfigs({ ...configs, [target]: nextConfig });
                  }}
                >
                  {presets.map((item) => (
                    <Select.Option key={item.name} value={item.name}>
                      {item.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>

              {preset?.websiteUrl && (
                <div className='text-12px text-t-secondary'>
                  <span>Website: </span>
                  <a href={preset.websiteUrl} target='_blank' rel='noopener noreferrer' className='text-[rgb(var(--primary-6))]'>
                    {preset.websiteUrl}
                  </a>
                </div>
              )}

              {isOfficial && (
                <div className='text-12px text-t-secondary leading-5'>
                  <div>Official provider supports browser sign-in. Leave API Key empty and apply.</div>
                  {target === 'codex' ? (
                    <div>
                      Then run <span className='font-mono'>codex login</span> in your terminal if needed. See official docs:{' '}
                      <a href='https://developers.openai.com/codex/auth' target='_blank' rel='noopener noreferrer' className='text-[rgb(var(--primary-6))]'>
                        Codex auth
                      </a>
                    </div>
                  ) : (
                    <div>
                      Then run <span className='font-mono'>claude</span> and use <span className='font-mono'>/login</span> if needed. See official docs:{' '}
                      <a href='https://docs.anthropic.com/en/docs/claude-code/quickstart' target='_blank' rel='noopener noreferrer' className='text-[rgb(var(--primary-6))]'>
                        Claude Code quickstart
                      </a>
                    </div>
                  )}
                </div>
              )}

              {target === 'codex' && isOfficial && (
                <Form.Item label='Reasoning Effort'>
                  <Select
                    value={
                      config.reasoningEffort ||
                      (() => {
                        const model = config.model || config.enabledModels?.[0];
                        return model === 'gpt-5.2-codex' || model === 'gpt-5.2' ? 'xhigh' : 'medium';
                      })()
                    }
                    placeholder='Select reasoning effort'
                    onChange={(value) => updateConfigForTarget(target, { reasoningEffort: value as 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' })}
                  >
                    <Select.Option value='minimal'>Minimal</Select.Option>
                    <Select.Option value='low'>Low</Select.Option>
                    <Select.Option value='medium'>Medium</Select.Option>
                    <Select.Option value='high'>High</Select.Option>
                    <Select.Option value='xhigh'>XHigh</Select.Option>
                  </Select>
                  <div className='text-12px text-t-secondary mt-6px'>Controls model_reasoning_effort in Codex config (default: medium; xhigh on gpt-5.2-codex and gpt-5.2)</div>
                </Form.Item>
              )}

              {showClaudeThinking && (
                <div className='space-y-12px'>
                  <Form.Item label='Thinking mode (default)'>
                    <Switch checked={typeof config.alwaysThinkingEnabled === 'boolean' ? config.alwaysThinkingEnabled : true} onChange={(checked) => updateConfigForTarget(target, { alwaysThinkingEnabled: checked })} />
                    <div className='text-12px text-t-secondary mt-6px'>Saved as alwaysThinkingEnabled in ~/.claude/settings.json</div>
                  </Form.Item>
                  <Form.Item label='MAX_THINKING_TOKENS (optional)'>
                    <Input
                      placeholder='e.g. 16000'
                      key={`thinking-tokens-${target}-${config.presetName || 'default'}`}
                      defaultValue={config.maxThinkingTokens || ''}
                      onBlur={(e) => {
                        const value = e.target.value;
                        if (value !== (config.maxThinkingTokens || '')) {
                          updateConfigForTarget(target, { maxThinkingTokens: value });
                        }
                      }}
                    />
                    <div className='text-12px text-t-secondary mt-6px'>Sets env MAX_THINKING_TOKENS to cap thinking budget (leave empty for default 16000)</div>
                  </Form.Item>
                </div>
              )}

              <Form.Item label='API Key'>
                <Input.Password placeholder={isOfficial ? 'Optional (leave empty to use browser login)' : 'Enter API key'} value={config.apiKey || ''} onChange={(value) => updateConfigForTarget(target, { apiKey: value })} />
              </Form.Item>

              {!isOfficial &&
                (endpointCandidates.length > 0 ? (
                  <Form.Item label='Base URL'>
                    <Select allowCreate value={config.baseUrl} placeholder='Select or input base url' onChange={(value) => updateConfigForTarget(target, { baseUrl: value })}>
                      {endpointCandidates.map((url) => (
                        <Select.Option key={url} value={url}>
                          {url}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                ) : (
                  <Form.Item label='Base URL'>
                    <Input placeholder='Optional base url' value={config.baseUrl || ''} onChange={(value) => updateConfigForTarget(target, { baseUrl: value })} />
                  </Form.Item>
                ))}

              <div className='space-y-10px'>
                <div className='flex items-center justify-between gap-12px'>
                  <div className='text-12px text-t-secondary'>{t('settings.enabledModels')}</div>
                  <Button size='mini' type='secondary' shape='round' className='px-10px' icon={<Download theme='outline' size={14} />} onClick={() => void handleFetchModels()}>
                    {t('settings.fetchModels')}
                  </Button>
                </div>
                {availableModels.length > 0 && (
                  <div className='space-y-8px overflow-y-auto pr-2' style={{ maxHeight: 280 }}>
                    {availableModels.map((modelName) => {
                      const isEnabled = effectiveEnabledModels.includes(modelName);
                      return (
                        <div key={modelName} className='flex items-center justify-between gap-12px bg-fill-2 rd-8px px-12px py-8px'>
                          <span className='text-14px text-t-primary break-all'>{modelName}</span>
                          <Switch checked={isEnabled} onChange={(checked) => toggleModel(modelName, checked)} />
                        </div>
                      );
                    })}
                  </div>
                )}
                {modelError && <div className='text-12px text-[rgb(var(--danger-6))]'>{modelError}</div>}
              </div>

              {renderTemplateValues(preset)}
            </Form>

            <div className='flex items-center gap-12px'>
              <Button
                type='primary'
                onClick={() => {
                  void handleApply(target);
                }}
              >
                Apply to CLI
              </Button>
              <Button
                onClick={() => {
                  const nextConfigs = { ...configs, [target]: {} };
                  void saveConfigs(nextConfigs);
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        );
      },
    [configs, saveConfigs, handleApply, t, updateConfigForTarget]
  );

  const tabs = useMemo(
    () => [
      { key: 'claude', title: 'Claude Code', presets: CLAUDE_PROVIDER_PRESETS },
      { key: 'codex', title: 'Codex', presets: CODEX_PROVIDER_PRESETS },
    ],
    []
  );

  const content = (
    <>
      {messageContext}
      <div className='bg-2 rd-16px px-20px py-16px'>
        <Tabs defaultActiveTab='claude'>
          {tabs.map((tab) => (
            <Tabs.TabPane key={tab.key} title={tab.title}>
              <ProviderForm target={tab.key as CliProviderTarget} presets={tab.presets} />
            </Tabs.TabPane>
          ))}
        </Tabs>
      </div>
    </>
  );

  if (embedded) {
    return <div className='space-y-16px'>{content}</div>;
  }

  return <SettingsPageWrapper contentClassName='max-w-1200px'>{content}</SettingsPageWrapper>;
};

export default CliProviderSettings;
