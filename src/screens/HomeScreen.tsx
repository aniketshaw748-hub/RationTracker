import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../components/ThemeContext';
import { useDatabase } from '../hooks/useDatabase';
import { useSQLiteContext } from 'expo-sqlite';
import { ContainerVisualizer } from '../components/ContainerVisualizer';
import { calculateAllAlerts, AlertResult } from '../utils/recommendations';
import { PantryItem } from '../database/schema';
import { ThemeColors } from '../theme/colors';
import { Plus, Minus, X, PlusCircle, AlertCircle, CheckCircle, Package, Trash2 } from 'lucide-react-native';

// Clean, minimal Item Card. Kept at module scope so cards don't remount every
// time HomeScreen re-renders.
const ItemCard = ({
  item,
  alert,
  colors,
  onPress,
}: {
  item: PantryItem;
  alert: AlertResult | undefined;
  colors: ThemeColors;
  onPress: () => void;
}) => {
  const getAlertColor = () => {
    if (!alert) return colors.textSecondary;
    if (alert.status === 'critical') return colors.error;
    if (alert.status === 'warning') return colors.warning;
    return colors.success;
  };

  const getAlertLabel = () => {
    if (!alert) return 'Calculating...';
    if (alert.mode === 'dynamic') {
      const days = Math.round(alert.daysRemaining || 0);
      return days === 0 ? 'Empty today' : `${days} days left`;
    }
    return `${Math.round(alert.fillPercentage)}% fill`;
  };

  return (
    <TouchableOpacity
      style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: getAlertColor() + '15' }]}>
          <Text style={[styles.statusText, { color: getAlertColor() }]}>
            {getAlertLabel()}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <ContainerVisualizer
          shape={item.shape}
          color={item.color}
          fillPercentage={(item.current_amount / item.capacity) * 100}
          size={90}
        />
      </View>

      <View style={styles.cardFooter}>
        <Text style={[styles.amountText, { color: colors.text }]}>
          {item.current_amount} / {item.capacity} {item.unit}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export const HomeScreen: React.FC = () => {
  const { colors, isDark } = useTheme();
  const db = useSQLiteContext();
  const { pantryItems, addPantryItem, updatePantryItem, deletePantryItem, logInventoryChange } = useDatabase();

  // Restock alerts for all items, computed in one pass and shared by the
  // dashboard badges and every card.
  const [alerts, setAlerts] = useState<Record<number, AlertResult>>({});

  // Modals
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PantryItem | null>(null);

  // Form State for Add New Item
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState<'g' | 'ml' | 'count'>('g');
  const [newShape, setNewShape] = useState<'jar' | 'bottle' | 'bag'>('jar');
  const [newCapacity, setNewCapacity] = useState('');
  const [newCurrentAmount, setNewCurrentAmount] = useState('');
  const [newColor, setNewColor] = useState('#FF6B6B');

  // Form State for Details (Adjustments)
  const [adjustAmount, setAdjustAmount] = useState('');
  const [itemLogs, setItemLogs] = useState<any[]>([]);

  const colorsList = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#4A90E2', '#9B59B6', '#808000', '#F5DEB3'];

  // Load restock alerts for all items
  useEffect(() => {
    let isMounted = true;
    calculateAllAlerts(db, pantryItems).then((map) => {
      if (isMounted) setAlerts(map);
    });
    return () => {
      isMounted = false;
    };
  }, [pantryItems, db]);

  const criticalCount = pantryItems.filter((i) => alerts[i.id]?.status === 'critical').length;
  const warningCount = pantryItems.filter((i) => alerts[i.id]?.status === 'warning').length;

  // Load logs for the selected item when it changes
  useEffect(() => {
    if (selectedItem) {
      const loadItemLogs = async () => {
        try {
          const logs = await db.getAllAsync(
            'SELECT * FROM inventory_log WHERE pantry_item_id = ? ORDER BY timestamp DESC LIMIT 5;',
            [selectedItem.id]
          );
          setItemLogs(logs);
        } catch (e) {
          console.error(e);
        }
      };
      loadItemLogs();
    }
  }, [selectedItem, db, pantryItems]);

  const handleAddItem = async () => {
    if (!newName.trim()) {
      Alert.alert('Error', 'Please enter a name.');
      return;
    }
    const cap = parseFloat(newCapacity);
    const curr = parseFloat(newCurrentAmount);
    if (isNaN(cap) || cap <= 0) {
      Alert.alert('Error', 'Please enter a valid capacity.');
      return;
    }
    if (isNaN(curr) || curr < 0 || curr > cap) {
      Alert.alert('Error', 'Please enter a valid starting amount between 0 and capacity.');
      return;
    }

    try {
      await addPantryItem({
        name: newName.trim(),
        unit: newUnit,
        capacity: cap,
        current_amount: curr,
        shape: newShape,
        color: newColor,
      });
      setAddModalVisible(false);
      resetAddForm();
    } catch (e) {
      Alert.alert('Error', 'An item with that name already exists.');
    }
  };

  const resetAddForm = () => {
    setNewName('');
    setNewUnit('g');
    setNewShape('jar');
    setNewCapacity('');
    setNewCurrentAmount('');
    setNewColor('#FF6B6B');
  };

  const handleAdjustInventory = async (isRestock: boolean) => {
    if (!selectedItem) return;
    const amount = parseFloat(adjustAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount.');
      return;
    }

    const signedAmount = isRestock ? amount : -amount;
    
    // Check if deduction exceeds stock
    if (!isRestock && selectedItem.current_amount + signedAmount < 0) {
      Alert.alert('Error', 'Deduction exceeds current stock!');
      return;
    }

    // Check if restock exceeds capacity
    if (isRestock && selectedItem.current_amount + signedAmount > selectedItem.capacity) {
      Alert.alert('Warning', 'This restock will exceed container capacity. It will top up to maximum.');
    }

    try {
      await logInventoryChange(selectedItem.id, signedAmount);
      const updated = pantryItems.find(i => i.id === selectedItem.id);
      if (updated) {
        setSelectedItem({
          ...updated,
          current_amount: Math.max(0, Math.min(updated.capacity, updated.current_amount + signedAmount))
        });
      }
      setAdjustAmount('');
    } catch (e) {
      Alert.alert('Error', 'Failed to adjust stock.');
    }
  };

  const handleDeleteItem = (id: number) => {
    Alert.alert(
      'Delete Container',
      'Are you sure you want to delete this container and all its history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deletePantryItem(id);
            setDetailModalVisible(false);
            setSelectedItem(null);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>My Pantry</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            Visual inventory status & levels
          </Text>
        </View>
        
        {/* Minimal inline badges instead of a bulky colorful banner */}
        <View style={styles.inlineBadgesRow}>
          {criticalCount > 0 && (
            <View style={[styles.inlineBadge, { backgroundColor: colors.error + '20' }]}>
              <Text style={[styles.inlineBadgeText, { color: colors.error }]}>{criticalCount} critical</Text>
            </View>
          )}
          {warningCount > 0 && (
            <View style={[styles.inlineBadge, { backgroundColor: colors.warning + '20' }]}>
              <Text style={[styles.inlineBadgeText, { color: colors.warning }]}>{warningCount} low</Text>
            </View>
          )}
          <View style={[styles.inlineBadge, { backgroundColor: colors.primary + '10' }]}>
            <Text style={[styles.inlineBadgeText, { color: colors.primary }]}>{pantryItems.length} total</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={pantryItems}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        contentContainerStyle={styles.listContainer}
        columnWrapperStyle={styles.listRow}
        renderItem={({ item }) => (
          <ItemCard
            item={item}
            alert={alerts[item.id]}
            colors={colors}
            onPress={() => {
              setSelectedItem(item);
              setDetailModalVisible(true);
            }}
          />
        )}
        ListFooterComponent={
          <TouchableOpacity
            style={[styles.addItemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => setAddModalVisible(true)}
          >
            <PlusCircle size={36} color={colors.primary} />
            <Text style={[styles.addItemCardText, { color: colors.primary }]}>Add Container</Text>
          </TouchableOpacity>
        }
      />

      {/* ADD ITEM MODAL */}
      <Modal
        visible={addModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior="padding"
            style={[styles.modalContent, { backgroundColor: colors.surface }]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Add New Container</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalForm}>
              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Name</Text>
                <TextInput
                  style={[styles.modalInput, { color: colors.text, borderColor: colors.border }]}
                  placeholder="e.g. Flour, Oats, Salt"
                  placeholderTextColor={colors.textSecondary}
                  value={newName}
                  onChangeText={setNewName}
                />
              </View>

              <View style={styles.row}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Unit</Text>
                <View style={styles.segmentedControl}>
                  {(['g', 'ml', 'count'] as const).map((u) => (
                    <TouchableOpacity
                      key={u}
                      style={[
                        styles.segmentButton,
                        newUnit === u && { backgroundColor: colors.primary },
                      ]}
                      onPress={() => setNewUnit(u)}
                    >
                      <Text style={[styles.segmentText, newUnit === u && styles.activeSegmentText]}>
                        {u}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.row}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Container Shape</Text>
                <View style={styles.segmentedControl}>
                  {(['jar', 'bottle', 'bag'] as const).map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[
                        styles.segmentButton,
                        newShape === s && { backgroundColor: colors.primary },
                      ]}
                      onPress={() => setNewShape(s)}
                    >
                      <Text style={[styles.segmentText, newShape === s && styles.activeSegmentText]}>
                        {s}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.rowInputs}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.smallInputLabel, { color: colors.textSecondary }]}>Capacity</Text>
                  <TextInput
                    style={[styles.modalInput, { color: colors.text, borderColor: colors.border }]}
                    keyboardType="numeric"
                    placeholder="2000"
                    placeholderTextColor={colors.textSecondary}
                    value={newCapacity}
                    onChangeText={setNewCapacity}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={[styles.smallInputLabel, { color: colors.textSecondary }]}>Starting Level</Text>
                  <TextInput
                    style={[styles.modalInput, { color: colors.text, borderColor: colors.border }]}
                    keyboardType="numeric"
                    placeholder="1500"
                    placeholderTextColor={colors.textSecondary}
                    value={newCurrentAmount}
                    onChangeText={setNewCurrentAmount}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Color</Text>
                <View style={styles.colorPicker}>
                  {colorsList.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.colorBubble,
                        { backgroundColor: c },
                        newColor === c && { borderWidth: 3, borderColor: colors.text },
                      ]}
                      onPress={() => setNewColor(c)}
                    />
                  ))}
                </View>
              </View>

              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: colors.primary }]}
                onPress={handleAddItem}
              >
                <Text style={styles.submitButtonText}>Create Container</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={detailModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior="padding"
            style={[styles.modalContent, { backgroundColor: colors.surface }]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{selectedItem?.name}</Text>
              <TouchableOpacity
                onPress={() => {
                  setDetailModalVisible(false);
                  setSelectedItem(null);
                }}
              >
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalForm}>
              {selectedItem && (
                <View style={styles.detailContainer}>
                  <ContainerVisualizer
                    shape={selectedItem.shape}
                    color={selectedItem.color}
                    fillPercentage={(selectedItem.current_amount / selectedItem.capacity) * 100}
                    size={110}
                  />

                  <Text style={[styles.amountLabel, { color: colors.text }]}>
                    {selectedItem.current_amount} / {selectedItem.capacity} {selectedItem.unit}
                  </Text>
                  
                  <View style={[styles.formGroup, { width: '100%', marginTop: 15 }]}>
                    <Text style={[styles.inputLabel, { color: colors.text }]}>Log Restock or Consumption</Text>
                    <TextInput
                      style={[styles.modalInput, { color: colors.text, borderColor: colors.border }]}
                      placeholder={`Amount in ${selectedItem.unit}`}
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="numeric"
                      value={adjustAmount}
                      onChangeText={setAdjustAmount}
                    />

                    <View style={styles.adjustButtonsRow}>
                      <TouchableOpacity
                        style={[styles.adjustButton, { backgroundColor: colors.error }]}
                        onPress={() => handleAdjustInventory(false)}
                      >
                        <Minus size={20} color="#FFF" style={{ marginRight: 4 }} />
                        <Text style={styles.adjustButtonText}>Consume</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.adjustButton, { backgroundColor: colors.success }]}
                        onPress={() => handleAdjustInventory(true)}
                      >
                        <Plus size={20} color="#FFF" style={{ marginRight: 4 }} />
                        <Text style={styles.adjustButtonText}>Restock</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={[styles.historyContainer, { borderColor: colors.border }]}>
                    <Text style={[styles.historyTitle, { color: colors.text }]}>Recent History</Text>
                    {itemLogs.length === 0 ? (
                      <Text style={[styles.noLogsText, { color: colors.textSecondary }]}>No adjustments logged yet.</Text>
                    ) : (
                      itemLogs.map((log) => (
                        <View key={log.id} style={[styles.logRow, { borderBottomColor: colors.border }]}>
                          <Text style={[styles.logAmount, { color: log.amount > 0 ? colors.success : colors.error }]}>
                            {log.amount > 0 ? `+${log.amount}` : log.amount} {selectedItem.unit}
                          </Text>
                          <Text style={[styles.logTime, { color: colors.textSecondary }]}>
                            {new Date(log.timestamp * 1000).toLocaleDateString()}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>

                  <TouchableOpacity
                    style={[styles.deleteButton, { borderColor: colors.error }]}
                    onPress={() => handleDeleteItem(selectedItem.id)}
                  >
                    <Trash2 size={18} color={colors.error} />
                    <Text style={[styles.deleteButtonText, { color: colors.error }]}>Delete Container</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  inlineBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inlineBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginLeft: 6,
  },
  inlineBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  listContainer: {
    padding: 12,
  },
  listRow: {
    justifyContent: 'space-between',
  },
  itemCard: {
    flex: 0.485,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeader: {
    width: '100%',
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    width: '100%',
  },
  statusBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginTop: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  cardBody: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
  },
  cardFooter: {
    width: '100%',
    alignItems: 'center',
    marginTop: 6,
  },
  amountText: {
    fontSize: 12,
    fontWeight: 'bold',
    opacity: 0.8,
  },
  addItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 20,
    marginTop: 10,
    marginBottom: 40,
  },
  addItemCardText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 15,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalForm: {
    paddingBottom: 40,
  },
  formGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  smallInputLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  modalInput: {
    height: 50,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 10,
  },
  rowInputs: {
    flexDirection: 'row',
    marginBottom: 16,
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
    marginTop: 8,
  },
  colorBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  submitButton: {
    height: 54,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  detailContainer: {
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 10,
  },
  adjustButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  adjustButton: {
    flex: 0.48,
    flexDirection: 'row',
    height: 50,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  historyContainer: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 20,
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  noLogsText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
  },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  logAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
  logTime: {
    fontSize: 12,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    width: '100%',
    height: 50,
    marginTop: 24,
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});
