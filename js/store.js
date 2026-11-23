// Ustawienia, przypomnienia i licznik zapytań – zapisywane w localStorage tej przeglądarki.
(function (AA) {
  const DEFAULTS = {
    // AI
    apiKey: '',
    textModel: 'gemini-flash-latest',
    liveModel: 'gemini-2.5-flash-native-audio-preview-09-2025',
    liveVoice: 'Kore',
    halfDuplex: true,
    liveMaxMin: 10,

    // Osoba
    assistantName: 'Zosia',
    seniorAddress: 'Haniu',
    profile:
      'Imię: Hanna, 81 lat, mieszka sama w Poznaniu.\n' +
      'Córka: Anna, mieszka w Krakowie, dzwoni zwykle wieczorem.\n' +
      'Wnuk: Kuba, 12 lat, lubi piłkę nożną.\n' +
      'Leki: rano jedna biała tabletka na ciśnienie – pudełko na lodówce w kuchni.\n' +
      'Lubi: ogród, krzyżówki, radio, piosenki Anny German.\n' +
      'Pies: Burek.',
    caregiver: 'Anna (córka)',

    // Zagadywanie bez AI
    greetings:
      'Dzień dobry, {imie}! Jak się dzisiaj czujesz?\n' +
      'O, {imie}, miło cię widzieć. Co słychać?\n' +
      'Cześć, {imie}! Wszystko w porządku?',
    randomTopics:
      '{imie}, może napijesz się szklanki wody?\n' +
      '{imie}, jaka jest dziś pogoda za oknem?\n' +
      '{imie}, co dobrego jadłaś dzisiaj?\n' +
      '{imie}, może zrobimy razem krótką krzyżówkę?\n' +
      '{imie}, jak się miewa Burek?',
    greetCooldownMin: 0,

    // Mowa
    useMic: true,
    tts: true,
    voiceURI: '',
    ttsRate: 0.95,
    listenSec: 8,
    convListenSec: 12,
    liveKeyword: 'pogadajmy szybko',
    endKeyword: 'koniec rozmowy',

    // Przypomnienia, kamera, opiekun
    testSeconds: true,
    cameraAllowed: true,
    telegramToken: '',
    telegramChat: '',
  };

  function defaultReminders() {
    return [
      { title: 'Leki poranne', time: '08:00', text: '{imie}, czas na poranne leki. To ta biała tabletka z pudełka na lodówce. Wzięłaś już?', retryMin: 15, maxAttempts: 4, requirePresence: true },
      { title: 'Picie wody', time: '11:00', text: '{imie}, pora napić się wody. Wypiłaś już szklankę?', retryMin: 30, maxAttempts: 2, requirePresence: true },
      { title: 'Obiad', time: '13:30', text: '{imie}, zbliża się pora obiadu. Zjadłaś już coś?', retryMin: 20, maxAttempts: 3, requirePresence: true },
    ].map(newReminder);
  }

  function newReminder(r) {
    return Object.assign(
      { id: AA.uid(), status: 'idle', attempts: 0, nextAt: null, armedDate: null, doneAt: null },
      r
    );
  }

  function load(key, def) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch (e) {
      return def;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* tryb prywatny / zablokowane dane – działamy bez zapisu */
    }
  }

  AA.defaults = DEFAULTS;
  AA.settings = Object.assign({}, DEFAULTS, load('aa.settings', {}));
  AA.saveSettings = () => save('aa.settings', AA.settings);
  AA.resetSettings = () => {
    const key = AA.settings.apiKey; // klucza nie kasujemy przy resecie
    AA.settings = Object.assign({}, DEFAULTS, { apiKey: key });
    AA.saveSettings();
  };

  AA.newReminder = newReminder;
  AA.reminders = load('aa.reminders', null) || defaultReminders();
  AA.saveReminders = () => save('aa.reminders', AA.reminders);

  // Licznik zapytań do AI (dzienny) – żeby było widać, ile to kosztuje.
  AA.stats = load('aa.stats', { date: '', calls: 0 });
  AA.countCall = () => {
    const today = AA.todayStr();
    if (AA.stats.date !== today) AA.stats = { date: today, calls: 0 };
    AA.stats.calls++;
    save('aa.stats', AA.stats);
    if (AA.onStats) AA.onStats();
  };
  AA.callsToday = () => (AA.stats.date === AA.todayStr() ? AA.stats.calls : 0);
})(window.AA);
