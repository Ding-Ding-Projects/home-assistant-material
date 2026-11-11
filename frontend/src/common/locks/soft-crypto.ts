/* eslint-disable no-bitwise */
/**
 * SHA-1, SHA-256, HMAC and PBKDF2 written out in script.
 *
 * The browser's own implementation (`crypto.subtle`) only exists on a secure
 * page: https, or localhost. An instance that is opened by its address on the
 * home network over plain http has none, and creating a lock failed there.
 * These give the same answers as the browser's implementation, so a lock made
 * on one kind of page opens on the other. They are slower, and they are only
 * used when the browser's implementation is missing.
 */

type Compress = (state: Int32Array, block: Uint8Array, offset: number) => void;

interface Algorithm {
  /** Bytes of digest. */
  size: number;
  initial: readonly number[];
  compress: Compress;
}

const rotl = (value: number, bits: number): number =>
  (value << bits) | (value >>> (32 - bits));

const rotr = (value: number, bits: number): number =>
  (value >>> bits) | (value << (32 - bits));

const WORDS = new Int32Array(80);

const sha1Compress: Compress = (state, block, offset) => {
  const w = WORDS;
  for (let i = 0; i < 16; i++) {
    const at = offset + i * 4;
    w[i] =
      (block[at] << 24) |
      (block[at + 1] << 16) |
      (block[at + 2] << 8) |
      block[at + 3];
  }
  for (let i = 16; i < 80; i++) {
    w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
  }
  let a = state[0];
  let b = state[1];
  let c = state[2];
  let d = state[3];
  let e = state[4];
  for (let i = 0; i < 80; i++) {
    let f: number;
    let k: number;
    if (i < 20) {
      f = (b & c) | (~b & d);
      k = 0x5a827999;
    } else if (i < 40) {
      f = b ^ c ^ d;
      k = 0x6ed9eba1;
    } else if (i < 60) {
      f = (b & c) | (b & d) | (c & d);
      k = 0x8f1bbcdc;
    } else {
      f = b ^ c ^ d;
      k = 0xca62c1d6;
    }
    const next = (rotl(a, 5) + f + e + k + w[i]) | 0;
    e = d;
    d = c;
    c = rotl(b, 30);
    b = a;
    a = next;
  }
  state[0] = (state[0] + a) | 0;
  state[1] = (state[1] + b) | 0;
  state[2] = (state[2] + c) | 0;
  state[3] = (state[3] + d) | 0;
  state[4] = (state[4] + e) | 0;
};

const K256 = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const sha256Compress: Compress = (state, block, offset) => {
  const w = WORDS;
  for (let i = 0; i < 16; i++) {
    const at = offset + i * 4;
    w[i] =
      (block[at] << 24) |
      (block[at + 1] << 16) |
      (block[at + 2] << 8) |
      block[at + 3];
  }
  for (let i = 16; i < 64; i++) {
    const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
    const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
  }
  let a = state[0];
  let b = state[1];
  let c = state[2];
  let d = state[3];
  let e = state[4];
  let f = state[5];
  let g = state[6];
  let h = state[7];
  for (let i = 0; i < 64; i++) {
    const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + s1 + ch + K256[i] + w[i]) | 0;
    const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (s0 + maj) | 0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  state[0] = (state[0] + a) | 0;
  state[1] = (state[1] + b) | 0;
  state[2] = (state[2] + c) | 0;
  state[3] = (state[3] + d) | 0;
  state[4] = (state[4] + e) | 0;
  state[5] = (state[5] + f) | 0;
  state[6] = (state[6] + g) | 0;
  state[7] = (state[7] + h) | 0;
};

const SHA1: Algorithm = {
  size: 20,
  initial: [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0],
  compress: sha1Compress,
};

const SHA256: Algorithm = {
  size: 32,
  initial: [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ],
  compress: sha256Compress,
};

export type SoftHash = "SHA-1" | "SHA-256";

const ALGORITHMS: Record<SoftHash, Algorithm> = {
  "SHA-1": SHA1,
  "SHA-256": SHA256,
};

const BLOCK = 64;

/**
 * Finishes a digest whose state has already taken `done` bytes (a multiple
 * of the block size) and still has `tail` to take.
 */
