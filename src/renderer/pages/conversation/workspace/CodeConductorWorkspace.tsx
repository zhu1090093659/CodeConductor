/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Empty, Tabs } from '@arco-design/web-react';
import { addEventListener } from '@/renderer/utils/emitter';
import { ipcBridge } from '@/common';
import LiveSpecTab from './LiveSpecTab';
import TerminalTab from './TerminalTab';
import DiffTab from './DiffTab';
import { dispatchTerminalRunEvent } from '@/renderer/utils/terminalEvents';
import type { PreviewLoadResult } from './utils/previewUtils';
import CodePreview from '@/renderer/pages/conversation/preview/components/viewers/CodeViewer';
import DiffPreview from '@/renderer/pages/conversation/preview/components/viewers/DiffViewer';
import ExcelPreview from '@/renderer/pages/conversation/preview/components/viewers/ExcelViewer';
import HTMLPreview from '@/renderer/pages/conversation/preview/components/viewers/HTMLViewer';
import ImagePreview from '@/renderer/pages/conversation/preview/components/viewers/ImageViewer';
import MarkdownPreview from '@/renderer/pages/conversation/preview/components/viewers/MarkdownViewer';
import PDFPreview from '@/renderer/pages/conversation/preview/components/viewers/PDFViewer';
import PPTPreview from '@/renderer/pages/conversation/preview/components/viewers/PPTViewer';
import WordPreview from '@/renderer/pages/conversation/preview/components/viewers/WordViewer';

const TERMINAL_COMMAND = 'claude --prompt-file .ai/tasks/current_task.md';

const normalizeWorkspacePath = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

const CodeConductorWorkspace: React.FC<{
  workspace: string;
}> = ({ workspace }) => {
  const [activeTab, setActiveTab] = useState('spec');
  const [preview, setPreview] = useState<PreviewLoadResult | null>(null);

  useEffect(() => {
    return addEventListener('workspace.preview.open', (payload) => {
      // Normalize on Windows to avoid mismatch by slash/case/trailing-separator differences
      // Only reject when both sides exist and clearly differ
      if (payload?.metadata?.workspace) {
        const incoming = normalizeWorkspacePath(payload.metadata.workspace);
        const current = normalizeWorkspacePath(workspace);
        if (incoming && current && incoming !== current) {
          return;
        }
      }
      const nextPreview: PreviewLoadResult = {
        content: payload.content,
        contentType: payload.contentType,
        metadata: payload.metadata ?? undefined,
      };

      setPreview(nextPreview);
      setActiveTab('preview');

      // If sidebar failed to load content, load it here by filePath
      if (!nextPreview.content && nextPreview.metadata?.filePath) {
        const filePath = nextPreview.metadata.filePath;
        void (async () => {
          try {
            if (nextPreview.contentType === 'image') {
              const base64 = await ipcBridge.fs.getImageBase64.invoke({ path: filePath });
              setPreview((prev) => (prev && prev.metadata?.filePath === filePath ? { ...prev, content: base64 || '' } : prev));
              return;
            }
            if (!['pdf', 'word', 'excel', 'ppt'].includes(nextPreview.contentType)) {
              const text = await ipcBridge.fs.readFile.invoke({ path: filePath });
              setPreview((prev) => (prev && prev.metadata?.filePath === filePath ? { ...prev, content: text || '' } : prev));
            }
          } catch {
            // Silently ignore errors
          }
        })();
      }
    });
  }, [workspace]);

  const handleApproveExecute = useCallback(() => {
    setActiveTab('terminal');
    dispatchTerminalRunEvent({ workspace, command: TERMINAL_COMMAND });
  }, [workspace]);

  const renderPreviewBody = () => {
    if (!preview) {
      return <Empty description='请选择文件预览' />;
    }

    const { content, contentType, metadata } = preview;
    if (contentType === 'markdown') return <MarkdownPreview content={content} hideToolbar filePath={metadata?.filePath} />;
    if (contentType === 'diff') return <DiffPreview content={content} metadata={metadata} hideToolbar />;
    if (contentType === 'code') return <CodePreview content={content} language={metadata?.language} hideToolbar viewMode='preview' />;
    if (contentType === 'pdf') return <PDFPreview filePath={metadata?.filePath} content={content} hideToolbar />;
    if (contentType === 'ppt') return <PPTPreview filePath={metadata?.filePath} content={content} />;
    if (contentType === 'word') return <WordPreview filePath={metadata?.filePath} content={content} hideToolbar />;
    if (contentType === 'excel') return <ExcelPreview filePath={metadata?.filePath} content={content} hideToolbar />;
    if (contentType === 'image') return <ImagePreview filePath={metadata?.filePath} content={content} fileName={metadata?.fileName || metadata?.title} />;
    if (contentType === 'html') return <HTMLPreview content={content} filePath={metadata?.filePath} hideToolbar />;
    return <Empty description='不支持的预览类型' />;
  };

  return (
    <div className='h-full w-full overflow-hidden'>
      <Tabs
        activeTab={activeTab}
        onChange={setActiveTab}
        type='capsule'
        size='small'
        destroyOnHide={false}
        className='h-full'
      >
        <Tabs.TabPane key='spec' title='Live Spec'>
          <div className='h-full'>
            <LiveSpecTab workspace={workspace} onApproveExecute={handleApproveExecute} />
          </div>
        </Tabs.TabPane>
        <Tabs.TabPane key='terminal' title='Terminal'>
          <div className='h-full'>
            <TerminalTab workspace={workspace} active={activeTab === 'terminal'} />
          </div>
        </Tabs.TabPane>
        <Tabs.TabPane key='diff' title='Diff'>
          <div className='h-full'>
            <DiffTab workspace={workspace} active={activeTab === 'diff'} />
          </div>
        </Tabs.TabPane>
        <Tabs.TabPane key='preview' title='Preview'>
          <div className='h-full flex flex-col overflow-hidden'>
            <div className='h-32px px-12px flex items-center bg-bg-2 text-12px text-t-secondary border-b border-b-base'>
              {preview?.metadata?.fileName || preview?.metadata?.title || 'Preview'}
            </div>
            <div className='flex-1 min-h-0 overflow-auto p-12px'>{renderPreviewBody()}</div>
          </div>
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

export default CodeConductorWorkspace;
