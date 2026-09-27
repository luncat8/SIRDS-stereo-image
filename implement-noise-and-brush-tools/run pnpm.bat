@echo off
setlocal
set CMD=%~1
if "%CMD%"=="" set CMD=dev
echo Using pnpm
pnpm install
pnpm run %CMD%
pause
endlocal
