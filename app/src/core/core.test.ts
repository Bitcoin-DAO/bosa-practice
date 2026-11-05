import { describe, expect, it } from 'vitest';
import { jcs, hashJson } from './util';
import { shortCode, formatShortCode } from './shortcode';
import { descriptorChecksum, buildDescriptor, parseDescriptor, parseKeyOrigin, treasuryAddress } from './descriptor';
import {
  cardPayload, newSecret, parseCard, pubkeyOf, prfSalt, unwrapSecret, wrapSecret,
  treasuryKeyFromMnemonic, parseFounderCode,
} from './identity';
import { KIND, sign, template } from './events';
import { rebuild } from './state';
import type { SiteConfig } from './config';
import { buildGenesis } from './config';

const MNEMONICS = [
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  'legal winner thank year wave sausage worth useful legal winner thank yellow',
  'letter advice cage absurd amount doctor acoustic avoid letter advice cage above',
  'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong',
  'ozone drill grab fiber curtain grace pudding thank cruise elder eight picnic',
];

describe('canonical JSON', () => {
  it('sorts keys and drops whitespace (RFC 8785)', () => {
    expect(jcs({ b: 1, a: [true, null, 'x'], c: { z: 1.5, y: 'é' } })).toBe('{"a":[true,null,"x"],"b":1,"c":{"y":"é","z":1.5}}');
    expect(jcs({ 'é': 1, z: 2, Z: 3 })).toBe('{"Z":3,"z":2,"é":1}');
    expect(jcs(1e21)).toBe('1e+21');
    expect(hashJson({ a: 1 })).toBe(hashJson(JSON.parse(' { "a" : 1 } ')));
  });
});

describe('short code', () => {
  it('is 8 Crockford characters and stable', () => {
    const k = pubkeyOf('0000000000000000000000000000000000000000000000000000000000000001');
    const c = shortCode(k);
    expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(shortCode(k)).toBe(c);
    expect(formatShortCode(c)).toBe(`${c.slice(0, 4)} · ${c.slice(4)}`);
  });
});

describe('descriptor', () => {
  it('matches the BIP-380 checksum test vector', () => {
    expect(descriptorChecksum('raw(deadbeef)')).toBe('89f8spxm');
    expect(
      descriptorChecksum(
        "pkh([d34db33f/44'/0'/0']xpub6ERApfZwUNrhLCkDtcHTcxd75RbzS1ed54G1LkBUHQVHQKqhMkhgbmJbZRkrgZw4koxb5JaHWkY4ALHY2grBGRjaDMzQLcgJvLJuZZvRcEL/1/*)",
      ),
    ).toBe('ml40v0wf');
  });

  it('builds, parses and derives a 3-of-5 testnet4 treasury', () => {
    const keys = MNEMONICS.map(m => treasuryKeyFromMnemonic(m, 'testnet4'));
    expect(keys[0].fingerprint).toBe('73c5da0a');
    expect(keys[0].xpub.startsWith('tpub')).toBe(true);
    const desc = buildDescriptor(3, keys, 'testnet4');
    const parsed = parseDescriptor(desc, 'testnet4');
    expect(parsed.threshold).toBe(3);
    expect(parsed.keys.map(k => k.fingerprint)).toEqual(keys.map(k => k.fingerprint));
    const a0 = treasuryAddress(parsed, 'testnet4', 0, 0).address;
    expect(a0).toMatch(/^tb1q[0-9a-z]{58}$/);
    expect(treasuryAddress(parsed, 'testnet4', 1, 0).address).not.toBe(a0);
    expect(() => parseDescriptor(desc.slice(0, -1) + 'x', 'testnet4')).toThrow();
    expect(() => parseKeyOrigin(`[${keys[0].fingerprint}/48h/0h/0h/2h]${keys[0].xpub}`, 'testnet4')).toThrow();
    expect(parseKeyOrigin(`[${keys[0].fingerprint.toUpperCase()}/48'/1'/0'/2']${keys[0].xpub}/<0;1>/*`, 'testnet4').fingerprint).toBe(keys[0].fingerprint);
  });
});

