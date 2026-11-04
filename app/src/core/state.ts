// Rebuilding the DAO from events (protocol 8): genesis, rosters, settings, membership events,
// proposals, confirmations, votes and tallies. Pure: the same events give the same state everywhere.
import { Address } from '@scure/btc-signer';
import type { CouncilEntry, DaoConfig, Rules, SiteConfig } from './config';
import { KIND, byTime, tagValue, verified, type Event } from './events';
import { btcNetwork, parseDescriptor, treasuryAddress } from './descriptor';
import { shortCode } from './shortcode';
import { hashJson, nowSec, parseJson } from './util';
import { inspectRound, memberSignatures, type RoundContent, type RoundInspection } from './round';
import { cadenceOf, roundDatesAfter } from './time';

// ---------- types ----------

export type Verified = 'in_person' | 'remote';

export interface RosterEntry {
  key: string;
  name: string;
  since: string; // YYYY-MM-DD
  verified: Verified;
  council: boolean;
}

export interface RosterContent {
  version: number;
  prev?: string;
  basis?: string[];
  members: RosterEntry[];
}

export interface SettingsContent {
  version: number;
  prev?: string;
  basis?: string[];
  rules: Rules;
  closed: boolean;
  council: CouncilEntry[];
  threshold: number;
  descriptor: string;
}

export interface Versioned<T> {
  content: T;
  hash: string;
  event?: Event; // absent for version 1, which is implied by the genesis
  effectiveAt: number;
}

export interface Member {
  key: string;
  person: string; // the person's first key: stays the same across key replacements
  name: string;
  council: boolean;
  verified: Verified;
  since: number; // unix seconds
}

export type ProposalType = 'payout' | 'statement' | 'add_member' | 'remove_member' | 'change_rules' | 'change_council' | 'close';
export const PROPOSAL_TYPES: ProposalType[] = ['payout', 'statement', 'add_member', 'remove_member', 'change_rules', 'change_council', 'close'];
const RULE_NAME: Record<ProposalType, string> = {
  payout: 'payout', statement: 'statement', add_member: 'addMember', remove_member: 'removeMember',
  change_rules: 'changeRules', change_council: 'changeCouncil', close: 'close',
};

export interface Output {
  address: string;
  amount_sat: number;
  /** Identity key of the member this output pays; lets a standing address confirm it (protocol 4.2). */
  member?: string;
}

/** A member's standing payout address (protocol 4.2): set by a dao.confirm with no `e` tag. */
export interface StandingAddress {
  address: string;
  event: Event;
}

export interface ProposalContent {
  type: ProposalType;
  title: string;
  summary: string;
  link?: { url: string; sha256?: string };
  lang: string;
  payload: Record<string, any>;
}

export type Choice = 'yes' | 'no' | 'abstain';

export interface TallyResult {
  yes: number;
  no: number;
  abstain: number;
  quorum_met: boolean;
  passed: boolean;
}

export interface TallyContent {
  proposal: string;
  closed_at: number;
  roster_version: number;
  settings_version: number;
  number: number;
  counted: string[];
  excluded: { id: string; reason: 'late' | 'not_eligible' | 'superseded' }[];
  result: TallyResult;
}

export type ProposalStatus = 'open' | 'awaiting_tally' | 'passed' | 'rejected' | 'no_quorum' | 'disputed';

export interface ProposalView {
  event: Event;
  content: ProposalContent;
  number: number;
  closeAt: number;
  rules: Rules;
  rosterVersion: number;
  settingsVersion: number;
  eligible: Set<string>; // persons
  votes: Map<string, { event: Event; choice: Choice }>; // latest counted vote per person
  counts: { yes: number; no: number; abstain: number };
  quorumNeeded: number;
  twoThirds: boolean;
  recount: TallyContent;
  tally?: { events: Event[]; content: TallyContent };
  disputed: boolean;
  tallyMismatch: boolean;
  untallied: string[]; // votes dated before close that the tally neither counts nor excludes
  status: ProposalStatus;
  addresses: string[]; // that need a recipient confirmation
  confirmations: Map<string, Event[]>; // per-proposal confirmations
  /** Addresses confirmed now by their member's standing address. */
  byStanding: Set<string>;
  /** Addresses that waited on a standing address that its member has since replaced or withdrawn. */
  standingMoved: string[];
  confirmed: boolean; // now
  /** Every address confirmed at time t: per proposal, or by a standing address in force then. */
  confirmedAt(t: number): boolean;
}

export interface Rejected {
  event: Event;
  reason: string;
}

export interface GenesisCandidate {
  event: Event;
  config: DaoConfig;
  daoId: string;
  endorsers: { key: string; at: number; eventId: string }[];
  effectiveAt?: number;
}

export interface RekeyView {
  event: Event;
  oldKey: string;
  newKey: string;
  mode: Verified;
  endorsers: string[]; // persons
  effectiveAt?: number;
  needsSecondVerify: boolean;
}

export interface Candidate<T> {
  event: Event;
  content: T;
  hash: string;
  endorsers: string[]; // persons
  effectiveAt?: number;
  error?: string;
}

export interface RoundView {
  event: Event;
  content: RoundContent;
  inspection?: RoundInspection;
  errors: string[];
  isClose: boolean;
  status: 'open' | 'paid' | 'void' | 'invalid';
  /** Valid partial signatures: person → input index → pubkey. */
  signatures: Map<string, Map<number, string>>;
  signEvents: Event[]; // valid dao.sign events carrying signatures
  declines: { person: string; reason: string; event: Event }[];
  ready: boolean; // threshold signatures on every input
  threshold: number;
  receipt?: Event;
}

export type PaymentStatus = 'unconfirmed' | 'waiting' | 'in_round' | 'paid' | 'lapsed';

export interface Payment {
  status: PaymentStatus;
  round?: RoundView;
  lapseAt?: number;
}

export interface DaoState {
  now: number;
  founded?: GenesisCandidate;
  pending: GenesisCandidate[];
  conflict: boolean;
  rosters: Versioned<RosterContent>[];
  settings: Versioned<SettingsContent>[];
  rosterCandidates: Candidate<RosterContent>[]; // next version, not yet in effect
  settingsCandidates: Candidate<SettingsContent>[];
  rosterDisputed: boolean;
  settingsDisputed: boolean;
  members: Member[]; // current roster
  rules?: Rules; // current
  proposals: ProposalView[];
  verifies: Event[]; // valid dao.verify
  rekeys: RekeyView[];
  leaves: Map<string, Event>; // person -> leave
  /** Changes passed or in effect that the current roster does not show yet (basis ids). */
  pendingRoster: string[];
  pendingSettings: string[];
  rounds: RoundView[];
  payments: Map<string, Payment>; // passed payouts and closes
  closed: boolean;
  keywraps: Map<string, { pubkey: string; nonce: string; ct: string; at: number }>;
  rejected: Rejected[];
  personOf(key: string): string;
  /** Current key of a person. */
  keyOf(person: string): string;
  isCouncilAt(key: string, t: number): boolean;
  memberAt(key: string, t: number): boolean;
  rosterAt(t: number): Versioned<RosterContent>;
  settingsAt(t: number): Versioned<SettingsContent>;
  isTreasuryAddress(addr: string): boolean;
  /** The standing payout address of the member holding `key`, in force at time t. */
  standingAt(key: string, t: number): StandingAddress | undefined;
}

