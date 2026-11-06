import { afterEach, describe, expect, it, vi } from 'vitest';
import { broadcast, explorerOf, feeRate, loadTreasury, pushPageOf, sourceOf, txStatus, type Fetcher } from './chain';
import { parseDescriptor, treasuryAddress } from './descriptor';

// UNO's practice treasury (2 of 2), as founded on 6 November 2026.
const DESC =
  'wsh(sortedmulti(2,[8c37eb1f/48h/1h/0h/2h]tpubDDyUsGt7EpEm4jD28eT4wfpzmp1AqhX9eTSx2Bt38EtoXkRfifsLRKEG7Ta3ybkf47cSfYfab4Nm3Fs7sWYwkbGDnBsJ2JnUDN4K8RmsrDv/<0;1>/*,[c0b17122/48h/1h/0h/2h]tpubDF7RfpXnri3KfwmUUe7K9hZoDmZt9KMSPHDBfdRKQeAWZLJdi86QSDPkTSv7uUXvTzDMJ3kzuBhnLtBPTFB7MbfA4LHs6vd2t4jZ9yDbMA9/<0;1>/*))#088sezad';
const d = parseDescriptor(DESC, 'testnet4');
const A0 = treasuryAddress(d, 'testnet4', 0, 0).address;
const A1 = treasuryAddress(d, 'testnet4', 0, 1).address;
const TXID = '490e04f094c3e5e3c370e305b4107ea15eb8656d408d336b83456f54a824f801';
const BB = 'https://blockbook.example';

/** A Blockbook server holding one confirmed 10,000-sat deposit to A0, in Blockbook's own answer format. */
const blockbook: Fetcher = async url => {
  const u = new URL(url);
  let m: RegExpMatchArray | null;
  if ((m = u.pathname.match(/^\/api\/v2\/address\/([^/]+)$/))) {
    const used = m[1] === A0;
    if (u.searchParams.get('details') === 'txs')
      return used
        ? {
            address: A0,
            transactions: [
              {
                txid: TXID,
                vin: [{ addresses: ['2N5SK7BFXGzefmMs9AHui2Y71fUh3uVVn2S'], value: '100000' }],
                vout: [
                  { addresses: ['tb1qrd5rzllu7k5eylyg3g2a7e9ptst5yjna6h2ljt'], value: '89013' },
                  { addresses: [A0], value: '10000' },
                ],
                fees: '987',
                confirmations: 65,
                blockHeight: 159356,
                blockTime: 1793953260,
              },
            ],
          }
        : { address: m[1], transactions: [] };
    return { address: m[1], balance: used ? '10000' : '0', unconfirmedBalance: '0', txs: used ? 1 : 0, unconfirmedTxs: 0 };
  }
  if ((m = u.pathname.match(/^\/api\/v2\/utxo\/([^/]+)$/))) return m[1] === A0 ? [{ txid: TXID, vout: 1, value: '10000', confirmations: 65 }] : [];
  if (u.pathname === `/api/v2/tx/${TXID}`) return { txid: TXID, confirmations: 65, blockHeight: 159356 };
  if (u.pathname === '/api/v2/estimatefee/3') return { result: '0.00002' };
  throw new Error(`404 ${url}`);
};

describe('chain sources', () => {
  it('reads a source entry: Esplora by default, Blockbook with its prefix', () => {
    expect(sourceOf('https://mempool.space/testnet4/api/')).toEqual({ kind: 'esplora', base: 'https://mempool.space/testnet4/api' });
    expect(sourceOf('blockbook:https://blockbook.tbtc.zelcore.io/')).toEqual({ kind: 'blockbook', base: 'https://blockbook.tbtc.zelcore.io' });
    expect(explorerOf('https://mempool.space/testnet4/api')).toBe('https://mempool.space/testnet4');
    expect(explorerOf('blockbook:https://blockbook.tbtc.zelcore.io')).toBe('https://blockbook.tbtc.zelcore.io');
    expect(pushPageOf('https://mempool.space/testnet4/api')).toBe('https://mempool.space/testnet4/tx/push');
    expect(pushPageOf('blockbook:https://blockbook.tbtc.zelcore.io')).toBe('https://blockbook.tbtc.zelcore.io/sendtx');
  });

  it('reads the treasury from Blockbook: balance, coins, movements, next donation address', async () => {
    const tr = await loadTreasury(d, 'testnet4', [`blockbook:${BB}`], blockbook);
    expect(tr.balance).toBe(10000);
    expect(tr.unconfirmed).toBe(0);
    expect(tr.donationAddress).toBe(A1);
    expect(tr.utxos).toEqual([{ txid: TXID, vout: 1, value: 10000, address: A0, branch: 0, index: 0 }]);
    expect(tr.movements).toEqual([{ txid: TXID, net: 10000, fee: 987, confirmed: true, time: 1793953260 }]);
  });

  it('falls back to Blockbook when the Esplora source does not answer', async () => {
    const f: Fetcher = async url => {
      if (url.startsWith('https://esplora.example')) throw new Error('Failed to fetch');
      return blockbook(url);
    };
    const tr = await loadTreasury(d, 'testnet4', ['https://esplora.example/api', `blockbook:${BB}`], f);
    expect(tr.balance).toBe(10000);
  });

  it('turns Blockbook fee estimates and transaction status into the app\'s terms', async () => {
    expect(await feeRate([`blockbook:${BB}`], blockbook)).toBe(2); // 0.00002 BTC/kvB = 2 sat/vB
    expect(await txStatus([`blockbook:${BB}`], TXID, blockbook)).toEqual({ confirmed: true, block_height: 159356 });
  });

  it('does not take an unknown transaction for one on the network', async () => {
    const other = 'ab'.repeat(32);
    // Blockbook answering with an error object, or with another transaction.
    const bbErr: Fetcher = async url => (url.includes(other) ? { error: `txid ${other} not found` } : blockbook(url));
    expect(await txStatus([`blockbook:${BB}`], other, bbErr)).toBeUndefined();
    // Esplora answering 200 with something that is not a status (a holding page read as JSON).
    expect(await txStatus(['https://esplora.example/api'], other, async () => ({ message: 'maintenance' }))).toBeUndefined();
    expect(await txStatus(['https://esplora.example/api'], other, async () => ({ confirmed: false }))).toEqual({ confirmed: false });
  });
});

describe('broadcast', () => {
  afterEach(() => vi.unstubAllGlobals());
  const txid = 'cd'.repeat(32);
  const answer = (body: string, ok = true) => Promise.resolve(new Response(body, { status: ok ? 200 : 400 }));

  it('counts a source as accepting only when it answers with the transaction id', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      seen.push(url);
      if (url.startsWith('https://esplora.example')) return answer('<html>Service temporarily unavailable</html>');
      return answer(JSON.stringify({ result: txid }));
    });
    const sent = await broadcast(['https://esplora.example/api', `blockbook:${BB}`], '00', txid);
    expect(sent).toEqual({ txid, source: `blockbook:${BB}` });
    expect(seen).toEqual(['https://esplora.example/api/tx', `${BB}/api/v2/sendtx/`]);
  });

  it('fails when no source returns the id', async () => {
    vi.stubGlobal('fetch', () => answer(JSON.stringify({ error: { message: 'min relay fee not met' } }), false));
    await expect(broadcast([`blockbook:${BB}`], '00', txid)).rejects.toThrow('min relay fee not met');
  });
});
