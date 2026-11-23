// Tryb LIVE: rozmowa na żywo z Gemini Live API przez WebSocket.
// Mikrofon: PCM 16 kHz -> serwer, odpowiedź: PCM 24 kHz -> głośnik.
(function (AA) {
  const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
  let st = null; // stan bieżącej sesji (null = brak sesji)

  function b64ToInt16(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Int16Array(bytes.buffer, 0, bytes.length >> 1);
  }

  function int16ToB64(i16) {
    const bytes = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function send(my, obj) {
    if (my.ws && my.ws.readyState === WebSocket.OPEN) my.ws.send(JSON.stringify(obj));
  }

  function isPlaying(my) {
    return my.outCtx && my.nextTime + 0.35 > my.outCtx.currentTime; // + ogon, żeby echo nie wróciło
  }

  function play(my, b64, mime) {
    const rate = Number((/rate=(\d+)/.exec(mime || '') || [])[1]) || 24000;
    const i16 = b64ToInt16(b64);
    if (!i16.length) return;
    const ctx = my.outCtx;
    const buf = ctx.createBuffer(1, i16.length, rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < i16.length; i++) ch[i] = i16[i] / 32768;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const t = Math.max(my.nextTime, ctx.currentTime + 0.05);
    src.start(t);
    my.nextTime = t + buf.duration;
    my.sources.add(src);
    src.onended = () => my.sources.delete(src);
  }

  function stopPlayback(my) {
    my.sources.forEach((s) => { try { s.stop(); } catch (e) { /* już zatrzymane */ } });
    my.sources.clear();
    my.nextTime = 0;
  }

  async function startMic(my) {
    my.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (my !== st) { my.stream.getTracks().forEach((t) => t.stop()); return; }
    my.inCtx = new AudioContext({ sampleRate: 16000 });
    const src = my.inCtx.createMediaStreamSource(my.stream);
    const proc = my.inCtx.createScriptProcessor(2048, 1, 1);
    proc.onaudioprocess = (e) => {
      if (my !== st || !my.connected) return;
      if (AA.settings.halfDuplex && isPlaying(my)) return; // bez słuchawek: nie słuchamy samych siebie
      const f = e.inputBuffer.getChannelData(0);
      const i16 = new Int16Array(f.length);
      for (let i = 0; i < f.length; i++) {
        const v = Math.max(-1, Math.min(1, f[i]));
        i16[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
      }
      send(my, { realtimeInput: { audio: { data: int16ToB64(i16), mimeType: 'audio/pcm;rate=16000' } } });
    };
    src.connect(proc);
    proc.connect(my.inCtx.destination);
    my.proc = proc;
  }

  function flushUser(my) {
    if (my.userBuf.trim()) {
      my.opts.onUserText(my.userBuf.trim());
      my.userBuf = '';
    }
  }

  async function handle(my, msg) {
    if (my !== st) return;

    if (msg.setupComplete) {
      my.connected = true;
      AA.log('Połączono z Gemini Live');
      try {
        await startMic(my);
      } catch (e) {
        AA.log('Brak dostępu do mikrofonu: ' + e.message, 'error');
        stopSession(my, 'brak dostępu do mikrofonu');
        return;
      }
      send(my, {
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: '(Senior poprosił o szybką rozmowę na żywo. Przywitaj się jednym krótkim zdaniem i zapytaj, o czym chce porozmawiać.)' }] }],
          turnComplete: true,
        },
      });
      return;
    }

    if (msg.toolCall) {
      const responses = [];
      for (const fc of msg.toolCall.functionCalls || []) {
        const r = await AA.runTool(fc.name, fc.args || {}, my.session);
        if (r.image) send(my, { realtimeInput: { video: { data: r.image, mimeType: 'image/jpeg' } } });
        responses.push({ id: fc.id, name: fc.name, response: r.response });
      }
      send(my, { toolResponse: { functionResponses: responses } });
      if (my.session.endRequested) my.endAfterTurn = true;
      return;
    }

    const sc = msg.serverContent;
    if (sc) {
      my.lastActivity = Date.now();
      if (sc.interrupted) stopPlayback(my);
      if (sc.inputTranscription && sc.inputTranscription.text) {
        my.userBuf += sc.inputTranscription.text;
        AA.showInterim(my.userBuf.trim());
        if (AA.containsPhrase(my.userBuf, AA.settings.endKeyword)) my.endAfterTurn = true;
      }
      if (sc.modelTurn && sc.modelTurn.parts) {
        flushUser(my);
        for (const p of sc.modelTurn.parts) {
          if (p.inlineData && /audio/.test(p.inlineData.mimeType || '')) play(my, p.inlineData.data, p.inlineData.mimeType);
        }
      }
      if (sc.outputTranscription && sc.outputTranscription.text) {
        flushUser(my);
        my.modelBuf += sc.outputTranscription.text;
      }
      if (sc.turnComplete) {
        flushUser(my);
        AA.showInterim('');
        if (my.modelBuf.trim()) {
          my.opts.onModelText(my.modelBuf.trim());
          my.modelBuf = '';
        }
        if (my.endAfterTurn) {
          const wait = Math.max(0, my.nextTime - my.outCtx.currentTime) * 1000 + 400;
          setTimeout(() => stopSession(my, 'koniec rozmowy'), wait);
        }
      }
    }

    if (msg.goAway) AA.log('Serwer LIVE wkrótce zakończy sesję.', 'warn');
  }

  function stopSession(my, reason) {
    if (my.closed) return;
    my.closed = true;
    try { if (my.ws) my.ws.close(1000); } catch (e) { /* już zamknięte */ }
    finish(my, reason);
  }

  function finish(my, reason) {
    if (my.finished) return;
    my.finished = true;
    my.timers.forEach((t) => { clearInterval(t); clearTimeout(t); });
    stopPlayback(my);
    if (my.proc) { try { my.proc.disconnect(); } catch (e) { /* brak */ } }
    if (my.stream) my.stream.getTracks().forEach((t) => t.stop());
    if (my.inCtx) my.inCtx.close().catch(() => {});
    if (my.outCtx) my.outCtx.close().catch(() => {});
    flushUser(my);
    if (my.modelBuf.trim()) my.opts.onModelText(my.modelBuf.trim());
    AA.showInterim('');
    if (st === my) st = null;
    AA.log('Tryb LIVE zakończony: ' + reason);
    my.resolve({ connected: my.connected, reason });
  }

  AA.Live = {
    active: () => !!st,

    // opts = { session, onUserText(text), onModelText(text) }
    // Zwraca Promise<{connected, reason}>, rozwiązywany po zakończeniu sesji.
    start(opts) {
      return new Promise((resolve) => {
        const s = AA.settings;
        const my = {
          opts, resolve, session: opts.session || { endRequested: false },
          ws: null, connected: false, closed: false, finished: false,
          userBuf: '', modelBuf: '', sources: new Set(), nextTime: 0,
          lastActivity: Date.now(), endAfterTurn: false, timers: [],
        };
        st = my;
        my.outCtx = new AudioContext({ sampleRate: 24000 });
        my.outCtx.resume().catch(() => {});

        try {
          my.ws = new WebSocket(`${WS_URL}?key=${encodeURIComponent(s.apiKey.trim())}`);
        } catch (e) {
          finish(my, 'błąd połączenia: ' + e.message);
          return;
        }
        AA.countCall();

        my.ws.onopen = () => {
          send(my, {
            setup: {
              model: `models/${String(s.liveModel).trim().replace(/^models\//, '')}`,
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: s.liveVoice || 'Kore' } } },
              },
              systemInstruction: {
                parts: [{ text: AA.buildSystemPrompt(my.session) + '\n\nTRYB: szybka rozmowa głosowa na żywo. Mów krótko i naturalnie.' }],
              },
              tools: [{ functionDeclarations: AA.toolDeclarations() }],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
            },
          });
        };
        my.ws.onmessage = async (ev) => {
          let txt = ev.data;
          if (txt instanceof Blob) txt = await txt.text();
          else if (txt instanceof ArrayBuffer) txt = new TextDecoder().decode(txt);
          let msg;
          try { msg = JSON.parse(txt); } catch (e) { return; }
          handle(my, msg);
        };
        my.ws.onerror = () => AA.log('Błąd połączenia z Gemini Live (WebSocket).', 'error');
        my.ws.onclose = (ev) => finish(my, ev.reason ? `serwer zamknął połączenie (${ev.code}): ${ev.reason}` : `połączenie zamknięte (${ev.code})`);

        // Bezpieczniki kosztów: cisza 60 s albo przekroczony limit czasu kończą sesję.
        my.timers.push(setInterval(() => { if (Date.now() - my.lastActivity > 60000) stopSession(my, 'cisza przez 60 s'); }, 1000));
        my.timers.push(setTimeout(() => stopSession(my, `limit ${s.liveMaxMin} min`), (Number(s.liveMaxMin) || 10) * 60000));
      });
    },

    stop(reason) {
      if (st) stopSession(st, reason || 'zatrzymano');
    },

    sendText(text) {
      if (st && st.connected) {
        send(st, { clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } });
        st.lastActivity = Date.now();
      }
    },
  };
})(window.AA);
