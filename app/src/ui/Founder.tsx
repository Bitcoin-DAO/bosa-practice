// Founder sign-up (protocol 3.5): name, key and passkey, show the code, wait, approve (council), protect.
import { useEffect, useState } from 'preact/hooks';
import { completeFounding, passkeyName, publishSigned, setState, sync, useApp } from '../app';
import { t } from '../i18n';
import { newSecret, newTestTreasuryKey, pubkeyOf, type FounderCode } from '../core/identity';
import { KIND, sign, template } from '../core/events';
import type { GenesisCandidate } from '../core/state';
import { shortCode, formatShortCode } from '../core/shortcode';
import { createPasskey, passkeysAvailable } from '../lib/passkey';
import { store, type PendingFounder } from '../lib/store';
import { Header, PrintCard, Qr, ShortCode, Steps, errText, go } from './parts';
import { Candidate } from './Candidate';

export function Founder() {
  const app = useApp();
  const site = app.site!;
  const pending = app.pending;
  const [codeDone, setCodeDone] = useState(false);

  if (pending?.role && pending.role !== 'founder') return <Candidate role={pending.role} />;
  // Founded: a founder still holding a pending sign-up protects the key; everyone else sees the result.
  if (app.daoId && !pending) return <FoundedDone />;
  if (!pending) return <SignUp />;

  const listedIn = (g: GenesisCandidate) =>
    g.config.council.some(c => c.identityKey === pending.pubkey) || g.config.founders.some(f => f.identityKey === pending.pubkey);
  const myGenesis = app.dao?.pending.find(listedIn);
  if (app.daoId || codeDone || myGenesis) return <Wait pending={pending} />;

  const code: FounderCode = {
    t: 'btcdao-founder',
    v: 1,
    name: pending.name,
    key: pending.pubkey,
    ...(pending.council && pending.treasury ? { council: { fingerprint: pending.treasury.fingerprint, xpub: pending.treasury.xpub } } : {}),
  };
  const text = JSON.stringify(code);
  return (
    <>
      <Header sub={t('fs.title')} />
      <main>
        <Steps n={3} />
        <h1>{t('fs.codeTitle')}</h1>
        <p class="lead">{t('fs.codeIntro')}</p>
        <div class="card" style="align-items:center">
          <Qr text={text} size={280} label={pending.name} />
          <ShortCode pubkey={pending.pubkey} />
          <span class="small">{t('fs.shortCodeLabel')}</span>
        </div>
        <p class="small">{t('fs.remote')}</p>
        <ShareButton text={t('fs.shareText', { dao: site.name, role: t(pending.council ? 'fs.roleCouncil' : 'fs.roleFounder'), name: pending.name, short: formatShortCode(shortCode(pending.pubkey)), code: text })} />
        <CopyButton text={text} label={t('fs.copyCode')} />
        {!pending.prfSupported && <p class="warnbox">{t('fs.noPrf')}</p>}
        <button type="button" class="btn primary" onClick={() => setCodeDone(true)}>{t('fs.done')}</button>
        <button type="button" class="btn link" onClick={() => void restartSignup(site.site)}>{t('fs.restart')}</button>
        {pending.council && <button type="button" class="btn secondary" onClick={() => go('/setup')}>{t('fs.goSetup')}</button>}
      </main>
    </>
  );
}

/** Throws away this phone's sign-up, and the setup draft, which belongs to the identity being thrown away. */
async function restartSignup(site: string) {
  if (!confirm(t('fs.restartConfirm'))) return;
  await store.clearPending(site);
  await store.clearSetup(site);
  setState({ pending: undefined });
}

/** Opens the phone's share sheet with one message: who, the short code and the full code. Copies it where sharing is not available. */
function ShareButton({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      class="btn secondary"
      onClick={async () => {
        try {
          if (navigator.share) await navigator.share({ text });
          else await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 2000);
        } catch {
          /* cancelled or not allowed */
        }
      }}
    >
      {ok ? t('fs.shared') : t('fs.share')}
    </button>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      class="btn secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 2000);
        } catch {
          /* ignore */
        }
      }}
    >
      {ok ? t('home.copied') : label}
    </button>
  );
}

