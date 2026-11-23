// Wspólne funkcje pomocnicze. Wszystkie moduły korzystają z globalnej przestrzeni nazw AA
// (zwykłe skrypty zamiast modułów ES, żeby aplikacja działała też po dwukliku na index.html).
window.AA = window.AA || {};

(function (AA) {
  AA.$ = (sel) => document.querySelector(sel);

  AA.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  AA.uid = () => Math.random().toString(36).slice(2, 8);

  AA.pad = (n) => String(n).padStart(2, '0');

  AA.todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${AA.pad(d.getMonth() + 1)}-${AA.pad(d.getDate())}`;
  };

  AA.hhmm = (d = new Date()) => `${AA.pad(d.getHours())}:${AA.pad(d.getMinutes())}`;
  AA.hhmmss = (d = new Date()) => `${AA.hhmm(d)}:${AA.pad(d.getSeconds())}`;

  AA.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // Tekst bez polskich znaków, małymi literami, bez interpunkcji – do porównywania haseł.
  AA.norm = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/ł/g, 'l')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  AA.containsPhrase = (text, phrase) => {
    const p = AA.norm(phrase);
    return !!p && ` ${AA.norm(text)} `.includes(` ${p} `);
  };

  // Zamienia {imie} na formę, jaką asystent zwraca się do seniora.
  AA.fill = (tpl, settings) => String(tpl || '').replace(/\{imie\}/gi, settings.seniorAddress || '');

  AA.lines = (text) =>
    String(text || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

  // Polska odmiana liczebników: 1 minutę, 2 minuty, 5 minut.
  AA.plural = (n, forms) => {
    n = Math.abs(n);
    if (n === 1) return forms[0];
    const d = n % 10, h = n % 100;
    if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return forms[1];
    return forms[2];
  };

  // Prosta, lokalna (darmowa) interpretacja odpowiedzi na przypomnienie.
  // Zwraca 'yes', 'no' albo 'unclear' (wtedy odpowiedź idzie do AI).
  const YES = /\b(tak|juz|wzielam|wzialem|wzielem|zrobione|zrobilam|zrobilem|zjadlam|zjadlem|wypilam|wypilem|oczywiscie|jasne|gotowe|zalatwione|owszem)\b/;
  const NO = /\b(nie|zaraz|pozniej|potem|chwile|chwilke|jeszcze)\b/;
  const UNSURE = /\b(nie wiem|nie pamietam|co|czego|jakie|jaki|jaka|ktore|ktora|gdzie|kiedy|dlaczego|po co|chyba|moze)\b/;

  AA.classifyAnswer = (text) => {
    const n = AA.norm(text);
    if (!n) return 'unclear';
    if (UNSURE.test(n)) return 'unclear';
    if (n.split(' ').length > 8) return 'unclear';
    const y = YES.test(n), no = NO.test(n);
    if (y && !no) return 'yes';
    if (no && !y) return 'no';
    return 'unclear';
  };

  AA.escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
})(window.AA);
