/* Which browser voice Pedro speaks with. The old rule (installed voices first) picked robotic voices such as
   Microsoft David. Browsers also ship free neural voices through the same Web Speech API: Edge's
   "... Online (Natural)" voices and Chrome's "Google US English". Those need internet, so installed voices
   stay as the fallback (on Mars, or offline). Kokoro (kokoro.ts) can replace all of this with an offline
   neural voice when it is switched on in Settings. */
const MALE = /\b(andrew|guy|brian|christopher|eric|roger|steffan|ryan|davis|tony|jason|male|david|mark|george|daniel)\b/i;

function score(v: SpeechSynthesisVoice) {
  let n = 0;
  if (/natural|neural/i.test(v.name)) n += 8;        // Edge / Windows neural voices
  else if (/^google/i.test(v.name)) n += 5;          // Chrome's online voices
  else if (/premium|enhanced|siri/i.test(v.name)) n += 5; // macOS / iOS higher-quality voices
  if (/^en[-_]us/i.test(v.lang)) n += 2; else if (/^en[-_](gb|au|ca|ie)/i.test(v.lang)) n += 1;
  if (MALE.test(v.name)) n += 1;                     // Pedro is a he
  return n;
}

/** The best English voice available, or the one named (from Settings) when it exists. */
export function bestVoice(voices: SpeechSynthesisVoice[], name?: string | null): SpeechSynthesisVoice | undefined {
  const en = voices.filter((v) => /^en/i.test(v.lang));
  if (name) { const v = en.find((x) => x.name === name); if (v) return v; }
  return [...en].sort((a, b) => score(b) - score(a))[0];
}
