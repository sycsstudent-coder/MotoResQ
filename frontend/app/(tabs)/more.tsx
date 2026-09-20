import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { makeStyles, useTheme, useThemePreference, setThemePreference, ThemePreference } from "@/src/theme";
import { useAuth } from "@/src/auth-context";

const APPEARANCE: { id: ThemePreference; label: string; icon: string }[] = [
  { id: "dark", label: "Black & Red", icon: "weather-night" },
  { id: "light", label: "Light", icon: "white-balance-sunny" },
  { id: "system", label: "System", icon: "cellphone-cog" },
];

export default function More() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const pref = useThemePreference();

  const doSignOut = async () => { await signOut(); router.replace("/login"); };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 24 }}
      testID="more-screen"
    >
      <Text style={styles.title}>More</Text>

      <View style={styles.userCard}>
        <View style={styles.avatar}><Icon name="account" size={26} color={colors.onBrandPrimary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName}>{user?.name || "Rider"}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
        </View>
      </View>

      <Text style={styles.section}>Your bike</Text>
      <Row testID="menu-motorcycle" icon="motorbike" label="Motorcycle profile & photo" onPress={() => router.push("/motorcycle-setup")} />
      <Row testID="menu-maintenance" icon="clipboard-text-clock-outline" label="Maintenance log" onPress={() => router.push("/maintenance")} />
      <Row testID="menu-reminders" icon="bell-ring-outline" label="Service reminders" onPress={() => router.push("/reminders")} />

      <Text style={styles.section}>Help</Text>
      <Row testID="menu-sos" icon="alert-octagon-outline" label="Emergency SOS & contacts" onPress={() => router.push("/sos")} />
      <Row testID="menu-chat" icon="robot-happy-outline" label="AI Chat" onPress={() => router.push("/ai-chat")} />
      <Row testID="menu-chat-history" icon="history" label="Past conversations" onPress={() => router.push("/chat-history")} />

      <Text style={styles.section}>Appearance</Text>
      <View style={styles.segment} testID="appearance-toggle">
        {APPEARANCE.map((a) => {
          const active = pref === a.id;
          return (
            <Pressable key={a.id} testID={`appearance-${a.id}`} onPress={() => setThemePreference(a.id)} style={[styles.segItem, active && styles.segItemActive]}>
              <Icon name={a.icon as any} size={18} color={active ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
              <Text style={[styles.segText, active && { color: colors.onBrandPrimary }]}>{a.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.section}>Account</Text>
      <Row testID="menu-signout" icon="logout" label="Sign out" onPress={doSignOut} destructive />
    </ScrollView>
  );
}

function Row({ icon, label, onPress, destructive, testID }: { icon: string; label: string; onPress: () => void; destructive?: boolean; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.row}>
      <Icon name={icon as any} size={22} color={destructive ? colors.error : colors.onSurface} />
      <Text style={[styles.rowLabel, destructive && { color: colors.error }]}>{label}</Text>
      <Icon name="chevron-right" size={22} color={colors.muted} />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface, marginTop: 8, marginBottom: 16 },
  userCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surfaceSecondary, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: c.border, marginBottom: 20 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  userName: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  userEmail: { fontSize: 13, color: c.muted, marginTop: 2 },
  section: { fontSize: 12, fontWeight: "700", color: c.muted, marginTop: 20, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceSecondary, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: c.border, gap: 12, marginBottom: 8, minHeight: 56 },
  rowLabel: { flex: 1, fontSize: 15, color: c.onSurface, fontWeight: "600" },
  segment: { flexDirection: "row", gap: 8 },
  segItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, minHeight: 48 },
  segItemActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  segText: { fontSize: 12, fontWeight: "700", color: c.onSurfaceSecondary },
}));
