// A small Esplora/mempool.space stand-in for the end-to-end tests: a chain held in memory.
// The same chain also answers in Blockbook's API v2 under /bb (CHAIN=blockbook in run.sh).
// Coins come from out/funded.json ({address: {value, txid}}), written by the tests. Broadcast
// transactions spend them and confirm after a few seconds; each one is saved for an embit check.
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const { Transaction, OutScript, Address, TEST_NETWORK } = require('@scure/btc-signer');
const { hex } = require('@scure/base');

const OUT = new URL('./out/', import.meta.url);
const CONFIRM_MS = 4000;
const txs = new Map(); // txid -> { vin: [{txid, vout, prevout: {address, value}}], vout: [{address, value}], fee, confirmed, height, time }
const utxos = new Map(); // "txid:vout" -> { address, value }
let height = 100;

function seed() {
  let funded = {};
  try { funded = JSON.parse(fs.readFileSync(new URL('funded.json', OUT), 'utf8')); } catch {}
  for (const [address, f] of Object.entries(funded)) {
    if (txs.has(f.txid)) continue;
    height++;
    txs.set(f.txid, { vin: [{ txid: '00'.repeat(32), vout: 0, prevout: { address: 'tb1qsomeoneelse', value: f.value + 141 } }], vout: [{ address, value: f.value }], fee: 141, confirmed: true, height, time: Math.floor(Date.now() / 1000) });
    utxos.set(`${f.txid}:0`, { address, value: f.value });
  }
}

const esploraTx = (txid, t) => ({
  txid, fee: t.fee,
  status: t.confirmed ? { confirmed: true, block_height: t.height, block_time: t.time } : { confirmed: false },
  vin: t.vin.map(i => ({ txid: i.txid, vout: i.vout, prevout: { scriptpubkey_address: i.prevout.address, value: i.prevout.value } })),
  vout: t.vout.map(o => ({ scriptpubkey_address: o.address, value: o.value })),
});

function stats(address) {
  const s = { chain_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 } };
  for (const t of txs.values()) {
    const k = t.confirmed ? s.chain_stats : s.mempool_stats;
    const f = t.vout.filter(o => o.address === address).reduce((a, o) => a + o.value, 0);
    const sp = t.vin.filter(i => i.prevout.address === address).reduce((a, i) => a + i.prevout.value, 0);
    if (f || sp) k.tx_count++;
    k.funded_txo_sum += f;
    k.spent_txo_sum += sp;
  }
  return s;
}

function accept(rawHex) {
  const tx = Transaction.fromRaw(hex.decode(rawHex), { allowUnknownOutputs: true });
  const vin = [];
  for (let i = 0; i < tx.inputsLength; i++) {
    const inp = tx.getInput(i);
    const key = `${hex.encode(inp.txid)}:${inp.index}`;
    const u = utxos.get(key);
    if (!u) throw new Error(`bad-txns-inputs-missingorspent ${key}`);
    if (!inp.finalScriptWitness || inp.finalScriptWitness.length < 3) throw new Error('missing witness');
    vin.push({ txid: hex.encode(inp.txid), vout: inp.index, prevout: u });
  }
  const vout = [];
  for (let i = 0; i < tx.outputsLength; i++) {
    const o = tx.getOutput(i);
    vout.push({ address: Address(TEST_NETWORK).encode(OutScript.decode(o.script)), value: Number(o.amount) });
  }
  const fee = vin.reduce((a, i) => a + i.prevout.value, 0) - vout.reduce((a, o) => a + o.value, 0);
  if (fee <= 0) throw new Error('fee');
  const txid = tx.id;
  if (txs.has(txid)) return txid;
  for (const i of vin) utxos.delete(`${i.txid}:${i.vout}`);
  vout.forEach((o, n) => utxos.set(`${txid}:${n}`, { address: o.address, value: o.value }));
  txs.set(txid, { vin, vout, fee, confirmed: false });
  fs.writeFileSync(new URL(`broadcast-${txid}.json`, OUT), JSON.stringify({ hex: rawHex, amounts: vin.map(i => i.prevout.value) }));
  setTimeout(() => {
    const t = txs.get(txid);
    t.confirmed = true;
    t.height = ++height;
    t.time = Math.floor(Date.now() / 1000);
  }, CONFIRM_MS);
  return txid;
}

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.end();
  seed();
  const send = (code, body, type = 'application/json') => {
    res.statusCode = code;
    res.setHeader('Content-Type', type);
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  const url = req.url.split('?')[0];
  const query = new URL(req.url, 'http://x').searchParams;
  if (url.startsWith('/bb/')) return blockbook(req, url.slice(3), query, send);
  if (req.method === 'POST' && url === '/api/tx') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try { send(200, accept(body.trim()), 'text/plain'); } catch (e) { send(400, String(e.message), 'text/plain'); }
    });
    return;
  }
  if (url === '/api/v1/fees/recommended') return send(200, { fastestFee: 3, halfHourFee: 2, hourFee: 1, economyFee: 1, minimumFee: 1 });
  let m;
  if ((m = url.match(/^\/api\/tx\/([0-9a-f]{64})\/status$/))) {
    const t = txs.get(m[1]);
    return t ? send(200, t.confirmed ? { confirmed: true, block_height: t.height, block_time: t.time } : { confirmed: false }) : send(404, 'Transaction not found', 'text/plain');
  }
  if ((m = url.match(/^\/api\/address\/([a-z0-9]+)\/utxo$/))) {
    const out = [];
    for (const [k, u] of utxos) if (u.address === m[1]) {
      const [txid, vout] = k.split(':');
      const t = txs.get(txid);
      out.push({ txid, vout: Number(vout), value: u.value, status: t.confirmed ? { confirmed: true, block_height: t.height } : { confirmed: false } });
    }
    return send(200, out);
  }
  if ((m = url.match(/^\/api\/address\/([a-z0-9]+)\/txs$/))) {
    const out = [...txs.entries()].filter(([, t]) => t.vout.some(o => o.address === m[1]) || t.vin.some(i => i.prevout.address === m[1])).map(([id, t]) => esploraTx(id, t)).reverse();
    return send(200, out);
  }
  if ((m = url.match(/^\/api\/address\/([a-z0-9]+)$/))) return send(200, stats(m[1]));
  send(404, {});
}).listen(3002, '127.0.0.1', () => console.log('esplora mock on 3002'));

