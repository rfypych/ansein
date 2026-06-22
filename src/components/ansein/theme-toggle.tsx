"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "@phosphor-icons/react";

export function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-14 h-7 opacity-0" />;
  }

  const currentTheme = theme === "system" ? systemTheme : theme;

  return (
    <button
      onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
      className="relative flex items-center w-14 h-7 rounded-full border border-border/50 bg-card hover:border-primary/50 transition-colors group outline-none cursor-pointer overflow-hidden shadow-sm"
      aria-label="Toggle theme"
    >
      {/* Background track icons */}
      <div className="absolute inset-0 flex items-center justify-between px-1.5 z-0">
        <Sun className="w-3.5 h-3.5 text-foreground/20" weight="bold" />
        <Moon className="w-3.5 h-3.5 text-foreground/20" weight="bold" />
      </div>

      {/* Thumb */}
      <div 
        className={`absolute left-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] z-10 shadow-md ${
          currentTheme === "dark" ? "translate-x-7" : "translate-x-0"
        }`}
      >
        <Sun 
          className={`absolute w-3 h-3 text-primary-foreground transition-all duration-500 ${
            currentTheme === "dark" ? "opacity-0 -rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"
          }`} 
          weight="fill" 
        />
        <Moon 
          className={`absolute w-3 h-3 text-primary-foreground transition-all duration-500 ${
            currentTheme === "dark" ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-90 scale-50"
          }`} 
          weight="fill" 
        />
      </div>
    </button>
  );
}
