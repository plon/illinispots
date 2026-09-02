import React from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type Theme } from "@/contexts/ThemeContext";

const THEME_OPTIONS: Array<{
  value: Theme;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
];

export const ThemeToggle: React.FC = () => {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <div className="px-3 py-2 space-y-1.5">
      <div className="text-sm font-medium text-foreground flex items-center gap-2">
        {resolvedTheme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
        <span>Appearance</span>
      </div>
      <div className="grid grid-cols-3 gap-1 bg-muted p-1 rounded-md text-xs">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
          const isActive = theme === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={`flex items-center justify-center gap-1.5 py-1 px-2 rounded-sm transition-all ${
                isActive
                  ? "bg-background text-foreground shadow-2xs font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label={`Set ${label.toLowerCase()} theme`}
              aria-pressed={isActive}
            >
              <Icon size={13} />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
