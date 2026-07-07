import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Share,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../components/ThemeContext';
import { useDatabase } from '../hooks/useDatabase';
import { useSQLiteContext } from 'expo-sqlite';
import { calculateRestockingAlert } from '../utils/recommendations';
import { PantryItem } from '../database/schema';
import * as SecureStore from 'expo-secure-store';
import { Plus, Trash2, Share2, Clipboard, ShoppingCart, Check, RefreshCw, X } from 'lucide-react-native';

interface CustomShoppingItem {
  id: string;
  name: string;
  amount?: number;
  unit?: string;
  checked: boolean;
  pantryItemId?: number; // Linked pantry item
}

const STORAGE_KEY = 'ration_tracker_custom_shopping_list';

export const ShoppingScreen: React.FC = () => {
  const { colors } = useTheme();
  const db = useSQLiteContext();
  const { pantryItems, logInventoryChange } = useDatabase();

  const [shoppingList, setShoppingList] = useState<CustomShoppingItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [inputAmount, setInputAmount] = useState('');
  const [inputUnit, setInputUnit] = useState('g');

  const [lowStockSuggestions, setLowStockSuggestions] = useState<{ item: PantryItem; needed: number }[]>([]);

  // Load custom items
  useEffect(() => {
    const loadList = async () => {
      try {
        const saved = await SecureStore.getItemAsync(STORAGE_KEY);
        if (saved) {
          setShoppingList(JSON.parse(saved));
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadList();
  }, []);

  // Save list whenever it changes
  const saveList = async (list: CustomShoppingItem[]) => {
    try {
      setShoppingList(list);
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error(e);
    }
  };

  // Compute low stock items dynamically
  useEffect(() => {
    const checkSuggestions = async () => {
      const suggestions: typeof lowStockSuggestions = [];
      for (const item of pantryItems) {
        const alert = await calculateRestockingAlert(db, item.id, item.current_amount, item.capacity);
        // Suggest if warning or critical
        if (alert.status === 'warning' || alert.status === 'critical') {
          const needed = Math.max(0, item.capacity - item.current_amount);
          if (needed > 0) {
            suggestions.push({ item, needed });
          }
        }
      }
      setLowStockSuggestions(suggestions);
    };

    checkSuggestions();
  }, [pantryItems, db]);

  const handleAddManualItem = () => {
    if (!inputText.trim()) return;

    const amountNum = parseFloat(inputAmount);
    const newItem: CustomShoppingItem = {
      id: Date.now().toString(),
      name: inputText.trim(),
      amount: isNaN(amountNum) ? undefined : amountNum,
      unit: inputText.trim() && !isNaN(amountNum) ? inputUnit : undefined,
      checked: false,
    };

    const updated = [...shoppingList, newItem];
    saveList(updated);
    setInputText('');
    setInputAmount('');
  };

  const handleAddSuggestion = (suggestion: { item: PantryItem; needed: number }) => {
    // Check if already in the list
    if (shoppingList.some(i => i.pantryItemId === suggestion.item.id)) {
      Alert.alert('Already added', `"${suggestion.item.name}" is already in your shopping list.`);
      return;
    }

    const newItem: CustomShoppingItem = {
      id: `pantry-${suggestion.item.id}`,
      name: suggestion.item.name,
      amount: suggestion.needed,
      unit: suggestion.item.unit,
      checked: false,
      pantryItemId: suggestion.item.id,
    };

    saveList([...shoppingList, newItem]);
  };

  const handleAddAllSuggestions = () => {
    const newList = [...shoppingList];
    let addedCount = 0;
    
    lowStockSuggestions.forEach((s) => {
      if (!newList.some(i => i.pantryItemId === s.item.id)) {
        newList.push({
          id: `pantry-${s.item.id}`,
          name: s.item.name,
          amount: s.needed,
          unit: s.item.unit,
          checked: false,
          pantryItemId: s.item.id,
        });
        addedCount++;
      }
    });

    if (addedCount > 0) {
      saveList(newList);
    } else {
      Alert.alert('Info', 'All low stock suggestions are already in your list.');
    }
  };

  const handleToggleCheck = (id: string) => {
    const updated = shoppingList.map(item => 
      item.id === id ? { ...item, checked: !item.checked } : item
    );
    saveList(updated);
  };

  const handleDeleteItem = (id: string) => {
    const updated = shoppingList.filter(item => item.id !== id);
    saveList(updated);
  };

  const handleClearCompleted = () => {
    const updated = shoppingList.filter(item => !item.checked);
    saveList(updated);
  };

  const handleShareList = async () => {
    if (shoppingList.length === 0) {
      Alert.alert('Empty List', 'Add some items to your shopping list first.');
      return;
    }

    const listText = shoppingList
      .map((item) => {
        const checkMark = item.checked ? '[x]' : '[ ]';
        const qtyText = item.amount ? ` - ${item.amount} ${item.unit || ''}` : '';
        return `${checkMark} ${item.name}${qtyText}`;
      })
      .join('\n');

    const message = `🛒 *RationTracker Shopping List*:\n\n${listText}`;

    try {
      await Share.share({ message });
    } catch (e) {
      console.error(e);
    }
  };

  // Restock checked items back to their containers
  const handlePurchaseAndRefill = () => {
    const linkedBoughtItems = shoppingList.filter(i => i.checked && i.pantryItemId !== undefined);

    if (linkedBoughtItems.length === 0) {
      Alert.alert('Notice', 'No checked pantry items found. Cross out linked pantry items to auto-refill them.');
      return;
    }

    Alert.alert(
      'Restock Bought Items',
      `This will automatically refill the stock for the checked items in your pantry. Proceed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Refill Pantry',
          onPress: async () => {
            try {
              for (const bought of linkedBoughtItems) {
                if (bought.pantryItemId !== undefined && bought.amount !== undefined) {
                  await logInventoryChange(bought.pantryItemId, bought.amount);
                }
              }
              // Clear the bought items from shopping list
              const remaining = shoppingList.filter(i => !(i.checked && i.pantryItemId !== undefined));
              saveList(remaining);
              Alert.alert('Pantry Refilled!', 'Your pantry levels have been updated.');
            } catch (e) {
              Alert.alert('Error', 'Failed to refill some items.');
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Shopping List</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            Manage grocery purchases & auto-refills
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Low Stock Suggestions */}
        {lowStockSuggestions.length > 0 && (
          <View style={[styles.suggestionsBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.suggestionsHeader}>
              <Text style={[styles.suggestionsTitle, { color: colors.text }]}>Smart Restock Suggestions</Text>
              <TouchableOpacity onPress={handleAddAllSuggestions}>
                <Text style={[styles.addAllText, { color: colors.primary }]}>Add All</Text>
              </TouchableOpacity>
            </View>

            {lowStockSuggestions.map(({ item, needed }) => (
              <View key={item.id} style={[styles.suggestionRow, { borderBottomColor: colors.border }]}>
                <View>
                  <Text style={[styles.suggestionName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.suggestionDesc, { color: colors.textSecondary }]}>
                    Needs ~{Math.round(needed)} {item.unit} to refill
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.addButtonSmall, { backgroundColor: colors.primary }]}
                  onPress={() => handleAddSuggestion({ item, needed })}
                >
                  <Plus size={16} color="#FFF" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Input Bar */}
        <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            style={[styles.textInput, { color: colors.text, borderColor: colors.border }]}
            placeholder="Add grocery item (e.g. Eggs, Potatoes)"
            placeholderTextColor={colors.textSecondary}
            value={inputText}
            onChangeText={setInputText}
          />
          <View style={styles.amountRow}>
            <TextInput
              style={[styles.amountInput, { color: colors.text, borderColor: colors.border }]}
              placeholder="Qty"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              value={inputAmount}
              onChangeText={setInputAmount}
            />
            <View style={styles.segmentedControl}>
              {(['g', 'ml', 'pcs'] as const).map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[
                    styles.segmentButton,
                    inputUnit === u && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => setInputUnit(u)}
                >
                  <Text style={[styles.segmentText, inputUnit === u && styles.activeSegmentText]}>
                    {u}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={handleAddManualItem}
            >
              <Plus size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Shopping List Items */}
        <View style={[styles.listWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.listHeader}>
            <Text style={[styles.listTitle, { color: colors.text }]}>Shopping List Items ({shoppingList.length})</Text>
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity style={styles.actionIconButton} onPress={handleShareList}>
                <Share2 size={20} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionIconButton} onPress={handleClearCompleted}>
                <Trash2 size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {shoppingList.length === 0 ? (
            <View style={styles.emptyList}>
              <ShoppingCart size={40} color={colors.textSecondary} style={{ opacity: 0.4, marginBottom: 10 }} />
              <Text style={[styles.emptyListText, { color: colors.textSecondary }]}>Your shopping list is empty.</Text>
            </View>
          ) : (
            <View>
              {shoppingList.map((item) => (
                <View key={item.id} style={[styles.listItemRow, { borderBottomColor: colors.border }]}>
                  <TouchableOpacity
                    style={styles.checkboxContainer}
                    onPress={() => handleToggleCheck(item.id)}
                  >
                    <View style={[styles.checkbox, { borderColor: colors.border }, item.checked && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                      {item.checked && <Check size={12} color="#FFF" />}
                    </View>
                    <Text style={[styles.listItemName, { color: colors.text }, item.checked && styles.checkedText]}>
                      {item.name}
                      {item.amount && ` (${item.amount} ${item.unit || ''})`}
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity onPress={() => handleDeleteItem(item.id)}>
                    <Trash2 size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}

              {shoppingList.some(i => i.checked && i.pantryItemId !== undefined) && (
                <TouchableOpacity
                  style={[styles.refillButton, { backgroundColor: colors.success }]}
                  onPress={handlePurchaseAndRefill}
                >
                  <RefreshCw size={16} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.refillButtonText}>Mark Bought & Refill Containers</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
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
  suggestionsBox: {
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
  suggestionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  suggestionsTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  addAllText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  suggestionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  suggestionName: {
    fontSize: 14,
    fontWeight: '600',
  },
  suggestionDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  addButtonSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputContainer: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    marginBottom: 10,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  amountInput: {
    width: 60,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    fontSize: 14,
    marginRight: 10,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    padding: 2,
    marginRight: 10,
  },
  segmentButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  segmentText: {
    fontSize: 12,
    color: '#4A5568',
    fontWeight: '600',
  },
  activeSegmentText: {
    color: '#FFF',
  },
  addButton: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listWrapper: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 40,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  actionIconButton: {
    padding: 6,
    marginLeft: 10,
  },
  emptyList: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
  },
  emptyListText: {
    fontSize: 14,
  },
  listItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 0.9,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  listItemName: {
    fontSize: 15,
    fontWeight: '500',
  },
  checkedText: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
  refillButton: {
    flexDirection: 'row',
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
  },
  refillButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
