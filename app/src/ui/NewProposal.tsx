// New proposal (protocol 4.1). New members go through the sponsor flow instead.
import { useState } from 'preact/hooks';
import { signAndPublish, useApp } from '../app';
import { fmtSats, t } from '../i18n';
import { KIND } from '../core/events';
import { DUST, proposalSchemaError, validAddress, type ProposalContent, type ProposalType } from '../core/state';
import { cadenceOf } from '../core/time';
import { Footer, Header, errText, go } from './parts';
import { EDITABLE_RULES, ruleLabel, typeLabel } from './Proposals';

const TYPES: ProposalType[] = ['payout', 'statement', 'remove_member', 'change_rules', 'close'];

export function NewProposal() {
  const app = useApp();
  const s = app.dao!;
  const network = app.site!.network;
  const [type, setType] = useState<ProposalType>('payout');
  const returnTo = s.founded!.config.testnetTreasury ?? app.site!.testnetTreasury;
  const returnOk = !!returnTo && validAddress(returnTo.address, network);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [link, setLink] = useState('');
  const [recipient, setRecipient] = useState('');
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [iAm, setIAm] = useState(false);
  const [member, setMember] = useState('');
  const [forMember, setForMember] = useState('');
  const [reason, setReason] = useState('');
  const [rule, setRule] = useState<(typeof EDITABLE_RULES)[number]>('votingPeriodDays');
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (!app.me || !app.secret) {
    return (
      <>
        <Header />
        <main>
          <p class="lead">{t('np.signIn')}</p>
          <button type="button" class="btn primary" onClick={() => go('/join')}>{t('nav.signin')}</button>
        </main>
      </>
    );
  }

  const addr = address.trim();
  const addrError = addr && (!validAddress(addr, network) ? t('np.addressBad', { network }) : s.isTreasuryAddress(addr) ? t('np.addressTreasury') : undefined);
  const amt = Number(amount);
  const amtError = amount && !(Number.isInteger(amt) && amt > DUST) ? t('np.amountBad', { dust: DUST }) : undefined;
  const current = s.rules?.[rule];
  const parsedValue = (() => {
    if (rule === 'payoutRound') return value === 'weekly' || value === 'monthly' ? value : undefined;
    if (rule === 'quorum') return /^\d+\/\d+$/.test(value.trim()) ? value.trim() : undefined;
    const n = Number(value);
    return value.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
  })();

  let payload: Record<string, unknown> = {};
  if (type === 'payout') payload = { recipient: recipient.trim(), outputs: [{ address: addr, amount_sat: amt, ...(forMember ? { member: forMember } : {}) }] };
  if (type === 'remove_member') payload = { member_key: member, reason: reason.trim() };
  if (type === 'change_rules') payload = { changes: [{ path: `rules.${rule}`, from: current, to: parsedValue }] };
  if (type === 'close') payload = { destination: addr };
  const content: ProposalContent = {
    type, title: title.trim(), summary: summary.trim(), lang: app.lang, payload,
    ...(link.trim() ? { link: { url: link.trim() } } : {}),
  };
  const schemaErr = proposalSchemaError(content, network);
  const ok = !schemaErr && !addrError && !amtError && !(type === 'change_rules' && (parsedValue === undefined || parsedValue === current || (rule === 'payoutRound' && parsedValue === cadenceOf(current))));

  const publish = async () => {
    setMsg(undefined);
    setBusy(true);
    try {
      const { event } = await signAndPublish(KIND.proposal, content);
      if (iAm && !(type === 'payout' && payee && payeeStanding?.address === addr) && (type === 'payout' || type === 'close')) await signAndPublish(KIND.confirm, { address: addr }, [['e', event.id]]);
      go(`/p/${event.id}`);
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const removable = s.members.filter(m => !m.council && m.key !== app.me!.key);
  const payee = s.members.find(m => m.key === forMember);
  const payeeStanding = payee ? s.standingAt(payee.key, s.now) : undefined;
  const chooseMember = (key: string) => {
    setForMember(key);
    const st = key ? s.standingAt(key, s.now) : undefined;
    const m = s.members.find(x => x.key === key);
    if (st) setAddress(st.address);
    if (m && !recipient.trim()) setRecipient(m.name);
  };

  return (
    <>
      <Header />
      <main>
        <h1>{t('np.title')}</h1>
        <label class="field">
          {t('np.type')}
          <select value={type} onChange={e => {
            const v = (e.target as HTMLSelectElement).value as ProposalType;
            setType(v);
            if (v === 'close' && returnOk && !address.trim()) setAddress(returnTo!.address);
          }} style="min-height:48px;border:1px solid var(--field);border-radius:8px;padding:0 12px;font:inherit;font-size:16px;background:#fff">
            {TYPES.map(x => <option value={x}>{typeLabel(x)}</option>)}
          </select>
        </label>
        <p class="small">{t('np.sponsorHint')}</p>
        <label class="field">{t('np.titleField')}<input type="text" maxLength={80} value={title} onInput={e => setTitle((e.target as HTMLInputElement).value)} /></label>
        <label class="field">
          {t('np.summary')}
          <textarea maxLength={500} value={summary} style="font-family:inherit;font-size:16px" onInput={e => setSummary((e.target as HTMLTextAreaElement).value)} />
          <span class="small" style="font-weight:400">{t('np.summaryHint')} {summary.length}/500</span>
        </label>
        <label class="field">{t('np.link')}<input type="text" inputMode="url" placeholder="https://" value={link} onInput={e => setLink((e.target as HTMLInputElement).value)} /></label>

        {type === 'payout' && (
          <div class="card">
            <label class="field">
              {t('np.forMember')}
              <select value={forMember} onChange={e => chooseMember((e.target as HTMLSelectElement).value)} style="min-height:48px;border:1px solid var(--field);border-radius:8px;padding:0 12px;font:inherit;font-size:16px;background:#fff">
                <option value="">—</option>
                {s.members.map(m => <option value={m.key}>{m.name}</option>)}
              </select>
            </label>
            <label class="field">{t('np.recipient')}<input type="text" maxLength={80} value={recipient} onInput={e => setRecipient((e.target as HTMLInputElement).value)} /></label>
            <label class="field">{t('np.address')}<input type="text" class="mono" autoComplete="off" spellcheck={false} value={address} onInput={e => setAddress((e.target as HTMLInputElement).value)} /></label>
            {addrError && <p class="error">{addrError}</p>}
            {payee && addr && !addrError && (
              payeeStanding?.address === addr ? <p class="ok">{t('np.standingUsed', { name: payee.name })}</p>
                : <p class="small">{t(payeeStanding ? 'np.standingOther' : 'np.noStanding', { name: payee.name })}</p>
            )}
            <label class="field">{t('np.amount')}<input type="text" inputMode="numeric" value={amount} onInput={e => setAmount((e.target as HTMLInputElement).value.replace(/[^\d]/g, ''))} /></label>
            {amount && !amtError && <span class="small">{fmtSats(amt)} sats</span>}
            {amtError && <p class="error">{amtError}</p>}
            {!(payee && payeeStanding?.address === addr) && (
              <>
                <label class="check"><input type="checkbox" checked={iAm} onChange={e => setIAm((e.target as HTMLInputElement).checked)} />{t('np.iAmRecipient')}</label>
                {!iAm && <p class="small">{t('np.recipientLater')}</p>}
              </>
            )}
          </div>
        )}

        {type === 'remove_member' && (
          <div class="card">
            <label class="field">
              {t('np.member')}
              <select value={member} onChange={e => setMember((e.target as HTMLSelectElement).value)} style="min-height:48px;border:1px solid var(--field);border-radius:8px;padding:0 12px;font:inherit;font-size:16px;background:#fff">
                <option value="">—</option>
                {removable.map(m => <option value={m.key}>{m.name}</option>)}
              </select>
            </label>
            <label class="field">{t('np.reason')}<input type="text" value={reason} onInput={e => setReason((e.target as HTMLInputElement).value)} /></label>
          </div>
        )}

        {type === 'change_rules' && (
          <div class="card">
            <label class="field">
              {t('np.rule')}
              <select value={rule} onChange={e => (setRule((e.target as HTMLSelectElement).value as typeof rule), setValue(''))} style="min-height:48px;border:1px solid var(--field);border-radius:8px;padding:0 12px;font:inherit;font-size:16px;background:#fff">
                {EDITABLE_RULES.map(r => <option value={r}>{ruleLabel(r)}</option>)}
              </select>
            </label>
            <span class="small">{t('np.current', { v: String(current) })}</span>
            {rule === 'payoutRound' ? (
              <label class="field">
                {t('np.newValue')}
                <select value={value} onChange={e => setValue((e.target as HTMLSelectElement).value)} style="min-height:48px;border:1px solid var(--field);border-radius:8px;padding:0 12px;font:inherit;font-size:16px;background:#fff">
                  <option value="">—</option>
                  <option value="monthly">{t('setup.monthly')}</option>
                  <option value="weekly">{t('setup.weekly')}</option>
                </select>
              </label>
            ) : (
              <label class="field">{t('np.newValue')}<input type="text" value={value} onInput={e => setValue((e.target as HTMLInputElement).value)} /></label>
            )}
          </div>
        )}

        {type === 'close' && (
          <div class="card">
            <p class="warn">{t('np.closeWarn')}</p>
            {returnOk && <p class="note">{t('np.returnNote', { name: returnTo!.name })}</p>}
            <label class="field">{t('np.destination')}<input type="text" class="mono" autoComplete="off" spellcheck={false} value={address} onInput={e => setAddress((e.target as HTMLInputElement).value)} /></label>
            {addrError && <p class="error">{addrError}</p>}
            <label class="check"><input type="checkbox" checked={iAm} onChange={e => setIAm((e.target as HTMLInputElement).checked)} />{t('np.iAmRecipient')}</label>
          </div>
        )}

        <button type="button" class="btn primary" disabled={!ok || busy} onClick={publish}>{t('np.publish')}</button>
        {msg && <p class="warnbox">{msg}</p>}
      </main>
      <Footer />
    </>
  );
}
