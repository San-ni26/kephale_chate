'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/src/lib/utils';
import { Button } from '@/src/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/src/components/ui/dropdown-menu';

/**
 * Composant de sélection du thème (clair/sombre/système)
 * Utilise next-themes pour la gestion du thème
 */
export function ThemeToggle() {
    const { theme, setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    // Évite l'hydration mismatch
    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return (
            <Button variant="ghost" size="icon" className="w-9 h-9 opacity-50">
                <Sun className="h-4 w-4" />
            </Button>
        );
    }

    const currentIcon = resolvedTheme === 'dark' ? Moon : Sun;
    const Icon = currentIcon;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                        'w-9 h-9 relative',
                        'hover:bg-accent hover:text-accent-foreground',
                        'focus-visible:ring-2 focus-visible:ring-primary'
                    )}
                >
                    <Icon className="h-4 w-4 transition-all" />
                    <span className="sr-only">Changer le thème</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
                <DropdownMenuItem
                    onClick={() => setTheme('light')}
                    className={cn(
                        'flex items-center gap-2 cursor-pointer',
                        theme === 'light' && 'bg-accent text-accent-foreground'
                    )}
                >
                    <Sun className="h-4 w-4 text-primary" />
                    <span>Clair</span>
                    {theme === 'light' && (
                        <span className="ml-auto text-xs text-primary">●</span>
                    )}
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => setTheme('dark')}
                    className={cn(
                        'flex items-center gap-2 cursor-pointer',
                        theme === 'dark' && 'bg-accent text-accent-foreground'
                    )}
                >
                    <Moon className="h-4 w-4 text-primary" />
                    <span>Sombre</span>
                    {theme === 'dark' && (
                        <span className="ml-auto text-xs text-primary">●</span>
                    )}
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => setTheme('system')}
                    className={cn(
                        'flex items-center gap-2 cursor-pointer',
                        theme === 'system' && 'bg-accent text-accent-foreground'
                    )}
                >
                    <Monitor className="h-4 w-4 text-primary" />
                    <span>Système</span>
                    {theme === 'system' && (
                        <span className="ml-auto text-xs text-primary">●</span>
                    )}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
