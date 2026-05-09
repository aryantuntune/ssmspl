/**
 * SSMSPL Admin Console — design tokens.
 *
 * One source of truth for colors, spacing, radii, and text styles.
 * All components/screens import from here. No inline hex values
 * outside of this file (with rare exceptions for severity-driven
 * overlays computed at runtime).
 *
 * Palette philosophy
 * ------------------
 *  - Background: deep charcoal-blue (calm, neutral, easy at night).
 *  - Surfaces: layered slate, each one step lighter than the one below
 *    so depth is felt without borders everywhere.
 *  - Severity is *the* loudest thing on screen. Nothing else uses
 *    pure red/amber/green so when those colors appear, they mean
 *    something.
 *  - Primary action color (action.primary) is a single calm cyan —
 *    used sparingly so destructive/severity colors keep their voice.
 */

export const colors = {
  // Base canvas
  bg: '#0a0f1a',          // app background (almost-black blue)
  bgElev: '#111827',      // section/card background
  bgElev2: '#1a2332',     // hover / nested card / input background
  bgElev3: '#243042',     // pressed / active

  // Borders / hairlines
  border: '#1f2937',
  borderStrong: '#334155',
  borderFocus: '#3b82f6',

  // Text
  text: '#f1f5f9',         // primary
  textMuted: '#94a3b8',    // secondary
  textDim: '#64748b',      // tertiary / metadata
  textFaint: '#475569',    // disabled / hint

  // Severity (status meaning)
  ok: '#10b981',
  okBg: '#052e1f',
  okText: '#6ee7b7',

  info: '#3b82f6',
  infoBg: '#0c1f3d',
  infoText: '#93c5fd',

  warn: '#f59e0b',
  warnBg: '#3a2407',
  warnText: '#fbbf24',

  crit: '#ef4444',
  critBg: '#3a0d0d',
  critText: '#fca5a5',

  // Single primary action accent — used for "go" buttons.
  action: {
    primary: '#0891b2',          // cyan-600
    primaryPressed: '#0e7490',
    primaryText: '#ecfeff',
    primaryBorder: '#0e7490',

    danger: '#7f1d1d',
    dangerText: '#fecaca',
    dangerBorder: '#991b1b',

    warn: '#78350f',
    warnText: '#fcd34d',
    warnBorder: '#92400e',

    ghost: '#0f172a',
    ghostText: '#cbd5e1',
    ghostBorder: '#334155',
  },

  // Production vs Admin server tinting (subtle, used for chips/pills)
  serverProd: '#a855f7',         // purple
  serverProdBg: '#1f0a3d',
  serverAdmin: '#06b6d4',        // cyan
  serverAdminBg: '#062a3a',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const radii = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

export const text = {
  // Page-level title (e.g. "System Health")
  h1: { fontSize: 24, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.2 },
  // Card / tile heading
  h2: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  // Section divider above a group of cards
  section: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: colors.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  // Body text
  body: { fontSize: 14, fontWeight: '500' as const, color: colors.text },
  bodyMuted: { fontSize: 13, fontWeight: '400' as const, color: colors.textMuted },
  // Metadata / labels in rows
  label: { fontSize: 13, fontWeight: '400' as const, color: colors.textMuted },
  value: { fontSize: 13, fontWeight: '600' as const, color: colors.text },
  // Tiny dim text
  meta: { fontSize: 11, fontWeight: '400' as const, color: colors.textDim },
  // Monospace (logs, tags, sha)
  mono: { fontSize: 12, fontFamily: 'monospace' as const, color: colors.text },
} as const;

/**
 * Map a severity string to a coherent set of colors.
 * Centralised so AlertRow, StatusBadge, HealthTile, ContainerCard
 * stay in lock-step.
 */
export type Severity = 'OK' | 'INFO' | 'WARN' | 'CRIT';

export function severityPalette(sev: Severity | undefined | null) {
  switch (sev) {
    case 'CRIT':
      return { fg: colors.critText, bg: colors.critBg, accent: colors.crit, dot: colors.crit };
    case 'WARN':
      return { fg: colors.warnText, bg: colors.warnBg, accent: colors.warn, dot: colors.warn };
    case 'INFO':
      return { fg: colors.infoText, bg: colors.infoBg, accent: colors.info, dot: colors.info };
    case 'OK':
    default:
      return { fg: colors.okText, bg: colors.okBg, accent: colors.ok, dot: colors.ok };
  }
}

export const theme = { colors, spacing, radii, text, severityPalette };
export default theme;
