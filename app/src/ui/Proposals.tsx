// Proposals: list, detail with voting, confirmation status, final count and record (protocol 4).
import { useState } from 'preact/hooks';
import { signAndPublish, useApp } from '../app';
import { fmtDate, fmtDateTime, fmtLeft, fmtSats, t } from '../i18n';
import { KIND, tagValue, type Event } from '../core/events';
import { proposalLabel, type Choice, type Output, type ProposalView } from '../core/state';
import { formatShortCode, shortCode } from '../core/shortcode';
import { parseJson } from '../core/util';
import { Address, Footer, Header, errText, go } from './parts';
import { PaymentLine } from './Round';

export const typeLabel = (type: string) => t(`type.${type}` as 'type.payout');

export function statusText(p: ProposalView, now: number) {
  return p.status === 'open' ? t('status.open', { left: fmtLeft(p.closeAt - now) }) : t(`status.${p.status}` as 'status.passed');
}

/** Name for a key: the member's name, else the short code. */
export function useNameOf() {
  const app = useApp();
  return (key: string) => {
    const s = app.dao!;
    const m = s.members.find(x => x.person === s.personOf(key));
    if (m) return m.name;
    for (const r of [...s.rosters].reverse()) {
      const e = r.content.members.find(x => s.personOf(x.key) === s.personOf(key));
      if (e) return e.name;
    }
    return formatShortCode(shortCode(key));
  };
}

export function ProposalCard({ p }: { p: ProposalView }) {
  const app = useApp();
  const total = p.counts.yes + p.counts.no + p.counts.abstain;
  const pct = (n: number) => (total ? (100 * n) / total : 0);
  return (
    <a class="card" style="text-decoration:none;color:inherit;gap:8px" href={`#/p/${p.event.id}`}>
      <div class="row" style="justify-content:flex-start;gap:8px">
        <span class="mono small">{proposalLabel(app.site!.name, p.number)}</span>
        <span class="chip">{typeLabel(p.content.type)}</span>
      </div>
      <strong style="font-size:17px;line-height:1.35">{p.content.title}</strong>
      <div aria-hidden="true" style="display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--line-2)">
        <span style={`width:${pct(p.counts.yes)}%;background:var(--teal)`} />
        <span style={`width:${pct(p.counts.no)}%;background:#E8A87C`} />
        <span style={`width:${pct(p.counts.abstain)}%;background:var(--line)`} />
      </div>
      <div class="row small">
        <span>{t('counts', p.counts)}</span>
        <span>{statusText(p, app.dao!.now)}</span>
      </div>
    </a>
  );
}

export function Proposals() {
  const app = useApp();
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const list = (app.dao?.proposals ?? []).filter(p => (tab === 'open' ? p.status === 'open' : p.status !== 'open')).reverse();
  return (
    <>
      <Header
        tabs={
          <nav class="tabs">
            <button type="button" class={tab === 'open' ? 'on' : ''} onClick={() => setTab('open')}>{t('props.open')}</button>
            <button type="button" class={tab === 'closed' ? 'on' : ''} onClick={() => setTab('closed')}>{t('props.closed')}</button>
          </nav>
        }
      />
      <main>
        <div class="row">
          <h1>{t('props.title')}</h1>
          {app.me && app.secret && <button type="button" class="btn dark" onClick={() => go('/new')}>{t('props.new')}</button>}
        </div>
        {list.length === 0 && <p class="small">{t('props.none')}</p>}
        {list.map(p => <ProposalCard p={p} />)}
      </main>
      <Footer />
    </>
  );
}

