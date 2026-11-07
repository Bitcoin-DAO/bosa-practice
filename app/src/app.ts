// App state: the site file, the DAO rebuilt from relays, this device's identity, the treasury.
import { useEffect, useState } from 'preact/hooks';
import { stageError, stageOf, usable, type SiteConfig } from './core/config';
import { KIND, sign, template, type Event } from './core/events';
import { rebuild, type DaoState, type Member } from './core/state';
import { parseDescriptor } from './core/descriptor';
import { broadcast, loadTreasury, txStatus, type Broadcast, type TreasuryView } from './core/chain';
import { finalizeRound } from './core/round';
import type { RoundView } from './core/state';
import { prfSalt, pubkeyOf, treasuryKeyFromMnemonic, unwrapSecret, wrapSecret } from './core/identity';
import { parseJson } from './core/util';
import { t } from './i18n';
import { query, publish, type PublishResult } from './lib/relays';
import { createPasskey, credTagOf, getPrf } from './lib/passkey';
import { prefs, session, store, type LocalIdentity, type PendingFounder, treasuryCache } from './lib/store';

export type Lang = 'it' | 'en';

export interface AppState {
  site?: SiteConfig;
  loadError?: string;
  loading: boolean;
  events: Event[];
  dao?: DaoState;
  daoId?: string;
  pending?: PendingFounder;
  identity?: LocalIdentity;
  secret?: string; // unlocked identity key, this tab only
  me?: Member;
  isCouncil?: boolean;
  treasury?: TreasuryView;
  treasuryError?: string;
  treasuryAt?: number; // when the shown treasury was read (ms)
  treasuryLoading?: boolean;
  lang: Lang;
  lastSync?: number;
}

let state: AppState = { loading: true, events: [], lang: prefs.lang() ?? (navigator.language?.startsWith('it') ? 'it' : 'en') };
const listeners = new Set<() => void>();

export const getState = () => state;

export function setState(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
}

