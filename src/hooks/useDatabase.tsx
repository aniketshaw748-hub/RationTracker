import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { PantryItem, Recipe, RecipeIngredient, Meal } from '../database/schema';

interface DatabaseContextProps {
  pantryItems: PantryItem[];
  recipes: Recipe[];
  meals: Meal[];
  isLoading: boolean;
  refreshPantryItems: () => Promise<void>;
  refreshRecipes: () => Promise<void>;
  refreshMeals: () => Promise<void>;
  addPantryItem: (item: Omit<PantryItem, 'id'>) => Promise<number>;
  updatePantryItem: (id: number, item: Partial<Omit<PantryItem, 'id'>>) => Promise<void>;
  deletePantryItem: (id: number) => Promise<void>;
  logInventoryChange: (pantryItemId: number, amount: number) => Promise<void>;
  addRecipe: (recipe: Omit<Recipe, 'id' | 'ingredients'>, ingredients: Omit<RecipeIngredient, 'id' | 'recipe_id'>[]) => Promise<number>;
  deleteRecipe: (id: number) => Promise<void>;
  cookRecipe: (recipeId: number, multiplier?: number) => Promise<{ success: boolean; missing?: string[] }>;
  resolveIngredientId: (name: string) => Promise<number | null>;
  
  // Meals Templates API
  addMeal: (name: string, description: string, recipeIds: number[]) => Promise<number>;
  deleteMeal: (id: number) => Promise<void>;
  cookMeal: (mealId: number, recipeQuantities: { [recipeId: number]: number }) => Promise<{ success: boolean; missing?: string[] }>;
}

