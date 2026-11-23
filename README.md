# Asystent Seniora – wersja testowa na PC

Prototyp asystenta głosowego dla osoby starszej (np. z demencją). Działa w przeglądarce na zwykłym komputerze z Windowsem, bez instalowania czegokolwiek. Czujniki (kamera, mikrofon „domowy”, zegar) są na razie **symulowane przyciskami**.

## Uruchomienie na Windowsie

1. Pobierz to repozytorium (zielony przycisk **Code → Download ZIP** na GitHubie) i rozpakuj.
2. Kliknij dwukrotnie **`start.bat`**.
   - Jeśli masz Pythona, uruchomi się mały lokalny serwer, a przeglądarka zapamięta zgodę na mikrofon.
   - Bez Pythona otworzy się plik `index.html` bezpośrednio. Też działa, ale przeglądarka może częściej pytać o mikrofon.
3. Otwórz stronę w **Google Chrome** albo **Microsoft Edge**. Firefox nie obsługuje rozpoznawania mowy (zostaje pole tekstowe).
4. Przy pierwszym nasłuchiwaniu zezwól na dostęp do mikrofonu.

**Testuj w słuchawkach.** Na głośnikach laptopa asystent może usłyszeć sam siebie.

### Bez klucza API: tryb demo

Wszystko działa od razu, ale odpowiedzi „AI” są udawane (proste reguły). Dzięki temu można przeklikać cały przebieg za darmo.

### Z prawdziwym AI (Gemini)

1. Wejdź na <https://aistudio.google.com/apikey> i utwórz klucz API.
2. W aplikacji: zakładka **Ustawienia → Klucz API**.
3. Kliknij **„Pobierz listę dostępnych modeli”** i wybierz modele z listy. Nazwy modeli Google często się zmieniają, a lista pokazuje te, które działają z Twoim kluczem.
   - *Model do zwykłej rozmowy*: domyślnie `gemini-flash-latest`.
   - *Model do trybu LIVE*: musi obsługiwać rozmowę na żywo. Lista pokazuje tylko takie modele.

Klucz jest zapisywany tylko w tej przeglądarce (localStorage). To rozwiązanie do testów na własnym komputerze, nie do publikowania w internecie.

**Prywatność:** na darmowym poziomie Gemini Google może wykorzystywać przesyłane treści do ulepszania usług. Do testów używaj zmyślonych danych (takie są domyślnie w ustawieniach). Do prawdziwego użytku z danymi o zdrowiu potrzebny jest płatny poziom.

## Co można przetestować

| Przycisk / akcja | Co się dzieje |
|---|---|
| **🚶 Ruch (kamera)** | Gdy jest zaległe przypomnienie, asystent je odczytuje. W przeciwnym razie zagaduje **bez AI** (zdanie z listy). Jeśli senior odpowie, rozmowa przechodzi w **tryb AI**. |
| **🔊 Dźwięki domowe** | Uruchamia zaległe przypomnienie (jak ruch). Bez przypomnień nic nie robi. |
| **🎲 Losowy event** | Asystent sam zagaduje. Z kluczem AI wymyśla temat, bez klucza bierze zdanie z listy. |
| **🎙️ Senior zaczyna mówić** | Symulacja słowa wybudzającego: „Tak, słucham cię.” i nasłuchiwanie. |
| **⏰ Jest czas** (przy przypomnieniu) | Symuluje, że wybiła godzina. Przypomnienie czeka na ruch lub dźwięk, chyba że wyłączysz tę opcję. Prawdziwy zegar też uzbraja przypomnienia o ich godzinie. |
| Hasło **„pogadajmy szybko”** | Przełącza na **tryb LIVE** (rozmowa na żywo przez Gemini Live, wymaga klucza). |
| Hasło **„koniec rozmowy”** | Kończy rozmowę. |
| **■ Przerwij wszystko** / `Esc` | Zatrzymuje mowę, nasłuch i tryb LIVE. |

**Lampka:** zielona i pulsująca, gdy asystent słucha; niebieska, gdy mówi; pomarańczowa, gdy myśli (czeka na AI); czerwona w trybie LIVE.

**Odpowiedź seniora można wpisać w pole tekstowe** zamiast mówić. Przydaje się przy testach bez mikrofonu.

