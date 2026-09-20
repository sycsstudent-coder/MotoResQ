// Design tokens for this app. Black & red dark theme (default) plus a light variant; user can toggle in More.
//
// The keys match the "color" block of /app/design_guidelines.json. Fill the
// values from that file (or from the user's brand colors). Keep every key; do
// not add a second theme or colors file; do not write color literals in
// components.
//
// How the names work: a plain key is a background, and its `on` partner is the
// text or icon color that sits on top of it. Always use them as a pair.
//   <View style={{ backgroundColor: colors.brandPrimary }}>
//     <Text style={{ color: colors.onBrandPrimary }}>Continue</Text>
//   </View>
//
// Styling a screen or component: build the sheet with makeStyles so colors
// and layout live together and follow the active scheme:
//   const useStyles = makeStyles((colors) => ({
//     card: { backgroundColor: colors.surfaceSecondary, padding: 16 },
//     title: { color: colors.onSurfaceSecondary, fontSize: 16 },
//   }));
//   function Screen() {
//     const styles = useStyles();
//     return <View style={styles.card}><Text style={styles.title}>Hi</Text></View>;
//   }
// For color props that are not styles (icon color, placeholderTextColor,
// ActivityIndicator) read useTheme().colors inside the component.
// Never call StyleSheet.create with color values at module level; it cannot
// follow the scheme.
//
// To support dark mode later: add `dark` to `themes` with every key filled.
// Nothing else changes; the device setting takes over automatically.
// Feel free to add as many new colors as you need to support the design guidelines.

import { useMemo, useSyncExternalStore } from "react";
import { StyleSheet, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ColorScheme = "light" | "dark";
export type ThemePreference = ColorScheme | "system";

// Black & red — the app's signature look (default).
const dark = {
  surface: "#0B0B0D",
  onSurface: "#F5F5F5",
  surfaceSecondary: "#161618",
  onSurfaceSecondary: "#EDEDED",
  surfaceTertiary: "#202024",
  onSurfaceTertiary: "#E0E0E0",
  surfaceInverse: "#F5F5F5",
  onSurfaceInverse: "#0B0B0D",
  muted: "#9A9AA0",

  brand: "#E53935",
  onBrand: "#FFFFFF",
  brandPrimary: "#E53935",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#FF6659",
  onBrandSecondary: "#1A0000",
  brandTertiary: "#3A1214",
  onBrandTertiary: "#FFB4B0",

  success: "#4CAF50",
  onSuccess: "#FFFFFF",
  warning: "#FFB300",
  onWarning: "#1A1200",
  error: "#FF5252",
  onError: "#FFFFFF",
  info: "#B0B0B8",
  onInfo: "#0B0B0D",

  border: "#2A2A2F",
  borderStrong: "#3C3C42",
  divider: "#1E1E22",
};

// White & red — daylight variant.
const light: typeof dark = {
  surface: "#FAFAFA",
  onSurface: "#111111",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1A1A1A",
  surfaceTertiary: "#F0F0F2",
  onSurfaceTertiary: "#2A2A2A",
  surfaceInverse: "#111111",
  onSurfaceInverse: "#FAFAFA",
  muted: "#6B6B72",

  brand: "#D32F2F",
  onBrand: "#FFFFFF",
  brandPrimary: "#D32F2F",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#C62828",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#FDECEA",
  onBrandTertiary: "#8E1B1B",

  success: "#2E7D32",
  onSuccess: "#FFFFFF",
  warning: "#ED6C02",
  onWarning: "#FFFFFF",
  error: "#C62828",
  onError: "#FFFFFF",
  info: "#5F6368",
  onInfo: "#FFFFFF",

  border: "#E4E4E7",
  borderStrong: "#C9C9CF",
  divider: "#EFEFF2",
};

export type ThemeColors = typeof dark;

export const defaultScheme = "dark" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark: ThemeColors } = { light, dark };

// ---- Theme preference store (persisted) ----
const PREF_KEY = "motoresq_theme_pref";
let preference: ThemePreference = defaultScheme;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }

export function setThemePreference(pref: ThemePreference) {
  preference = pref;
  emit();
  AsyncStorage.setItem(PREF_KEY, pref).catch(() => {});
}

export async function loadThemePreference() {
  try {
    const v = await AsyncStorage.getItem(PREF_KEY);
    if (v === "light" || v === "dark" || v === "system") { preference = v; emit(); }
  } catch {}
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => preference,
    () => preference,
  );
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const pref = useThemePreference();
  const scheme: ColorScheme = pref === "system" ? (system === "light" ? "light" : "dark") : pref;
  return { scheme, colors: themes[scheme] };
}

// Themed StyleSheet: returns a hook that builds the sheet from the active
// scheme's colors and memoizes it until the scheme changes.
export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
