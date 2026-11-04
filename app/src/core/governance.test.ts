// Protocol sections 3.3, 3.4, 4 and 5: proposals, votes, tallies, rosters, settings and membership.
import { describe, expect, it } from 'vitest';
import { p2wpkh, TEST_NETWORK } from '@scure/btc-signer';
import { secp256k1 } from '@noble/curves/secp256k1';
import { hexToBytes } from '@noble/hashes/utils';
import { buildGenesis, type SiteConfig } from './config';
import { buildDescriptor, parseDescriptor, treasuryAddress } from './descriptor';
import { KIND, sign, template, type Event } from './events';
import { newSecret, pubkeyOf, treasuryKeyFromMnemonic } from './identity';
import { shortCode } from './shortcode';
import { nextRoster, nextSettings, rebuild, type DaoState, type ProposalContent, type TallyContent } from './state';
import { hashJson, parseJson } from './util';
import { roundDatesAfter } from './time';

const MNEMONICS = [
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  'legal winner thank year wave sausage worth useful legal winner thank yellow',
  'letter advice cage absurd amount doctor acoustic avoid letter advice cage above',
  'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong',
  'ozone drill grab fiber curtain grace pudding thank cruise elder eight picnic',
];
const DAY = 86400;
const ADDR = p2wpkh(secp256k1.getPublicKey(hexToBytes('11'.repeat(32)), true), TEST_NETWORK).address!;

const site: SiteConfig = {
  configVersion: 1, name: 'UNO', description: 'x', languages: ['it'], network: 'testnet4',
  site: 'https://bitcoin-dao.github.io/uno-testnet', passkeyDomain: 'bitcoin-dao.github.io',
  council: [], founders: [], threshold: 3, descriptor: '', relays: [], chainApi: [],
  rules: {
    votingPeriodDays: 7, quorum: '1/3', simpleMajority: ['payout', 'statement', 'addMember'],
    twoThirdsMajority: ['removeMember', 'changeRules', 'changeCouncil', 'close'], payoutRound: 'monthly',
    timezone: 'Europe/Rome', lapseAfterRounds: 2, maxFeeRateSatVb: 20, treasuryCapSats: 5_000_000,
    remoteVerification: {}, minimumAge: 18, charterSha256: 'ab'.repeat(32),
  },
};

/** A founded DAO: 5 council (c0..c4), 4 founders (f0..f3). 9 members, quorum 3. */
function dao(rules: Partial<SiteConfig['rules']> = {}) {
  const c = MNEMONICS.map(() => newSecret());
  const f = [0, 1, 2, 3].map(() => newSecret());
  const tk = MNEMONICS.map(m => treasuryKeyFromMnemonic(m, 'testnet4'));
  const descriptor = buildDescriptor(3, tk, 'testnet4');
  const genesis = buildGenesis({ ...site, rules: { ...site.rules, ...rules } }, {
    name: 'UNO', description: 'd',
    council: c.map((s, i) => ({ label: `@c${i}`, identityKey: pubkeyOf(s), fingerprint: tk[i].fingerprint, xpub: tk[i].xpub })),
    founders: f.map((s, i) => ({ name: `@f${i}`, identityKey: pubkeyOf(s), verified: 'in_person' as const })),
    threshold: 3, descriptor, charterSha256: 'ab'.repeat(32),
  });
  const daoId = hashJson(genesis);
  const events: Event[] = [];
  const ev = (kind: number, content: unknown, secret: string, at: number, tags: string[][] = []) => {
    const e = sign(template(kind, daoId, content, tags, at), secret);
    events.push(e);
    return e;
  };
  const g = ev(KIND.genesis, genesis, c[0], 1000);
  [0, 1, 2].forEach(i => ev(KIND.endorse, { object: 'genesis', hash: daoId }, c[i], 1001 + i, [['e', g.id]]));
  const T = 2000; // after founding
  const state = (now: number) => rebuild(site, events, undefined, now);
  const propose = (secret: string, content: Partial<ProposalContent> & { type: ProposalContent['type'] }, at: number) =>
    ev(KIND.proposal, { title: 'T', summary: 'S', lang: 'it', payload: {}, ...content }, secret, at);
  const vote = (secret: string, p: Event, choice: string, at: number) => ev(KIND.vote, { choice }, secret, at, [['e', p.id]]);
  const tally = (secret: string, s: DaoState, p: Event, at: number, override?: Partial<TallyContent>) => {
    const view = s.proposals.find(x => x.event.id === p.id)!;
    return ev(KIND.tally, { ...view.recount, ...override }, secret, at, [['e', p.id]]);
  };
  const endorse = (secret: string, target: Event, object: string, at: number) =>
    ev(KIND.endorse, { object, hash: hashJson(parseJson(target.content)) }, secret, at, [['e', target.id]]);
  const treasury0 = treasuryAddress(parseDescriptor(descriptor, 'testnet4'), 'testnet4', 0, 0).address;
  return { c, f, daoId, events, ev, state, propose, vote, tally, endorse, T, treasury0 };
}

