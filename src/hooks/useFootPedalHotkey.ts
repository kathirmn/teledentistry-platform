'use client';

import { useEffect, useCallback } from 'react';

interface UseFootPedalHotkeyProps {
  onTriggerSnapshot: () => void;
  enabled?: boolean;
}

/**
 * Listens for keyboard triggers (Spacebar, Enter, or USB foot pedal emulation)
 * to take a hands-free clinical snapshot without contaminating sterile gloves.
 */
export function useFootPedalHotkey({
  onTriggerSnapshot,
  enabled = true,
}: UseFootPedalHotkeyProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger if user is actively typing in a chat or notes input field
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Spacebar or Enter (standard USB foot pedals emulate these keys)
      if (e.code === 'Space' || e.key === ' ' || e.code === 'NumpadEnter') {
        e.preventDefault();
        console.log('[Hands-Free] Snapshot triggered via Foot Pedal / Hotkey:', e.code);
        onTriggerSnapshot();
      }
    },
    [enabled, onTriggerSnapshot]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
