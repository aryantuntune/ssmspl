export const colors = {
  primary: '#006994',
  primaryDark: '#004A6B',
  primaryLight: '#00A8E8',
  accent: '#00D4FF',

  success: '#4CAF50',
  successLight: '#E8F5E9',
  warning: '#FF9800',
  warningLight: '#FFF3E0',
  error: '#F44336',
  errorLight: '#FFEBEE',
  info: '#2196F3',
  infoLight: '#E3F2FD',

  background: '#F5F5F5',
  surface: '#FFFFFF',
  border: '#E0E0E0',

  text: '#212121',
  textSecondary: '#757575',
  textLight: '#BDBDBD',
  textOnPrimary: '#FFFFFF',

  divider: '#EEEEEE',
};

export type DynamicColorOverrides = {
  primary?: string;
  primaryDark?: string;
  primaryLight?: string;
  accent?: string;
};

export function mergeColors(overrides?: DynamicColorOverrides | null) {
  if (!overrides) return colors;
  return { ...colors, ...overrides };
}
