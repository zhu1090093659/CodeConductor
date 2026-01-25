/**
 * @license
 * Copyright 2025 CodeConductor (CodeConductor.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Checkbox, Select, Spin, Message } from '@arco-design/web-react';
import { CheckOne, CloseOne, Loading } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import AionModal from '../base/AionModal';

// Types matching IPC interface
interface InstallMethod {
  method: 'script' | 'winget' | 'brew' | 'npm';
  command: string;
  label: string;
  recommended: boolean;
}

interface MissingCliInfo {
  id: 'claude' | 'codex';
  name: string;
  description: string;
  installMethods: InstallMethod[];
}

interface InstallProgress {
  cliId: string;
  status: 'installing' | 'success' | 'failed';
  message?: string;
  output?: string;
}

interface CliInstallModalProps {
  visible: boolean;
  onClose: () => void;
  onInstallComplete?: () => void;
}

/**
 * CLI Install Modal Component
 * Displays missing CLI tools and allows user to install them
 * CLI 安装弹窗组件
 * 显示缺失的 CLI 工具并允许用户安装
 */
const CliInstallModal: React.FC<CliInstallModalProps> = ({ visible, onClose, onInstallComplete }) => {
  const { t } = useTranslation();
  const [missingClis, setMissingClis] = useState<MissingCliInfo[]>([]);
  const [selectedClis, setSelectedClis] = useState<Set<string>>(new Set());
  const [selectedMethods, setSelectedMethods] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<Record<string, InstallProgress>>({});
  const [installOutput, setInstallOutput] = useState<string>('');

  // Fetch missing CLIs on mount
  useEffect(() => {
    if (visible) {
      void fetchMissingClis();
    }
  }, [visible]);

  // Subscribe to install progress events
  useEffect(() => {
    const unsubscribe = ipcBridge.cliInstaller.installProgress.on((progress) => {
      setInstallProgress((prev) => ({
        ...prev,
        [progress.cliId]: progress,
      }));
      if (progress.output) {
        setInstallOutput((prev) => prev + progress.output);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const fetchMissingClis = async () => {
    setIsLoading(true);
    try {
      const result = await ipcBridge.cliInstaller.getMissingClis.invoke();
      if (result.success && result.data) {
        setMissingClis(result.data.missing);
        // Select all by default and set recommended methods
        const selected = new Set(result.data.missing.map((cli) => cli.id));
        setSelectedClis(selected);

        const methods: Record<string, string> = {};
        result.data.missing.forEach((cli) => {
          const recommended = cli.installMethods.find((m) => m.recommended);
          methods[cli.id] = recommended?.method || cli.installMethods[0]?.method || '';
        });
        setSelectedMethods(methods);
      }
    } catch (error) {
      console.error('Failed to fetch missing CLIs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckboxChange = (cliId: string, checked: boolean) => {
    const newSelected = new Set(selectedClis);
    if (checked) {
      newSelected.add(cliId);
    } else {
      newSelected.delete(cliId);
    }
    setSelectedClis(newSelected);
  };

  const handleMethodChange = (cliId: string, method: string) => {
    setSelectedMethods((prev) => ({
      ...prev,
      [cliId]: method,
    }));
  };

  const handleInstall = async () => {
    if (selectedClis.size === 0) return;

    setIsInstalling(true);
    setInstallOutput('');
    setInstallProgress({});

    const cliIds = Array.from(selectedClis);

    for (const cliId of cliIds) {
      const method = selectedMethods[cliId];
      if (!method) continue;

      try {
        const result = await ipcBridge.cliInstaller.install.invoke({
          cliId: cliId as 'claude' | 'codex',
          method,
        });

        if (!result.success) {
          Message.error(`${t('cliInstall.installFailed', { cli: cliId })}: ${result.msg}`);
        }
      } catch (error) {
        Message.error(`${t('cliInstall.installFailed', { cli: cliId })}`);
      }
    }

    // Re-detect CLIs after installation
    await ipcBridge.cliInstaller.redetect.invoke();

    setIsInstalling(false);

    // Check if all selected CLIs were installed successfully
    const allSuccess = cliIds.every((id) => installProgress[id]?.status === 'success');
    if (allSuccess) {
      Message.success(t('cliInstall.installSuccess'));
      onInstallComplete?.();
      onClose();
    }
  };

  const handleSkip = async (permanent: boolean) => {
    try {
      await ipcBridge.cliInstaller.skip.invoke({
        cliIds: missingClis.map((cli) => cli.id),
        permanent,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save skip preference:', error);
      onClose();
    }
  };

  const getStatusIcon = (cliId: string) => {
    const progress = installProgress[cliId];
    if (!progress) return null;

    switch (progress.status) {
      case 'installing':
        return <Loading theme='outline' size='16' className='animate-spin text-primary' />;
      case 'success':
        return <CheckOne theme='filled' size='16' className='text-green-500' />;
      case 'failed':
        return <CloseOne theme='filled' size='16' className='text-red-500' />;
      default:
        return null;
    }
  };

  const renderCliItem = (cli: MissingCliInfo) => {
    const isSelected = selectedClis.has(cli.id);
    const progress = installProgress[cli.id];
    const isCliDone = progress?.status === 'success' || progress?.status === 'failed';

    return (
      <div key={cli.id} className='flex items-start gap-12px p-12px rd-8px bg-2 mb-8px'>
        <Checkbox checked={isSelected} onChange={(checked) => handleCheckboxChange(cli.id, checked)} disabled={isInstalling || isCliDone} />
        <div className='flex-1'>
          <div className='flex items-center gap-8px mb-4px'>
            <span className='font-500 text-t-primary'>{cli.name}</span>
            {getStatusIcon(cli.id)}
            {progress?.status === 'failed' && <span className='text-12px text-red-500'>{progress.message}</span>}
          </div>
          <p className='text-12px text-t-secondary m-0 mb-8px'>{cli.description}</p>
          {cli.installMethods.length > 1 ? (
            <Select size='small' value={selectedMethods[cli.id]} onChange={(value) => handleMethodChange(cli.id, value)} disabled={isInstalling || isCliDone || !isSelected} style={{ width: 200 }}>
              {cli.installMethods.map((method) => (
                <Select.Option key={method.method} value={method.method}>
                  {method.label}
                  {method.recommended && ` (${t('cliInstall.recommended')})`}
                </Select.Option>
              ))}
            </Select>
          ) : (
            <span className='text-12px text-t-tertiary'>{cli.installMethods[0]?.label}</span>
          )}
        </div>
      </div>
    );
  };

  const renderFooter = () => {
    if (isInstalling) {
      return (
        <div className='flex justify-end gap-8px pt-16px'>
          <Button disabled>{t('cliInstall.installing')}</Button>
        </div>
      );
    }

    return (
      <div className='flex justify-between pt-16px'>
        <div className='flex gap-8px'>
          <Button onClick={() => handleSkip(false)}>{t('cliInstall.remindLater')}</Button>
          <Button onClick={() => handleSkip(true)}>{t('cliInstall.neverAsk')}</Button>
        </div>
        <Button type='primary' onClick={handleInstall} disabled={selectedClis.size === 0}>
          {t('cliInstall.installSelected')}
        </Button>
      </div>
    );
  };

  return (
    <AionModal visible={visible} onCancel={onClose} header={t('cliInstall.title')} footer={null} size='medium' maskClosable={!isInstalling} escToExit={!isInstalling}>
      <div className='p-16px'>
        <p className='text-t-secondary mb-16px'>{t('cliInstall.description')}</p>

        {isLoading ? (
          <div className='flex justify-center py-32px'>
            <Spin />
          </div>
        ) : missingClis.length === 0 ? (
          <div className='text-center py-32px text-t-secondary'>{t('cliInstall.allInstalled')}</div>
        ) : (
          <>
            <div className='mb-16px'>{missingClis.map(renderCliItem)}</div>

            {isInstalling && installOutput && (
              <div className='bg-3 rd-8px p-12px mb-16px max-h-150px overflow-auto'>
                <pre className='m-0 text-12px font-mono text-t-secondary whitespace-pre-wrap'>{installOutput}</pre>
              </div>
            )}
          </>
        )}

        {renderFooter()}
      </div>
    </AionModal>
  );
};

export default CliInstallModal;
