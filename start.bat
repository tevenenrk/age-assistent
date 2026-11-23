@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Asystent Seniora - uruchomienie testowe.
rem Z Pythonem: lokalny serwer (przegladarka zapamieta zgode na mikrofon).
rem Bez Pythona: otwiera plik bezposrednio (zgoda na mikrofon moze byc pytana czesciej).
py --version >/dev/null 2>/dev/null && goto :py
python --version >/dev/null 2>/dev/null && goto :python
echo Nie znaleziono Pythona - otwieram plik bezposrednio.
start "" "%~dp0index.html"
goto :eof
:py
echo Serwer: http://localhost:8765  (zamknij to okno, aby zatrzymac)
start "" "http://localhost:8765/index.html"
py -m http.server 8765 --bind 127.0.0.1
goto :eof
:python
echo Serwer: http://localhost:8765  (zamknij to okno, aby zatrzymac)
start "" "http://localhost:8765/index.html"
python -m http.server 8765 --bind 127.0.0.1
