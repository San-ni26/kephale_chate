'use client';

/**
 * Bottom Sheet - Composant de panneau glissant pour mobile
 * Inspiré de iOS et Material Design
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, PanInfo, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  snapPoints?: number[];  // Points d'ancrage en % (ex: [25, 50, 85])
  initialSnap?: number;   // Index du snap point initial
  showHandle?: boolean;
  showCloseButton?: boolean;
  className?: string;
  backdropClassName?: string;
  onSnapChange?: (index: number) => void;
  disableDrag?: boolean;
}

export function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
  snapPoints = [25, 50, 85],
  initialSnap = 1,
  showHandle = true,
  showCloseButton = true,
  className,
  backdropClassName,
  onSnapChange,
  disableDrag = false,
}: BottomSheetProps) {
  const [currentSnap, setCurrentSnap] = useState(initialSnap);
  const [isDragging, setIsDragging] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Valeur de position Y (0 = ouvert, 100% = fermé)
  const y = useMotionValue(0);
  const springY = useSpring(y, { stiffness: 300, damping: 30 });

  // Convertir les snap points en pixels
  const getSnapPixels = useCallback((index: number) => {
    if (typeof window === 'undefined') return 0;
    const vh = window.innerHeight;
    const percentage = snapPoints[index] || snapPoints[snapPoints.length - 1];
    return vh * (percentage / 100);
  }, [snapPoints]);

  // Position initiale
  useEffect(() => {
    if (isOpen) {
      const targetY = getSnapPixels(initialSnap);
      y.set(-targetY);
      setCurrentSnap(initialSnap);
    } else {
      y.set(0);
    }
  }, [isOpen, initialSnap, getSnapPixels, y]);

  // Gestion du glissement
  const handleDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);
    
    const velocity = info.velocity.y;
    const offset = info.offset.y;
    const currentY = y.get();
    
    // Si glissement vers le bas rapide ou suffisant → fermer
    if (velocity > 500 || offset > 100) {
      onClose();
      return;
    }
    
    // Sinon, trouver le snap point le plus proche
    const currentHeight = Math.abs(currentY);
    let closestIndex = 0;
    let minDiff = Infinity;
    
    snapPoints.forEach((point, index) => {
      const pixelPoint = (point / 100) * (typeof window !== 'undefined' ? window.innerHeight : 0);
      const diff = Math.abs(currentHeight - pixelPoint);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = index;
      }
    });
    
    // Si on est proche de 0 → fermer
    if (closestIndex === 0 && currentHeight < getSnapPixels(0) * 0.5) {
      onClose();
      return;
    }
    
    const targetY = getSnapPixels(closestIndex);
    y.set(-targetY);
    setCurrentSnap(closestIndex);
    onSnapChange?.(closestIndex);
  }, [y, snapPoints, getSnapPixels, onClose, onSnapChange]);

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  // Fermer avec Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Empêcher le scroll du body quand ouvert
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className={cn(
              'fixed inset-0 bg-black/50 z-[100] backdrop-blur-sm',
              backdropClassName
            )}
          />
          
          {/* Sheet */}
          <motion.div
            ref={contentRef}
            initial={{ y: '100%' }}
            animate={{ y: springY.get() }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{ y: springY }}
            drag={disableDrag ? false : 'y'}
            dragConstraints={{ top: -getSnapPixels(snapPoints.length - 1), bottom: 0 }}
            dragElastic={0.1}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            className={cn(
              'fixed left-0 right-0 bottom-0 z-[101]',
              'bg-background rounded-t-2xl shadow-2xl',
              'flex flex-col max-h-[90vh]',
              isDragging ? 'cursor-grabbing' : 'cursor-grab',
              className
            )}
          >
            {/* Handle */}
            {showHandle && (
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1.5 rounded-full bg-muted-foreground/30" />
              </div>
            )}
            
            {/* Header */}
            {(title || showCloseButton) && (
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                {title && (
                  <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                )}
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    className={cn(
                      'p-2 rounded-full hover:bg-muted transition-colors',
                      !title && 'ml-auto'
                    )}
                  >
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                )}
              </div>
            )}
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Variante plus simple pour les menus contextuels
 */
interface BottomSheetMenuProps {
  isOpen: boolean;
  onClose: () => void;
  items: {
    id: string;
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    variant?: 'default' | 'destructive';
    disabled?: boolean;
  }[];
  title?: string;
}

export function BottomSheetMenu({ isOpen, onClose, items, title }: BottomSheetMenuProps) {
  const handleItemClick = (item: typeof items[0]) => {
    if (!item.disabled) {
      item.onClick();
      onClose();
    }
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      snapPoints={[30, 50]}
      initialSnap={0}
    >
      <div className="py-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 text-left',
              'hover:bg-muted/50 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              item.variant === 'destructive' && 'text-destructive hover:bg-destructive/10'
            )}
          >
            {item.icon && (
              <span className="text-muted-foreground">{item.icon}</span>
            )}
            <span className="flex-1">{item.label}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

export default BottomSheet;
