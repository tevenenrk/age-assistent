// Test trybu LIVE na udawanym serwerze WebSocket (sprawdza logikę aplikacji, nie prawdziwe API Google).
// Uruchomienie: node tests/live-mock.js
const { chromium } = require('playwright');
const path = require('path');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let failures = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✘ ') + msg); if (!cond) failures++; };

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('aa.settings', JSON.stringify({ apiKey: 'TEST', useMic: false, tts: false, listenSec: 3, convListenSec: 3 }));

    // Udawany serwer Gemini Live
    window.__sent = [];
    class FakeWS {
      constructor(url) {
        window.__wsUrl = url;
        this.readyState = 0;
        setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 20);
      }
      deliver(obj) { setTimeout(() => this.onmessage && this.onmessage({ data: new Blob([JSON.stringify(obj)]) }), 20); }
      send(d) {
        const m = JSON.parse(d);
        window.__sent.push(m);
        if (m.setup) this.deliver({ setupComplete: {} });
        if (m.clientContent && !this.greeted) {
          this.greeted = true;
          const pcm = btoa(String.fromCharCode(...new Uint8Array(4800))); // 0,1 s ciszy, 24 kHz
          this.deliver({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: pcm } }] } } });
          this.deliver({ serverContent: { outputTranscription: { text: 'Cześć Haniu, o czym ' } } });
          this.deliver({ serverContent: { outputTranscription: { text: 'porozmawiamy?' } } });
          this.deliver({ serverContent: { turnComplete: true } });
          setTimeout(() => {
            this.deliver({ serverContent: { inputTranscription: { text: 'Źle się czuję.' } } });
            this.deliver({ toolCall: { functionCalls: [{ id: 'c1', name: 'powiadom_opiekuna', args: { wiadomosc: 'Senior źle się czuje' } }] } });
          }, 300);
        }
        if (m.toolResponse && !this.done) {
          this.done = true;
          this.deliver({ serverContent: { outputTranscription: { text: 'Dałam znać Ani.' } } });
          this.deliver({ serverContent: { turnComplete: true } });
          setTimeout(() => {
            this.deliver({ serverContent: { inputTranscription: { text: 'Dobrze, koniec rozmowy.' } } });
            this.deliver({ serverContent: { outputTranscription: { text: 'Do usłyszenia!' } } });
            this.deliver({ serverContent: { turnComplete: true } });
          }, 300);
        }
      }
      close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose && this.onclose({ code: 1000, reason: '' }); }
    }
    FakeWS.OPEN = 1;
    window.WebSocket = FakeWS;
  });

  await page.goto(URL);
  console.log('LIVE: hasło -> połączenie -> rozmowa -> narzędzie -> „koniec rozmowy”');
  await page.click('#btnTalk');
  await page.waitForFunction(() => document.querySelector('#lamp').dataset.state === 'listening');
  await page.fill('#sayInput', 'pogadajmy szybko');
  await page.press('#sayInput', 'Enter');
  await page.waitForFunction(() => document.querySelector('#lamp').dataset.state === 'live', null, { timeout: 5000 });
  ok(true, 'lampka w trybie LIVE');
  await page.waitForFunction(() => !AA._debug.isBusy(), null, { timeout: 15000 });

  const sent = await page.evaluate(() => window.__sent);
  const setup = sent.find((m) => m.setup);
  ok(setup && setup.setup.model.startsWith('models/'), 'wysłano konfigurację z modelem');
  ok(setup && setup.setup.tools[0].functionDeclarations.length >= 4, 'konfiguracja zawiera narzędzia');
  ok(sent.some((m) => m.realtimeInput && m.realtimeInput.audio), 'mikrofon wysyła dźwięk PCM');
  ok(sent.some((m) => m.toolResponse && m.toolResponse.functionResponses[0].id === 'c1'), 'odpowiedź na wywołanie narzędzia');
  const chatText = await page.evaluate(() => document.querySelector('#chat').innerText);
  ok(/Cześć Haniu, o czym porozmawiamy\?/.test(chatText), 'transkrypcja asystenta w czacie');
  ok(/Źle się czuję/.test(chatText), 'transkrypcja seniora w czacie');
  ok((await page.locator('#notifList li:not(.empty)').count()) === 1, 'powiadomiono opiekuna');
  ok(/Koniec trybu LIVE/.test(chatText), 'sesja zakończona po haśle końca');
  ok((await page.getAttribute('#lamp', 'data-state')) === 'off', 'lampka zgasła');
  ok(errors.length === 0, 'brak błędów JavaScript' + (errors.length ? ': ' + errors.join(' | ') : ''));

  await browser.close();
  console.log(failures ? `\n${failures} błędów` : '\nWszystko OK');
  process.exit(failures ? 1 : 0);
})();