const view = (s: DaoState, p: Event) => s.proposals.find(x => x.event.id === p.id)!;

describe('proposals and votes (4.1, 4.3)', () => {
  it('counts the latest vote per member, excludes late and non-member votes, and passes once tallied', () => {
    const d = dao();
    const p = d.propose(d.f[0], { type: 'statement', title: 'Carta fondativa' }, d.T);
    d.vote(d.f[0], p, 'no', d.T + 10);
    d.vote(d.f[0], p, 'yes', d.T + 20); // changed
    d.vote(d.f[1], p, 'yes', d.T + 30);
    d.vote(d.c[1], p, 'abstain', d.T + 40);
    d.vote(newSecret(), p, 'yes', d.T + 50); // not a member
    d.vote(d.f[2], p, 'no', d.T + 7 * DAY + 1); // late
    let s = d.state(d.T + DAY);
    let v = view(s, p);
    expect(v.number).toBe(1);
    expect(v.status).toBe('open');
    expect(v.counts).toEqual({ yes: 2, no: 0, abstain: 1 });
    expect(v.eligible.size).toBe(9);
    expect(v.quorumNeeded).toBe(3);
    s = d.state(d.T + 8 * DAY);
    v = view(s, p);
    expect(v.status).toBe('awaiting_tally');
    expect(v.recount.excluded.map(x => x.reason).sort()).toEqual(['late', 'not_eligible', 'superseded']);
    d.tally(d.c[2], s, p, d.T + 8 * DAY);
    v = view(d.state(d.T + 8 * DAY + 1), p);
    expect(v.status).toBe('passed');
    expect(v.tallyMismatch).toBe(false);
  });

  it('fails quorum, and needs two-thirds where the rules say so', () => {
    const d = dao();
    const p1 = d.propose(d.f[0], { type: 'statement' }, d.T);
    d.vote(d.f[0], p1, 'yes', d.T + 1);
    d.vote(d.f[1], p1, 'yes', d.T + 1);
    const p2 = d.propose(d.c[0], { type: 'remove_member', payload: { member_key: pubkeyOf(d.f[3]), reason: 'x' } }, d.T + 5);
    for (const [i, ch] of [[0, 'yes'], [1, 'yes'], [2, 'no']] as const) d.vote(d.f[i], p2, ch, d.T + 10);
    const s = d.state(d.T + 8 * DAY);
    d.tally(d.c[0], s, p1, d.T + 8 * DAY);
    d.tally(d.c[0], s, p2, d.T + 8 * DAY);
    const s2 = d.state(d.T + 8 * DAY + 1);
    expect(view(s2, p1).status).toBe('no_quorum');
    expect(view(s2, p2).twoThirds).toBe(true);
    expect(view(s2, p2).status).toBe('passed'); // 2 of 3 is two-thirds
    d.vote(d.f[3], p2, 'no', d.T + 11);
    expect(view(d.state(d.T + 8 * DAY + 1), p2).recount.result.passed).toBe(false);
  });

  it('rejects tallies from outside the council and flags conflicting ones until the council endorses one', () => {
    const d = dao();
    const p = d.propose(d.f[0], { type: 'statement' }, d.T);
    for (const i of [0, 1, 2]) d.vote(d.f[i], p, 'yes', d.T + 1);
    const s = d.state(d.T + 8 * DAY);
    d.tally(d.f[0], s, p, d.T + 8 * DAY); // not council
    expect(view(d.state(d.T + 8 * DAY + 1), p).status).toBe('awaiting_tally');
    const good = d.tally(d.c[0], s, p, d.T + 8 * DAY);
    d.tally(d.c[1], s, p, d.T + 8 * DAY + 2); // identical: one tally
    expect(view(d.state(d.T + 8 * DAY + 3), p).status).toBe('passed');
    d.tally(d.c[3], s, p, d.T + 8 * DAY + 3, { result: { yes: 0, no: 3, abstain: 0, quorum_met: true, passed: false } });
    expect(view(d.state(d.T + 8 * DAY + 4), p).status).toBe('disputed');
    for (const i of [0, 1, 2]) d.endorse(d.c[i], good, 'tally', d.T + 9 * DAY);
    expect(view(d.state(d.T + 9 * DAY + 1), p).status).toBe('passed');
  });

  it('rejects a proposal backdated before the last tallied one, so numbers never change', () => {
    const d = dao();
    const p1 = d.propose(d.f[0], { type: 'statement' }, d.T + 100);
    const s = d.state(d.T + 8 * DAY);
    d.tally(d.c[0], s, p1, d.T + 8 * DAY);
    const back = d.propose(d.f[1], { type: 'statement' }, d.T + 50);
    const s2 = d.state(d.T + 8 * DAY + 1);
    expect(view(s2, p1).number).toBe(1);
    expect(s2.proposals.some(x => x.event.id === back.id)).toBe(false);
    expect(s2.rejected.some(r => r.event.id === back.id)).toBe(true);
  });

  it('validates payouts: network, dust, the treasury itself; confirmations from any key', () => {
    const d = dao();
    const bad = [
      d.propose(d.f[0], { type: 'payout', payload: { recipient: 'X', outputs: [{ address: 'bc1qnotours', amount_sat: 1000 }] } }, d.T),
      d.propose(d.f[0], { type: 'payout', payload: { recipient: 'X', outputs: [{ address: ADDR, amount_sat: 300 }] } }, d.T + 1),
      d.propose(d.f[0], { type: 'payout', payload: { recipient: 'X', outputs: [{ address: d.treasury0, amount_sat: 1000 }] } }, d.T + 2),
    ];
    const ok = d.propose(d.f[0], { type: 'payout', payload: { recipient: 'Tipografia', outputs: [{ address: ADDR, amount_sat: 120000 }] } }, d.T + 3);
    let s = d.state(d.T + 10);
    expect(s.proposals.map(x => x.event.id)).toEqual([ok.id]);
    expect(bad.every(b => s.rejected.some(r => r.event.id === b.id))).toBe(true);
    expect(view(s, ok).confirmed).toBe(false);
    d.ev(KIND.confirm, { address: 'tb1qsomethingelse' }, newSecret(), d.T + 11, [['e', ok.id]]);
    d.ev(KIND.confirm, { address: ADDR }, newSecret(), d.T + 12, [['e', ok.id]]);
    s = d.state(d.T + 20);
    expect(view(s, ok).confirmed).toBe(true);
  });
});

