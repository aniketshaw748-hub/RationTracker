export const lightTheme = {
  primary: '#FF6B6B',      // Vibrant Coral
  secondary: '#4ECDC4',    // Mint Teal
  background: '#F7F9FC',   // Light Cool Grey
  surface: '#FFFFFF',      // Pure White
  card: '#FFFFFF',
  text: '#1A202C',         // Dark Slate
  textSecondary: '#718096',// Medium Grey
  border: '#E2E8F0',       // Light Grey Border
  success: '#48BB78',      // Soft Green
  warning: '#ECC94B',      // Soft Yellow
  error: '#F56565',        // Soft Red
  accent: '#ED64A6',       // Playful Pink
  iconBackground: '#F0F4F8',
};

export const darkTheme = {
  primary: '#FF8E8E',      // Lighter Coral for Contrast
  secondary: '#62E2D9',    // Lighter Teal
  background: '#0F172A',   // Slate 900
  surface: '#1E293B',      // Slate 800
  card: '#1E293B',
  text: '#F8FAFC',         // White/Grey
  textSecondary: '#94A3B8',// Slate 400
  border: '#334155',       // Slate 700 Border
  success: '#4ADE80',      // Vibrant Green
  warning: '#FBBF24',      // Vibrant Yellow
  error: '#F87171',        // Vibrant Red
  accent: '#F472B6',       // Vibrant Pink
  iconBackground: '#1E293B',
};

export type ThemeColors = typeof lightTheme;
