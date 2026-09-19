import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";
import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api";

interface Guide {
  id: string; title: string; category: string; time: string; difficulty: string;
  tools: string[]; warnings: string[]; steps: string[];
}

export default function GuideDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const { data: g, isLoading, error } = useQuery<Guide>({
    queryKey: ["guide", id],
    queryFn: () => api(`/guides/${id}`),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="guide-back" onPress={() => router.back()} style={styles.back}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{g?.title || "Guide"}</Text>
        <View style={{ width: 44 }} />
      </View>

      {isLoading && <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 24 }} />}
      {error ? <Text style={styles.err}>{(error as Error).message}</Text> : null}

      {g && (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }} testID="guide-detail">
          <View style={styles.meta}>
            <Chip icon="tag-outline" label={g.category} />
            <Chip icon="clock-outline" label={g.time} />
            <Chip icon="signal-cellular-2" label={g.difficulty} />
          </View>

          {g.warnings?.length ? (
            <View style={styles.warnings}>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center", marginBottom: 6 }}>
                <Icon name="alert" size={18} color={colors.error} />
                <Text style={styles.warnTitle}>Safety warnings</Text>
              </View>
              {g.warnings.map((w, i) => (
                <Text key={i} style={styles.warnText}>• {w}</Text>
              ))}
            </View>
          ) : null}

          <Text style={styles.section}>Tools needed</Text>
          <View style={styles.toolWrap}>
            {g.tools.map((t, i) => (
              <View key={i} style={styles.toolChip}>
                <Icon name="tools" size={14} color={colors.onSurfaceSecondary} />
                <Text style={styles.toolText}>{t}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.section}>Steps</Text>
          {g.steps.map((s, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
              <Text style={styles.stepText}>{s}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Chip({ icon, label }: { icon: string; label: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.chip}>
      <Icon name={icon as any} size={14} color={colors.muted} />
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: c.onSurface },
  err: { color: c.error, textAlign: "center", padding: 12 },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: { flexDirection: "row", gap: 4, alignItems: "center", backgroundColor: c.surfaceTertiary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  chipText: { fontSize: 12, color: c.onSurfaceSecondary, fontWeight: "600" },
  warnings: { backgroundColor: c.error + "1A", padding: 14, borderRadius: 12, marginTop: 4, marginBottom: 8, borderWidth: 1, borderColor: c.error + "66" },
  warnTitle: { color: c.error, fontWeight: "700", fontSize: 14 },
  warnText: { color: c.error, fontSize: 13, lineHeight: 20, marginTop: 2 },
  section: { fontSize: 16, fontWeight: "700", color: c.onSurface, marginTop: 18, marginBottom: 10 },
  toolWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toolChip: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: c.surfaceSecondary, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: c.border },
  toolText: { fontSize: 13, color: c.onSurfaceSecondary },
  stepRow: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 12, backgroundColor: c.surfaceSecondary, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: c.border },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  stepNumText: { color: c.onBrandPrimary, fontSize: 13, fontWeight: "800" },
  stepText: { flex: 1, fontSize: 15, color: c.onSurface, lineHeight: 22 },
}));
