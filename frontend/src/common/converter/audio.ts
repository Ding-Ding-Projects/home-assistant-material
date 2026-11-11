import type { ConvertError } from "./types";
import { failure } from "./types";

/**
 * Sound files through the browser's own decoder. Reading is whatever the
 * browser can play; writing is WAV (written here) or, only when this browser
 * has an encoder for it, WebM Opus or MP4 audio through MediaRecorder.
 * Nothing is sent anywhere: the decoder and the encoder are the browser's.
 */

/** Largest compressed file that is decoded: it can be many times larger once decoded. */
export const MAX_COMPRESSED_AUDIO_BYTES = 8 * 1024 * 1024;

/** Longest sound that is decoded, in seconds. */
export const MAX_AUDIO_SECONDS = 15 * 60;

/** Largest WAV that is written. */
export const MAX_WAV_BYTES = 100 * 1024 * 1024;

/** MediaRecorder works in real time, so the length is limited more tightly. */
export const MAX_RECORD_SECONDS = 5 * 60;

export const SAMPLE_RATES = [8000, 16000, 22050, 32000, 44100, 48000];

export interface WavHeader {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  seconds: number;
}

/** The format and length a WAV file declares, without decoding it. */
export const readWavHeader = (bytes: Uint8Array): WavHeader | undefined => {
  if (bytes.length < 44) {
    return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) =>
    String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") {
    return undefined;
  }
  let at = 12;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  while (at + 8 <= bytes.length) {
    const size = view.getUint32(at + 4, true);
    if (tag(at) === "fmt " && at + 24 <= bytes.length) {
      channels = view.getUint16(at + 10, true);
      sampleRate = view.getUint32(at + 12, true);
      bits = view.getUint16(at + 22, true);
    } else if (tag(at) === "data") {
      if (!channels || !sampleRate || !bits) {
        return undefined;
      }
      const length = Math.min(size, bytes.length - at - 8);
      return {
        channels,
        sampleRate,
        bitsPerSample: bits,
        seconds: length / (channels * (bits / 8) * sampleRate),
      };
    }
    at += 8 + size + (size % 2);
  }
  return undefined;
};

/** Reduces or repeats the channels to the number asked for. */
export const mixChannels = (
  channels: readonly Float32Array[],
  count: 1 | 2
): Float32Array[] => {
  if (!channels.length) {
    return [];
  }
  const length = channels[0].length;
  if (count === 1) {
    if (channels.length === 1) {
      return [channels[0]];
    }
    const mono = new Float32Array(length);
    for (const channel of channels) {
      for (let i = 0; i < length; i++) {
        mono[i] += channel[i] / channels.length;
      }
    }
    return [mono];
  }
  // Stereo: a mono sound is used on both sides; more than two channels use
  // the front pair.
  return channels.length === 1
    ? [channels[0], channels[0]]
    : [channels[0], channels[1]];
};

/** Size in bytes of a 16-bit WAV of this length. */
export const wavSize = (frames: number, channels: number): number =>
  44 + frames * channels * 2;

/** A PCM 16-bit WAV file of the channels. */
export const encodeWav = (
  channels: readonly Float32Array[],
  sampleRate: number
): Uint8Array => {
  const count = channels.length;
  const frames = count ? channels[0].length : 0;
  const dataSize = frames * count * 2;
  const out = new Uint8Array(44 + dataSize);
  const view = new DataView(out.buffer);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      out[at + i] = value.charCodeAt(i);
    }
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, dataSize, true);
  let at = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < count; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][frame]));
      view.setInt16(at, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      at += 2;
    }
  }
  return out;
};

export const audioDecoderAvailable = (): boolean =>
  typeof OfflineAudioContext !== "undefined";

/** The MIME type MediaRecorder writes for each format, when it can. */
export const RECORDER_TYPES = {
  webm: ["audio/webm;codecs=opus", "audio/webm"],
  mp4: ["audio/mp4;codecs=mp4a.40.2", "audio/mp4"],
} as const;

export const recorderType = (kind: "webm" | "mp4"): string | undefined => {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return undefined;
  }
  return RECORDER_TYPES[kind].find((type) =>
    MediaRecorder.isTypeSupported(type)
  );
};

export interface DecodedAudio {
  channels: Float32Array[];
  sampleRate: number;
  seconds: number;
}

/**
 * Decodes the sound to the sample rate asked for. The browser does the
 * resampling as it decodes, so there is only one conversion step.
 */
export const decodeAudio = async (
  bytes: Uint8Array,
  sampleRate: number
): Promise<
  { ok: true; audio: DecodedAudio } | { ok: false; error: ConvertError }
> => {
  if (!audioDecoderAvailable()) {
    return failure("audio_no_decoder");
  }
  const header = readWavHeader(bytes);
  if (header && header.seconds > MAX_AUDIO_SECONDS) {
    return failure("audio_too_long");
  }
  if (!header && bytes.length > MAX_COMPRESSED_AUDIO_BYTES) {
    return failure("audio_too_large", {
      detail: String(MAX_COMPRESSED_AUDIO_BYTES),
    });
  }
  let buffer: AudioBuffer;
  try {
    const context = new OfflineAudioContext(2, 1, sampleRate);
    // A copy: decoding takes ownership of the buffer it is given.
    buffer = await context.decodeAudioData(bytes.slice().buffer);
  } catch (_err) {
    return failure("audio_decode_failed");
  }
  if (buffer.duration > MAX_AUDIO_SECONDS) {
    return failure("audio_too_long");
  }
  const channels: Float32Array[] = [];
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }
  return {
    ok: true,
    audio: {
      channels,
      sampleRate: buffer.sampleRate,
      seconds: buffer.duration,
    },
  };
};

/**
 * Plays the sound into a MediaRecorder, which writes it in the format the
 * browser offers. It takes as long as the sound lasts, and is silent: the
 * sound is not sent to the speakers.
 */
export const recordAudio = async (
  channels: readonly Float32Array[],
  sampleRate: number,
  mimeType: string
): Promise<
  | { ok: true; bytes: Uint8Array; mime: string }
  | { ok: false; error: ConvertError }
> => {
  const frames = channels[0]?.length ?? 0;
  if (frames / sampleRate > MAX_RECORD_SECONDS) {
    return failure("audio_too_long_to_encode");
  }
  let context: AudioContext | undefined;
  try {
    context = new AudioContext({ sampleRate });
    await context.resume();
    const buffer = context.createBuffer(channels.length, frames, sampleRate);
    channels.forEach((channel, index) => {
      buffer.copyToChannel(channel as Float32Array<ArrayBuffer>, index);
    });
    const source = context.createBufferSource();
    source.buffer = buffer;
    const destination = context.createMediaStreamDestination();
    source.connect(destination);
    const recorder = new MediaRecorder(destination.stream, { mimeType });
    const chunks: BlobPart[] = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) {
        chunks.push(event.data);
      }
    });
    const finished = new Promise<void>((resolve, reject) => {
      recorder.addEventListener("stop", () => resolve());
      recorder.addEventListener("error", () => reject(new Error("recorder")));
    });
    source.addEventListener("ended", () => {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    });
    recorder.start();
    source.start();
    await finished;
    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
    return {
      ok: true,
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mime: blob.type || mimeType,
    };
  } catch (_err) {
    return failure("audio_encode_failed");
  } finally {
    await context?.close().catch(() => undefined);
  }
};
