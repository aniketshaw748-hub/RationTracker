import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// Non-sensitive preferences (theme, onboarding flag, shopping list) live in
// AsyncStorage. Earlier versions kept them in SecureStore, which is slower
// and has a ~2KB per-value limit on Android, so reads migrate any legacy
// value over once. Only the Gemini API key stays in SecureStore.

export async function getPreference(key: string): Promise<string | null> {
  const value = await AsyncStorage.getItem(key);
  if (value !== null) return value;

  const legacy = await SecureStore.getItemAsync(key).catch(() => null);
  if (legacy !== null) {
    await AsyncStorage.setItem(key, legacy);
    SecureStore.deleteItemAsync(key).catch(() => {});
  }
  return legacy;
}

export function setPreference(key: string, value: string): Promise<void> {
  return AsyncStorage.setItem(key, value);
}
