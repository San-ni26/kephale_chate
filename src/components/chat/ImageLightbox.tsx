'use client';

/**
 * Image Lightbox - Visionneuse d'images avec zoom et swipe
 * Optimisé pour mobile avec pinch-to-zoom
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { X, Download, Share2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useShare } from '@/src/lib/share';
import { toast } from 'sonner';

interface ImageLightboxProps {
  images: {
    src: string;
    alt?: string;
    filename?: string;
  }[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  onDownload?: (src: string, filename?: string) => void;
}

export function ImageLightbox({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
  onDownload,
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { shareFile, isSupported: isShareSupported } = useShare();

  // Valeurs pour le zoom
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const springScale = useSpring(scale, { stiffness: 300, damping: 30 });
  const springX = useSpring(x, { stiffness: 300, damping: 30 });
  const springY = useSpring(y, { stiffness: 300, damping: 30 });

  // Réinitialiser quand on change d'image
  useEffect(() => {
    setIsZoomed(false);
    scale.set(1);
    x.set(0);
    y.set(0);
  }, [currentIndex, scale, x, y]);

  // Navigation
  const goToNext = useCallback(() => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, images.length]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  // Zoom
  const toggleZoom = useCallback(() => {
    if (isZoomed) {
      scale.set(1);
      x.set(0);
      y.set(0);
      setIsZoomed(false);
    } else {
      scale.set(2.5);
      setIsZoomed(true);
    }
  }, [isZoomed, scale, x, y]);

  // Gestion du pinch (simulé avec le double tap pour l'instant)
  const handleDoubleTap = useCallback(() => {
    toggleZoom();
  }, [toggleZoom]);

  // Drag pour déplacer l'image zoomée
  const handleDrag = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: { offset: { x: number; y: number } }) => {
    if (!isZoomed) return;
    
    const newX = info.offset.x;
    const newY = info.offset.y;
    
    x.set(newX);
    y.set(newY);
  }, [isZoomed, x, y]);

  // Swipe pour changer d'image (seulement si pas zoomé)
  const handleSwipe = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (isZoomed) return;
    
    const swipeThreshold = 100;
    const velocityThreshold = 500;
    
    if (info.offset.x > swipeThreshold || info.velocity.x > velocityThreshold) {
      goToPrev();
    } else if (info.offset.x < -swipeThreshold || info.velocity.x < -velocityThreshold) {
      goToNext();
    }
  }, [isZoomed, goToPrev, goToNext]);

  // Téléchargement
  const handleDownload = useCallback(async () => {
    const currentImage = images[currentIndex];
    if (!currentImage) return;

    if (onDownload) {
      onDownload(currentImage.src, currentImage.filename);
      return;
    }

    // Téléchargement par défaut
    try {
      const response = await fetch(currentImage.src);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentImage.filename || 'image';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Image téléchargée');
    } catch (error) {
      toast.error('Erreur lors du téléchargement');
    }
  }, [images, currentIndex, onDownload]);

  // Partage
  const handleShare = useCallback(async () => {
    const currentImage = images[currentIndex];
    if (!currentImage || !isShareSupported) return;

    try {
      const response = await fetch(currentImage.src);
      const blob = await response.blob();
      const file = new File([blob], currentImage.filename || 'image.jpg', { type: blob.type });
      
      const success = await shareFile(file, currentImage.alt);
      if (success) {
        toast.success('Image partagée');
      }
    } catch (error) {
      toast.error('Erreur lors du partage');
    }
  }, [images, currentIndex, isShareSupported, shareFile]);

  // Fermer avec Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          goToPrev();
          break;
        case 'ArrowRight':
          goToNext();
          break;
        case ' ':
          e.preventDefault();
          toggleZoom();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, goToPrev, goToNext, toggleZoom]);

  // Empêcher le scroll du body
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  const currentImage = images[currentIndex];

  return (
    <AnimatePresence>
      {isOpen && currentImage && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] bg-black/95 flex flex-col"
          ref={containerRef}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 z-10">
            <div className="flex items-center gap-2 text-white/80">
              <span className="text-sm">
                {currentIndex + 1} / {images.length}
              </span>
              {currentImage.filename && (
                <span className="text-sm text-white/60 truncate max-w-[200px]">
                  {currentImage.filename}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {/* Zoom toggle */}
              <button
                onClick={toggleZoom}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                {isZoomed ? (
                  <ZoomOut className="w-5 h-5" />
                ) : (
                  <ZoomIn className="w-5 h-5" />
                )}
              </button>
              
              {/* Share */}
              {isShareSupported && (
                <button
                  onClick={handleShare}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <Share2 className="w-5 h-5" />
                </button>
              )}
              
              {/* Download */}
              <button
                onClick={handleDownload}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <Download className="w-5 h-5" />
              </button>
              
              {/* Close */}
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Image container */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center">
            {/* Navigation arrows (desktop) */}
            {images.length > 1 && (
              <>
                <button
                  onClick={goToPrev}
                  disabled={currentIndex === 0}
                  className={cn(
                    'absolute left-4 z-10 p-2 rounded-full bg-black/50 text-white',
                    'hover:bg-black/70 transition-colors hidden md:block',
                    'disabled:opacity-30 disabled:cursor-not-allowed'
                  )}
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                
                <button
                  onClick={goToNext}
                  disabled={currentIndex === images.length - 1}
                  className={cn(
                    'absolute right-4 z-10 p-2 rounded-full bg-black/50 text-white',
                    'hover:bg-black/70 transition-colors hidden md:block',
                    'disabled:opacity-30 disabled:cursor-not-allowed'
                  )}
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}

            {/* Image avec animations */}
            <motion.div
              className="relative w-full h-full flex items-center justify-center"
              onDoubleClick={handleDoubleTap}
            >
              <motion.img
                key={currentIndex}
                src={currentImage.src}
                alt={currentImage.alt || ''}
                style={{
                  scale: springScale,
                  x: springX,
                  y: springY,
                  cursor: isZoomed ? 'grab' : 'default',
                }}
                drag={isZoomed}
                dragConstraints={containerRef}
                dragElastic={0}
                onDragStart={() => setIsDragging(true)}
                onDragEnd={(_, info) => {
                  setIsDragging(false);
                  if (!isZoomed) {
                    handleSwipe(_, info);
                  }
                }}
                className={cn(
                  'max-w-full max-h-full object-contain',
                  isDragging && 'cursor-grabbing'
                )}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              />
            </motion.div>
          </div>

          {/* Thumbnails (si plusieurs images) */}
          {images.length > 1 && (
            <div className="flex justify-center gap-2 p-4 overflow-x-auto">
              {images.map((img, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentIndex(index)}
                  className={cn(
                    'w-16 h-16 rounded-lg overflow-hidden flex-shrink-0',
                    'border-2 transition-colors',
                    index === currentIndex
                      ? 'border-primary'
                      : 'border-transparent hover:border-white/50'
                  )}
                >
                  <img
                    src={img.src}
                    alt={img.alt || ''}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Instructions */}
          <div className="absolute bottom-20 left-0 right-0 text-center text-white/50 text-sm pointer-events-none">
            Double-tap pour zoomer • Swipe pour naviguer
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ImageLightbox;