describe('membership (3.3, 5.1-5.3)', () => {
  function addMember(d: ReturnType<typeof dao>, at: number, mode: 'in_person' | 'remote' = 'in_person') {
    const cand = newSecret();
    const key = pubkeyOf(cand);
    const v1 = d.ev(KIND.verify, { candidate_key: key, mode, short_code: shortCode(key) }, d.c[0], at, [['p', key]]);
    const verify = [v1.id];
    if (mode === 'remote') verify.push(d.ev(KIND.verify, { candidate_key: key, mode, short_code: shortCode(key) }, d.c[1], at + 1, [['p', key]]).id);
    const p = d.propose(d.f[0], { type: 'add_member', payload: { candidate_key: key, name: '@nina', verify } }, at + 10);
    for (const i of [0, 1, 2]) d.vote(d.f[i], p, 'yes', at + 20);
    d.tally(d.c[0], d.state(at + 8 * DAY), p, at + 8 * DAY);
    return { cand, key, p };
  }
  function publishRoster(d: ReturnType<typeof dao>, at: number, edit?: (r: any) => void) {
    const s = d.state(at);
    const r = nextRoster(s, '2026-11-20')!;
    edit?.(r);
    const e = d.ev(KIND.roster, r, d.c[0], at);
    for (const i of [0, 1, 2]) d.endorse(d.c[i], e, 'roster', at + 1 + i);
    return e;
  }

  it('adds a verified candidate after a passed vote and a new roster version', () => {
    const d = dao();
    const { key } = addMember(d, d.T);
    let s = d.state(d.T + 8 * DAY + 1);
    expect(s.pendingRoster.length).toBe(1);
    expect(s.members.some(m => m.key === key)).toBe(false);
    publishRoster(d, d.T + 8 * DAY + 10);
    s = d.state(d.T + 9 * DAY);
    expect(s.rosters.length).toBe(2);
    expect(s.members.find(m => m.key === key)?.name).toBe('@nina');
    expect(s.pendingRoster).toEqual([]);
  });

  it('refuses an add_member without a valid verification, and a roster adding someone without basis', () => {
    const d = dao();
    const key = pubkeyOf(newSecret());
    const fake = d.ev(KIND.verify, { candidate_key: key, mode: 'in_person', short_code: shortCode(key) }, d.f[0], d.T, [['p', key]]);
    const p = d.propose(d.f[0], { type: 'add_member', payload: { candidate_key: key, name: '@x', verify: [fake.id] } }, d.T + 1);
    let s = d.state(d.T + 2);
    expect(s.proposals.some(x => x.event.id === p.id)).toBe(false);
    addMember(d, d.T + 10);
    const intruder = pubkeyOf(newSecret());
    publishRoster(d, d.T + 8 * DAY + 100, r => r.members.push({ key: intruder, name: '@intruder', since: '2026-11-20', verified: 'in_person', council: false }));
    s = d.state(d.T + 9 * DAY);
    expect(s.rosters.length).toBe(1);
    expect(s.rosterCandidates[0].error).toBe('members do not follow from the basis');
  });

  it('remote joins need two council verifications', () => {
    const d = dao();
    const key = pubkeyOf(newSecret());
    const v = d.ev(KIND.verify, { candidate_key: key, mode: 'remote', short_code: shortCode(key) }, d.c[0], d.T, [['p', key]]);
    const p = d.propose(d.f[0], { type: 'add_member', payload: { candidate_key: key, name: '@r', verify: [v.id] } }, d.T + 1);
    expect(d.state(d.T + 2).proposals.some(x => x.event.id === p.id)).toBe(false);
    const { key: k2 } = addMember(d, d.T + 10, 'remote');
    publishRoster(d, d.T + 8 * DAY + 100);
    expect(d.state(d.T + 9 * DAY).members.find(m => m.key === k2)?.verified).toBe('remote');
  });

  it('a member who leaves loses their vote on open proposals and is dropped from the next roster', () => {
    const d = dao();
    const p = d.propose(d.f[0], { type: 'statement' }, d.T);
    d.vote(d.f[3], p, 'yes', d.T + 1);
    d.ev(KIND.leave, {}, d.f[3], d.T + 2);
    d.ev(KIND.leave, {}, d.c[4], d.T + 3); // council cannot leave this way
    let s = d.state(d.T + 3 * DAY);
    expect(view(s, p).counts.yes).toBe(0);
    expect(view(s, p).eligible.size).toBe(8);
    expect(s.pendingRoster.length).toBe(1);
    publishRoster(d, d.T + 3 * DAY);
    s = d.state(d.T + 4 * DAY);
    expect(s.members.length).toBe(8);
    expect(s.members.some(m => m.key === pubkeyOf(d.c[4]))).toBe(true);
  });

  it('replaces a key: the person keeps their vote, the old key stops counting, the roster follows', () => {
    const d = dao();
    const p = d.propose(d.f[0], { type: 'statement' }, d.T);
    d.vote(d.f[1], p, 'yes', d.T + 1);
    const nu = newSecret();
    const nk = pubkeyOf(nu);
    const rk = d.ev(KIND.rekey, { old_key: pubkeyOf(d.f[1]), new_key: nk, mode: 'in_person', short_code: shortCode(nk) }, d.c[0], d.T + 10, [['p', pubkeyOf(d.f[1])], ['p', nk]]);
    for (const i of [0, 1]) d.endorse(d.c[i], rk, 'rekey', d.T + 11);
    let s = d.state(d.T + 20);
    expect(s.rekeys[0].effectiveAt).toBeUndefined();
    d.endorse(d.c[2], rk, 'rekey', d.T + 30);
    s = d.state(d.T + 40);
    expect(s.rekeys[0].effectiveAt).toBe(d.T + 30);
    expect(view(s, p).counts.yes).toBe(1); // inherited
    d.vote(d.f[1], p, 'no', d.T + 50); // old key, after the replacement: ignored
    d.vote(nu, p, 'abstain', d.T + 60); // new key changes the vote
    s = d.state(d.T + 70);
    expect(view(s, p).counts).toEqual({ yes: 0, no: 0, abstain: 1 });
    expect(s.pendingRoster).toEqual([rk.id]);
    publishRoster(d, d.T + 100);
    s = d.state(d.T + 200);
    expect(s.members.find(m => m.name === '@f1')?.key).toBe(nk);
    expect(s.personOf(nk)).toBe(pubkeyOf(d.f[1]));
  });

  it('a remote key replacement also needs a second council member\'s verification', () => {
    const d = dao();
    const nk = pubkeyOf(newSecret());
    const rk = d.ev(KIND.rekey, { old_key: pubkeyOf(d.f[0]), new_key: nk, mode: 'remote', short_code: shortCode(nk) }, d.c[0], d.T, []);
    for (const i of [0, 1, 2]) d.endorse(d.c[i], rk, 'rekey', d.T + 1);
    expect(d.state(d.T + 5).rekeys[0].needsSecondVerify).toBe(true);
    d.ev(KIND.verify, { candidate_key: nk, mode: 'remote', short_code: shortCode(nk) }, d.c[3], d.T + 6, [['p', nk]]);
    expect(d.state(d.T + 7).rekeys[0].effectiveAt).toBe(d.T + 6);
  });
});