export function ProposalDetail({ id }: { id: string }) {
  const app = useApp();
  const s = app.dao!;
  const nameOf = useNameOf();
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const p = s.proposals.find(x => x.event.id === id);
  if (!p) {
    return (
      <>
        <Header />
        <main><p class="lead">{t('pd.notFound')}</p></main>
        <Footer />
      </>
    );
  }
  const c = p.content;
  const myPerson = app.me?.person;
  const myVote = myPerson ? p.votes.get(myPerson)?.choice : undefined;
  const eligible = !!myPerson && p.eligible.has(myPerson);
  const m = s.settingsAt(p.event.created_at).content.threshold;

  const vote = async (choice: Choice) => {
    setMsg(undefined);
    setBusy(true);
    try {
      await signAndPublish(KIND.vote, { choice }, [['e', p.event.id]]);
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const memberOf = (a: string) => {
    const o = c.type === 'payout' ? (c.payload.outputs as Output[]).find(x => x.address === a) : undefined;
    return o?.member ? s.personOf(o.member) : undefined;
  };
  const confirmOne = async (a: string) => {
    setMsg(undefined);
    setBusy(true);
    try {
      await signAndPublish(KIND.confirm, { address: a }, [['e', p.event.id]]);
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${app.site!.site.replace(/\/$/, '')}/#/confirm/${p.event.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const record = app.events
    .filter(e => e.id === p.event.id || (tagValue(e, 'e') === p.event.id && [KIND.vote, KIND.confirm, KIND.tally].includes(e.kind as 3576)))
    .sort((a, b) => a.created_at - b.created_at);

  return (
    <>
      <Header />
      <main>
        <div class="row" style="justify-content:flex-start;gap:8px">
          <span class="mono small">{proposalLabel(app.site!.name, p.number)}</span>
          <span class="chip">{typeLabel(c.type)}</span>
          <span class={p.status === 'passed' ? 'chip teal' : 'chip'}>{statusText(p, s.now)}</span>
        </div>
        <h1>{c.title}</h1>
        <p class="small">{t('pd.by', { name: nameOf(p.event.pubkey), date: fmtDate(p.event.created_at) })}</p>

        <section class="card">
          <h3>{t('pd.what')}</h3>
          <p style="white-space:pre-wrap">{c.summary}</p>
          {c.link && <a href={c.link.url} target="_blank" rel="noopener noreferrer">{t('pd.link')} ↗</a>}
          <Payload p={p} />
          {p.status === 'passed' && <PaymentLine id={p.event.id} />}
        </section>

        {p.addresses.length > 0 && (
          <section class="card">
            {p.addresses.map(a => (
              <div class="stack" style="gap:4px">
                <Address value={a} />
                {p.confirmations.has(a) ? <span class="ok">{t('pd.confirmed')}</span>
                  : p.byStanding.has(a) ? <span class="ok">{t('pd.byStanding')}</span>
                  : p.standingMoved.includes(a) ? <span class="warn">{t('pd.standingMoved')}</span>
                  : <span class="warn">{t('pd.unconfirmed')}</span>}
                {!p.confirmations.has(a) && !p.byStanding.has(a) && app.secret && memberOf(a) === myPerson && (
                  <button type="button" class="btn secondary" disabled={busy} onClick={() => confirmOne(a)}>{t('pd.confirmThis')}</button>
                )}
              </div>
            ))}
            {!p.confirmed && <button type="button" class="btn secondary" onClick={copyLink}>{copied ? t('home.copied') : t('pd.confirmLink')}</button>}
          </section>
        )}

        <section class="card">
          <h3>{t('pd.votes')}</h3>
          <div class="kv"><span>{t('choice.yes')}</span><span>{p.counts.yes}</span></div>
          <div class="kv"><span>{t('choice.no')}</span><span>{p.counts.no}</span></div>
          <div class="kv"><span>{t('choice.abstain')}</span><span>{p.counts.abstain}</span></div>
          <p class="small">{t('pd.quorum', { n: p.votes.size, needed: p.quorumNeeded, eligible: p.eligible.size })}</p>
          <p class="small">{p.twoThirds ? t('pd.majority2') : t('pd.majority1')}</p>
          <p class="small">{p.status === 'open' ? t('pd.closes', { date: fmtDateTime(p.closeAt) }) : t('pd.closed', { date: fmtDateTime(p.closeAt) })}</p>
          {p.status === 'open' && (
            !app.me || !app.secret ? (
              <button type="button" class="btn secondary" onClick={() => go('/join')}>{t('pd.signInToVote')}</button>
            ) : !eligible ? (
              <p class="note">{t('pd.notEligible')}</p>
            ) : (
              <>
                {myVote && <p class="ok">{t('pd.yourVote', { choice: t(`choice.${myVote}` as 'choice.yes') })}</p>}
                <div class="row" style="gap:8px">
                  {(['yes', 'no', 'abstain'] as Choice[]).map(ch => (
                    <button type="button" class={myVote === ch ? 'btn primary' : 'btn secondary'} style="font-size:15px;padding:0 8px" disabled={busy} aria-pressed={myVote === ch} onClick={() => vote(ch)}>
                      {t(`choice.${ch}` as 'choice.yes')}
                    </button>
                  ))}
                </div>
              </>
            )
          )}
          {p.tally && <p class="small">{t('pd.tally', { names: [...new Set(p.tally.events.map(e => nameOf(e.pubkey)))].join(', ') })}</p>}
          {p.tallyMismatch && <p class="warnbox">{t('pd.tallyMismatch')}</p>}
          {p.untallied.length > 0 && <p class="warnbox">{t('pd.untallied')}</p>}
          {p.status === 'disputed' && <p class="warnbox">{t('pd.disputedText', { m })}</p>}
          {msg && <p class="warnbox">{msg}</p>}
        </section>

        <details class="card">
          <summary style="cursor:pointer"><strong>{t('pd.archive')}</strong> · <span class="small">{record.length}</span></summary>
          <p class="small" style="margin-top:8px">{t('pd.archiveText')}</p>
          <div class="list">
            {record.map(e => <RecordRow e={e} nameOf={nameOf} />)}
          </div>
        </details>
      </main>
      <Footer />
    </>
  );
}

function RecordRow({ e, nameOf }: { e: Event; nameOf: (k: string) => string }) {
  const kind = e.kind === KIND.proposal ? t('arch.proposal') : e.kind === KIND.vote ? t('arch.vote') : e.kind === KIND.confirm ? t('arch.confirm') : t('arch.tally');
  const b = parseJson<any>(e.content);
  const detail = e.kind === KIND.vote ? t(`choice.${b?.choice}` as 'choice.yes') : e.kind === KIND.tally ? t('counts', b?.result ?? {}) : '';
  return (
    <div class="stack" style="gap:2px">
      <div class="row"><strong style="font-size:14px">{kind}{detail ? ` · ${detail}` : ''}</strong><span class="small">{fmtDateTime(e.created_at)}</span></div>
      <span class="small">{nameOf(e.pubkey)} · <span class="mono">{e.id.slice(0, 12)}…</span></span>
    </div>
  );
}

function Payload({ p }: { p: ProposalView }) {
  const app = useApp();
  const s = app.dao!;
  const nameOf = useNameOf();
  const c = p.content;
  const pl = c.payload;
  switch (c.type) {
    case 'payout':
      return (
        <>
          <div class="kv"><span>{t('pd.recipient')}</span><span>{pl.recipient}</span></div>
          {(pl.outputs as Output[]).map(o => (
            <>
              {o.member && <div class="kv"><span>{t('pd.for')}</span><span>{nameOf(o.member)}</span></div>}
              <div class="kv"><span>{t('pd.amount')}</span><span class="mono">{fmtSats(o.amount_sat)} sats</span></div>
            </>
          ))}
        </>
      );
    case 'add_member': {
      const vs = (pl.verify as string[]).map(id => s.verifies.find(v => v.id === id)).filter(Boolean) as Event[];
      const mode = vs.some(v => parseJson<any>(v.content).mode === 'in_person') ? t('members.inPerson') : t('members.remote');
      return (
        <>
          <div class="kv"><span>{t('pd.candidate')}</span><span>{pl.name} · <span class="mono">{formatShortCode(shortCode(pl.candidate_key))}</span></span></div>
          <p class="small">{t('pd.verifiedBy', { names: vs.map(v => nameOf(v.pubkey)).join(', '), mode })}</p>
        </>
      );
    }
    case 'remove_member':
      return (
        <>
          <div class="kv"><span>{t('pd.member')}</span><span>{nameOf(pl.member_key)}</span></div>
          {pl.reason && <div class="kv"><span>{t('pd.reason')}</span><span>{pl.reason}</span></div>}
        </>
      );
    case 'change_rules':
      return (
        <>
          {(pl.changes as { path: string; from: unknown; to: unknown }[]).map(ch => (
            <p class="small">{t('pd.change', { rule: ruleLabel(ch.path.slice(6)), from: JSON.stringify(ch.from), to: JSON.stringify(ch.to) })}</p>
          ))}
        </>
      );
    case 'close':
      return <p class="warn">{t('pd.destination')}</p>;
    default:
      return null;
  }
}

export const EDITABLE_RULES = ['votingPeriodDays', 'quorum', 'payoutRound', 'lapseAfterRounds', 'maxFeeRateSatVb', 'treasuryCapSats'] as const;

export function ruleLabel(key: string) {
  switch (key) {
    case 'votingPeriodDays': return t('setup.voting');
    case 'quorum': return t('setup.quorum');
    case 'maxFeeRateSatVb': return t('setup.maxFee');
    case 'treasuryCapSats': return t('setup.cap');
    case 'lapseAfterRounds': return t('np.ruleLapse');
    case 'payoutRound': return t('setup.payouts');
    default: return key;
  }
}
