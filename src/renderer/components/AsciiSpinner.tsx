/**
 * @license
 * Copyright 2025 CodeConductor (CodeConductor.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * AsciiSpinner - Claude Code style ASCII character animation
 *
 * Implementation based on Claude Code's signature spinning animation:
 * 1. ASCII Frame Cycling - Rapidly switches between directional characters
 * 2. Glow Effect - CSS text-shadow creates the luminous appearance
 * 3. Smooth Transitions - CSS transitions for fluid character changes
 */

import React, { useEffect, useRef, useState } from 'react';

// Claude Code signature spinner characters (directional feel)
const PETAL_FRAMES = ['·', '✻', '✽', '✶', '✳', '✢'];

// Alternative character sets
export const ASCII_SPINNER_CHARS = {
  petal: PETAL_FRAMES,
  star: ['✶', '✷', '✸', '✹', '✺', '✻', '✼', '✽'],
  braille: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  dots: ['◐', '◑', '◒', '◓'],
  circle: ['○', '◔', '◑', '◕', '●', '◕', '◑', '◔'],
  line: ['|', '/', '-', '\\'],
} as const;

export type SpinnerStyle = keyof typeof ASCII_SPINNER_CHARS;

interface AsciiSpinnerProps {
  /** Spinner size in pixels (font-size) */
  size?: number;
  /** Animation interval in milliseconds (default 80ms like Claude Code) */
  interval?: number;
  /** Character style variant */
  style?: SpinnerStyle;
  /** Custom class name */
  className?: string;
  /** Glow color (CSS color value) */
  glowColor?: string;
  /** Enable glow effect */
  glow?: boolean;
  /** Custom inline styles */
  cssStyle?: React.CSSProperties;
}

// Inject keyframes once
const KEYFRAMES_ID = 'ascii-spinner-keyframes';
const injectKeyframes = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;

  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes ascii-spinner-glow {
      0%, 100% {
        opacity: 0.7;
        filter: brightness(1);
      }
      50% {
        opacity: 1;
        filter: brightness(1.3);
      }
    }
    @keyframes ascii-spinner-pulse {
      0%, 100% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.1);
      }
    }
    .ascii-spinner-animated {
      animation: ascii-spinner-glow 1.2s ease-in-out infinite, ascii-spinner-pulse 0.8s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
};

/**
 * AsciiSpinner - Claude Code style ASCII character animation spinner
 *
 * Features:
 * - Frame-by-frame ASCII animation (like a flipbook)
 * - Glow effect using text-shadow
 * - Smooth pulse animation
 * - Configurable speed and character set
 */
const AsciiSpinner: React.FC<AsciiSpinnerProps> = ({ size = 14, interval = 80, style = 'petal', className = '', glowColor = 'var(--primary, #6366f1)', glow = true, cssStyle }) => {
  const [frameIndex, setFrameIndex] = useState(0);
  const frames = ASCII_SPINNER_CHARS[style];
  const injectedRef = useRef(false);

  // Inject keyframes on mount
  useEffect(() => {
    if (!injectedRef.current) {
      injectKeyframes();
      injectedRef.current = true;
    }
  }, []);

  // Frame cycling timer
  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length);
    }, interval);

    return () => clearInterval(timer);
  }, [frames.length, interval]);

  // Glow shadow effect
  const glowShadow = glow ? `0 0 ${size * 0.5}px ${glowColor}, 0 0 ${size}px ${glowColor}, 0 0 ${size * 1.5}px ${glowColor}` : 'none';

  return (
    <span
      className={`ascii-spinner ${glow ? 'ascii-spinner-animated' : ''} ${className}`}
      style={{
        fontSize: size,
        fontFamily: 'monospace',
        display: 'inline-block',
        width: '1.2em',
        textAlign: 'center',
        lineHeight: 1,
        color: glowColor,
        textShadow: glowShadow,
        transition: 'text-shadow 0.15s ease',
        ...cssStyle,
      }}
      aria-label='Loading'
      role='status'
    >
      {frames[frameIndex]}
    </span>
  );
};

export default AsciiSpinner;