describe('settings (3.4)', () => {
  it('a passed rules change becomes settings version 2, and later proposals use it', () => {
    const d = dao();
    const p = d.propose(d.c[0], { type: 'change_rules', payload: { changes: [{ path: 'rules.votingPeriodDays', from: 7, to: 3 }] } }, d.T);
    for (const i of [0, 1, 2]) d.vote(d.f[i], p, 'yes', d.T + 1);
    d.tally(d.c[0], d.state(d.T + 8 * DAY), p, d.T + 8 * DAY);
    let s = d.state(d.T + 8 * DAY + 1);
    expect(s.pendingSettings).toEqual([p.id]);
    const next = nextSettings(s)!;
    const e = d.ev(KIND.settings, next, d.c[0], d.T + 8 * DAY + 2);
    for (const i of [0, 1, 2]) d.endorse(d.c[i], e, 'settings', d.T + 8 * DAY + 3);
    const q = d.propose(d.f[0], { type: 'statement' }, d.T + 9 * DAY);
    s = d.state(d.T + 9 * DAY + 1);
    expect(s.settings.length).toBe(2);
    expect(s.rules?.votingPeriodDays).toBe(3);
    expect(view(s, q).closeAt).toBe(d.T + 12 * DAY);
    expect(view(s, p).closeAt).toBe(d.T + 7 * DAY); // earlier proposals keep their rules
  });

  it('refuses settings that change more than the basis says', () => {
    const d = dao();
    const p = d.propose(d.c[0], { type: 'change_rules', payload: { changes: [{ path: 'rules.votingPeriodDays', from: 7, to: 3 }] } }, d.T);
    for (const i of [0, 1, 2]) d.vote(d.f[i], p, 'yes', d.T + 1);
    d.tally(d.c[0], d.state(d.T + 8 * DAY), p, d.T + 8 * DAY);
    const next = nextSettings(d.state(d.T + 8 * DAY + 1))!;
    next.rules.treasuryCapSats = 999_999_999;
    const e = d.ev(KIND.settings, next, d.c[0], d.T + 8 * DAY + 2);
    for (const i of [0, 1, 2]) d.endorse(d.c[i], e, 'settings', d.T + 8 * DAY + 3);
    const s = d.state(d.T + 9 * DAY);
    expect(s.settings.length).toBe(1);
    expect(s.settingsCandidates[0].error).toBe('settings do not follow from the basis');
  });
});

