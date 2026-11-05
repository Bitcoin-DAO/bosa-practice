// End-to-end, stage 2: a small DAO (3 council, threshold 3, 2 founders) with a ~2 minute voting period.
// Proposals, a recipient confirmation, a new member (sponsor + council check + vote + roster),
// a rules change, leaving, and a lost key replaced by the council.
const { chromium } = require('playwright');
const fs = require('fs');

const URL0 = 'http://localhost:4173/';
const SHOTS = __dirname + '/out/shots-gov';
fs.mkdirSync(SHOTS, { recursive: true });
const log = (...a) => console.log('•', ...a);
let failures = 0;
const check = (cond, what) => {
  console.log(cond ? '  ✓' : '  ✗', what);
  if (!cond) failures++;
};
const ALL = [];
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

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

const seen = loc => loc.first().waitFor({ timeout: 20000 }).then(() => true, () => false);
const copied = page => page.evaluate(() => navigator.clipboard.readText());

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

async function paste(page, code) {
  await page.getByText('La fotocamera non è disponibile').waitFor();
  await page.locator('.scanner textarea').fill(code);
  await page.getByRole('button', { name: 'Usa', exact: true }).click();
}

async function open(page, hash) {
  await page.goto(URL0 + hash);
  await page.reload();
}

async function vote(page, id, choice) {
  await open(page, `#/p/${id}`);
  await page.getByRole('button', { name: choice, exact: true }).click();
  await page.getByText(/Il tuo voto:/).waitFor({ timeout: 15000 });
}

async function councilAction(page, buttonName) {
  await open(page, '#/council');
  const b = page.getByRole('button', { name: buttonName, exact: true });
  await b.waitFor({ timeout: 20000 });
  await b.click();
  await b.waitFor({ state: 'detached', timeout: 20000 }); // approved, or in effect once the last approval lands
}

