import * as SecureStore from 'expo-secure-store';

const API_KEY_STORAGE_KEY = 'gemini_api_key_ration_tracker';

export async function getApiKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(API_KEY_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to get API key from SecureStore:', error);
    return null;
  }
}

export async function saveApiKey(key: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(API_KEY_STORAGE_KEY, key);
  } catch (error) {
    console.error('Failed to save API key to SecureStore:', error);
    throw error;
  }
}

export async function deleteApiKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(API_KEY_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to delete API key from SecureStore:', error);
    throw error;
  }
}

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export async function sendChatMessage(
  message: string,
  history: ChatMessage[] = []
): Promise<string> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('API key is not configured. Please add it in Settings.');
  }

  const model = 'gemini-2.5-flash'; // As specified in the implementation plan
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = [
    ...history,
    {
      role: 'user',
      parts: [{ text: message }]
    }
  ];

  const systemInstruction = {
    parts: [
      {
        text: `You are RationTracker AI, a helpful kitchen assistant. 
Your goal is to help users manage their pantry, suggest recipes based on their ingredients, and help them cook.
Be friendly, concise, and creative with leftovers. 
If the user wants to add/save a recipe, suggest the recipe steps and list ingredients clearly. 
You do not need to output JSON in standard chat unless specifically asked. Just use nice markdown formatting.`
      }
    ]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents,
      systemInstruction,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData?.error?.message || response.statusText;
    throw new Error(`Gemini API Error: ${errorMessage}`);
  }

  const data = await response.json();
  const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textResponse) {
    throw new Error('Empty response received from Gemini.');
  }

  return textResponse;
}

export interface ParsedRecipe {
  name: string;
  servings: number;
  instructions: string;
  ingredients: {
    name: string;
    amount: number;
    unit: 'g' | 'ml' | 'count';
  }[];
}

export async function parseRecipeWithGemini(userDescription: string): Promise<ParsedRecipe> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('API key is not configured. Please add it in Settings.');
  }

  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `Parse the following text and extract a recipe, servings, instructions, and ingredients.
Convert ingredients into their corresponding units: 'g' for dry weight, 'ml' for liquids, 'count' for discrete units (like eggs, bread slices, whole vegetables).
Be precise with the ingredient names (e.g. use standard names like "Rice", "Sugar", "Milk").

Recipe description to parse:
"""
${userDescription}
"""`;

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      name: { type: 'STRING', description: 'Name of the recipe' },
      servings: { type: 'INTEGER', description: 'Number of servings this recipe makes' },
      instructions: { type: 'STRING', description: 'Detailed, step-by-step cooking instructions, separated by newlines' },
      ingredients: {
        type: 'ARRAY',
        description: 'List of ingredients required for the recipe',
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: 'Simple name of the pantry item, e.g. Rice, Flour, Milk, Egg' },
            amount: { type: 'NUMBER', description: 'Amount required for the servings specified' },
            unit: { type: 'STRING', enum: ['g', 'ml', 'count'], description: 'The unit of measurement' }
          },
          required: ['name', 'amount', 'unit']
        }
      }
    },
    required: ['name', 'servings', 'instructions', 'ingredients']
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
      }
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData?.error?.message || response.statusText;
    throw new Error(`Gemini API Error: ${errorMessage}`);
  }

  const data = await response.json();
  const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textResponse) {
    throw new Error('Empty response received from Gemini during parsing.');
  }

  try {
    return JSON.parse(textResponse) as ParsedRecipe;
  } catch (parseError) {
    console.error('Failed to parse Gemini output as JSON:', textResponse);
    throw new Error('Failed to parse structured recipe from AI response.');
  }
}

export async function parseRecipeFromUrl(url: string): Promise<ParsedRecipe> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('API key is not configured. Please add it in Settings.');
  }

  const model = 'gemini-2.5-flash';
  const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `A user has provided this cooking video link: "${url}".
Please extract, transcribing if possible, or construct the recipe represented in this video. 
Identify the likely dish name, servings, step-by-step instructions, and ingredients.
Convert ingredients into their corresponding units: 'g' for dry weight, 'ml' for liquids, 'count' for discrete units (like eggs, bread slices, whole vegetables).
Be precise with the ingredient names (e.g. use standard names like "Rice", "Sugar", "Milk").

If you cannot read the URL contents directly, generate a highly authentic, traditional recipe for the dish inferred from the URL path or domain name.`;

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      name: { type: 'STRING', description: 'Name of the recipe' },
      servings: { type: 'INTEGER', description: 'Number of servings this recipe makes' },
      instructions: { type: 'STRING', description: 'Detailed, step-by-step cooking instructions, separated by newlines' },
      ingredients: {
        type: 'ARRAY',
        description: 'List of ingredients required for the recipe',
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: 'Simple name of the pantry item, e.g. Rice, Flour, Milk, Egg' },
            amount: { type: 'NUMBER', description: 'Amount required for the servings specified' },
            unit: { type: 'STRING', enum: ['g', 'ml', 'count'], description: 'The unit of measurement' }
          },
          required: ['name', 'amount', 'unit']
        }
      }
    },
    required: ['name', 'servings', 'instructions', 'ingredients']
  };

  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
      }
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData?.error?.message || response.statusText;
    throw new Error(`Gemini API Error: ${errorMessage}`);
  }

  const data = await response.json();
  const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textResponse) {
    throw new Error('Empty response received from Gemini during URL parsing.');
  }

  try {
    return JSON.parse(textResponse) as ParsedRecipe;
  } catch (parseError) {
    console.error('Failed to parse Gemini output as JSON:', textResponse);
    throw new Error('Failed to parse structured recipe from AI response.');
  }
}

