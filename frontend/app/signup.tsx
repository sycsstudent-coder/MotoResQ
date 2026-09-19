import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth-context";

export default function Signup() {
  const { signUp } = useAuth();
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null); setBusy(true);
    try {
      await signUp(email.trim().toLowerCase(), password, name.trim() || undefined);
      router.replace("/motorcycle-setup");
    } catch (e: any) {
      setErr(e.message || "Signup failed");
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <Pressable testID="back-to-login" onPress={() => router.back()} style={styles.back}>
          <Icon name="arrow-left" size={26} color={colors.onSurface} />
        </Pressable>

        <View style={{ marginTop: 8 }}>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Set up in seconds</Text>
        </View>

        <View style={{ marginTop: 24 }}>
          <Text style={styles.label}>Name (optional)</Text>
          <TextInput testID="signup-name-input" style={styles.input} placeholder="Alex Rider" placeholderTextColor={colors.muted} value={name} onChangeText={setName} />
          <Text style={styles.label}>Email</Text>
          <TextInput testID="signup-email-input" style={styles.input} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={colors.muted} value={email} onChangeText={setEmail} />
          <Text style={styles.label}>Password</Text>
          <TextInput testID="signup-password-input" style={styles.input} secureTextEntry placeholder="At least 6 characters" placeholderTextColor={colors.muted} value={password} onChangeText={setPassword} />

          {err ? <Text testID="signup-error" style={styles.err}>{err}</Text> : null}

          <Pressable testID="signup-submit-button" onPress={submit} disabled={busy} style={[styles.cta, busy && { opacity: 0.6 }]}>
            {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Create account</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) => ({
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  back: { width: 44, height: 44, alignItems: "flex-start", justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface },
  subtitle: { fontSize: 14, color: c.muted, marginTop: 6 },
  label: { fontSize: 13, color: c.onSurfaceSecondary, marginTop: 14, marginBottom: 6, fontWeight: "600" },
  input: { backgroundColor: c.surfaceTertiary, color: c.onSurface, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, fontSize: 16, borderWidth: 1, borderColor: c.border },
  err: { color: c.error, marginTop: 12, fontSize: 13 },
  cta: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 28 },
  ctaText: { color: c.onBrandPrimary, fontSize: 16, fontWeight: "700" },
}));
