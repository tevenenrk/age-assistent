// Test zwykłego trybu AI z udawanymi odpowiedziami w formacie Gemini API (bez prawdziwego klucza).
// Uruchomienie: node tests/ai-mock.js
const { chromium } = require('playwright');
const path = require('path');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let failures = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✘ ') + msg); if (!cond) failures++; };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const requests = [];

  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    requests.push(body);
    const last = body.contents[body.contents.length - 1];
    let content;
    if (last.parts[0].functionResponse) {
      content = { role: 'model', parts: [{ text: 'Świetnie, zapisałam. Dziękuję!' }] };
    } else {
      content = { role: 'model', parts: [{ functionCall: { name: 'potwierdz_przypomnienie', args: { id: 'leki' } }, thoughtSignature: 'sig' }] };
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ candidates: [{ content, finishReason: 'STOP' }] }) });
  });

  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('aa.settings', JSON.stringify({ apiKey: 'TEST', useMic: false, tts: false, listenSec: 3, convListenSec: 2 }));
    localStorage.setItem('aa.reminders', JSON.stringify([{ id: 'leki', title: 'Leki', time: '08:00', text: '{imie}, czas na leki. Wzięłaś już?', retryMin: 15, maxAttempts: 3, requirePresence: true, status: 'idle', attempts: 0 }]));
  });
  await page.goto(URL);

  console.log('Niejasna odpowiedź -> Gemini woła potwierdz_przypomnienie -> odpowiedź tekstowa');
  await page.click('.rem[data-id="leki"] button[data-act="due"]');
  await page.click('#btnMotion');
  await page.waitForFunction(() => document.querySelector('#lamp').dataset.state === 'listening');
  await page.fill('#sayInput', 'chyba wzięłam tę białą');
  await page.press('#sayInput', 'Enter');
  await page.waitForFunction(() => !AA._debug.isBusy(), null, { timeout: 15000 });

  ok(requests.length === 2, `2 zapytania do API (jest ${requests.length})`);
  const r0 = requests[0];
  ok(/Haniu/.test(r0.systemInstruction.parts[0].text) && /AKTYWNE PRZYPOMNIENIE: id=leki/.test(r0.systemInstruction.parts[0].text), 'instrukcja zawiera profil i aktywne przypomnienie');
  ok(r0.tools[0].functionDeclarations.some((f) => f.name === 'potwierdz_przypomnienie'), 'zapytanie zawiera narzędzia');
  const r1 = requests[1];
  ok(r1.contents[1].parts[0].thoughtSignature === 'sig', 'podpis „myśli” modelu odesłany bez zmian');
  ok(r1.contents[2].parts[0].functionResponse.name === 'potwierdz_przypomnienie', 'wynik narzędzia odesłany do modelu');
  ok(await page.evaluate(() => AA.reminders[0].status === 'done'), 'przypomnienie oznaczone jako wykonane');
  ok(/Świetnie, zapisałam/.test(await page.evaluate(() => document.querySelector('#chat').innerText)), 'odpowiedź AI w czacie');
  ok(await page.evaluate(() => AA.callsToday() === 2), 'licznik zapytań AI = 2');
  ok(errors.length === 0, 'brak błędów JavaScript' + (errors.length ? ': ' + errors.join(' | ') : ''));

  await browser.close();
  console.log(failures ? `\n${failures} błędów` : '\nWszystko OK');
  process.exit(failures ? 1 : 0);
})();
