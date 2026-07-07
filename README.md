# RationTracker 🌾🏺

RationTracker is a clean, minimal, and privacy-first visual pantry inventory and recipe manager for Android. It is designed to help you visually track food stock levels, predict restock timelines based on your real-world consumption patterns, dynamically scale ingredient lists when cooking, and extract recipes directly from cooking videos using Gemini 2.5 Flash.

---

## ✨ Features

### 🏺 Visual Pantry Inventory
* **Animated Containers:** Interactive visual indicators representing Jars, Bottles, and Bags that dynamically fill based on real-time quantities.
* **Smart Adjustments:** Log restocks and consumption events easily with a complete local historical log.
* **Palette Choices:** Personalize your containers with custom color tags.

### 📉 Predictive Alerts & Consumption Logs
* **Real Usage Analytics:** The app tracks your consumption rates over a 14-day rolling average to estimate average daily usage ($R_{\text{daily}}$).
* **Predictive Restock Dates:** Instead of generic percentage warnings, the app alerts you exactly how many days of supply remain (e.g., "3 days left") based on your active consumption habits.

### ⚖️ Dynamic Recipe Scaling
* **Count-Based Scaling (e.g., Roti):** Set a base amount (e.g., 1 roti = 35g Atta) and input how many you're cooking. The app calculates totals (e.g., 16 rotis = 560g Atta) and deducts them.
* **Volume-Based Scaling (e.g., Curry):** Set a base volume (e.g., 100ml curry) and enter your target (e.g., 250ml). All ingredients scale proportionally automatically.
* **Servings-Based Scaling:** Standard proportional scaling for traditional meal prep.

### 🍱 Combined Meal Templates
* Group multiple recipes into a single meal template (e.g., "Roti + Aloo Matar Lunch").
* Scale and cook all recipes inside the meal template at once. The app runs a single transaction check to ensure total aggregated ingredient stock is sufficient before committing deductions.

### 🤖 Gemini AI Chef & Video URL Extractor
* **Pantry-Aware Chef:** Ask for recipe suggestions using only what is currently available in your pantry.
* **URL Recipe Extraction:** Paste YouTube or Instagram cooking video links to parse recipes and map ingredients to your physical pantry items.

### 🎨 Customizable Theme Accent
* Choose from 7 custom brand accent colors (Coral Red, Mint Teal, Emerald Green, Royal Blue, Amber Orange, Violet Purple, Hot Rose) to change the UI look instantly from the settings tab.
* Fully compatible with system Light and Dark modes.

---

## 🔒 Security & Offline First
* **Local Database:** Powered by SQLite with Write-Ahead Logging (WAL) enabled for reliable and fast offline-first storage.
* **Secure Credentials:** Your Gemini API keys are encrypted and stored locally in the hardware enclave using Expo SecureStore.

---

## 🛠️ Technology Stack
* **Framework:** React Native / Expo (SDK 54)
* **Language:** TypeScript
* **Database:** `expo-sqlite`
* **Icons & Vector:** `lucide-react-native`, `react-native-svg`
* **Layouts:** `react-native-safe-area-context` for Android/iOS status bar offsets.

---

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v18+)
* [Git](https://git-scm.com/)

### Installation
1. Clone this repository:
   ```bash
   git clone https://github.com/aniketshaw748/RationTracker.git
   cd RationTracker
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally
To launch the project in development mode:
```bash
npx expo start
```
Scan the QR code in your terminal with your Expo Go app (v54 compatible) on Android to run the app.

---

## 📦 Building & Shipping

This project is configured for **EAS (Expo Application Services)** to compile binary builds.

### 1. Compile APK in the Cloud (Free)
Run this command to build an installable `.apk` file using Expo's cloud builders:
```bash
eas build --platform android --profile preview
```

### 2. Compile APK Locally
If you have Java JDK and Android SDK installed locally, build offline:
1. Generate native folders:
   ```bash
   npx expo prebuild --platform android --no-install
   ```
2. Compile release APK:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
The output APK will be generated at:
`android/app/build/outputs/apk/release/app-release.apk`

---

## 📝 License
This project is licensed under the MIT License - see the [LICENSE](file:///c:/Coding/RationTracker/LICENSE) file for details.
