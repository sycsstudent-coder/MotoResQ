import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import Icon from "@react-native-vector-icons/material-design-icons";
import { makeStyles, useTheme } from "@/src/theme";
import { cachedGet, Cached } from "@/src/offline";
import { OfflineBadge } from "@/src/components/offline-badge";
import { PermissionPrompt } from "@/src/components/permission-prompt";
import { useVoiceInput } from "@/src/use-voice-input";

interface Category { id: string; title: string }
const ICONS: Record<string, string> = {
  wont_start: "engine-off-outline",
  overheating: "thermometer-alert",
  brakes: "car-brake-alert",
  flat_tire: "tire",
  chain: "cog-outline",
  electrical: "flash-alert-outline",
};

const KEYWORDS: Record<string, string[]> = {
  wont_start: ["won't start", "wont start", "not start", "doesn't start", "does not start", "no start", "crank", "starter", "dead", "turn over", "ignition", "stall"],
  overheating: ["overheat", "too hot", "running hot", "temperature", "coolant", "steam", "boiling", "radiator", "fan"],
  brakes: ["brake", "stopping", "spongy", "squeal", "grind", "lever"],
  flat_tire: ["tire", "tyre", "flat", "puncture", "pressure", "nail", "wobble"],
  chain: ["chain", "sprocket", "slack", "drive", "clunk", "rattle"],
  electrical: ["light", "headlight", "indicator", "horn", "fuse", "electrical", "battery", "blinker", "wiring", "charging"],
};

function matchCategory(text: string): string | null {
  const s = text.toLowerCase();
  let best: string | null = null;
  let bestScore = 0;
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    const score = words.reduce((n, w) => n + (s.includes(w) ? 1 : 0), 0);
    if (score > bestScore) { best = cat; bestScore = score; }
  }
  return best;
}

export default function Diagnose() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: res, isLoading, error } = useQuery<Cached<Category[]>>({
    queryKey: ["diag-categories"],
    queryFn: () => cachedGet("/diagnostic/categories"),
    networkMode: "always",
  });
  const data = res?.data;

  const [symptom, setSymptom] = useState("");
  const [noMatch, setNoMatch] = useState<string | null>(null);

  const goWithText = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const cat = matchCategory(t);
    if (cat) { setNoMatch(null); setSymptom(""); router.push(`/diagnostic-flow?category=${cat}`); }
    else setNoMatch(t);
  };

  const voice = useVoiceInput((t) => { setSymptom(t); goWithText(t); });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
      testID="diagnose-screen"
    >
      <Text style={styles.title}>What&apos;s wrong?</Text>
      <Text style={styles.subtitle}>Describe it by voice, type it, or pick a category</Text>
      <OfflineBadge visible={!!res?.fromCache} />

      {/* Voice / text describe */}
      <View style={styles.voiceCard}>
        <Pressable
          testID="diag-mic"
          onPress={voice.toggle}
          disabled={voice.transcribing}
          style={[styles.micBtn, voice.isRecording && styles.micBtnActive]}
        >
          {voice.transcribing ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <Icon name={voice.isRecording ? "stop" : "microphone"} size={30} color={colors.onBrandPrimary} />
          )}
        </Pressable>
        <Text style={styles.voiceTitle}>
          {voice.isRecording ? `Listening… ${voice.durationSec}s` : voice.transcribing ? "Transcribing…" : "Describe the symptom"}
        </Text>
        <Text style={styles.voiceSub}>
          {voice.isRecording ? "Tap stop when you're done" : "e.g. “It clicks but won't crank” or “the brake lever feels spongy”"}
        </Text>
        <View style={styles.typeRow}>
          <TextInput
            testID="diag-symptom-input"
            style={styles.typeInput}
            value={symptom}
            onChangeText={(t) => { setSymptom(t); setNoMatch(null); }}
            placeholder="Or type it here…"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            onSubmitEditing={() => goWithText(symptom)}
          />
          <Pressable testID="diag-symptom-go" onPress={() => goWithText(symptom)} disabled={!symptom.trim()} style={[styles.goBtn, !symptom.trim() && { opacity: 0.4 }]}>
            <Icon name="arrow-right" size={20} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
        {voice.error ? <Text style={styles.err} testID="diag-voice-error">{voice.error}</Text> : null}
        {noMatch ? (
          <View style={styles.noMatch} testID="diag-no-match">
            <Text style={styles.noMatchText}>Couldn&apos;t match that to a category. Ask the AI mechanic instead?</Text>
            <Pressable testID="diag-ask-ai-prefill" onPress={() => router.push(`/ai-chat?prefill=${encodeURIComponent(noMatch)}`)} style={styles.askBtn}>
              <Icon name="robot-happy-outline" size={16} color={colors.brandPrimary} />
              <Text style={styles.askText}>Ask AI</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <Text style={styles.sectionLabel}>Or pick a category</Text>
      {isLoading && <ActivityIndicator style={{ marginTop: 24 }} color={colors.brandPrimary} />}
      {error ? <Text style={styles.err}>{(error as Error).message}</Text> : null}

      <View style={{ gap: 12, marginTop: 12 }}>
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

      <PermissionPrompt
        mode={voice.permMode}
        icon="microphone"
        title="Allow microphone"
        message="Say what your bike is doing and MotoResQ will jump straight to the right diagnosis."
        onAllow={voice.requestPermission}
        onDismiss={voice.dismissPermission}
      />
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface, marginTop: 8 },
  subtitle: { fontSize: 14, color: c.muted, marginTop: 6 },
  err: { color: c.error, marginTop: 12, fontSize: 13 },
  voiceCard: { alignItems: "center", backgroundColor: c.surfaceSecondary, borderRadius: 20, borderWidth: 1, borderColor: c.border, padding: 20, marginTop: 20 },
  micBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  micBtnActive: { backgroundColor: c.error },
  voiceTitle: { fontSize: 17, fontWeight: "700", color: c.onSurface, marginTop: 14 },
  voiceSub: { fontSize: 13, color: c.muted, textAlign: "center", marginTop: 4, lineHeight: 18 },
  typeRow: { flexDirection: "row", gap: 8, marginTop: 16, width: "100%" },
  typeInput: { flex: 1, backgroundColor: c.surfaceTertiary, color: c.onSurface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1, borderColor: c.border, minHeight: 46 },
  goBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  noMatch: { marginTop: 12, width: "100%", backgroundColor: c.brandTertiary, borderRadius: 12, padding: 12, gap: 8 },
  noMatchText: { fontSize: 13, color: c.onBrandTertiary, lineHeight: 18 },
  askBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 12, backgroundColor: c.surfaceSecondary, borderRadius: 999 },
  askText: { color: c.brandPrimary, fontWeight: "700", fontSize: 13 },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: c.muted, marginTop: 24, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceSecondary, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: c.border, gap: 12, minHeight: 72 },
  iconWrap: { width: 46, height: 46, borderRadius: 12, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  rowSub: { fontSize: 12, color: c.muted, marginTop: 2 },
}));