### Przebieg przypomnienia

```
Jest czas → czeka na ruch/dźwięk → odczytuje komunikat (bez AI) → słucha
   ├─ „tak, wzięłam”      → rozpoznane lokalnie → ✔ wykonane          (0 zapytań AI)
   ├─ „jeszcze nie”       → „przypomnę za X minut” → ponowienie
   ├─ niejasne („a co?”)  → rozmowa z AI, które samo potwierdza lub odkłada przypomnienie
   └─ cisza               → ponowienie co X minut → po N próbach powiadomienie opiekuna
```

Przy włączonym **„Tryb testowy: ponowienia w sekundach”** odstępy liczone są w sekundach, żeby nie czekać 15 minut.

### Co AI może zrobić samo (narzędzia)

- `potwierdz_przypomnienie` / `odloz_przypomnienie`: zarządza przypomnieniami w rozmowie.
- `powiadom_opiekuna`: przy złym samopoczuciu, upadku, zagubieniu. Pojawia się w zakładce *Dziennik*, a opcjonalnie trafia na Telegram.
- `zrob_zdjecie`: jedno zdjęcie z kamery laptopa, tylko gdy AI uzna to za potrzebne. Można wyłączyć w ustawieniach.
- `zakoncz_rozmowe`: gdy senior się żegna.

## Jak to jest zbudowane

Czysty HTML + JavaScript, bez bibliotek i bez kompilacji:

| Plik | Rola |
|---|---|
| `index.html`, `css/style.css` | Ekran aplikacji |
| `js/speech.js` | Lampka, czytanie na głos (`speechSynthesis`), rozpoznawanie mowy (Web Speech API). Oba wbudowane w Chrome/Edge i darmowe. |
| `js/gemini.js` | Zwykły tryb: tekst → Gemini (`generateContent`) → tekst, z obsługą narzędzi. Zawiera też tryb demo. |
| `js/live.js` | Tryb LIVE: Gemini Live API przez WebSocket (mikrofon PCM 16 kHz → serwer → dźwięk 24 kHz). |
| `js/camera.js` | Jedno zdjęcie na żądanie |
| `js/app.js` | Scenariusze, przypomnienia, instrukcja dla AI („Gem”), narzędzia, obsługa ekranu |
| `js/store.js` | Ustawienia i przypomnienia (localStorage) |

Instrukcja dla AI (odpowiednik „Gema”) jest budowana w `AA.buildSystemPrompt` (`js/app.js`). Zawiera profil osoby z ustawień, aktualną godzinę, listę przypomnień i dzisiejsze zdarzenia.

## Koszty i limity

- Zagadywanie po ruchu, przypomnienia i rozpoznawanie „tak / nie” działają **bez AI**, czyli za darmo.
- Zapytanie do AI idzie dopiero, gdy senior odpowie na zagadanie albo odpowiedź na przypomnienie jest niejasna.
- Licznik **„Zapytania AI dziś”** u góry pokazuje, ile zapytań poszło do Gemini.
- Tryb LIVE kończy się sam po 60 s ciszy albo po ustawionym limicie minut.

## Testy automatyczne (dla programisty)

Wymagają Node.js i pakietu `playwright` z przeglądarką Chromium:

```
node tests/smoke.js      # wszystkie scenariusze w trybie demo
node tests/ai-mock.js    # zwykły tryb AI na udawanych odpowiedziach w formacie Gemini
node tests/live-mock.js  # tryb LIVE na udawanym serwerze WebSocket
```

## Ograniczenia tej wersji

- **Nie została przetestowana z prawdziwym kluczem Gemini.** Testy sprawdzają logikę aplikacji na udawanych odpowiedziach, ale nie samo API Google. Jeśli coś nie zadziała po wpisaniu klucza, szczegóły błędu są w zakładce *Dziennik*.
- Rozpoznawanie mowy w Chrome wysyła dźwięk do serwerów Google (to usługa przeglądarki, darmowa).
- Czujniki są symulowane. Prawdziwe wykrywanie ruchu, dźwięków i słowa wybudzającego to kolejny etap (wersja na Raspberry Pi).
- Stan przypomnień jest zapisany w przeglądarce. Wyczyszczenie danych strony je kasuje.
- Wysyłka na Telegram jest opcjonalna i nie była testowana.
