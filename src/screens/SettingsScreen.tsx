import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../components/ThemeContext';
import { getApiKey, saveApiKey, deleteApiKey } from '../utils/gemini';
import { Key, Moon, Sun, Trash2, Eye, EyeOff, Save, Palette } from 'lucide-react-native';

export const SettingsScreen: React.FC = () => {
  const { theme, colors, toggleTheme, isDark, accentColor, setAccentColor, accentColorsList } = useTheme();
  
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    const loadKey = async () => {
      const key = await getApiKey();
      if (key) {
        setApiKey(key);
        setHasKey(true);
      } else {
        setApiKey('');
        setHasKey(false);
      }
    };
    loadKey();
  }, []);

  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      Alert.alert('Error', 'Please enter a valid key.');
      return;
    }

    try {
      await saveApiKey(apiKey.trim());
      setHasKey(true);
      Alert.alert('Success', 'Gemini API Key updated successfully.');
    } catch (e) {
      Alert.alert('Error', 'Failed to save the key.');
    }
  };

  const handleDeleteKey = () => {
    Alert.alert(
      'Delete API Key',
      'Are you sure you want to remove the Gemini API Key? This will disable recipe chatbot functions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteApiKey();
              setApiKey('');
              setHasKey(false);
              Alert.alert('Deleted', 'Gemini API Key has been removed.');
            } catch (e) {
              Alert.alert('Error', 'Failed to delete the key.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          Configure preferences & credentials
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Theme Settings */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>App Settings</Text>
          
          <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
            <View style={styles.settingLabelRow}>
              {isDark ? <Moon size={20} color={colors.primary} /> : <Sun size={20} color={colors.primary} />}
              <Text style={[styles.settingLabel, { color: colors.text }]}>Dark Mode</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: '#CBD5E1', true: colors.primary }}
              thumbColor={isDark ? '#FFF' : '#FFF'}
            />
          </View>

          {/* Dynamic Color Theme Customizer */}
          <View style={styles.colorCustomizerRow}>
            <View style={[styles.settingLabelRow, { marginBottom: 12 }]}>
              <Palette size={20} color={colors.primary} />
              <Text style={[styles.settingLabel, { color: colors.text }]}>UI Theme Color</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accentRow}>
              {accentColorsList.map((col) => (
                <TouchableOpacity
                  key={col.hex}
                  style={[
                    styles.accentBubble,
                    { backgroundColor: col.hex },
                    accentColor === col.hex && { borderWidth: 3, borderColor: colors.text },
                  ]}
                  onPress={() => setAccentColor(col.hex)}
                />
              ))}
            </ScrollView>
          </View>
        </View>

        {/* Gemini API Settings */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Gemini AI Integration</Text>
            <View style={[styles.statusBadge, { backgroundColor: hasKey ? colors.success + '20' : colors.warning + '20' }]}>
              <Text style={[styles.statusText, { color: hasKey ? colors.success : colors.warning }]}>
                {hasKey ? 'Configured' : 'Missing Key'}
              </Text>
            </View>
          </View>

          <Text style={[styles.descText, { color: colors.textSecondary }]}>
            An API Key is required to call Gemini 2.5 Flash for the conversational recipe helper. Your key is stored securely on this device.
          </Text>

          <View style={styles.inputWrapper}>
            <TextInput
              style={[styles.apiKeyInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Paste your Gemini API Key here"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry={!showKey}
              value={apiKey}
              onChangeText={setApiKey}
            />
            <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowKey(!showKey)}>
              {showKey ? <EyeOff size={18} color={colors.textSecondary} /> : <Eye size={18} color={colors.textSecondary} />}
            </TouchableOpacity>
          </View>

          <View style={styles.apiKeyButtons}>
            {hasKey && (
              <TouchableOpacity
                style={[styles.deleteButton, { borderColor: colors.error }]}
                onPress={handleDeleteKey}
              >
                <Trash2 size={16} color={colors.error} />
                <Text style={[styles.deleteButtonText, { color: colors.error }]}>Remove</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: colors.primary, flex: 1 }]}
              onPress={handleSaveKey}
            >
              <Save size={16} color="#FFF" style={{ marginRight: 6 }} />
              <Text style={styles.saveButtonText}>Save Key</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* App Information */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>About</Text>
          <View style={[styles.aboutRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.aboutLabel, { color: colors.textSecondary }]}>App Name</Text>
            <Text style={[styles.aboutValue, { color: colors.text }]}>RationTracker</Text>
          </View>
          <View style={[styles.aboutRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.aboutLabel, { color: colors.textSecondary }]}>Version</Text>
            <Text style={[styles.aboutValue, { color: colors.text }]}>1.0.0 (Expo SDK 54)</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={[styles.aboutLabel, { color: colors.textSecondary }]}>Database Engine</Text>
            <Text style={[styles.aboutValue, { color: colors.text }]}>SQLite (Local WAL Mode)</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  statusBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  descText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 10,
  },
  colorCustomizerRow: {
    paddingVertical: 12,
  },
  accentRow: {
    paddingVertical: 6,
  },
  accentBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 1,
  },
  inputWrapper: {
    position: 'relative',
    justifyContent: 'center',
    marginBottom: 12,
  },
  apiKeyInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingLeft: 12,
    paddingRight: 40,
    fontSize: 14,
    fontFamily: 'monospace',
  },
  eyeIcon: {
    position: 'absolute',
    right: 12,
  },
  apiKeyButtons: {
    flexDirection: 'row',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    height: 44,
    paddingHorizontal: 16,
    marginRight: 10,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    height: 44,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  aboutLabel: {
    fontSize: 14,
  },
  aboutValue: {
    fontSize: 14,
    fontWeight: '600',
  },
});
