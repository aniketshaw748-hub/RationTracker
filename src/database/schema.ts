import { type SQLiteDatabase } from 'expo-sqlite';

export async function initializeDatabase(db: SQLiteDatabase) {
  // Enable foreign keys
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync('PRAGMA journal_mode = WAL;');

  // Create pantry_items table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS pantry_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      unit TEXT NOT NULL,
      capacity REAL NOT NULL,
      current_amount REAL NOT NULL,
      shape TEXT NOT NULL,
      color TEXT NOT NULL
    );
  `);

  // Create recipes table with scaling configurations
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      servings INTEGER NOT NULL,
      instructions TEXT NOT NULL,
      scaling_type TEXT DEFAULT 'servings',
      base_amount REAL DEFAULT 1.0,
      base_unit TEXT DEFAULT 'servings'
    );
  `);

  // Create recipe_ingredients table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      pantry_item_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
      FOREIGN KEY (pantry_item_id) REFERENCES pantry_items(id) ON DELETE CASCADE
    );
  `);

  // Create inventory_log table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS inventory_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pantry_item_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (pantry_item_id) REFERENCES pantry_items(id) ON DELETE CASCADE
    );
  `);

  // Create meals table (Templates for combining recipes)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT
    );
  `);

  // Create meal_recipes join table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS meal_recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_id INTEGER NOT NULL,
      recipe_id INTEGER NOT NULL,
      FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    );
  `);

  // Check if we need to perform migrations (in case columns do not exist in older tables)
  try {
    await db.execAsync('ALTER TABLE recipes ADD COLUMN scaling_type TEXT DEFAULT "servings";');
  } catch(e) {}
  try {
    await db.execAsync('ALTER TABLE recipes ADD COLUMN base_amount REAL DEFAULT 1.0;');
  } catch(e) {}
  try {
    await db.execAsync('ALTER TABLE recipes ADD COLUMN base_unit TEXT DEFAULT "servings";');
  } catch(e) {}

  // Seed default pantry items if table is empty
  const pantryCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM pantry_items;');
  if (pantryCount && pantryCount.count === 0) {
    const initialItems = [
      { name: 'Rice', unit: 'g', capacity: 5000, current_amount: 3500, shape: 'jar', color: '#F7F7F7' },
      { name: 'Milk', unit: 'ml', capacity: 1000, current_amount: 800, shape: 'bottle', color: '#FFFDF0' },
      { name: 'Atta (Flour)', unit: 'g', capacity: 10000, current_amount: 4000, shape: 'bag', color: '#F5DEB3' },
      { name: 'Sugar', unit: 'g', capacity: 2000, current_amount: 1500, shape: 'jar', color: '#E2E8F0' },
      { name: 'Olive Oil', unit: 'ml', capacity: 750, current_amount: 300, shape: 'bottle', color: '#808000' },
      { name: 'Potato', unit: 'g', capacity: 5000, current_amount: 2500, shape: 'bag', color: '#E3C598' },
      { name: 'Green Peas', unit: 'g', capacity: 2000, current_amount: 1000, shape: 'jar', color: '#8FBC8F' },
      { name: 'Water', unit: 'ml', capacity: 5000, current_amount: 5000, shape: 'bottle', color: '#E0F2FE' },
    ];

    for (const item of initialItems) {
      await db.runAsync(
        'INSERT INTO pantry_items (name, unit, capacity, current_amount, shape, color) VALUES (?, ?, ?, ?, ?, ?);',
        [item.name, item.unit, item.capacity, item.current_amount, item.shape, item.color]
      );
    }

    const items = await db.getAllAsync<{ id: number, name: string, current_amount: number }>('SELECT id, name, current_amount FROM pantry_items;');
    const now = Math.floor(Date.now() / 1000);
    const day = 24 * 60 * 60; // 1 day in seconds

    for (const item of items) {
      // Log starting stock
      await db.runAsync(
        'INSERT INTO inventory_log (pantry_item_id, amount, timestamp) VALUES (?, ?, ?);',
        [item.id, item.current_amount, now - 15 * day]
      );
      
      // Feed dummy logs to create consumption rate
      if (item.name === 'Rice') {
        const RiceDeductions = [-200, -150, -250, -200, -150];
        for (let i = 0; i < RiceDeductions.length; i++) {
          await db.runAsync('INSERT INTO inventory_log (pantry_item_id, amount, timestamp) VALUES (?, ?, ?);', [item.id, RiceDeductions[i], now - (10 - i * 2) * day]);
        }
      }
      if (item.name === 'Atta (Flour)') {
        const AttaDeductions = [-400, -350, -450, -300, -500];
        for (let i = 0; i < AttaDeductions.length; i++) {
          await db.runAsync('INSERT INTO inventory_log (pantry_item_id, amount, timestamp) VALUES (?, ?, ?);', [item.id, AttaDeductions[i], now - (9 - i * 2) * day]);
        }
      }
    }

    // Seed default recipes with scaling types:
    // 1. Roti: quantity-based (1 roti = 35g Atta, 20ml Water)
    // 2. Aloo Matar Sabzi: volume-based (100ml curry = 60g Potato, 30g Peas, 4ml Oil, 30ml Water)
    const attaId = items.find(i => i.name === 'Atta (Flour)')?.id;
    const waterId = items.find(i => i.name === 'Water')?.id;
    const potatoId = items.find(i => i.name === 'Potato')?.id;
    const peasId = items.find(i => i.name === 'Green Peas')?.id;
    const oilId = items.find(i => i.name === 'Olive Oil')?.id;

    if (attaId && waterId && potatoId && peasId && oilId) {
      // Roti Recipe (1 Roti base)
      const rotiRes = await db.runAsync(
        'INSERT INTO recipes (name, servings, instructions, scaling_type, base_amount, base_unit) VALUES (?, ?, ?, ?, ?, ?);',
        ['Roti', 1, '1. Mix flour and water to form a soft dough.\n2. Roll into flat rounds.\n3. Cook on a hot tawa until puffed.', 'quantity', 1.0, 'rotis']
      );
      const rotiId = rotiRes.lastInsertRowId;
      await db.runAsync('INSERT INTO recipe_ingredients (recipe_id, pantry_item_id, amount) VALUES (?, ?, ?);', [rotiId, attaId, 35]);
      await db.runAsync('INSERT INTO recipe_ingredients (recipe_id, pantry_item_id, amount) VALUES (?, ?, ?);', [rotiId, waterId, 20]);

      // Aloo Matar Sabzi Recipe (100ml curry base)
      const alooRes = await db.runAsync(
        'INSERT INTO recipes (name, servings, instructions, scaling_type, base_amount, base_unit) VALUES (?, ?, ?, ?, ?, ?);',
        ['Aloo Matar Sabzi', 100, '1. Heat oil in a pan, add spices.\n2. Add cubed potatoes and green peas.\n3. Cook with water on low heat until tender.', 'volume', 100.0, 'ml']
      );
      const alooId = alooRes.lastInsertRowId;
      await db.runAsync('INSERT INTO recipe_ingredients (recipe_id, pantry_item_id, amount) VALUES (?, ?, ?);', [alooId, potatoId, 60]);
      await db.runAsync('INSERT INTO recipe_ingredients (recipe_id, pantry_item_id, amount) VALUES (?, ?, ?);', [alooId, peasId, 30]);
      await db.runAsync('INSERT INTO recipe_ingredients (recipe_id, pantry_item_id, amount) VALUES (?, ?, ?);', [alooId, oilId, 4]);
      await db.runAsync('INSERT INTO recipe_ingredients (recipe_id, pantry_item_id, amount) VALUES (?, ?, ?);', [alooId, waterId, 30]);

      // Seed Meal Template combining Roti + Aloo Matar Sabzi
      const mealRes = await db.runAsync(
        'INSERT INTO meals (name, description) VALUES (?, ?);',
        ['Roti + Aloo Matar Lunch', 'Traditional lunch meal template combining hot Rotis with potato-pea curry.']
      );
      const mealId = mealRes.lastInsertRowId;
      await db.runAsync('INSERT INTO meal_recipes (meal_id, recipe_id) VALUES (?, ?);', [mealId, rotiId]);
      await db.runAsync('INSERT INTO meal_recipes (meal_id, recipe_id) VALUES (?, ?);', [mealId, alooId]);
    }
  }
}

export interface PantryItem {
  id: number;
  name: string;
  unit: string;
  capacity: number;
  current_amount: number;
  shape: 'jar' | 'bag' | 'bottle';
  color: string;
}

export interface Recipe {
  id: number;
  name: string;
  servings: number;
  instructions: string;
  scaling_type: 'servings' | 'quantity' | 'volume';
  base_amount: number;
  base_unit: string;
  ingredients?: RecipeIngredient[];
}

export interface RecipeIngredient {
  id: number;
  recipe_id: number;
  pantry_item_id: number;
  amount: number;
  pantry_item_name?: string; // joined
  unit?: string;             // joined
}

export interface InventoryLog {
  id: number;
  pantry_item_id: number;
  amount: number;
  timestamp: number;
}

export interface Meal {
  id: number;
  name: string;
  description: string;
  recipes?: Recipe[];
}
