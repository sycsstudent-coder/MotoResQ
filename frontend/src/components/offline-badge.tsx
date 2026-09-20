import { View, Text } from "react-native";
import Icon from "@react-native-vector-icons/material-design-icons";
import { makeStyles, useTheme } from "@/src/theme";

/** Small pill shown when content is served from the on-device cache. */
export function OfflineBadge({ visible }: { visible: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  if (!visible) return null;
  return (
    <View style={styles.badge} testID="offline-badge">
      <Icon name="cloud-off-outline" size={14} color={colors.onBrandTertiary} />
      <Text style={styles.text}>Offline — showing saved copy</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  badge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: c.brandTertiary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginTop: 10 },
  text: { fontSize: 12, fontWeight: "600", color: c.onBrandTertiary },
}));
