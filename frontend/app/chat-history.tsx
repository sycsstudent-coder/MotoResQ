import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";
import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api";

interface Session { session_id: string; title: string; last_at: string; count: number }

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const diffH = (Date.now() - d.getTime()) / 36e5;
  if (diffH < 1) return "Just now";
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  if (diffH < 48) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function ChatHistory() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery<Session[]>({ queryKey: ["chat-sessions"], queryFn: () => api("/chat/sessions") });

  const remove = async (id: string) => {
    await api(`/chat/sessions/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["chat-sessions"] });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="history-back" onPress={() => router.back()} style={styles.back}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Past conversations</Text>
        <View style={{ width: 44 }} />
      </View>

      {isLoading && <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 24 }} />}

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
        testID="chat-history-screen"
      >
        {data?.length === 0 && (
          <View style={styles.empty}>
            <Icon name="chat-outline" size={44} color={colors.muted} />
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySub}>Your chats with the AI mechanic will show up here so you can pick them back up.</Text>
          </View>
        )}
        {data?.map((s) => (
          <Pressable
            key={s.session_id}
            testID={`session-${s.session_id}`}
            onPress={() => router.replace(`/ai-chat?session=${encodeURIComponent(s.session_id)}`)}
            style={styles.row}
          >
            <View style={styles.iconWrap}><Icon name="robot-happy-outline" size={22} color={colors.brandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={2}>{s.title}</Text>
              <Text style={styles.rowSub}>{formatWhen(s.last_at)} • {s.count} messages</Text>
            </View>
            <Pressable testID={`session-delete-${s.session_id}`} onPress={() => remove(s.session_id)} style={styles.deleteBtn} hitSlop={6}>
              <Icon name="delete-outline" size={20} color={colors.muted} />
            </Pressable>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: c.onSurface },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surfaceSecondary, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: c.border, marginBottom: 10, minHeight: 68 },
  iconWrap: { width: 42, height: 42, borderRadius: 12, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "700", color: c.onSurface, lineHeight: 20 },
  rowSub: { fontSize: 12, color: c.muted, marginTop: 3 },
  deleteBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface, marginTop: 8 },
  emptySub: { fontSize: 13, color: c.muted, textAlign: "center", lineHeight: 18 },
}));
