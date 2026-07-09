import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme, ThemeColors } from '../theme/colors';
import { getPreference, setPreference } from '../utils/storage';

type ThemeType = 'light' | 'dark';

export interface AccentColorPreset {
  name: string;
  hex: string;
}

export const accentColorsList: AccentColorPreset[] = [
  { name: 'Coral Red', hex: '#FF6B6B' },
  { name: 'Mint Teal', hex: '#0D9488' }, // Darker Teal for better contrast
  { name: 'Emerald', hex: '#10B981' },
  { name: 'Royal Blue', hex: '#3B82F6' },
  { name: 'Amber Orange', hex: '#F59E0B' },
  { name: 'Violet Purple', hex: '#8B5CF6' },
  { name: 'Hot Rose', hex: '#EC4899' },
];

interface ThemeContextProps {
  theme: ThemeType;
  colors: ThemeColors;
  toggleTheme: () => void;
  isDark: boolean;
  accentColor: string;
  setAccentColor: (hex: string) => Promise<void>;
  accentColorsList: AccentColorPreset[];
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

const THEME_STORAGE_KEY = 'ration_tracker_theme';
const ACCENT_STORAGE_KEY = 'ration_tracker_accent_color';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [theme, setTheme] = useState<ThemeType>('light');
  const [accentColor, setAccentColorState] = useState<string>('#FF6B6B'); // Default Coral

  useEffect(() => {
    // Load persisted theme preference and accent color
    const loadPreferences = async () => {
      try {
        const savedTheme = await getPreference(THEME_STORAGE_KEY);
        if (savedTheme === 'light' || savedTheme === 'dark') {
          setTheme(savedTheme);
        } else {
          setTheme(systemColorScheme === 'dark' ? 'dark' : 'light');
        }

        const savedAccent = await getPreference(ACCENT_STORAGE_KEY);
        if (savedAccent && /^#[0-9A-F]{6}$/i.test(savedAccent)) {
          setAccentColorState(savedAccent);
        }
      } catch (e) {
        console.error('Failed to load user preferences', e);
        setTheme(systemColorScheme === 'dark' ? 'dark' : 'light');
      }
    };
    loadPreferences();
  }, [systemColorScheme]);

  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    try {
      await setPreference(THEME_STORAGE_KEY, newTheme);
    } catch (e) {
      console.error('Failed to save theme preference', e);
    }
  };

  const setAccentColor = async (hex: string) => {
    setAccentColorState(hex);
    try {
      await setPreference(ACCENT_STORAGE_KEY, hex);
    } catch (e) {
      console.error('Failed to save accent color', e);
    }
  };

  const baseColors = theme === 'dark' ? darkTheme : lightTheme;
  const colors: ThemeColors = {
    ...baseColors,
    primary: accentColor, // Override default primary color dynamically
  };
  
  const isDark = theme === 'dark';

  return (
    <ThemeContext.Provider 
      value={{ 
        theme, 
        colors, 
        toggleTheme, 
        isDark, 
        accentColor, 
        setAccentColor, 
        accentColorsList 
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
