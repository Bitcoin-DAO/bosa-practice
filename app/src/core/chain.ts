// Treasury balance, donation address and movements from an Esplora-compatible API (protocol 6.4, 8.6).
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

/**
 * Try each API in turn; on the real network, retry each one twice with a pause.
 * Public APIs (mempool.space) refuse bursts, and a refusal reaches the page only as "Failed to fetch".
 */
async function get<T>(apis: string[], path: string, f: Fetcher, until = Infinity): Promise<T> {
  const live = f === defaultFetch;
  let last: unknown;
  for (const api of apis) {
    for (let attempt = 0; attempt < (live ? 3 : 1); attempt++) {
      if (Date.now() > until) throw new Error(`no complete answer in ${READ_BUDGET_MS / 60_000} min`);
      if (attempt > 0) await sleep(attempt === 1 ? 2000 : 5000);
      try {
        return (await f(api.replace(/\/$/, '') + path)) as T;
      } catch (e) {
        last = e;
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

export async function broadcast(apis: string[], hex: string): Promise<string> {
  let last: unknown;
  for (const api of apis) {
    try {
      const r = await fetch(api.replace(/\/$/, '') + '/tx', { method: 'POST', body: hex, headers: { 'Content-Type': 'text/plain' } });
      const text = await r.text();
      if (r.ok) return text.trim();
      last = new Error(text);
    } catch (e) {
      last = e;
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
