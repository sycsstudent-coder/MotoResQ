import { Tabs } from "expo-router";
import { useEffect } from "react";
import Icon from "@react-native-vector-icons/material-design-icons";
import { useTheme } from "@/src/theme";
import { prefetchOfflineContent } from "@/src/offline";

export default function TabsLayout() {
  const { colors } = useTheme();
  // Warm the on-device cache so guides & diagnostics open with zero signal.
  useEffect(() => { prefetchOfflineContent(); }, []);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
        },
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Icon name="home-variant" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="diagnose"
        options={{
          title: "Diagnose",
          tabBarIcon: ({ color, size }) => <Icon name="stethoscope" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="guides"
        options={{
          title: "Guides",
          tabBarIcon: ({ color, size }) => <Icon name="wrench" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, size }) => <Icon name="dots-horizontal-circle-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
