// Mowa: lampka, czytanie na głos (speechSynthesis) i nasłuchiwanie (Web Speech API).
// Oba mechanizmy są wbudowane w Chrome/Edge i nic nie kosztują.
(function (AA) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  AA.sttSupported = !!SR;

  const MODE_LABELS = {
    off: 'Nie słucham',
    listening: 'Słucham…',
    speaking: 'Mówię…',
    thinking: 'Myślę…',
    live: 'LIVE – rozmowa na żywo',
  };

  AA.mode = 'off';
  AA.setMode = function (mode, label) {
    AA.mode = mode;
    const lamp = AA.$('#lamp');
    if (lamp) lamp.dataset.state = mode;
    const l = AA.$('#lampLabel');
    if (l) l.textContent = label || MODE_LABELS[mode] || mode;
    const chip = AA.$('#chipMode');
    if (chip) chip.textContent = 'Stan: ' + (mode === 'off' ? 'czuwanie' : (MODE_LABELS[mode] || mode).replace('…', ''));
  };

  AA.showInterim = function (text) {
    const el = AA.$('#interim');
    if (el) el.textContent = text ? `„${text}”` : '';
  };

  // ---------- czytanie na głos ----------
  let voices = [];
  function loadVoices() {
    if (!window.speechSynthesis) return;
    voices = speechSynthesis.getVoices();
    if (AA.onVoices) AA.onVoices(voices);
  }
  if (window.speechSynthesis) {
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
  }
  AA.getVoices = () => voices;

  function pickVoice() {
    const s = AA.settings;
    return (
      voices.find((v) => v.voiceURI === s.voiceURI) ||
      voices.find((v) => /^pl/i.test(v.lang) && /natural|online|google/i.test(v.name)) ||
      voices.find((v) => /^pl/i.test(v.lang)) ||
      null
    );
  }

  AA.speak = function (text) {
    return new Promise((resolve) => {
      const s = AA.settings;
      AA.setMode('speaking');
      const rate = Number(s.ttsRate) || 1;
      const est = Math.max(900, (text.length * 75) / rate);
      let done = false, timer = null;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        AA._speakCancel = null;
        resolve();
      };
      AA._speakCancel = () => {
        try { speechSynthesis.cancel(); } catch (e) { /* brak syntezy */ }
        finish();
      };

      if (!s.tts || !window.speechSynthesis) {
        // Bez głosu: krótka pauza, żeby dało się przeczytać dymek.
        timer = setTimeout(finish, Math.min(est, 300 + text.length * 12));
        return;
      }

      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'pl-PL';
      const v = pickVoice();
      if (v) u.voice = v;
      u.rate = rate;
      u.onend = finish;
      u.onerror = finish;
      AA._utterance = u; // trzymamy referencję – inaczej Chrome potrafi zgubić zdarzenie onend
      timer = setTimeout(finish, est * 2 + 4000); // zabezpieczenie, gdyby onend nie przyszło
      if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
      speechSynthesis.speak(u);
    });
  };

  // ---------- nasłuchiwanie ----------
  // Zwraca rozpoznany tekst albo null, gdy w ciągu timeoutSec nikt nic nie powie.
  // Tekst wpisany w polu „Wypowiedź seniora” też kończy nasłuchiwanie (AA.typedInput).
  AA.listen = function (timeoutSec) {
    return new Promise((resolve) => {
      const s = AA.settings;
      AA.setMode('listening');
      AA.showInterim('');
      let done = false, rec = null;
      let deadline = Date.now() + timeoutSec * 1000;

      const finish = (text) => {
        if (done) return;
        done = true;
        clearInterval(timer);
        AA._listenFinish = null;
        if (rec) {
          rec.onend = null;
          try { rec.abort(); } catch (e) { /* już zatrzymane */ }
        }
        AA.showInterim('');
        AA.setMode('off');
        resolve(text && text.trim() ? text.trim() : null);
      };
      AA._listenFinish = finish;
      const timer = setInterval(() => { if (Date.now() > deadline) finish(null); }, 200);

      const start = () => {
        if (done || !s.useMic || !SR) return;
        rec = new SR();
        rec.lang = 'pl-PL';
        rec.interimResults = true;
        rec.continuous = false;
        rec.maxAlternatives = 1;
        rec.onresult = (e) => {
          let fin = '', inter = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) fin += r[0].transcript;
            else inter += r[0].transcript;
          }
          if (inter) {
            AA.showInterim(inter);
            deadline = Math.max(deadline, Date.now() + 3000); // ktoś mówi – nie ucinamy w pół zdania
          }
          if (fin.trim()) finish(fin);
        };
        rec.onerror = (e) => {
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
            AA.log('Brak zgody na mikrofon lub rozpoznawanie mowy – używaj pola tekstowego.', 'warn');
            s.useMic = false;
            if (AA.syncMicToggle) AA.syncMicToggle();
          } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
            AA.log('Błąd rozpoznawania mowy: ' + e.error, 'warn');
          }
        };
        // Chrome sam kończy rozpoznawanie po chwili ciszy – wznawiamy, dopóki nie minie czas.
        rec.onend = () => { if (!done) setTimeout(start, 150); };
        try {
          rec.start();
        } catch (err) {
          AA.log('Nie udało się uruchomić rozpoznawania mowy: ' + err.message, 'warn');
        }
      };
      start();
    });
  };

  AA.isListening = () => !!AA._listenFinish;

  AA.typedInput = function (text) {
    if (AA._listenFinish) {
      AA._listenFinish(text);
      return true;
    }
    return false;
  };

  AA.cancelSpeechIO = function () {
    if (AA._speakCancel) AA._speakCancel();
    if (AA._listenFinish) AA._listenFinish(null);
  };
})(window.AA);
