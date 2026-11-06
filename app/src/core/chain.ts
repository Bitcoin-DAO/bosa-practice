// Treasury balance, donation address and movements from the chain (protocol 6.4, 8.6).
// Two kinds of source, listed in the config's chainApi: an Esplora API (mempool.space style, the default)
// and a Blockbook server, written "blockbook:<address>". The app asks in Esplora's terms; Blockbook's
// answers are translated, so the rest of the app never sees the difference.
import type { Network } from './config';
import { treasuryAddress, type ParsedDescriptor } from './descriptor';
import type { Utxo } from './round';

/**
 * Unused addresses to check past the last used one. The app only ever shows the first unused address
 * (donations) and takes change in order, so used addresses stay contiguous and a short gap is enough.
 * Each extra address is one more request to a public API that slows down bursts.
 */
const GAP = 5;

interface AddrStats {
  funded_txo_sum: number;
  spent_txo_sum: number;
  tx_count: number;
}

interface EsploraTx {
  txid: string;
  status: { confirmed: boolean; block_height?: number; block_time?: number };
  vin: { prevout: { scriptpubkey_address?: string; value: number } | null }[];
  vout: { scriptpubkey_address?: string; value: number }[];
  fee: number;
}

export interface Movement {
  txid: string;
  net: number; // sats, + in, − out
  fee: number;
  confirmed: boolean;
  time?: number;
}

export interface TreasuryView {
  balance: number; // confirmed + unconfirmed
  unconfirmed: number;
  donationAddress: string;
  donationIndex: number;
  changeIndex: number; // lowest unused change address
  movements: Movement[];
  utxos: Utxo[];
}

export type Fetcher = (url: string) => Promise<unknown>;

const TIMEOUT_MS = 30_000;
/** A whole treasury reading gives up after this, so a throttled API cannot keep the page loading for many minutes. */
const READ_BUDGET_MS = 2 * 60_000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** One request, given up after TIMEOUT_MS so a stalled request cannot hang the page. */
const defaultFetch: Fetcher = async url => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
};

/** A chain source from the config's chainApi: an Esplora API, or a Blockbook server written "blockbook:<address>". */
export interface Source {
  kind: 'esplora' | 'blockbook';
  base: string;
}

export function sourceOf(entry: string): Source {
  const m = entry.match(/^blockbook:(.+)$/i);
  return m ? { kind: 'blockbook', base: m[1].replace(/\/+$/, '') } : { kind: 'esplora', base: entry.replace(/\/+$/, '') };
}

/** The source's web explorer, for links to a transaction (`${explorerOf(e)}/tx/<txid>`). */
export function explorerOf(entry: string): string {
  const s = sourceOf(entry);
  return s.kind === 'blockbook' ? s.base : s.base.replace(/\/api$/, '');
}

/** The explorer page where anyone can paste a signed transaction to broadcast it. */
export function pushPageOf(entry: string): string {
  return sourceOf(entry).kind === 'blockbook' ? `${explorerOf(entry)}/sendtx` : `${explorerOf(entry)}/tx/push`;
}

