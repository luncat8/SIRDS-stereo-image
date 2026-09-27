@echo off
setlocal
set PM=bun
where node >nul 2>nul && if not errorlevel 1 set PM=npm
if exist bun.lock set PM=bun
if exist package-lock.json set PM=npm
:menu
echo Using %PM%
call %PM% install
echo.
echo Select command:
echo   1. dev
echo   2. build
echo   3. preview
set /p SEL="Enter number (1-3): "
if "%SEL%"=="1" call %PM% run dev
if "%SEL%"=="2" call %PM% run build
if "%SEL%"=="3" call %PM% run preview
if not "%SEL%"=="" goto menu
pause
endlocal
