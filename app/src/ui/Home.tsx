import { useState } from 'preact/hooks';
import { refreshTreasury, useApp } from '../app';
import { fmtDate, fmtSats, t } from '../i18n';
import { Address, Footer, Header, Qr, go } from './parts';
import { Join } from './Join';
import { ProposalCard } from './Proposals';
import { councilTodo } from './Council';
import { cadenceOf, roundDatesAfter } from '../core/time';
import { proposalLabel, type RoundView } from '../core/state';
import { parseDescriptor, treasuryAddress } from '../core/descriptor';

export function Home() {
  const app = useApp();
  if (!app.daoId) return <Join />;
  const cfg = app.dao!.founded!.config;
  const current = app.dao!.settings[app.dao!.settings.length - 1].content;
  const tr = app.treasury;
  const n = current.council.length;
  const m = current.threshold;
  const cap = current.rules.treasuryCapSats;
  const atCap = tr ? tr.balance >= cap : false;
  const explorer = (cfg.chainApi[0] ?? '').replace(/\/api\/?$/, '');
  const open = app.dao!.proposals.filter(p => p.status === 'open').reverse();
  const round = app.dao!.rounds.find(r => r.status === 'open');
  const waiting = app.dao!.proposals.filter(p => app.dao!.payments.get(p.event.id)?.status === 'waiting' && p.content.type === 'payout');
  const waitingSats = waiting.reduce((s, p) => s + (p.content.payload.outputs as { amount_sat: number }[]).reduce((a, o) => a + o.amount_sat, 0), 0);
  const nextRoundDate = new Intl.DateTimeFormat(app.lang === 'en' ? 'en-GB' : 'it-IT', { day: 'numeric', month: 'long', timeZone: current.rules.timezone })
    .format(new Date(roundDatesAfter(app.dao!.now, current.rules.timezone, 1, cadenceOf(current.rules.payoutRound))[0] * 1000));
  const paidRounds = new Map(app.dao!.rounds.filter(r => r.status === 'paid' && r.inspection).map(r => [r.inspection!.txid, r]));
  return (
    <>
      <Header />
      <main>
        <section class="card">
          <span class="small" style="font-size:15px">{t('home.balance')}</span>
          {tr ? (
            <>
              <div class="balance">{fmtSats(tr.balance)} <small>sats</small></div>
              {tr.unconfirmed !== 0 && <span class="small">{t('home.unconfirmed', { amount: fmtSats(tr.unconfirmed) })}</span>}
              {cfg.network !== 'mainnet' && <span class="small">{t('home.testValue')}</span>}
            </>
          ) : app.treasuryError ? (
            <>
              <p class="error">{t('home.chainError', { msg: app.treasuryError })}</p>
              <button type="button" class="btn secondary" onClick={() => refreshTreasury()}>{t('retry')}</button>
            </>
          ) : (
            <div class="balance" aria-busy="true">…</div>
          )}
          <hr class="divider" />
          <div class="row">
            <div class="stack" style="gap:2px">
              <strong>{t('home.signatures', { m, n })}</strong>
              <span class="small">{t('home.councilKeys', { n })}</span>
            </div>
            <div class="dots" aria-hidden="true">{Array.from({ length: n }, (_, i) => <i class={i < m ? 'on' : ''} />)}</div>
          </div>
        </section>

        {!tr && app.treasuryError && <Donate address={firstAddress(cfg.descriptor, cfg.network)} />}

        {tr && (atCap ? (
          <section class="card">
            <h2>{t('home.donate')}</h2>
            <p class="warn">{tr.balance > cap ? t('home.overCap', { cap: fmtSats(cap) }) : t('home.capReached', { cap: fmtSats(cap) })}</p>
          </section>
        ) : (
          <Donate address={tr.donationAddress} />
        ))}

        {app.isCouncil && app.me && councilTodo(app.dao!, app.me.person) > 0 && (
          <a class="card tint" style="text-decoration:none;color:var(--teal-ink)" href="#/council">
            <strong>{t('home.councilTodo', { n: councilTodo(app.dao!, app.me.person) })}</strong>
          </a>
        )}

        {app.dao!.closed && <p class="warnbox">{t('home.closed', { dao: app.site!.name })}</p>}
        {!app.dao!.closed && (round ? (
          <a class="card tint" style="text-decoration:none;color:var(--teal-ink);gap:4px" href={`#/round/${round.event.id}`}>
            <span class="small">{t('home.nextRound')}</span>
            <div class="row"><strong style="font-size:18px">{t('home.roundOpen', { round: round.content.round, n: round.signatures.size, m: round.threshold })}</strong><span>{t('home.see')}</span></div>
          </a>
        ) : (
          <div class="card tint" style="gap:4px;color:var(--teal-ink)">
            <span class="small">{t('home.nextRound')}</span>
            <strong style="font-size:22px">{nextRoundDate}</strong>
            <span class="small">{t('home.nextRoundText', { n: waiting.length, sats: fmtSats(waitingSats) })}</span>
          </div>
        ))}

        <div class="row">
          <h2>{t('home.open')}</h2>
          <a href="#/proposals" style="font-weight:600;text-decoration:none">{t('home.all')}</a>
        </div>
        {open.length === 0 ? <p class="small">{t('home.noOpen')}</p> : open.map(p => <ProposalCard p={p} />)}
        {app.me && app.secret && <button type="button" class="btn secondary" onClick={() => go('/new')}>{t('props.new')}</button>}

        {tr && (
          <section class="card">
            <h2>{t('home.movements')}</h2>
            {tr.movements.length === 0 ? (
              <p class="small">{t('home.noMovements')}</p>
            ) : (
              <div class="list">
                {tr.movements.map(mv => (
                  <div class="row" style="align-items:flex-start">
                    <div class="stack" style="gap:2px">
                      <strong>{mv.net >= 0 ? t('home.in') : paidRounds.has(mv.txid) ? roundTitle(paidRounds.get(mv.txid)!) : t('home.out')}</strong>
                      <span class="small">
                        {mv.time ? fmtDate(mv.time, false) : t('home.pending')}
                        {mv.net < 0 ? ` · ${t('home.feeIncl')}` : ''} ·{' '}
                        <a href={`${explorer}/tx/${mv.txid}`} target="_blank" rel="noopener">tx</a>
                      </span>
                    </div>
                    <span class={mv.net >= 0 ? 'amount-in' : 'amount-out'}>{mv.net >= 0 ? '+' : '−'}{fmtSats(Math.abs(mv.net))}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section class="card">
          <h2>{t('home.verify')}</h2>
          <p class="small">{t('home.verifyText', { m })}</p>
          <details>
            <summary class="small" style="cursor:pointer">{t('home.descriptor')}</summary>
            <p class="mono" style="font-size:12px;overflow-wrap:anywhere;margin-top:8px">{cfg.descriptor}</p>
          </details>
          <a href="#/rules" onClick={e => (e.preventDefault(), go('/rules'))}>{t('nav.rules')} →</a>
        </section>
      </main>
      <Footer />
    </>
  );
}

function roundTitle(r: RoundView) {
  const app = useApp();
  const nums = r.content.proposals.map(id => app.dao!.proposals.find(p => p.event.id === id)).filter(Boolean).map(p => proposalLabel(app.site!.name, p!.number));
  return `${t('home.roundLabel', { round: r.content.round })} · ${nums.join(', ')}`;
}

/** The treasury's first receive address, worked out on the phone: funds sent to any treasury address are found later. */
function firstAddress(descriptor: string, network: Parameters<typeof parseDescriptor>[1]): string {
  return treasuryAddress(parseDescriptor(descriptor, network), network, 0, 0).address;
}

function Donate({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };
  return (
    <section class="card">
      <h2>{t('home.donate')}</h2>
      <div class="qr-wrap"><Qr text={`bitcoin:${address}`} size={200} label={address} /></div>
      <Address value={address} />
      <button type="button" class="btn dark" onClick={copy}>{copied ? t('home.copied') : t('home.copy')}</button>
      <p class="small">{t('home.donateNote')}</p>
    </section>
  );
}
