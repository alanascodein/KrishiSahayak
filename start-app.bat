@echo off
title KrishiSahayak AI - local server
cd /d "%~dp0"

echo.
echo  Starting KrishiSahayak AI at http://localhost:8000
echo  Keep this window open while using the app. Press Ctrl+C to stop.
echo.

rem Open the login page after the server has had a moment to start
start "" cmd /c "timeout /t 2 >nul & start "" http://localhost:8000/login.html"

rem Try the py launcher first (installed with real Python installs), then python
where py >nul 2>nul && (py -m http.server 8000 & goto :eof)
where python >nul 2>nul && (python -m http.server 8000 & goto :eof)

echo  Python was not found on this PC. Two options:
echo    1) Install Python from https://www.python.org/downloads/   ^(easiest^)
echo    2) Or serve with Node.js instead:   npx serve .
echo.
echo  IMPORTANT: browsers only offer to save passwords on http://localhost
echo  pages - never on file:// pages opened by double-clicking login.html.
pause
