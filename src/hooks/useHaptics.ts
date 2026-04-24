/**
 * Hook React pour le feedback haptique
 */

import { useCallback } from 'react';
import { 
  triggerHaptic, 
  vibrate, 
  selectionHaptic, 
  hapticFeedback,
  HAPTIC_PATTERNS,
  HapticPattern,
  isVibrationSupported,
  isHapticsSupported 
} from '@/src/lib/haptics';

export type { HapticPattern };

export function useHaptics() {
  const isSupported = isVibrationSupported();
  const isIOSSupported = isHapticsSupported();

  const vibratePattern = useCallback((pattern: number[] | HapticPattern) => {
    vibrate(pattern);
  }, []);

  const trigger = useCallback((pattern: HapticPattern, iosType?: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error') => {
    triggerHaptic(pattern, iosType);
  }, []);

  const selection = useCallback(() => {
    selectionHaptic();
  }, []);

  const impact = useCallback((type: 'light' | 'medium' | 'heavy') => {
    hapticFeedback(type);
  }, []);

  const notification = useCallback((type: 'success' | 'warning' | 'error') => {
    hapticFeedback(type);
  }, []);

  return {
    isSupported,
    isIOSSupported,
    vibrate: vibratePattern,
    trigger,
    selection,
    impact,
    notification,
    patterns: HAPTIC_PATTERNS,
  };
}
