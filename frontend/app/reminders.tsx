import { useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";
import { makeStyles, useTheme } from "@/src/theme";
import { api, Reminder, RemindersResponse } from "@/src/api";
import { useAuth } from "@/src/auth-context";

export default function Reminders() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { refresh } = useAuth();

  const { data, isLoading, refetch, isRefetching } = useQuery<RemindersResponse>({ queryKey: ["reminders"], queryFn: () => api("/reminders") });

  const [editOdo, setEditOdo] = useState(false);
  const [odoText, setOdoText] = useState("");
  const [odoBusy, setOdoBusy] = useState(false);
  const [odoErr, setOdoErr] = useState<string | null>(null);

  const statusColor = (s: Reminder["status"]) =>
    s === "overdue" ? colors.error : s === "due_soon" ? colors.warning : s === "ok" ? colors.success : colors.muted;
  const statusLabel = (s: Reminder["status"]) =>
    s === "overdue" ? "Overdue" : s === "due_soon" ? "Due soon" : s === "ok" ? "On track" : "Not tracked";

  const openOdo = () => { setOdoText(String(data?.odometer ?? "")); setOdoErr(null); setEditOdo(true); };
  const saveOdo = async () => {
    const v = parseInt(odoText, 10);
    if (isNaN(v) || v < 0) { setOdoErr("Enter a valid odometer reading"); return; }
    setOdoBusy(true);
    try {
      await api("/motorcycle/odometer", { method: "PATCH", body: JSON.stringify({ odometer: v }) });
      await refresh();
      qc.invalidateQueries({ queryKey: ["reminders"] });
      setEditOdo(false);
    } catch (e: any) { setOdoErr(e.message); } finally { setOdoBusy(false); }
  };

  const logService = (r: Reminder) =>
    router.push(`/maintenance-add?type=${encodeURIComponent(r.log_type)}&odo=${data?.odometer ?? ""}`);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="rem-back" onPress={() => router.back()} style={styles.back}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Service reminders</Text>
        <View style={{ width: 44 }} />
      </View>

      {isLoading && <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 24 }} />}

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
        testID="reminders-screen"
      >
        {data && !data.has_motorcycle && (
          <View style={styles.empty}>
            <Icon name="motorbike" size={44} color={colors.muted} />
            <Text style={styles.emptyTitle}>Add your motorcycle first</Text>
            <Text style={styles.emptySub}>Reminders are based on your odometer and service history.</Text>
            <Pressable testID="rem-setup" onPress={() => router.push("/motorcycle-setup")} style={styles.primaryBtn}>
              <Text style={styles.primaryText}>Set up my bike</Text>
            </Pressable>
          </View>
        )}

        {data?.has_motorcycle && (
          <>
            <View style={styles.odoCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.odoLabel}>Current odometer</Text>
                <Text style={styles.odoValue} testID="rem-odometer">{data.odometer.toLocaleString()} km</Text>
              </View>
              <Pressable testID="rem-update-odo" onPress={openOdo} style={styles.odoBtn}>
                <Icon name="speedometer" size={18} color={colors.onBrandTertiary} />
                <Text style={styles.odoBtnText}>Update</Text>
              </Pressable>
            </View>

            {data.summary.tracked === 0 && (
              <View style={styles.tip}>
                <Icon name="lightbulb-on-outline" size={20} color={colors.brandPrimary} />
                <Text style={styles.tipText}>Tap “Log service” on each item to record when it was last done. We&apos;ll count down the kilometres for you.</Text>
              </View>
            )}

            {data.items.map((r) => {
              const col = statusColor(r.status);
              return (
                <View key={r.id} style={styles.item} testID={`rem-item-${r.id}`}>
                  <View style={styles.itemTop}>
                    <View style={[styles.itemIcon, { backgroundColor: col + "22" }]}>
                      <Icon name={r.icon as any} size={22} color={col} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{r.label}</Text>
                      <Text style={styles.itemMeta}>Every {r.interval_km.toLocaleString()} km{r.last_odometer != null ? ` • last at ${r.last_odometer.toLocaleString()} km` : ""}</Text>
                    </View>
                    <View style={[styles.chip, { backgroundColor: col + "22" }]}>
                      <Text style={[styles.chipText, { color: col }]}>{statusLabel(r.status)}</Text>
                    </View>
                  </View>
                  {r.status !== "unknown" && (
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${Math.round(r.progress * 100)}%`, backgroundColor: col }]} />
                    </View>
                  )}
                  <View style={styles.itemBottom}>
                    <Text style={[styles.itemMsg, { color: r.status === "unknown" ? colors.muted : col }]}>{r.message}</Text>
                    <Pressable testID={`rem-log-${r.id}`} onPress={() => logService(r)} style={styles.logBtn}>
                      <Icon name="plus" size={16} color={colors.brandPrimary} />
                      <Text style={styles.logText}>Log service</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <Modal visible={editOdo} transparent animationType="fade" onRequestClose={() => setEditOdo(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
          <Pressable style={{ flex: 1 }} onPress={() => setEditOdo(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={styles.sheetTitle}>Update odometer</Text>
            <TextInput testID="odo-input" style={styles.input} value={odoText} onChangeText={setOdoText} keyboardType="number-pad" placeholder="e.g. 15200" placeholderTextColor={colors.muted} autoFocus />
            {odoErr ? <Text style={styles.err}>{odoErr}</Text> : null}
            <Pressable testID="odo-save" onPress={saveOdo} disabled={odoBusy} style={[styles.primaryBtn, odoBusy && { opacity: 0.6 }]}>
              {odoBusy ? <ActivityIndicator size="small" color={colors.onBrandPrimary} /> : <Text style={styles.primaryText}>Save</Text>}
            </Pressable>
            <Pressable testID="odo-cancel" onPress={() => setEditOdo(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: c.onSurface },

  odoCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surfaceInverse, padding: 18, borderRadius: 18, marginBottom: 16 },
  odoLabel: { fontSize: 12, color: c.onSurfaceInverse, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.5 },
  odoValue: { fontSize: 26, fontWeight: "800", color: c.onSurfaceInverse, marginTop: 2 },
  odoBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.brandTertiary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, minHeight: 44 },
  odoBtnText: { color: c.onBrandTertiary, fontWeight: "700", fontSize: 14 },

  tip: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: c.brandTertiary, padding: 14, borderRadius: 12, marginBottom: 16 },
  tipText: { flex: 1, color: c.onBrandTertiary, fontSize: 13, lineHeight: 18 },

  item: { backgroundColor: c.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14, marginBottom: 12, gap: 10 },
  itemTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  itemIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  itemTitle: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  itemMeta: { fontSize: 12, color: c.muted, marginTop: 2 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  chipText: { fontSize: 11, fontWeight: "700" },
  track: { height: 6, borderRadius: 3, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  itemBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  itemMsg: { flex: 1, fontSize: 13, fontWeight: "600" },
  logBtn: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: c.brandTertiary, minHeight: 36 },
  logText: { color: c.brandPrimary, fontWeight: "700", fontSize: 13 },

  empty: { alignItems: "center", padding: 32, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: c.onSurface, marginTop: 8 },
  emptySub: { fontSize: 13, color: c.muted, textAlign: "center", lineHeight: 18 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, minHeight: 48, marginTop: 8 },
  primaryText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 15 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: c.onSurface },
  input: { backgroundColor: c.surfaceTertiary, color: c.onSurface, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, fontSize: 18, borderWidth: 1, borderColor: c.border },
  err: { color: c.error, fontSize: 13 },
  cancelBtn: { alignItems: "center", paddingVertical: 12 },
  cancelText: { color: c.muted, fontWeight: "600", fontSize: 14 },
}));
