'use client';

/**
 * Wrapper anti-capture pour les discussions Pro.
 * Applique des styles CSS pour limiter la copie/sélection du contenu.
 *
 * Compatible : Chrome, Firefox, Safari, Edge, iOS Safari, Chrome Android
 *
 * Limitations (web) :
 * - Ne bloque PAS les captures d'écran natives (PrintScreen, etc.)
 * - Empêche la sélection et copie de texte, le drag des images
 */
export function ScreenshotBlocker({
    children,
    enabled,
    className = '',
}: {
    children: React.ReactNode;
    enabled: boolean;
    className?: string;
}) {
    if (!enabled) {
        return <>{children}</>;
    }

    return (
        <div
            className={`kephale-anti-screenshot ${className}`}
            style={{
                // Préfixes vendor pour compatibilité multi-navigateurs
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
                userSelect: 'none',
                // iOS : empêche le menu contextuel au touch long
                WebkitTouchCallout: 'none',
                // Empêche le drag des images (cascade aux enfants)
                WebkitUserDrag: 'none',
                userDrag: 'none',
            } as React.CSSProperties}
        >
            {children}
        </div>
    );
}
