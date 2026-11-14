/* Browser speech-to-text (Web Speech API).
   Chrome/Edge expose SpeechRecognition; Safari exposes webkitSpeechRecognition.
   Firefox has neither, so callers must handle null and fall back to typing. */

export function speechRecognitionCtor(): typeof SpeechRecognition | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return speechRecognitionCtor() != null;
}

/** The language the recognizer should listen for. English unless the user is already on another English locale. */
export function recognitionLanguage(): string {
  const nav = typeof navigator === "undefined" ? "" : navigator.language;
  return /^en(-|$)/i.test(nav) ? nav : "en-US";
}

/** A configured recognizer, or null when the browser has no speech-to-text. */
export function createSpeechRecognition(): SpeechRecognition | null {
  const Ctor = speechRecognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.lang = recognitionLanguage();
  return rec;
}

/** Copy for the existing "Didn't catch that" panel. */
export function recognitionErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone permission is needed. Allow it, or type instead.";
    case "audio-capture":
      return "No microphone was found. Type instead.";
    case "network":
      return "Speech recognition needs a connection in this browser.";
    case "language-not-supported":
      return "That language is not available here. Type instead.";
    case "bad-grammar":
      return "Speech recognition could not start. Try again, or type instead.";
    default:
      return "Speech recognition stopped. Try again, or type instead.";
  }
}
