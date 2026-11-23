// Zwykły (turowy) tryb rozmowy z Gemini: tekst seniora -> odpowiedź tekstowa -> czytanie na głos.
// Bez klucza API działa tryb demo z udawanymi odpowiedziami.
(function (AA) {
  const BASE = 'https://generativelanguage.googleapis.com/v1beta';

  AA.hasKey = () => !!String(AA.settings.apiKey || '').trim();

  const modelId = (m) => String(m || '').trim().replace(/^models\//, '');

  async function generate(model, body) {
    AA.countCall();
    const url = `${BASE}/models/${encodeURIComponent(modelId(model))}:generateContent?key=${encodeURIComponent(AA.settings.apiKey.trim())}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || `HTTP ${res.status}`);
    return data;
  }

  // Tekst odpowiedzi bez „myśli” modelu.
  function textOf(content) {
    return (content && content.parts ? content.parts : [])
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join(' ')
      .trim();
  }

  // Historia ograniczona do ok. 20 ostatnich wpisów, cięta tylko przed zwykłą wypowiedzią seniora
  // (żeby nie rozdzielić wywołania narzędzia od jego wyniku).
  function trimHistory(h) {
    if (h.length <= 24) return;
    for (let i = h.length - 20; i < h.length; i++) {
      const c = h[i];
      if (c.role === 'user' && c.parts && c.parts[0] && typeof c.parts[0].text === 'string') {
        h.splice(0, i);
        return;
      }
    }
  }

  AA.Gemini = {
    // Jedna tura rozmowy. session = { history: [], activeReminderId, endRequested }
    async turn(session, userText) {
      if (!AA.hasKey()) return demoTurn(session, userText);

      session.history.push({ role: 'user', parts: [{ text: userText }] });
      trimHistory(session.history);
      const spoken = [];

      // Pętla na wypadek, gdy model woła narzędzia (np. potwierdza przypomnienie) – maks. 4 kroki.
      for (let step = 0; step < 4; step++) {
        const data = await generate(AA.settings.textModel, {
          systemInstruction: { parts: [{ text: AA.buildSystemPrompt(session) }] },
          contents: session.history,
          tools: [{ functionDeclarations: AA.toolDeclarations() }],
        });
        const cand = data.candidates && data.candidates[0];
        const content = cand && cand.content;
        if (!content || !content.parts) {
          const why = (data.promptFeedback && data.promptFeedback.blockReason) || (cand && cand.finishReason) || 'brak treści';
          AA.log('AI nie zwróciło odpowiedzi: ' + why, 'warn');
          break;
        }
        // Odpowiedź modelu zapisujemy w całości (z podpisami „myśli”, których wymagają nowsze modele).
        session.history.push(Object.assign({ role: 'model' }, content));
        const t = textOf(content);
        if (t) spoken.push(t);

        const calls = content.parts.filter((p) => p.functionCall);
        if (!calls.length) break;

        const responses = [], extra = [];
        for (const p of calls) {
          const fc = p.functionCall;
          const r = await AA.runTool(fc.name, fc.args || {}, session);
          const fr = { name: fc.name, response: r.response };
          if (fc.id) fr.id = fc.id;
          responses.push({ functionResponse: fr });
          if (r.image) extra.push({ inlineData: { mimeType: 'image/jpeg', data: r.image } });
        }
        session.history.push({ role: 'user', parts: responses.concat(extra) });
      }
      return spoken.join(' ');
    },

    // Pojedyncze polecenie bez historii (np. wymyślenie zagadnięcia dla losowego eventu).
    async oneShot(prompt) {
      const data = await generate(AA.settings.textModel, {
        systemInstruction: { parts: [{ text: AA.buildSystemPrompt(null) }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      return textOf(data.candidates && data.candidates[0] && data.candidates[0].content);
    },

    // Lista modeli dostępnych dla klucza: osobno do zwykłej rozmowy i do trybu LIVE.
    async listModels() {
      const url = `${BASE}/models?pageSize=1000&key=${encodeURIComponent(AA.settings.apiKey.trim())}`;
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.error && data.error.message) || `HTTP ${res.status}`);
      const models = data.models || [];
      const id = (m) => modelId(m.name);
      const supports = (m, method) => (m.supportedGenerationMethods || []).includes(method);
      return {
        text: models.filter((m) => supports(m, 'generateContent') && /gemini/.test(m.name) && !/tts|image|embedding/.test(m.name)).map(id),
        live: models.filter((m) => supports(m, 'bidiGenerateContent')).map(id),
      };
    },
  };

  // ---------- tryb demo (bez klucza) ----------
  const DEMO_REPLIES = [
    'Rozumiem. Opowiedz mi o tym coś więcej.',
    'To ciekawe. A jak się z tym czujesz?',
    'Dobrze, że mi o tym mówisz. Co jeszcze dziś robiłaś?',
    'Słucham cię uważnie. Chcesz o czymś jeszcze porozmawiać?',
  ];
  let demoIdx = 0;

  async function demoTurn(session, userText) {
    await AA.sleep(600); // udajemy chwilę „myślenia”
    // Pierwsza wiadomość zawiera kontekst („Asystent przypomniał…”) – analizujemy tylko słowa seniora.
    const m = /Senior odpowiedział: „([\s\S]*)”\s*$/.exec(userText);
    if (m) userText = m[1];
    const n = AA.norm(userText);
    if (session.activeReminderId) {
      if (AA.classifyAnswer(userText) === 'yes') {
        await AA.runTool('potwierdz_przypomnienie', { id: session.activeReminderId }, session);
        return 'Świetnie, zapisałam. Dziękuję!';
      }
      if (/\b(nie wiem|nie pamietam|co|jakie)\b/.test(n)) {
        await AA.runTool('odloz_przypomnienie', { id: session.activeReminderId, minuty: 5 }, session);
        return 'Nic nie szkodzi. Sprawdź proszę pudełko na lodówce. Przypomnę ci za chwilę.';
      }
    }
    if (/\b(boli|upadlam|upadlem|zle sie czuje|pomocy|ratunku)\b/.test(n)) {
      await AA.runTool('powiadom_opiekuna', { wiadomosc: `Senior powiedział: „${userText}”` }, session);
      return 'Już daję znać twojej rodzinie. Usiądź spokojnie, jestem z tobą.';
    }
    if (AA.settings.cameraAllowed && /\b(zdjecie|zobacz|popatrz|spojrz|tabletka|co to jest)\b/.test(n)) {
      await AA.runTool('zrob_zdjecie', { powod: 'senior prosi, żeby coś zobaczyć' }, session);
      return 'Zrobiłam zdjęcie. W trybie demo nie umiem go jeszcze obejrzeć, ale z kluczem AI to zadziała.';
    }
    if (/\b(do widzenia|pa pa|dobranoc|do uslyszenia|wystarczy|nie chce rozmawiac)\b/.test(n)) {
      await AA.runTool('zakoncz_rozmowe', {}, session);
      return 'Dobrze, do usłyszenia. Jestem obok, gdybyś mnie potrzebowała.';
    }
    return DEMO_REPLIES[demoIdx++ % DEMO_REPLIES.length];
  }
})(window.AA);
