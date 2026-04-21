/**
 * Configuration du thème Mango Chat
 * 
 * Ce fichier centralise toutes les couleurs et configurations du thème.
 * Pour modifier le thème, changez simplement les valeurs ci-dessous.
 * 
 * @example
 * // Pour utiliser dans un composant:
 * import { theme } from '@/src/lib/theme';
 * 
 * <div style={{ backgroundColor: theme.colors.primary }} />
 * // ou avec Tailwind:
 * <div className="bg-primary" />
 */

export const theme = {
  // ═══════════════════════════════════════════════════════════════
  // COULEURS PRINCIPALES
  // ═══════════════════════════════════════════════════════════════
  colors: {
    // Orange principal
    primary: {
      50: '#FFF5EB',
      100: '#FFE6D1',
      200: '#FFC9A3',
      300: '#FFA375',
      400: '#FF7D47',
      500: '#FF6B00', // Couleur principale
      600: '#E65C00', // Hover
      700: '#CC4D00',
      800: '#993900',
      900: '#662600',
    },
    
    // États
    success: {
      light: '#22C55E',
      dark: '#4ADE80',
    },
    warning: {
      light: '#F59E0B',
      dark: '#FBBF24',
    },
    error: {
      light: '#EF4444',
      dark: '#F87171',
    },
    info: {
      light: '#3B82F6',
      dark: '#60A5FA',
    },
    
    // Messages
    message: {
      sent: {
        light: { bg: '#FF6B00', text: '#FFFFFF' },
        dark: { bg: '#FF6B00', text: '#FFFFFF' },
      },
      received: {
        light: { bg: '#F1F1F1', text: '#1A1A1A' },
        dark: { bg: '#262626', text: '#FAFAFA' },
      },
    },
  },
  
  // ═══════════════════════════════════════════════════════════════
  // CONFIGURATION MODE CLAIR
  // ═══════════════════════════════════════════════════════════════
  light: {
    background: '#FAFAFA',
    foreground: '#1A1A1A',
    card: '#FFFFFF',
    'card-foreground': '#1A1A1A',
    primary: '#FF6B00',
    'primary-foreground': '#FFFFFF',
    'primary-hover': '#E65C00',
    secondary: '#F5F5F5',
    'secondary-foreground': '#1A1A1A',
    muted: '#F1F1F1',
    'muted-foreground': '#737373',
    accent: '#FFF5EB',
    'accent-foreground': '#E65C00',
    border: '#E5E5E5',
    input: '#E5E5E5',
    ring: '#FF6B00',
  },
  
  // ═══════════════════════════════════════════════════════════════
  // CONFIGURATION MODE SOMBRE
  // ═══════════════════════════════════════════════════════════════
  dark: {
    background: '#0A0A0A',
    foreground: '#FAFAFA',
    card: '#171717',
    'card-foreground': '#FAFAFA',
    primary: '#FF8533',
    'primary-foreground': '#0A0A0A',
    'primary-hover': '#FF944D',
    secondary: '#262626',
    'secondary-foreground': '#FAFAFA',
    muted: '#262626',
    'muted-foreground': '#A3A3A3',
    accent: '#331400',
    'accent-foreground': '#FF8533',
    border: '#404040',
    input: '#404040',
    ring: '#FF8533',
  },
  
  // ═══════════════════════════════════════════════════════════════
  // BORDURES ET RAYONS
  // ═══════════════════════════════════════════════════════════════
  radius: {
    sm: '0.375rem',
    md: '0.5rem',
    lg: '0.625rem',
    xl: '1rem',
    '2xl': '1.25rem',
    full: '9999px',
  },
  
  // ═══════════════════════════════════════════════════════════════
  // OMBRES
  // ═══════════════════════════════════════════════════════════════
  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  },
  
  // ═══════════════════════════════════════════════════════════════
  // TRANSITIONS
  // ═══════════════════════════════════════════════════════════════
  transitions: {
    fast: '150ms ease-in-out',
    DEFAULT: '200ms ease-in-out',
    slow: '300ms ease-in-out',
  },
} as const;

// Type export pour l'autocomplétion
export type Theme = typeof theme;

// ═══════════════════════════════════════════════════════════════
// UTILITAIRES DE COULEUR
// ═══════════════════════════════════════════════════════════════

/**
 * Convertit une couleur hexadécimale en RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Ajoute de la transparence à une couleur hexadécimale
 */
export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * Éclaircit ou assombrit une couleur hexadécimale
 * @param hex - Couleur hexadécimale
 * @param percent - Pourcentage de modification (-100 à 100)
 */
export function adjustColor(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const adjust = (value: number) => {
    const adjusted = Math.min(255, Math.max(0, value + (value * percent) / 100));
    return Math.round(adjusted);
  };
  
  const r = adjust(rgb.r);
  const g = adjust(rgb.g);
  const b = adjust(rgb.b);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Vérifie si une couleur est claire ou foncée (pour choisir le texte contrastant)
 */
export function isLightColor(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return true;
  
  // Formule de luminosité relative
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5;
}

/**
 * Retourne la couleur de texte contrastante (noir ou blanc) pour une couleur de fond
 */
export function getContrastColor(hex: string): string {
  return isLightColor(hex) ? '#000000' : '#FFFFFF';
}
