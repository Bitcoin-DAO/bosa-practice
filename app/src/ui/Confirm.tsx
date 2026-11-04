// Recipient confirmation (protocol 4.2): anyone with the link can confirm, with their key or a one-off one.
import { useState } from 'preact/hooks';
import { publishSigned, useApp } from '../app';
import { fmtSats, t } from '../i18n';
import { KIND, sign, template } from '../core/events';
import { newSecret } from '../core/identity';
import { proposalLabel, type Output } from '../core/state';
import { Address, Header, errText } from './parts';

export function Confirm({ id }: { id: string }) {
  const app = useApp();
  const s = app.dao;
  const dao = app.site!.name;
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  const p = s?.proposals.find(x => x.event.id === id);

  if (!s || !p) {
    return (
      <>
        <Header />
        <main><p class="lead">{t('pd.notFound')}</p></main>
      </>
    );
  }
  const outputs: Output[] = p.content.type === 'payout' ? p.content.payload.outputs : p.content.type === 'close' ? [{ address: p.content.payload.destination, amount_sat: 0 }] : [];

  const confirm = async () => {
    setMsg(undefined);
    setBusy(true);
    try {
      const key = app.secret ?? newSecret();
      for (const a of p.addresses) {
        if (p.confirmations.has(a) || p.byStanding.has(a)) continue;
        await publishSigned(sign(template(KIND.confirm, s.founded!.daoId, { address: a }, [['e', p.event.id]]), key));
      }
      setDone(true);
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
        <h1>{t('cf.title')}</h1>
        {outputs.length === 0 ? (
          <p class="lead">{t('cf.nothing')}</p>
        ) : done || p.confirmed ? (
          <div class="card">
            <h2>{t('cf.done')}</h2>
            <p class="small">{t('cf.doneText')}</p>
          </div>
        ) : (
          <>
            <p class="lead">{t('cf.intro', { dao })}</p>
            <div class="card">
              <span class="mono small">{proposalLabel(dao, p.number)}</span>
              <strong>{p.content.title}</strong>
              {outputs.map(o => (
                <div class="stack" style="gap:4px">
                  <Address value={o.address} />
                  {o.amount_sat > 0 && <span class="mono">{fmtSats(o.amount_sat)} sats</span>}
                </div>
              ))}
            </div>
            {!app.secret && <p class="small">{t('cf.anon', { dao })}</p>}
            <button type="button" class="btn primary" disabled={busy} onClick={confirm}>{t('cf.button')}</button>
          </>
        )}
        {msg && <p class="warnbox">{msg}</p>}
      </main>
    </>
  );
}
