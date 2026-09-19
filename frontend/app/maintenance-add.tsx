import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";
import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api";

const SUGGESTIONS = ["Oil change", "Chain lube", "Brake pads", "Air filter", "Tire replacement", "Coolant", "Battery", "Spark plug"];

export default function MaintenanceAdd() {
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ type?: string; odo?: string }>();

  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState(params.type || "");
  const [date, setDate] = useState(today);
  const [odo, setOdo] = useState(params.odo || "");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!type.trim() || !date.trim()) { setErr("Type and date required"); return; }
    setBusy(true);
    try {
      await api("/maintenance", {
        method: "POST",
        body: JSON.stringify({
          service_type: type.trim(), date,
          odometer: parseInt(odo || "0", 10) || 0,
          cost: parseFloat(cost || "0") || 0,
          notes: notes.trim() || null,
        }),
      });
      qc.invalidateQueries({ queryKey: ["maintenance"] });
      qc.invalidateQueries({ queryKey: ["reminders"] });
      router.back();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="add-back" onPress={() => router.back()} style={styles.back}>
          <Icon name="close" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Add service</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Service type</Text>
        <TextInput testID="add-type" style={styles.input} value={type} onChangeText={setType} placeholder="e.g. Oil change" placeholderTextColor={colors.muted} />

        <View style={styles.suggestions}>
          {SUGGESTIONS.map((s) => (
            <Pressable key={s} testID={`add-suggest-${s}`} onPress={() => setType(s)} style={[styles.suggChip, type === s && styles.suggChipActive]}>
              <Text style={[styles.suggText, type === s && { color: colors.onBrandPrimary }]}>{s}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Date</Text>
        <TextInput testID="add-date" style={styles.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} />

        <Text style={styles.label}>Odometer (km)</Text>
        <TextInput testID="add-odo" style={styles.input} value={odo} onChangeText={setOdo} keyboardType="number-pad" placeholder="15000" placeholderTextColor={colors.muted} />

        <Text style={styles.label}>Cost (optional)</Text>
        <TextInput testID="add-cost" style={styles.input} value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.muted} />

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput testID="add-notes" style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]} value={notes} onChangeText={setNotes} multiline placeholder="Any details you want to remember" placeholderTextColor={colors.muted} />

        {err ? <Text style={styles.err}>{err}</Text> : null}

        <Pressable testID="add-save" onPress={submit} disabled={busy} style={[styles.cta, busy && { opacity: 0.6 }]}>
          {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Save</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) => ({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: c.onSurface },
  label: { fontSize: 13, color: c.onSurfaceSecondary, marginTop: 14, marginBottom: 6, fontWeight: "600" },
  input: { backgroundColor: c.surfaceTertiary, color: c.onSurface, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, fontSize: 16, borderWidth: 1, borderColor: c.border },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  suggChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border },
  suggChipActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  suggText: { fontSize: 13, color: c.onSurfaceSecondary, fontWeight: "600" },
  err: { color: c.error, marginTop: 12 },
  cta: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 24 },
  ctaText: { color: c.onBrandPrimary, fontSize: 16, fontWeight: "700" },
}));
