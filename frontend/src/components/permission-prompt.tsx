import { Modal, View, Text, Pressable, Linking, Platform } from "react-native";
import Icon from "@react-native-vector-icons/material-design-icons";
import { makeStyles, useTheme } from "@/src/theme";

export type PermissionMode = "explain" | "blocked" | null;

interface Props {
  mode: PermissionMode;
  icon: string;
  title: string;
  message: string;
  onAllow: () => void;
  onDismiss: () => void;
}

/** Pre-permission explainer + "open settings" fallback for blocked permissions. */
export function PermissionPrompt({ mode, icon, title, message, onAllow, onDismiss }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const blocked = mode === "blocked";
  return (
    <Modal visible={!!mode} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss} testID="perm-backdrop">
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.iconWrap}><Icon name={icon as any} size={30} color={colors.brandPrimary} /></View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.msg}>
            {blocked ? `${title.replace(/^Allow /, "")} access is turned off. Enable it in Settings to use this feature.` : message}
          </Text>
          <Pressable
            testID="perm-primary"
            style={styles.primary}
            onPress={blocked ? () => { onDismiss(); if (Platform.OS !== "web") Linking.openSettings(); } : onAllow}
          >
            <Text style={styles.primaryText}>{blocked ? (Platform.OS === "web" ? "Got it" : "Open Settings") : "Continue"}</Text>
          </Pressable>
          <Pressable testID="perm-dismiss" style={styles.secondary} onPress={onDismiss}>
            <Text style={styles.secondaryText}>Not now</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36, alignItems: "center" },
  iconWrap: { width: 64, height: 64, borderRadius: 20, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title: { fontSize: 20, fontWeight: "800", color: c.onSurface, textAlign: "center" },
  msg: { fontSize: 14, color: c.muted, textAlign: "center", marginTop: 8, lineHeight: 20 },
  primary: { marginTop: 20, backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 14, alignItems: "center", width: "100%" },
  primaryText: { color: c.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  secondary: { marginTop: 8, paddingVertical: 12, alignItems: "center", width: "100%" },
  secondaryText: { color: c.muted, fontSize: 14, fontWeight: "600" },
}));