/** The URL that answers one Esplora-style request, and how to turn its answer into Esplora's shape. */
interface Request {
  url: string;
  conv: (r: unknown) => unknown;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

interface BbTx {
  txid: string;
  vin?: { addresses?: string[]; value?: string }[];
  vout?: { addresses?: string[]; value?: string }[];
  fees?: string;
  confirmations?: number;
  blockHeight?: number;
  blockTime?: number;
}

const bbTx = (t: BbTx): EsploraTx => ({
  txid: t.txid,
  fee: num(t.fees),
  status: (t.confirmations ?? 0) > 0 ? { confirmed: true, block_height: t.blockHeight, block_time: t.blockTime } : { confirmed: false },
  vin: (t.vin ?? []).map(i => ({ prevout: { scriptpubkey_address: i.addresses?.[0], value: num(i.value) } })),
  vout: (t.vout ?? []).map(o => ({ scriptpubkey_address: o.addresses?.[0], value: num(o.value) })),
});

/** Blockbook's API v2 for each request the app makes (https://github.com/trezor/blockbook/blob/master/docs/api.md). */
function blockbookRequest(base: string, path: string): Request | undefined {
  let m: RegExpMatchArray | null;
  if ((m = path.match(/^\/address\/([^/]+)$/)))
    return {
      url: `${base}/api/v2/address/${m[1]}?details=basic`,
      conv: r => {
        const a = r as { balance?: string; unconfirmedBalance?: string; txs?: number; unconfirmedTxs?: number };
        return {
          chain_stats: { funded_txo_sum: num(a.balance), spent_txo_sum: 0, tx_count: num(a.txs) },
          mempool_stats: { funded_txo_sum: num(a.unconfirmedBalance), spent_txo_sum: 0, tx_count: num(a.unconfirmedTxs) },
        };
      },
    };
  if ((m = path.match(/^\/address\/([^/]+)\/txs$/)))
    return { url: `${base}/api/v2/address/${m[1]}?details=txs&pageSize=1000`, conv: r => ((r as { transactions?: BbTx[] }).transactions ?? []).map(bbTx) };
  if ((m = path.match(/^\/address\/([^/]+)\/utxo$/)))
    return { url: `${base}/api/v2/utxo/${m[1]}`, conv: r => (r as { txid: string; vout: number; value: string }[]).map(u => ({ txid: u.txid, vout: u.vout, value: num(u.value) })) };
  if ((m = path.match(/^\/tx\/([0-9a-f]{64})\/status$/)))
    return {
      url: `${base}/api/v2/tx/${m[1]}`,
      conv: r => {
        const t = r as BbTx;
        return (t.confirmations ?? 0) > 0 ? { confirmed: true, block_height: t.blockHeight } : { confirmed: false };
      },
    };
  if (path === '/v1/fees/recommended')
    return {
      url: `${base}/api/v2/estimatefee/3`,
      conv: r => {
        const satVb = Math.ceil(num((r as { result?: string }).result) * 1e5); // BTC per kvB to sat per vB
        return { halfHourFee: satVb, hourFee: satVb, minimumFee: 1 };
      },
    };
  return undefined;
}

function requestFor(entry: string, path: string): Request | undefined {
  const s = sourceOf(entry);
  return s.kind === 'blockbook' ? blockbookRequest(s.base, path) : { url: s.base + path, conv: r => r };
}

/** When each source last failed: a source that failed recently is asked last, so one slow source does not slow every request. */
const failedAt = new Map<string, number>();
const DEMOTE_MS = 5 * 60_000;

function inOrder(apis: string[]): string[] {
  const recent = (a: string) => Date.now() - (failedAt.get(a) ?? 0) < DEMOTE_MS;
  return [...apis.filter(a => !recent(a)), ...apis.filter(recent)];
}

/**
 * Ask the sources in turn: each one once, then (on the real network) twice more after a pause.
 * Public APIs throttle bursts; a refusal reaches the page only as "Failed to fetch", a slowdown as a timeout.
 */
async function get<T>(apis: string[], path: string, f: Fetcher, until = Infinity): Promise<T> {
  const live = f === defaultFetch;
  let last: unknown;
  for (let attempt = 0; attempt < (live ? 3 : 1); attempt++) {
    if (attempt > 0) await sleep(attempt === 1 ? 2000 : 5000);
    for (const api of inOrder(apis)) {
      if (Date.now() > until) throw new Error(`no complete answer in ${READ_BUDGET_MS / 60_000} min`);
      const req = requestFor(api, path);
      if (!req) continue;
      try {
        const r = req.conv(await f(req.url)) as T;
        failedAt.delete(api);
        return r;
      } catch (e) {
        last = e;
        failedAt.set(api, Date.now());
      }
    }
  }
  const msg = last instanceof Error ? (last.name === 'AbortError' ? `no answer in ${TIMEOUT_MS / 1000} s` : last.message) : 'no chain API';
  throw new Error(`${path.replace(/\/[0-9a-z]{20,}/gi, '/…')}: ${msg}`);
}

export async function loadTreasury(d: ParsedDescriptor, network: Network, apis: string[], f: Fetcher = defaultFetch): Promise<TreasuryView> {
  let balance = 0;
  let unconfirmed = 0;
  const used: string[] = [];
  const where = new Map<string, { branch: 0 | 1; index: number }>();
  let donationAddress = '';
  let donationIndex = -1;
  let changeIndex = -1;

  // One address at a time on the real network, with a short pause: public APIs slow down bursts until requests time out.
  const live = f === defaultFetch;
  const until = live ? Date.now() + READ_BUDGET_MS : Infinity;
  const BATCH = live ? 1 : 5;
  for (const branch of [0, 1] as const) {
    let gap = 0;
    for (let i = 0; gap < GAP; i += BATCH) {
      if (live && (i > 0 || branch > 0)) await sleep(250);
      const batch = Array.from({ length: BATCH }, (_, k) => treasuryAddress(d, network, branch, i + k).address);
      const stats = await Promise.all(
        batch.map(a => get<{ chain_stats: AddrStats; mempool_stats: AddrStats }>(apis, `/address/${a}`, f, until)),
      );
      stats.forEach((s, k) => {
        const txs = s.chain_stats.tx_count + s.mempool_stats.tx_count;
        if (txs === 0) {
          gap++;
          if (branch === 0 && donationIndex < 0) {
            donationIndex = i + k;
            donationAddress = batch[k];
          }
          if (branch === 1 && changeIndex < 0) changeIndex = i + k;
          return;
        }
        gap = 0;
        used.push(batch[k]);
        where.set(batch[k], { branch, index: i + k });
        balance += s.chain_stats.funded_txo_sum - s.chain_stats.spent_txo_sum;
        const mem = s.mempool_stats.funded_txo_sum - s.mempool_stats.spent_txo_sum;
        balance += mem;
        unconfirmed += mem;
      });
    }
  }

  const mine = new Set(used);
  const txs = new Map<string, EsploraTx>();
  for (const a of used) for (const tx of await get<EsploraTx[]>(apis, `/address/${a}/txs`, f, until)) txs.set(tx.txid, tx);
  const movements: Movement[] = [...txs.values()]
    .map(tx => {
      const out = tx.vout.filter(o => o.scriptpubkey_address && mine.has(o.scriptpubkey_address)).reduce((s, o) => s + o.value, 0);
      const inp = tx.vin.filter(i => i.prevout?.scriptpubkey_address && mine.has(i.prevout.scriptpubkey_address)).reduce((s, i) => s + i.prevout!.value, 0);
      return { txid: tx.txid, net: out - inp, fee: tx.fee, confirmed: tx.status.confirmed, time: tx.status.block_time };
    })
    .sort((a, b) => (b.time ?? 4e9) - (a.time ?? 4e9)); // unconfirmed first

  const utxos: Utxo[] = [];
  for (const a of used) {
    for (const u of await get<{ txid: string; vout: number; value: number }[]>(apis, `/address/${a}/utxo`, f, until)) {
      utxos.push({ txid: u.txid, vout: u.vout, value: u.value, address: a, ...where.get(a)! });
    }
  }

  return { balance, unconfirmed, donationAddress, donationIndex, changeIndex, movements, utxos };
}

/** Fee rate for confirmation within about half an hour (mempool.space API). */
export async function feeRate(apis: string[], f: Fetcher = defaultFetch): Promise<number> {
  const r = await get<{ halfHourFee: number; hourFee: number; minimumFee: number }>(apis, '/v1/fees/recommended', f);
  return Math.max(1, r.halfHourFee || r.hourFee || r.minimumFee || 1);
}

/** Send a signed transaction to each source in turn until one accepts it. */
export async function broadcast(apis: string[], hex: string): Promise<string> {
  let last: unknown;
  for (const api of inOrder(apis)) {
    const s = sourceOf(api);
    try {
      if (s.kind === 'blockbook') {
        const r = await fetch(`${s.base}/api/v2/sendtx/`, { method: 'POST', body: hex, headers: { 'Content-Type': 'text/plain' } });
        const j = (await r.json().catch(() => ({}))) as { result?: string; error?: string | { message?: string } };
        if (r.ok && j.result) return j.result.trim();
        last = new Error(typeof j.error === 'string' ? j.error : (j.error?.message ?? `${r.status}`));
      } else {
        const r = await fetch(s.base + '/tx', { method: 'POST', body: hex, headers: { 'Content-Type': 'text/plain' } });
        const text = await r.text();
        if (r.ok) return text.trim();
        last = new Error(text);
      }
      failedAt.set(api, Date.now());
    } catch (e) {
      last = e;
      failedAt.set(api, Date.now());
    }
  }
  throw last ?? new Error('no chain API');
}

export interface TxStatus {
  confirmed: boolean;
  block_height?: number;
}

export async function txStatus(apis: string[], txid: string, f: Fetcher = defaultFetch): Promise<TxStatus | undefined> {
  try {
    return await get<TxStatus>(apis, `/tx/${txid}/status`, f);
  } catch {
    return undefined;
  }
}
