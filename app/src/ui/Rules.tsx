import { useApp } from '../app';
import { fmtSats, t } from '../i18n';
import { sha256Hex } from '../core/util';
import { cadenceOf } from '../core/time';
import { Address, Footer, Header } from './parts';
import charterText from '@charter?raw';

declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;

export function Rules() {
  const app = useApp();
  const cfg = app.dao?.founded?.config ?? app.site!;
  const r = app.dao?.rules ?? cfg.rules;
  const charterOk = sha256Hex(charterText) === r.charterSha256;
  return (
    <>
      <Header />
      <main>
        <h1>{t('rules.title')}</h1>
        <div class="card">
          <h3>{t('rules.inForce')}</h3>
          {app.dao?.settings.length ? <span class="small">{t('rules.settingsVersion', { v: app.dao.settings[app.dao.settings.length - 1].content.version })}</span> : null}
          <div class="kv"><span>{t('setup.voting')}</span><span>{t('setup.days', { n: r.votingPeriodDays })}</span></div>
          <div class="kv"><span>{t('setup.quorum')}</span><span>{t('setup.quorumVal', { q: r.quorum })}</span></div>
          <div class="kv"><span>{t('setup.payouts')}</span><span>{cadenceOf(r.payoutRound) === 'weekly' ? t('setup.weekly') : t('setup.monthly')}</span></div>
          <div class="kv"><span>{t('setup.maxFee')}</span><span>{r.maxFeeRateSatVb} sat/vB</span></div>
          <div class="kv"><span>{t('setup.cap')}</span><span>{fmtSats(r.treasuryCapSats)} sats</span></div>
          <p class="small">{t('rules.simple', { list: r.simpleMajority.join(', ') })}</p>
          <p class="small">{t('rules.twoThirds', { list: r.twoThirdsMajority.join(', ') })}</p>
          <p class="small">{t('rules.lapse', { n: r.lapseAfterRounds })}</p>
        </div>
        <div class="card">
          <h3>{t('rules.charter')}</h3>
          {app.daoId && (charterOk ? <p class="ok">{t('rules.charterOk')}</p> : <p class="warn">{t('rules.charterBad')}</p>)}
          <details>
            <summary style="cursor:pointer">{t('rules.charterShow')}</summary>
            <div style="white-space:pre-wrap;font-size:14px;line-height:1.55;margin-top:12px">{charterText}</div>
          </details>
        </div>
        {cfg.network !== 'mainnet' && cfg.testnetTreasury && !/\[/.test(cfg.testnetTreasury.address) && (
          <div class="card">
            <h3>{t('rules.testCoins')}</h3>
            <p class="small">{t('rules.testCoinsText', { name: cfg.testnetTreasury.name })}</p>
            <Address value={cfg.testnetTreasury.address} />
          </div>
        )}
        <div class="card">
          <div class="kv"><span>{t('rules.network')}</span><span>{cfg.network}</span></div>
          {app.daoId && <div class="kv"><span>{t('rules.daoId')}</span><span class="mono" style="font-size:12px">{app.daoId}</span></div>}
          <div class="kv"><span>{t('rules.relays')}</span><span class="mono" style="font-size:12px">{cfg.relays.filter(x => !/\[/.test(x)).join(' ')}</span></div>
          <div class="kv"><span>{t('rules.software')}</span><span class="mono" style="font-size:12px">{t('rules.version', { v: __APP_VERSION__, b: __BUILD_ID__ })}</span></div>
          {!!app.dao?.rejected.length && <p class="small">{t('rules.rejected', { n: app.dao.rejected.length })}</p>}
        </div>
      </main>
      <Footer />
    </>
  );
}
