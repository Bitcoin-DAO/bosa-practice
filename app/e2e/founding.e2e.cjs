// End-to-end: founding meeting with 5 council phones and 2 founders, then treasury, card print, restore, sign-in.
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const jsQR = require('jsqr');
const fs = require('fs');

const URL0 = 'http://localhost:4173/';
const SHOTS = __dirname + '/out/shots';
fs.mkdirSync(SHOTS, { recursive: true });
fs.writeFileSync(__dirname + '/out/funded.json', '{}');
const log = (...a) => console.log('•', ...a);
let failures = 0;
const check = (cond, what) => {
  console.log(cond ? '  ✓' : '  ✗', what);
  if (!cond) failures++;
};

async function phone(browser, label) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'it-IT', permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true },
  });
  page.on('pageerror', e => console.log(`  [${label}] pageerror`, e.message));
  page.on('console', m => m.type() === 'error' && !/WebSocket|ERR_CONNECTION/.test(m.text()) && console.log(`  [${label}] console`, m.text()));
  return { ctx, page, label };
}

async function signUp(p, name, council) {
  const { page } = p;
  await page.goto(URL0 + '#/founder');
  await page.getByText('Iscrizione dei fondatori').first().waitFor();
  await page.getByRole('textbox').fill(name);
  if (council) await page.getByLabel('Chiedo un posto nel Consiglio').check();
  await page.getByLabel(/Ho almeno 18 anni/).check();
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByRole('button', { name: 'Crea con impronta o volto' }).click();
  await page.getByText('Condividi il tuo codice').waitFor();
  await page.getByRole('button', { name: 'Copia il codice' }).click();
  const code = await page.evaluate(() => navigator.clipboard.readText());
  const short = await page.locator('.code').innerText();
  return { code, short };
}

async function addViaPaste(page, buttonName, code, remote = false) {
  await page.getByRole('button', { name: buttonName }).click();
  await page.getByText('La fotocamera non è disponibile').waitFor();
  await page.locator('.scanner textarea').fill(code);
  await page.getByRole('button', { name: 'Usa', exact: true }).click();
  try { await page.getByText('Leggete il codice breve').waitFor({ timeout: 8000 }); }
  catch (e) { await page.screenshot({ path: SHOTS + '/fail-addViaPaste.png', fullPage: true }); console.log(await page.locator('main').innerText()); throw e; }
  if (remote) await page.getByLabel('Iscrizione in videochiamata').check();
  await page.getByRole('button', { name: 'Coincide: aggiungi' }).click();
}

async function decodeQrIn(page, selector) {
  const png = PNG.sync.read(await page.locator(selector).screenshot());
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
}

