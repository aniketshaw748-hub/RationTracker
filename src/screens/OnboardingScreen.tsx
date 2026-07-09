import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../components/ThemeContext';
import { useDatabase } from '../hooks/useDatabase';
import { saveApiKey } from '../utils/gemini';
import { ContainerVisualizer } from '../components/ContainerVisualizer';
import { Sparkles, ArrowRight, Check, Key, Clipboard, ShoppingBag } from 'lucide-react-native';
import { setPreference } from '../utils/storage';

const { width } = Dimensions.get('window');

interface OnboardingScreenProps {
  onComplete: () => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const { colors, isDark } = useTheme();
  const { addPantryItem } = useDatabase();
  const [step, setStep] = useState(0);
  
  // Custom item state
  const [itemName, setItemName] = useState('');
  const [itemUnit, setItemUnit] = useState<'g' | 'ml' | 'count'>('g');
  const [itemShape, setItemShape] = useState<'jar' | 'bag' | 'bottle'>('jar');
  const [itemCapacity, setItemCapacity] = useState('1000');
  const [itemCurrentAmount, setItemCurrentAmount] = useState('800');
  const [itemColor, setItemColor] = useState('#FF6B6B');

  // API Key state
  const [apiKey, setApiKey] = useState('');

  const colorsList = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#4A90E2', '#9B59B6', '#808000', '#F5DEB3'];

  const handleCreateInitialItem = async () => {
    if (!itemName.trim()) {
      Alert.alert('Required', 'Please enter a container/item name.');
      return;
    }
    const cap = parseFloat(itemCapacity);
    const curr = parseFloat(itemCurrentAmount);

    if (isNaN(cap) || cap <= 0) {
      Alert.alert('Invalid capacity', 'Capacity must be a positive number.');
      return;
    }
    if (isNaN(curr) || curr < 0 || curr > cap) {
      Alert.alert('Invalid amount', 'Current amount must be between 0 and the max capacity.');
      return;
    }

    try {
      await addPantryItem({
        name: itemName.trim(),
        unit: itemUnit,
        capacity: cap,
        current_amount: curr,
        shape: itemShape,
        color: itemColor,
      });
      setItemName('');
      setStep(2); // Move to API Key step
    } catch (e) {
      Alert.alert('Error', 'An item with that name already exists!');
    }
  };

  const handleSaveApiKey = async () => {
    if (apiKey.trim()) {
      await saveApiKey(apiKey.trim());
    }
    handleFinish();
  };

  const handleFinish = async () => {
    try {
      await setPreference('ration_tracker_onboarding_completed', 'true');
      onComplete();
    } catch (error) {
      console.error(error);
      onComplete();
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {step === 0 && (
          <View style={styles.stepContainer}>
            <View style={[styles.iconContainer, { backgroundColor: colors.primary + '20' }]}>
              <ShoppingBag size={50} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Welcome to RationTracker</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Your playful, smart pantry tracking assistant. Keep your containers visual, auto-deduct ingredients, and shop smart!
            </Text>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={() => setStep(1)}
            >
              <Text style={styles.buttonText}>Let's Get Started</Text>
              <ArrowRight size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={[styles.title, { color: colors.text }]}>Add Your First Container</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Set up your first kitchen supply. Choose a shape and size to see it in action!
            </Text>

            <View style={styles.previewContainer}>
              <ContainerVisualizer
                shape={itemShape}
                color={itemColor}
                fillPercentage={(parseFloat(itemCurrentAmount) / parseFloat(itemCapacity)) * 100 || 0}
                size={110}
              />
            </View>

            <View style={[styles.form, { backgroundColor: colors.surface }]}>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                placeholder="Item Name (e.g., Coffee, Oats)"
                placeholderTextColor={colors.textSecondary}
                value={itemName}
                onChangeText={setItemName}
              />

              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text }]}>Unit:</Text>
                <View style={styles.segmentedControl}>
                  {(['g', 'ml', 'count'] as const).map((u) => (
                    <TouchableOpacity
                      key={u}
                      style={[
                        styles.segmentButton,
                        itemUnit === u && { backgroundColor: colors.primary },
                      ]}
                      onPress={() => setItemUnit(u)}
                    >
                      <Text style={[styles.segmentText, itemUnit === u && styles.activeSegmentText]}>
                        {u}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.text }]}>Shape:</Text>
                <View style={styles.segmentedControl}>
                  {(['jar', 'bottle', 'bag'] as const).map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[
                        styles.segmentButton,
                        itemShape === s && { backgroundColor: colors.primary },
                      ]}
                      onPress={() => setItemShape(s)}
                    >
                      <Text style={[styles.segmentText, itemShape === s && styles.activeSegmentText]}>
                        {s}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.rowInputs}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.smallLabel, { color: colors.textSecondary }]}>Capacity ({itemUnit}):</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                    keyboardType="numeric"
                    value={itemCapacity}
                    onChangeText={setItemCapacity}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={[styles.smallLabel, { color: colors.textSecondary }]}>Starting Level ({itemUnit}):</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                    keyboardType="numeric"
                    value={itemCurrentAmount}
                    onChangeText={setItemCurrentAmount}
                  />
                </View>
              </View>

              <View style={styles.colorPicker}>
                {colorsList.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorBubble,
                      { backgroundColor: c },
                      itemColor === c && { borderWidth: 3, borderColor: colors.text },
                    ]}
                    onPress={() => setItemColor(c)}
                  />
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary, marginTop: 15 }]}
              onPress={handleCreateInitialItem}
            >
              <Text style={styles.buttonText}>Create & Continue</Text>
              <ArrowRight size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContainer}>
            <View style={[styles.iconContainer, { backgroundColor: colors.secondary + '20' }]}>
              <Key size={50} color={colors.secondary} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Add Gemini API Key (Optional)</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              To unlock the smart recipe builder chatbot powered by Gemini 2.5 Flash, enter your API key below. You can skip this and configure it later in Settings.
            </Text>

            <View style={[styles.form, { backgroundColor: colors.surface, width: '100%' }]}>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, fontFamily: 'monospace' }]}
                placeholder="AIzaSy..."
                placeholderTextColor={colors.textSecondary}
                secureTextEntry
                value={apiKey}
                onChangeText={setApiKey}
              />
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: colors.border }]}
                onPress={handleFinish}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Skip</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.secondary, flex: 1, marginLeft: 10 }]}
                onPress={handleSaveApiKey}
              >
                <Text style={styles.buttonText}>Save Key</Text>
                <Check size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  stepContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
  },
  previewContainer: {
    marginVertical: 20,
    height: 140,
    justifyContent: 'center',
  },
  form: {
    width: '100%',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  rowInputs: {
    flexDirection: 'row',
    marginVertical: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  smallLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    padding: 2,
  },
  segmentButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  segmentText: {
    fontSize: 14,
    color: '#4A5568',
    fontWeight: '600',
  },
  activeSegmentText: {
    color: '#FFF',
  },
  colorPicker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  colorBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  button: {
    flexDirection: 'row',
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 20,
  },
  secondaryButton: {
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    marginRight: 10,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
