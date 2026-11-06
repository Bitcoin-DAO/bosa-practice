// Payout rounds (protocol 6.1-6.3): prepare (council), check and sign, broadcast, receipt.
import { useEffect, useState } from 'preact/hooks';
import { mnemonicToSeedSync } from '@scure/bip39';
import { broadcastRound, refreshTreasury, signAndPublish, useApp } from '../app';
import { fmtSats, t } from '../i18n';
import { KIND } from '../core/events';
import { usable } from '../core/config';
import { feeRate as suggestedFeeRate, txStatus } from '../core/chain';
import { parseDescriptor } from '../core/descriptor';
import { buildRound, finalizeRound, masterFromSeed, memberSignatures, signWithMnemonicKey, type BuiltRound } from '../core/round';
import { cadenceOf, roundLabel } from '../core/time';
import { proposalLabel, type Output, type RoundView } from '../core/state';
import { Address, Footer, Header, errText, go } from './parts';
import { useNameOf } from './Proposals';

const explorerOf = (api: string) => api.replace(/\/api\/?$/, '');

export function PrepareRound() {
  const app = useApp();
  const s = app.dao!;
  const cfg = s.founded!.config;
  const settings = s.settings[s.settings.length - 1].content;
  const max = settings.rules.maxFeeRateSatVb;
  const apis = usable(cfg.chainApi);
  const [suggested, setSuggested] = useState<number>();
  const [rate, setRate] = useState('');
  const [built, setBuilt] = useState<BuiltRound>();
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);

  // A round is built only from a live reading of the treasury's coins, never from the remembered one.
  const [opened] = useState(() => Date.now());
  useEffect(() => {
    void refreshTreasury();
    suggestedFeeRate(apis).then(r => {
      setSuggested(r);
      setRate(String(Math.min(r, max)));
    }).catch(() => setRate('1'));
  }, []);

  if (!app.isCouncil || !app.secret) return <><Header /><main><p class="lead">{t('cn.notCouncil')}</p></main><Footer /></>;

  const waiting = s.proposals.filter(p => s.payments.get(p.event.id)?.status === 'waiting');
  const close = waiting.find(p => p.content.type === 'close');
  const list = close ? [close] : waiting.filter(p => p.content.type === 'payout');
  const outputs: Output[] = close ? [] : list.flatMap(p => p.content.payload.outputs as Output[]);
  const open = s.rounds.find(r => r.status === 'open');
  const r = Number(rate);
  const rateOk = Number.isFinite(r) && r >= 1 && r <= max;
  const aboveCap = suggested !== undefined && suggested > max;
  const live = !!app.treasury && !app.treasuryLoading && (app.treasuryAt ?? 0) >= opened;

  const build = () => {
    setMsg(undefined);
    setBuilt(undefined);
    try {
      const tr = app.treasury!;
      setBuilt(buildRound({
        d: parseDescriptor(settings.descriptor, cfg.network), network: cfg.network, utxos: tr.utxos, outputs, feeRate: r,
        changeIndex: Math.max(0, tr.changeIndex), sweepTo: close?.content.payload.destination,
      }));
    } catch (e) {
      setMsg((e as Error).message === 'insufficient' ? t('rd.insufficient') : errText(e));
    }
  };

  const publish = async () => {
    if (!built) return;
    setMsg(undefined);
    setBusy(true);
    try {
      const { event } = await signAndPublish(KIND.round, {
        round: roundLabel(s.now, settings.rules.timezone, cadenceOf(settings.rules.payoutRound)), proposals: list.map(p => p.event.id), psbt: built.psbt, fee_rate_sat_vb: r, fee_sat: built.fee,
      });
      const tk = app.identity?.treasury;
      if (tk) await signAndPublish(KIND.sign, { psbt: signWithMnemonicKey(built.psbt, masterFromSeed(mnemonicToSeedSync(tk.mnemonic), cfg.network)) }, [['e', event.id]]);
      go(`/round/${event.id}`);
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header />
      <main>
        <h1>{t('rd.prepare')}</h1>
        <p class="lead">{t('rd.prepareText')}</p>
        {open && <a class="note" href={`#/round/${open.event.id}`}>{t('rd.openExists')} {t('cn.open')}</a>}
        {!list.length ? <p class="small">{t('rd.none')}</p> : (
          <>
            <div class="card">
              <h3>{t('rd.payouts')}</h3>
              {list.map(p => (
                <div class="kv">
                  <a href={`#/p/${p.event.id}`}>{proposalLabel(app.site!.name, p.number)} · {p.content.title}</a>
                  <span class="mono">{p.content.type === 'close' ? '—' : fmtSats((p.content.payload.outputs as Output[]).reduce((a, o) => a + o.amount_sat, 0))}</span>
                </div>
              ))}
            </div>
            <label class="field">
              {t('rd.feeRate', { max })}
              <input type="text" inputMode="numeric" value={rate} onInput={e => (setRate((e.target as HTMLInputElement).value.replace(/[^\d.]/g, '')), setBuilt(undefined))} />
              {suggested !== undefined && <span class="small" style="font-weight:400">{t('rd.feeSuggested', { rate: suggested })}</span>}
            </label>
            {aboveCap && <p class="warnbox">{t('rd.feeAboveCap', { max })}</p>}
            <button type="button" class="btn secondary" disabled={!rateOk || !live || aboveCap} onClick={build}>{t('rd.build')}</button>
            {!live && (app.treasuryLoading || !app.treasuryError) && <p class="small">{t('rd.readingCoins')}</p>}
            {!live && !app.treasuryLoading && app.treasuryError && (
              <p class="small">{t('rd.coinsError', { msg: app.treasuryError })} <button type="button" class="btn link" onClick={() => refreshTreasury()}>{t('retry')}</button></p>
            )}
          </>
        )}
        {built && (
          <div class="card">
            <h3>{t('rd.summary')}</h3>
            <div class="kv"><span>{t('rd.inputs')}</span><span class="mono">{built.inputs.length} · {fmtSats(built.inputs.reduce((a, u) => a + u.value, 0))}</span></div>
            <div class="kv"><span>{t('rd.total')}</span><span class="mono">{fmtSats(close ? built.inputs.reduce((a, u) => a + u.value, 0) - built.fee : outputs.reduce((a, o) => a + o.amount_sat, 0))}</span></div>
            {built.change && <div class="kv"><span>{t('rd.change')}</span><span class="mono">{fmtSats(built.change.value)}</span></div>}
            <div class="kv"><span>{t('rd.fee')}</span><span class="mono">{fmtSats(built.fee)} · {r} sat/vB</span></div>
            <button type="button" class="btn primary" disabled={busy} onClick={publish}>{t('rd.publish')}</button>
          </div>
        )}
        {msg && <p class="warnbox">{msg}</p>}
      </main>
      <Footer />
    </>
  );
}