// ---------- payout rounds (6.1-6.3) and closing ----------
import { mnemonicToSeedSync } from '@scure/bip39';
import { buildRound, finalizeRound, masterFromSeed, signWithMnemonicKey, type Utxo } from './round';

describe('payout rounds (6.1-6.3)', () => {
  const masters = MNEMONICS.map(m => masterFromSeed(mnemonicToSeedSync(m), 'testnet4'));
  const RECIPIENT = p2wpkh(secp256k1.getPublicKey(hexToBytes('22'.repeat(32)), true), TEST_NETWORK).address!;

  function passedPayout(d: ReturnType<typeof dao>, at: number, amount = 120_000, confirm = true) {
    const p = d.propose(d.f[0], { type: 'payout', payload: { recipient: 'Tipografia', outputs: [{ address: RECIPIENT, amount_sat: amount }] } }, at);
    if (confirm) d.ev(KIND.confirm, { address: RECIPIENT }, newSecret(), at + 1, [['e', p.id]]);
    for (const i of [0, 1, 2]) d.vote(d.f[i], p, 'yes', at + 2);
    d.tally(d.c[0], d.state(at + 8 * DAY), p, at + 8 * DAY);
    return p;
  }
  function coins(d: ReturnType<typeof dao>): Utxo[] {
    const desc = parseDescriptor(d.state(d.T).settings[0].content.descriptor, 'testnet4');
    return [0, 1].map(i => ({ txid: String(i + 1).repeat(64), vout: 0, value: 300_000, address: treasuryAddress(desc, 'testnet4', 0, i).address, branch: 0 as const, index: i }));
  }
  function round(d: ReturnType<typeof dao>, ids: string[], outputs: { address: string; amount_sat: number }[], at: number, utxos = coins(d), opts: { feeRate?: number; sweepTo?: string } = {}) {
    const desc = parseDescriptor(d.state(d.T).settings[0].content.descriptor, 'testnet4');
    const r = buildRound({ d: desc, network: 'testnet4', utxos, outputs, feeRate: opts.feeRate ?? 2, changeIndex: 0, sweepTo: opts.sweepTo });
    const e = d.ev(KIND.round, { round: '2026-12', proposals: ids, psbt: r.psbt, fee_rate_sat_vb: opts.feeRate ?? 2, fee_sat: r.fee }, d.c[0], at);
    return { e, r };
  }

  it('signs a round with 3 council keys, finalises it and is paid on receipt', () => {
    const d = dao();
    const p = passedPayout(d, d.T);
    const t = d.T + 8 * DAY + 10;
    let s = d.state(t);
    expect(s.payments.get(p.id)?.status).toBe('waiting');
    const { e, r } = round(d, [p.id], [{ address: RECIPIENT, amount_sat: 120_000 }], t);
    s = d.state(t + 1);
    expect(s.rounds[0].errors).toEqual([]);
    expect(s.rounds[0].status).toBe('open');
    expect(s.payments.get(p.id)?.status).toBe('in_round');
    const signed: string[] = [];
    for (const i of [0, 3]) {
      signed.push(signWithMnemonicKey(r.psbt, masters[i]));
      d.ev(KIND.sign, { psbt: signed[signed.length - 1] }, d.c[i], t + 2, [['e', e.id]]);
    }
    // a council member signing with someone else's key does not count
    d.ev(KIND.sign, { psbt: signWithMnemonicKey(r.psbt, masters[4]) }, d.c[1], t + 3, [['e', e.id]]);
    s = d.state(t + 4);
    expect(s.rounds[0].signatures.size).toBe(2);
    expect(s.rounds[0].ready).toBe(false);
    signed.push(signWithMnemonicKey(r.psbt, masters[4]));
    d.ev(KIND.sign, { psbt: signed[2] }, d.c[4], t + 5, [['e', e.id]]);
    s = d.state(t + 6);
    expect(s.rounds[0].ready).toBe(true);
    const fin = finalizeRound(signed);
    expect(fin.txid).toBe(s.rounds[0].inspection!.txid);
    d.ev(KIND.receipt, { txid: 'ff'.repeat(32), block_height: 100 }, d.c[0], t + 7, [['e', e.id]]); // wrong txid: ignored
    expect(d.state(t + 8).rounds[0].status).toBe('open');
    d.ev(KIND.receipt, { txid: fin.txid, block_height: 100 }, d.c[0], t + 9, [['e', e.id]]);
    s = d.state(t + 10);
    expect(s.rounds[0].status).toBe('paid');
    expect(s.payments.get(p.id)?.status).toBe('paid');
  });

  it('refuses rounds that pay the wrong outputs, unconfirmed payouts, high fees or a second open round', () => {
    const d = dao();
    const p = passedPayout(d, d.T);
    const q = passedPayout(d, d.T + 5, 50_000, false);
    const t = d.T + 8 * DAY + 10;
    round(d, [p.id], [{ address: RECIPIENT, amount_sat: 130_000 }], t);
    round(d, [q.id], [{ address: RECIPIENT, amount_sat: 50_000 }], t + 1);
    round(d, [p.id], [{ address: RECIPIENT, amount_sat: 120_000 }], t + 2, coins(d), { feeRate: 25 });
    const good = round(d, [p.id], [{ address: RECIPIENT, amount_sat: 120_000 }], t + 3, coins(d).slice(0, 1));
    const other = round(d, [p.id], [{ address: RECIPIENT, amount_sat: 120_000 }], t + 4, coins(d).slice(1));
    const replacement = round(d, [p.id], [{ address: RECIPIENT, amount_sat: 120_000 }], t + 5, coins(d).slice(0, 1), { feeRate: 4 });
    const s = d.state(t + 6);
    const errs = (i: number) => s.rounds[i].errors.join('; ');
    expect(errs(0)).toContain('outputs are not exactly the payouts');
    expect(errs(1)).toContain('not confirmed by its recipient');
    expect(errs(2)).toContain('fee rate above the cap');
    expect(s.rounds.find(r => r.event.id === good.e.id)?.status).toBe('open');
    expect(s.rounds.find(r => r.event.id === other.e.id)?.errors).toContain('another round is open');
    expect(s.rounds.find(r => r.event.id === replacement.e.id)?.status).toBe('open'); // shares a coin: allowed
  });

  it('a payout lapses after the second round date without being paid', () => {
    const d = dao();
    const p = passedPayout(d, d.T);
    expect(d.state(d.T + 9 * DAY).payments.get(p.id)?.status).toBe('waiting');
    expect(d.state(d.T + 75 * DAY).payments.get(p.id)?.status).toBe('lapsed');
  });

  it('closing: a passed close pays everything to the destination, then the settings close the DAO', () => {
    const d = dao();
    const c = d.propose(d.c[0], { type: 'close', payload: { destination: RECIPIENT } }, d.T);
    d.ev(KIND.confirm, { address: RECIPIENT }, newSecret(), d.T + 1, [['e', c.id]]);
    for (const i of [0, 1, 2]) d.vote(d.f[i], c, 'yes', d.T + 2);
    d.tally(d.c[0], d.state(d.T + 8 * DAY), c, d.T + 8 * DAY);
    const t = d.T + 8 * DAY + 10;
    const { e, r } = round(d, [c.id], [], t, coins(d), { sweepTo: RECIPIENT });
    let s = d.state(t + 1);
    expect(s.rounds[0].errors).toEqual([]);
    expect(s.rounds[0].isClose).toBe(true);
    const signed = [0, 1, 2].map(i => signWithMnemonicKey(r.psbt, masters[i]));
    const fin = finalizeRound(signed);
    d.ev(KIND.receipt, { txid: fin.txid, block_height: 101 }, d.c[0], t + 2, [['e', e.id]]);
    s = d.state(t + 3);
    expect(s.pendingSettings).toEqual([c.id]);
    const next = nextSettings(s)!;
    expect(next.closed).toBe(true);
    const se = d.ev(KIND.settings, next, d.c[0], t + 4);
    for (const i of [0, 1, 2]) d.endorse(d.c[i], se, 'settings', t + 5);
    const late = d.propose(d.f[0], { type: 'statement' }, t + 10);
    s = d.state(t + 11);
    expect(s.closed).toBe(true);
    expect(s.rejected.some(x => x.event.id === late.id && x.reason === 'proposal: the DAO is closed')).toBe(true);
  });
});

