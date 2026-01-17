/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import type { TChatConversation } from '@/common/storage';
import { transformMessage } from '@/common/chatLib';
import { Select, Tag } from '@arco-design/web-react';
import React, { useEffect, useMemo, useState } from 'react';
import { MessageListProvider, useAddOrUpdateMessage, useUpdateMessageList } from '@/renderer/messages/hooks';
import MessageList from '@/renderer/messages/MessageList';
import AcpSendBox from '../acp/AcpSendBox';
import type { AcpBackend } from '@/types/acpTypes';
import CodexSendBox from '../codex/CodexSendBox';
import { ConversationProvider } from '@/renderer/context/ConversationContext';
import FlexFullContainer from '@/renderer/components/FlexFullContainer';

type CollabRole = 'pm' | 'analyst' | 'engineer';

const ROLE_LABEL: Record<CollabRole, string> = {
  pm: 'PM',
  analyst: 'Analyst',
  engineer: 'Engineer',
};

const ROLE_TAG_COLOR: Record<CollabRole, React.ComponentProps<typeof Tag>['color']> = {
  pm: 'orangered',
  analyst: 'purple',
  engineer: 'blue',
};

const CollabChatInner: React.FC<{ parentConversation: TChatConversation }> = ({ parentConversation }) => {
  const updateList = useUpdateMessageList();
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const roleMap = (parentConversation.extra as any)?.collab?.roleMap as { pm: string; analyst: string; engineer: string } | undefined;
  const [activeRole, setActiveRole] = useState<CollabRole>('engineer');

  const roleByConversationId = useMemo(() => {
    if (!roleMap) return new Map<string, CollabRole>();
    return new Map<string, CollabRole>([
      [roleMap.pm, 'pm'],
      [roleMap.analyst, 'analyst'],
      [roleMap.engineer, 'engineer'],
    ]);
  }, [roleMap]);

  const activeConversationId = roleMap?.[activeRole];
  const workspace = parentConversation.extra?.workspace;

  // Initial load: merge messages from all children into one list.
  useEffect(() => {
    if (!roleMap) return;
    let cancelled = false;
    void Promise.all([ipcBridge.database.getConversationMessages.invoke({ conversation_id: roleMap.pm, page: 0, pageSize: 10000 }), ipcBridge.database.getConversationMessages.invoke({ conversation_id: roleMap.analyst, page: 0, pageSize: 10000 }), ipcBridge.database.getConversationMessages.invoke({ conversation_id: roleMap.engineer, page: 0, pageSize: 10000 })])
      .then(([pm, analyst, engineer]) => {
        if (cancelled) return;
        const merged = ([] as TMessage[])
          .concat(pm || [])
          .concat(analyst || [])
          .concat(engineer || [])
          .filter(Boolean)
          .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        updateList(() => merged);
      })
      .catch((error) => {
        console.error('[CollabChat] Failed to load collab messages:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [roleMap?.pm, roleMap?.analyst, roleMap?.engineer, updateList]);

  // Live updates: listen to both streams and append messages that belong to children.
  useEffect(() => {
    if (!roleMap) return;
    const children = new Set([roleMap.pm, roleMap.analyst, roleMap.engineer]);
    const handle = (message: { type: string; conversation_id: string; msg_id: string; data: unknown }) => {
      if (!children.has(message.conversation_id)) return;
      // Active role is already handled by the active SendBox stream handler.
      if (activeConversationId && message.conversation_id === activeConversationId) return;
      const transformed = transformMessage(message as any);
      if (!transformed) return;
      addOrUpdateMessage(transformed);
    };

    const unsubAcp = ipcBridge.acpConversation.responseStream.on(handle as any);
    const unsubCodex = ipcBridge.codexConversation.responseStream.on(handle as any);
    return () => {
      unsubAcp?.();
      unsubCodex?.();
    };
  }, [activeConversationId, addOrUpdateMessage, roleMap]);

  const messageHeader = useMemo(() => {
    return (message: TMessage) => {
      const role = roleByConversationId.get(message.conversation_id);
      if (!role) return null;
      return (
        <Tag size='small' color={ROLE_TAG_COLOR[role]} bordered>
          {ROLE_LABEL[role]}
        </Tag>
      );
    };
  }, [roleByConversationId]);

  if (!roleMap || !activeConversationId || !workspace) {
    return (
      <div className='flex-1 flex flex-col px-20px'>
        <div className='text-t-secondary text-sm'>Collaboration is not initialized for this conversation.</div>
      </div>
    );
  }

  return (
    <ConversationProvider value={{ conversationId: activeConversationId, workspace, type: parentConversation.type }}>
      <div className='flex-1 min-h-0 flex flex-col px-20px'>
        <div className='flex items-center justify-between mb-10px'>
          <div className='text-sm text-t-secondary'>Merged roles</div>
          <Select size='mini' value={activeRole} onChange={(v) => setActiveRole(v as CollabRole)} style={{ width: 140 }}>
            <Select.Option value='pm'>PM</Select.Option>
            <Select.Option value='analyst'>Analyst</Select.Option>
            <Select.Option value='engineer'>Engineer</Select.Option>
          </Select>
        </div>

        <FlexFullContainer>
          <MessageList renderMessageHeader={messageHeader} />
        </FlexFullContainer>

        {parentConversation.type === 'acp' ? <AcpSendBox conversation_id={activeConversationId} backend={(parentConversation.extra as any)?.backend || ('claude' as AcpBackend)} /> : <CodexSendBox conversation_id={activeConversationId} />}
      </div>
    </ConversationProvider>
  );
};

const CollabChat: React.FC<{ parentConversation: TChatConversation }> = ({ parentConversation }) => {
  return (
    <MessageListProvider value={[]}>
      <CollabChatInner parentConversation={parentConversation} />
    </MessageListProvider>
  );
};

export default CollabChat;
