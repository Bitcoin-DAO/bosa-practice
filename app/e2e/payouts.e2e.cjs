// End-to-end, stage 3: a 2-of-3 treasury on the mock chain. A passed payout goes into a round,
// two council phones sign with their trial keys, the round is broadcast, confirms, and is paid.
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');

const URL0 = 'http://localhost:4173/';
const OUT = __dirname + '/out';
const SHOTS = OUT + '/shots-pay';
fs.mkdirSync(SHOTS, { recursive: true });
fs.writeFileSync(OUT + '/funded.json', '{}');
for (const f of fs.readdirSync(OUT)) if (f.startsWith('broadcast-')) fs.unlinkSync(`${OUT}/${f}`);
const RECIPIENT = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
const ALL = [];
let failures = 0;
const log = (...a) => console.log('•', ...a);
const check = (cond, what) => {
  console.log(cond ? '  ✓' : '  ✗', what);
  if (!cond) failures++;
};
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const seen = loc => loc.first().waitFor({ timeout: 30000 }).then(() => true, () => false);

async function phone(browser, label) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'it-IT', permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true },
  });
  page.on('pageerror', e => console.log(`  [${label}] pageerror`, e.message));
  page.on('dialog', d => d.accept());
  ALL.push({ page, label });
  return { ctx, page, label };
}
const copied = page => page.evaluate(() => navigator.clipboard.readText());
async function open(page, hash) {
  await page.goto(URL0 + hash);
  await page.reload();
}
async function paste(page, code) {
  await page.getByText('La fotocamera non è disponibile').waitFor();
  await page.locator('.scanner textarea').fill(code);
  await page.getByRole('button', { name: 'Usa', exact: true }).click();
}
async function signUp(page, name, council) {
  await page.goto(URL0 + '#/founder');
  await page.getByRole('textbox').fill(name);
  if (council) await page.getByLabel('Chiedo un posto nel Consiglio').check();
  await page.getByLabel(/Ho almeno 18 anni/).check();
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByRole('button', { name: 'Crea con impronta o volto' }).click();
  await page.getByRole('button', { name: 'Copia il codice' }).click();
  return copied(page);
}

