import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { createAudioPlayer, setAudioModeAsync, AudioModule, RecordingPresets, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { makeStyles, useTheme } from "@/src/theme";
import { api, uploadFile } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { readToken } from "@/src/token";
import { PermissionPrompt, PermissionMode } from "@/src/components/permission-prompt";

interface Msg { role: "user" | "assistant"; content: string; id: string }

const SUGGESTIONS = [
  "My bike won't start this morning",
  "How do I check chain slack?",
  "What causes a spongy brake lever?",
  "Should I change coolant myself?",
];

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function AIChat() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const sessionRef = useRef<string>(`s-${Date.now()}`);
  const scrollRef = useRef<ScrollView | null>(null);
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  // Voice input (Whisper STT)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder);
  const [transcribing, setTranscribing] = useState(false);
  const [micPerm, setMicPerm] = useState<PermissionMode>(null);
  const [voiceErr, setVoiceErr] = useState<string | null>(null);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    return () => {
      try { playerRef.current?.remove?.(); } catch {}
    };
  }, []);

  const startRecording = async () => {
    setVoiceErr(null);
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setVoiceErr("Could not start the microphone. Please try again.");
    }
  };

  const onMicPress = async () => {
    if (recState.isRecording) { await stopAndTranscribe(); return; }
    const cur = await AudioModule.getRecordingPermissionsAsync();
    if (cur.granted) { await startRecording(); return; }
    setMicPerm(cur.canAskAgain ? "explain" : "blocked");
  };

  const requestMic = async () => {
    setMicPerm(null);
    const r = await AudioModule.requestRecordingPermissionsAsync();
    if (r.granted) await startRecording();
    else if (!r.canAskAgain) setMicPerm("blocked");
  };

  const stopAndTranscribe = async () => {
    try {
      await recorder.stop();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
      const uri = recorder.uri;
      if (!uri) throw new Error("No recording captured");
      setTranscribing(true);
      const isWeb = Platform.OS === "web";
      const r = await uploadFile<{ text: string }>("/transcriptions", {
        uri, name: isWeb ? "recording.webm" : "recording.m4a", type: isWeb ? "audio/webm" : "audio/m4a",
      });
      if (!r.text) { setVoiceErr("I couldn't hear anything — try speaking closer to the mic."); return; }
      setText((t) => (t.trim() ? `${t.trim()} ${r.text}` : r.text));
    } catch (e: any) {
      setVoiceErr(e.message || "Transcription failed");
    } finally {
      setTranscribing(false);
    }
  };

  const send = async (msg?: string) => {
    const content = (msg ?? text).trim();
    if (!content || busy) return;
    setText("");
    const uid = `u-${Date.now()}`;
    setMessages((m) => [...m, { role: "user", content, id: uid }]);
    setBusy(true);
    try {
      const r = await api<{ reply: string }>("/chat", {
        method: "POST",
        body: JSON.stringify({ session_id: sessionRef.current, message: content, motorcycle: user?.motorcycle || null }),
      });
      setMessages((m) => [...m, { role: "assistant", content: r.reply, id: `a-${Date.now()}` }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `Sorry, I ran into an issue: ${e.message}`, id: `a-${Date.now()}` }]);
    } finally { setBusy(false); }
  };

  const speak = async (m: Msg) => {
    if (speakingId === m.id) {
      try { playerRef.current?.pause(); } catch {}
      setSpeakingId(null);
      return;
    }
    try {
      setSpeakingId(m.id);
      try { playerRef.current?.remove?.(); } catch {}
      const token = await readToken();
      if (Platform.OS === "web") {
        const res = await fetch(`${BASE}/api/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ text: m.content, voice: "nova" }),
        });
        if (!res.ok) throw new Error("TTS failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => { setSpeakingId(null); URL.revokeObjectURL(url); };
        audio.play();
        return;
      }
      // Native path: get temp URL by calling TTS then reading arrayBuffer -> write to file
      const res = await fetch(`${BASE}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text: m.content, voice: "nova" }),
      });
      if (!res.ok) throw new Error("TTS failed");
      const buf = await res.arrayBuffer();
      const base64 = arrayBufferToBase64(buf);
      const uri = `data:audio/mpeg;base64,${base64}`;
      const player = createAudioPlayer({ uri });
      playerRef.current = player;
      player.play();
      // simple end detection via polling
      const check = setInterval(() => {
        try {
          if (!player.playing) {
            clearInterval(check);
            setSpeakingId(null);
          }
        } catch { clearInterval(check); setSpeakingId(null); }
      }, 500);
    } catch {
      setSpeakingId(null);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="chat-back" onPress={() => router.back()} style={styles.back}>
          <Icon name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.headerTitle}>AI Assistant</Text>
          <Text style={styles.headerSub}>Claude Sonnet 4.6</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 16, paddingBottom: 12 }}
        style={{ flex: 1 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        testID="chat-messages"
      >
        {messages.length === 0 && (
          <View style={styles.welcome}>
            <View style={styles.robotIcon}><Icon name="robot-happy-outline" size={32} color={colors.brandPrimary} /></View>
            <Text style={styles.welcomeTitle}>Hey rider!</Text>
            <Text style={styles.welcomeSub}>Ask about symptoms, repairs, maintenance, or anything moto-related.</Text>
            <View style={{ gap: 8, marginTop: 16, width: "100%" }}>
              {SUGGESTIONS.map((s, i) => (
                <Pressable key={i} testID={`chat-suggest-${i}`} onPress={() => send(s)} style={styles.suggBtn}>
                  <Text style={styles.suggText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {messages.map((m) => (
          <View key={m.id} style={[styles.bubbleRow, m.role === "user" ? styles.userRow : styles.assistantRow]}>
            <View style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.assistantBubble]}>
              <Text style={m.role === "user" ? styles.userText : styles.assistantText}>{m.content}</Text>
              {m.role === "assistant" && (
                <Pressable testID={`chat-speak-${m.id}`} onPress={() => speak(m)} style={styles.speakBtn}>
                  <Icon name={speakingId === m.id ? "stop-circle-outline" : "volume-high"} size={16} color={colors.brandPrimary} />
                  <Text style={styles.speakText}>{speakingId === m.id ? "Stop" : "Speak"}</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}

        {busy && (
          <View style={styles.typing} testID="chat-typing">
            <ActivityIndicator size="small" color={colors.brandPrimary} />
            <Text style={styles.typingText}>Thinking…</Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable
          testID="chat-mic"
          onPress={onMicPress}
          disabled={transcribing || busy}
          style={[styles.micBtn, recState.isRecording && styles.micBtnActive, (transcribing || busy) && { opacity: 0.4 }]}
        >
          {transcribing ? (
            <ActivityIndicator size="small" color={colors.brandPrimary} />
          ) : (
            <Icon name={recState.isRecording ? "stop" : "microphone"} size={22} color={recState.isRecording ? colors.onError : colors.brandPrimary} />
          )}
        </Pressable>
        <TextInput
          testID="chat-input"
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={recState.isRecording ? "Listening… tap stop when done" : transcribing ? "Transcribing…" : "Ask or tap the mic…"}
          placeholderTextColor={recState.isRecording ? colors.error : colors.muted}
          multiline
        />
        <Pressable testID="chat-send" onPress={() => send()} disabled={busy || !text.trim()} style={[styles.sendBtn, (!text.trim() || busy) && { opacity: 0.4 }]}>
          <Icon name="send" size={20} color={colors.onBrandPrimary} />
        </Pressable>
      </View>
      {recState.isRecording && (
        <View style={[styles.recBar, { paddingBottom: Math.max(insets.bottom, 10) }]} testID="chat-recording">
          <View style={styles.recDot} />
          <Text style={styles.recText}>Recording {Math.floor(recState.durationMillis / 1000)}s — describe what your bike is doing</Text>
        </View>
      )}
      {voiceErr && !recState.isRecording && (
        <Pressable onPress={() => setVoiceErr(null)} style={[styles.recBar, { paddingBottom: Math.max(insets.bottom, 10) }]} testID="chat-voice-error">
          <Icon name="alert-circle-outline" size={16} color={colors.error} />
          <Text style={styles.recText}>{voiceErr}</Text>
        </Pressable>
      )}

      <PermissionPrompt
        mode={micPerm}
        icon="microphone"
        title="Allow microphone"
        message="Speak your bike's symptoms hands-free and MotoResQ will transcribe them into the chat."
        onAllow={requestMic}
        onDismiss={() => setMicPerm(null)}
      />
    </KeyboardAvoidingView>
  );
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  if (typeof btoa === "function") return btoa(binary);
  // @ts-ignore
  return global.Buffer ? global.Buffer.from(binary, "binary").toString("base64") : "";
}

const useStyles = makeStyles((c) => ({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  headerSub: { fontSize: 11, color: c.muted, marginTop: 1 },

  welcome: { alignItems: "center", padding: 20, marginTop: 20 },
  robotIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  welcomeTitle: { fontSize: 22, fontWeight: "800", color: c.onSurface, marginTop: 12 },
  welcomeSub: { fontSize: 14, color: c.muted, textAlign: "center", marginTop: 6 },
  suggBtn: { padding: 12, backgroundColor: c.surfaceSecondary, borderRadius: 12, borderWidth: 1, borderColor: c.border },
  suggText: { fontSize: 14, color: c.onSurface },

  bubbleRow: { flexDirection: "row", marginBottom: 10 },
  userRow: { justifyContent: "flex-end" },
  assistantRow: { justifyContent: "flex-start" },
  bubble: { maxWidth: "82%", padding: 12, borderRadius: 16 },
  userBubble: { backgroundColor: c.brandPrimary, borderBottomRightRadius: 4 },
  assistantBubble: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderBottomLeftRadius: 4 },
  userText: { color: c.onBrandPrimary, fontSize: 15, lineHeight: 22 },
  assistantText: { color: c.onSurface, fontSize: 15, lineHeight: 22 },
  speakBtn: { flexDirection: "row", gap: 4, alignItems: "center", marginTop: 8, paddingVertical: 4 },
  speakText: { fontSize: 12, color: c.brandPrimary, fontWeight: "600" },

  typing: { flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: 12, paddingVertical: 8 },
  typingText: { fontSize: 13, color: c.muted },

  inputBar: { flexDirection: "row", gap: 8, alignItems: "flex-end", padding: 12, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
  input: { flex: 1, backgroundColor: c.surfaceTertiary, color: c.onSurface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, maxHeight: 120, fontSize: 15, borderWidth: 1, borderColor: c.border },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  micBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  micBtnActive: { backgroundColor: c.error },
  recBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 8, backgroundColor: c.surface },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.error },
  recText: { flex: 1, fontSize: 13, color: c.onSurfaceSecondary },
}));
