import { useState } from "react";
import { View, Text, ScrollView, Pressable, Linking, Share, Platform, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import Icon from "@react-native-vector-icons/material-design-icons";
import { makeStyles, useTheme } from "@/src/theme";
import { api, EmergencyContact } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { PermissionPrompt, PermissionMode } from "@/src/components/permission-prompt";

const EMERGENCY_NUMBER = "112";
const KINDS: { id: EmergencyContact["kind"]; label: string; icon: string }[] = [
  { id: "tow", label: "Tow truck", icon: "tow-truck" },
  { id: "roadside", label: "Roadside assist", icon: "car-wrench" },
  { id: "personal", label: "Friend / family", icon: "account-heart-outline" },
];

interface Loc { lat: number; lng: number; label?: string }

export default function SOS() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();

  const contacts = useQuery<EmergencyContact[]>({ queryKey: ["contacts"], queryFn: () => api("/emergency/contacts") });

  const [loc, setLoc] = useState<Loc | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [locPerm, setLocPerm] = useState<PermissionMode>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [kind, setKind] = useState<EmergencyContact["kind"]>("tow");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const bike = user?.motorcycle ? ` I'm on a ${user.motorcycle.year} ${user.motorcycle.make} ${user.motorcycle.model}.` : "";
  const mapsLink = loc ? `https://maps.google.com/?q=${loc.lat},${loc.lng}` : null;
  const helpMessage = `I've broken down and need help.${bike}${mapsLink ? `\nMy location: ${mapsLink}` : ""}`;

  const fetchLocation = async () => {
    setLocBusy(true); setLocErr(null);
    try {
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let label: string | undefined;
      if (Platform.OS !== "web") {
        try {
          const [g] = await Location.reverseGeocodeAsync({ latitude: p.coords.latitude, longitude: p.coords.longitude });
          label = [g?.street, g?.city, g?.region].filter(Boolean).join(", ") || undefined;
        } catch {}
      }
      setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, label });
    } catch {
      setLocErr("Couldn't get your location. Make sure GPS is on and try again.");
    } finally { setLocBusy(false); }
  };

  const locate = async () => {
    const cur = await Location.getForegroundPermissionsAsync();
    if (cur.granted) { await fetchLocation(); return; }
    setLocPerm(cur.canAskAgain ? "explain" : "blocked");
  };

  const allowLocation = async () => {
    setLocPerm(null);
    const r = await Location.requestForegroundPermissionsAsync();
    if (r.granted) await fetchLocation();
    else if (!r.canAskAgain) setLocPerm("blocked");
  };

  const shareLocation = async () => {
    setShareNote(null);
    try {
      await Share.share({ message: helpMessage });
    } catch {
      setShareNote("Sharing isn't available here — use the SMS button on a contact instead.");
    }
  };

  const call = (num: string) => Linking.openURL(`tel:${num}`).catch(() => {});
  const sms = (num: string) => {
    const sep = Platform.OS === "ios" ? "&" : "?";
    Linking.openURL(`sms:${num}${sep}body=${encodeURIComponent(helpMessage)}`).catch(() => {});
  };

  const saveContact = async () => {
    setSaveErr(null);
    if (!name.trim() || !phone.trim()) { setSaveErr("Name and phone are required"); return; }
    setSaveBusy(true);
    try {
      await api("/emergency/contacts", { method: "POST", body: JSON.stringify({ name: name.trim(), phone: phone.trim(), kind }) });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setAdding(false); setName(""); setPhone(""); setKind("tow");
    } catch (e: any) { setSaveErr(e.message); } finally { setSaveBusy(false); }
  };

  const removeContact = async (id: string) => {
    await api(`/emergency/contacts/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["contacts"] });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="sos-back" onPress={() => router.back()} style={styles.back}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Emergency SOS</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} testID="sos-screen">
        {/* Emergency services */}
        <Pressable testID="sos-call-emergency" onPress={() => call(EMERGENCY_NUMBER)} style={styles.emergencyBtn}>
          <Icon name="phone-alert" size={28} color={colors.onError} />
          <View style={{ flex: 1 }}>
            <Text style={styles.emergencyTitle}>Call emergency services</Text>
            <Text style={styles.emergencySub}>Dial {EMERGENCY_NUMBER} — for injuries or danger on the road</Text>
          </View>
        </Pressable>

        {/* Location */}
        <Text style={styles.section}>Your location</Text>
        <View style={styles.card}>
          {loc ? (
            <>
              <View style={styles.locRow}>
                <Icon name="map-marker-check" size={22} color={colors.success} />
                <View style={{ flex: 1 }}>
                  {loc.label ? <Text style={styles.locLabel}>{loc.label}</Text> : null}
                  <Text style={styles.locCoords} selectable>{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}</Text>
                </View>
                <Pressable testID="sos-relocate" onPress={fetchLocation} style={styles.iconBtn} disabled={locBusy}>
                  {locBusy ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : <Icon name="refresh" size={20} color={colors.brandPrimary} />}
                </Pressable>
              </View>
              <Pressable testID="sos-share" onPress={shareLocation} style={styles.primaryBtn}>
                <Icon name="share-variant" size={18} color={colors.onBrandPrimary} />
                <Text style={styles.primaryText}>Share my location</Text>
              </Pressable>
              {mapsLink ? <Text style={styles.link} selectable testID="sos-maps-link">{mapsLink}</Text> : null}
            </>
          ) : (
            <>
              <Text style={styles.cardHint}>Get your GPS position so you can send it to a tow or a friend.</Text>
              <Pressable testID="sos-locate" onPress={locate} disabled={locBusy} style={styles.primaryBtn}>
                {locBusy ? <ActivityIndicator size="small" color={colors.onBrandPrimary} /> : <Icon name="crosshairs-gps" size={18} color={colors.onBrandPrimary} />}
                <Text style={styles.primaryText}>{locBusy ? "Locating…" : "Find my location"}</Text>
              </Pressable>
            </>
          )}
          {locErr ? <Text style={styles.err}>{locErr}</Text> : null}
          {shareNote ? <Text style={styles.err}>{shareNote}</Text> : null}
        </View>

        {/* Contacts */}
        <View style={styles.sectionRow}>
          <Text style={styles.section}>Rescue contacts</Text>
          <Pressable testID="sos-add-contact" onPress={() => setAdding(true)} style={styles.addBtn}>
            <Icon name="plus" size={18} color={colors.brandPrimary} />
            <Text style={styles.addText}>Add</Text>
          </Pressable>
        </View>

        {contacts.isLoading && <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 12 }} />}
        {contacts.data?.length === 0 && (
          <View style={styles.empty}>
            <Icon name="tow-truck" size={40} color={colors.muted} />
            <Text style={styles.emptyTitle}>No contacts yet</Text>
            <Text style={styles.emptySub}>Add your tow service, roadside assistance, or a friend so help is one tap away.</Text>
          </View>
        )}
        {contacts.data?.map((c) => {
          const k = KINDS.find((x) => x.id === c.kind) || KINDS[2];
          return (
            <View key={c.id} style={styles.contact} testID={`sos-contact-${c.id}`}>
              <View style={styles.contactIcon}><Icon name={k.icon as any} size={22} color={colors.brandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactName}>{c.name}</Text>
                <Text style={styles.contactSub}>{k.label} • {c.phone}</Text>
              </View>
              <Pressable testID={`sos-sms-${c.id}`} onPress={() => sms(c.phone)} style={styles.iconBtn}>
                <Icon name="message-text-outline" size={20} color={colors.info} />
              </Pressable>
              <Pressable testID={`sos-call-${c.id}`} onPress={() => call(c.phone)} style={[styles.iconBtn, styles.callBtn]}>
                <Icon name="phone" size={20} color={colors.onSuccess} />
              </Pressable>
              <Pressable testID={`sos-delete-${c.id}`} onPress={() => removeContact(c.id)} style={styles.iconBtn}>
                <Icon name="delete-outline" size={20} color={colors.muted} />
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      {/* Add contact modal */}
      <Modal visible={adding} transparent animationType="slide" onRequestClose={() => setAdding(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
          <Pressable style={{ flex: 1 }} onPress={() => setAdding(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={styles.sheetTitle}>Add rescue contact</Text>
            <View style={styles.kinds}>
              {KINDS.map((k) => (
                <Pressable key={k.id} testID={`contact-kind-${k.id}`} onPress={() => setKind(k.id)} style={[styles.kindChip, kind === k.id && styles.kindChipActive]}>
                  <Icon name={k.icon as any} size={16} color={kind === k.id ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
                  <Text style={[styles.kindText, kind === k.id && { color: colors.onBrandPrimary }]}>{k.label}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput testID="contact-name" style={styles.input} value={name} onChangeText={setName} placeholder="Name (e.g. City Tow Service)" placeholderTextColor={colors.muted} />
            <TextInput testID="contact-phone" style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Phone number" placeholderTextColor={colors.muted} />
            {saveErr ? <Text style={styles.err}>{saveErr}</Text> : null}
            <Pressable testID="contact-save" onPress={saveContact} disabled={saveBusy} style={[styles.primaryBtn, saveBusy && { opacity: 0.6 }]}>
              {saveBusy ? <ActivityIndicator size="small" color={colors.onBrandPrimary} /> : <Text style={styles.primaryText}>Save contact</Text>}
            </Pressable>
            <Pressable testID="contact-cancel" onPress={() => setAdding(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <PermissionPrompt
        mode={locPerm}
        icon="crosshairs-gps"
        title="Allow location"
        message="MotoResQ uses your position only when you ask, so you can send an exact pin to a tow truck or a friend."
        onAllow={allowLocation}
        onDismiss={() => setLocPerm(null)}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: c.onSurface },

  emergencyBtn: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: c.error, padding: 18, borderRadius: 18, minHeight: 80 },
  emergencyTitle: { color: c.onError, fontSize: 18, fontWeight: "800" },
  emergencySub: { color: c.onError, fontSize: 12, marginTop: 2, opacity: 0.9 },

  section: { fontSize: 12, fontWeight: "700", color: c.muted, marginTop: 24, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  sectionRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 4 },
  addText: { color: c.brandPrimary, fontWeight: "700", fontSize: 14 },

  card: { backgroundColor: c.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 16, gap: 12 },
  cardHint: { fontSize: 14, color: c.onSurfaceSecondary, lineHeight: 20 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  locLabel: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  locCoords: { fontSize: 13, color: c.muted, marginTop: 2 },
  link: { fontSize: 12, color: c.info, textAlign: "center" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 14, minHeight: 48 },
  primaryText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 15 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  callBtn: { backgroundColor: c.success },
  err: { color: c.error, fontSize: 13 },

  empty: { alignItems: "center", padding: 28, gap: 6, backgroundColor: c.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: c.border },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface, marginTop: 6 },
  emptySub: { fontSize: 13, color: c.muted, textAlign: "center", lineHeight: 18 },
  contact: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surfaceSecondary, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: c.border, marginBottom: 10 },
  contactIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  contactName: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  contactSub: { fontSize: 12, color: c.muted, marginTop: 2 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: c.onSurface },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kindChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border },
  kindChipActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  kindText: { fontSize: 13, color: c.onSurfaceSecondary, fontWeight: "600" },
  input: { backgroundColor: c.surfaceTertiary, color: c.onSurface, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, fontSize: 16, borderWidth: 1, borderColor: c.border },
  cancelBtn: { alignItems: "center", paddingVertical: 12 },
  cancelText: { color: c.muted, fontWeight: "600", fontSize: 14 },
}));
