"use client";

import { Bell, Moon, Sun, Search } from "lucide-react";
import { User } from "@/types";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AppHeaderProps {
  user: User;
}

export default function AppHeader({ user: _user }: AppHeaderProps) {
  const { mode, toggleMode } = useTheme();

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="pl-9 w-64 h-9 bg-muted/50"
          />
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleMode}>
          {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 relative">
          <Bell className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