function SignUp() {
  const app = useApp();
  const site = app.site!;
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [council, setCouncil] = useState(false);
  const [adult, setAdult] = useState(false);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const dao = site.name;

  const create = async () => {
    setErr(undefined);
    setBusy(true);
    try {
      const secret = newSecret();
      let credId: string | undefined;
      let prfSupported = false;
      if (passkeysAvailable()) {
        const c = await createPasskey({ passkeyDomain: site.passkeyDomain, rpName: dao, userName: passkeyName(name.trim()) });
        credId = c.credId;
        prfSupported = c.prfSupported;
      }
      const p: PendingFounder = {
        site: site.site,
        name: name.trim(),
        secret,
        pubkey: pubkeyOf(secret),
        credId,
        prfSupported,
        council,
        treasury: council ? newTestTreasuryKey(site.network) : undefined,
        createdAt: Math.floor(Date.now() / 1000),
      };
      await store.setPending(p);
      setState({ pending: p });
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header sub={t('fs.title')} />
      <main>
        <Steps n={step} />
        {step === 1 ? (
          <>
            <div class="note"><strong>{t('fs.mode')}</strong> {t('fs.modeText', { dao })}</div>
            <h1>{t('fs.title')}</h1>
            <p class="lead">{t('fs.intro')}</p>
            <label class="field">
              {t('fs.name')}
              <input type="text" value={name} maxLength={40} autoComplete="off" placeholder="@elena" onInput={e => setName((e.target as HTMLInputElement).value)} />
              <span class="small" style="font-weight:400">{t('fs.nameHint')}</span>
            </label>
            <label class="check"><input type="checkbox" checked={council} onChange={e => setCouncil((e.target as HTMLInputElement).checked)} />{t('fs.council')}</label>
            <label class="check"><input type="checkbox" checked={adult} onChange={e => setAdult((e.target as HTMLInputElement).checked)} />{t('fs.age', { age: site.rules.minimumAge })}</label>
            <button type="button" class="btn primary" disabled={!name.trim() || !adult} onClick={() => setStep(2)}>{t('fs.next')}</button>
          </>
        ) : (
          <>
            <h1>{t('fs.keyTitle')}</h1>
            <p class="lead">{t('fs.keyIntro')}</p>
            <div class="warnbox"><strong>{t('fs.keyWarnTitle')}</strong> {t('fs.keyWarn', { dao })}</div>
            {council && (
              <div class="card">
                <h3>{t('fs.councilKey')}</h3>
                <p class="small">{t('fs.councilKeyText')}</p>
              </div>
            )}
            {!passkeysAvailable() && <p class="warnbox">{t('error.noPasskeys')}</p>}
            <button type="button" class="btn primary" disabled={busy} onClick={create}>{t('fs.create')}</button>
            {err && <p class="warnbox">{err}</p>}
            <button type="button" class="btn link" onClick={() => setStep(1)}>{t('back')}</button>
          </>
        )}
      </main>
    </>
  );
}

function Wait({ pending }: { pending: PendingFounder }) {
  const app = useApp();
  const site = app.site!;
  const dao = site.name;
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = setInterval(() => void sync(), 8000);
    return () => clearInterval(id);
  }, []);

  const listedIn = (g: GenesisCandidate) =>
    g.config.council.some(c => c.identityKey === pending.pubkey) || g.config.founders.some(f => f.identityKey === pending.pubkey);
  const genesis = app.dao?.founded ?? app.dao?.pending.find(listedIn) ?? app.dao?.pending[0];
  const listed = genesis ? listedIn(genesis) : false;
  const amCouncil = genesis?.config.council.some(c => c.identityKey === pending.pubkey);
  const iEndorsed = genesis?.endorsers.some(e => e.key === pending.pubkey);
  const founded = !!app.daoId && app.dao?.founded === genesis;
  const m = genesis?.config.threshold ?? site.threshold;

  const endorse = async () => {
    if (!genesis) return;
    setErr(undefined);
    setBusy(true);
    try {
      const ev = sign(template(KIND.endorse, genesis.daoId, { object: 'genesis', hash: genesis.daoId }, [['e', genesis.event.id]]), pending.secret);
      await publishSigned(ev);
      await sync();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const protect = async () => {
    setErr(undefined);
    setBusy(true);
    try {
      await completeFounding();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const restart = () => restartSignup(site.site);

  return (
    <>
      <Header sub={t('fs.title')} />
      <main>
        <Steps n={4} />
        {founded && listed ? (
          <>
            <h1>{t('fs.foundedTitle', { dao })}</h1>
            <p class="lead">{t('fs.protectText')}</p>
            <button type="button" class="btn primary" disabled={busy} onClick={protect}>{t('fs.protect')}</button>
          </>
        ) : (
          <>
            <h1>{t('fs.waitTitle')}</h1>
            <p class="lead">{t('fs.waitIntro', { dao, m })}</p>
            <div class="card">
              <h3>{t('fs.progress')}</h3>
              <div class="kv"><span>{t('fs.yourCode')}</span><span class="mono"><ShortCodeInline pubkey={pending.pubkey} /></span></div>
              <div class="kv"><span>{t('fs.genesis')}</span><span>{genesis ? t('fs.published') : t('fs.notYet')}</span></div>
              {genesis && <div class="kv"><span>{t('fs.name')}</span><span>{listed ? t('fs.listed') : t('fs.notListed')}</span></div>}
              {genesis && <div class="kv"><span>{t('fs.endorsements')}</span><span>{t('setup.of', { m: genesis.endorsers.length, n: m })}</span></div>}
            </div>
            {genesis && amCouncil && listed && (
              <div class="card">
                <h3>{t('fs.endorseTitle')}</h3>
                <p class="small">{t('fs.endorseText')}</p>
                <GenesisSummary g={genesis} />
                {iEndorsed ? <p class="ok">{t('fs.endorsed')}</p> : <button type="button" class="btn primary" disabled={busy} onClick={endorse}>{t('fs.endorse')}</button>}
              </div>
            )}
            <p class="small">{t('fs.autoRefresh')}</p>
            {pending.council && <button type="button" class="btn secondary" onClick={() => go('/setup')}>{t('fs.goSetup')}</button>}
          </>
        )}
        {err && <p class="warnbox">{err}</p>}
        {(!genesis || !listed) && <button type="button" class="btn link" onClick={restart}>{t('fs.restart')}</button>}
      </main>
    </>
  );
}

const ShortCodeInline = ({ pubkey }: { pubkey: string }) => <>{formatShortCode(shortCode(pubkey))}</>;

export function GenesisSummary({ g }: { g: GenesisCandidate }) {
  const c = g.config;
  return (
    <div class="stack" style="gap:8px">
      <div class="kv"><span>{t('setup.sumDao')}</span><span>{c.name} · {c.network}</span></div>
      <div class="kv"><span>{t('setup.sumCouncil')}</span><span>{t('setup.sumCouncilVal', { n: c.council.length, m: c.threshold })}</span></div>
      <div class="list">
        {c.council.map(x => (
          <div class="row"><span>{x.label} <span class="chip teal">{t('members.council')}</span></span><span class="mono">{formatShortCode(shortCode(x.identityKey))}</span></div>
        ))}
        {c.founders.map(f => (
          <div class="row"><span>{f.name} <span class="chip">{f.verified === 'remote' ? t('members.remote') : t('members.inPerson')}</span></span><span class="mono">{formatShortCode(shortCode(f.identityKey))}</span></div>
        ))}
      </div>
      <div class="kv"><span>{t('setup.sumId')}</span><span class="mono">{g.daoId.slice(0, 8)} …</span></div>
    </div>
  );
}

function FoundedDone() {
  const app = useApp();
  const dao = app.site!.name;
  return (
    <>
      <Header sub={t('fs.title')} />
      <main>
        <h1>{t('fs.foundedTitle', { dao })}</h1>
        {app.me ? (
          <>
            <p class="lead">{t('fs.foundedText')}</p>
            <PrintCard council={app.me.council} />
            <button type="button" class="btn secondary" onClick={() => go('/')}>{t('nav.home')} →</button>
          </>
        ) : (
          <button type="button" class="btn secondary" onClick={() => go('/join')}>{t('nav.signin')} →</button>
        )}
      </main>
    </>
  );
}