export function useApp(): AppState {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force(n => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return state;
}

export const relaysOf = (site: SiteConfig) => usable(site.relays);

async function fetchEvents(site: SiteConfig): Promise<Event[]> {
  const relays = relaysOf(site);
  if (site.daoId) return query(relays, { '#D': [site.daoId], limit: 5000 });
  const gens = await query(relays, { kinds: [KIND.genesis], limit: 500 });
  const ids = [
    ...new Set(
      gens
        .filter(g => parseJson<{ site?: string }>(g.content)?.site === site.site)
        .map(g => g.tags.find(t => t[0] === 'D')?.[1])
        .filter((x): x is string => !!x),
    ),
  ];
  if (!ids.length) return gens;
  const rest = await query(relays, { '#D': ids, limit: 5000 });
  return [...gens, ...rest];
}

function derive(events: Event[], extra: Partial<AppState> = {}) {
  const site = state.site!;
  const dao = rebuild(site, events, (extra.pending ?? state.pending)?.pubkey);
  const daoId = dao.founded?.daoId;
  const s = { ...state, ...extra };
  const pubkey = s.secret ? pubkeyOf(s.secret) : s.identity?.pubkey;
  const me = pubkey ? dao.members.find(m => m.person === dao.personOf(pubkey)) : undefined;
  const isCouncil = !!(me && pubkey && dao.isCouncilAt(pubkey, dao.now));
  setState({ ...extra, events, dao, daoId, me, isCouncil, lastSync: Date.now() });
}

const tallied = new Set<string>();
/** When this phone last broadcast each round's transaction. */
const broadcasted = new Map<string, number>();
/** A broadcast that no source has seen after this long is sent again. */
const REBROADCAST_MS = 10 * 60_000;
const receipted = new Set<string>();

/**
 * Where the app reads the chain: the site's current list first, then the one recorded at founding.
 * A source is a site setting, not a rule: it can show data but never move coins (every payment is
 * checked against the treasury's descriptor), so a DAO can add a source without a vote.
 */
export const chainApis = () => [...new Set([...usable(state.site?.chainApi ?? []), ...usable(state.dao?.founded?.config.chainApi ?? [])])];

/** Combine the round's signatures, finalise and broadcast. Anyone may do this; doing it twice is harmless. */
export async function broadcastRound(r: RoundView): Promise<Broadcast> {
  const psbts = r.signEvents.map(e => parseJson<{ psbt: string }>(e.content)!.psbt);
  const { hex } = finalizeRound(psbts);
  const sent = await broadcast(chainApis(), hex, r.inspection!.txid);
  broadcasted.set(sent.txid, Date.now());
  void refreshTreasury();
  return sent;
}

/** Council apps broadcast ready rounds and publish the receipt once the transaction confirms (protocol 6.2, 6.3). */
async function autoRounds() {
  const { dao, secret, isCouncil } = state;
  if (!dao || !secret || !isCouncil) return;
  for (const r of dao.rounds) {
    if (r.status !== 'open' || !r.inspection) continue;
    const txid = r.inspection.txid;
    const st = await txStatus(chainApis(), txid);
    // Not known to any source: broadcast, and again if a source took it but it never reached the network.
    if (!st && r.ready && Date.now() - (broadcasted.get(txid) ?? 0) > REBROADCAST_MS) {
      try {
        await broadcastRound(r);
      } catch {
        /* someone else may have broadcast it, or the API is down: try again next sync */
      }
    }
    if (st?.confirmed && st.block_height && !r.receipt && !receipted.has(txid)) {
      receipted.add(txid);
      try {
        await signAndPublish(KIND.receipt, { txid, block_height: st.block_height }, [['e', r.event.id]]);
        void refreshTreasury();
      } catch {
        receipted.delete(txid);
      }
    }
  }
}

/** Council apps publish the final count of every closed proposal that has none (protocol 4.4). */
async function autoTally() {
  const { dao, secret, isCouncil } = state;
  if (!dao || !secret || !isCouncil) return;
  for (const p of dao.proposals) {
    if (p.status !== 'awaiting_tally' || tallied.has(p.event.id)) continue;
    tallied.add(p.event.id);
    try {
      await signAndPublish(KIND.tally, p.recount, [['e', p.event.id]]);
    } catch {
      tallied.delete(p.event.id);
    }
  }
}

export async function init() {
  try {
    const r = await fetch('./dao.json', { cache: 'no-store' });
    if (!r.ok) throw new Error(`dao.json ${r.status}`);
    const site = (await r.json()) as SiteConfig;
    const bad = stageError(site);
    if (bad) throw new Error(bad);
    setState({ site, pending: await store.getPending(site.site) });
    await sync();
    // Keep open pages current: votes, counts, signatures and receipts arrive from other phones.
    setInterval(() => {
      if (document.visibilityState === 'visible') void sync().catch(() => undefined);
    }, 30000);
  } catch (e) {
    setState({ loading: false, loadError: String((e as Error).message ?? e) });
  }
}

export async function sync() {
  const site = state.site;
  if (!site) return;
  const events = await fetchEvents(site);
  const pending = await store.getPending(site.site);
  const dao = rebuild(site, events, pending?.pubkey);
  const daoId = dao.founded?.daoId;
  let identity: LocalIdentity | undefined;
  let secret: string | undefined;
  if (daoId) {
    identity = await store.getIdentity(daoId);
    secret = session.get(daoId) ?? identity?.plain;
  }
  derive(events, { identity, secret, loading: false, pending });
  if (daoId) {
    if (!state.treasury) {
      const cached = treasuryCache.get<TreasuryView>(daoId);
      if (cached) setState({ treasury: cached.view, treasuryAt: cached.at });
    }
    // One read at a time, and not on every sync: repeated reads pile up and public APIs throttle them.
    const age = Date.now() - (state.treasuryAt ?? 0);
    const sinceTry = Date.now() - lastTreasuryTry;
    const failedRecently = !!state.treasuryError && sinceTry < TREASURY_RETRY_MS; // after a failure, wait before trying again by itself
    // A round seen broadcast or confirmed since the last reading changes the treasury: read again whatever its age.
    const marker = (state.dao?.rounds ?? []).map(r => `${r.event.id}:${r.receipt ? 'c' : r.ready ? 'r' : 'o'}`).join(',');
    const moved = marker !== lastRoundMarker;
    lastRoundMarker = marker;
    if ((moved || age > TREASURY_FRESH_MS) && !failedRecently) void refreshTreasury();
  }
  void autoTally().then(autoRounds);
}

const TREASURY_FRESH_MS = 5 * 60_000; // a reading older than this is refreshed in the background (the remembered one shows meanwhile); rounds trigger a read at once
const TREASURY_RETRY_MS = 2 * 60_000; // after a failed read, wait this long before trying again by itself
let treasuryRead: Promise<void> | undefined;
let readAgain = false;
let lastTreasuryTry = 0;
let lastRoundMarker: string | undefined;

/**
 * Read the treasury from the chain. Only one read runs at a time. A call made while a read is running
 * queues one more read after it, so a caller (after a broadcast, say) always gets a read that started later.
 */
export function refreshTreasury(): Promise<void> {
  if (treasuryRead) {
    readAgain = true;
    return treasuryRead.then(() => (treasuryRead ? treasuryRead : undefined));
  }
  const cfg = state.dao?.founded?.config;
  const daoId = state.dao?.founded?.daoId;
  if (!cfg || !daoId) return Promise.resolve();
  lastTreasuryTry = Date.now();
  setState({ treasuryLoading: true });
  treasuryRead = (async () => {
    try {
      const d = parseDescriptor(cfg.descriptor, cfg.network);
      const view = await loadTreasury(d, cfg.network, chainApis());
      treasuryCache.set(daoId, view);
      setState({ treasury: view, treasuryAt: Date.now(), treasuryError: undefined });
    } catch (e) {
      setState({ treasuryError: String((e as Error).message ?? e) });
    } finally {
      treasuryRead = undefined;
      setState({ treasuryLoading: false });
      if (readAgain) {
        readAgain = false;
        void refreshTreasury();
      }
    }
  })();
  return treasuryRead;
}

/** Sign with the unlocked key, publish to every relay, and fold the event into local state. */
export async function signAndPublish(kind: number, content: unknown, tags: string[][] = [], secret = state.secret, daoId = state.daoId): Promise<{ event: Event; result: PublishResult }> {
  if (!secret || !daoId || !state.site) throw new Error('not-signed-in');
  const event = sign(template(kind, daoId, content, tags), secret);
  const result = await publish(relaysOf(state.site), event);
  if (!result.ok.length) throw new Error('publish-failed: ' + result.failed.map(f => f.reason).join('; '));
  derive([...state.events, event]);
  return { event, result };
}

/** Publish an event that is already signed (genesis, endorsements during founding). */
export async function publishSigned(event: Event): Promise<PublishResult> {
  const result = await publish(relaysOf(state.site!), event);
  if (!result.ok.length) throw new Error('publish-failed: ' + result.failed.map(f => f.reason).join('; '));
  derive([...state.events, event]);
  return result;
}

/** Once this device's new key is on the roster (founder, new member, or replaced key): protect it with
 * the passkey and publish dao.keywrap (protocol 3.5 step 5, 1.5). */
export async function completeFounding(): Promise<void> {
  const { pending, daoId, site } = state;
  if (!pending || !daoId || !site) throw new Error('no-pending');
  let identity: LocalIdentity = { daoId, pubkey: pending.pubkey, credId: pending.credId, treasury: pending.treasury };
  if (pending.credId && pending.prfSupported) {
    const a = await getPrf({ passkeyDomain: site.passkeyDomain, salt: prfSalt(daoId), credId: pending.credId });
    if (!a.prf) throw new Error('no-prf');
    const wrapped = wrapSecret(a.prf, pending.secret);
    identity = { ...identity, wrapped };
    await store.setIdentity(identity);
    session.set(daoId, pending.secret);
    setState({ identity, secret: pending.secret });
    await signAndPublish(KIND.keywrap, wrapped, [['c', a.credTag]]);
  } else {
    identity = { ...identity, plain: pending.secret };
    await store.setIdentity(identity);
    setState({ identity, secret: pending.secret });
  }
  await store.clearPending(site.site);
  derive(state.events, { pending: undefined });
}

/** Passkey sign-in: find this credential's dao.keywrap and open it. */
export async function signIn(): Promise<'ok' | 'no-prf' | 'not-found'> {
  const { site, daoId } = state;
  if (!site || !daoId) throw new Error('not-founded');
  const a = await getPrf({ passkeyDomain: site.passkeyDomain, salt: prfSalt(daoId) });
  if (!a.prf) return 'no-prf';
  let kw = state.dao?.keywraps.get(a.credTag);
  if (!kw) {
    const evs = await query(relaysOf(site), { kinds: [KIND.keywrap], '#D': [daoId], '#c': [a.credTag] });
    derive([...state.events, ...evs]);
    kw = state.dao?.keywraps.get(a.credTag);
  }
  if (!kw) return 'not-found';
  const secret = unwrapSecret(a.prf, kw);
  if (pubkeyOf(secret) !== kw.pubkey) return 'not-found';
  const existing = await store.getIdentity(daoId);
  const identity: LocalIdentity = { ...existing, daoId, pubkey: kw.pubkey, credId: a.credId, wrapped: { nonce: kw.nonce, ct: kw.ct } };
  await store.setIdentity(identity);
  session.set(daoId, secret);
  derive(state.events, { identity, secret });
  return 'ok';
}

/** Identity card restore (protocol 1.7): new passkey, same key, new dao.keywrap. */
export async function restoreFromCard(secret: string, name: string): Promise<'wrapped' | 'local'> {
  const { site, daoId } = state;
  if (!site || !daoId) throw new Error('not-founded');
  const pubkey = pubkeyOf(secret);
  if (!state.dao?.members.some(m => m.key === pubkey)) throw new Error('not-member');
  const salt = prfSalt(daoId);
  const created = await createPasskey({ passkeyDomain: site.passkeyDomain, rpName: site.name, userName: passkeyName(name), salt });
  const existing = await store.getIdentity(daoId);
  let prf = created.prf;
  if (!prf && created.prfSupported) prf = (await getPrf({ passkeyDomain: site.passkeyDomain, salt, credId: created.credId })).prf;
  session.set(daoId, secret);
  if (!prf) {
    const identity: LocalIdentity = { ...existing, daoId, pubkey, credId: created.credId, plain: secret, wrapped: undefined };
    await store.setIdentity(identity);
    derive(state.events, { identity, secret });
    return 'local';
  }
  const wrapped = wrapSecret(prf, secret);
  const identity: LocalIdentity = { ...existing, daoId, pubkey, credId: created.credId, wrapped, plain: undefined };
  await store.setIdentity(identity);
  derive(state.events, { identity, secret });
  await signAndPublish(KIND.keywrap, wrapped, [['c', credTagOf(created.credId)]]);
  return 'wrapped';
}

/** The name shown in the phone's passkey list: practice passkeys say so, since stages share a domain. */
export function passkeyName(name: string): string {
  const s = state.site ? stageOf(state.site) : 'testnet';
  return s === 'practice' ? `${name} · ${state.site!.name} (${state.lang === 'en' ? 'practice' : 'prova generale'})` : `${name} · ${state.site?.name ?? ''}`;
}

/**
 * Trial stages only: put a council member's test treasury key back on this phone from its 12 words,
 * after a restore from the identity card (which carries the identity key only). The words must give
 * exactly the treasury key recorded for this member on the council; anything else is refused.
 */
export async function restoreTreasuryKey(words: string): Promise<void> {
  const { site, dao, identity, me } = state;
  if (!site || !dao || !identity || !me) throw new Error(t('tk.notMember'));
  if (site.network === 'mainnet') throw new Error(t('tk.mainnet'));
  const entry = dao.settingsAt(dao.now).content.council.find(c => dao.personOf(c.identityKey) === me.person);
  if (!entry) throw new Error(t('tk.notCouncil'));
  let key;
  try {
    key = treasuryKeyFromMnemonic(words.trim().toLowerCase().split(/\s+/).join(' '), site.network);
  } catch {
    throw new Error(t('tk.badWords'));
  }
  if (key.xpub !== entry.xpub || key.fingerprint !== entry.fingerprint.toLowerCase()) throw new Error(t('tk.wrongKey', { fp: entry.fingerprint }));
  const next: LocalIdentity = { ...identity, treasury: key };
  await store.setIdentity(next);
  setState({ identity: next });
}

export function signOut() {
  if (state.daoId) session.clear(state.daoId);
  derive(state.events, { secret: state.identity?.plain });
}

export function setLang(lang: Lang) {
  prefs.setLang(lang);
  document.documentElement.lang = lang;
  setState({ lang });
}
