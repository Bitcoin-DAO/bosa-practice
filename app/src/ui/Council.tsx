// Council inbox: counts, member list and rules versions, key replacements, checking candidates.
import { useState } from 'preact/hooks';
import { signAndPublish, useApp } from '../app';
import { t } from '../i18n';
import { KIND, type Event } from '../core/events';
import { parseFounderCode, type FounderCode } from '../core/identity';
import { formatShortCode, shortCode } from '../core/shortcode';
import { nextRoster, nextSettings, type Candidate, type DaoState, type Verified } from '../core/state';
import { hashJson, parseJson } from '../core/util';
import { Footer, Header, ScanModal, ShortCode, errText } from './parts';
import { useNameOf } from './Proposals';

/** How many things wait for this council member. */
export function councilTodo(s: DaoState, myPerson: string): number {
  let n = 0;
  const open = <T,>(cands: Candidate<T>[], pending: string[]) => {
    const valid = cands.filter(c => !c.error && c.effectiveAt === undefined);
    if (valid.some(c => !c.endorsers.includes(myPerson))) return 1;
    return !valid.length && pending.length ? 1 : 0;
  };
  n += open(s.rosterCandidates, s.pendingRoster);
  n += open(s.settingsCandidates, s.pendingSettings);
  n += s.rekeys.filter(r => r.effectiveAt === undefined && !r.endorsers.includes(myPerson)).length;
  const openR = s.rounds.find(r => r.status === 'open');
  if (openR ? !openR.signatures.has(myPerson) || openR.ready : [...s.payments.values()].some(p => p.status === 'waiting')) n++;
  return n;
}

