/**
 * @license
 * Copyright 2025 CodeConductor (CodeConductor.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React from 'react';
import AsciiSpinner from '@/renderer/components/AsciiSpinner';

export type TimelineType = 'thinking' | 'task' | 'tool' | 'response' | 'user' | 'permission';

export interface TimelineIndicatorProps {
  /** Timeline node type */
  type: TimelineType;
  /** Is this the first node in the timeline */
  isFirst?: boolean;
  /** Is this the last node in the timeline */
  isLast?: boolean;
  /** Is this node currently active (shows pulse animation) */
  isActive?: boolean;
  /** Optional label to display next to the dot */
  label?: string;
}

/**
 * TimelineIndicator - Visual timeline node component
 * Renders a dot with optional connecting line and label
 * When active, shows Claude Code style ASCII spinner animation
 */
const TimelineIndicator: React.FC<TimelineIndicatorProps> = ({ type, isFirst = false, isLast = false, isActive = false, label }) => {
  return (
    <div className='timeline-indicator'>
      {/* Connector line (top) */}
      {!isFirst && <div className='timeline-connector timeline-connector--top' />}

      {/* Timeline dot or ASCII spinner when active */}
      {isActive ? (
        <div className='timeline-spinner'>
          <AsciiSpinner size={14} style='petal' glow glowColor='var(--primary)' />
        </div>
      ) : (
        <div
          className={classNames('timeline-dot', `timeline-dot--${type}`, {
            'timeline-dot--active': isActive,
          })}
        />
      )}

      {/* Connector line (bottom) */}
      {!isLast && <div className='timeline-connector timeline-connector--bottom' />}

      {/* Optional label */}
      {label && <span className='timeline-label text-xs text-t-secondary'>{label}</span>}
    </div>
  );
};

export default TimelineIndicator;
