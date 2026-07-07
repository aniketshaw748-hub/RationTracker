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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../components/ThemeContext';
import { useDatabase } from '../hooks/useDatabase';
import { sendChatMessage, parseRecipeWithGemini, parseRecipeFromUrl, ParsedRecipe, getApiKey } from '../utils/gemini';
import { Recipe, RecipeIngredient, PantryItem, Meal } from '../database/schema';
import { MessageSquare, BookOpen, Send, Sparkles, Check, ChefHat, X, AlertTriangle, ChevronRight, Plus, Trash2, Link, Coffee, ListPlus } from 'lucide-react-native';

export const RecipesScreen: React.FC = () => {
  const { colors, isDark } = useTheme();
  const {
    recipes,
    pantryItems,
    meals,
    cookRecipe,
    addRecipe,
    deleteRecipe,
    resolveIngredientId,
    addPantryItem,
    addMeal,
    deleteMeal,
    cookMeal,
  } = useDatabase();

  const [activeTab, setActiveTab] = useState<'list' | 'meals' | 'chat'>('list');
  const [apiKeyExists, setApiKeyExists] = useState(false);

  // Chat State
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // Video URL Input State
  const [videoUrlInput, setVideoUrlInput] = useState('');

  // View Recipe Details State
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [cookTargetAmount, setCookTargetAmount] = useState('');

  // View Meal Details State
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [mealDetailModalVisible, setMealDetailModalVisible] = useState(false);
  
  // Track custom scaling amounts per recipe inside the selected meal modal
  // maps recipeId -> text string of amount to cook
  const [mealRecipeQuantities, setMealRecipeQuantities] = useState<{ [key: number]: string }>({});

  // Create Meal Template State
  const [createMealModalVisible, setCreateMealModalVisible] = useState(false);
  const [newMealName, setNewMealName] = useState('');
  const [newMealDesc, setNewMealDesc] = useState('');
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<number[]>([]);

  // Manual Recipe Creation State
  const [manualRecipeModalVisible, setManualRecipeModalVisible] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualServings, setManualServings] = useState('4');
  const [manualInstructions, setManualInstructions] = useState('');
  const [manualScalingType, setManualScalingType] = useState<'servings' | 'quantity' | 'volume'>('servings');
  const [manualBaseAmount, setManualBaseAmount] = useState('4');
  const [manualBaseUnit, setManualBaseUnit] = useState('servings');
  const [manualIngredients, setManualIngredients] = useState<{ pantryItemId: number; amount: string }[]>([]);

  // Recipe Parser/Confirmation State
  const [parseLoading, setParseLoading] = useState(false);
  const [parsedRecipe, setParsedRecipe] = useState<ParsedRecipe | null>(null);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  
  // Mapping state: maps ingredient index in parsedRecipe.ingredients to either a pantry item ID (number) or 'new'
  const [ingredientMappings, setIngredientMappings] = useState<{ [key: number]: number | 'new' }>({});
  
  // Temporary creation details for 'new' pantry items during recipe creation
  const [newPantryDetails, setNewPantryDetails] = useState<{
    [key: number]: { shape: 'jar' | 'bag' | 'bottle'; capacity: number; color: string };
  }>({});

  useEffect(() => {
    const checkKey = async () => {
      const key = await getApiKey();
      setApiKeyExists(!!key);
    };
    checkKey();
  }, [activeTab]);

  // Set default cooking amount when a recipe is opened
  useEffect(() => {
    if (selectedRecipe) {
      setCookTargetAmount((selectedRecipe.base_amount ?? 1).toString());
    } else {
      setCookTargetAmount('');
    }
  }, [selectedRecipe]);

  // Set default cooking amounts for all recipes in a meal when it is opened
  useEffect(() => {
    if (selectedMeal && selectedMeal.recipes) {
      const initialQtys: { [key: number]: string } = {};
      selectedMeal.recipes.forEach((rec) => {
        initialQtys[rec.id] = (rec.base_amount ?? 1).toString();
      });
      setMealRecipeQuantities(initialQtys);
    } else {
      setMealRecipeQuantities({});
    }
  }, [selectedMeal]);

  // Calculate multiplier dynamically based on user input
  const getRecipeMultiplier = (recipe: Recipe, targetAmountStr: string) => {
    const target = parseFloat(targetAmountStr);
    const base = recipe.base_amount ?? 1.0;
    if (isNaN(target) || target <= 0) return 0;
    return target / base;
  };

  // Check stock status dynamically based on target scaling input
  const getRecipeStockStatus = (recipe: Recipe, multiplier = 1.0) => {
    if (!recipe.ingredients || recipe.ingredients.length === 0) return { status: 'available', missing: [] };
    
    const missing: string[] = [];
    recipe.ingredients.forEach((ing) => {
      const matchingPantry = pantryItems.find((p) => p.id === ing.pantry_item_id);
      const required = ing.amount * multiplier;
      if (!matchingPantry || matchingPantry.current_amount < required) {
        missing.push(ing.pantry_item_name || 'Unknown item');
      }
    });

    if (missing.length === 0) return { status: 'available', missing };
    return { status: 'insufficient', missing };
  };

  // Check overall stock status for combined Meal Template, taking individual custom recipe scaling inputs into account
  const getMealStockStatus = (meal: Meal, quantitiesMap: { [key: number]: string }) => {
    if (!meal.recipes || meal.recipes.length === 0) return { status: 'available', missing: [] };

    const aggregated: { [key: number]: { needed: number; name: string } } = {};

    meal.recipes.forEach((rec) => {
      const targetQtyStr = quantitiesMap[rec.id] || (rec.base_amount ?? 1).toString();
      const targetQty = parseFloat(targetQtyStr);
      const base = rec.base_amount ?? 1.0;
      const mult = isNaN(targetQty) || targetQty <= 0 ? 0 : targetQty / base;

      rec.ingredients?.forEach((ing) => {
        const scaledAmt = ing.amount * mult;
        if (aggregated[ing.pantry_item_id]) {
          aggregated[ing.pantry_item_id].needed += scaledAmt;
        } else {
          aggregated[ing.pantry_item_id] = {
            needed: scaledAmt,
            name: ing.pantry_item_name || 'Unknown item',
          };
        }
      });
    });

    const missing: string[] = [];
    Object.entries(aggregated).forEach(([pantryIdStr, demand]) => {
      const pantryId = parseInt(pantryIdStr);
      const pantryItem = pantryItems.find((p) => p.id === pantryId);
      if (!pantryItem || pantryItem.current_amount < demand.needed) {
        missing.push(demand.name);
      }
    });

    if (missing.length === 0) return { status: 'available', missing };
    return { status: 'insufficient', missing };
  };

  const handleCook = async (recipe: Recipe) => {
    const mult = getRecipeMultiplier(recipe, cookTargetAmount);
    if (mult <= 0) {
      Alert.alert('Error', 'Please enter a valid amount to cook.');
      return;
    }

    Alert.alert(
      'Cook Meal',
      `Are you sure you want to cook ${cookTargetAmount} ${recipe.base_unit ?? 'servings'} of "${recipe.name}"? This automatically scales and deducts all ingredients.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Cook',
          onPress: async () => {
            const result = await cookRecipe(recipe.id, mult);
            if (result.success) {
              Alert.alert('Success!', `Enjoy your cooked ${recipe.name}! Pantry levels have been updated.`);
              setDetailModalVisible(false);
              setSelectedRecipe(null);
            } else {
              Alert.alert(
                'Missing Ingredients',
                `Insufficient stock for:\n\n${result.missing?.join('\n')}`
              );
            }
          },
        },
      ]
    );
  };

  const handleCookMeal = async (meal: Meal) => {
    // Convert text quantities map to numbers map
    const recipeQtys: { [key: number]: number } = {};
    let hasInvalid = false;
    
    meal.recipes?.forEach((r) => {
      const val = parseFloat(mealRecipeQuantities[r.id]);
      if (isNaN(val) || val <= 0) {
        hasInvalid = true;
      }
      recipeQtys[r.id] = val;
    });

    if (hasInvalid) {
      Alert.alert('Error', 'Please enter valid cooking amounts for all recipes in the meal.');
      return;
    }

    Alert.alert(
      'Cook Meal Template',
      `Cook all recipes inside "${meal.name}"? This runs atomic stock checks and deducts all ingredients combined.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Cook Meal',
          onPress: async () => {
            const result = await cookMeal(meal.id, recipeQtys);
            if (result.success) {
              Alert.alert('Success!', `"${meal.name}" cooked successfully! Pantry levels updated.`);
              setMealDetailModalVisible(false);
              setSelectedMeal(null);
            } else {
              Alert.alert(
                'Insufficient stock',
                `Not enough ingredients to cook this combined meal:\n\n${result.missing?.join('\n')}`
              );
            }
          },
        },
      ]
    );
  };

  const handleCreateMealTemplate = async () => {
    if (!newMealName.trim()) {
      Alert.alert('Required', 'Please enter a meal template name.');
      return;
    }
    if (selectedRecipeIds.length === 0) {
      Alert.alert('Required', 'Please select at least one recipe to include in this meal.');
      return;
    }

    try {
      await addMeal(newMealName.trim(), newMealDesc.trim(), selectedRecipeIds);
      Alert.alert('Meal Saved!', `"${newMealName}" template is created successfully.`);
      setCreateMealModalVisible(false);
      setNewMealName('');
      setNewMealDesc('');
      setSelectedRecipeIds([]);
    } catch (e: any) {
      Alert.alert('Error', 'A meal template with that name already exists.');
    }
  };

  const handleToggleRecipeSelection = (id: number) => {
    if (selectedRecipeIds.includes(id)) {
      setSelectedRecipeIds(selectedRecipeIds.filter((rid) => rid !== id));
    } else {
      setSelectedRecipeIds([...selectedRecipeIds, id]);
    }
  };

  const handleDeleteMeal = (id: number) => {
    Alert.alert(
      'Delete Meal Template',
      'Are you sure you want to delete this meal template?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteMeal(id);
            setMealDetailModalVisible(false);
            setSelectedMeal(null);
          },
        },
      ]
    );
  };

  const handleDeleteRecipe = (id: number) => {
    Alert.alert(
      'Delete Recipe',
      'Are you sure you want to delete this recipe?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteRecipe(id);
            setDetailModalVisible(false);
            setSelectedRecipe(null);
          },
        },
      ]
    );
  };

  // Manual Recipe Actions
  const handleAddManualIngredient = () => {
    const defaultItem = pantryItems[0]?.id || 0;
    setManualIngredients([...manualIngredients, { pantryItemId: defaultItem, amount: '' }]);
  };

  const handleRemoveManualIngredient = (index: number) => {
    setManualIngredients(manualIngredients.filter((_, idx) => idx !== index));
  };

  const handleUpdateManualIngredient = (index: number, field: 'pantryItemId' | 'amount', value: any) => {
    const updated = manualIngredients.map((item, idx) => {
      if (idx === index) {
        return { ...item, [field]: value };
      }
      return item;
    });
    setManualIngredients(updated);
  };

  // Trigger quick load templates to simplify cooking/process
  const handleLoadRecipeTemplate = async (templateType: 'curry' | 'roti' | 'coffee') => {
    let resolvedIngredients: { pantryItemId: number; amount: string }[] = [];
    let templateInstructions = '';
    let templateName = '';
    let scalingType: typeof manualScalingType = 'servings';
    let baseAmount = '4';
    let baseUnit = 'servings';

    const findItem = (names: string[]): PantryItem | undefined => {
      return pantryItems.find(p => names.some(n => p.name.toLowerCase().includes(n)));
    };

    if (templateType === 'curry') {
      templateName = 'Aloo Matar Curry';
      templateInstructions = "1. Heat oil in a pan, add spices.\n2. Add cubed potatoes and green peas.\n3. Cook with water on low heat until tender.";
      scalingType = 'volume';
      baseAmount = '100';
      baseUnit = 'ml';
      
      const oil = findItem(['oil', 'olive oil']);
      const potato = findItem(['potato', 'aloo']);
      const peas = findItem(['peas', 'matar']);
      const water = findItem(['water']);

      if (potato) resolvedIngredients.push({ pantryItemId: potato.id, amount: '60' });
      if (peas) resolvedIngredients.push({ pantryItemId: peas.id, amount: '30' });
      if (oil) resolvedIngredients.push({ pantryItemId: oil.id, amount: '4' });
      if (water) resolvedIngredients.push({ pantryItemId: water.id, amount: '30' });
    } else if (templateType === 'roti') {
      templateName = 'Roti';
      templateInstructions = "1. Knead flour/atta with water.\n2. Roll into thin discs.\n3. Bake on dry tawa on both sides.";
      scalingType = 'quantity';
      baseAmount = '1';
      baseUnit = 'rotis';
      
      const atta = findItem(['atta', 'flour']);
      const water = findItem(['water']);

      if (atta) resolvedIngredients.push({ pantryItemId: atta.id, amount: '35' });
      if (water) resolvedIngredients.push({ pantryItemId: water.id, amount: '20' });
    } else if (templateType === 'coffee') {
      templateName = 'Coffee/Tea';
      templateInstructions = "1. Boil water and milk.\n2. Stir in coffee/tea leaves and sugar.";
      scalingType = 'volume';
      baseAmount = '100';
      baseUnit = 'ml';
      
      const milk = findItem(['milk']);
      const sugar = findItem(['sugar']);
      const water = findItem(['water']);

      if (milk) resolvedIngredients.push({ pantryItemId: milk.id, amount: '60' });
      if (water) resolvedIngredients.push({ pantryItemId: water.id, amount: '40' });
      if (sugar) resolvedIngredients.push({ pantryItemId: sugar.id, amount: '5' });
    }

    setManualName(templateName);
    setManualInstructions(templateInstructions);
    setManualIngredients(resolvedIngredients);
    setManualScalingType(scalingType);
    setManualBaseAmount(baseAmount);
    setManualBaseUnit(baseUnit);
  };

  const handleSaveManualRecipe = async () => {
    if (!manualName.trim()) {
      Alert.alert('Required', 'Please enter a recipe name.');
      return;
    }

    const servingsVal = parseInt(manualServings);
    if (isNaN(servingsVal) || servingsVal <= 0) {
      Alert.alert('Invalid Servings', 'Servings must be a positive number.');
      return;
    }

    const baseAmtVal = parseFloat(manualBaseAmount);
    if (isNaN(baseAmtVal) || baseAmtVal <= 0) {
      Alert.alert('Invalid Base Amount', 'Base reference amount must be positive.');
      return;
    }

    if (manualIngredients.length === 0) {
      Alert.alert('Ingredients needed', 'Please add at least one ingredient to this recipe.');
      return;
    }

    const formattedIngredients: { pantry_item_id: number; amount: number }[] = [];
    for (let i = 0; i < manualIngredients.length; i++) {
      const ing = manualIngredients[i];
      const amt = parseFloat(ing.amount);
      if (isNaN(amt) || amt <= 0) {
        Alert.alert('Invalid Amount', `Please enter a valid amount for ingredient #${i + 1}.`);
        return;
      }
      formattedIngredients.push({
        pantry_item_id: ing.pantryItemId,
        amount: amt,
      });
    }

    try {
      await addRecipe(
        {
          name: manualName.trim(),
          servings: servingsVal,
          instructions: manualInstructions.trim(),
          scaling_type: manualScalingType,
          base_amount: baseAmtVal,
          base_unit: manualBaseUnit.trim() || 'servings',
        },
        formattedIngredients
      );

      Alert.alert('Recipe Saved!', `"${manualName}" has been added to your recipe book.`);
      setManualRecipeModalVisible(false);
      resetManualRecipeForm();
    } catch (e: any) {
      Alert.alert('Error Saving', 'Failed to save recipe. Make sure name is unique.');
    }
  };

  const resetManualRecipeForm = () => {
    setManualName('');
    setManualServings('4');
    setManualInstructions('');
    setManualScalingType('servings');
    setManualBaseAmount('4');
    setManualBaseUnit('servings');
    setManualIngredients([]);
  };

  // AI Chat and URL Parser Actions
  const handleSendChat = async (overrideMessage?: string) => {
    const textToSend = overrideMessage || chatInput;
    if (!textToSend.trim()) return;

    if (!overrideMessage) setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', text: textToSend }]);
    setChatLoading(true);

    try {
      const history = chatMessages.map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      }));

      const reply = await sendChatMessage(textToSend, history);
      setChatMessages((prev) => [...prev, { role: 'model', text: reply }]);
    } catch (e: any) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'model', text: `⚠️ Error: ${e.message || 'Failed to connect'}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleSuggestRecipe = () => {
    if (pantryItems.length === 0) {
      Alert.alert('Empty Pantry', 'Add some items to your pantry first.');
      return;
    }

    const itemsDesc = pantryItems
      .map((p) => `${p.name} (${p.current_amount}${p.unit} remaining, capacity ${p.capacity}${p.unit})`)
      .join(', ');

    const prompt = `Based on the following items I have in my pantry, suggest a recipe I can make:
