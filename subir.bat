@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === GILDA; - subindo o sistema ===
if not exist .env (
  echo Criando .env...
  (
    echo GILDA_USER=gilda
    echo GILDA_PASSWORD=gilda123
    echo GILDA_SECRET_KEY=e05adf5e4f297918600cd8577b6491c981ae8f227bad204633be58974fefc79c
    echo GILDA_SEED_EXEMPLO=1
    echo GILDA_PORT=11111
  ) > .env
) else (
  echo .env ja existe, ajustando a porta para 11111...
  powershell -NoProfile -Command "(Get-Content .env) -replace '^GILDA_PORT=.*', 'GILDA_PORT=11111' | Set-Content .env"
)
docker compose down >nul 2>&1
docker compose up -d --build
if errorlevel 1 (
  echo.
  echo Algo falhou. Confira se o Docker Desktop esta aberto e tente de novo.
  pause
  exit /b 1
)
echo.
echo Pronto! Abrindo http://localhost:11111 (usuario gilda / senha gilda123)
timeout /t 3 >nul
start http://localhost:11111
pause