// ---------- helpers ----------

export const utcDate = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);
export const dateToUnix = (d: string) => Math.floor(Date.parse(d + 'T00:00:00Z') / 1000);

export function quorumFraction(q: unknown): number {
  if (typeof q === 'number') return q;
  const m = String(q).match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  return m ? Number(m[1]) / Number(m[2]) : 1 / 3;
}

export const DUST = 546;

const isStr = (x: unknown, max: number) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
const isKey = (x: unknown) => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x);

export function validAddress(addr: unknown, network: DaoConfig['network']): boolean {
  if (typeof addr !== 'string') return false;
  try {
    Address(btcNetwork(network)).decode(addr);
    return true;
  } catch {
    return false;
  }
}

function genesisCandidate(e: Event, rejected: Rejected[]): GenesisCandidate | undefined {
  const config = parseJson<DaoConfig>(e.content);
  if (!config || typeof config !== 'object') return void rejected.push({ event: e, reason: 'genesis: content is not JSON' });
  const daoId = hashJson(config);
  if (tagValue(e, 'D') !== daoId) return void rejected.push({ event: e, reason: 'genesis: D tag is not the hash of its content' });
  if (!Array.isArray(config.council) || !config.council.some(c => c.identityKey === e.pubkey))
    return void rejected.push({ event: e, reason: 'genesis: signer is not on its own council' });
  if (!(config.threshold >= 1 && config.threshold <= config.council.length))
    return void rejected.push({ event: e, reason: 'genesis: bad threshold' });
  return { event: e, config, daoId, endorsers: [] };
}

