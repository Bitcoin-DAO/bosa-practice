import { useState } from 'preact/hooks';
import { restoreTreasuryKey, signAndPublish, signOut, useApp } from '../app';
import { KIND } from '../core/events';
import { fmtDate, t } from '../i18n';
import { validAddress } from '../core/state';
import { Address, Footer, Header, PrintCard, ShortCode, errText, go } from './parts';

export function Profile() {
  const app = useApp();
  const dao = app.site!.name;
  const [words, setWords] = useState(false);
  const [left, setLeft] = useState(false);
  const [payAddr, setPayAddr] = useState('');
  const [editing, setEditing] = useState(false);
  const [payMsg, setPayMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [tkWords, setTkWords] = useState('');
  const [tkMsg, setTkMsg] = useState<string>();
  const [tkDone, setTkDone] = useState(false);
  const enterWords = async () => {
    setTkMsg(undefined);
    setBusy(true);
    try {
      await restoreTreasuryKey(tkWords);
      setTkWords('');
      setTkDone(true);
    } catch (e) {
      setTkMsg(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const setStanding = async (address?: string) => {
    if (!address && !confirm(t('profile.payoutRemoveConfirm'))) return;
    setPayMsg(undefined);
    setBusy(true);
    try {
      await signAndPublish(KIND.confirm, address ? { address, standing: true } : { standing: false });
      setEditing(false);
      setPayAddr('');
    } catch (e) {
      setPayMsg(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const leave = async () => {
    if (!confirm(t('profile.leaveConfirm', { dao }))) return;
    await signAndPublish(KIND.leave, {});
    setLeft(true);
  };
  const me = app.me;
  if (!me) {
    return (
      <>
        <Header />
        <main>
          <h1>{t('profile.title')}</h1>
          <p class="lead">{t('profile.notMember', { dao })}</p>
          <button type="button" class="btn primary" onClick={() => go('/join')}>{t('nav.signin')}</button>
        </main>
      </>
    );
  }
  const tk = app.identity?.treasury;
  const s = app.dao;
  const network = app.site!.network;
  const standing = s?.standingAt(me.key, s.now);
  const pa = payAddr.trim();
  const payErr = pa && (!validAddress(pa, network) ? t('np.addressBad', { network }) : s?.isTreasuryAddress(pa) ? t('np.addressTreasury') : undefined);
  return (
    <>
      <Header />
      <main>
        <h1>{me.name}</h1>
        <div class="card">
          <div class="kv"><span>{me.council ? t('profile.council') : t('profile.member')}</span><span>{me.verified === 'remote' ? t('profile.remote') : t('profile.inPerson')}</span></div>
          <span class="small">{t('profile.since', { date: fmtDate(me.since) })}</span>
          <span class="small">{t('profile.code')}</span>
          <ShortCode pubkey={me.key} />
        </div>
        {app.secret ? <PrintCard council={me.council} /> : <p class="note">{t('profile.locked')}</p>}
        {me.council && !tk && network !== 'mainnet' && (
          <div class="card" id="treasury-key">
            <h3>{t('profile.treasuryKey')}</h3>
            <p class="warn">{t('tk.missing')}</p>
            <label class="field">{t('tk.enter')}<textarea class="mono" autoComplete="off" spellcheck={false} autoCapitalize="none" value={tkWords} onInput={e => setTkWords((e.target as HTMLTextAreaElement).value)} /></label>
            <button type="button" class="btn primary" disabled={busy || tkWords.trim().split(/\s+/).length !== 12} onClick={enterWords}>{t('tk.save')}</button>
            {tkMsg && <p class="warnbox">{tkMsg}</p>}
          </div>
        )}
        {me.council && tk && (
          <div class="card">
            <h3>{t('profile.treasuryKey')}</h3>
            {tkDone && <p class="ok">{t('tk.done')}</p>}
            <p class="small">{t('profile.treasuryKeyText', { fp: tk.fingerprint })}</p>
            <button type="button" class="btn link" style="align-self:flex-start" onClick={() => setWords(!words)}>{words ? t('profile.hideWords') : t('profile.showWords')}</button>
            {words && <p class="mono" style="font-size:15px;line-height:1.8">{tk.mnemonic}</p>}
          </div>
        )}
        {app.secret && s && (
          <div class="card">
            <h3>{t('profile.payout')}</h3>
            <p class="small">{t('profile.payoutText')}</p>
            {standing ? <Address value={standing.address} /> : <p class="small">{t('profile.payoutNone')}</p>}
            {(editing || !standing) && (
              <>
                <label class="field">{t('profile.payoutNew')}<input type="text" class="mono" autoComplete="off" spellcheck={false} value={payAddr} onInput={e => setPayAddr((e.target as HTMLInputElement).value)} /></label>
                {payErr && <p class="error">{payErr}</p>}
                <button type="button" class="btn primary" disabled={!pa || !!payErr || busy || pa === standing?.address} onClick={() => setStanding(pa)}>{t('profile.payoutSave')}</button>
              </>
            )}
            {standing && !editing && (
              <div class="row" style="justify-content:flex-start;gap:8px">
                <button type="button" class="btn secondary" onClick={() => setEditing(true)}>{t('profile.payoutReplace')}</button>
                <button type="button" class="btn link" disabled={busy} onClick={() => setStanding()}>{t('profile.payoutRemove')}</button>
              </div>
            )}
            <p class="note">{t('profile.payoutPrivacy')}</p>
            {payMsg && <p class="warnbox">{payMsg}</p>}
          </div>
        )}
        {app.secret && (
          <button type="button" class="btn secondary" onClick={() => go('/sponsor')}>{t('profile.sponsor')}</button>
        )}
        {app.secret && !me.council && (
          <div class="card">
            <h3>{t('profile.leave')}</h3>
            <p class="small">{t('profile.leaveText')}</p>
            {left ? <p class="ok">{t('profile.left', { dao })}</p> : (
              <button type="button" class="btn secondary" onClick={leave}>{t('profile.leave')}</button>
            )}
          </div>
        )}
        {me.council && <p class="small">{t('profile.councilLeave')}</p>}
        {app.secret && !app.identity?.plain && (
          <button type="button" class="btn secondary" onClick={() => (signOut(), go('/'))}>{t('profile.signout')}</button>
        )}
      </main>
      <Footer />
    </>
  );
}