export function Council() {
  const app = useApp();
  const s = app.dao!;
  const nameOf = useNameOf();
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState<'verify' | 'replace'>();
  const [code, setCode] = useState<{ c: FounderCode; purpose: 'verify' | 'replace' }>();
  const [mode, setMode] = useState<Verified>('in_person');
  const [oldKey, setOldKey] = useState('');
  const [done, setDone] = useState<string>();

  if (!app.isCouncil || !app.secret || !app.me) {
    return (
      <>
        <Header />
        <main><p class="lead">{t('cn.notCouncil')}</p></main>
        <Footer />
      </>
    );
  }
  const me = app.me.person;
  const m = s.settings[s.settings.length - 1].content.threshold;

  const run = async (f: () => Promise<unknown>, after?: string) => {
    setMsg(undefined);
    setBusy(true);
    try {
      await f();
      if (after) setDone(after);
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const endorse = (e: Event, object: string) =>
    signAndPublish(KIND.endorse, { object, hash: hashJson(parseJson(e.content)), version: parseJson<any>(e.content)?.version }, [['e', e.id]]);
  const publishVersion = async (kind: number, content: unknown, object: string) => {
    const { event } = await signAndPublish(kind, content);
    await endorse(event, object);
  };

  const awaiting = s.proposals.filter(p => p.status === 'awaiting_tally').length;
  const openR = s.rounds.find(r => r.status === 'open');
  const waitingPay = [...s.payments.values()].filter(p => p.status === 'waiting').length;
  const lastRoster = s.rosters[s.rosters.length - 1].content.version;
  const lastSettings = s.settings[s.settings.length - 1].content.version;

  const versionBlock = <T,>(title: string, text: string, cands: Candidate<T>[], pending: string[], v: number, publishLabel: string, endorseLabel: string, build: () => unknown, kind: number, object: string) => {
    const valid = cands.filter(c => !c.error && c.effectiveAt === undefined);
    const invalid = cands.filter(c => c.error);
    if (!valid.length && !pending.length && !invalid.length) return null;
    return (
      <section class="card">
        <h3>{title}</h3>
        {pending.length > 0 && <p class="small">{text}</p>}
        {valid.map(c => (
          <div class="stack" style="gap:6px">
            <span class="small">{t('cn.approvals', { n: c.endorsers.length, m })}</span>
            {c.endorsers.includes(me) ? <span class="ok">{t('cn.youApproved')}</span> : (
              <button type="button" class="btn primary" disabled={busy} onClick={() => run(() => endorse(c.event, object))}>{endorseLabel}</button>
            )}
          </div>
        ))}
        {!valid.length && pending.length > 0 && (
          <button type="button" class="btn primary" disabled={busy} onClick={() => run(() => publishVersion(kind, build(), object))}>{publishLabel}</button>
        )}
        {invalid.map(c => <p class="small error">{t('cn.candError', { v, err: c.error! })}</p>)}
      </section>
    );
  };

  const onScanned = (c: FounderCode) => {
    setScan(undefined);
    setCode({ c, purpose: scan! });
    setMode('in_person');
    setOldKey('');
    setDone(undefined);
  };

  return (
    <>
      <Header />
      <main>
        <h1>{t('cn.title')}</h1>
        {app.identity && !app.identity.treasury && app.site!.network !== 'mainnet' && (
          <p class="warnbox">{t('tk.missing')} <a href="#/profile">{t('tk.link')}</a></p>
        )}
        {s.rosterDisputed && <p class="warnbox">{t('cn.disputed')}</p>}

        {(waitingPay > 0 || openR) && (
          <section class="card">
            <h3>{t('cn.round')}</h3>
            {openR ? (
              <>
                <p class="small">{openR.ready ? t('cn.roundReady', { round: openR.content.round }) : openR.signatures.has(me) ? t('rd.signatures', { n: openR.signatures.size, m: openR.threshold }) : t('cn.roundSign', { round: openR.content.round })}</p>
                <a class="btn primary" style="display:flex;align-items:center;justify-content:center;text-decoration:none" href={`#/round/${openR.event.id}`}>{t('cn.open')}</a>
              </>
            ) : (
              <>
                <p class="small">{t('cn.roundPrepare', { n: waitingPay })}</p>
                <a class="btn primary" style="display:flex;align-items:center;justify-content:center;text-decoration:none" href="#/round/new">{t('rd.prepare')}</a>
              </>
            )}
          </section>
        )}

        <section class="card">
          <h3>{t('cn.tallies')}</h3>
          <p class="small">{t('cn.talliesText')}</p>
          {awaiting > 0 && <p class="small">{t('cn.talliesWaiting', { n: awaiting })}</p>}
        </section>

        {versionBlock(t('cn.roster'), t('cn.rosterText', { n: s.pendingRoster.length, v: lastRoster }), s.rosterCandidates, s.pendingRoster, lastRoster + 1,
          t('cn.rosterPublish', { v: lastRoster + 1 }), t('cn.rosterEndorse', { v: lastRoster + 1 }), () => nextRoster(s), KIND.roster, 'roster')}
        {versionBlock(t('cn.settings'), t('cn.settingsText', { n: s.pendingSettings.length, v: lastSettings }), s.settingsCandidates, s.pendingSettings, lastSettings + 1,
          t('cn.settingsPublish', { v: lastSettings + 1 }), t('cn.settingsEndorse', { v: lastSettings + 1 }), () => nextSettings(s), KIND.settings, 'settings')}

        {s.rekeys.some(r => r.effectiveAt === undefined) && (
          <section class="card">
            <h3>{t('cn.rekeys')}</h3>
            {s.rekeys.filter(r => r.effectiveAt === undefined).map(r => (
              <div class="stack" style="gap:6px">
                <strong>{t('cn.rekeyItem', { name: nameOf(r.oldKey), code: formatShortCode(shortCode(r.newKey)) })}</strong>
                <span class="small">{t('cn.approvals', { n: r.endorsers.length, m })} · {r.mode === 'remote' ? t('cn.remote') : t('cn.inPerson')}</span>
                {r.needsSecondVerify && <span class="small">{t('cn.rekeyNeedsVerify')}</span>}
                {r.endorsers.includes(me) ? <span class="ok">{t('cn.youApproved')}</span> : (
                  <button type="button" class="btn primary" disabled={busy} onClick={() => run(() => endorse(r.event, 'rekey'))}>{t('cn.approve')}</button>
                )}
              </div>
            ))}
          </section>
        )}

        {councilTodo(s, me) === 0 && awaiting === 0 && <p class="small">{t('cn.nothing')}</p>}

        <section class="card">
          <h3>{t('cn.verify')}</h3>
          <p class="small">{t('cn.verifyText')}</p>
          <button type="button" class="btn secondary" onClick={() => setScan('verify')}>{t('cn.verify')}</button>
        </section>
        <section class="card">
          <h3>{t('cn.replace')}</h3>
          <p class="small">{t('cn.replaceText')}</p>
          <button type="button" class="btn secondary" onClick={() => setScan('replace')}>{t('cn.replace')}</button>
        </section>
        {msg && <p class="warnbox">{msg}</p>}
      </main>

      {scan && <ScanModal parse={parseFounderCode} onResult={onScanned} onCancel={() => setScan(undefined)} title={scan === 'verify' ? t('cn.verify') : t('cn.replace')} />}
      {code && (
        <div class="scanner" role="dialog" aria-modal="true">
          <h2>{t('scan.confirmTitle')}</h2>
          <p>{t('scan.confirmText', { name: code.c.name })}</p>
          <div class="card" style="color:var(--ink)"><strong>{code.c.name}</strong><ShortCode pubkey={code.c.key} /></div>
          {done ? (
            <>
              <p class="note">{done}</p>
              <button type="button" class="btn primary" onClick={() => setCode(undefined)}>OK</button>
            </>
          ) : (
            <>
              <fieldset class="stack" style="border:0;padding:0;margin:0;gap:8px">
                <legend style="margin-bottom:8px">{t('cn.mode')}</legend>
                <label class="check"><input type="radio" name="mode" checked={mode === 'in_person'} onChange={() => setMode('in_person')} />{t('cn.inPerson')}</label>
                <label class="check"><input type="radio" name="mode" checked={mode === 'remote'} onChange={() => setMode('remote')} />{t('cn.remote')}</label>
              </fieldset>
              {code.purpose === 'replace' && (
                <label class="field">
                  {t('cn.whichMember')}
                  <select value={oldKey} onChange={e => setOldKey((e.target as HTMLSelectElement).value)} style="min-height:48px;border-radius:8px;padding:0 12px;font:inherit;font-size:16px">
                    <option value="">—</option>
                    {s.members.map(x => <option value={x.key}>{x.name}</option>)}
                  </select>
                </label>
              )}
              {code.purpose === 'verify' ? (
                <button type="button" class="btn primary" disabled={busy} onClick={() => run(
                  () => signAndPublish(KIND.verify, { candidate_key: code.c.key, mode, short_code: shortCode(code.c.key) }, [['p', code.c.key]]),
                  t('cn.verifyDone', { name: code.c.name }),
                )}>{t('cn.sign')}</button>
              ) : (
                <button type="button" class="btn primary" disabled={busy || !oldKey} onClick={() => run(async () => {
                  const { event } = await signAndPublish(KIND.rekey, { old_key: oldKey, new_key: code.c.key, mode, short_code: shortCode(code.c.key) }, [['p', oldKey], ['p', code.c.key]]);
                  await endorse(event, 'rekey');
                }, t('cn.replaceDone', { m }))}>{t('cn.replaceSign')}</button>
              )}
              <button type="button" class="btn secondary" onClick={() => setCode(undefined)}>{t('scan.noMatch')}</button>
            </>
          )}
          {msg && <p class="warnbox">{msg}</p>}
        </div>
      )}
      <Footer />
    </>
  );
}
