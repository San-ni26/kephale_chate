/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DOCUMENTATION DU THÈME MANGO CHAT - PALETTE ORANGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Ce fichier documente l'utilisation du thème orange dans l'application.
 * 
 * 📁 Fichiers importants:
 * - app/globals.css : Variables CSS du thème
 * - app/theme-utilities.css : Classes utilitaires personnalisées
 * - src/lib/theme.ts : Configuration TypeScript du thème
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 1. UTILISATION AVEC TAILWIND CSS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Les variables CSS sont automatiquement mappées vers les classes Tailwind:
 * 
 * @example
 * // Fond orange primaire
 * <div className="bg-primary" />
 * 
 * // Texte blanc sur fond orange
 * <div className="bg-primary text-primary-foreground" />
 * 
 * // Fond gris clair (message reçu)
 * <div className="bg-[var(--message-received)]" />
 * 
 * // Bordure orange
 * <div className="border-primary" />
 * 
 * // Hover orange foncé
 * <button className="bg-primary hover:bg-[var(--primary-hover)]" />
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 2. UTILISATION DES COULEURS DE MESSAGE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Messages envoyés (orange):
 * @example
 * <div className="bg-[var(--message-sent)] text-[var(--message-sent-text)]">
 *   Message envoyé
 * </div>
 * 
 * Messages reçus (gris):
 * @example
 * <div className="bg-[var(--message-received)] text-[var(--message-received-text)]">
 *   Message reçu
 * </div>
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PALETTE ORANGE COMPLÈTE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * --orange-50:  #FFF5EB  (Très clair - fonds)
 * --orange-100: #FFE6D1  (Clair - hover léger)
 * --orange-200: #FFC9A3  (Light)
 * --orange-300: #FFA375  (Medium light)
 * --orange-400: #FF7D47  (Medium)
 * --orange-500: #FF6B00  (🔶 PRIMAIRE)
 * --orange-600: #E65C00  (Hover)
 * --orange-700: #CC4D00  (Dark)
 * --orange-800: #993900  (Très dark)
 * --orange-900: #662600  (Extra dark)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 4. MODE CLAIR vs MODE SOMBRE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Les variables changent automatiquement en mode sombre (.dark class sur <html>):
 * 
 * | Variable          | Light       | Dark        |
 * |-------------------|-------------|-------------|
 * | --background      | #FAFAFA     | #0A0A0A     |
 * | --foreground      | #1A1A1A     | #FAFAFA     |
 * | --primary         | #FF6B00     | #FF8533     |
 * | --primary-hover   | #E65C00     | #FF944D     |
 * | --card            | #FFFFFF     | #171717     |
 * | --muted           | #F1F1F1     | #262626     |
 * | --border          | #E5E5E5     | #404040     |
 * 
 * Utilisez les classes Tailwind standard et les couleurs s'adapteront:
 * <div className="bg-background text-foreground" />
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 5. UTILITAIRES JAVASCRIPT/TYPESCRIPT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * import { theme, hexToRgba, adjustColor, getContrastColor } from '@/src/lib/theme';
 * 
 * // Accéder aux couleurs
 * theme.colors.primary[500]; // '#FF6B00'
 * theme.light.primary;       // '#FF6B00'
 * theme.dark.primary;        // '#FF8533'
 * 
 * // Ajouter de la transparence
 * hexToRgba('#FF6B00', 0.5); // 'rgba(255, 107, 0, 0.5)'
 * 
 * // Éclaircir/Assombrir
 * adjustColor('#FF6B00', 20);  // Plus clair
 * adjustColor('#FF6B00', -20); // Plus foncé
 * 
 * // Couleur contrastante
 * getContrastColor('#FF6B00'); // '#FFFFFF'
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 6. COMPOSANT EXEMPLE: BOUTON AVEC THÈME
// ═══════════════════════════════════════════════════════════════════════════════

/*
import { ButtonHTMLAttributes } from 'react';
import { cn } from '@/src/lib/utils';

interface ThemeButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function ThemeButton({ 
  variant = 'primary', 
  size = 'md',
  className,
  children,
  ...props 
}: ThemeButtonProps) {
  return (
    <button
      className={cn(
        // Base
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        
        // Variantes
        variant === 'primary' && [
          'bg-primary text-primary-foreground',
          'hover:bg-[var(--primary-hover)]',
          'focus:ring-2 focus:ring-primary/50',
        ],
        variant === 'secondary' && [
          'bg-secondary text-secondary-foreground',
          'hover:bg-secondary/80',
        ],
        variant === 'ghost' && [
          'hover:bg-muted text-foreground',
        ],
        
        // Tailles
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-10 px-4',
        size === 'lg' && 'h-12 px-6 text-lg',
        
        // Désactivé
        'disabled:opacity-50 disabled:pointer-events-none',
        
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
*/

// ═══════════════════════════════════════════════════════════════════════════════
// 7. EXEMPLE: BADGE DE NOTIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

/*
interface BadgeProps {
  count: number;
  variant?: 'default' | 'unread';
}

export function Badge({ count, variant = 'default' }: BadgeProps) {
  if (count <= 0) return null;
  
  return (
    <span className={cn(
      'inline-flex items-center justify-center rounded-full text-xs font-bold',
      'min-w-[16px] h-[16px] px-1',
      variant === 'default' && 'bg-primary text-primary-foreground',
      variant === 'unread' && 'bg-destructive text-destructive-foreground',
    )}>
      {count > 99 ? '99+' : count}
    </span>
  );
}
*/

// ═══════════════════════════════════════════════════════════════════════════════
// 8. CHANGEMENT DE THÈME (CLAIR/SOMBRE)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Le changement de thème est géré par le ThemeProvider dans layout.tsx.
 * Utilisez le hook useTheme de next-themes:
 * 
 * @example
 * 'use client';
 * import { useTheme } from 'next-themes';
 * 
 * export function ThemeToggle() {
 *   const { theme, setTheme } = useTheme();
 *   
 *   return (
 *     <button
 *       onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
 *       className="p-2 rounded-lg bg-secondary"
 *     >
 *       {theme === 'dark' ? '🌙' : '☀️'}
 *     </button>
 *   );
 * }
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 9. ACCESSIBILITÉ
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Le thème respecte les standards d'accessibilité:
 * - Contraste minimum 4.5:1 pour le texte normal
 * - Contraste minimum 3:1 pour le texte large
 * - Support de prefers-reduced-motion
 * - Focus visible sur tous les éléments interactifs
 * 
 * Vérifiez les contrastes sur: https://webaim.org/resources/contrastchecker/
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 10. MODIFICATION DU THÈME
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pour changer la couleur principale:
 * 1. Modifiez --orange-500 dans globals.css
 * 2. Mettez à jour les dérivées (--orange-600 pour hover, etc.)
 * 3. Mettez à jour theme.ts
 * 4. Testez en mode clair ET sombre
 * 
 * Pour un thème complètement différent:
 * 1. Remplacez toutes les variables --orange-* par votre nouvelle couleur
 * 2. Mettez à jour les chart-* pour les graphiques
 * 3. Adaptez les couleurs de fond (--background, --card, etc.)
 */

export {};
