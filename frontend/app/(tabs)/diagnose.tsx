import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api";

interface Category { id: string; title: string }
const ICONS: Record<string, string> = {
  wont_start: "engine-off-outline",
  overheating: "thermometer-alert",
  brakes: "car-brake-alert",
  flat_tire: "tire",
  chain: "cog-outline",
  electrical: "flash-alert-outline",
};

export default function Diagnose() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, isLoading, error } = useQuery<Category[]>({
    queryKey: ["diag-categories"],
    queryFn: () => api<Category[]>("/diagnostic/categories"),
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 24 }}
      testID="diagnose-screen"
    >
      <Text style={styles.title}>What&apos;s wrong?</Text>
      <Text style={styles.subtitle}>Pick a symptom category to start the diagnosis</Text>

      {isLoading && <ActivityIndicator style={{ marginTop: 24 }} color={colors.brandPrimary} />}
      {error ? <Text style={styles.err}>{(error as Error).message}</Text> : null}

      <View style={{ gap: 12, marginTop: 20 }}>
        {data?.map((c) => (
          <Pressable
            key={c.id}
            testID={`diag-cat-${c.id}`}
            onPress={() => router.push(`/diagnostic-flow?category=${c.id}`)}
            style={styles.row}
          >
            <View style={styles.iconWrap}>
              <Icon name={(ICONS[c.id] || "help-circle-outline") as any} size={26} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{c.title}</Text>
              <Text style={styles.rowSub}>Start guided questionnaire</Text>
            </View>
            <Icon name="chevron-right" size={24} color={colors.muted} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface, marginTop: 8 },
  subtitle: { fontSize: 14, color: c.muted, marginTop: 6 },
  err: { color: c.error, marginTop: 12 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceSecondary, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: c.border, gap: 12, minHeight: 72 },
  iconWrap: { width: 46, height: 46, borderRadius: 12, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  rowSub: { fontSize: 12, color: c.muted, marginTop: 2 },
}));
