"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";

type ThemeValue = "light" | "dark" | "system";

export function ThemeSelector() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm uppercase text-muted-foreground font-bold">
            Apparence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 animate-pulse bg-muted rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const themes: { value: ThemeValue; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "Clair", icon: <Sun className="h-4 w-4" /> },
    { value: "dark", label: "Sombre", icon: <Moon className="h-4 w-4" /> },
    { value: "system", label: "Système", icon: <Monitor className="h-4 w-4" /> },
  ];

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm uppercase text-muted-foreground font-bold">
          Apparence
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Choisissez le thème de l&apos;application (noir et blanc)
        </p>
        <div className="flex gap-2 flex-wrap">
          {themes.map((t) => (
            <Button
              key={t.value}
              variant={theme === t.value ? "default" : "outline"}
              size="sm"
              className="flex-1 min-w-[100px] border-border"
              onClick={() => setTheme(t.value)}
            >
              {t.icon}
              <span className="ml-2">{t.label}</span>
            </Button>
          ))}
        </div>
        {theme === "system" && (
          <p className="text-xs text-muted-foreground mt-2">
            Thème actuel : {resolvedTheme === "dark" ? "Sombre" : "Clair"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