/** The same chain in Blockbook's API v2: amounts as strings of sats, confirmations instead of a status. */
function blockbook(req, url, query, send) {
  const conf = t => (t.confirmed ? height - t.height + 1 : 0);
  const bbTx = (txid, t) => ({
    txid, fees: String(t.fee), confirmations: conf(t), blockHeight: t.confirmed ? t.height : -1, blockTime: t.time ?? Math.floor(Date.now() / 1000),
    vin: t.vin.map(i => ({ addresses: [i.prevout.address], value: String(i.prevout.value) })),
    vout: t.vout.map(o => ({ addresses: [o.address], value: String(o.value) })),
  });
  if (req.method === 'POST' && url === '/api/v2/sendtx/') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try { send(200, { result: accept(body.trim()) }); } catch (e) { send(400, { error: String(e.message) }); }
    });
    return;
  }
  if (url === '/api/v2/estimatefee/3') return send(200, { result: '0.00002' });
  let m;
  if ((m = url.match(/^\/api\/v2\/tx\/([0-9a-f]{64})$/))) {
    const t = txs.get(m[1]);
    return t ? send(200, bbTx(m[1], t)) : send(400, { error: 'txid not found' });
  }
  if ((m = url.match(/^\/api\/v2\/utxo\/([a-z0-9]+)$/))) {
    const out = [];
    for (const [k, u] of utxos) if (u.address === m[1]) {
      const [txid, vout] = k.split(':');
      out.push({ txid, vout: Number(vout), value: String(u.value), confirmations: conf(txs.get(txid)) });
    }
    return send(200, out);
  }
  if ((m = url.match(/^\/api\/v2\/address\/([a-z0-9]+)$/))) {
    const s = stats(m[1]);
    const mine = [...txs.entries()].filter(([, t]) => t.vout.some(o => o.address === m[1]) || t.vin.some(i => i.prevout.address === m[1])).reverse();
    if (query.get('details') === 'txs') return send(200, { address: m[1], transactions: mine.map(([id, t]) => bbTx(id, t)) });
    return send(200, {
      address: m[1],
      balance: String(s.chain_stats.funded_txo_sum - s.chain_stats.spent_txo_sum),
      unconfirmedBalance: String(s.mempool_stats.funded_txo_sum - s.mempool_stats.spent_txo_sum),
      txs: s.chain_stats.tx_count, unconfirmedTxs: s.mempool_stats.tx_count,
    });
  }
  send(400, { error: 'unknown' });
}
