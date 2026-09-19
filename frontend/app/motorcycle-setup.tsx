import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import Icon from "@react-native-vector-icons/material-design-icons";
import { makeStyles, useTheme } from "@/src/theme";
import { api, uploadFile, fileUrl } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { PermissionPrompt, PermissionMode } from "@/src/components/permission-prompt";

type PhotoSource = "camera" | "library";

export default function MotorcycleSetup() {
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { refresh, user, token } = useAuth();

  const [make, setMake] = useState(user?.motorcycle?.make || "");
  const [model, setModel] = useState(user?.motorcycle?.model || "");
  const [year, setYear] = useState(user?.motorcycle?.year ? String(user.motorcycle.year) : "");
  const [odometer, setOdometer] = useState(user?.motorcycle?.odometer ? String(user.motorcycle.odometer) : "");
  const [nickname, setNickname] = useState(user?.motorcycle?.nickname || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [perm, setPerm] = useState<{ mode: PermissionMode; source: PhotoSource } | null>(null);
  const photoUri = user?.bike_photo && token ? fileUrl(user.bike_photo, token) : null;

  const launchPicker = async (source: PhotoSource) => {
    setPhotoErr(null);
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7, allowsEditing: true, aspect: [16, 9] };
    const res = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setPhotoBusy(true);
    try {
      await uploadFile("/motorcycle/photo", { uri: a.uri, name: a.fileName || "bike.jpg", type: a.mimeType || "image/jpeg" });
      await refresh();
    } catch (e: any) { setPhotoErr(e.message); } finally { setPhotoBusy(false); }
  };

  const pickPhoto = async (source: PhotoSource) => {
    const cur = source === "camera" ? await ImagePicker.getCameraPermissionsAsync() : await ImagePicker.getMediaLibraryPermissionsAsync();
    if (cur.granted) { await launchPicker(source); return; }
    setPerm({ mode: cur.canAskAgain ? "explain" : "blocked", source });
  };

  const allowPhoto = async () => {
    if (!perm) return;
    const { source } = perm;
    setPerm(null);
    const r = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (r.granted) await launchPicker(source);
    else if (!r.canAskAgain) setPerm({ mode: "blocked", source });
  };

  const submit = async () => {
    setErr(null);
    const y = parseInt(year, 10);
    const o = parseInt(odometer || "0", 10);
    if (!make.trim() || !model.trim() || !y) { setErr("Make, model, and year are required"); return; }
    setBusy(true);
    try {
      await api("/motorcycle", { method: "PUT", body: JSON.stringify({ make: make.trim(), model: model.trim(), year: y, odometer: o, nickname: nickname.trim() || null }) });
      await refresh();
      qc.invalidateQueries({ queryKey: ["reminders"] });
      router.replace("/(tabs)");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{user?.motorcycle ? "Your motorcycle" : "Add your motorcycle"}</Text>
        <Text style={styles.subtitle}>We tailor diagnostics and AI advice to your bike</Text>

        {/* Bike photo */}
        <View style={styles.photoBox} testID="bike-photo-box">
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" transition={200} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Icon name="motorbike" size={40} color={colors.muted} />
              <Text style={styles.photoHint}>Add a photo of your bike</Text>
            </View>
          )}
          {photoBusy && (
            <View style={styles.photoOverlay}><ActivityIndicator color={colors.onBrandPrimary} /></View>
          )}
        </View>
        <View style={styles.photoActions}>
          {Platform.OS !== "web" && (
            <Pressable testID="photo-camera" onPress={() => pickPhoto("camera")} disabled={photoBusy} style={styles.photoBtn}>
              <Icon name="camera-outline" size={18} color={colors.brandPrimary} />
              <Text style={styles.photoBtnText}>Take photo</Text>
            </Pressable>
          )}
          <Pressable testID="photo-library" onPress={() => pickPhoto("library")} disabled={photoBusy} style={styles.photoBtn}>
            <Icon name="image-outline" size={18} color={colors.brandPrimary} />
            <Text style={styles.photoBtnText}>{photoUri ? "Change photo" : "Choose photo"}</Text>
          </Pressable>
        </View>
        {photoErr ? <Text style={styles.err}>{photoErr}</Text> : null}

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
          <Text style={styles.skipText}>{user?.motorcycle ? "Back" : "Skip for now"}</Text>
        </Pressable>
      </ScrollView>

      <PermissionPrompt
        mode={perm?.mode ?? null}
        icon={perm?.source === "camera" ? "camera-outline" : "image-outline"}
        title={perm?.source === "camera" ? "Allow camera" : "Allow photo access"}
        message={perm?.source === "camera"
          ? "Snap a picture of your bike so your dashboard feels like yours."
          : "Pick a picture of your bike from your library for your dashboard."}
        onAllow={allowPhoto}
        onDismiss={() => setPerm(null)}
      />
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) => ({
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface },
  subtitle: { fontSize: 14, color: c.muted, marginTop: 6, marginBottom: 16 },
  photoBox: { height: 160, borderRadius: 16, overflow: "hidden", backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border },
  photo: { width: "100%", height: "100%" },
  photoPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  photoHint: { fontSize: 13, color: c.muted },
  photoOverlay: { position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  photoActions: { flexDirection: "row", gap: 10, marginTop: 10 },
  photoBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: c.brandTertiary, minHeight: 44 },
  photoBtnText: { color: c.onBrandTertiary, fontWeight: "700", fontSize: 14 },
  label: { fontSize: 13, color: c.onSurfaceSecondary, marginTop: 12, marginBottom: 6, fontWeight: "600" },
  input: { backgroundColor: c.surfaceTertiary, color: c.onSurface, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, fontSize: 16, borderWidth: 1, borderColor: c.border },
  err: { color: c.error, marginTop: 12 },
  cta: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 24 },
  ctaText: { color: c.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  skip: { paddingVertical: 12, alignItems: "center", marginTop: 8 },
  skipText: { color: c.muted, fontSize: 14 },
}));
