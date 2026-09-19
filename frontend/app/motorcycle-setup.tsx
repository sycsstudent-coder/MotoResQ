import { useState } from "react";
import { Text, TextInput, Pressable, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from "react-native";import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";

export default function MotorcycleSetup() {
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { refresh, user } = useAuth();

  const [make, setMake] = useState(user?.motorcycle?.make || "");
  const [model, setModel] = useState(user?.motorcycle?.model || "");
  const [year, setYear] = useState(user?.motorcycle?.year ? String(user.motorcycle.year) : "");
  const [odometer, setOdometer] = useState(user?.motorcycle?.odometer ? String(user.motorcycle.odometer) : "");
  const [nickname, setNickname] = useState(user?.motorcycle?.nickname || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    const y = parseInt(year, 10);
    const o = parseInt(odometer || "0", 10);
    if (!make.trim() || !model.trim() || !y) { setErr("Make, model, and year are required"); return; }
    setBusy(true);
    try {
      await api("/motorcycle", { method: "PUT", body: JSON.stringify({ make: make.trim(), model: model.trim(), year: y, odometer: o, nickname: nickname.trim() || null }) });
      await refresh();
      router.replace("/(tabs)");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Add your motorcycle</Text>
        <Text style={styles.subtitle}>We tailor diagnostics and AI advice to your bike</Text>

        <Text style={styles.label}>Nickname (optional)</Text>
        <TextInput testID="moto-nickname" style={styles.input} value={nickname} onChangeText={setNickname} placeholder="e.g. Betty" placeholderTextColor={colors.muted} />

        <Text style={styles.label}>Make</Text>
        <TextInput testID="moto-make" style={styles.input} value={make} onChangeText={setMake} placeholder="Honda" placeholderTextColor={colors.muted} />

        <Text style={styles.label}>Model</Text>
        <TextInput testID="moto-model" style={styles.input} value={model} onChangeText={setModel} placeholder="CB350" placeholderTextColor={colors.muted} />

        <Text style={styles.label}>Year</Text>
        <TextInput testID="moto-year" style={styles.input} keyboardType="number-pad" value={year} onChangeText={setYear} placeholder="2023" placeholderTextColor={colors.muted} />

        <Text style={styles.label}>Odometer (km)</Text>
        <TextInput testID="moto-odometer" style={styles.input} keyboardType="number-pad" value={odometer} onChangeText={setOdometer} placeholder="15000" placeholderTextColor={colors.muted} />

        {err ? <Text style={styles.err}>{err}</Text> : null}

        <Pressable testID="moto-save" onPress={submit} disabled={busy} style={[styles.cta, busy && { opacity: 0.6 }]}>
          {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Save motorcycle</Text>}
        </Pressable>

        <Pressable testID="skip-moto" onPress={() => router.replace("/(tabs)")} style={styles.skip}>
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) => ({
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface },
  subtitle: { fontSize: 14, color: c.muted, marginTop: 6, marginBottom: 16 },
  label: { fontSize: 13, color: c.onSurfaceSecondary, marginTop: 12, marginBottom: 6, fontWeight: "600" },
  input: { backgroundColor: c.surfaceTertiary, color: c.onSurface, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, fontSize: 16, borderWidth: 1, borderColor: c.border },
  err: { color: c.error, marginTop: 12 },
  cta: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 24 },
  ctaText: { color: c.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  skip: { paddingVertical: 12, alignItems: "center", marginTop: 8 },
  skipText: { color: c.muted, fontSize: 14 },
}));
