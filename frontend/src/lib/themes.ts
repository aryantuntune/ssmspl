export interface ThemeColors {
  sidebar: string;
  sidebarForeground: string;
  sidebarHover: string;
  sidebarActive: string;
  sidebarActiveForeground: string;
  sidebarBorder: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
}

export interface ThemeDefinition {
  name: string;
  label: string;
  light: ThemeColors;
  dark: ThemeColors;
}

export const DEFAULT_THEMES: ThemeDefinition[] = [
  {
    name: "ocean",
    label: "Ocean",
    light: {
      sidebar: "220 65% 9%",
      sidebarForeground: "210 40% 80%",
      sidebarHover: "217 33% 17%",
      sidebarActive: "213 94% 52%",
      sidebarActiveForeground: "0 0% 100%",
      sidebarBorder: "217 33% 17%",
      background: "210 40% 98%",
      foreground: "222 47% 11%",
      card: "0 0% 100%",
      cardForeground: "222 47% 11%",
      primary: "221 83% 53%",
      primaryForeground: "0 0% 100%",
      secondary: "210 40% 96%",
      secondaryForeground: "222 47% 11%",
      muted: "210 40% 96%",
      mutedForeground: "215 16% 47%",
      accent: "210 40% 96%",
      accentForeground: "222 47% 11%",
      destructive: "0 84% 60%",
      destructiveForeground: "0 0% 100%",
      border: "214 32% 91%",
      input: "214 32% 91%",
      ring: "221 83% 53%",
    },
    dark: {
      sidebar: "222 47% 6%",
      sidebarForeground: "210 40% 80%",
      sidebarHover: "217 33% 12%",
      sidebarActive: "213 94% 52%",
      sidebarActiveForeground: "0 0% 100%",
      sidebarBorder: "217 33% 17%",
      background: "222 47% 8%",
      foreground: "210 40% 98%",
      card: "222 47% 11%",
      cardForeground: "210 40% 98%",
      primary: "217 91% 60%",
      primaryForeground: "0 0% 100%",
      secondary: "217 33% 17%",
      secondaryForeground: "210 40% 98%",
      muted: "217 33% 17%",
      mutedForeground: "215 20% 65%",
      accent: "217 33% 17%",
      accentForeground: "210 40% 98%",
      destructive: "0 63% 31%",
      destructiveForeground: "0 0% 100%",
      border: "217 33% 17%",
      input: "217 33% 17%",
      ring: "224 76% 48%",
    },
  },
  {
    name: "indigo",
    label: "Indigo",
    light: {
      sidebar: "263 70% 11%",
      sidebarForeground: "226 64% 80%",
      sidebarHover: "260 43% 18%",
      sidebarActive: "239 84% 67%",
      sidebarActiveForeground: "0 0% 100%",
      sidebarBorder: "260 43% 18%",
      background: "240 20% 98%",
      foreground: "263 70% 11%",
      card: "0 0% 100%",
      cardForeground: "263 70% 11%",
      primary: "239 84% 67%",
      primaryForeground: "0 0% 100%",
      secondary: "240 5% 96%",
      secondaryForeground: "263 70% 11%",
      muted: "240 5% 96%",
      mutedForeground: "240 4% 46%",
      accent: "240 5% 96%",
      accentForeground: "263 70% 11%",
      destructive: "0 84% 60%",
      destructiveForeground: "0 0% 100%",
      border: "240 6% 90%",
      input: "240 6% 90%",
      ring: "239 84% 67%",
    },
    dark: {
      sidebar: "263 70% 6%",
      sidebarForeground: "226 64% 80%",
      sidebarHover: "260 43% 12%",
      sidebarActive: "239 84% 67%",
      sidebarActiveForeground: "0 0% 100%",
      sidebarBorder: "260 43% 18%",
      background: "263 50% 8%",
      foreground: "240 20% 98%",
      card: "263 50% 11%",
      cardForeground: "240 20% 98%",
      primary: "239 84% 67%",
      primaryForeground: "0 0% 100%",
      secondary: "260 43% 18%",
      secondaryForeground: "240 20% 98%",
      muted: "260 43% 18%",
      mutedForeground: "240 5% 65%",
      accent: "260 43% 18%",
      accentForeground: "240 20% 98%",
      destructive: "0 63% 31%",
      destructiveForeground: "0 0% 100%",
      border: "260 43% 18%",
      input: "260 43% 18%",
      ring: "239 84% 67%",
    },
  },
  {
    name: "emerald",
    label: "Emerald",
    light: {
      sidebar: "166 72% 6%",
      sidebarForeground: "163 33% 75%",
      sidebarHover: "164 50% 12%",
      sidebarActive: "160 84% 39%",
      sidebarActiveForeground: "0 0% 100%",
      sidebarBorder: "164 50% 12%",
      background: "160 20% 98%",
      foreground: "166 72% 6%",
      card: "0 0% 100%",
      cardForeground: "166 72% 6%",
      primary: "160 84% 39%",
      primaryForeground: "0 0% 100%",
      secondary: "160 10% 96%",
      secondaryForeground: "166 72% 6%",
      muted: "160 10% 96%",
      mutedForeground: "163 10% 46%",
      accent: "160 10% 96%",
      accentForeground: "166 72% 6%",
      destructive: "0 84% 60%",
      destructiveForeground: "0 0% 100%",
      border: "160 10% 90%",
      input: "160 10% 90%",
      ring: "160 84% 39%",
    },
    dark: {
      sidebar: "166 72% 4%",
      sidebarForeground: "163 33% 75%",
      sidebarHover: "164 50% 10%",
      sidebarActive: "160 84% 39%",
      sidebarActiveForeground: "0 0% 100%",
      sidebarBorder: "164 50% 12%",
      background: "166 50% 6%",
      foreground: "160 20% 98%",
      card: "166 50% 9%",
      cardForeground: "160 20% 98%",
      primary: "160 84% 39%",
      primaryForeground: "0 0% 100%",
      secondary: "164 50% 12%",
      secondaryForeground: "160 20% 98%",
      muted: "164 50% 12%",
      mutedForeground: "163 10% 65%",
      accent: "164 50% 12%",
      accentForeground: "160 20% 98%",
      destructive: "0 63% 31%",
      destructiveForeground: "0 0% 100%",
      border: "164 50% 12%",
      input: "164 50% 12%",
      ring: "160 84% 39%",
    },
  },
  {
    name: "slate",
    label: "Slate",
    light: {
      sidebar: "215 25% 14%",
      sidebarForeground: "215 20% 75%",
      sidebarHover: "215 19% 20%",
      sidebarActive: "215 16% 47%",
      sidebarActiveForeground: "0 0% 100%",
      sidebarBorder: "215 19% 20%",
      background: "210 20% 98%",
      foreground: "215 25% 14%",
      card: "0 0% 100%",
      cardForeground: "215 25% 14%",
      primary: "215 16% 47%",
      primaryForeground: "0 0% 100%",
      secondary: "210 20% 96%",
      secondaryForeground: "215 25% 14%",
      muted: "210 20% 96%",
      mutedForeground: "215 16% 47%",
      accent: "210 20% 96%",
      accentForeground: "215 25% 14%",
      destructive: "0 84% 60%",
      destructiveForeground: "0 0% 100%",
      border: "214 20% 90%",
      input: "214 20% 90%",
      ring: "215 16% 47%",
    },
    dark: {
      sidebar: "215 25% 8%",
      sidebarForeground: "215 20% 75%",
      sidebarHover: "215 19% 14%",
      sidebarActive: "215 20% 65%",
      sidebarActiveForeground: "0 0% 100%",
      sidebarBorder: "215 19% 20%",
      background: "215 25% 9%",
      foreground: "210 20% 98%",
      card: "215 25% 12%",
      cardForeground: "210 20% 98%",
      primary: "215 20% 65%",
      primaryForeground: "0 0% 100%",
      secondary: "215 19% 20%",
      secondaryForeground: "210 20% 98%",
      muted: "215 19% 20%",
      mutedForeground: "215 20% 65%",
      accent: "215 19% 20%",
      accentForeground: "210 20% 98%",
      destructive: "0 63% 31%",
      destructiveForeground: "0 0% 100%",
      border: "215 19% 20%",
      input: "215 19% 20%",
      ring: "215 20% 65%",
    },
  },
];

