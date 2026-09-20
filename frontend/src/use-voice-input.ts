import { useState } from "react";
import { Platform } from "react-native";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { uploadFile } from "@/src/api";
import { PermissionMode } from "@/src/components/permission-prompt";

/**
 * Shared mic → Whisper flow with contextual permission handling.
 * Call `toggle()` from a mic button; `onTranscript` receives the text.
 */
export function useVoiceInput(onTranscript: (text: string) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [transcribing, setTranscribing] = useState(false);
  const [permMode, setPermMode] = useState<PermissionMode>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setError("Could not start the microphone. Please try again.");
    }
  };

  const stop = async () => {
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
      if (!r.text) { setError("I couldn't hear anything — try speaking closer to the mic."); return; }
      onTranscript(r.text);
    } catch (e: any) {
      setError(e.message || "Transcription failed");
    } finally {
      setTranscribing(false);
    }
  };

  const toggle = async () => {
    if (state.isRecording) { await stop(); return; }
    const cur = await AudioModule.getRecordingPermissionsAsync();
    if (cur.granted) { await start(); return; }
    setPermMode(cur.canAskAgain ? "explain" : "blocked");
  };

  const requestPermission = async () => {
    setPermMode(null);
    const r = await AudioModule.requestRecordingPermissionsAsync();
    if (r.granted) await start();
    else if (!r.canAskAgain) setPermMode("blocked");
  };

  return {
    isRecording: state.isRecording,
    durationSec: Math.floor((state.durationMillis || 0) / 1000),
    transcribing,
    error,
    clearError: () => setError(null),
    permMode,
    dismissPermission: () => setPermMode(null),
    requestPermission,
    toggle,
  };
}