/** Schema check for a proposal's content (protocol 4.1). Returns an error or undefined. */
export function proposalSchemaError(c: ProposalContent, network: DaoConfig['network']): string | undefined {
  if (!c || typeof c !== 'object') return 'not an object';
  if (!PROPOSAL_TYPES.includes(c.type)) return 'unknown type';
  if (!isStr(c.title, 80)) return 'title';
  if (!isStr(c.summary, 500)) return 'summary';
  if (typeof c.lang !== 'string') return 'lang';
  if (c.link !== undefined && !(c.link && typeof c.link.url === 'string' && /^https?:\/\//.test(c.link.url))) return 'link';
  const p = c.payload;
  if (!p || typeof p !== 'object') return 'payload';
  switch (c.type) {
    case 'payout':
      if (!isStr(p.recipient, 80)) return 'recipient';
      if (!Array.isArray(p.outputs) || p.outputs.length < 1 || p.outputs.length > 10) return 'outputs';
      for (const o of p.outputs as Output[]) {
        if (!validAddress(o?.address, network)) return 'address';
        if (!Number.isInteger(o.amount_sat) || o.amount_sat <= DUST) return 'amount';
        if (o.member !== undefined && !isKey(o.member)) return 'member';
      }
      if (new Set((p.outputs as Output[]).map(o => o.address)).size !== p.outputs.length) return 'duplicate address';
      return;
    case 'statement':
      return;
    case 'add_member':
      if (!isKey(p.candidate_key)) return 'candidate_key';
      if (!isStr(p.name, 40)) return 'name';
      if (!Array.isArray(p.verify) || p.verify.length < 1) return 'verify';
      return;
    case 'remove_member':
      if (!isKey(p.member_key)) return 'member_key';
      if (typeof p.reason !== 'string') return 'reason';
      return;
    case 'change_rules':
      if (!Array.isArray(p.changes) || !p.changes.length) return 'changes';
      for (const ch of p.changes) if (!(typeof ch?.path === 'string' && /^rules\.[A-Za-z]+$/.test(ch.path) && 'from' in ch && 'to' in ch)) return 'change';
      return;
    case 'change_council':
      if (!isKey(p.out_key) || !isKey(p.in_key)) return 'keys';
      return;
    case 'close':
      if (!validAddress(p.destination, network)) return 'destination';
      return;
  }
}

// ---------- rebuild ----------

/** `prefer`: a key this device signed up with; a founded genesis listing it wins over others for the same site. */
export function rebuild(site: SiteConfig, events: Event[], prefer?: string, now = nowSec()): DaoState {
  const rejected: Rejected[] = [];
  const seen = new Set<string>();
  const all = events
    .filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .filter(e => {
      if (!verified(e)) return rejected.push({ event: e, reason: 'bad signature' }), false;
      if (tagValue(e, 'v') !== '1') return rejected.push({ event: e, reason: 'unsupported protocol version' }), false;
      return true;
    })
    .sort(byTime);

  // 1. Genesis
  const candidates: GenesisCandidate[] = [];
  for (const e of all.filter(e => e.kind === KIND.genesis)) {
    const g = genesisCandidate(e, rejected);
    if (!g) continue;
    if (site.daoId ? g.daoId !== site.daoId : g.config.site !== site.site) continue;
    if (g.config.network !== site.network) continue;
    candidates.push(g);
  }
  for (const e of all.filter(e => e.kind === KIND.endorse)) {
    const g = candidates.find(c => c.event.id === tagValue(e, 'e'));
    if (!g) continue;
    const body = parseJson<{ object: string; hash: string }>(e.content);
    if (!body || body.object !== 'genesis' || body.hash !== g.daoId || tagValue(e, 'D') !== g.daoId) {
      rejected.push({ event: e, reason: 'endorse: wrong object or hash' });
      continue;
    }
    if (!g.config.council.some(c => c.identityKey === e.pubkey)) {
      rejected.push({ event: e, reason: 'endorse: signer is not on the council' });
      continue;
    }
    if (g.endorsers.some(x => x.key === e.pubkey)) continue;
    g.endorsers.push({ key: e.pubkey, at: e.created_at, eventId: e.id });
    if (!g.effectiveAt && g.endorsers.length >= g.config.threshold) g.effectiveAt = e.created_at;
  }
  const foundedAll = candidates.filter(c => c.effectiveAt !== undefined).sort((a, b) => a.effectiveAt! - b.effectiveAt!);
  const lists = (g: GenesisCandidate, k: string) =>
    g.config.council.some(c => c.identityKey === k) || g.config.founders?.some(f => f.identityKey === k);
  const founded = (prefer && foundedAll.find(g => lists(g, prefer))) || foundedAll[0];

  const empty: DaoState = {
    now, founded, pending: founded ? [] : candidates, conflict: foundedAll.length > 1,
    rosters: [], settings: [], rosterCandidates: [], settingsCandidates: [], rosterDisputed: false, settingsDisputed: false,
    members: [], proposals: [], verifies: [], rekeys: [], leaves: new Map(), pendingRoster: [], pendingSettings: [],
    rounds: [], payments: new Map(), closed: false,
    keywraps: new Map(), rejected,
    personOf: k => k, keyOf: p => p, isCouncilAt: () => false, memberAt: () => false,
    rosterAt: () => { throw new Error('not founded'); }, settingsAt: () => { throw new Error('not founded'); },
    isTreasuryAddress: () => false, standingAt: () => undefined,
  };
  if (!founded) return empty;

  const daoId = founded.daoId;
  const cfg = founded.config;
  const network = cfg.network;
  const mine = all.filter(e => tagValue(e, 'D') === daoId && e.kind !== KIND.genesis);
  const ofKind = (k: number) => mine.filter(e => e.kind === k);
  const endorsements = ofKind(KIND.endorse);
  const T0 = founded.effectiveAt!;

  // Version 1 of roster and settings, implied by the genesis.
  const since0 = utcDate(T0);
  const roster1: RosterContent = {
    version: 1,
    members: [
      ...cfg.council.map(c => ({ key: c.identityKey, name: c.label, since: since0, verified: 'in_person' as Verified, council: true })),
      ...cfg.founders.map(f => ({ key: f.identityKey, name: f.name, since: since0, verified: f.verified, council: false })),
    ],
  };
  const settings1: SettingsContent = { version: 1, rules: cfg.rules, closed: false, council: cfg.council, threshold: cfg.threshold, descriptor: cfg.descriptor };
  const rosters: Versioned<RosterContent>[] = [{ content: roster1, hash: hashJson(roster1), effectiveAt: T0 }];
  const settings: Versioned<SettingsContent>[] = [{ content: settings1, hash: hashJson(settings1), effectiveAt: T0 }];
  const rosterAt = (t: number) => [...rosters].reverse().find(r => r.effectiveAt <= t) ?? rosters[0];
  const settingsAt = (t: number) => [...settings].reverse().find(s => s.effectiveAt <= t) ?? settings[0];
  /** Round dates follow the settings in force at each moment (6.1). */
  const roundRulesAt = (t: number) => {
    const r = settingsAt(t).content.rules;
    return { cadence: cadenceOf(r.payoutRound), tz: r.timezone || 'UTC', changes: settings.map(s => s.effectiveAt) };
  };

  // Persons and keys: a key replacement moves a person to a new key from its effective time.
  const personByKey = new Map<string, string>();
  const keySpans = new Map<string, { from: number; to: number }>(); // key -> active span
  for (const m of roster1.members) {
    personByKey.set(m.key, m.key);
    keySpans.set(m.key, { from: 0, to: Infinity });
  }
  const personOf = (k: string) => personByKey.get(k) ?? k;
  const keyActive = (k: string, t: number) => {
    const s = keySpans.get(k);
    return !s || (t >= s.from && t < s.to);
  };
  const keyOf = (person: string) => {
    for (const [k, p] of personByKey) if (p === person && keySpans.get(k)?.to === Infinity) return k;
    return person;
  };
  const councilPersonsAt = (t: number) => new Set(settingsAt(t).content.council.map(c => personOf(c.identityKey)));
  const isCouncilAt = (k: string, t: number) => keyActive(k, t) && councilPersonsAt(t).has(personOf(k));
  const thresholdAt = (t: number) => settingsAt(t).content.threshold;

  /** Distinct council persons endorsing `target` with this object and hash; time the threshold was reached. */
  const endorsedBy = (target: Event, object: string, hash: string) => {
    const persons: string[] = [];
    let at: number | undefined;
    for (const e of endorsements) {
      if (tagValue(e, 'e') !== target.id) continue;
      const b = parseJson<{ object: string; hash: string }>(e.content);
      if (!b || b.object !== object || b.hash !== hash) continue;
      if (e.created_at < target.created_at || !isCouncilAt(e.pubkey, e.created_at)) continue;
      const p = personOf(e.pubkey);
      if (persons.includes(p)) continue;
      persons.push(p);
      if (at === undefined && persons.length >= thresholdAt(e.created_at)) at = e.created_at;
    }
    return { persons, at };
  };

  // 2. Verifications (5.1)
  const verifies: Event[] = [];
  for (const e of ofKind(KIND.verify)) {
    const b = parseJson<{ candidate_key: string; mode: Verified; short_code: string }>(e.content);
    if (!b || !isKey(b.candidate_key) || !['in_person', 'remote'].includes(b.mode)) { rejected.push({ event: e, reason: 'verify: malformed' }); continue; }
    if (b.short_code !== shortCode(b.candidate_key)) { rejected.push({ event: e, reason: 'verify: short code does not match' }); continue; }
    if (!isCouncilAt(e.pubkey, e.created_at)) { rejected.push({ event: e, reason: 'verify: signer is not on the council' }); continue; }
    verifies.push(e);
  }
  const verifyOf = (id: string) => verifies.find(v => v.id === id);

  // 3. Key replacements (5.2). Repeat so a replaced council key can endorse later ones.
  const rekeys: RekeyView[] = [];
  for (const e of ofKind(KIND.rekey)) {
    const b = parseJson<{ old_key: string; new_key: string; mode: Verified; short_code: string }>(e.content);
    if (!b || !isKey(b.old_key) || !isKey(b.new_key) || b.old_key === b.new_key || !['in_person', 'remote'].includes(b.mode) || b.short_code !== shortCode(b.new_key)) {
      rejected.push({ event: e, reason: 'rekey: malformed' });
      continue;
    }
    rekeys.push({ event: e, oldKey: b.old_key, newKey: b.new_key, mode: b.mode, endorsers: [], needsSecondVerify: b.mode === 'remote' });
  }

  // 4. Leaves (5.3)
  const leaves = new Map<string, Event>();

  // The roster and settings chains, proposals and tallies depend on each other in time order, so
  // compute everything, extend the chains by one version if a valid one is in effect, and repeat.
  let proposals: ProposalView[] = [];
  let proposalRejected: Rejected[] = []; // from the last pass only
  let rounds: RoundView[] = [];
  let payments = new Map<string, Payment>();
  let rosterCandidates: Candidate<RosterContent>[] = [];
  let settingsCandidates: Candidate<SettingsContent>[] = [];
  let rosterDisputed = false;
  let settingsDisputed = false;

  const memberAt = (k: string, t: number) => {
    if (!keyActive(k, t)) return false;
    const p = personOf(k);
    const l = leaves.get(p);
    if (l && l.created_at <= t) return false;
    return rosterAt(t).content.members.some(m => personOf(m.key) === p);
  };

  let treasury: Set<string> | undefined;
  const isTreasuryAddress = (addr: string) => {
    if (!treasury) {
      treasury = new Set();
      for (const s of settings) {
        try {
          const d = parseDescriptor(s.content.descriptor, network);
          for (const br of [0, 1] as const) for (let i = 0; i < 40; i++) treasury.add(treasuryAddress(d, network, br, i).address);
        } catch { /* placeholder descriptor in tests */ }
      }
    }
    return treasury.has(addr);
  };

  const passed = (id: string) => proposals.find(p => p.event.id === id && p.status === 'passed');

  // Standing payout addresses (4.2): dao.confirm with no `e` tag. Checked against membership in each pass.
  let standingList: { event: Event; address?: string }[] = [];
  const standingAt = (key: string, t: number): StandingAddress | undefined => {
    const person = personOf(key);
    let last: { event: Event; address?: string } | undefined;
    for (const x of standingList) if (x.event.created_at <= t && personOf(x.event.pubkey) === person) last = x; // in time order
    if (!last?.address || !memberAt(last.event.pubkey, t)) return; // withdrawn, or ended by leaving, removal or a new key
    return { address: last.address, event: last.event };
  };

  for (let iter = 0; iter < 50; iter++) {
    // rekeys in effect
    for (const r of rekeys) {
      if (r.effectiveAt !== undefined) continue;
      const e = r.event;
      if (!isCouncilAt(e.pubkey, e.created_at) || !memberAt(r.oldKey, e.created_at) || personByKey.has(r.newKey)) continue;
      const end = endorsedBy(e, 'rekey', hashJson(parseJson(e.content)));
      r.endorsers = end.persons;
      let at = end.at;
      if (at !== undefined && r.mode === 'remote') {
        const second = verifies.find(v => parseJson<any>(v.content)?.candidate_key === r.newKey && personOf(v.pubkey) !== personOf(e.pubkey));
        r.needsSecondVerify = !second;
        at = second ? Math.max(at, second.created_at) : undefined;
      } else r.needsSecondVerify = false;
      if (at === undefined) continue;
      r.effectiveAt = at;
      const person = personOf(r.oldKey);
      keySpans.set(r.oldKey, { from: keySpans.get(r.oldKey)?.from ?? 0, to: at });
      personByKey.set(r.newKey, person);
      keySpans.set(r.newKey, { from: at, to: Infinity });
    }

    // leaves
    for (const e of ofKind(KIND.leave)) {
      const p = personOf(e.pubkey);
      if (leaves.has(p)) continue;
      if (memberAt(e.pubkey, e.created_at) && !isCouncilAt(e.pubkey, e.created_at)) leaves.set(p, e);
    }

    proposalRejected = [];
    proposals = computeProposals();
    [rounds, payments] = computeRounds();

    if (extendRoster() || extendSettings()) continue;
    break;
  }

  function computeProposals(): ProposalView[] {
    const valid: { e: Event; c: ProposalContent }[] = [];
    for (const e of ofKind(KIND.proposal)) {
      const c = parseJson<ProposalContent>(e.content);
      const err = proposalSchemaError(c!, network);
      if (err) { proposalRejected.push({ event: e, reason: `proposal: ${err}` }); continue; }
      if (!memberAt(e.pubkey, e.created_at)) { proposalRejected.push({ event: e, reason: 'proposal: signer is not a member' }); continue; }
      if (settingsAt(e.created_at).content.closed) { proposalRejected.push({ event: e, reason: 'proposal: the DAO is closed' }); continue; }
      if (c!.type === 'payout' && (c!.payload.outputs as Output[]).some(o => isTreasuryAddress(o.address))) { proposalRejected.push({ event: e, reason: 'proposal: pays the treasury' }); continue; }
      if (c!.type === 'close' && isTreasuryAddress(c!.payload.destination)) { proposalRejected.push({ event: e, reason: 'proposal: pays the treasury' }); continue; }
      if (c!.type === 'add_member') {
        const vs = (c!.payload.verify as string[]).map(verifyOf);
        const ok = vs.every(v => v && parseJson<any>(v.content).candidate_key === c!.payload.candidate_key);
        const inPerson = vs.some(v => v && parseJson<any>(v.content).mode === 'in_person');
        const remoteBy = new Set(vs.filter(v => v && parseJson<any>(v.content).mode === 'remote').map(v => personOf(v!.pubkey)));
        if (!ok || !(inPerson || remoteBy.size >= 2)) { proposalRejected.push({ event: e, reason: 'proposal: candidate not verified' }); continue; }
      }
      valid.push({ e, c: c! });
    }
    // Tallied proposals fix the numbering: untallied proposals dated before the latest tallied one are backdated.
    const tallyEvents = ofKind(KIND.tally);
    const hasTally = (id: string) => tallyEvents.some(t => tagValue(t, 'e') === id && isCouncilAt(t.pubkey, t.created_at));
    const lastTallied = Math.max(-1, ...valid.filter(v => hasTally(v.e.id)).map(v => v.e.created_at));
    const kept = valid.filter(v => {
      if (v.e.created_at < lastTallied && !hasTally(v.e.id)) { proposalRejected.push({ event: v.e, reason: 'proposal: dated before the last tallied proposal' }); return false; }
      return true;
    });

    const votes = ofKind(KIND.vote);
    const confirms = ofKind(KIND.confirm);
    standingList = [];
    for (const k of confirms.filter(k => tagValue(k, 'e') === undefined)) {
      const b = parseJson<{ address?: string; standing?: boolean }>(k.content);
      if (!b || typeof b.standing !== 'boolean') { proposalRejected.push({ event: k, reason: 'confirm: malformed' }); continue; }
      if (!memberAt(k.pubkey, k.created_at)) { proposalRejected.push({ event: k, reason: 'standing address: signer is not a member' }); continue; }
      if (b.standing && !validAddress(b.address, network)) { proposalRejected.push({ event: k, reason: 'standing address: invalid address' }); continue; }
      if (b.standing && isTreasuryAddress(b.address!)) { proposalRejected.push({ event: k, reason: 'standing address: a treasury address' }); continue; }
      standingList.push({ event: k, address: b.standing ? b.address : undefined });
    }
    return kept.map(({ e, c }, i) => {
      const number = i + 1;
      const sv = settingsAt(e.created_at);
      const rules = sv.content.rules;
      const rv = rosterAt(e.created_at);
      const closeAt = e.created_at + Math.round(rules.votingPeriodDays * 86400);
      const atClose = Math.min(closeAt, now);
      const eligible = new Set<string>();
      for (const m of rv.content.members) {
        const p = personOf(m.key);
        const l = leaves.get(p);
        if (l && l.created_at < closeAt) continue;
        if (!rosterAt(atClose).content.members.some(x => personOf(x.key) === p)) continue; // removed before the close
        eligible.add(p);
      }
      const excluded: TallyContent['excluded'] = [];
      const latest = new Map<string, { event: Event; choice: Choice }>();
      for (const v of votes.filter(v => tagValue(v, 'e') === e.id)) {
        const b = parseJson<{ choice: Choice }>(v.content);
        if (!b || !['yes', 'no', 'abstain'].includes(b.choice)) { proposalRejected.push({ event: v, reason: 'vote: malformed' }); continue; }
        if (v.created_at > closeAt) { excluded.push({ id: v.id, reason: 'late' }); continue; }
        const p = personOf(v.pubkey);
        if (!eligible.has(p) || !keyActive(v.pubkey, v.created_at)) { excluded.push({ id: v.id, reason: 'not_eligible' }); continue; }
        const prev = latest.get(p);
        if (prev) excluded.push({ id: prev.event.id, reason: 'superseded' });
        latest.set(p, { event: v, choice: b.choice });
      }
      const counts = { yes: 0, no: 0, abstain: 0 };
      for (const v of latest.values()) counts[v.choice]++;
      const quorumNeeded = Math.ceil(quorumFraction(rules.quorum) * eligible.size - 1e-9);
      const counted = latest.size;
      const quorumMet = counted >= quorumNeeded && counted > 0;
      const twoThirds = (rules.twoThirdsMajority ?? []).includes(RULE_NAME[c.type]);
      const majority = twoThirds ? counts.yes > 0 && counts.yes * 3 >= (counts.yes + counts.no) * 2 : counts.yes > counts.no;
      const recount: TallyContent = {
        proposal: e.id, closed_at: closeAt, roster_version: rv.content.version, settings_version: sv.content.version, number,
        counted: [...latest.values()].map(v => v.event.id).sort(),
        excluded: excluded.sort((a, b) => (a.id < b.id ? -1 : 1)),
        result: { ...counts, quorum_met: quorumMet, passed: quorumMet && majority },
      };

      // tallies
      const groups = new Map<string, { events: Event[]; content: TallyContent }>();
      for (const t of tallyEvents.filter(t => tagValue(t, 'e') === e.id)) {
        const b = parseJson<TallyContent>(t.content);
        if (!b || b.proposal !== e.id || b.closed_at !== closeAt || b.number !== number || t.created_at < closeAt || !isCouncilAt(t.pubkey, t.created_at) || !Array.isArray(b.counted) || !Array.isArray(b.excluded) || !b.result) {
          proposalRejected.push({ event: t, reason: 'tally: invalid' });
          continue;
        }
        const key = tallyKey(b);
        const g = groups.get(key) ?? { events: [], content: b };
        g.events.push(t);
        groups.set(key, g);
      }
      let tally: ProposalView['tally'];
      let disputed = false;
      if (groups.size === 1) tally = [...groups.values()][0];
      else if (groups.size > 1) {
        const winner = [...groups.values()].find(g => g.events.some(t => endorsedBy(t, 'tally', hashJson(parseJson(t.content))).at !== undefined));
        if (winner) tally = winner;
        else disputed = true;
      }
      const tallyMismatch = !!tally && tallyKey(tally.content) !== tallyKey(recount);
      const untallied = tally
        ? votes.filter(v => tagValue(v, 'e') === e.id && v.created_at <= closeAt && !tally!.content.counted.includes(v.id) && !tally!.content.excluded.some(x => x.id === v.id)).map(v => v.id)
        : [];
      const status: ProposalStatus =
        now < closeAt ? 'open' : disputed ? 'disputed' : !tally ? 'awaiting_tally' : tally.content.result.passed ? 'passed' : tally.content.result.quorum_met ? 'rejected' : 'no_quorum';

      const addresses = c.type === 'payout' ? (c.payload.outputs as Output[]).map(o => o.address) : c.type === 'close' ? [c.payload.destination as string] : [];
      const confirmations = new Map<string, Event[]>();
      for (const k of confirms.filter(k => tagValue(k, 'e') === e.id)) {
        const b = parseJson<{ address: string }>(k.content);
        if (!b || !addresses.includes(b.address)) { proposalRejected.push({ event: k, reason: 'confirm: address not in the proposal' }); continue; }
        confirmations.set(b.address, [...(confirmations.get(b.address) ?? []), k]);
      }
      const memberOf = new Map(c.type === 'payout' ? (c.payload.outputs as Output[]).filter(o => o.member).map(o => [o.address, o.member!]) : []);
      const coveredAt = (a: string, t: number) => {
        const m = memberOf.get(a);
        return !!m && standingAt(m, t)?.address === a;
      };
      const confirmedAt = (t: number) => addresses.every(a => confirmations.has(a) || coveredAt(a, t));
      const byStanding = new Set(addresses.filter(a => !confirmations.has(a) && coveredAt(a, now)));
      const standingMoved = addresses.filter(a => !confirmations.has(a) && !byStanding.has(a) && memberOf.has(a)
        && standingList.some(x => x.address === a && personOf(x.event.pubkey) === personOf(memberOf.get(a)!) && x.event.created_at <= now));
      return {
        event: e, content: c, number, closeAt, rules, rosterVersion: rv.content.version, settingsVersion: sv.content.version,
        eligible, votes: latest, counts, quorumNeeded, twoThirds, recount, tally, disputed, tallyMismatch, untallied, status,
        addresses, confirmations, byStanding, standingMoved, confirmed: confirmedAt(now), confirmedAt,
      };
    });
  }

  function computeRounds(): [RoundView[], Map<string, Payment>] {
    const out: RoundView[] = [];
    const paidAt = new Map<string, number>(); // proposal → receipt time
    const receipts = ofKind(KIND.receipt);
    const signs = ofKind(KIND.sign);
    const tallyAt = (p: ProposalView) => Math.min(...(p.tally?.events.map(e => e.created_at) ?? [Infinity]));
    const lapseAt = (p: ProposalView) => {
      const t = tallyAt(p);
      if (!Number.isFinite(t)) return undefined;
      return roundDatesAfter(t, p.rules.timezone || 'UTC', Math.max(1, p.rules.lapseAfterRounds ?? 2), roundRulesAt).pop();
    };
    for (const e of ofKind(KIND.round)) {
      const c = parseJson<RoundContent>(e.content);
      const errors: string[] = [];
      const sv = settingsAt(e.created_at).content;
      if (!c || !Array.isArray(c.proposals) || !c.proposals.length || typeof c.psbt !== 'string') {
        proposalRejected.push({ event: e, reason: 'round: malformed' });
        continue;
      }
      if (!isCouncilAt(e.pubkey, e.created_at)) errors.push('signer is not on the council');
      if (sv.closed) errors.push('the DAO is closed');
      let ins: RoundInspection | undefined;
      let d: ReturnType<typeof parseDescriptor> | undefined;
      try {
        d = parseDescriptor(sv.descriptor, network);
        ins = inspectRound(c.psbt, d, network);
        errors.push(...ins.errors);
      } catch {
        errors.push('cannot read the PSBT');
      }
      const props = c.proposals.map(id => proposals.find(p => p.event.id === id));
      const isClose = props.some(p => p?.content.type === 'close');
      for (const [i, p] of props.entries()) {
        if (!p) { errors.push(`unknown proposal ${c.proposals[i].slice(0, 8)}`); continue; }
        if (p.status !== 'passed' || !['payout', 'close'].includes(p.content.type)) errors.push(`proposal ${p.number} is not a passed payout`);
        if (!p.confirmedAt(e.created_at)) errors.push(`proposal ${p.number} is not confirmed by its recipient`);
        const paid = paidAt.get(p.event.id);
        if (paid !== undefined && paid <= e.created_at) errors.push(`proposal ${p.number} is already paid`);
        const l = lapseAt(p);
        if (l !== undefined && e.created_at >= l) errors.push(`proposal ${p.number} has lapsed`);
      }
      if (ins) {
        const nonChange = ins.outputs.filter(o => o.change === undefined);
        if (isClose) {
          const dest = props.find(p => p?.content.type === 'close')?.content.payload.destination;
          if (props.length !== 1) errors.push('a closing round pays only the close proposal');
          if (ins.outputs.length !== 1 || ins.outputs[0].address !== dest) errors.push('a closing round has one output, to the destination');
        } else {
          const want = props.flatMap(p => (p?.content.type === 'payout' ? (p.content.payload.outputs as Output[]) : [])).map(o => `${o.address}:${o.amount_sat}`).sort();
          const got = nonChange.map(o => `${o.address}:${o.value}`).sort();
          if (hashJson(want) !== hashJson(got)) errors.push('outputs are not exactly the payouts');
        }
        if (c.fee_sat !== ins.fee) errors.push('fee_sat does not match the PSBT');
        if (ins.fee <= 0) errors.push('no fee');
        if (ins.fee / ins.vsize > sv.rules.maxFeeRateSatVb + 0.01 || c.fee_rate_sat_vb > sv.rules.maxFeeRateSatVb) errors.push('fee rate above the cap');
        // one open round at a time, unless this one replaces it by spending one of its coins
        const outpoints = new Set(ins.inputs.map(x => `${x.txid}:${x.vout}`));
        const open = out.filter(r => r.status === 'open' && r.event.created_at <= e.created_at && !(r.receipt && r.receipt.created_at <= e.created_at));
        if (open.length && !open.some(r => r.inspection?.inputs.some(x => outpoints.has(`${x.txid}:${x.vout}`)))) errors.push('another round is open');
      }

      const threshold = sv.threshold;
      const signatures = new Map<string, Map<number, string>>();
      const signEvents: Event[] = [];
      const declines: RoundView['declines'] = [];
      if (ins && d && !errors.length) {
        for (const sg of signs.filter(x => tagValue(x, 'e') === e.id)) {
          if (!isCouncilAt(sg.pubkey, sg.created_at)) continue;
          const person = personOf(sg.pubkey);
          const b = parseJson<{ psbt?: string; decline?: string }>(sg.content);
          if (b?.decline !== undefined) { declines.push({ person, reason: String(b.decline), event: sg }); continue; }
          const entry = sv.council.find(x => personOf(x.identityKey) === person);
          if (!b?.psbt || !entry) continue;
          let sigs: Map<number, string>;
          try { sigs = memberSignatures(b.psbt, d, network, entry, ins); } catch { continue; }
          if (!sigs.size) continue;
          const prev = signatures.get(person) ?? new Map();
          for (const [k, v] of sigs) prev.set(k, v);
          signatures.set(person, prev);
          signEvents.push(sg);
        }
      }
      const ready = !!ins && ins.inputs.length > 0 && ins.inputs.every((_, i) => [...signatures.values()].filter(m => m.has(i)).length >= threshold);
      const receipt = ins && receipts.find(r => {
        const b = parseJson<{ txid: string; block_height: number }>(r.content);
        return tagValue(r, 'e') === e.id && b?.txid === ins!.txid && Number.isInteger(b.block_height) && isCouncilAt(r.pubkey, r.created_at);
      });
      const view: RoundView = {
        event: e, content: c, inspection: ins, errors, isClose, signatures, signEvents, declines, ready, threshold, receipt,
        status: errors.length ? 'invalid' : receipt ? 'paid' : 'open',
      };
      if (view.status === 'paid') for (const id of c.proposals) if (!paidAt.has(id)) paidAt.set(id, receipt!.created_at);
      out.push(view);
    }
    // A round that shares a coin with a paid round can never confirm.
    for (const r of out) {
      if (r.status !== 'open') continue;
      const mine = new Set(r.inspection?.inputs.map(x => `${x.txid}:${x.vout}`));
      if (out.some(o => o !== r && o.status === 'paid' && o.inspection?.inputs.some(x => mine.has(`${x.txid}:${x.vout}`)))) r.status = 'void';
    }
    const pay = new Map<string, Payment>();
    for (const p of proposals) {
      if (p.status !== 'passed' || !['payout', 'close'].includes(p.content.type)) continue;
      const paidRound = out.find(r => r.status === 'paid' && r.content.proposals.includes(p.event.id));
      const openRound = out.find(r => r.status === 'open' && r.content.proposals.includes(p.event.id));
      const l = lapseAt(p);
      pay.set(p.event.id, paidRound ? { status: 'paid', round: paidRound, lapseAt: l }
        : openRound ? { status: 'in_round', round: openRound, lapseAt: l }
        : l !== undefined && now >= l ? { status: 'lapsed', lapseAt: l }
        : !p.confirmed ? { status: 'unconfirmed', lapseAt: l }
        : { status: 'waiting', lapseAt: l });
    }
    return [out, pay];
  }

  /** The members a roster version must have, given its predecessor and basis. */
  function expectedRoster(prev: RosterContent, basis: string[], next: RosterEntry[]): RosterEntry[] | string {
    let members = prev.members.map(m => ({ ...m }));
    for (const id of basis) {
      const p = passed(id);
      const leave = [...leaves.values()].find(l => l.id === id);
      const rk = rekeys.find(r => r.event.id === id && r.effectiveAt !== undefined);
      if (p?.content.type === 'add_member') {
        const k = p.content.payload.candidate_key as string;
        if (members.some(m => personOf(m.key) === personOf(k))) return `already a member: ${id}`;
        const vs = (p.content.payload.verify as string[]).map(verifyOf);
        const mode: Verified = vs.some(v => v && parseJson<any>(v.content).mode === 'in_person') ? 'in_person' : 'remote';
        const added = next.find(m => m.key === k);
        members.push({ key: k, name: p.content.payload.name, since: added?.since ?? '', verified: mode, council: false });
      } else if (p?.content.type === 'remove_member') {
        const k = p.content.payload.member_key as string;
        const m = members.find(m => personOf(m.key) === personOf(k));
        if (!m || m.council) return `cannot remove: ${id}`;
        members = members.filter(x => x !== m);
      } else if (leave) {
        const m = members.find(m => personOf(m.key) === personOf(leave.pubkey));
        if (!m) return `not a member: ${id}`;
        members = members.filter(x => x !== m);
      } else if (rk) {
        const m = members.find(m => m.key === rk.oldKey);
        if (!m) return `old key not on the roster: ${id}`;
        m.key = rk.newKey;
        m.verified = rk.mode;
      } else return `basis not passed or not in effect: ${id}`;
    }
    return members;
  }

  function sameRoster(a: RosterEntry[], b: RosterEntry[], prev: RosterContent): boolean {
    if (a.length !== b.length) return false;
    for (const x of a) {
      const y = b.find(m => m.key === x.key);
      if (!y || y.name !== x.name || y.council !== x.council || y.verified !== x.verified) return false;
      const before = prev.members.find(m => m.key === x.key);
      if (before ? y.since !== before.since : !/^\d{4}-\d{2}-\d{2}$/.test(y.since)) return false;
    }
    return true;
  }

  function extendRoster(): boolean {
    const last = rosters[rosters.length - 1];
    const cands: Candidate<RosterContent>[] = [];
    for (const e of ofKind(KIND.roster)) {
      const c = parseJson<RosterContent>(e.content);
      if (!c || c.version !== last.content.version + 1 || c.prev !== last.hash || !Array.isArray(c.basis) || !Array.isArray(c.members)) continue;
      const hash = hashJson(c);
      let error: string | undefined;
      if (!isCouncilAt(e.pubkey, e.created_at)) error = 'signer is not on the council';
      else {
        const exp = expectedRoster(last.content, c.basis, c.members);
        if (typeof exp === 'string') error = exp;
        else if (!sameRoster(exp, c.members, last.content)) error = 'members do not follow from the basis';
      }
      const end = error ? { persons: [], at: undefined } : endorsedBy(e, 'roster', hash);
      cands.push({ event: e, content: c, hash, endorsers: end.persons, effectiveAt: end.at !== undefined && end.at >= last.effectiveAt ? end.at : undefined, error });
    }
    rosterCandidates = cands;
    const inEffect = [...new Map(cands.filter(c => c.effectiveAt !== undefined).map(c => [c.hash, c])).values()];
    if (inEffect.length === 1) {
      const c = inEffect[0];
      rosters.push({ content: c.content, hash: c.hash, event: c.event, effectiveAt: c.effectiveAt! });
      treasury = undefined;
      rosterCandidates = [];
      return true;
    }
    if (inEffect.length > 1) {
      // Disputed until a next version names one of them (protocol 3.3).
      for (const c of inEffect) {
        const nextNames = ofKind(KIND.roster).some(e => {
          const n = parseJson<RosterContent>(e.content);
          return n?.version === c.content.version + 1 && n.prev === c.hash && endorsedBy(e, 'roster', hashJson(n)).at !== undefined;
        });
        if (nextNames) {
          rosters.push({ content: c.content, hash: c.hash, event: c.event, effectiveAt: c.effectiveAt! });
          rosterCandidates = [];
          return true;
        }
      }
      rosterDisputed = true;
    }
    return false;
  }

  function expectedSettings(prev: SettingsContent, basis: string[]): Omit<SettingsContent, 'version' | 'prev' | 'basis'> | string {
    const rules = JSON.parse(JSON.stringify(prev.rules)) as Rules;
    let closed = prev.closed;
    for (const id of basis) {
      const p = passed(id);
      if (p?.content.type === 'close') {
        if (payments.get(id)?.status !== 'paid') return `closing round not paid yet: ${id}`;
        closed = true;
        continue;
      }
      if (p?.content.type !== 'change_rules') return `basis not a passed rules change: ${id}`;
      for (const ch of p.content.payload.changes as { path: string; from: unknown; to: unknown }[]) {
        const key = ch.path.slice('rules.'.length);
        if (hashJson(rules[key] ?? null) !== hashJson(ch.from ?? null)) return `rule ${key} is no longer ${JSON.stringify(ch.from)}`;
        rules[key] = ch.to;
      }
    }
    return { rules, closed, council: prev.council, threshold: prev.threshold, descriptor: prev.descriptor };
  }

  function extendSettings(): boolean {
    const last = settings[settings.length - 1];
    const cands: Candidate<SettingsContent>[] = [];
    for (const e of ofKind(KIND.settings)) {
      const c = parseJson<SettingsContent>(e.content);
      if (!c || c.version !== last.content.version + 1 || c.prev !== last.hash || !Array.isArray(c.basis)) continue;
      const hash = hashJson(c);
      let error: string | undefined;
      if (!isCouncilAt(e.pubkey, e.created_at)) error = 'signer is not on the council';
      else {
        const exp = expectedSettings(last.content, c.basis);
        if (typeof exp === 'string') error = exp;
        else if (hashJson(exp) !== hashJson({ rules: c.rules, closed: c.closed, council: c.council, threshold: c.threshold, descriptor: c.descriptor })) error = 'settings do not follow from the basis';
      }
      const end = error ? { persons: [], at: undefined } : endorsedBy(e, 'settings', hash);
      cands.push({ event: e, content: c, hash, endorsers: end.persons, effectiveAt: end.at !== undefined && end.at >= last.effectiveAt ? end.at : undefined, error });
    }
    settingsCandidates = cands;
    const inEffect = [...new Map(cands.filter(c => c.effectiveAt !== undefined).map(c => [c.hash, c])).values()];
    if (inEffect.length === 1) {
      const c = inEffect[0];
      settings.push({ content: c.content, hash: c.hash, event: c.event, effectiveAt: c.effectiveAt! });
      settingsCandidates = [];
      return true;
    }
    if (inEffect.length > 1) settingsDisputed = true;
    return false;
  }

  rejected.push(...proposalRejected);

  // Changes waiting for the next roster and settings versions.
  const current = rosters[rosters.length - 1].content;
  const appliedRoster = new Set(rosters.flatMap(r => r.content.basis ?? []));
  const pendingRoster: string[] = [];
  for (const p of proposals) {
    if (p.status !== 'passed' || appliedRoster.has(p.event.id)) continue;
    if (p.content.type === 'add_member' && !current.members.some(m => personOf(m.key) === personOf(p.content.payload.candidate_key))) pendingRoster.push(p.event.id);
    if (p.content.type === 'remove_member' && current.members.some(m => personOf(m.key) === personOf(p.content.payload.member_key) && !m.council)) pendingRoster.push(p.event.id);
  }
  for (const l of leaves.values()) if (!appliedRoster.has(l.id) && current.members.some(m => personOf(m.key) === personOf(l.pubkey))) pendingRoster.push(l.id);
  for (const r of rekeys) if (r.effectiveAt !== undefined && !appliedRoster.has(r.event.id) && current.members.some(m => m.key === r.oldKey)) pendingRoster.push(r.event.id);
  const appliedSettings = new Set(settings.flatMap(s => s.content.basis ?? []));
  const closedNow = settings[settings.length - 1].content.closed;
  const pendingSettings = proposals
    .filter(p => p.status === 'passed' && !appliedSettings.has(p.event.id) && (p.content.type === 'change_rules' || (p.content.type === 'close' && !closedNow && payments.get(p.event.id)?.status === 'paid')))
    .map(p => p.event.id);

  const members: Member[] = current.members.map(m => ({
    key: m.key, person: personOf(m.key), name: m.name, council: m.council, verified: m.verified, since: dateToUnix(m.since),
  }));

  // Keywraps: signed by a key that is or was on a roster, or a verified candidate.
  const known = new Set([...rosters.flatMap(r => r.content.members.map(m => m.key)), ...personByKey.keys(), ...verifies.map(v => parseJson<any>(v.content).candidate_key as string)]);
  const keywraps = new Map<string, { pubkey: string; nonce: string; ct: string; at: number }>();
  for (const e of ofKind(KIND.keywrap)) {
    const c = tagValue(e, 'c');
    const body = parseJson<{ nonce: string; ct: string }>(e.content);
    if (!c || !body?.nonce || !body?.ct) { rejected.push({ event: e, reason: 'keywrap: malformed' }); continue; }
    if (!known.has(e.pubkey)) { rejected.push({ event: e, reason: 'keywrap: signer is not on the roster' }); continue; }
    keywraps.set(c, { pubkey: e.pubkey, nonce: body.nonce, ct: body.ct, at: e.created_at });
  }

  return {
    ...empty,
    rosters, settings, rosterCandidates, settingsCandidates, rosterDisputed, settingsDisputed,
    members, rules: settings[settings.length - 1].content.rules, proposals, verifies, rekeys, leaves,
    pendingRoster, pendingSettings, rounds, payments, closed: closedNow, keywraps,
    personOf, keyOf, isCouncilAt, memberAt, rosterAt, settingsAt, isTreasuryAddress, standingAt,
  };
}

function tallyKey(t: TallyContent): string {
  return hashJson({
    counted: [...t.counted].sort(),
    excluded: [...t.excluded].sort((a, b) => (a.id < b.id ? -1 : 1)),
    result: t.result,
  });
}

/** The proposal's public number, e.g. UNO-0007. */
export const proposalLabel = (daoName: string, n: number) =>
  `${(daoName.split(/\s+/)[0] || 'DAO').toUpperCase()}-${String(n).padStart(4, '0')}`;

/** Build the next roster version from the pending changes (council apps publish this). */
export function nextRoster(s: DaoState, today = utcDate(s.now)): RosterContent | undefined {
  if (!s.pendingRoster.length) return;
  const last = s.rosters[s.rosters.length - 1];
  const basis = s.pendingRoster;
  const members = last.content.members.map(m => ({ ...m }));
  let out = members;
  for (const id of basis) {
    const p = s.proposals.find(x => x.event.id === id);
    const leave = [...s.leaves.values()].find(l => l.id === id);
    const rk = s.rekeys.find(r => r.event.id === id);
    if (p?.content.type === 'add_member') {
      const vs = (p.content.payload.verify as string[]).map(v => s.verifies.find(x => x.id === v));
      const mode: Verified = vs.some(v => v && parseJson<any>(v.content).mode === 'in_person') ? 'in_person' : 'remote';
      out.push({ key: p.content.payload.candidate_key, name: p.content.payload.name, since: today, verified: mode, council: false });
    } else if (p?.content.type === 'remove_member') out = out.filter(m => s.personOf(m.key) !== s.personOf(p.content.payload.member_key));
    else if (leave) out = out.filter(m => s.personOf(m.key) !== s.personOf(leave.pubkey));
    else if (rk) out = out.map(m => (m.key === rk.oldKey ? { ...m, key: rk.newKey, verified: rk.mode } : m));
  }
  return { version: last.content.version + 1, prev: last.hash, basis, members: out };
}

/** Build the next settings version from passed rules changes. */
export function nextSettings(s: DaoState): SettingsContent | undefined {
  if (!s.pendingSettings.length) return;
  const last = s.settings[s.settings.length - 1];
  const rules = JSON.parse(JSON.stringify(last.content.rules)) as Rules;
  let { closed } = last.content;
  for (const id of s.pendingSettings) {
    const p = s.proposals.find(x => x.event.id === id)!;
    if (p.content.type === 'close') closed = true;
    else for (const ch of p.content.payload.changes as { path: string; to: unknown }[]) rules[ch.path.slice('rules.'.length)] = ch.to;
  }
  const { council, threshold, descriptor } = last.content;
  return { version: last.content.version + 1, prev: last.hash, basis: s.pendingSettings, rules, closed, council, threshold, descriptor };
}