(async () => {
  const browser = await chromium.launch();
  const [A, B, C, F1, F2] = await Promise.all(['@anna', '@marco', '@luca', '@elena', '@marta'].map(n => phone(browser, n)));

  log('Founding: 3 council, threshold 3, 2 founders');
  const codes = {};
  for (const [p, n, c] of [[A, '@anna', 1], [B, '@marco', 1], [C, '@luca', 1], [F1, '@elena', 0], [F2, '@marta', 0]]) codes[n] = await signUp(p.page, n, !!c);
  const a = A.page;
  await a.goto(URL0 + '#/setup');
  await a.getByRole('button', { name: '2 · Consiglio' }).click();
  for (const n of ['@marco', '@luca']) {
    await a.getByRole('button', { name: 'Scansiona un membro del Consiglio' }).click();
    await paste(a, codes[n]);
    await a.getByRole('button', { name: 'Coincide: aggiungi' }).click();
  }
  await a.getByRole('button', { name: '3 · Fondatori' }).click();
  for (const n of ['@elena', '@marta']) {
    await a.getByRole('button', { name: 'Scansiona un fondatore' }).click();
    await paste(a, codes[n]);
    await a.getByRole('button', { name: 'Coincide: aggiungi' }).click();
  }
  await a.getByRole('button', { name: '4 · Pubblica' }).click();
  await a.getByRole('button', { name: 'Firma e pubblica' }).click();
  await a.getByText('Pubblicate ✓').waitFor({ timeout: 20000 });
  for (const p of [B, C]) {
    await open(p.page, '#/founder');
    await p.page.getByRole('button', { name: 'Approva e firma' }).click();
    await p.page.getByText(/Hai approvato ✓|è fondata ✓/).first().waitFor({ timeout: 15000 });
  }
  for (const p of [A, B, C, F1, F2]) {
    await open(p.page, '#/founder');
    await p.page.getByRole('button', { name: 'Proteggi la chiave e continua' }).click({ timeout: 20000 });
    await p.page.getByText('Stampa la tua tessera d\'identità').waitFor({ timeout: 20000 });
  }
  check(true, 'founded, 5 members');

  log('Proposals: payout (recipient confirms by link), statement, rules change');
  const f1 = F1.page;
  await open(f1, '#/new');
  await f1.getByLabel('Titolo', { exact: true }).fill('Stampa dei volantini');
  await f1.getByLabel('Testo vincolante').fill('500 volantini A5 per il meetup.');
  await f1.getByLabel('Nome del beneficiario').fill('Tipografia');
  await f1.getByLabel('Indirizzo bitcoin del beneficiario').fill('bc1qnotvalid');
  check(await f1.getByText('Non è un indirizzo valido per testnet4.').isVisible(), 'mainnet/invalid address refused');
  await f1.getByLabel('Indirizzo bitcoin del beneficiario').fill('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx');
  await f1.getByLabel('Importo in sats').fill('120000');
  await f1.getByRole('button', { name: 'Firma e pubblica' }).click();
  await f1.waitForURL(/#\/p\/[0-9a-f]{64}$/);
  const payoutId = f1.url().split('/p/')[1];
  check(await f1.getByText(/non ha ancora confermato/).isVisible(), 'payout waits for the recipient');
  await f1.getByRole('button', { name: 'Copia il link di conferma per il beneficiario' }).click();
  const link = await copied(f1);
  check(link.endsWith(`/#/confirm/${payoutId}`), 'confirmation link');
  await shot(f1, '01-payout');

  const rec = await phone(browser, 'recipient');
  await rec.page.goto(URL0 + `#/confirm/${payoutId}`);
  await rec.page.getByRole('button', { name: 'Confermo: è il mio indirizzo' }).click();
  await rec.page.getByText('Indirizzo confermato ✓').waitFor({ timeout: 15000 });
  await shot(rec.page, '02-confirm');
  await open(f1, `#/p/${payoutId}`);
  check(await f1.getByText('Confermato dal beneficiario ✓').waitFor({ timeout: 15000 }).then(() => true, () => false), 'recipient confirmed (no membership needed)');

  const f2 = F2.page;
  await open(f2, '#/new');
  await f2.getByLabel('Tipo di proposta').selectOption('change_rules');
  await f2.getByLabel('Titolo', { exact: true }).fill('Quorum alla metà');
  await f2.getByLabel('Testo vincolante').fill('Il quorum passa da un terzo a metà dei membri.');
  await f2.getByLabel('Regola').selectOption('quorum');
  await f2.getByLabel('Nuovo valore').fill('1/2');
  await f2.getByRole('button', { name: 'Firma e pubblica' }).click();
  await f2.waitForURL(/#\/p\/[0-9a-f]{64}$/);
  const rulesId = f2.url().split('/p/')[1];

  log('New member: candidate signs up, @marta sponsors, @anna checks in person');
  const N = await phone(browser, '@nina');
  const n = N.page;
  await n.goto(URL0 + '#/candidate');
  await n.getByRole('textbox').fill('@nina');
  await n.getByLabel(/Ho almeno 18 anni/).check();
  await n.getByRole('button', { name: 'Crea con impronta o volto' }).click();
  await n.getByRole('button', { name: 'Copia il codice' }).click();
  const ninaCode = await copied(n);
  await shot(n, '03-candidate-wait');
  await open(f2, '#/sponsor');
  await f2.getByRole('button', { name: 'Scansiona il codice del candidato' }).click();
  await paste(f2, ninaCode);
  await f2.getByText(/In attesa della verifica/).waitFor();
  await open(a, '#/council');
  await a.getByRole('button', { name: 'Verifica un candidato' }).first().click();
  await paste(a, ninaCode);
  await a.getByRole('button', { name: 'Firma la verifica' }).click();
  await a.getByText('Verifica firmata ✓ (@nina)').waitFor({ timeout: 15000 });
  await shot(a, '04-council-verify');
  await f2.getByText('Verificato dal Consiglio ✓').waitFor({ timeout: 30000 });
  await f2.getByRole('button', { name: 'Pubblica la proposta' }).click();
  await f2.waitForURL(/#\/p\/[0-9a-f]{64}$/);
  const addId = f2.url().split('/p/')[1];

  log('Voting');
  for (const p of [A, B, C, F1]) {
    await vote(p.page, payoutId, 'Sì');
    await vote(p.page, addId, 'Sì');
    await vote(p.page, rulesId, 'Sì');
  }
  await vote(f2, payoutId, 'No');
  await vote(f2, payoutId, 'Sì'); // changed
  await vote(f2, rulesId, 'Astenuto');
  await open(f2, `#/p/${payoutId}`);
  check(await f2.locator('.kv', { hasText: 'Sì' }).first().innerText().then(t => t.includes('5')), 'changed vote counted once: 5 yes');
  await shot(f2, '05-voting');
  check(!(await n.getByText('Sì', { exact: true }).isVisible()), 'candidate cannot vote');

  log('Waiting for the close (~2 min), then council phones count automatically');
  await new Promise(r => setTimeout(r, 135000));
  await open(a, '#/proposals');
  await a.getByRole('button', { name: 'Chiuse' }).click();
  await a.waitForTimeout(3000);
  await open(f1, `#/p/${payoutId}`);
  await f1.getByText('Approvata ✓').first().waitFor({ timeout: 30000 });
  check(true, 'payout passed after the automatic count');
  check(await f1.getByText(/Conteggio finale firmato da @anna/).isVisible(), 'count signed by a council member');
  await shot(f1, '06-passed');
  await open(f1, `#/p/${rulesId}`);
  check(await f1.getByText('Approvata ✓').first().waitFor({ timeout: 30000 }).then(() => true, () => false), 'rules change passed (two-thirds)');

  log('Council: member list version 2 (adds @nina), rules version 2');
  await councilAction(a, 'Pubblica la versione 2');
  await shot(a, '07-council-inbox');
  await councilAction(B.page, 'Approva la versione 2');
  await councilAction(C.page, 'Approva la versione 2');
  await councilAction(a, 'Pubblica la versione 2 delle regole');
  await councilAction(B.page, 'Approva la versione 2 delle regole');
  await councilAction(C.page, 'Approva la versione 2 delle regole');
  await open(f1, '#/rules');
  check(await seen(f1.getByText('1/2 dei membri')), 'quorum is now 1/2');

  log('@nina protects her key and is a member');
  await open(n, '#/candidate');
  await n.getByRole('button', { name: 'Proteggi la chiave e continua' }).click({ timeout: 20000 });
  await n.getByText('Sei membro di UNO ✓').waitFor({ timeout: 20000 });
  await shot(n, '08-member');
  await open(f1, '#/members');
  check(await seen(f1.getByText('6 membri · 3 nel Consiglio')), '6 members');

  log('@marta leaves; the next list drops her');
  await open(f2, '#/profile');
  await f2.getByRole('button', { name: 'Lascia la DAO' }).click();
  await f2.getByText('Hai lasciato UNO.').waitFor({ timeout: 15000 });
  await councilAction(a, 'Pubblica la versione 3');
  await councilAction(B.page, 'Approva la versione 3');
  await councilAction(C.page, 'Approva la versione 3');
  await open(f1, '#/members');
  check(await seen(f1.getByText('5 membri · 3 nel Consiglio')), '@marta is off the list');

  log('@elena loses everything; the council replaces her key');
  const E2 = await phone(browser, '@elena-new');
  const e2 = E2.page;
  await e2.goto(URL0 + '#/lost');
  await e2.getByRole('textbox').fill('@elena');
  await e2.getByRole('button', { name: 'Crea con impronta o volto' }).click();
  await e2.getByRole('button', { name: 'Copia il codice' }).click();
  const newCode = await copied(e2);
  await open(a, '#/council');
  await a.getByRole('button', { name: 'Sostituisci la chiave di un membro' }).first().click();
  await paste(a, newCode);
  await a.getByLabel('Di chi è la nuova chiave?').selectOption({ label: '@elena' });
  await a.getByRole('button', { name: 'Firma la sostituzione' }).click();
  await a.getByText(/Sostituzione firmata ✓/).waitFor({ timeout: 15000 });
  for (const p of [B, C]) {
    await open(p.page, '#/council');
    const ap = p.page.getByRole('button', { name: 'Approva', exact: true });
    await ap.click();
    await ap.waitFor({ state: 'detached', timeout: 15000 });
  }
  await councilAction(a, 'Pubblica la versione 4');
  await councilAction(B.page, 'Approva la versione 4');
  await councilAction(C.page, 'Approva la versione 4');
  await open(e2, '#/lost');
  await e2.getByRole('button', { name: 'Proteggi la chiave e continua' }).click({ timeout: 20000 });
  await e2.getByText('La tua nuova chiave è nell\'elenco ✓').waitFor({ timeout: 20000 });
  await open(e2, '#/members');
  check(await seen(e2.getByText('@elena (tu)')), 'new phone is @elena');
  await open(e2, `#/p/${payoutId}`);
  check(await seen(e2.getByText('Approvata ✓')), 'history intact on the new key');
  await shot(e2, '09-new-key');

  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch(async e => {
  console.error(e);
  for (const { page, label } of ALL) {
    try {
      await page.screenshot({ path: `${SHOTS}/fail-${label.replace(/[^a-z0-9-]/gi, '')}.png`, fullPage: true });
      console.log(`--- ${label}:`, (await page.locator('main').innerText()).slice(0, 600).replace(/\n+/g, ' | '));
    } catch {}
  }
  process.exit(1);
});