export function getThemeByName(name: string): ThemeDefinition | undefined {
  return DEFAULT_THEMES.find((t) => t.name === name);
}

export function applyTheme(theme: ThemeDefinition, mode: "light" | "dark") {
  const colors = mode === "dark" ? theme.dark : theme.light;
  const root = document.documentElement;

  root.style.setProperty("--sidebar", colors.sidebar);
  root.style.setProperty("--sidebar-foreground", colors.sidebarForeground);
  root.style.setProperty("--sidebar-hover", colors.sidebarHover);
  root.style.setProperty("--sidebar-active", colors.sidebarActive);
  root.style.setProperty("--sidebar-active-foreground", colors.sidebarActiveForeground);
  root.style.setProperty("--sidebar-border", colors.sidebarBorder);

  root.style.setProperty("--background", colors.background);
  root.style.setProperty("--foreground", colors.foreground);
  root.style.setProperty("--card", colors.card);
  root.style.setProperty("--card-foreground", colors.cardForeground);
  root.style.setProperty("--primary", colors.primary);
  root.style.setProperty("--primary-foreground", colors.primaryForeground);
  root.style.setProperty("--secondary", colors.secondary);
  root.style.setProperty("--secondary-foreground", colors.secondaryForeground);
  root.style.setProperty("--muted", colors.muted);
  root.style.setProperty("--muted-foreground", colors.mutedForeground);
  root.style.setProperty("--accent", colors.accent);
  root.style.setProperty("--accent-foreground", colors.accentForeground);
  root.style.setProperty("--destructive", colors.destructive);
  root.style.setProperty("--destructive-foreground", colors.destructiveForeground);
  root.style.setProperty("--border", colors.border);
  root.style.setProperty("--input", colors.input);
  root.style.setProperty("--ring", colors.ring);

  if (mode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}