describe('identity', () => {
  it('wraps and unwraps with a PRF output, and rejects a wrong one', () => {
    const s = newSecret();
    const prf = prfSalt('ab'.repeat(32));
    const w = wrapSecret(prf, s);
    expect(unwrapSecret(prf, w)).toBe(s);
    expect(() => unwrapSecret(prfSalt('cd'.repeat(32)), w)).toThrow();
  });

  it('prints and scans identity cards', () => {
    const dao = 'a41c9e07' + '0'.repeat(56);
    const s = newSecret();
    const p = cardPayload(dao, s);
    expect(p).toMatch(/^BTCDAO:1:A41C9E07:[0-9A-F]{64}$/);
    expect(parseCard(p.toLowerCase().replace(/(.{10})/g, '$1 \n'), dao)).toEqual({ ok: true, secret: s, dao8: 'a41c9e07' });
    expect(parseCard(p, 'ff' + dao.slice(2))).toEqual({ ok: false, reason: 'other-dao' });
    expect(parseCard('BTCDAO:1:A41C9E07:' + '0'.repeat(64), dao)).toEqual({ ok: false, reason: 'secret' });
    expect(parseCard('hello', dao)).toEqual({ ok: false, reason: 'format' });
  });

  it('reads founder codes', () => {
    const key = pubkeyOf(newSecret());
    expect(parseFounderCode(JSON.stringify({ t: 'btcdao-founder', v: 1, name: '@elena', key }))?.name).toBe('@elena');
    expect(parseFounderCode(JSON.stringify({ t: 'btcdao-founder', v: 1, name: '', key }))).toBeUndefined();
    const shared = `Sandbox DAO · Founder · @elena · ABCD-EFGH\n\n${JSON.stringify({ t: 'btcdao-founder', v: 1, name: '@elena', key })}`;
    expect(parseFounderCode(shared)?.name).toBe('@elena');
    expect(parseFounderCode('no code here')).toBeUndefined();
  });
});

// ---- founding, end to end on events ----

const site: SiteConfig = {
  configVersion: 1, name: 'UNO', description: 'x', languages: ['it', 'en'], network: 'testnet4',
  site: 'https://bitcoin-dao.github.io/uno-testnet', passkeyDomain: 'bitcoin-dao.github.io',
  council: [], founders: [], threshold: 3, descriptor: '',
  relays: ['wss://relay.example', 'wss://[public relay 1]'], chainApi: ['https://mempool.space/testnet4/api'],
  rules: {
    votingPeriodDays: 7, quorum: '1/3', simpleMajority: [], twoThirdsMajority: [], payoutRound: 'monthly',
    timezone: 'Europe/Rome', lapseAfterRounds: 2, maxFeeRateSatVb: 20, treasuryCapSats: 5_000_000,
    remoteVerification: {}, minimumAge: 18, charterSha256: '[x]',
  },
};

function founding() {
  const councilSecrets = MNEMONICS.map(() => newSecret());
  const founderSecret = newSecret();
  const tkeys = MNEMONICS.map(m => treasuryKeyFromMnemonic(m, 'testnet4'));
  const genesis = buildGenesis(site, {
    name: 'UNO', description: 'd',
    council: councilSecrets.map((s, i) => ({ label: `@c${i}`, identityKey: pubkeyOf(s), fingerprint: tkeys[i].fingerprint, xpub: tkeys[i].xpub })),
    founders: [{ name: '@elena', identityKey: pubkeyOf(founderSecret), verified: 'in_person' }],
    threshold: 3, descriptor: buildDescriptor(3, tkeys, 'testnet4'), charterSha256: 'ab'.repeat(32),
  });
  const daoId = hashJson(genesis);
  const g = sign(template(KIND.genesis, daoId, genesis, [], 1000), councilSecrets[0]);
  const endorse = (i: number, at: number, hash = daoId) =>
    sign(template(KIND.endorse, daoId, { object: 'genesis', hash }, [['e', g.id]], at), councilSecrets[i]);
  return { councilSecrets, founderSecret, genesis, daoId, g, endorse };
}

