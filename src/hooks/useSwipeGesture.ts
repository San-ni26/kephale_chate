/**
 * Hook de gestion des gestures tactiles (swipe)
 * Optimisé pour mobile avec support du touch et mouse
 */

import { useRef, useCallback, useEffect, useState } from 'react';

interface SwipeConfig {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  onSwipeStart?: () => void;
  onSwipeEnd?: () => void;
  threshold?: number;        // Distance minimale pour déclencher (px)
  maxSwipe?: number;         // Distance maximale de swipe (px)
  elasticity?: number;       // Facteur d'élasticité (0-1)
  direction?: 'horizontal' | 'vertical' | 'both';
  preventDefault?: boolean;  // Empêcher le comportement par défaut
}

interface SwipeState {
  isDragging: boolean;
  deltaX: number;
  deltaY: number;
  progress: number;  // 0 à 1 selon le threshold
}

export function useSwipeGesture(config: SwipeConfig) {
  const {
    onSwipeRight,
    onSwipeLeft,
    onSwipeStart,
    onSwipeEnd,
    threshold = 80,
    maxSwipe = 150,
    elasticity = 0.8,
    direction = 'horizontal',
    preventDefault = true,
  } = config;

  const [swipeState, setSwipeState] = useState<SwipeState>({
    isDragging: false,
    deltaX: 0,
    deltaY: 0,
    progress: 0,
  });

  const startPos = useRef<{ x: number; y: number } | null>(null);
  const currentPos = useRef<{ x: number; y: number } | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);
  const isDragging = useRef(false);
  const startTime = useRef<number>(0);

  const handleStart = useCallback((clientX: number, clientY: number) => {
    startPos.current = { x: clientX, y: clientY };
    currentPos.current = { x: clientX, y: clientY };
    isDragging.current = true;
    startTime.current = Date.now();
    
    setSwipeState(prev => ({ ...prev, isDragging: true }));
    onSwipeStart?.();
  }, [onSwipeStart]);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging.current || !startPos.current) return;

    const deltaX = clientX - startPos.current.x;
    const deltaY = clientY - startPos.current.y;
    
    currentPos.current = { x: clientX, y: clientY };

    // Vérifier la direction si nécessaire
    if (direction !== 'both') {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      
      if (direction === 'horizontal' && absY > absX * 0.5) {
        // Mouvement principalement vertical, ignorer
        return;
      }
      if (direction === 'vertical' && absX > absY * 0.5) {
        // Mouvement principalement horizontal, ignorer
        return;
      }
    }

    // Appliquer l'élasticité
    const elasticDeltaX = deltaX * elasticity;
    const clampedDeltaX = Math.max(-maxSwipe, Math.min(maxSwipe, elasticDeltaX));
    
    const progress = Math.min(Math.abs(clampedDeltaX) / threshold, 1);

    setSwipeState({
      isDragging: true,
      deltaX: clampedDeltaX,
      deltaY,
      progress,
    });
  }, [direction, elasticity, maxSwipe, threshold]);

  const handleEnd = useCallback(() => {
    if (!isDragging.current) return;

    const deltaX = swipeState.deltaX;
    const velocity = Math.abs(deltaX) / (Date.now() - startTime.current + 1);
    
    // Déclencher si threshold atteint OU vitesse suffisante
    const shouldTrigger = Math.abs(deltaX) >= threshold || velocity > 0.5;

    if (shouldTrigger) {
      if (deltaX > 0 && onSwipeRight) {
        onSwipeRight();
      } else if (deltaX < 0 && onSwipeLeft) {
        onSwipeLeft();
      }
    }

    isDragging.current = false;
    startPos.current = null;
    currentPos.current = null;
    
    setSwipeState({
      isDragging: false,
      deltaX: 0,
      deltaY: 0,
      progress: 0,
    });
    
    onSwipeEnd?.();
  }, [swipeState.deltaX, threshold, onSwipeRight, onSwipeLeft, onSwipeEnd]);

  // Touch events
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (preventDefault) {
      // Ne pas preventDefault immédiatement pour permettre le scroll vertical
      const touch = e.touches[0];
      startPos.current = { x: touch.clientX, y: touch.clientY };
    }
    const touch = e.touches[0];
    handleStart(touch.clientX, touch.clientY);
  }, [handleStart, preventDefault]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    
    const touch = e.touches[0];
    
    // Si on swipe horizontalement, empêcher le scroll
    if (startPos.current && direction === 'horizontal') {
      const deltaX = Math.abs(touch.clientX - startPos.current.x);
      const deltaY = Math.abs(touch.clientY - startPos.current.y);
      
      if (deltaX > deltaY && deltaX > 10) {
        e.preventDefault();
      }
    }
    
    handleMove(touch.clientX, touch.clientY);
  }, [handleMove, direction]);

  const onTouchEnd = useCallback(() => {
    handleEnd();
  }, [handleEnd]);

  // Mouse events (pour desktop)
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    handleStart(e.clientX, e.clientY);
  }, [handleStart]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    handleMove(e.clientX, e.clientY);
  }, [handleMove]);

  const onMouseUp = useCallback(() => {
    handleEnd();
  }, [handleEnd]);

  const onMouseLeave = useCallback(() => {
    if (isDragging.current) {
      handleEnd();
    }
  }, [handleEnd]);

  // Reset function
  const reset = useCallback(() => {
    isDragging.current = false;
    startPos.current = null;
    currentPos.current = null;
    setSwipeState({
      isDragging: false,
      deltaX: 0,
      deltaY: 0,
      progress: 0,
    });
  }, []);

  return {
    swipeState,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onMouseLeave,
    },
    reset,
    ref: elementRef,
  };
}

export type { SwipeConfig, SwipeState };