const finish = (
  algorithm: Algorithm,
  state: Int32Array,
  tail: Uint8Array,
  done: number
): Uint8Array => {
  const total = done + tail.length;
  const padded = new Uint8Array(Math.ceil((tail.length + 9) / BLOCK) * BLOCK);
  padded.set(tail);
  padded[tail.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(total / 0x20000000));
  view.setUint32(padded.length - 4, (total << 3) >>> 0);
  for (let offset = 0; offset < padded.length; offset += BLOCK) {
    algorithm.compress(state, padded, offset);
  }
  const out = new Uint8Array(algorithm.size);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < algorithm.size / 4; i++) {
    outView.setInt32(i * 4, state[i]);
  }
  return out;
};

export const softDigest = (hash: SoftHash, data: Uint8Array): Uint8Array => {
  const algorithm = ALGORITHMS[hash];
  const state = Int32Array.from(algorithm.initial);
  const whole = data.length - (data.length % BLOCK);
  for (let offset = 0; offset < whole; offset += BLOCK) {
    algorithm.compress(state, data, offset);
  }
  return finish(algorithm, state, data.subarray(whole), whole);
};

interface HmacKey {
  algorithm: Algorithm;
  /** The digest state after the inner and the outer padded key. */
  inner: Int32Array;
  outer: Int32Array;
}

const hmacKey = (hash: SoftHash, key: Uint8Array): HmacKey => {
  const algorithm = ALGORITHMS[hash];
  const block = new Uint8Array(BLOCK);
  block.set(key.length > BLOCK ? softDigest(hash, key) : key);
  const ipad = new Uint8Array(BLOCK);
  const opad = new Uint8Array(BLOCK);
  for (let i = 0; i < BLOCK; i++) {
    ipad[i] = block[i] ^ 0x36;
    opad[i] = block[i] ^ 0x5c;
  }
  const inner = Int32Array.from(algorithm.initial);
  const outer = Int32Array.from(algorithm.initial);
  algorithm.compress(inner, ipad, 0);
  algorithm.compress(outer, opad, 0);
  return { algorithm, inner, outer };
};

const hmacWith = (key: HmacKey, message: Uint8Array): Uint8Array => {
  const { algorithm } = key;
  const state = Int32Array.from(key.inner);
  const whole = message.length - (message.length % BLOCK);
  for (let offset = 0; offset < whole; offset += BLOCK) {
    algorithm.compress(state, message, offset);
  }
  const innerDigest = finish(
    algorithm,
    state,
    message.subarray(whole),
    BLOCK + whole
  );
  return finish(algorithm, Int32Array.from(key.outer), innerDigest, BLOCK);
};

export const softHmac = (
  hash: SoftHash,
  key: Uint8Array,
  message: Uint8Array
): Uint8Array => hmacWith(hmacKey(hash, key), message);

/** How many rounds run before the page gets a turn, so it stays responsive. */
const ROUNDS_PER_TURN = 20000;

const nextTurn = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/** PBKDF2 with HMAC (RFC 8018). `length` is in bytes. */
export const softPbkdf2 = async (
  hash: SoftHash,
  password: Uint8Array,
  salt: Uint8Array,
  rounds: number,
  length: number
): Promise<Uint8Array> => {
  const key = hmacKey(hash, password);
  const size = key.algorithm.size;
  const out = new Uint8Array(length);
  const first = new Uint8Array(salt.length + 4);
  first.set(salt);
  let sinceTurn = 0;
  for (let index = 1, at = 0; at < length; index++, at += size) {
    new DataView(first.buffer).setUint32(salt.length, index);
    let u = hmacWith(key, first);
    const block = Uint8Array.from(u);
    for (let round = 1; round < rounds; round++) {
      u = hmacWith(key, u);
      for (let i = 0; i < size; i++) {
        block[i] ^= u[i];
      }
      if (++sinceTurn >= ROUNDS_PER_TURN) {
        sinceTurn = 0;
        // eslint-disable-next-line no-await-in-loop
        await nextTurn();
      }
    }
    out.set(block.subarray(0, Math.min(size, length - at)), at);
  }
  return out;
};

/** Whether the browser's own implementation can be used on this page. */
export const hasNativeCrypto = (): boolean =>
  typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined";