export function RoundDetail({ id }: { id: string }) {
  const app = useApp();
  const s = app.dao!;
  const cfg = s.founded!.config;
  const nameOf = useNameOf();
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [ext, setExt] = useState(false);
  const [pasted, setPasted] = useState('');
  const [copied, setCopied] = useState(false);
  const [onChain, setOnChain] = useState<boolean>();
  const r = s.rounds.find(x => x.event.id === id);
  const apis = usable(cfg.chainApi);

  useEffect(() => {
    if (r?.inspection) txStatus(apis, r.inspection.txid).then(st => setOnChain(!!st));
  }, [r?.inspection?.txid, r?.ready, r?.receipt?.id]);

  if (!r) return <><Header /><main><p class="lead">{t('pd.notFound')}</p></main><Footer /></>;
  const ins = r.inspection;
  const settings = s.settingsAt(r.event.created_at).content;
  const myPerson = app.me?.person;
  const myEntry = myPerson ? settings.council.find(c => s.personOf(c.identityKey) === myPerson) : undefined;
  const iSigned = !!myPerson && r.signatures.has(myPerson);
  const signers = [...r.signatures.keys()];
  const tk = app.identity?.treasury;
  const run = async (f: () => Promise<unknown>) => {
    setMsg(undefined);
    setBusy(true);
    try {
      await f();
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const signTest = () => run(() => signAndPublish(KIND.sign, { psbt: signWithMnemonicKey(r.content.psbt, masterFromSeed(mnemonicToSeedSync(tk!.mnemonic), cfg.network)) }, [['e', r.event.id]]));
  const useExternal = () => run(async () => {
    const psbt = pasted.trim();
    const sigs = memberSignatures(psbt, parseDescriptor(settings.descriptor, cfg.network), cfg.network, myEntry!, ins!);
    if (!sigs.size) throw new Error(t('rd.badSigned'));
    await signAndPublish(KIND.sign, { psbt }, [['e', r.event.id]]);
    setExt(false);
  });
  const decline = () => {
    const reason = prompt(t('rd.declineReason'));
    if (reason) void run(() => signAndPublish(KIND.sign, { decline: reason }, [['e', r.event.id]]));
  };
  const [rawHex, setRawHex] = useState<string>();
  const doBroadcast = () => run(async () => {
    try {
      await broadcastRound(r);
      setOnChain(true);
    } catch (e) {
      // Offer the finished transaction so anyone can push it by hand.
      setRawHex(finalizeRound(r.signEvents.map(x => JSON.parse(x.content).psbt)).hex);
      throw e;
    }
  });
  const height = r.receipt ? (JSON.parse(r.receipt.content).block_height as number) : undefined;

  return (
    <>
      <Header />
      <main>
        <div class="row" style="justify-content:flex-start;gap:8px">
          <span class={r.status === 'paid' ? 'chip teal' : 'chip'}>{t(`rd.status.${r.status}` as 'rd.status.open')}</span>
        </div>
        <h1>{t('rd.title', { round: r.content.round })}</h1>
        {r.errors.length > 0 && <p class="warnbox">{t('rd.errors', { list: r.errors.join('; ') })}</p>}

        <section class="card">
          <h3>{t('rd.payouts')}</h3>
          {r.content.proposals.map(pid => {
            const p = s.proposals.find(x => x.event.id === pid);
            return <a href={`#/p/${pid}`}>{p ? `${proposalLabel(app.site!.name, p.number)} · ${p.content.title}` : pid.slice(0, 12)}</a>;
          })}
        </section>

        {ins && (
          <section class="card">
            <h3>{t('rd.outputs')}</h3>
            {r.status === 'open' && <p class="small">{t('rd.check')}</p>}
            {ins.outputs.map(o => (
              <div class="stack" style="gap:4px">
                {o.change !== undefined && <span class="chip teal" style="align-self:flex-start">{t('rd.change')}</span>}
                <Address value={o.address} />
                <span class="mono">{fmtSats(o.value)} sats</span>
              </div>
            ))}
            <hr class="divider" />
            <div class="kv"><span>{t('rd.inputs')}</span><span class="mono">{ins.inputs.length} · {fmtSats(ins.inputs.reduce((a, x) => a + x.value, 0))}</span></div>
            <div class="kv"><span>{t('rd.fee')}</span><span class="mono">{fmtSats(ins.fee)} · {r.content.fee_rate_sat_vb} sat/vB</span></div>
          </section>
        )}

        <section class="card">
          <h3>{t('rd.signatures', { n: signers.length, m: r.threshold })}</h3>
          {signers.length > 0 && <p class="small">{t('rd.signedBy', { names: signers.map(p => nameOf(p)).join(', ') })}</p>}
          {r.declines.map(d => <p class="small">{t('rd.declinedBy', { name: nameOf(d.person), reason: d.reason })}</p>)}
          {r.status === 'open' && app.isCouncil && app.secret && myEntry && (
            iSigned ? <p class="ok">{t('rd.signed')}</p> : (
              <>
                {tk ? <button type="button" class="btn primary" disabled={busy} onClick={signTest}>{t('rd.signTest')}</button> : <p class="small">{t('rd.noKey')}</p>}
                <button type="button" class="btn link" style="align-self:flex-start" onClick={() => setExt(!ext)}>{t('rd.external')}</button>
                {ext && (
                  <div class="stack">
                    <button type="button" class="btn secondary" onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(r.content.psbt);
                        setCopied(true);
                      } catch { /* ignore */ }
                    }}>{copied ? t('home.copied') : t('rd.copyPsbt')}</button>
                    <label class="field">{t('rd.pastePsbt')}<textarea value={pasted} onInput={e => setPasted((e.target as HTMLTextAreaElement).value)} /></label>
                    <button type="button" class="btn dark" disabled={!pasted.trim() || busy} onClick={useExternal}>{t('rd.useSigned')}</button>
                  </div>
                )}
                <button type="button" class="btn link" style="align-self:flex-start" onClick={decline}>{t('rd.decline')}</button>
              </>
            )
          )}
          {r.status === 'open' && r.ready && (
            <>
              <p class="ok">{t('rd.ready')}</p>
              {onChain ? <p class="small">{t('rd.broadcasted')}</p> : <button type="button" class="btn primary" disabled={busy} onClick={doBroadcast}>{t('rd.broadcast')}</button>}
              {rawHex && !onChain && (
                <div class="stack">
                  <p class="small">{t('rd.manual')}</p>
                  <button type="button" class="btn secondary" onClick={() => navigator.clipboard.writeText(rawHex).catch(() => undefined)}>{t('rd.copyTx')}</button>
                  <a href={`${explorerOf(apis[0] ?? '')}/tx/push`} target="_blank" rel="noopener">{explorerOf(apis[0] ?? '').replace(/^https:\/\//, '')}/tx/push ↗</a>
                </div>
              )}
            </>
          )}
          {msg && <p class="warnbox">{msg}</p>}
        </section>

        {ins && (onChain || r.receipt) && (
          <section class="card">
            <div class="kv"><span>{t('rd.txid')}</span><a class="mono" href={`${explorerOf(apis[0] ?? '')}/tx/${ins.txid}`} target="_blank" rel="noopener">{ins.txid.slice(0, 16)}…</a></div>
            {height ? <p class="ok">{t('rd.receipt', { h: height })}</p> : <p class="small">{t('rd.waitingConfirm')}</p>}
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}

/** Short line about a passed payout's payment, for the proposal page. */
export function PaymentLine({ id }: { id: string }) {
  const app = useApp();
  const s = app.dao!;
  const pay = s.payments.get(id);
  if (!pay) return null;
  const date = pay.lapseAt ? new Intl.DateTimeFormat(app.lang === 'en' ? 'en-GB' : 'it-IT', { day: 'numeric', month: 'long' }).format(new Date(pay.lapseAt * 1000)) : '';
  const round = pay.round?.content.round ?? '';
  const isClose = s.proposals.find(p => p.event.id === id)?.content.type === 'close';
  const text = pay.status === 'paid' && isClose ? t('pay.closeDone') : t(`pay.${pay.status}` as 'pay.waiting', { date, round });
  return pay.round ? <a class={pay.status === 'paid' ? 'ok' : 'small'} href={`#/round/${pay.round.event.id}`}>{text}</a> : <p class={pay.status === 'lapsed' ? 'warn' : 'small'}>{text}</p>;
}

export function openRound(s: { rounds: RoundView[] }) {
  return s.rounds.find(r => r.status === 'open');
}
