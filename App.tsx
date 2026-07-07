import React, { useState, useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { SQLiteProvider } from 'expo-sqlite';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as SecureStore from 'expo-secure-store';

import { initializeDatabase } from './src/database/schema';
import { ThemeProvider, useTheme } from './src/components/ThemeContext';
import { DatabaseProvider } from './src/hooks/useDatabase';

// Screens
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { RecipesScreen } from './src/screens/RecipesScreen';
import { ShoppingScreen } from './src/screens/ShoppingScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

// Icons
import { LayoutGrid, ChefHat, ShoppingCart, Settings } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';

const Tab = createBottomTabNavigator();

function MainAppNavigator() {
  const { colors, theme } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: 'bold',
        },
      })}
    >
      <Tab.Screen
        name="Pantry"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => <LayoutGrid size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Recipes"
        component={RecipesScreen}
        options={{
          tabBarIcon: ({ color, size }) => <ChefHat size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Shopping"
        component={ShoppingScreen}
        options={{
          tabBarIcon: ({ color, size }) => <ShoppingCart size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

function AppContent() {
  const { colors, theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const completed = await SecureStore.getItemAsync('ration_tracker_onboarding_completed');
        if (completed === 'true') {
          setOnboarded(true);
        }
      } catch (error) {
        console.error('Failed to check onboarding progress', error);
      } finally {
        setLoading(false);
      }
    };
    checkOnboarding();
  }, []);

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      {onboarded ? (
        <NavigationContainer>
          <MainAppNavigator />
        </NavigationContainer>
      ) : (
        <OnboardingScreen onComplete={() => setOnboarded(true)} />
      )}
    </View>
  );
}

export default function App() {
  return (
    <SQLiteProvider databaseName="ration_tracker.db" onInit={initializeDatabase}>
      <ThemeProvider>
        <DatabaseProvider>
          <AppContent />
        </DatabaseProvider>
      </ThemeProvider>
    </SQLiteProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