describe('founding (protocol 3.1, 3.2, 3.5)', () => {
  it('drops placeholder relays from the genesis', () => {
    expect(founding().genesis.relays).toEqual(['wss://relay.example']);
  });

  it('is pending until threshold distinct council endorsements, then founded', () => {
    const f = founding();
    let s = rebuild(site, [f.g, f.endorse(0, 1001), f.endorse(1, 1002), f.endorse(1, 1003)]);
    expect(s.founded).toBeUndefined();
    expect(s.pending[0].endorsers.length).toBe(2);
    s = rebuild(site, [f.endorse(2, 1010), f.g, f.endorse(0, 1001), f.endorse(1, 1002)]);
    expect(s.founded?.daoId).toBe(f.daoId);
    expect(s.founded?.effectiveAt).toBe(1010);
    expect(s.members.length).toBe(6);
    expect(s.members.filter(m => m.council).length).toBe(5);
  });

  it('ignores endorsements from non-council keys and with the wrong hash', () => {
    const f = founding();
    const outsider = sign(template(KIND.endorse, f.daoId, { object: 'genesis', hash: f.daoId }, [['e', f.g.id]], 1001), f.founderSecret);
    const s = rebuild(site, [f.g, f.endorse(0, 1001), f.endorse(1, 1002), outsider, f.endorse(2, 1003, 'ff'.repeat(32))]);
    expect(s.founded).toBeUndefined();
    expect(s.rejected.map(r => r.reason)).toEqual(
      expect.arrayContaining(['endorse: signer is not on the council', 'endorse: wrong object or hash']),
    );
  });

  it('rejects a genesis signed by a non-council key or with a wrong D tag', () => {
    const f = founding();
    const bySomeoneElse = sign(template(KIND.genesis, f.daoId, f.genesis, [], 1000), f.founderSecret);
    const wrongD = sign(template(KIND.genesis, 'ff'.repeat(32), f.genesis, [], 1000), f.councilSecrets[0]);
    const s = rebuild(site, [bySomeoneElse, wrongD]);
    expect(s.pending.length).toBe(0);
    expect(s.rejected.length).toBe(2);
  });

  it('ignores another site\'s genesis, unless the site file names its id', () => {
    const f = founding();
    const other = { ...site, site: 'https://elsewhere.example' };
    expect(rebuild(other, [f.g]).pending.length).toBe(0);
    expect(rebuild({ ...other, daoId: f.daoId }, [f.g]).pending.length).toBe(1);
  });

  it('accepts keywraps from members only, latest per credential', () => {
    const f = founding();
    const kw = (secret: string, c: string, at: number, ct: string) =>
      sign(template(KIND.keywrap, f.daoId, { nonce: '00'.repeat(24), ct }, [['c', c]], at), secret);
    const s = rebuild(site, [
      f.g, f.endorse(0, 1001), f.endorse(1, 1002), f.endorse(2, 1003),
      kw(f.founderSecret, 'c1', 1100, 'aa'), kw(f.founderSecret, 'c1', 1200, 'bb'), kw(newSecret(), 'c2', 1100, 'cc'),
    ]);
    expect(s.keywraps.get('c1')?.ct).toBe('bb');
    expect(s.keywraps.has('c2')).toBe(false);
  });

  it('drops tampered events and duplicates', () => {
    const f = founding();
    const tampered = { ...f.endorse(0, 1001), created_at: 999 };
    const s = rebuild(site, [f.g, f.g, tampered]);
    expect(s.rejected.map(r => r.reason)).toContain('bad signature');
    expect(s.pending.length).toBe(1);
  });
});

describe('competing genesis for the same site', () => {
  it('flags a conflict and prefers the one listing this device\'s key', () => {
    const real = founding();
    const fake = founding();
    const evs = [
      fake.g, fake.endorse(0, 900), fake.endorse(1, 901), fake.endorse(2, 902),
      real.g, real.endorse(0, 1001), real.endorse(1, 1002), real.endorse(2, 1003),
    ];
    const plain = rebuild(site, evs);
    expect(plain.conflict).toBe(true);
    expect(plain.founded?.daoId).toBe(fake.daoId); // earliest wins without a preference
    const mine = rebuild(site, evs, pubkeyOf(real.founderSecret));
    expect(mine.founded?.daoId).toBe(real.daoId);
    expect(rebuild({ ...site, daoId: real.daoId }, evs).conflict).toBe(false);
  });
});
