import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import Icon from "@react-native-vector-icons/material-design-icons";
import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api";

interface QOption { v: string; l: string }
interface Question { id: string; q: string; options: QOption[] }
interface Category { title: string; questions: Question[] }
interface Result { cause: string; severity: string; guide_id: string | null }

const SEVERITY_COLOR: Record<string, { bg: string; label: string }> = {
  low: { bg: "#DCFCE7", label: "Low" },
  medium: { bg: "#FEF3C7", label: "Medium" },
  high: { bg: "#FEE2E2", label: "High" },
};

export default function DiagnosticFlow() {
  const params = useLocalSearchParams<{ category: string }>();
  const category = params.category as string;
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [cat, setCat] = useState<Category | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api<Category>(`/diagnostic/${category}`);
        setCat(data);
      } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
    })();
  }, [category]);

  const pick = async (qid: string, v: string) => {
    const next = { ...answers, [qid]: v };
    setAnswers(next);
    if (!cat) return;
    if (idx + 1 < cat.questions.length) {
      setIdx(idx + 1);
    } else {
      setLoading(true);
      try {
        const r = await api<{ results: Result[] }>("/diagnostic/analyze", {
          method: "POST", body: JSON.stringify({ category, answers: next }),
        });
        setResults(r.results);
      } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
    }
  };

  const restart = () => { setIdx(0); setAnswers({}); setResults(null); };

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.brandPrimary} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="diag-back" onPress={() => router.back()} style={styles.back}>
          <Icon name="close" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{cat?.title || "Diagnose"}</Text>
        <View style={{ width: 44 }} />
      </View>

      {err ? <Text style={styles.err}>{err}</Text> : null}

      {!results && cat && (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
          <View style={styles.progress}>
            <View style={[styles.progressFill, { width: `${((idx + 1) / cat.questions.length) * 100}%` }]} />
          </View>
          <Text style={styles.step}>Question {idx + 1} of {cat.questions.length}</Text>
          <Text style={styles.question} testID="diag-question">{cat.questions[idx].q}</Text>

          <View style={{ gap: 12, marginTop: 8 }}>
            {cat.questions[idx].options.map((o) => (
              <Pressable
                key={o.v}
                testID={`diag-option-${cat.questions[idx].id}-${o.v}`}
                onPress={() => pick(cat.questions[idx].id, o.v)}
                style={styles.option}
              >
                <Text style={styles.optionText}>{o.l}</Text>
                <Icon name="chevron-right" size={22} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      {results && (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }} testID="diag-results">
          <Text style={styles.step}>Likely cause{results.length > 1 ? "s" : ""}</Text>
          {results.map((r, i) => {
            const sev = SEVERITY_COLOR[r.severity] || SEVERITY_COLOR.low;
            return (
              <View key={i} style={styles.resultCard}>
                <View style={[styles.severity, { backgroundColor: sev.bg }]}>
                  <Text style={styles.severityText}>{sev.label} severity</Text>
                </View>
                <Text style={styles.resultCause}>{r.cause}</Text>
                {r.guide_id ? (
                  <Pressable
                    testID={`diag-open-guide-${r.guide_id}`}
                    onPress={() => router.replace(`/guide/${r.guide_id}`)}
                    style={styles.cta}
                  >
                    <Icon name="wrench" size={18} color={colors.onBrandPrimary} />
                    <Text style={styles.ctaText}>Open repair guide</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
          <Pressable testID="diag-restart" onPress={restart} style={styles.ghost}>
            <Text style={styles.ghostText}>Restart diagnosis</Text>
          </Pressable>
          <Pressable testID="diag-ask-ai" onPress={() => router.replace("/ai-chat")} style={[styles.ghost, { marginTop: 8 }]}>
            <Text style={styles.ghostText}>Ask AI for more help</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: c.onSurface },
  progress: { height: 6, backgroundColor: c.surfaceTertiary, borderRadius: 3, marginTop: 20, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: c.brandPrimary, borderRadius: 3 },
  step: { fontSize: 12, color: c.muted, marginTop: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  question: { fontSize: 22, fontWeight: "700", color: c.onSurface, marginTop: 12, marginBottom: 20, lineHeight: 30 },
  option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: c.surfaceSecondary, padding: 18, borderRadius: 14, borderWidth: 1, borderColor: c.border, minHeight: 60 },
  optionText: { flex: 1, fontSize: 16, color: c.onSurface, fontWeight: "600" },
  err: { color: c.error, textAlign: "center", padding: 12 },
  resultCard: { backgroundColor: c.surfaceSecondary, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: c.border, marginTop: 12 },
  severity: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginBottom: 8 },
  severityText: { fontSize: 12, fontWeight: "700", color: c.onSurface },
  resultCause: { fontSize: 16, fontWeight: "600", color: c.onSurface, lineHeight: 22 },
  cta: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: c.brandPrimary, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginTop: 12 },
  ctaText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 15 },
  ghost: { paddingVertical: 14, alignItems: "center", marginTop: 20, backgroundColor: c.surfaceTertiary, borderRadius: 12 },
  ghostText: { color: c.onSurface, fontSize: 15, fontWeight: "600" },
}));
