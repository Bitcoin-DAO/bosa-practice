// Identity keys, passkey wrapping (protocol 1.5), identity cards (1.7) and test treasury keys.
import { schnorr, secp256k1 } from '@noble/curves/secp256k1';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/hashes/utils';
import { HDKey } from '@scure/bip32';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { bytesToHex, hexToBytes, utf8ToBytes } from './util';
import type { Network } from './config';
import { BIP48_PATH } from './config';
import { VERSIONS } from './descriptor';

const N = secp256k1.CURVE.n;

export const isValidSecret = (hex: string) => {
  if (!/^[0-9a-f]{64}$/.test(hex)) return false;
  const k = BigInt('0x' + hex);
  return k >= 1n && k < N;
};

export function newSecret(): string {
  for (;;) {
    const s = bytesToHex(randomBytes(32));
    if (isValidSecret(s)) return s;
  }
}

export const pubkeyOf = (secretHex: string) => bytesToHex(schnorr.getPublicKey(hexToBytes(secretHex)));

/** PRF salt: sha256("btc-dao/identity/v1/" || dao_id). */
export const prfSalt = (daoId: string) =>
  sha256(new Uint8Array([...utf8ToBytes('btc-dao/identity/v1/'), ...hexToBytes(daoId)]));

const wrapKey = (prf: Uint8Array) => hkdf(sha256, prf, new Uint8Array(0), utf8ToBytes('btc-dao identity wrap v1'), 32);

export interface Wrapped {
  nonce: string;
  ct: string;
}

export function wrapSecret(prf: Uint8Array, secretHex: string): Wrapped {
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(wrapKey(prf), nonce).encrypt(hexToBytes(secretHex));
  return { nonce: bytesToHex(nonce), ct: bytesToHex(ct) };
}

export function unwrapSecret(prf: Uint8Array, w: Wrapped): string {
  const pt = xchacha20poly1305(wrapKey(prf), hexToBytes(w.nonce)).decrypt(hexToBytes(w.ct));
  return bytesToHex(pt);
}

// ---- identity cards ----

export const cardPayload = (daoId: string, secretHex: string) =>
  `BTCDAO:1:${daoId.slice(0, 8)}:${secretHex}`.toUpperCase();

export type CardResult =
  | { ok: true; secret: string; dao8: string }
  | { ok: false; reason: 'format' | 'other-dao' | 'secret' };

/** Any letter case; spaces and line breaks ignored. */
export function parseCard(text: string, daoId?: string): CardResult {
  const s = text.replace(/\s+/g, '').toUpperCase();
  const m = s.match(/^BTCDAO:1:([0-9A-F]{8}):([0-9A-F]{64})$/);
  if (!m) return { ok: false, reason: 'format' };
  const dao8 = m[1].toLowerCase();
  const secret = m[2].toLowerCase();
  if (daoId && dao8 !== daoId.slice(0, 8)) return { ok: false, reason: 'other-dao' };
  if (!isValidSecret(secret)) return { ok: false, reason: 'secret' };
  return { ok: true, secret, dao8 };
}

// ---- founder sign-up QR ----

export interface FounderCode {
  t: 'btcdao-founder';
  v: 1;
  name: string;
  key: string;
  council?: { fingerprint: string; xpub: string };
}

/** Accepts the bare code, or a shared message that contains it (the code is the {...} part). */
export function parseFounderCode(text: string): FounderCode | undefined {
  try {
    const s = text.trim();
    const o = JSON.parse(s.startsWith('{') ? s : s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
    if (o?.t !== 'btcdao-founder' || o.v !== 1) return undefined;
    if (typeof o.name !== 'string' || !o.name.trim() || o.name.length > 40) return undefined;
    if (!/^[0-9a-f]{64}$/.test(o.key)) return undefined;
    if (o.council && !(/^[0-9a-f]{8}$/.test(o.council.fingerprint) && typeof o.council.xpub === 'string')) return undefined;
    return o as FounderCode;
  } catch {
    return undefined;
  }
}

// ---- test treasury keys (trial only; the mainnet DAO uses SeedSigner) ----

export interface TestTreasuryKey {
  mnemonic: string;
  fingerprint: string;
  xpub: string;
}

export function treasuryKeyFromMnemonic(mnemonic: string, network: Network): TestTreasuryKey {
  if (!validateMnemonic(mnemonic, wordlist)) throw new Error('mnemonic');
  const master = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic), VERSIONS[network]);
  const acct = master.derive('m/' + BIP48_PATH(network).replace(/h/g, "'"));
  return {
    mnemonic,
    fingerprint: master.fingerprint.toString(16).padStart(8, '0'),
    xpub: acct.publicExtendedKey,
  };
}

export const newTestTreasuryKey = (network: Network) =>
  treasuryKeyFromMnemonic(generateMnemonic(wordlist, 128), network);
