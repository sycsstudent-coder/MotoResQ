import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";
import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api";

interface Entry {
  id: string; service_type: string; date: string; odometer: number; cost: number; notes?: string | null; created_at: string;
}

export default function Maintenance() {
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<Entry[]>({ queryKey: ["maintenance"], queryFn: () => api("/maintenance") });

  const remove = async (id: string) => {
    await api(`/maintenance/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["maintenance"] });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="maint-back" onPress={() => router.back()} style={styles.back}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Maintenance log</Text>
        <View style={{ width: 44 }} />
      </View>

      {isLoading && <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 24 }} />}

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 96 }}>
        {data && data.length === 0 && (
          <View style={styles.empty}>
            <Icon name="clipboard-text-clock-outline" size={44} color={colors.muted} />
            <Text style={styles.emptyTitle}>No services logged yet</Text>
            <Text style={styles.emptySub}>Tap Add service to record your first entry.</Text>
          </View>
        )}
        {data?.map((e) => (
          <View key={e.id} style={styles.card} testID={`maint-item-${e.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{e.service_type}</Text>
              <Text style={styles.cardSub}>{e.date} • {e.odometer.toLocaleString()} km</Text>
              {e.notes ? <Text style={styles.notes}>{e.notes}</Text> : null}
            </View>
            <View style={{ alignItems: "flex-end", gap: 8 }}>
              {e.cost > 0 ? <Text style={styles.cost}>₹{e.cost.toFixed(0)}</Text> : null}
              <Pressable testID={`maint-delete-${e.id}`} onPress={() => remove(e.id)} style={styles.deleteBtn}>
                <Icon name="delete-outline" size={20} color={colors.error} />
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>

      <Pressable
        testID="maint-add"
        onPress={() => router.push("/maintenance-add")}
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
      >
        <Icon name="plus" size={22} color={colors.onBrandPrimary} />
        <Text style={styles.fabText}>Add service</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: c.onSurface },
  card: { flexDirection: "row", gap: 12, backgroundColor: c.surfaceSecondary, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: c.border, marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  cardSub: { fontSize: 13, color: c.muted, marginTop: 2 },
  notes: { fontSize: 13, color: c.onSurfaceSecondary, marginTop: 6 },
  cost: { fontSize: 15, fontWeight: "700", color: c.brandPrimary },
  deleteBtn: { padding: 6 },
  empty: { alignItems: "center", padding: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface, marginTop: 8 },
  emptySub: { fontSize: 13, color: c.muted, textAlign: "center" },
  fab: { position: "absolute", right: 20, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.brandPrimary, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 999, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  fabText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 15 },
}));
