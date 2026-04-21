'use client';

/**
 * Indicateur de qualité de connexion vidéo
 * Affiche une icône wifi avec couleur selon la qualité
 */

import { Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor';

interface QualityIndicatorProps {
  quality: ConnectionQuality;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const qualityConfig: Record<ConnectionQuality, {
  icon: typeof Wifi;
  color: string;
  bgColor: string;
  label: string;
  tooltip: string;
}> = {
  excellent: {
    icon: Wifi,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/30',
    label: 'Excellente',
    tooltip: 'Connexion excellente',
  },
  good: {
    icon: Wifi,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/30',
    label: 'Bonne',
    tooltip: 'Connexion bonne',
  },
  fair: {
    icon: Wifi,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/30',
    label: 'Moyenne',
    tooltip: 'Connexion moyenne - réduction vidéo',
  },
  poor: {
    icon: WifiOff,
    color: 'text-red-400',
    bgColor: 'bg-red-500/30',
    label: 'Faible',
    tooltip: 'Connexion faible - vidéo réduite au minimum',
  },
};

const sizeConfig = {
  sm: {
    icon: 'w-3 h-3',
    container: 'px-1.5 py-0.5 text-[10px]',
  },
  md: {
    icon: 'w-4 h-4',
    container: 'px-2 py-0.5 text-xs',
  },
  lg: {
    icon: 'w-5 h-5',
    container: 'px-2.5 py-1 text-sm',
  },
};

export function QualityIndicator({
  quality,
  showLabel = false,
  size = 'sm',
  className,
}: QualityIndicatorProps) {
  const config = qualityConfig[quality];
  const Icon = config.icon;
  const sizes = sizeConfig[size];

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full backdrop-blur-sm',
        config.bgColor,
        sizes.container,
        className
      )}
      title={config.tooltip}
    >
      <Icon className={cn(sizes.icon, config.color)} />
      {showLabel && (
        <span className={cn('font-medium', config.color)}>{config.label}</span>
      )}
    </div>
  );
}

/**
 * Badge de qualité avec animation pour les changements
 */
interface QualityBadgeProps {
  quality: ConnectionQuality;
  isReconnecting?: boolean;
  className?: string;
}

export function QualityBadge({ quality, isReconnecting, className }: QualityBadgeProps) {
  if (isReconnecting) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
        'bg-amber-500/50 text-amber-100 text-xs animate-pulse',
        className
      )}>
        <span className="w-3 h-3 border-2 border-amber-200 border-t-transparent rounded-full animate-spin" />
        Reconnexion...
      </span>
    );
  }

  const config = qualityConfig[quality];

  return (
    <QualityIndicator
      quality={quality}
      showLabel
      size="md"
      className={className}
    />
  );
}