${itemsDesc}

Please write down the recipe title, servings, required quantities matching my units, and cooking instructions.`;
    
    handleSendChat(prompt);
  };

  const handleParseRecipe = async (recipeText: string) => {
    if (!recipeText.trim()) return;
    setParseLoading(true);
    try {
      const parsed = await parseRecipeWithGemini(recipeText);
      await setupIngredientMappings(parsed);
    } catch (e: any) {
      Alert.alert('Parser Error', e.message || 'Failed to parse recipe automatically.');
    } finally {
      setParseLoading(false);
    }
  };

  const handleParseVideoUrl = async () => {
    if (!videoUrlInput.trim()) return;
    setParseLoading(true);
    try {
      const parsed = await parseRecipeFromUrl(videoUrlInput.trim());
      setVideoUrlInput('');
      await setupIngredientMappings(parsed);
    } catch (e: any) {
      Alert.alert('URL Parse Error', e.message || 'Failed to extract recipe from video link.');
    } finally {
      setParseLoading(false);
    }
  };

  const setupIngredientMappings = async (parsed: ParsedRecipe) => {
    setParsedRecipe(parsed);
    
    const initialMappings: { [key: number]: number | 'new' } = {};
    const initialDetails: typeof newPantryDetails = {};

    for (let i = 0; i < parsed.ingredients.length; i++) {
      const ing = parsed.ingredients[i];
      const resolvedId = await resolveIngredientId(ing.name);
      
      if (resolvedId !== null) {
        initialMappings[i] = resolvedId;
      } else {
        initialMappings[i] = 'new';
        initialDetails[i] = {
          shape: ing.unit === 'ml' ? 'bottle' : 'jar',
          capacity: ing.amount * 2 > 100 ? ing.amount * 2 : 500,
          color: '#FF6B6B',
        };
      }
    }

    setIngredientMappings(initialMappings);
    setNewPantryDetails(initialDetails);
    setConfirmModalVisible(true);
  };

  const handleSaveRecipe = async () => {
    if (!parsedRecipe) return;

    try {
      const resolvedIngredientIds: { [key: number]: number } = {};

      for (let i = 0; i < parsedRecipe.ingredients.length; i++) {
        const mapping = ingredientMappings[i];
        const ing = parsedRecipe.ingredients[i];

        if (mapping === 'new') {
          const details = newPantryDetails[i];
          const newId = await addPantryItem({
            name: ing.name,
            unit: ing.unit,
            capacity: details.capacity,
            current_amount: 0,
            shape: details.shape,
            color: details.color,
          });
          resolvedIngredientIds[i] = newId;
        } else {
          resolvedIngredientIds[i] = mapping;
        }
      }

      const recipeIngredients = parsedRecipe.ingredients.map((ing, idx) => ({
        pantry_item_id: resolvedIngredientIds[idx],
        amount: ing.amount,
      }));

      // Default AI recipe to servings scaling mode
      await addRecipe(
        {
          name: parsedRecipe.name,
          servings: parsedRecipe.servings,
          instructions: parsedRecipe.instructions,
          scaling_type: 'servings',
          base_amount: parsedRecipe.servings,
          base_unit: 'servings',
        },
        recipeIngredients
      );

      Alert.alert('Recipe Saved!', `"${parsedRecipe.name}" is now available in your recipe book.`);
      setConfirmModalVisible(false);
      setParsedRecipe(null);
      setActiveTab('list');
    } catch (e: any) {
      Alert.alert('Error Saving Recipe', e.message || 'Unknown error occurred.');
    }
  };

  const changeNewItemDetail = (idx: number, field: string, value: any) => {
    setNewPantryDetails((prev) => ({
      ...prev,
      [idx]: {
        ...prev[idx],
        [field]: value,
      },
    }));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      {/* Clean Tab Header using color system */}
      <View style={styles.tabHeader}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'list' && { borderBottomColor: colors.primary }]}
          onPress={() => setActiveTab('list')}
        >
          <BookOpen size={18} color={activeTab === 'list' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.tabButtonText, { color: activeTab === 'list' ? colors.primary : colors.textSecondary }]}>
            Recipes
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'meals' && { borderBottomColor: colors.secondary }]}
          onPress={() => setActiveTab('meals')}
        >
          <Coffee size={18} color={activeTab === 'meals' ? colors.secondary : colors.textSecondary} />
          <Text style={[styles.tabButtonText, { color: activeTab === 'meals' ? colors.secondary : colors.textSecondary }]}>
            Meals
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'chat' && { borderBottomColor: colors.accent }]}
          onPress={() => setActiveTab('chat')}
        >
          <MessageSquare size={18} color={activeTab === 'chat' ? colors.accent : colors.textSecondary} />
          <Text style={[styles.tabButtonText, { color: activeTab === 'chat' ? colors.accent : colors.textSecondary }]}>
            AI Chef
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'list' && (
        <View style={styles.listTabContainer}>
          <View style={styles.listHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recipe Templates</Text>
            
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity
                style={[styles.parseQuickButton, { borderColor: colors.primary, marginRight: 8 }]}
                onPress={() => setManualRecipeModalVisible(true)}
              >
                <Plus size={14} color={colors.primary} />
                <Text style={[styles.parseQuickButtonText, { color: colors.primary }]}>Create Manual</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.parseQuickButton, { borderColor: colors.secondary }]}
                onPress={() => {
                  Alert.prompt(
                    'Import Custom Recipe',
                    'Paste your recipe instructions, or write a description. We will parse it with AI.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Import', onPress: (text?: string) => text && handleParseRecipe(text) },
                    ]
                  );
                }}
              >
                <Sparkles size={14} color={colors.secondary} />
                <Text style={[styles.parseQuickButtonText, { color: colors.secondary }]}>Import AI</Text>
              </TouchableOpacity>
            </View>
          </View>

          {recipes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ChefHat size={60} color={colors.textSecondary} style={{ opacity: 0.5, marginBottom: 15 }} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No recipes saved yet. Create a recipe manually, or import one using the "Import AI" option or "AI Chef" tab.
              </Text>
            </View>
          ) : (
            <FlatList
              data={recipes}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={styles.recipeList}
              renderItem={({ item }) => {
                const stockStatus = getRecipeStockStatus(item);
                return (
                  <TouchableOpacity
                    style={[styles.recipeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => {
                      setSelectedRecipe(item);
                      setDetailModalVisible(true);
                    }}
                  >
                    <View style={styles.recipeCardContent}>
                      <Text style={[styles.recipeTitle, { color: colors.text }]}>{item.name}</Text>
                      <Text style={[styles.recipeInfo, { color: colors.textSecondary }]}>
                        Base: {item.base_amount} {item.base_unit} | {item.ingredients?.length || 0} ingredients
                      </Text>
                      
                      <View style={styles.stockRow}>
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: stockStatus.status === 'available' ? colors.success : colors.warning },
                          ]}
                        />
                        <Text
                          style={[
                            styles.stockText,
                            { color: stockStatus.status === 'available' ? colors.success : colors.warning },
                          ]}
                        >
                          {stockStatus.status === 'available'
                            ? 'In stock'
                            : `${stockStatus.missing.length} missing`}
                        </Text>
                      </View>
                    </View>
                    <ChevronRight size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      )}

      {activeTab === 'meals' && (
        <View style={styles.listTabContainer}>
          <View style={styles.listHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Meal Templates</Text>
            <TouchableOpacity
              style={[styles.parseQuickButton, { borderColor: colors.secondary }]}
              onPress={() => setCreateMealModalVisible(true)}
            >
              <ListPlus size={16} color={colors.secondary} />
              <Text style={[styles.parseQuickButtonText, { color: colors.secondary }]}>Create Meal</Text>
            </TouchableOpacity>
          </View>

          {meals.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Coffee size={60} color={colors.textSecondary} style={{ opacity: 0.5, marginBottom: 15 }} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No meal templates created yet. Combine multiple recipes into a Meal Template (e.g. Roti + Aloo Matar Sabzi) to cook them together manually.
              </Text>
            </View>
          ) : (
            <FlatList
              data={meals}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={styles.recipeList}
              renderItem={({ item }) => {
                const stockStatus = getMealStockStatus(item, {});
                return (
                  <TouchableOpacity
                    style={[styles.recipeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => {
                      setSelectedMeal(item);
                      setMealDetailModalVisible(true);
                    }}
                  >
                    <View style={styles.recipeCardContent}>
                      <Text style={[styles.recipeTitle, { color: colors.text }]}>{item.name}</Text>
                      <Text style={[styles.recipeInfo, { color: colors.textSecondary }]} numberOfLines={1}>
                        {item.description || `${item.recipes?.length || 0} recipes included`}
                      </Text>
                      
                      <View style={styles.stockRow}>
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: stockStatus.status === 'available' ? colors.success : colors.warning },
                          ]}
                        />
                        <Text
                          style={[
                            styles.stockText,
                            { color: stockStatus.status === 'available' ? colors.success : colors.warning },
                          ]}
                        >
                          {stockStatus.status === 'available'
                            ? 'All meal ingredients in stock'
                            : 'Some ingredients missing'}
                        </Text>
                      </View>
                    </View>
                    <ChevronRight size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      )}

      {activeTab === 'chat' && (
        <View style={styles.chatTabContainer}>
          {!apiKeyExists ? (
            <View style={styles.emptyContainer}>
              <AlertTriangle size={60} color={colors.warning} style={{ marginBottom: 15 }} />
              <Text style={[styles.emptyText, { color: colors.text, fontWeight: 'bold' }]}>Gemini API Key Required</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary, marginTop: 8 }]}>
                Please head to the Settings screen and enter a Gemini API Key to enable the AI Chef.
              </Text>
            </View>
          ) : (
            <View style={styles.chatWrapper}>
              {/* Clean URL Parser Input Bar */}
              <View style={[styles.urlParserBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Link size={18} color={colors.primary} style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.urlInput, { color: colors.text }]}
                  placeholder="Paste YouTube or Instagram cooking video link..."
                  placeholderTextColor={colors.textSecondary}
                  value={videoUrlInput}
                  onChangeText={setVideoUrlInput}
                />
                <TouchableOpacity
                  style={[styles.urlParseButton, { backgroundColor: colors.primary }]}
                  onPress={handleParseVideoUrl}
                >
                  <Text style={styles.urlParseButtonText}>Extract</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.chatScrollView}
                contentContainerStyle={styles.chatContent}
                ref={(ref) => ref?.scrollToEnd({ animated: true })}
              >
                {chatMessages.length === 0 && (
                  <View style={styles.chatWelcome}>
                    <Sparkles size={40} color={colors.primary} style={{ marginBottom: 10 }} />
                    <Text style={[styles.chatWelcomeTitle, { color: colors.text }]}>Ask the Chef</Text>
                    <Text style={[styles.chatWelcomeText, { color: colors.textSecondary }]}>
                      Get recipe suggestions based on what you have, ask about substitutes, or paste cooking video links above to auto-create pantry-linked recipes!
                    </Text>
                    <TouchableOpacity
                      style={[styles.suggestButton, { backgroundColor: colors.primary }]}
                      onPress={handleSuggestRecipe}
                    >
                      <Text style={styles.suggestButtonText}>Suggest Recipe from Pantry</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {chatMessages.map((msg, index) => {
                  const isUser = msg.role === 'user';
                  const isRecipe = !isUser && (msg.text.includes('Ingredients:') || msg.text.includes('Instructions:'));

                  return (
                    <View
                      key={index}
                      style={[
                        styles.chatMessageBubble,
                        isUser
                          ? [styles.userBubble, { backgroundColor: colors.primary }]
                          : [styles.modelBubble, { backgroundColor: colors.surface, borderColor: colors.border }],
                      ]}
                    >
                      <Text style={[styles.chatMessageText, { color: isUser ? '#FFF' : colors.text }]}>
                        {msg.text}
                      </Text>

                      {isRecipe && (
                        <TouchableOpacity
                          style={[styles.saveMessageButton, { borderColor: colors.primary }]}
                          onPress={() => handleParseRecipe(msg.text)}
                        >
                          <Sparkles size={16} color={colors.primary} />
                          <Text style={[styles.saveMessageButtonText, { color: colors.primary }]}>
                            Save as Recipe
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}

                {chatLoading && (
                  <View style={[styles.chatMessageBubble, styles.modelBubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                )}
              </ScrollView>

              <View style={[styles.chatInputRow, { borderTopColor: colors.border }]}>
                <TextInput
                  style={[styles.chatTextInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                  placeholder="Ask a question or describe a recipe..."
                  placeholderTextColor={colors.textSecondary}
                  value={chatInput}
                  onChangeText={setChatInput}
                />
                <TouchableOpacity
                  style={[styles.chatSendButton, { backgroundColor: colors.primary }]}
                  onPress={() => handleSendChat()}
                >
                  <Send size={20} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {/* RECIPE DETAILS MODAL WITH SCALING AND LIVE CALCULATIONS */}
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{selectedRecipe?.name}</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalForm}>
              {selectedRecipe && (
                <View>
                  {/* Dynamic Scaling Control Box */}
                  <View style={[styles.scalingCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                    <Text style={[styles.smallInputLabel, { color: colors.text }]}>
                      Amount you want to cook (in {selectedRecipe.base_unit ?? 'servings'}):
                    </Text>
                    <TextInput
                      style={[styles.modalInput, { height: 44, color: colors.text, borderColor: colors.border, marginTop: 8, backgroundColor: colors.surface }]}
                      keyboardType="numeric"
                      value={cookTargetAmount}
                      onChangeText={setCookTargetAmount}
                    />
                    <Text style={[styles.scalingHelperText, { color: colors.textSecondary }]}>
                      Recipe scales from base of {selectedRecipe.base_amount} {selectedRecipe.base_unit}
                    </Text>
                  </View>

                  <Text style={[styles.sectionHeading, { color: colors.text }]}>Scaled Ingredients Required</Text>
                  {(() => {
                    const multiplier = getRecipeMultiplier(selectedRecipe, cookTargetAmount);
                    const stock = getRecipeStockStatus(selectedRecipe, multiplier);
                    
                    return (
                      <View>
                        {selectedRecipe.ingredients?.map((ing) => {
                          const pantryItem = pantryItems.find((p) => p.id === ing.pantry_item_id);
                          const scaledAmt = ing.amount * (multiplier || 1);
                          const isMissing = !pantryItem || pantryItem.current_amount < scaledAmt;

                          return (
                            <View key={ing.id} style={[styles.ingRow, { borderBottomColor: colors.border }]}>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.ingName, { color: colors.text }]}>
                                  {ing.pantry_item_name}
                                </Text>
                                <Text style={[styles.ingAvailability, { color: isMissing ? colors.error : colors.success }]}>
                                  {pantryItem
                                    ? `Stock: ${pantryItem.current_amount}${pantryItem.unit} available`
                                    : 'Not in pantry'}
                                </Text>
                              </View>
                              <Text style={[styles.ingAmount, { color: isMissing ? colors.error : colors.text }]}>
                                {Math.round(scaledAmt * 10) / 10} {ing.unit}
                              </Text>
                            </View>
                          );
                        })}

                        <Text style={[styles.sectionHeading, { color: colors.text, marginTop: 20 }]}>Instructions</Text>
                        <Text style={[styles.instructionsText, { color: colors.text }]}>
                          {selectedRecipe.instructions}
                        </Text>

                        <View style={styles.actionRow}>
                          <TouchableOpacity
                            style={[styles.deleteRecipeButton, { borderColor: colors.error }]}
                            onPress={() => handleDeleteRecipe(selectedRecipe.id)}
                          >
                            <Trash2 size={20} color={colors.error} />
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.cookButton, 
                              { backgroundColor: stock.status === 'available' ? colors.success : '#CBD5E1' }
                            ]}
                            disabled={stock.status !== 'available'}
                            onPress={() => handleCook(selectedRecipe)}
                          >
                            <ChefHat size={20} color="#FFF" />
                            <Text style={styles.cookButtonText}>
                              {stock.status === 'available' ? 'Cook Recipe' : 'Stock Insufficient'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })()}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MEAL TEMPLATE DETAILS MODAL WITH SCALINGS PER RECIPE */}
      <Modal
        visible={mealDetailModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setMealDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{selectedMeal?.name}</Text>
              <TouchableOpacity onPress={() => setMealDetailModalVisible(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalForm}>
              {selectedMeal && (
                <View>
                  <Text style={[styles.descText, { color: colors.textSecondary, marginBottom: 15 }]}>
                    {selectedMeal.description || 'Meal template combining multiple recipes.'}
                  </Text>

                  {/* Multi-Recipe Scaling Inputs inside Meal */}
                  <Text style={[styles.sectionHeading, { color: colors.text }]}>Recipes scaling amounts</Text>
                  {selectedMeal.recipes?.map((rec) => (
                    <View key={rec.id} style={[styles.mealRecipeConfigRow, { borderBottomColor: colors.border }]}>
                      <View style={{ flex: 1, marginRight: 15 }}>
                        <Text style={[styles.mealRecipeName, { color: colors.text }]}>{rec.name}</Text>
                        <Text style={[styles.scalingHelperText, { color: colors.textSecondary, marginTop: 2 }]}>
                          Base: {rec.base_amount} {rec.base_unit}
                        </Text>
                      </View>
                      <TextInput
                        style={[styles.modalInput, { width: 90, height: 40, fontSize: 14, textAlign: 'center', color: colors.text, borderColor: colors.border }]}
                        keyboardType="numeric"
                        value={mealRecipeQuantities[rec.id]}
                        onChangeText={(val) => setMealRecipeQuantities(prev => ({ ...prev, [rec.id]: val }))}
                      />
                    </View>
                  ))}

                  {/* Combined Ingredient Checklist dynamically calculated */}
                  <Text style={[styles.sectionHeading, { color: colors.text, marginTop: 20 }]}>Combined Ingredient Checklist</Text>
                  {(() => {
                    const aggregated: { [key: number]: { needed: number; name: string; current: number; unit: string } } = {};
                    selectedMeal.recipes?.forEach((rec) => {
                      const qtyStr = mealRecipeQuantities[rec.id] || (rec.base_amount ?? 1).toString();
                      const qty = parseFloat(qtyStr);
                      const base = rec.base_amount ?? 1.0;
                      const mult = isNaN(qty) || qty <= 0 ? 0 : qty / base;

                      rec.ingredients?.forEach((ing) => {
                        const pantryItem = pantryItems.find((p) => p.id === ing.pantry_item_id);
                        const scaledAmt = ing.amount * mult;

                        if (aggregated[ing.pantry_item_id]) {
                          aggregated[ing.pantry_item_id].needed += scaledAmt;
                        } else {
                          aggregated[ing.pantry_item_id] = {
                            needed: scaledAmt,
                            name: ing.pantry_item_name || 'Unknown item',
                            current: pantryItem?.current_amount || 0,
                            unit: pantryItem?.unit || '',
                          };
                        }
                      });
                    });

                    const stockStatus = getMealStockStatus(selectedMeal, mealRecipeQuantities);

                    return (
                      <View>
                        {Object.entries(aggregated).map(([pantryId, demand]) => {
                          const isMissing = demand.current < demand.needed;
                          return (
                            <View key={pantryId} style={[styles.ingRow, { borderBottomColor: colors.border }]}>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.ingName, { color: colors.text }]}>{demand.name}</Text>
                                <Text style={[styles.ingAvailability, { color: isMissing ? colors.error : colors.success }]}>
                                  {`Pantry: ${demand.current}${demand.unit} / Needed: ${Math.round(demand.needed * 10) / 10}${demand.unit}`}
                                </Text>
                              </View>
                              <Text style={[styles.ingAmount, { color: isMissing ? colors.error : colors.text }]}>
                                {Math.round(demand.needed * 10) / 10} {demand.unit}
                              </Text>
                            </View>
                          );
                        })}

                        <View style={styles.actionRow}>
                          <TouchableOpacity
                            style={[styles.deleteRecipeButton, { borderColor: colors.error }]}
                            onPress={() => handleDeleteMeal(selectedMeal.id)}
                          >
                            <Trash2 size={20} color={colors.error} />
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.cookButton, 
                              { backgroundColor: stockStatus.status === 'available' ? colors.success : '#CBD5E1' }
                            ]}
                            disabled={stockStatus.status !== 'available'}
                            onPress={() => handleCookMeal(selectedMeal)}
                          >
                            <ChefHat size={20} color="#FFF" />
                            <Text style={styles.cookButtonText}>
                              {stockStatus.status === 'available' ? 'Cook Entire Meal' : 'Stock Insufficient'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })()}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* CREATE MEAL MODAL */}
      <Modal
        visible={createMealModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCreateMealModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Create Meal Template</Text>
              <TouchableOpacity onPress={() => setCreateMealModalVisible(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalForm}>
              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Meal Template Name</Text>
                <TextInput
                  style={[styles.modalInput, { color: colors.text, borderColor: colors.border }]}
                  placeholder="e.g. Daily Lunch, Sunday Breakfast"
                  placeholderTextColor={colors.textSecondary}
                  value={newMealName}
                  onChangeText={setNewMealName}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Description</Text>
                <TextInput
                  style={[styles.modalInput, { color: colors.text, borderColor: colors.border }]}
                  placeholder="Optional brief description"
                  placeholderTextColor={colors.textSecondary}
                  value={newMealDesc}
                  onChangeText={setNewMealDesc}
                />
              </View>

              <Text style={[styles.sectionHeading, { color: colors.text, marginTop: 10 }]}>Select Recipes to Combine</Text>
              {recipes.length === 0 ? (
                <Text style={{ color: colors.error, marginVertical: 10 }}>No recipes available in the recipe book yet.</Text>
              ) : (
                recipes.map((rec) => {
                  const isChecked = selectedRecipeIds.includes(rec.id);
                  return (
                    <TouchableOpacity
                      key={rec.id}
                      style={[styles.recipeSelectRow, { borderBottomColor: colors.border }]}
                      onPress={() => handleToggleRecipeSelection(rec.id)}
                    >
                      <View style={[styles.checkbox, { borderColor: colors.border }, isChecked && { backgroundColor: colors.secondary, borderColor: colors.secondary }]}>
                        {isChecked && <Check size={12} color="#FFF" />}
                      </View>
                      <Text style={[styles.recipeSelectName, { color: colors.text }]}>{rec.name}</Text>
                    </TouchableOpacity>
                  );
                })
              )}

              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: colors.secondary, marginTop: 20 }]}
                onPress={handleCreateMealTemplate}
              >
                <Check size={20} color="#FFF" />
                <Text style={[styles.submitButtonText, { marginLeft: 8 }]}>Save Meal Template</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* CREATE MANUAL RECIPE MODAL */}
      <Modal
        visible={manualRecipeModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => { setManualRecipeModalVisible(false); resetManualRecipeForm(); }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Create Recipe Manually</Text>
              <TouchableOpacity onPress={() => { setManualRecipeModalVisible(false); resetManualRecipeForm(); }}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalForm}>
              {/* Clean Template Loader Row */}
              <Text style={[styles.smallInputLabel, { color: colors.textSecondary }]}>Load Quick Template:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateSelectionRow}>
                <TouchableOpacity
                  style={[styles.templateBubbleButton, { borderColor: colors.primary }]}
                  onPress={() => handleLoadRecipeTemplate('roti')}
                >
                  <Text style={[styles.templateBubbleText, { color: colors.primary }]}>🌾 Roti</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.templateBubbleButton, { borderColor: colors.secondary }]}
                  onPress={() => handleLoadRecipeTemplate('curry')}
                >
                  <Text style={[styles.templateBubbleText, { color: colors.secondary }]}>🥔 Curry</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.templateBubbleButton, { borderColor: colors.accent }]}
                  onPress={() => handleLoadRecipeTemplate('coffee')}
                >
                  <Text style={[styles.templateBubbleText, { color: colors.accent }]}>☕ Coffee</Text>
                </TouchableOpacity>
              </ScrollView>

              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Recipe Name</Text>
                <TextInput
                  style={[styles.modalInput, { color: colors.text, borderColor: colors.border }]}
                  placeholder="e.g. Pancake, Atta Roti, Matar Curry"
                  placeholderTextColor={colors.textSecondary}
                  value={manualName}
                  onChangeText={setManualName}
                />
              </View>

              {/* Recipe Scaling Type Configurations */}
              <Text style={[styles.inputLabel, { color: colors.text }]}>Scaling Type</Text>
              <View style={styles.segmentedControl}>
                {(['servings', 'quantity', 'volume'] as const).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.segmentButton,
                      manualScalingType === mode && { backgroundColor: colors.primary },
                    ]}
                    onPress={() => {
                      setManualScalingType(mode);
                      if (mode === 'servings') {
                        setManualBaseAmount('4');
                        setManualBaseUnit('servings');
                      } else if (mode === 'quantity') {
                        setManualBaseAmount('1');
                        setManualBaseUnit('pieces');
                      } else {
                        setManualBaseAmount('100');
                        setManualBaseUnit('ml');
                      }
                    }}
                  >
                    <Text style={[styles.segmentText, manualScalingType === mode && styles.activeSegmentText]}>
                      {mode}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={[styles.rowInputs, { marginTop: 15 }]}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.smallInputLabel, { color: colors.textSecondary }]}>Base Reference Qty</Text>
                  <TextInput
                    style={[styles.modalInput, { color: colors.text, borderColor: colors.border }]}
                    keyboardType="numeric"
                    value={manualBaseAmount}
                    onChangeText={setManualBaseAmount}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={[styles.smallInputLabel, { color: colors.textSecondary }]}>Base Unit Name</Text>
                  <TextInput
                    style={[styles.modalInput, { color: colors.text, borderColor: colors.border }]}
                    placeholder="e.g. rotis, ml, servings"
                    placeholderTextColor={colors.textSecondary}
                    value={manualBaseUnit}
                    onChangeText={setManualBaseUnit}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Cooking Instructions</Text>
                <TextInput
                  style={[styles.modalInput, { height: 100, color: colors.text, borderColor: colors.border, textAlignVertical: 'top', paddingTop: 10 }]}
                  placeholder="Step-by-step instructions..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  value={manualInstructions}
                  onChangeText={setManualInstructions}
                />
              </View>

              <View style={styles.ingredientsSectionHeader}>
                <Text style={[styles.sectionHeading, { color: colors.text, marginVertical: 0 }]}>Ingredients</Text>
                <TouchableOpacity
                  style={[styles.parseQuickButton, { borderColor: colors.primary }]}
                  onPress={handleAddManualIngredient}
                >
                  <Plus size={14} color={colors.primary} />
                  <Text style={[styles.parseQuickButtonText, { color: colors.primary }]}>Add Item</Text>
                </TouchableOpacity>
              </View>

              {manualIngredients.length === 0 ? (
                <Text style={[styles.descText, { color: colors.textSecondary, textAlign: 'center', marginVertical: 12 }]}>
                  No ingredients added. Tap "Add Item" or select a template above.
                </Text>
              ) : (
                manualIngredients.map((item, index) => {
                  const activePantryItem = pantryItems.find(p => p.id === item.pantryItemId) || pantryItems[0];
                  return (
                    <View key={index} style={[styles.manualIngCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                      
                      <Text style={[styles.smallInputLabel, { color: colors.textSecondary, marginBottom: 4 }]}>Select Pantry Container:</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pantryPickerRow}>
                        {pantryItems.map((pi) => (
                          <TouchableOpacity
                            key={pi.id}
                            style={[
                              styles.pantryPickerBubble,
                              { borderColor: colors.border },
                              item.pantryItemId === pi.id && { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
                            ]}
                            onPress={() => handleUpdateManualIngredient(index, 'pantryItemId', pi.id)}
                          >
                            <Text style={[styles.pantryPickerText, { color: item.pantryItemId === pi.id ? colors.primary : colors.text }]}>
                              {pi.name} ({pi.unit})
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>

                      <View style={[styles.row, { marginTop: 8, marginBottom: 0 }]}>
                        <View style={{ flex: 0.7, flexDirection: 'row', alignItems: 'center' }}>
                          <TextInput
                            style={[styles.modalInput, { flex: 1, height: 40, fontSize: 14, color: colors.text, borderColor: colors.border }]}
                            placeholder="Amount"
                            placeholderTextColor={colors.textSecondary}
                            keyboardType="numeric"
                            value={item.amount}
                            onChangeText={(val) => handleUpdateManualIngredient(index, 'amount', val)}
                          />
                          <Text style={[styles.unitTextLabel, { color: colors.textSecondary }]}>
                            {activePantryItem?.unit || ''}
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={[styles.removeIngButton, { borderColor: colors.error }]}
                          onPress={() => handleRemoveManualIngredient(index)}
                        >
                          <Trash2 size={16} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}

              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: colors.primary, marginTop: 20 }]}
                onPress={handleSaveManualRecipe}
              >
                <Check size={20} color="#FFF" />
                <Text style={[styles.submitButtonText, { marginLeft: 8 }]}>Save Recipe</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* CONFIRMATION / MAPPING MODAL FOR IMPORTED RECIPE */}
      <Modal
        visible={confirmModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setConfirmModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Confirm Recipe Ingredients</Text>
              <TouchableOpacity onPress={() => setConfirmModalVisible(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalForm}>
              {parsedRecipe && (
                <View>
                  <Text style={[styles.sectionHeading, { color: colors.text }]}>Recipe Name</Text>
                  <TextInput
                    style={[styles.modalInput, { color: colors.text, borderColor: colors.border }]}
                    value={parsedRecipe.name}
                    onChangeText={(text) => setParsedRecipe({ ...parsedRecipe, name: text })}
                  />

                  <View style={[styles.row, { marginTop: 12 }]}>
                    <Text style={[styles.inputLabel, { color: colors.text }]}>Servings</Text>
                    <TextInput
                      style={[styles.modalInput, { width: 80, color: colors.text, borderColor: colors.border, textAlign: 'center' }]}
                      keyboardType="numeric"
                      value={parsedRecipe.servings.toString()}
                      onChangeText={(text) =>
                        setParsedRecipe({ ...parsedRecipe, servings: parseInt(text) || 1 })
                      }
                    />
                  </View>

                  <Text style={[styles.sectionHeading, { color: colors.text, marginTop: 15 }]}>
                    Map Ingredients to Pantry Containers
                  </Text>
                  <Text style={[styles.descText, { color: colors.textSecondary }]}>
                    Check if ingredients map to existing containers, or configure a new container to be added to your pantry automatically.
                  </Text>

                  {parsedRecipe.ingredients.map((ing, idx) => {
                    const currentMapping = ingredientMappings[idx];
                    const isNew = currentMapping === 'new';

                    return (
                      <View key={idx} style={[styles.mappingCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                        <View style={styles.mappingHeader}>
                          <Text style={[styles.mappingName, { color: colors.text }]}>{ing.name}</Text>
                          <Text style={[styles.mappingAmount, { color: colors.textSecondary }]}>
                            {ing.amount} {ing.unit}
                          </Text>
                        </View>

                        <View style={styles.mappingSelectorRow}>
                          <Text style={[styles.mappingLabel, { color: colors.textSecondary }]}>Map to:</Text>
                          <View style={styles.segmentedControl}>
                            <TouchableOpacity
                              style={[
                                styles.segmentButton,
                                !isNew && { backgroundColor: colors.primary },
                              ]}
                              onPress={() => {
                                const defaultItem = pantryItems[0]?.id || 0;
                                setIngredientMappings((prev) => ({ ...prev, [idx]: defaultItem }));
                              }}
                            >
                              <Text style={[styles.segmentText, !isNew && styles.activeSegmentText]}>
                                Existing
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[
                                styles.segmentButton,
                                isNew && { backgroundColor: colors.primary },
                              ]}
                              onPress={() => {
                                setIngredientMappings((prev) => ({ ...prev, [idx]: 'new' }));
                                if (!newPantryDetails[idx]) {
                                  setNewPantryDetails((prev) => ({
                                    ...prev,
                                    [idx]: { shape: ing.unit === 'ml' ? 'bottle' : 'jar', capacity: ing.amount * 2, color: '#FF6B6B' },
                                  }));
                                }
                              }}
                            >
                              <Text style={[styles.segmentText, isNew && styles.activeSegmentText]}>
                                Create New
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {!isNew ? (
                          <View style={styles.pickerWrapper}>
                            {pantryItems.length === 0 ? (
                              <Text style={{ color: colors.error, fontSize: 12 }}>No existing containers available.</Text>
                            ) : (
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pantryPickerRow}>
                                {pantryItems.map((item) => (
                                  <TouchableOpacity
                                    key={item.id}
                                    style={[
                                      styles.pantryPickerBubble,
                                      { borderColor: colors.border },
                                      currentMapping === item.id && { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
                                    ]}
                                    onPress={() => setIngredientMappings((prev) => ({ ...prev, [idx]: item.id }))}
                                  >
                                    <Text style={[styles.pantryPickerText, { color: currentMapping === item.id ? colors.primary : colors.text }]}>
                                      {item.name} ({item.unit})
                                    </Text>
                                  </TouchableOpacity>
                                ))}
                              </ScrollView>
                            )}
                          </View>
                        ) : (
                          // New container configuration
                          <View style={styles.newContainerForm}>
                            <View style={styles.row}>
                              <Text style={[styles.smallInputLabel, { color: colors.textSecondary }]}>Shape</Text>
                              <View style={styles.segmentedControl}>
                                {(['jar', 'bottle', 'bag'] as const).map((s) => (
                                  <TouchableOpacity
                                    key={s}
                                    style={[
                                      styles.segmentButton,
                                      newPantryDetails[idx]?.shape === s && { backgroundColor: colors.secondary },
                                    ]}
                                    onPress={() => changeNewItemDetail(idx, 'shape', s)}
                                  >
                                    <Text style={[styles.segmentText, newPantryDetails[idx]?.shape === s && styles.activeSegmentText]}>
                                      {s}
                                    </Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </View>

                            <View style={styles.row}>
                              <Text style={[styles.smallInputLabel, { color: colors.textSecondary }]}>Container Capacity</Text>
                              <TextInput
                                style={[styles.modalInput, { width: 100, height: 35, fontSize: 13, paddingHorizontal: 8, color: colors.text, borderColor: colors.border }]}
                                keyboardType="numeric"
                                value={newPantryDetails[idx]?.capacity.toString()}
                                onChangeText={(val) => changeNewItemDetail(idx, 'capacity', parseFloat(val) || 0)}
                              />
                            </View>

                            <View style={[styles.row, { justifyContent: 'flex-start' }]}>
                              <Text style={[styles.smallInputLabel, { color: colors.textSecondary, marginRight: 15 }]}>Theme Color</Text>
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorPickerSmall}>
                                {['#FF6B6B', '#4ECDC4', '#FFE66D', '#4A90E2', '#9B59B6'].map((c) => (
                                  <TouchableOpacity
                                    key={c}
                                    style={[
                                      styles.colorBubbleSmall,
                                      { backgroundColor: c },
                                      newPantryDetails[idx]?.color === c && { borderWidth: 2, borderColor: colors.text },
                                    ]}
                                    onPress={() => changeNewItemDetail(idx, 'color', c)}
                                  />
                                ))}
                              </ScrollView>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}

                  <TouchableOpacity
                    style={[styles.submitButton, { backgroundColor: colors.primary, marginTop: 24 }]}
                    onPress={handleSaveRecipe}
                  >
                    <Check size={20} color="#FFF" />
                    <Text style={[styles.submitButtonText, { marginLeft: 8 }]}>Save Recipe to Book</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* GLOBAL LOADING SPINNER FOR PARSER */}
      {parseLoading && (
        <View style={styles.fullscreenLoading}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: '#FFF' }]}>Structuring recipe with AI...</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabHeader: {
    flexDirection: 'row',
    height: 50,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  listTabContainer: {
    flex: 1,
    padding: 16,
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  parseQuickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  parseQuickButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  recipeList: {
    paddingBottom: 24,
  },
  recipeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  recipeCardContent: {
    flex: 1,
  },
  recipeTitle: {
    fontSize: 17,
    fontWeight: 'bold',
  },
  recipeInfo: {
    fontSize: 13,
    marginTop: 4,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  stockText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chatTabContainer: {
    flex: 1,
  },
  chatWrapper: {
    flex: 1,
    justifyContent: 'space-between',
  },
  urlParserBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    padding: 8,
    borderWidth: 1.5,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  urlInput: {
    flex: 1,
    height: 36,
    fontSize: 13,
    paddingHorizontal: 4,
  },
  urlParseButton: {
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urlParseButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  chatScrollView: {
    flex: 1,
  },
  chatContent: {
    padding: 16,
    paddingBottom: 30,
  },
  chatWelcome: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 30,
    paddingHorizontal: 20,
  },
  chatWelcomeTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginVertical: 10,
  },
  chatWelcomeText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  suggestButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
  },
  suggestButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  chatMessageBubble: {
    maxWidth: '85%',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
  },
  userBubble: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  modelBubble: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
  },
  chatMessageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  saveMessageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 15,
    paddingVertical: 4,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  saveMessageButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
  },
  chatTextInput: {
    flex: 1,
    height: 46,
    borderWidth: 1,
    borderRadius: 23,
    paddingHorizontal: 16,
    fontSize: 15,
    marginRight: 10,
  },
  chatSendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
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
  recipeModalServings: {
    fontSize: 14,
    marginBottom: 15,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    marginTop: 15,
  },
  mealRecipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  mealRecipeConfigRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  mealRecipeName: {
    fontSize: 15,
    fontWeight: '600',
  },
  ingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  ingName: {
    fontSize: 15,
    fontWeight: '600',
  },
  ingAvailability: {
    fontSize: 12,
    marginTop: 2,
  },
  ingAmount: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  instructionsText: {
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 20,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  deleteRecipeButton: {
    width: 50,
    height: 50,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cookButton: {
    flex: 1,
    marginLeft: 10,
    flexDirection: 'row',
    height: 50,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cookButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  smallInputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  modalInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 10,
  },
  descText: {
    fontSize: 13,
    marginBottom: 15,
    lineHeight: 18,
  },
  recipeSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  recipeSelectName: {
    fontSize: 15,
    fontWeight: '600',
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
  mappingCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  mappingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  mappingName: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  mappingAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
  mappingSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  mappingLabel: {
    fontSize: 13,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    padding: 2,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  segmentText: {
    fontSize: 12,
    color: '#4A5568',
    fontWeight: '600',
  },
  activeSegmentText: {
    color: '#FFF',
  },
  pickerWrapper: {
    marginTop: 5,
  },
  pantryPickerRow: {
    paddingVertical: 5,
  },
  pantryPickerBubble: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1,
    marginRight: 8,
  },
  pantryPickerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  newContainerForm: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
  },
  colorPickerSmall: {
    flexDirection: 'row',
  },
  colorBubbleSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  submitButton: {
    flexDirection: 'row',
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
  fullscreenLoading: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 12,
  },
  templateSelectionRow: {
    paddingVertical: 8,
    marginBottom: 10,
  },
  templateBubbleButton: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginRight: 10,
  },
  templateBubbleText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  formGroup: {
    marginBottom: 16,
  },
  ingredientsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  manualIngCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  unitTextLabel: {
    fontSize: 15,
    marginLeft: 8,
    fontWeight: 'bold',
  },
  removeIngButton: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  scalingCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  scalingHelperText: {
    fontSize: 12,
    marginTop: 4,
  },
  rowInputs: {
    flexDirection: 'row',
    marginBottom: 16,
  },
});
