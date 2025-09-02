// src/theme.js
export const theme = {
  colors: {
    bg: '#F7F8FA',
    background: '#F7F8FA',
    card: '#FFFFFF',
    text: '#111827',
    sub: '#6B7280',
    muted: '#6B7280',
    border: '#E5E7EB',
    primary: '#16A34A', // Nextdoor-ish green
    chip: '#EFF6FF',
  },
  radius: 14,
  pad: 14,
  spacing: (n) => n * 8,
};

export const navTheme = {
  dark: false,
  colors: {
    primary: theme.colors.primary,
    background: theme.colors.background,
    card: theme.colors.card,
    text: theme.colors.text,
    border: theme.colors.border,
    notification: theme.colors.primary,
  },
};

