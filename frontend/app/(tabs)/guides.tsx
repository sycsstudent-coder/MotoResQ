import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import Icon from "@react-native-vector-icons/material-design-icons";
import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api";

interface Guide { id: string; title: string; category: string; time: string; difficulty: string }

export default function Guides() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery<Guide[]>({ queryKey: ["guides"], queryFn: () => api("/guides") });

  const filtered = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    if (!s) return data;
    return data.filter((g) => g.title.toLowerCase().includes(s) || g.category.toLowerCase().includes(s));
  }, [data, q]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="guides-screen">
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20 }}>
        <Text style={styles.title}>Repair Guides</Text>
        <Text style={styles.subtitle}>Works fully offline. Downloaded once.</Text>
        <View style={styles.searchWrap}>
          <Icon name="magnify" size={20} color={colors.muted} />
          <TextInput
            testID="guides-search"
            style={styles.search}
            value={q}
            onChangeText={setQ}
            placeholder="Search guides…"
            placeholderTextColor={colors.muted}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12, gap: 10 }}>
        {isLoading && <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 12 }} />}
        {filtered.map((g) => (
          <Pressable
            key={g.id}
            testID={`guide-${g.id}`}
            onPress={() => router.push(`/guide/${g.id}`)}
            style={styles.row}
          >
            <View style={styles.iconWrap}>
              <Icon name="wrench" size={22} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{g.title}</Text>
              <Text style={styles.rowSub}>{g.category} • {g.time} • {g.difficulty}</Text>
            </View>
            <Icon name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
        ))}
        {!isLoading && filtered.length === 0 && (
          <Text style={{ textAlign: "center", color: colors.muted, marginTop: 32 }}>No guides match your search.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface, marginTop: 8 },
  subtitle: { fontSize: 14, color: c.muted, marginTop: 6 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surfaceTertiary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12, borderWidth: 1, borderColor: c.border },
  search: { flex: 1, color: c.onSurface, fontSize: 15 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceSecondary, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: c.border, gap: 12, minHeight: 64 },
  iconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  rowSub: { fontSize: 12, color: c.muted, marginTop: 2 },
}));