describe('weekly rounds and standing payout addresses (4.2, 6.1)', () => {
  const masters = MNEMONICS.map(m => masterFromSeed(mnemonicToSeedSync(m), 'testnet4'));
  const X = p2wpkh(secp256k1.getPublicKey(hexToBytes('33'.repeat(32)), true), TEST_NETWORK).address!;
  const Y = p2wpkh(secp256k1.getPublicKey(hexToBytes('44'.repeat(32)), true), TEST_NETWORK).address!;

  /** A passed payout of X, optionally naming the member it pays; no per-proposal confirmation. */
  function payout(d: ReturnType<typeof dao>, at: number, member?: string, address = X) {
    const p = d.propose(d.f[0], { type: 'payout', payload: { recipient: 'Quota settimanale', outputs: [{ address, amount_sat: 41_200, ...(member ? { member } : {}) }] } }, at);
    for (const i of [0, 1, 2]) d.vote(d.f[i], p, 'yes', at + 2);
    d.tally(d.c[0], d.state(at + 8 * DAY), p, at + 8 * DAY);
    return p;
  }
  const standing = (d: ReturnType<typeof dao>, secret: string, address: string | undefined, at: number) =>
    d.ev(KIND.confirm, address ? { address, standing: true } : { standing: false }, secret, at);
  function roundFor(d: ReturnType<typeof dao>, p: Event, at: number) {
    const desc = parseDescriptor(d.state(d.T).settings[0].content.descriptor, 'testnet4');
    const utxos: Utxo[] = [{ txid: '1'.repeat(64), vout: 0, value: 300_000, address: treasuryAddress(desc, 'testnet4', 0, 0).address, branch: 0, index: 0 }];
    const r = buildRound({ d: desc, network: 'testnet4', utxos, outputs: [{ address: X, amount_sat: 41_200 }], feeRate: 2, changeIndex: 0 });
    return d.ev(KIND.round, { round: '1970-W02', proposals: [p.id], psbt: r.psbt, fee_rate_sat_vb: 2, fee_sat: r.fee }, d.c[0], at);
  }
  const after = (d: ReturnType<typeof dao>) => d.T + 8 * DAY + 100;

  it('P-W04: a weekly payout lapses at the second Monday after its tally', () => {
    const d = dao({ payoutRound: 'weekly' });
    const p = payout(d, d.T, undefined);
    d.ev(KIND.confirm, { address: X }, newSecret(), d.T + 1, [['e', p.id]]);
    const tallied = d.T + 8 * DAY;
    const [, second] = roundDatesAfter(tallied, 'Europe/Rome', 2, 'weekly');
    const pay = d.state(tallied + 1).payments.get(p.id)!;
    expect(pay.lapseAt).toBe(second);
    expect(second - tallied).toBeLessThanOrEqual(14 * DAY);
    expect(d.state(second - 1).payments.get(p.id)?.status).toBe('waiting');
    expect(d.state(second).payments.get(p.id)?.status).toBe('lapsed');
  });

  it('C-S01, C-S02, C-S03: a standing address confirms only an output naming its member', () => {
    const d = dao();
    standing(d, d.f[1], X, d.T - 10);
    const named = payout(d, d.T, pubkeyOf(d.f[1]));
    const unnamed = payout(d, d.T + 1);
    const wrong = payout(d, d.T + 2, pubkeyOf(d.f[2]));
    const s = d.state(after(d));
    expect(view(s, named).confirmed).toBe(true);
    expect(view(s, named).byStanding.has(X)).toBe(true);
    expect(s.payments.get(named.id)?.status).toBe('waiting');
    expect(view(s, unnamed).confirmed).toBe(false);
    expect(view(s, wrong).confirmed).toBe(false);
  });

  it('C-S04, C-S05: standing confirmations from non-members or of treasury addresses are rejected', () => {
    const d = dao();
    const outsider = standing(d, newSecret(), X, d.T);
    const treasury = standing(d, d.f[1], d.treasury0, d.T + 1);
    const s = d.state(d.T + 2);
    expect(s.rejected.find(r => r.event.id === outsider.id)?.reason).toContain('not a member');
    expect(s.rejected.find(r => r.event.id === treasury.id)?.reason).toContain('treasury');
    expect(s.standingAt(pubkeyOf(d.f[1]), d.T + 2)).toBeUndefined();
  });

  it('C-S06, C-S07, C-S09: replacing or withdrawing a standing address stops unpaid payouts to the old one', () => {
    const d = dao();
    const f1 = pubkeyOf(d.f[1]);
    standing(d, d.f[1], X, d.T - 10);
    const p = payout(d, d.T, f1);
    standing(d, d.f[1], Y, d.T + 8 * DAY + 50);
    let s = d.state(after(d));
    expect(view(s, p).confirmed).toBe(false);
    expect(view(s, p).standingMoved).toEqual([X]);
    expect(s.payments.get(p.id)?.status).toBe('unconfirmed');
    // a per-proposal confirmation of the old address still pays it
    d.ev(KIND.confirm, { address: X }, d.f[1], after(d) + 1, [['e', p.id]]);
    expect(view(d.state(after(d) + 2), p).confirmed).toBe(true);
    // withdrawing leaves no standing address
    standing(d, d.f[1], undefined, after(d) + 3);
    s = d.state(after(d) + 4);
    expect(s.standingAt(f1, s.now)).toBeUndefined();
    // same created_at: the higher id counts
    const a = standing(d, d.f[1], X, after(d) + 10);
    const b = standing(d, d.f[1], Y, after(d) + 10);
    const winner = a.id > b.id ? X : Y;
    expect(d.state(after(d) + 11).standingAt(f1, after(d) + 11)?.address).toBe(winner);
  });

  it('C-S08: leaving ends a standing address', () => {
    const d = dao();
    const f1 = pubkeyOf(d.f[1]);
    standing(d, d.f[1], X, d.T);
    expect(d.state(d.T + 1).standingAt(f1, d.T + 1)?.address).toBe(X);
    d.ev(KIND.leave, {}, d.f[1], d.T + 2);
    expect(d.state(d.T + 3).standingAt(f1, d.T + 3)).toBeUndefined();
  });

  it('C-S10: the standing address is checked when the round is published', () => {
    const d = dao();
    const f1 = pubkeyOf(d.f[1]);
    standing(d, d.f[1], X, d.T - 10);
    const p = payout(d, d.T, f1);
    const t = after(d);
    const ok = roundFor(d, p, t);
    let s = d.state(t + 1);
    expect(s.rounds.find(r => r.event.id === ok.id)?.errors).toEqual([]);
    // the round is signed at threshold before the withdrawal: it stays valid
    for (const i of [0, 1, 2]) d.ev(KIND.sign, { psbt: signWithMnemonicKey(parseJson<any>(ok.content).psbt, masters[i]) }, d.c[i], t + 2, [['e', ok.id]]);
    standing(d, d.f[1], undefined, t + 3);
    const late = roundFor(d, p, t + 4);
    s = d.state(t + 5);
    expect(s.rounds.find(r => r.event.id === ok.id)?.status).toBe('open');
    expect(s.rounds.find(r => r.event.id === late.id)?.errors.join('; ')).toContain('not confirmed by its recipient');
  });
});