(async () => {
  const browser = await chromium.launch();
  const [A, B, C, F] = await Promise.all(['@anna', '@marco', '@luca', '@elena'].map(n => phone(browser, n)));

  log('Founding a 2-of-3 treasury');
  const codes = {};
  for (const [p, n, c] of [[A, '@anna', 1], [B, '@marco', 1], [C, '@luca', 1], [F, '@elena', 0]]) codes[n] = await signUp(p.page, n, !!c);
  const a = A.page;
  await a.goto(URL0 + '#/setup');
  await a.getByRole('button', { name: '2 · Consiglio' }).click();
  for (const n of ['@marco', '@luca']) {
    await a.getByRole('button', { name: 'Scansiona un membro del Consiglio' }).click();
    await paste(a, codes[n]);
    await a.getByRole('button', { name: 'Coincide: aggiungi' }).click();
  }
  await a.getByRole('button', { name: '−' }).click();
  check(await a.getByText('2 di 5').isVisible(), 'threshold 2');
  await a.getByRole('button', { name: '3 · Fondatori' }).click();
  await a.getByRole('button', { name: 'Scansiona un fondatore' }).click();
  await paste(a, codes['@elena']);
  await a.getByRole('button', { name: 'Coincide: aggiungi' }).click();
  await a.getByRole('button', { name: '4 · Pubblica' }).click();
  await a.getByRole('button', { name: 'Firma e pubblica' }).click();
  await a.getByText('Pubblicate ✓').waitFor({ timeout: 20000 });
  await open(B.page, '#/founder');
  await B.page.getByRole('button', { name: 'Approva e firma' }).click();
  for (const p of [A, B, C, F]) {
    await open(p.page, '#/founder');
    await p.page.getByRole('button', { name: 'Proteggi la chiave e continua' }).click({ timeout: 20000 });
    await p.page.getByText('Stampa la tua tessera d\'identità').waitFor({ timeout: 20000 });
  }

  log('Funding the treasury (mock chain)');
  const f = F.page;
  await open(f, '#/');
  await f.locator('.addr').waitFor({ timeout: 30000 });
  check(await f.getByText('Servono 2 firme su 3').isVisible(), '2 of 3 shown');
  const addr0 = (await f.locator('.addr').innerText()).replace(/\s+/g, '');
  fs.writeFileSync(OUT + '/funded.json', JSON.stringify({ [addr0]: { value: 500000, txid: 'cd'.repeat(32) } }));

  log('A payout, the recipient being the proposer');
  await open(f, '#/new');
  await f.getByLabel('Titolo', { exact: true }).fill('Workshop wallet');
  await f.getByLabel('Testo vincolante').fill('Rimborso del materiale per il workshop.');
  await f.getByLabel('Nome del beneficiario').fill('@elena');
  await f.getByLabel('Indirizzo bitcoin del beneficiario').fill(RECIPIENT);
  await f.getByLabel('Importo in sats').fill('120000');
  await f.getByLabel(/Sono io il beneficiario/).check();
  await f.getByRole('button', { name: 'Firma e pubblica' }).click();
  await f.waitForURL(/#\/p\/[0-9a-f]{64}$/);
  const pid = f.url().split('/p/')[1];
  check(await seen(f.getByText('Confermato dal beneficiario ✓')), 'confirmed in the same step');
  for (const p of [A, B, C, F]) {
    await open(p.page, `#/p/${pid}`);
    await p.page.getByRole('button', { name: 'Sì', exact: true }).click();
    await p.page.getByText(/Il tuo voto:/).waitFor({ timeout: 15000 });
  }
  log('Waiting for the close (~2 min)');
  await new Promise(r => setTimeout(r, 135000));
  await open(a, '#/council');
  await a.waitForTimeout(3000); // the council phone publishes the count
  await open(f, `#/p/${pid}`);
  check(await seen(f.getByText(/entra nel prossimo giro/)), 'payout waiting for the round');
  await open(f, '#/');
  check(await seen(f.getByText('1 pagamenti approvati · 120.000 sats')), 'home shows the next round');

  log('@anna prepares the round and signs; @marco signs; broadcast');
  await open(a, '#/council');
  await a.getByRole('link', { name: 'Prepara il giro di pagamenti' }).click();
  await a.getByText('Consigliata ora: 2 sat/vB').waitFor({ timeout: 30000 });
  await a.getByRole('button', { name: 'Prepara la transazione' }).click();
  await a.getByText('Riepilogo').waitFor();
  await shot(a, '01-prepare');
  await a.getByRole('button', { name: 'Firma e pubblica il giro' }).click();
  await a.waitForURL(/#\/round\/[0-9a-f]{64}$/);
  const rid = a.url().split('/round/')[1];
  check(await seen(a.getByText('Hai firmato ✓')), 'preparer signed with the trial key');
  check(await seen(a.getByText('Firme: 1 di 2')), '1 of 2 signatures');
  log('@marco loses the trial treasury key (as after a card restore) and types the 12 words back');
  const mb = B.page;
  await open(mb, '#/profile');
  await mb.getByRole('button', { name: 'Mostra le 12 parole' }).click();
  const words = (await mb.locator('p.mono').filter({ hasText: /^([a-z]+ ){11}[a-z]+$/ }).first().textContent()).trim();
  await mb.evaluate(() => new Promise((res, rej) => {
    const rq = indexedDB.open('btc-dao');
    rq.onerror = () => rej(rq.error);
    rq.onsuccess = () => {
      const tx = rq.result.transaction('kv', 'readwrite');
      const kv = tx.objectStore('kv');
      const all = kv.getAllKeys();
      all.onsuccess = () => {
        for (const k of all.result.filter(k => String(k).startsWith('identity:'))) {
          const g = kv.get(k);
          g.onsuccess = () => { const v = g.result; delete v.treasury; kv.put(v, k); };
        }
      };
      tx.oncomplete = () => res();
    };
  }));
  await open(mb, `#/round/${rid}`);
  check(await seen(mb.getByRole('link', { name: 'Rimetti le 12 parole →' })), 'round page says the key is missing, with a link');
  await open(mb, '#/profile');
  const box = mb.getByLabel(/Scrivi le 12 parole/);
  const wrong = 'abandon '.repeat(11) + 'about';
  await box.fill(wrong);
  await mb.getByRole('button', { name: 'Rimetti la chiave su questo telefono' }).click();
  check(await seen(mb.getByText(/Queste parole danno un'altra chiave/)), 'words of another key are refused');
  await box.fill(words.toUpperCase().replace(/ /g, '   '));
  await mb.getByRole('button', { name: 'Rimetti la chiave su questo telefono' }).click();
  check(await seen(mb.getByText(/Chiave della tesoreria rimessa/)), 'own words accepted (case and spacing ignored)');
  await open(B.page, `#/round/${rid}`);
  await B.page.getByRole('button', { name: 'Firma con la chiave di prova' }).waitFor({ timeout: 20000 });
  await shot(B.page, '02-sign');
  await B.page.getByRole('button', { name: 'Firma con la chiave di prova' }).click();
  await B.page.getByText('Firme sufficienti ✓').waitFor({ timeout: 20000 });
  await B.page.getByRole('button', { name: 'Trasmetti la transazione' }).click();
  check(await seen(B.page.getByText(/Accettata da 127\.0\.0\.1|Sulla rete ✓/)), 'broadcast accepted, with the source named');
  check(await seen(B.page.getByText(/Sulla rete ✓/)), 'broadcast seen on the network');

  log('Confirmation and receipt');
  await new Promise(r => setTimeout(r, 6000));
  await open(a, `#/round/${rid}`);
  check(await seen(a.getByText(/Confermata nel blocco/)), 'receipt published by a council phone');
  await open(f, `#/p/${pid}`);
  check(await seen(f.getByText(/Pagato ✓ nel giro/)), 'proposal shows paid');
  await shot(f, '03-paid');
  await open(f, '#/');
  await f.locator('.balance').filter({ hasText: /\d/ }).waitFor({ timeout: 30000 });
  // The remembered reading shows first; wait for the background refresh to finish.
  await f.getByText(/aggiornamento…/).waitFor({ state: 'detached', timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 500));
  const bal = Number((await f.locator('.balance').innerText()).replace(/[^\d]/g, ''));
  check(bal < 500000 - 120000 && bal > 500000 - 120000 - 2000, `treasury balance ${bal} = 500.000 − 120.000 − fee`);
  check(await seen(f.getByText(/Giro \d{4}-\d{2} · UNO-0001/)), 'movement labelled with the round');
  await shot(f, '04-home');

  log('Independent check of the broadcast transaction with embit');
  const b = fs.readdirSync(OUT).find(x => x.startsWith('broadcast-'));
  const outp = execFileSync('python3', [__dirname + '/embit-check.py', `${OUT}/${b}`]).toString();
  console.log(outp.trim().split('\n').map(l => '    ' + l).join('\n'));
  check(/ALL OK/.test(outp), 'signatures verify in key order (embit)');

  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch(async e => {
  console.error(e);
  for (const { page, label } of ALL) {
    try {
      await page.screenshot({ path: `${SHOTS}/fail-${label.replace(/[^a-z0-9-]/gi, '')}.png`, fullPage: true });
      console.log(`--- ${label}:`, (await page.locator('main').innerText()).slice(0, 700).replace(/\n+/g, ' | '));
    } catch {}
  }
  process.exit(1);
});
