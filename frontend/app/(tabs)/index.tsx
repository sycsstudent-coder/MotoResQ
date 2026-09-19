import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";
import { useState, useCallback } from "react";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth-context";
import { api, fileUrl, RemindersResponse } from "@/src/api";

const HERO = "https://images.unsplash.com/photo-1607091083645-31f4e28dc9af?crop=entropy&cs=srgb&fm=jpg&w=940&q=85";

export default function Home() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token, refresh } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const reminders = useQuery<RemindersResponse>({ queryKey: ["reminders"], queryFn: () => api("/reminders"), enabled: !!user });

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await Promise.all([refresh(), reminders.refetch()]); setRefreshing(false);
  }, [refresh, reminders]);

  const moto = user?.motorcycle;
  const photoUri = user?.bike_photo && token ? fileUrl(user.bike_photo, token) : null;
  const summary = reminders.data?.summary;
  const remStatus = !summary ? null
    : summary.overdue > 0 ? { color: colors.error, icon: "alert-circle", text: `${summary.overdue} service${summary.overdue > 1 ? "s" : ""} overdue` }
    : summary.due_soon > 0 ? { color: colors.warning, icon: "clock-alert-outline", text: `${summary.due_soon} service${summary.due_soon > 1 ? "s" : ""} due soon` }
    : summary.tracked === 0 ? { color: colors.info, icon: "calendar-plus", text: "Start tracking service intervals" }
    : { color: colors.success, icon: "check-circle-outline", text: "All services on schedule" };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24, paddingHorizontal: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      testID="home-screen"
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Hi{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</Text>
          <Text style={styles.brand}>MotoResQ</Text>
        </View>
        <View style={styles.onlineBadge}>
          <View style={styles.onlineDot} />
          <Text style={styles.onlineText}>Online</Text>
        </View>
      </View>

      {/* Motorcycle card */}
      <Pressable testID="moto-card" onPress={() => router.push("/motorcycle-setup")} style={styles.motoCard}>
        <Image source={{ uri: photoUri || HERO }} style={[styles.motoImage, photoUri && { opacity: 1 }]} contentFit="cover" transition={200} />
        <View style={styles.motoOverlay}>
          {moto ? (
            <>
              <Text style={styles.motoNick}>{moto.nickname || `${moto.make} ${moto.model}`}</Text>
              <Text style={styles.motoSub}>{moto.year} • {moto.odometer.toLocaleString()} km</Text>
            </>
          ) : (
            <>
              <Text style={styles.motoNick}>Add your motorcycle</Text>
              <Text style={styles.motoSub}>Tap to set up your bike profile</Text>
            </>
          )}
        </View>
      </Pressable>

      {/* Emergency SOS */}
      <Pressable testID="home-sos" onPress={() => router.push("/sos")} style={styles.sos}>
        <View style={styles.sosIcon}><Icon name="alert-octagon" size={26} color={colors.onError} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sosTitle}>Emergency SOS</Text>
          <Text style={styles.sosSub}>Call a tow, roadside help, or share your location</Text>
        </View>
        <Icon name="chevron-right" size={24} color={colors.error} />
      </Pressable>

      {/* Service reminders */}
      {remStatus && (
        <Pressable testID="home-reminders" onPress={() => router.push("/reminders")} style={styles.remCard}>
          <Icon name={remStatus.icon as any} size={24} color={remStatus.color} />
          <View style={{ flex: 1 }}>
            <Text style={styles.remTitle}>Service reminders</Text>
            <Text style={[styles.remSub, { color: remStatus.color }]}>{remStatus.text}</Text>
          </View>
          <Icon name="chevron-right" size={22} color={colors.muted} />
        </Pressable>
      )}

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Quick actions</Text>
      <View style={styles.grid}>
        <QuickTile testID="qa-diagnose" icon="stethoscope" color={colors.brandPrimary} label="Diagnose" onPress={() => router.push("/(tabs)/diagnose")} />
        <QuickTile testID="qa-guides" icon="wrench" color={colors.info} label="Repair Guides" onPress={() => router.push("/(tabs)/guides")} />
        <QuickTile testID="qa-log" icon="clipboard-text-clock-outline" color={colors.success} label="Maintenance" onPress={() => router.push("/maintenance")} />
        <QuickTile testID="qa-chat" icon="robot-happy-outline" color={colors.brandSecondary} label="AI Chat" onPress={() => router.push("/ai-chat")} />
      </View>

      <View style={styles.tip}>
        <Icon name="lightbulb-on-outline" size={22} color={colors.brandPrimary} />
        <Text style={styles.tipText}>Tap Diagnose to walk through a symptom-based Q&amp;A. Guides work fully offline.</Text>
      </View>
    </ScrollView>
  );
}

function QuickTile({ icon, label, onPress, color, testID }: { icon: string; label: string; onPress: () => void; color: string; testID: string }) {
  const styles = useStyles();
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.tile}>
      <View style={[styles.tileIconWrap, { backgroundColor: color + "22" }]}>
        <Icon name={icon as any} size={26} color={color} />
      </View>
      <Text style={styles.tileLabel}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20, marginTop: 8 },
  hello: { fontSize: 14, color: c.muted },
  brand: { fontSize: 28, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  onlineBadge: { flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceSecondary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: c.border },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.success, marginRight: 6 },
  onlineText: { fontSize: 12, color: c.onSurfaceSecondary, fontWeight: "600" },

  motoCard: { borderRadius: 20, overflow: "hidden", backgroundColor: c.surfaceInverse, height: 170, marginBottom: 16 },
  motoImage: { width: "100%", height: "100%", position: "absolute", opacity: 0.7 },
  motoOverlay: { flex: 1, padding: 20, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  motoNick: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  motoSub: { color: "#F3F4F6", fontSize: 13, marginTop: 4 },

  sos: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surfaceSecondary, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: c.error, marginBottom: 12, minHeight: 72 },
  sosIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: c.error, alignItems: "center", justifyContent: "center" },
  sosTitle: { fontSize: 16, fontWeight: "800", color: c.error },
  sosSub: { fontSize: 12, color: c.muted, marginTop: 2 },

  remCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surfaceSecondary, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: c.border, marginBottom: 24, minHeight: 64 },
  remTitle: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  remSub: { fontSize: 13, fontWeight: "600", marginTop: 2 },

  sectionTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 12 },
  tile: { width: "48%", backgroundColor: c.surfaceSecondary, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: c.border, minHeight: 100 },
  tileIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  tileLabel: { fontSize: 15, fontWeight: "700", color: c.onSurface },

  tip: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: c.brandTertiary, padding: 14, borderRadius: 12, marginTop: 20 },
  tipText: { flex: 1, color: c.onBrandTertiary, fontSize: 13, lineHeight: 18 },
}));
