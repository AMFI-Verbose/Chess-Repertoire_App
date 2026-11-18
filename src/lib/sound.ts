// Sound effects generated with the Web Audio API.
// No .mp3/.wav assets: every sound is an oscillator envelope, so it works offline
// and adds zero bytes to the bundle.

export type SoundName =
  | "move"
  | "capture"
  | "check"
  | "error"
  | "success"
  | "navigate"
  | "delete"
  // Move-classification cues (review mode only)
  | "best"
  | "brilliant"
  | "great"
  | "inaccuracy"
  | "mistake"
  | "blunder";

const STORAGE_KEY = "repertoire.muted";

let audio: AudioContext | null = null;
let muted = false;
let loaded = false;

/** Browsers only allow audio after a user gesture, so the context is created lazily. */
function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audio) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    audio = new Ctor();
  }
  if (audio.state === "suspended") void audio.resume();
  return audio;
}

export function loadMutedPreference(): boolean {
  if (!loaded && typeof window !== "undefined") {
    muted = window.localStorage.getItem(STORAGE_KEY) === "1";
    loaded = true;
  }
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  loaded = true;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  }
}

export function isMuted(): boolean {
  if (!loaded) loadMutedPreference();
  return muted;
}

/**
 * One enveloped tone. `sweepTo` glides the pitch, which is what makes a sound
 * feel like a "drop" (capture) rather than a "click" (move).
 */
function tone(options: {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  sweepTo?: number;
}): void {
  const ctx = context();
  if (!ctx) return;

  const { freq, duration, type = "sine", gain = 0.12, delay = 0, sweepTo } = options;
  const start = ctx.currentTime + delay;

  const osc = ctx.createOscillator();
  const envelope = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (sweepTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(sweepTo, start + duration);
  }

  // Quick attack, exponential decay — sounds "percussive" instead of droney.
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + duration * 0.15);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(envelope);
  envelope.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function play(name: SoundName): void {
  if (isMuted()) return;

  switch (name) {
    case "move":
      tone({ freq: 420, duration: 0.05, type: "triangle", gain: 0.1, sweepTo: 330 });
      break;
    case "capture":
      tone({ freq: 240, duration: 0.07, type: "square", gain: 0.09, sweepTo: 150 });
      tone({ freq: 120, duration: 0.1, type: "triangle", gain: 0.08, delay: 0.03 });
      break;
    case "check":
      tone({ freq: 620, duration: 0.14, type: "sine", gain: 0.12, sweepTo: 880 });
      break;
    case "error":
      tone({ freq: 220, duration: 0.12, type: "sawtooth", gain: 0.07, sweepTo: 120 });
      break;
    case "success":
      tone({ freq: 523, duration: 0.09, type: "sine", gain: 0.1 });
      tone({ freq: 659, duration: 0.09, type: "sine", gain: 0.1, delay: 0.07 });
      tone({ freq: 784, duration: 0.12, type: "sine", gain: 0.1, delay: 0.14 });
      break;
    case "navigate":
      tone({ freq: 900, duration: 0.03, type: "sine", gain: 0.05 });
      break;
    case "delete":
      tone({ freq: 320, duration: 0.16, type: "triangle", gain: 0.08, sweepTo: 90 });
      break;

    // --- classification cues ------------------------------------------------
    // Each one has a distinct *shape*, not just a distinct pitch, so you can
    // identify the verdict with your ears while looking at the board.
    case "best":
      tone({ freq: 660, duration: 0.07, type: "sine", gain: 0.09 });
      break;
    case "brilliant": {
      // Rising bell arpeggio + a high shimmer = "something special happened".
      const notes = [880, 1108, 1320];
      notes.forEach((freq, index) => {
        tone({
          freq,
          duration: 0.1,
          type: "triangle",
          gain: 0.09,
          delay: index * 0.05,
        });
      });
      tone({ freq: 1760, duration: 0.22, type: "sine", gain: 0.06, delay: 0.12 });
      break;
    }
    case "great":
      tone({ freq: 587, duration: 0.09, type: "triangle", gain: 0.09 });
      tone({ freq: 784, duration: 0.12, type: "triangle", gain: 0.09, delay: 0.08 });
      break;
    case "inaccuracy":
      tone({ freq: 300, duration: 0.09, type: "triangle", gain: 0.07, sweepTo: 250 });
      break;
    case "mistake":
      tone({ freq: 360, duration: 0.1, type: "sawtooth", gain: 0.06, sweepTo: 230 });
      tone({ freq: 200, duration: 0.16, type: "triangle", gain: 0.06, delay: 0.1 });
      break;
    case "blunder":
      // Dissonant low double-thud — deliberately unpleasant.
      tone({ freq: 190, duration: 0.14, type: "square", gain: 0.08, sweepTo: 160 });
      tone({ freq: 95, duration: 0.2, type: "triangle", gain: 0.1, delay: 0.06 });
      break;
  }
}
