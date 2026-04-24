/**
 * Utilitaire de feedback haptique (vibrations)
 * Compatible avec l'API Vibration et Haptics API (iOS 13+)
 */

// Patterns de vibration prédéfinis (en ms)
export const HAPTIC_PATTERNS = {
  // Confirmation simple
  MESSAGE_SENT: [10],
  
  // Message reçu - double pulse subtil
  MESSAGE_RECEIVED: [5, 50, 5],
  
  // Erreur - triple vibration
  ERROR: [50, 100, 50],
  
  // Succès - double confirmation
  SUCCESS: [20, 50, 20],
  
  // Appui long - menu contextuel
  LONG_PRESS: [30],
  
  // Appel entrant - pattern répété
  CALL_INCOMING: [100, 100, 100, 500],
  
  // Swipe action
  SWIPE_ACTION: [15],
  
  // Suppression
  DELETE: [40, 30, 40],
  
  // Sélection
  SELECTION: [5],
  
  // Transition
  TRANSITION: [10, 20, 10],
} as const;

export type HapticPattern = keyof typeof HAPTIC_PATTERNS;

// Types de feedback iOS (Haptics API)
type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

interface HapticsAPI {
  impactOccurred?: (style: string) => void;
  notificationOccurred?: (type: string) => void;
  selectionChanged?: () => void;
}

declare global {
  interface Window {
    WebView?: {
      bridge?: {
        haptics?: HapticsAPI;
      };
    };
  }
}

/**
 * Vérifie si l'API Vibration est supportée
 */
export function isVibrationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

/**
 * Vérifie si les Haptics iOS sont disponibles
 */
export function isHapticsSupported(): boolean {
  return typeof window !== 'undefined' && 
    !!window.WebView?.bridge?.haptics;
}

/**
 * Déclenche une vibration avec un pattern
 */
export function vibrate(pattern: number[] | HapticPattern): void {
  if (!isVibrationSupported()) return;
  
  const patternArray = typeof pattern === 'string' 
    ? HAPTIC_PATTERNS[pattern] 
    : pattern;
  
  try {
    navigator.vibrate(patternArray);
  } catch (e) {
    // Silencieux en cas d'erreur
  }
}

/**
 * Déclenche un feedback haptic iOS
 */
export function hapticFeedback(type: HapticType): void {
  const haptics = window.WebView?.bridge?.haptics;
  if (!haptics) return;
  
  try {
    switch (type) {
      case 'light':
      case 'medium':
      case 'heavy':
        haptics.impactOccurred?.(type);
        break;
      case 'success':
      case 'warning':
      case 'error':
        haptics.notificationOccurred?.(type);
        break;
    }
  } catch (e) {
    // Fallback sur vibration standard
    const fallbackPattern: Record<HapticType, number[]> = {
      light: [5],
      medium: [10],
      heavy: [20],
      success: [10, 50, 10],
      warning: [30, 50, 30],
      error: [50, 100, 50],
    };
    vibrate(fallbackPattern[type]);
  }
}

/**
 * Feedback de sélection (léger)
 */
export function selectionHaptic(): void {
  const haptics = window.WebView?.bridge?.haptics;
  if (haptics?.selectionChanged) {
    haptics.selectionChanged();
  } else {
    vibrate('SELECTION');
  }
}

/**
 * Wrapper intelligent qui utilise la meilleure API disponible
 */
export function triggerHaptic(
  pattern: HapticPattern,
  iosType?: HapticType
): void {
  // Priorité à iOS Haptics si disponible et type spécifié
  if (iosType && isHapticsSupported()) {
    hapticFeedback(iosType);
    return;
  }
  
  // Sinon utiliser l'API Vibration standard
  vibrate(pattern);
}

/**
 * Hook utilitaire pour React
 */
export function useHaptics() {
  const isSupported = isVibrationSupported();
  
  return {
    isSupported,
    vibrate: triggerHaptic,
    selection: selectionHaptic,
    impact: (type: HapticType) => hapticFeedback(type),
    patterns: HAPTIC_PATTERNS,
  };
}
