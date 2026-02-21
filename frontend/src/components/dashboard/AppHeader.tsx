"use client";

import { Bell, Menu, Moon, Sun, Search } from "lucide-react";
import { User } from "@/types";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AppHeaderProps {
  user: User;
  onMobileMenuToggle: () => void;
}

export default function AppHeader({ onMobileMenuToggle }: AppHeaderProps) {
  const { mode, toggleMode } = useTheme();

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 lg:hidden"
          onClick={onMobileMenuToggle}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex items-center gap-2 lg:gap-3">
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="pl-9 w-48 lg:w-64 h-9 bg-muted/50"
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
