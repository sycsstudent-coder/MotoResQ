import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth-context";

export default function Login() {
  const { signIn } = useAuth();
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null); setBusy(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setErr(e.message || "Login failed");
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <View style={styles.logoBadge}>
            <Icon name="motorbike" size={44} color={colors.onBrand} />
          </View>
          <Text style={styles.brand} testID="app-title">MotoResQ</Text>
          <Text style={styles.tag}>Your roadside co-pilot</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            testID="login-email-input"
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            value={email}
            onChangeText={setEmail}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            testID="login-password-input"
            style={styles.input}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={colors.muted}
            value={password}
            onChangeText={setPassword}
          />

          {err ? <Text testID="login-error" style={styles.err}>{err}</Text> : null}

          <Pressable testID="login-submit-button" onPress={submit} disabled={busy} style={[styles.cta, busy && { opacity: 0.6 }]}>
            {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Sign in</Text>}
          </Pressable>

          <Pressable testID="go-to-signup" onPress={() => router.push("/signup")} style={styles.linkWrap}>
            <Text style={styles.linkText}>Don&apos;t have an account? <Text style={styles.linkStrong}>Create one</Text></Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) => ({
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  logoWrap: { alignItems: "center", marginBottom: 32 },
  logoBadge: { width: 84, height: 84, borderRadius: 20, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  brand: { fontSize: 32, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  tag: { fontSize: 14, color: c.muted, marginTop: 4 },
  form: { gap: 6 },
  title: { fontSize: 24, fontWeight: "700", color: c.onSurface },
  subtitle: { fontSize: 14, color: c.muted, marginBottom: 16 },
  label: { fontSize: 13, color: c.onSurfaceSecondary, marginTop: 12, marginBottom: 6, fontWeight: "600" },
  input: { backgroundColor: c.surfaceTertiary, color: c.onSurface, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, fontSize: 16, borderWidth: 1, borderColor: c.border },
  err: { color: c.error, marginTop: 12, fontSize: 13 },
  cta: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 24 },
  ctaText: { color: c.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  linkWrap: { marginTop: 20, alignItems: "center" },
  linkText: { color: c.muted, fontSize: 14 },
  linkStrong: { color: c.brandPrimary, fontWeight: "700" },
}));