const DatabaseContext = createContext<DatabaseContextProps | undefined>(undefined);

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const db = useSQLiteContext();
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshPantryItems = useCallback(async () => {
    try {
      const items = await db.getAllAsync<PantryItem>('SELECT * FROM pantry_items ORDER BY name ASC;');
      setPantryItems(items);
    } catch (e) {
      console.error('Error loading pantry items:', e);
    }
  }, [db]);

  const refreshRecipes = useCallback(async () => {
    try {
      const dbRecipes = await db.getAllAsync<Recipe>('SELECT * FROM recipes ORDER BY name ASC;');
      
      const recipesWithIngredients = await Promise.all(
        dbRecipes.map(async (recipe) => {
          const ingredients = await db.getAllAsync<RecipeIngredient>(
            `SELECT ri.*, pi.name as pantry_item_name, pi.unit 
             FROM recipe_ingredients ri
             JOIN pantry_items pi ON ri.pantry_item_id = pi.id
             WHERE ri.recipe_id = ?;`,
            [recipe.id]
          );
          return { ...recipe, ingredients };
        })
      );
      
      setRecipes(recipesWithIngredients);
    } catch (e) {
      console.error('Error loading recipes:', e);
    }
  }, [db]);

  const refreshMeals = useCallback(async () => {
    try {
      const dbMeals = await db.getAllAsync<Omit<Meal, 'recipes'>>('SELECT * FROM meals ORDER BY name ASC;');
      
      const mealsWithRecipes = await Promise.all(
        dbMeals.map(async (meal) => {
          const mealRecipes = await db.getAllAsync<Recipe>(
            `SELECT r.* FROM recipes r
             JOIN meal_recipes mr ON mr.recipe_id = r.id
             WHERE mr.meal_id = ?;`,
            [meal.id]
          );

          const recipesWithIngredients = await Promise.all(
            mealRecipes.map(async (recipe) => {
              const ingredients = await db.getAllAsync<RecipeIngredient>(
                `SELECT ri.*, pi.name as pantry_item_name, pi.unit 
                 FROM recipe_ingredients ri
                 JOIN pantry_items pi ON ri.pantry_item_id = pi.id
                 WHERE ri.recipe_id = ?;`,
                [recipe.id]
              );
              return { ...recipe, ingredients };
            })
          );

          return { ...meal, recipes: recipesWithIngredients } as Meal;
        })
      );

      setMeals(mealsWithRecipes);
    } catch (e) {
      console.error('Error loading meals:', e);
    }
  }, [db]);

  // Load all initial data
  useEffect(() => {
    const initLoad = async () => {
      setIsLoading(true);
      await Promise.all([refreshPantryItems(), refreshRecipes(), refreshMeals()]);
      setIsLoading(false);
    };
    initLoad();
  }, [refreshPantryItems, refreshRecipes, refreshMeals]);

  // Pantry Items API
  const addPantryItem = async (item: Omit<PantryItem, 'id'>): Promise<number> => {
    const result = await db.runAsync(
      'INSERT INTO pantry_items (name, unit, capacity, current_amount, shape, color) VALUES (?, ?, ?, ?, ?, ?);',
      [item.name, item.unit, item.capacity, item.current_amount, item.shape, item.color]
    );
    
    const now = Math.floor(Date.now() / 1000);
    await db.runAsync(
      'INSERT INTO inventory_log (pantry_item_id, amount, timestamp) VALUES (?, ?, ?);',
      [result.lastInsertRowId, item.current_amount, now]
    );

    await refreshPantryItems();
    return result.lastInsertRowId;
  };

  const updatePantryItem = async (id: number, item: Partial<Omit<PantryItem, 'id'>>): Promise<void> => {
    const fields: string[] = [];
    const values: any[] = [];
    
    Object.entries(item).forEach(([key, val]) => {
      if (val !== undefined) {
        fields.push(`${key} = ?`);
        values.push(val);
      }
    });

    if (fields.length === 0) return;

    values.push(id);
    await db.runAsync(
      `UPDATE pantry_items SET ${fields.join(', ')} WHERE id = ?;`,
      values
    );
    await refreshPantryItems();
  };

  const deletePantryItem = async (id: number): Promise<void> => {
    await db.runAsync('DELETE FROM pantry_items WHERE id = ?;', [id]);
    await refreshPantryItems();
    await refreshRecipes(); 
    await refreshMeals();
  };

  const logInventoryChange = async (pantryItemId: number, amount: number): Promise<void> => {
    const item = await db.getFirstAsync<PantryItem>('SELECT * FROM pantry_items WHERE id = ?;', [pantryItemId]);
    if (!item) throw new Error('Pantry item not found');

    const newAmount = Math.max(0, Math.min(item.capacity, item.current_amount + amount));
    const now = Math.floor(Date.now() / 1000);

    await db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE pantry_items SET current_amount = ? WHERE id = ?;', [newAmount, pantryItemId]);
      await db.runAsync(
        'INSERT INTO inventory_log (pantry_item_id, amount, timestamp) VALUES (?, ?, ?);',
        [pantryItemId, amount, now]
      );
    });

    await refreshPantryItems();
  };

  // Recipes API
  const addRecipe = async (
    recipe: Omit<Recipe, 'id' | 'ingredients'>,
    ingredients: Omit<RecipeIngredient, 'id' | 'recipe_id'>[]
  ): Promise<number> => {
    let recipeId = 0;
    await db.withTransactionAsync(async () => {
      const result = await db.runAsync(
        'INSERT INTO recipes (name, servings, instructions, scaling_type, base_amount, base_unit) VALUES (?, ?, ?, ?, ?, ?);',
        [recipe.name, recipe.servings, recipe.instructions, recipe.scaling_type || 'servings', recipe.base_amount || 1.0, recipe.base_unit || 'servings']
      );
      recipeId = result.lastInsertRowId;

      for (const ing of ingredients) {
        await db.runAsync(
          'INSERT INTO recipe_ingredients (recipe_id, pantry_item_id, amount) VALUES (?, ?, ?);',
          [recipeId, ing.pantry_item_id, ing.amount]
        );
      }
    });

    await refreshRecipes();
    return recipeId;
  };

  const deleteRecipe = async (id: number): Promise<void> => {
    await db.runAsync('DELETE FROM recipes WHERE id = ?;', [id]);
    await refreshRecipes();
    await refreshMeals();
  };

  const cookRecipe = async (recipeId: number, multiplier = 1): Promise<{ success: boolean; missing?: string[] }> => {
    const ingredients = await db.getAllAsync<RecipeIngredient>(
      'SELECT ri.*, pi.name, pi.current_amount FROM recipe_ingredients ri JOIN pantry_items pi ON ri.pantry_item_id = pi.id WHERE ri.recipe_id = ?;',
      [recipeId]
    );

    const missing: string[] = [];
    ingredients.forEach((ing) => {
      const required = ing.amount * multiplier;
      const current = (ing as any).current_amount;
      if (current < required) {
        missing.push(`${ing.pantry_item_name || (ing as any).name} (Need: ${required}, Have: ${current})`);
      }
    });

    if (missing.length > 0) {
      return { success: false, missing };
    }

    const now = Math.floor(Date.now() / 1000);
    await db.withTransactionAsync(async () => {
      for (const ing of ingredients) {
        const required = ing.amount * multiplier;
        const current = (ing as any).current_amount;
        const newAmount = Math.max(0, current - required);

        await db.runAsync('UPDATE pantry_items SET current_amount = ? WHERE id = ?;', [newAmount, ing.pantry_item_id]);
        await db.runAsync(
          'INSERT INTO inventory_log (pantry_item_id, amount, timestamp) VALUES (?, ?, ?);',
          [ing.pantry_item_id, -required, now]
        );
      }
    });

    await refreshPantryItems();
    return { success: true };
  };

  const resolveIngredientId = async (name: string): Promise<number | null> => {
    const lowerName = name.toLowerCase().trim();
    
    const exactMatch = await db.getFirstAsync<PantryItem>(
      'SELECT id FROM pantry_items WHERE LOWER(name) = ?;',
      [lowerName]
    );
    if (exactMatch) return exactMatch.id;

    const partialMatch = await db.getFirstAsync<PantryItem>(
      'SELECT id FROM pantry_items WHERE LOWER(name) LIKE ? OR ? LIKE "%" || LOWER(name) || "%";',
      [`%${lowerName}%`, lowerName]
    );
    if (partialMatch) return partialMatch.id;

    return null;
  };

  // Meals API implementation
  const addMeal = async (name: string, description: string, recipeIds: number[]): Promise<number> => {
    let mealId = 0;
    await db.withTransactionAsync(async () => {
      const result = await db.runAsync(
        'INSERT INTO meals (name, description) VALUES (?, ?);',
        [name, description]
      );
      mealId = result.lastInsertRowId;

      for (const rid of recipeIds) {
        await db.runAsync(
          'INSERT INTO meal_recipes (meal_id, recipe_id) VALUES (?, ?);',
          [mealId, rid]
        );
      }
    });

    await refreshMeals();
    return mealId;
  };

  const deleteMeal = async (id: number): Promise<void> => {
    await db.runAsync('DELETE FROM meals WHERE id = ?;', [id]);
    await refreshMeals();
  };

  // Upgraded cookMeal using dynamic quantities per recipe inside the meal template
  const cookMeal = async (
    mealId: number,
    recipeQuantities: { [recipeId: number]: number }
  ): Promise<{ success: boolean; missing?: string[] }> => {
    // 1. Fetch meal recipes
    const mealRecipes = await db.getAllAsync<Recipe>(
      `SELECT r.* FROM recipes r
       JOIN meal_recipes mr ON mr.recipe_id = r.id
       WHERE mr.meal_id = ?;`,
      [mealId]
    );

    if (mealRecipes.length === 0) {
      return { success: false, missing: ['No recipes in this meal template'] };
    }

    // 2. Fetch and aggregate all required ingredients scaled individually
    const ingredientDemands: { 
      [key: number]: { needed: number; name: string; current: number; unit: string } 
    } = {};

    for (const r of mealRecipes) {
      const targetQuantity = recipeQuantities[r.id] ?? r.base_amount;
      const multiplier = targetQuantity / r.base_amount;

      const ingredients = await db.getAllAsync<RecipeIngredient>(
        `SELECT ri.*, pi.name, pi.current_amount, pi.unit 
         FROM recipe_ingredients ri 
         JOIN pantry_items pi ON ri.pantry_item_id = pi.id 
         WHERE ri.recipe_id = ?;`,
        [r.id]
      );

      for (const ing of ingredients) {
        const currentAmount = (ing as any).current_amount;
        const name = (ing as any).name;
        const unit = (ing as any).unit;
        const scaledAmount = ing.amount * multiplier;

        if (ingredientDemands[ing.pantry_item_id]) {
          ingredientDemands[ing.pantry_item_id].needed += scaledAmount;
        } else {
          ingredientDemands[ing.pantry_item_id] = {
            needed: scaledAmount,
            name,
            current: currentAmount,
            unit
          };
        }
      }
    }

    // 3. Check for stock shortages
    const missing: string[] = [];
    Object.entries(ingredientDemands).forEach(([idStr, demand]) => {
      if (demand.current < demand.needed) {
        missing.push(`${demand.name} (Need: ${Math.round(demand.needed)}${demand.unit}, Have: ${demand.current}${demand.unit})`);
      }
    });

    if (missing.length > 0) {
      return { success: false, missing };
    }

    // 4. Deduct ingredients and log in a transaction
    const now = Math.floor(Date.now() / 1000);
    await db.withTransactionAsync(async () => {
      for (const [idStr, demand] of Object.entries(ingredientDemands)) {
        const id = parseInt(idStr);
        const newAmount = Math.max(0, demand.current - demand.needed);

        await db.runAsync('UPDATE pantry_items SET current_amount = ? WHERE id = ?;', [newAmount, id]);
        await db.runAsync(
          'INSERT INTO inventory_log (pantry_item_id, amount, timestamp) VALUES (?, ?, ?);',
          [id, -demand.needed, now]
        );
      }
    });

    await refreshPantryItems();
    return { success: true };
  };

  return (
    <DatabaseContext.Provider
      value={{
        pantryItems,
        recipes,
        meals,
        isLoading,
        refreshPantryItems,
        refreshRecipes,
        refreshMeals,
        addPantryItem,
        updatePantryItem,
        deletePantryItem,
        logInventoryChange,
        addRecipe,
        deleteRecipe,
        cookRecipe,
        resolveIngredientId,
        addMeal,
        deleteMeal,
        cookMeal,
      }}
    >
      {children}
    </DatabaseContext.Provider>
  );
};

export const useDatabase = () => {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
};
