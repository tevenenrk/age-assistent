// Główna logika: scenariusze (zagadanie, przypomnienia, rozmowa), narzędzia dla AI i obsługa ekranu.
(function (AA) {
  const S = () => AA.settings;
  const $ = AA.$;

  // ===================== Dziennik, czat, powiadomienia =====================
  AA.dayLog = []; // ważne zdarzenia dnia – trafiają do instrukcji dla AI
  const notifications = [];

  AA.log = function (msg, level = 'info') {
    const ul = $('#eventLog');
    if (ul) {
      const li = document.createElement('li');
      li.className = level;
      li.innerHTML = `<time>${AA.hhmmss()}</time>${AA.escapeHtml(msg)}`;
      ul.prepend(li);
      while (ul.children.length > 300) ul.lastChild.remove();
    }
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)('[Asystent]', msg);
  };

  function dayEvent(text) {
    AA.dayLog.push({ t: AA.hhmm(), text });
    if (AA.dayLog.length > 40) AA.dayLog.shift();
  }

  const TAGS = { skrypt: ['bez AI', ''], AI: ['AI', 'ai'], demo: ['demo', 'demo'], LIVE: ['LIVE', 'live'], live: ['LIVE', 'live'], tekst: ['tekst', ''] };

  function chat(role, text, tag, extra) {
    const box = $('#chat');
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    const who = role === 'assistant' ? S().assistantName : role === 'senior' ? 'Senior' : 'System';
    const t = tag && TAGS[tag] ? `<span class="tag ${TAGS[tag][1]}">${TAGS[tag][0]}</span>` : '';
    div.innerHTML = `<div class="who">${AA.escapeHtml(who)} · ${AA.hhmmss()} ${t}</div><div class="text"></div>`;
    div.querySelector('.text').textContent = text;
    if (extra && extra.image) {
      const img = document.createElement('img');
      img.src = extra.image;
      img.alt = 'Zdjęcie z kamery';
      div.appendChild(img);
    }
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 4500);
  }

  function notifyCaregiver(msg, source) {
    const item = { t: AA.hhmm(), msg, source };
    notifications.unshift(item);
    renderNotifications();
    toast('📨 Powiadomienie do opiekuna: ' + msg);
    chat('system', `📨 Do opiekuna (${S().caregiver}): ${msg}`);
    AA.log('Powiadomiono opiekuna: ' + msg, 'warn');
    dayEvent('Powiadomiono opiekuna: ' + msg);

    const s = S();
    if (s.telegramToken && s.telegramChat) {
      const url = `https://api.telegram.org/bot${encodeURIComponent(s.telegramToken.trim())}/sendMessage?chat_id=${encodeURIComponent(s.telegramChat.trim())}&text=${encodeURIComponent('Asystent Seniora: ' + msg)}`;
      // no-cors: wysyłamy bez odczytu odpowiedzi (Telegram nie musi zezwalać na CORS).
      fetch(url, { mode: 'no-cors' }).then(
        () => AA.log('Wysłano wiadomość na Telegram.'),
        (e) => AA.log('Nie udało się wysłać na Telegram: ' + e.message, 'error')
      );
    }
  }

  function renderNotifications() {
    const ul = $('#notifList');
    ul.innerHTML = notifications.length
      ? notifications.map((n) => `<li><b>${n.t}</b> ${AA.escapeHtml(n.msg)}</li>`).join('')
      : '<li class="empty">Brak powiadomień.</li>';
    const c = $('#notifCount');
    c.textContent = notifications.length;
    c.hidden = !notifications.length;
  }

  // ===================== Instrukcja dla AI („Gem”) i narzędzia =====================
  const DAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

  AA.buildSystemPrompt = function (session) {
    const s = S();
    const now = new Date();
    const rems = AA.reminders.map((r) => `- id=${r.id}: „${r.title}” o ${r.time}, stan: ${statusText(r)}`).join('\n') || '(brak)';
    const events = AA.dayLog.slice(-12).map((e) => `- ${e.t} ${e.text}`).join('\n') || '(brak)';
    let active = '';
    if (session && session.activeReminderId) {
      const r = findRem(session.activeReminderId);
      if (r) {
        active =
          `\n\nAKTYWNE PRZYPOMNIENIE: id=${r.id}, „${r.title}”. Właśnie powiedziałaś: „${AA.fill(r.text, s)}”\n` +
          'Jeśli senior potwierdzi, że to zrobił – wywołaj potwierdz_przypomnienie. ' +
          'Jeśli zrobi to później – wywołaj odloz_przypomnienie. ' +
          'Jeśli nie rozumie, o co chodzi – spokojnie wyjaśnij prostymi słowami, korzystając z informacji o osobie.';
      }
    }
    return (
      `Jesteś ${s.assistantName} – ciepłą, cierpliwą asystentką głosową osoby starszej, która może mieć kłopoty z pamięcią.\n` +
      `Zwracaj się do niej: ${s.seniorAddress}.\n\n` +
      'ZASADY:\n' +
      '- Mów po polsku, krótko: 1–3 proste zdania. Zadawaj jedno pytanie naraz.\n' +
      '- Twoje odpowiedzi są czytane na głos: bez list, emotikon, nawiasów i formatowania.\n' +
      '- Bądź spokojna i życzliwa. Nie poprawiaj i nie zawstydzaj. Gdy ktoś powtarza pytanie, odpowiadaj tak cierpliwie jak za pierwszym razem.\n' +
      '- Nie wymyślaj faktów o rodzinie, lekach ani planach – korzystaj tylko z informacji poniżej. Gdy czegoś nie wiesz, powiedz to i zaproponuj kontakt z opiekunem.\n' +
      '- Nie udzielaj porad medycznych. Przy bólu, złym samopoczuciu, upadku, zagubieniu lub zagrożeniu: uspokój, wywołaj powiadom_opiekuna, a w nagłym wypadku poradź zadzwonić pod 112.\n' +
      '- Gdy senior się żegna albo nie chce dalej rozmawiać – pożegnaj się krótko i wywołaj zakoncz_rozmowe.\n' +
      (s.cameraAllowed ? '- Możesz zrobić zdjęcie kamerą (zrob_zdjecie), gdy naprawdę pomoże zobaczyć sytuację, np. co senior trzyma w ręce.\n' : '') +
      `\nINFORMACJE O OSOBIE:\n${s.profile}\n` +
      `\nOPIEKUN: ${s.caregiver}\n` +
      `\nTERAZ: ${DAYS[now.getDay()]}, ${now.toLocaleDateString('pl-PL')}, godzina ${AA.hhmm(now)}\n` +
      `\nPRZYPOMNIENIA NA DZIŚ:\n${rems}\n` +
      `\nDZISIEJSZE ZDARZENIA:\n${events}` +
      active
    );
  };

  AA.toolDeclarations = function () {
    const tools = [
      {
        name: 'potwierdz_przypomnienie',
        description: 'Oznacz przypomnienie jako wykonane, gdy senior jasno potwierdzi, że czynność jest zrobiona.',
        parameters: { type: 'object', properties: { id: { type: 'string', description: 'Identyfikator przypomnienia z listy' } }, required: ['id'] },
      },
      {
        name: 'odloz_przypomnienie',
        description: 'Przełóż przypomnienie na później, gdy senior zrobi to za chwilę albo prosi o przypomnienie później.',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Identyfikator przypomnienia' }, minuty: { type: 'integer', description: 'Za ile minut przypomnieć ponownie' } },
          required: ['id'],
        },
      },
      {
        name: 'powiadom_opiekuna',
        description: 'Wyślij wiadomość do opiekuna, gdy senior źle się czuje, upadł, jest zagubiony, prosi o kontakt z rodziną albo dzieje się coś niepokojącego.',
        parameters: { type: 'object', properties: { wiadomosc: { type: 'string', description: 'Krótka, rzeczowa wiadomość dla opiekuna' } }, required: ['wiadomosc'] },
      },
      {
        name: 'zakoncz_rozmowe',
        description: 'Zakończ rozmowę, gdy senior się żegna albo wyraźnie nie chce dalej rozmawiać.',
      },
    ];
    if (S().cameraAllowed) {
      tools.push({
        name: 'zrob_zdjecie',
        description: 'Zrób jedno zdjęcie kamerą w pokoju, żeby zobaczyć sytuację (np. co senior trzyma w ręce, czy wszystko w porządku).',
        parameters: { type: 'object', properties: { powod: { type: 'string', description: 'Po co robisz zdjęcie' } }, required: ['powod'] },
      });
    }
    return tools;
  };

  // Wykonanie narzędzia wywołanego przez AI. Zwraca { response, image? }.
  AA.runTool = async function (name, args, session) {
    chat('system', `🔧 AI używa narzędzia: ${name} ${JSON.stringify(args)}`);
    AA.log(`Narzędzie AI: ${name} ${JSON.stringify(args)}`);
    switch (name) {
      case 'potwierdz_przypomnienie': {
        const r = findRem(args.id);
        if (!r) return { response: { ok: false, blad: 'Nie ma takiego przypomnienia', dostepne_id: AA.reminders.map((x) => x.id) } };
        markDone(r, 'potwierdzone w rozmowie z AI');
        return { response: { ok: true } };
      }
      case 'odloz_przypomnienie': {
        const r = findRem(args.id);
        if (!r) return { response: { ok: false, blad: 'Nie ma takiego przypomnienia', dostepne_id: AA.reminders.map((x) => x.id) } };
        const m = Number(args.minuty) > 0 ? Math.min(Math.round(Number(args.minuty)), 240) : r.retryMin;
        r.status = 'waiting_retry';
        r.nextAt = Date.now() + m * unitMs();
        saveRender();
        AA.log(`„${r.title}” odłożone o ${m} ${unitShort()}`);
        return { response: { ok: true, przypomne_za_minut: m } };
      }
      case 'powiadom_opiekuna':
        notifyCaregiver(args.wiadomosc || '(bez treści)', 'AI');
        return { response: { ok: true } };
      case 'zakoncz_rozmowe':
        if (session) session.endRequested = true;
        return { response: { ok: true } };
      case 'zrob_zdjecie': {
        if (!S().cameraAllowed) return { response: { ok: false, blad: 'Kamera wyłączona przez opiekuna' } };
        try {
          const url = await AA.Camera.snap();
          chat('system', `📷 Zdjęcie dla AI${args.powod ? ' – ' + args.powod : ''}`, null, { image: url });
          return { response: { ok: true, info: 'Zdjęcie dołączone do wiadomości.' }, image: url.split(',')[1] };
        } catch (e) {
          AA.log('Nie udało się zrobić zdjęcia: ' + e.message, 'error');
          return { response: { ok: false, blad: 'Nie udało się zrobić zdjęcia: ' + e.message } };
        }
      }
      default:
        return { response: { ok: false, blad: 'Nieznane narzędzie' } };
    }
  };

  // ===================== Sterowanie przebiegiem =====================
  // Każdy scenariusz dostaje numer; „Przerwij wszystko” zwiększa licznik i stary scenariusz sam się kończy.
  const ABORT = { aborted: true };
  let busy = false, runId = 0, session = null, lastGreetAt = 0;

  function begin() { busy = true; return ++runId; }
  function alive(id) { return id === runId; }
  function check(id) { if (!alive(id)) throw ABORT; }

  function end(id) {
    if (!alive(id)) return;
    busy = false;
    session = null;
    AA.setMode('off');
    renderReminders();
    setTimeout(processDue, 400);
  }

  function handleErr(e) {
    if (e === ABORT) return;
    AA.log('Błąd: ' + (e && e.message ? e.message : e), 'error');
    console.error(e);
  }

  function stopAll() {
    runId++;
    AA.cancelSpeechIO();
    AA.Live.stop('przerwano ręcznie');
    busy = false;
    session = null;
    AA.setMode('off');
    AA.log('Przerwano wszystko.');
  }

  async function say(id, text, tag) {
    check(id);
    chat('assistant', text, tag);
    await AA.speak(text);
    check(id);
  }

  async function hear(id, sec) {
    check(id);
    const t = await AA.listen(sec);
    check(id);
    if (t) chat('senior', t);
    else chat('system', '(brak odpowiedzi)');
    return t;
  }

  const aiTag = () => (AA.hasKey() ? 'AI' : 'demo');

  // ===================== Scenariusze =====================
  // 1) Zagadanie bez AI (po ruchu albo losowy event). Odpowiedź -> rozmowa z AI.
  async function greetingFlow(source) {
    const id = begin();
    try {
      let text, tag = 'skrypt';
      if (source === 'random') {
        const r = await randomOpener(id);
        text = r.text;
        tag = r.tag;
      } else {
        const lines = AA.lines(S().greetings);
        text = AA.fill(AA.pick(lines.length ? lines : ['Dzień dobry, {imie}!']), S());
        lastGreetAt = Date.now();
      }
      await say(id, text, tag);
      const ans = await hear(id, S().listenSec);
      if (!ans) {
        AA.log('Brak odpowiedzi na zagadanie – wracam do czuwania.');
        return;
      }
      AA.log('Jest odpowiedź – przechodzę w tryb rozmowy z AI.');
      dayEvent(`Rozmowa (asystent zagadał: „${text}”)`);
      await conversation(id, `[Asystent sam zagadał: „${text}”]\nSenior odpowiedział: „${ans}”`, ans, {});
    } catch (e) {
      handleErr(e);
    } finally {
      end(id);
    }
  }

  async function randomOpener(id) {
    const fallback = () => {
      const lines = AA.lines(S().randomTopics);
      return { text: AA.fill(lines.length ? AA.pick(lines) : '{imie}, jak się masz?', S()), tag: 'skrypt' };
    };
    if (!AA.hasKey()) return fallback();
    AA.setMode('thinking');
    try {
      const t = await AA.Gemini.oneShot(
        'Zagadaj teraz sam z siebie do seniora. Jedno lub dwa krótkie, ciepłe zdania zakończone prostym pytaniem. ' +
          'Temat dobierz do informacji o osobie i pory dnia (np. samopoczucie, picie wody, wspomnienia, rodzina, pogoda, ulubione zajęcia). ' +
          'Nie powtarzaj tematów z dzisiejszych zdarzeń. Zwróć tylko to, co masz powiedzieć.'
      );
      check(id);
      return t ? { text: t, tag: 'AI' } : fallback();
    } catch (e) {
      if (e === ABORT) throw e;
      AA.log('AI nie wymyśliło zagadnięcia (' + e.message + ') – używam listy.', 'warn');
      return fallback();
    }
  }

  // 2) Senior sam zaczyna (symulacja słowa wybudzającego).
  async function talkFlow() {
    const id = begin();
    try {
      await say(id, AA.pick(['Tak, słucham cię.', 'Jestem, słucham.', 'Słucham, w czym mogę pomóc?']), 'skrypt');
      const ans = await hear(id, S().convListenSec);
      if (!ans) return;
      await conversation(id, ans, ans, {});
    } catch (e) {
      handleErr(e);
    } finally {
      end(id);
    }
  }

  async function conversationFromText(text) {
    const id = begin();
    try {
      chat('senior', text);
      await conversation(id, text, text, {});
    } catch (e) {
      handleErr(e);
    } finally {
      end(id);
    }
  }

  // 3) Rozmowa w zwykłym trybie: słucham -> tekst do AI -> odpowiedź -> czytam -> słucham…
  //    Hasło trybu LIVE przełącza na rozmowę na żywo.
  async function conversation(id, firstMsg, rawText, opts) {
    session = { history: [], activeReminderId: opts.reminderId || null, endRequested: false };
    let msg = firstMsg, raw = rawText;
    while (true) {
      check(id);
      if (AA.containsPhrase(raw, S().liveKeyword)) {
        if (await goLive(id)) return;
        const ans = await hear(id, S().convListenSec);
        if (!ans) return;
        msg = raw = ans;
        continue;
      }
      if (AA.containsPhrase(raw, S().endKeyword)) {
        await say(id, 'Dobrze, do usłyszenia. Jestem obok, gdybyś mnie potrzebowała.', 'skrypt');
        return;
      }

      AA.setMode('thinking');
      let reply;
      try {
        reply = await AA.Gemini.turn(session, msg);
      } catch (e) {
        check(id);
        AA.log('Błąd AI: ' + e.message, 'error');
        await say(id, 'Przepraszam, mam teraz kłopot z połączeniem. Spróbujmy za chwilę.', 'skrypt');
        return;
      }
      check(id);
      await say(id, reply || 'Przepraszam, nie dosłyszałam. Możesz powtórzyć?', aiTag());
      if (session.endRequested) return;

      const ans = await hear(id, S().convListenSec);
      if (!ans) {
        AA.log('Cisza – kończę rozmowę.');
        return;
      }
      msg = raw = ans;
    }
  }

  async function goLive(id) {
    if (!AA.hasKey()) {
      chat('system', 'Tryb LIVE wymaga klucza API Gemini (zakładka Ustawienia).');
      await say(id, 'Szybka rozmowa na żywo wymaga połączenia z AI. Na razie porozmawiajmy zwykłym trybem.', 'skrypt');
      return false;
    }
    chat('system', '⚡ Przełączam na tryb LIVE (rozmowa na żywo)…');
    AA.log('Start trybu LIVE');
    AA.setMode('live');
    const res = await AA.Live.start({
      session,
      onUserText: (t) => chat('senior', t, 'live'),
      onModelText: (t) => chat('assistant', t, 'LIVE'),
    });
    check(id);
    if (!res.connected) {
      chat('system', 'Nie udało się połączyć z trybem LIVE: ' + res.reason);
      await say(id, 'Nie udało mi się włączyć szybkiej rozmowy. Porozmawiajmy zwykłym trybem.', 'skrypt');
      return false;
    }
    chat('system', `Koniec trybu LIVE (${res.reason}).`);
    return true;
  }

  // 4) Przypomnienie: komunikat bez AI -> odpowiedź rozpoznana lokalnie -> AI tylko, gdy niejasna.
  async function runReminder(r) {
    const id = begin();
    try {
      r.attempts++;
      r.status = 'active';
      saveRender();
      AA.log(`Przypomnienie „${r.title}” – próba ${r.attempts}/${r.maxAttempts}`);
      const text = AA.fill(r.text, S());
      await say(id, text, 'skrypt');
      const ans = await hear(id, S().listenSec);
      if (!ans) {
        retryOrEscalate(r, 'brak reakcji');
        return;
      }
      const cls = AA.containsPhrase(ans, S().liveKeyword) ? 'unclear' : AA.classifyAnswer(ans);
      if (cls === 'yes') {
        markDone(r, 'potwierdzone (rozpoznane lokalnie, bez AI)');
        await say(id, AA.pick(['Świetnie, dziękuję!', 'Super, zapisuję.', 'Brawo, dziękuję.']), 'skrypt');
        return;
      }
      if (cls === 'no') {
        if (r.attempts >= r.maxAttempts) {
          await say(id, `Dobrze. Poproszę ${S().caregiver.split(' ')[0]}, żeby się do ciebie odezwała.`, 'skrypt');
          retryOrEscalate(r, 'senior odkłada');
        } else {
          retryOrEscalate(r, 'senior odkłada');
          await say(id, `Dobrze, przypomnę ci za ${r.retryMin} ${unitSpoken(r.retryMin)}.`, 'skrypt');
        }
        return;
      }
      AA.log('Odpowiedź niejasna – przekazuję do AI.');
      await conversation(id, `[Asystent przypomniał: „${text}” (przypomnienie id=${r.id})]\nSenior odpowiedział: „${ans}”`, ans, { reminderId: r.id });
    } catch (e) {
      handleErr(e);
    } finally {
      if (r.status === 'active') retryOrEscalate(r, 'brak potwierdzenia');
      end(id);
    }
  }

  // ===================== Przypomnienia =====================
  function findRem(id) { return AA.reminders.find((r) => r.id === id); }
  function unitMs() { return S().testSeconds ? 1000 : 60000; }
  function unitShort() { return S().testSeconds ? 's' : 'min'; }
  function unitSpoken(n) { return S().testSeconds ? AA.plural(n, ['sekundę', 'sekundy', 'sekund']) : AA.plural(n, ['minutę', 'minuty', 'minut']); }
  function saveRender() { AA.saveReminders(); renderReminders(); }

  function markDone(r, how) {
    r.status = 'done';
    r.doneAt = AA.hhmm();
    r.nextAt = null;
    saveRender();
    AA.log(`✔ „${r.title}”: ${how}`);
    dayEvent(`Przypomnienie „${r.title}” wykonane (${how})`);
  }

  function retryOrEscalate(r, reason) {
    if (r.attempts >= r.maxAttempts) {
      r.status = 'escalated';
      r.nextAt = null;
      saveRender();
      notifyCaregiver(`Przypomnienie „${r.title}”: ${reason} po ${r.attempts} ${AA.plural(r.attempts, ['próbie', 'próbach', 'próbach'])}.`, 'system');
    } else {
      r.status = 'waiting_retry';
      r.nextAt = Date.now() + r.retryMin * unitMs();
      saveRender();
      AA.log(`„${r.title}”: ${reason} – ponowię za ${r.retryMin} ${unitShort()}.`);
    }
  }

  function armReminder(r, why) {
    r.status = 'due';
    r.attempts = 0;
    r.nextAt = null;
    r.armedDate = AA.todayStr();
    saveRender();
    AA.log(`Czas na „${r.title}” (${why})` + (r.requirePresence ? ' – czekam na ruch lub dźwięk.' : '.'));
  }

  // Uruchom przypomnienie, które może ruszyć samo (ponowienie albo bez wymogu obecności).
  function processDue() {
    if (busy) return;
    const r = AA.reminders.find((x) => x.status === 'due' && (!x.requirePresence || x.attempts > 0));
    if (r) runReminder(r);
  }

  function onPresence(kind) {
    const label = kind === 'motion' ? 'Wykryto ruch (kamera – symulacja)' : 'Wykryto dźwięki domowe (symulacja)';
    AA.log(label);
    if (busy) {
      AA.log('Asystent jest zajęty – zdarzenie pominięte.');
      return;
    }
    const due = AA.reminders.find((x) => x.status === 'due');
    if (due) {
      runReminder(due);
      return;
    }
    if (kind === 'motion') {
      const cd = Number(S().greetCooldownMin) || 0;
      if (cd && Date.now() - lastGreetAt < cd * 60000) {
        AA.log(`Ostatnie zagadanie było niedawno (przerwa ${cd} min) – nie zagaduję.`);
        return;
      }
      greetingFlow('motion');
    } else {
      AA.log('Brak przypomnień do wykonania – nic nie robię.');
    }
  }

  function statusText(r) {
    switch (r.status) {
      case 'due': return r.attempts > 0 ? 'zaraz ponowię' : r.requirePresence ? 'czas minął – czekam na ruch lub dźwięk' : 'do przypomnienia';
      case 'active': return `przypominam (próba ${r.attempts}/${r.maxAttempts})`;
      case 'waiting_retry': {
        const sec = Math.max(0, Math.ceil((r.nextAt - Date.now()) / 1000));
        const left = sec >= 60 ? `${Math.floor(sec / 60)} min ${sec % 60} s` : `${sec} s`;
        return `ponowienie za ${left} (było ${r.attempts}/${r.maxAttempts})`;
      }
      case 'done': return `✔ wykonane o ${r.doneAt}`;
      case 'escalated': return '⚠ powiadomiono opiekuna';
      default: return `zaplanowane na ${r.time}`;
    }
  }

  function renderReminders() {
    const box = $('#remList');
    if (!AA.reminders.length) {
      box.innerHTML = '<p class="hint">Brak przypomnień. Dodaj pierwsze poniżej.</p>';
      return;
    }
    box.innerHTML = AA.reminders
      .map(
        (r) => `
      <div class="rem" data-id="${r.id}">
        <div class="rem-head"><span class="rem-title">${AA.escapeHtml(r.title)}</span><span class="rem-time">${r.time}</span></div>
        <div class="rem-text">${AA.escapeHtml(AA.fill(r.text, S()))}</div>
        <span class="rem-status ${r.status}" data-status>${AA.escapeHtml(statusText(r))}</span>
        <div class="rem-actions">
          <button class="small" data-act="due">⏰ Jest czas</button>
          <button class="small ghost" data-act="reset">↺ Reset</button>
          <button class="small ghost" data-act="del">✕ Usuń</button>
        </div>
        <div class="hint">Co ${r.retryMin} ${unitShort()}, maks. ${r.maxAttempts} ${AA.plural(r.maxAttempts, ['próba', 'próby', 'prób'])}${r.requirePresence ? ', po wykryciu obecności' : ''}</div>
      </div>`
      )
      .join('');
  }

  // Odświeżanie samych statusów (odliczanie) bez przebudowy listy.
  function refreshStatuses() {
    AA.reminders.forEach((r) => {
      const el = document.querySelector(`.rem[data-id="${r.id}"] [data-status]`);
      if (el) {
        el.textContent = statusText(r);
        el.className = 'rem-status ' + r.status;
      }
    });
  }

  let lastMinute = '';
  function tick() {
    const now = Date.now();
    // Ponowienia, którym minął czas.
    AA.reminders.forEach((r) => {
      if (r.status === 'waiting_retry' && r.nextAt && r.nextAt <= now) {
        r.status = 'due';
        AA.saveReminders();
        AA.log(`Czas ponowić „${r.title}”.`);
      }
    });
    // Prawdziwy zegar: przypomnienie uzbraja się, gdy wybije jego godzina.
    const hm = AA.hhmm();
    if (hm !== lastMinute) {
      lastMinute = hm;
      AA.reminders.forEach((r) => {
        if (r.time === hm && r.armedDate !== AA.todayStr() && r.status !== 'active') armReminder(r, `zegar: ${hm}`);
      });
    }
    refreshStatuses();
    processDue();
  }

  // ===================== Obsługa ekranu =====================
  function updateChips() {
    $('#chipAi').textContent = AA.hasKey() ? `AI: ${S().textModel}` : 'AI: demo (brak klucza)';
    $('#chipCalls').textContent = `Zapytania AI dziś: ${AA.callsToday()}`;
    $('#demoBanner').hidden = AA.hasKey();
    $('#hintLive').textContent = `„${S().liveKeyword}”`;
    $('#hintEnd').textContent = `„${S().endKeyword}”`;
  }
  AA.onStats = updateChips;

  function bindSettings() {
    document.querySelectorAll('[data-setting]').forEach((el) => {
      const k = el.dataset.setting;
      const v = S()[k];
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v == null ? '' : v;
      if (el._bound) return;
      el._bound = true;
      el.addEventListener('change', () => {
        S()[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
        AA.saveSettings();
        // ten sam klucz może mieć kilka pól – synchronizujemy pozostałe
        document.querySelectorAll(`[data-setting="${k}"]`).forEach((o) => {
          if (o !== el) { if (o.type === 'checkbox') o.checked = el.checked; else o.value = el.value; }
        });
        updateChips();
        if (k === 'testSeconds' || k === 'seniorAddress') renderReminders();
      });
    });
  }

  AA.syncMicToggle = () => { $('#optMic').checked = !!S().useMic; };

  AA.onVoices = (voices) => {
    const sel = $('#voiceSelect');
    if (!sel) return;
    const pl = voices.filter((v) => /^pl/i.test(v.lang));
    const others = voices.filter((v) => !/^pl/i.test(v.lang));
    sel.innerHTML =
      '<option value="">(automatycznie – polski)</option>' +
      pl.concat(others).map((v) => `<option value="${AA.escapeHtml(v.voiceURI)}">${AA.escapeHtml(v.name)} (${v.lang})</option>`).join('');
    sel.value = S().voiceURI || '';
  };

  function setupUi() {
    bindSettings();
    if (!AA.sttSupported) {
      AA.log('Ta przeglądarka nie obsługuje rozpoznawania mowy – użyj Chrome lub Edge albo pola tekstowego.', 'warn');
    }
    AA.onVoices(AA.getVoices());

    // zakładki
    document.querySelectorAll('.tabs button').forEach((b) =>
      b.addEventListener('click', () => {
        document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
        document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
      })
    );

    // symulacja czujników
    $('#btnMotion').addEventListener('click', () => onPresence('motion'));
    $('#btnSound').addEventListener('click', () => onPresence('sound'));
    $('#btnRandom').addEventListener('click', () => {
      AA.log('Losowy event');
      if (busy) return toast('Asystent jest teraz zajęty.');
      greetingFlow('random');
    });
    $('#btnTalk').addEventListener('click', () => {
      AA.log('Senior zaczyna mówić (symulacja słowa wybudzającego)');
      if (busy) return toast('Asystent jest teraz zajęty.');
      talkFlow();
    });
    $('#btnStop').addEventListener('click', stopAll);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') stopAll(); });
    $('#btnClearChat').addEventListener('click', () => ($('#chat').innerHTML = ''));

    // wypowiedź tekstem
    $('#sayForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#sayInput');
      const t = input.value.trim();
      if (!t) return;
      input.value = '';
      if (AA.Live.active()) {
        chat('senior', t, 'tekst');
        AA.Live.sendText(t);
        return;
      }
      if (AA.typedInput(t)) return; // asystent właśnie słucha
      if (busy) return toast('Poczekaj chwilę – asystent mówi albo myśli.');
      conversationFromText(t);
    });

    // przypomnienia
    $('#remList').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const r = findRem(btn.closest('.rem').dataset.id);
      if (!r) return;
      if (btn.dataset.act === 'due') {
        armReminder(r, 'przycisk „Jest czas”');
        processDue();
      } else if (btn.dataset.act === 'reset') {
        Object.assign(r, { status: 'idle', attempts: 0, nextAt: null, armedDate: null, doneAt: null });
        saveRender();
      } else if (btn.dataset.act === 'del') {
        if (confirm(`Usunąć przypomnienie „${r.title}”?`)) {
          AA.reminders = AA.reminders.filter((x) => x !== r);
          saveRender();
        }
      }
    });

    $('#remForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      AA.reminders.push(
        AA.newReminder({
          title: f.title.value.trim(),
          time: f.time.value,
          text: f.text.value.trim(),
          retryMin: Math.max(1, Number(f.retryMin.value) || 15),
          maxAttempts: Math.max(1, Number(f.maxAttempts.value) || 3),
          requirePresence: f.requirePresence.checked,
        })
      );
      saveRender();
      f.title.value = '';
      toast('Dodano przypomnienie.');
    });

    // ustawienia – przyciski
    $('#btnModels').addEventListener('click', async () => {
      if (!AA.hasKey()) return toast('Najpierw wpisz klucz API.');
      try {
        const m = await AA.Gemini.listModels();
        $('#textModels').innerHTML = m.text.map((x) => `<option value="${x}">`).join('');
        $('#liveModels').innerHTML = m.live.map((x) => `<option value="${x}">`).join('');
        AA.log(`Modele do rozmowy: ${m.text.length}, do trybu LIVE: ${m.live.join(', ') || 'brak'}`);
        toast(`Pobrano listę: ${m.text.length} modeli do rozmowy, ${m.live.length} do LIVE. Kliknij w pole, żeby wybrać.`);
      } catch (e) {
        AA.log('Nie udało się pobrać listy modeli: ' + e.message, 'error');
        toast('Błąd: ' + e.message);
      }
    });
    $('#btnTestVoice').addEventListener('click', () => AA.speak(`Dzień dobry, ${S().seniorAddress}. Tak brzmi mój głos.`).then(() => AA.setMode('off')));
    $('#btnTestCam').addEventListener('click', async () => {
      try {
        const url = await AA.Camera.snap();
        chat('system', '📷 Test kamery', null, { image: url });
      } catch (e) {
        toast('Kamera: ' + e.message);
      }
    });
    $('#btnReset').addEventListener('click', () => {
      if (!confirm('Przywrócić domyślne ustawienia? (klucz API zostanie)')) return;
      AA.resetSettings();
      bindSettings();
      updateChips();
      renderReminders();
    });
  }

  // ===================== Start =====================
  setupUi();
  updateChips();
  renderReminders();
  renderNotifications();
  AA.setMode('off');
  chat('system', 'Asystent czuwa. Użyj przycisków po lewej, żeby zasymulować ruch, dźwięki albo losowe zagadanie.');
  AA.log('Aplikacja uruchomiona.' + (AA.hasKey() ? '' : ' Tryb demo (brak klucza API).'));
  setInterval(tick, 1000);

  // do testów automatycznych
  AA._debug = { stopAll, onPresence, isBusy: () => busy };
})(window.AA);