(async () => {
  const browser = await chromium.launch();
  const council = [];
  for (const n of ['@anna', '@marco', '@luca', '@sara', '@pietro']) council.push({ ...(await phone(browser, n)), name: n });
  const founders = [];
  for (const n of ['@elena', '@marta']) founders.push({ ...(await phone(browser, n)), name: n });

  log('Not founded yet: home shows founding mode');
  await council[0].page.goto(URL0);
  await council[0].page.getByText('Modalità fondazione.').waitFor();
  await council[0].page.screenshot({ path: `${SHOTS}/01-home-prefounding.png`, fullPage: true });
  check(true, 'founding mode shown');

  log('Founder sign-up on every phone');
  for (const c of council) Object.assign(c, await signUp(c, c.name, true));
  for (const f of founders) Object.assign(f, await signUp(f, f.name, false));
  await council[0].page.screenshot({ path: `${SHOTS}/02-founder-code.png`, fullPage: true });
  check(JSON.parse(council[1].code).council?.xpub?.startsWith('tpub'), 'council code carries a tpub');
  check(!JSON.parse(founders[0].code).council, 'founder code has no treasury key');

  log('Setup on @anna\'s phone');
  const s = council[0].page;
  await s.goto(URL0 + '#/setup');
  await s.getByText('Le basi').waitFor();
  await s.screenshot({ path: `${SHOTS}/03-setup-basics.png`, fullPage: true });
  await s.getByRole('button', { name: 'Avanti: il Consiglio' }).click();
  for (const c of council.slice(1)) await addViaPaste(s, 'Scansiona un membro del Consiglio', c.code);
  // a founder's code is refused as council
  await s.getByRole('button', { name: 'Scansiona un membro del Consiglio' }).click();
  await s.getByText('La fotocamera non è disponibile').waitFor();
  await s.locator('.scanner textarea').fill(founders[0].code);
  await s.getByRole('button', { name: 'Usa', exact: true }).click();
  check(await s.getByText('Questo codice non è di un membro del Consiglio.').isVisible(), 'founder code refused as council');
  // duplicate refused
  await s.getByRole('button', { name: 'Scansiona un membro del Consiglio' }).click();
  await s.getByText('La fotocamera non è disponibile').waitFor();
  await s.locator('.scanner textarea').fill(council[2].code);
  await s.getByRole('button', { name: 'Usa', exact: true }).click();
  check(await s.getByText('Questa chiave è già nell\'elenco.').isVisible(), 'duplicate refused');
  await s.screenshot({ path: `${SHOTS}/04-setup-council.png`, fullPage: true });
  check((await s.locator('.card.list > div').count()) === 5, 'five council members listed');
  await s.getByRole('tab', { name: '3 · Fondatori' }).click().catch(() => s.getByRole('button', { name: '3 · Fondatori' }).click());
  await addViaPaste(s, 'Scansiona un fondatore', founders[0].code);
  await addViaPaste(s, 'Scansiona un fondatore', founders[1].code, true);
  await s.screenshot({ path: `${SHOTS}/05-setup-founders.png`, fullPage: true });
  await s.getByRole('button', { name: 'Avanti: pubblica' }).click();
  await s.screenshot({ path: `${SHOTS}/06-setup-publish.png`, fullPage: true });
  await s.getByRole('button', { name: 'Firma e pubblica' }).click();
  await s.getByText('Pubblicate ✓').waitFor({ timeout: 20000 });
  check(await s.getByText('Approvazioni del Consiglio: 1 di 3').isVisible(), 'publisher endorsed: 1 of 3');

  log('Founders see the published settings; two more council members approve');
  for (const p of [...council.slice(1), ...founders]) await p.page.reload();
  const f0 = founders[0].page;
  await f0.getByText('Ci sei ✓').waitFor({ timeout: 15000 });
  check(true, 'founder sees they are listed');
  check(!(await f0.getByRole('button', { name: 'Approva e firma' }).isVisible()), 'ordinary founder cannot approve');
  await council[1].page.getByRole('button', { name: 'Approva e firma' }).click();
  await council[1].page.getByText('Hai approvato ✓').waitFor({ timeout: 15000 });
  await council[1].page.screenshot({ path: `${SHOTS}/07-council-approve.png`, fullPage: true });
  await council[2].page.reload();
  await council[2].page.getByRole('button', { name: 'Approva e firma' }).click();

  log('Founded: everyone protects their key with the passkey');
  for (const p of [...council, ...founders]) {
    await p.page.goto(URL0 + '#/founder');
    await p.page.reload();
    await p.page.getByRole('button', { name: 'Proteggi la chiave e continua' }).click({ timeout: 20000 });
    await p.page.getByText('Stampa la tua tessera d\'identità').waitFor({ timeout: 20000 });
  }
  check(true, 'all 7 founders protected their keys');
  await f0.screenshot({ path: `${SHOTS}/08-founded-card.png`, fullPage: true });

  log('Identity card prints and its QR decodes');
  await f0.emulateMedia({ media: 'print' });
  const card = await decodeQrIn(f0, '.idcard');
  fs.writeFileSync(__dirname + '/out/card.txt', card ?? '');
  await f0.locator('.idcard').screenshot({ path: `${SHOTS}/09-identity-card.png` });
  await f0.emulateMedia({ media: 'screen' });
  check(/^BTCDAO:1:[0-9A-F]{8}:[0-9A-F]{64}$/.test(card ?? ''), 'card QR decodes to BTCDAO:1:…');

  log('Treasury page');
  await f0.goto(URL0);
  await f0.getByText('Saldo della tesoreria').waitFor();
  await f0.locator('.addr').waitFor({ timeout: 30000 });
  const addr0 = (await f0.locator('.addr').innerText()).replace(/\s+/g, '');
  check(/^tb1q[0-9a-z]{58}$/.test(addr0), `donation address ${addr0.slice(0, 12)}…`);
  check(await f0.getByText('Servono 3 firme su 5').isVisible(), '3 of 5 shown');
  const qrAddr = await decodeQrIn(f0, '.qr-wrap svg');
  check(qrAddr === `bitcoin:${addr0}`, 'donation QR matches the address');
  fs.writeFileSync(__dirname + '/out/funded.json', JSON.stringify({ [addr0]: { value: 50000, txid: 'ab'.repeat(32) } }));
  await f0.reload();
  await f0.locator('.balance').filter({ hasText: '50.000' }).waitFor({ timeout: 30000 });
  const addr1 = (await f0.locator('.addr').innerText()).replace(/\s+/g, '');
  check(addr1 !== addr0, 'donation address moved on after a payment');
  check(await f0.getByText('+50.000').isVisible(), 'movement listed');
  await f0.screenshot({ path: `${SHOTS}/10-home-treasury.png`, fullPage: true });
  await f0.goto(URL0 + '#/members');
  await f0.getByText('7 membri · 5 nel Consiglio').waitFor();
  await f0.screenshot({ path: `${SHOTS}/11-members.png`, fullPage: true });
  check(await f0.getByText('a distanza').first().isVisible(), 'remote founder marked');
  await f0.goto(URL0 + '#/rules');
  check(await f0.getByText('Il testo corrisponde a quello approvato ✓').isVisible(), 'charter hash matches');
  await f0.screenshot({ path: `${SHOTS}/12-rules.png`, fullPage: true });

  log('Sign out and back in with the passkey (keywrap from the relay)');
  await f0.goto(URL0 + '#/profile');
  await f0.getByRole('button', { name: 'Esci da questo telefono' }).click();
  await f0.goto(URL0 + '#/join');
  await f0.getByRole('button', { name: 'Sono già membro: accedi' }).click();
  await f0.locator('.btn-head.solid', { hasText: '@elena' }).waitFor({ timeout: 15000 });
  check(true, 'signed in again as @elena');

  log('New phone: restore from the identity card');
  const fresh = await phone(browser, 'new-phone');
  const np = fresh.page;
  await np.goto(URL0 + '#/restore');
  await np.getByRole('button', { name: 'Scansiona la tessera' }).click();
  await np.getByText('La fotocamera non è disponibile').waitFor();
  await np.locator('.scanner textarea').fill(card.toLowerCase().replace(/(.{16})/g, '$1\n'));
  await np.getByRole('button', { name: 'Usa', exact: true }).click();
  await np.getByText('Sei tu?').waitFor();
  check(await np.getByText('@elena').first().isVisible(), 'card shows @elena');
  await np.screenshot({ path: `${SHOTS}/13-restore-who.png`, fullPage: true });
  await np.getByRole('button', { name: 'Sì, sono io' }).click();
  await np.getByRole('button', { name: 'Crea con impronta o volto' }).click();
  await np.getByText('Bentornato, @elena ✓').waitFor({ timeout: 15000 });
  await np.goto(URL0 + '#/profile');
  await np.getByRole('button', { name: 'Esci da questo telefono' }).click();
  await np.goto(URL0 + '#/join');
  await np.getByRole('button', { name: 'Sono già membro: accedi' }).click();
  await np.locator('.btn-head.solid', { hasText: '@elena' }).waitFor({ timeout: 15000 });
  check(true, 'new phone signs in with its new passkey');

  log('A card from another DAO is refused');
  await np.goto(URL0 + '#/restore');
  await np.getByRole('button', { name: 'Scansiona la tessera' }).click();
  await np.getByText('La fotocamera non è disponibile').waitFor();
  await np.locator('.scanner textarea').fill('BTCDAO:1:00000000:' + card.split(':')[3]);
  await np.getByRole('button', { name: 'Usa', exact: true }).click();
  check(await np.getByText('Questa tessera è di un\'altra DAO.').isVisible(), 'other-DAO card refused');

  log('Council profile shows the trial treasury key; English switch works');
  const c0 = council[0].page;
  await c0.goto(URL0 + '#/profile');
  check(await c0.getByText('La tua chiave della tesoreria (prova)').isVisible(), 'council treasury key shown');
  await c0.getByRole('button', { name: /Lingua/ }).click();
  check(await c0.getByText('Your treasury key (trial)').isVisible(), 'English UI');
  await c0.screenshot({ path: `${SHOTS}/14-profile-en.png`, fullPage: true });

  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
