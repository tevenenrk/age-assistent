// Test dymny całej aplikacji w trybie demo (bez klucza API, bez mikrofonu i głosu).
// Uruchomienie: node tests/smoke.js   (wymaga pakietu playwright z przeglądarką Chromium)
const { chromium } = require('playwright');
const path = require('path');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let failures = 0;
const ok = (cond, msg) => {
  console.log((cond ? '  ✔ ' : '  ✘ ') + msg);
  if (!cond) failures++;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('aa.settings', JSON.stringify({ useMic: false, tts: false, testSeconds: true, listenSec: 3, convListenSec: 3 }));
    const base = { status: 'idle', attempts: 0, nextAt: null, armedDate: null, doneAt: null, requirePresence: true };
    localStorage.setItem('aa.reminders', JSON.stringify([
      Object.assign({}, base, { id: 'leki', title: 'Leki', time: '08:00', text: '{imie}, czas na leki. Wzięłaś już?', retryMin: 2, maxAttempts: 3 }),
      Object.assign({}, base, { id: 'woda', title: 'Woda', time: '11:00', text: '{imie}, wypij wodę.', retryMin: 2, maxAttempts: 2 }),
    ]));
  });
  await page.goto(URL);

  const lamp = () => page.getAttribute('#lamp', 'data-state');
  const lastMsg = (cls) => page.locator(`#chat .msg.${cls} .text`).last().textContent();
  const waitLamp = (state, timeout = 8000) => page.waitForFunction((s) => document.querySelector('#lamp').dataset.state === s, state, { timeout });
  const say = async (t) => { await page.fill('#sayInput', t); await page.press('#sayInput', 'Enter'); };
  const status = (id) => page.evaluate((i) => AA.reminders.find((r) => r.id === i).status, id);
  const idle = () => page.waitForFunction(() => !AA._debug.isBusy(), null, { timeout: 15000 });

  console.log('1. Ruch -> zagadanie bez AI -> odpowiedź -> rozmowa z AI (demo)');
  await page.click('#btnMotion');
  await waitLamp('listening');
  ok(/Haniu/.test(await page.locator('#chat .msg.assistant .text').last().textContent()), 'powitanie ze skryptu z imieniem');
  ok((await lamp()) === 'listening', 'lampka świeci podczas nasłuchiwania');
  await say('Dobrze, dziękuję');
  await waitLamp('listening');
  ok((await page.locator('#chat .msg.assistant .tag.demo').count()) >= 1, 'odpowiedź AI w trybie demo');
  await say('do widzenia');
  await idle();
  ok(/do usłyszenia/i.test(await lastMsg('assistant')), 'AI zakończyło rozmowę narzędziem zakoncz_rozmowe');
  ok((await lamp()) === 'off', 'lampka zgasła po rozmowie');

  console.log('2. Przypomnienie: Jest czas -> czeka na obecność -> dźwięki -> „tak” -> wykonane');
  await page.click('.rem[data-id="leki"] button[data-act="due"]');
  await page.waitForTimeout(1500);
  ok((await status('leki')) === 'due', 'po „Jest czas” czeka na obecność (nie mówi sam)');
  await page.click('#btnSound');
  await waitLamp('listening');
  ok(/czas na leki/.test(await lastMsg('assistant')), 'odczytano treść przypomnienia');
  await say('tak, już wzięłam');
  await idle();
  ok((await status('leki')) === 'done', 'przypomnienie wykonane (rozpoznane lokalnie, bez AI)');

  console.log('3. Przypomnienie bez odpowiedzi -> ponowienie -> powiadomienie opiekuna');
  await page.click('.rem[data-id="woda"] button[data-act="due"]');
  await page.click('#btnMotion');
  await waitLamp('listening');
  await page.waitForFunction(() => AA.reminders.find((r) => r.id === 'woda').status === 'waiting_retry', null, { timeout: 10000 });
  ok(true, 'brak odpowiedzi -> czeka na ponowienie');
  await page.waitForFunction(() => AA.reminders.find((r) => r.id === 'woda').status === 'escalated', null, { timeout: 20000 });
  ok(true, 'po 2 próbach -> eskalacja');
  ok((await page.locator('#notifList li:not(.empty)').count()) === 1, 'powiadomienie opiekuna w dzienniku');
  await idle();

  console.log('4. Niejasna odpowiedź na przypomnienie -> AI (demo) odkłada przypomnienie');
  await page.click('.rem[data-id="leki"] button[data-act="reset"]');
  await page.click('.rem[data-id="leki"] button[data-act="due"]');
  await page.click('#btnMotion');
  await waitLamp('listening');
  await say('nie wiem, jakie leki?');
  await page.waitForFunction(() => AA.reminders.find((r) => r.id === 'leki').status === 'waiting_retry', null, { timeout: 10000 });
  ok(true, 'AI wywołało odloz_przypomnienie');
  await page.evaluate(() => AA._debug.stopAll());
  await page.click('.rem[data-id="leki"] button[data-act="reset"]');
  await idle();

  console.log('5. Hasło „pogadajmy szybko” bez klucza -> komunikat i dalej zwykły tryb');
  await page.click('#btnTalk');
  await waitLamp('listening');
  await say('pogadajmy szybko');
  await waitLamp('listening');
  ok(/wymaga klucza/.test(await lastMsg('system')), 'informacja, że LIVE wymaga klucza');
  await page.evaluate(() => AA._debug.stopAll());
  await idle();

  console.log('6. Losowy event bez AI -> temat z listy');
  await page.click('#btnRandom');
  await waitLamp('listening');
  ok(/Haniu/.test(await lastMsg('assistant')), 'asystent sam zagadał');
  await page.evaluate(() => AA._debug.stopAll());

  console.log('7. Dodanie przypomnienia z formularza');
  await page.click('.tabs button[data-tab="rem"]');
  await page.click('.add-rem summary');
  await page.fill('#remForm input[name="title"]', 'Spacer');
  await page.click('#remForm button[type="submit"]');
  ok((await page.locator('.rem').count()) === 3, 'nowe przypomnienie na liście');

  console.log('8. Rozpoznawanie odpowiedzi lokalnie');
  const cls = await page.evaluate(() => ['tak', 'już wzięłam', 'jeszcze nie', 'zaraz', 'nie wiem', 'chyba tak', 'tak, ale jeszcze nie'].map((t) => AA.classifyAnswer(t)));
  ok(JSON.stringify(cls) === JSON.stringify(['yes', 'yes', 'no', 'no', 'unclear', 'unclear', 'unclear']), 'klasyfikacja: ' + cls.join(', '));
  ok(await page.evaluate(() => AA.containsPhrase('No to pogadajmy szybko!', 'pogadajmy szybko')), 'wykrycie hasła LIVE');

  ok(errors.length === 0, 'brak błędów JavaScript' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: process.env.SHOT || path.join(__dirname, 'screenshot.png') });
  await browser.close();
  console.log(failures ? `\n${failures} błędów` : '\nWszystko OK');
  process.exit(failures ? 1 : 0);
})();
