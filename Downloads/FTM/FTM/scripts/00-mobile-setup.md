# Agent Script: Mobile App Setup

Run this alongside `00-backend-setup.md` before any feature scripts.
This sets up the React Native app that runs on your phone via Expo Go.

---

## TURN 1 — Frontend sets up the project

```
Act as Frontend Engineer.

Read: .claude/context/ARCHITECTURE.md, DESIGN_SYSTEM.md, ENGINEERING_RULES.md

Set up the NextStep prototype React Native app from scratch.

Stack:
- Expo (managed workflow) — runs on phone via Expo Go app, no build needed
- TypeScript strict
- NativeWind for styling (Tailwind in React Native)
- React Navigation v6 (Stack + Bottom Tabs)
- AsyncStorage for JWT token
- No Redux yet — useState and useEffect for prototype

Create the complete starting project:

1. Run command to create: npx create-expo-app nextstep-mobile --template blank-typescript
2. Additional packages to install:
   npx expo install nativewind tailwindcss
   npm install @react-navigation/native @react-navigation/bottom-tabs @react-navigation/stack
   npx expo install react-native-screens react-native-safe-area-context
   npm install @react-native-async-storage/async-storage

3. tailwind.config.js — NativeWind setup
4. babel.config.js — NativeWind babel plugin
5. src/constants/api.ts — API_BASE_URL = "http://YOUR_LOCAL_IP:3001"
   (note: Expo Go cannot use localhost — must use machine's local network IP)
6. src/utils/auth.ts — getToken(), setToken(), clearToken() using AsyncStorage
7. src/utils/api.ts — fetchWithAuth(url, options) — adds JWT header automatically
8. src/navigation/RootNavigator.tsx — placeholder with just a loading screen for now
9. App.tsx — wraps everything in NavigationContainer

TypeScript strict throughout. Include handoff block.
```

---

## TURN 2 — UI sets up the base theme

```
Act as UI Design System Engineer.

Read: .claude/context/DESIGN_SYSTEM.md, ENGINEERING_RULES.md

Set up the base design system for the NextStep prototype.

Mobile setup:
[PASTE TURN 1 OUTPUT HERE]

NextStep brand colors:
- Background: #0D1117
- Surface: #161B22
- Border: #30363D
- Primary teal: #00C896
- Text primary: #E6EDF3
- Text secondary: #8B949E

Deliver:
- src/constants/colors.ts — all brand colors as typed constants
- src/components/ui/Screen.tsx — SafeAreaView wrapper with dark background, standard padding
- src/components/ui/Text.tsx — typed text component with variants: heading, body, caption, label
- src/components/ui/Button.tsx — primary variant only for now (teal bg, dark text, loading state)
- src/components/ui/Input.tsx — dark bg, teal focus border, label above, error below
- src/components/ui/Card.tsx — surface bg, border, rounded corners, padding

These are the base components every feature screen will use.
All typed, no business logic. Include handoff block.
```
