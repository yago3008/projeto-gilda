@echo off
cd /d "%~dp0"
docker compose down
echo Container projeto-gilda parado (os dados continuam salvos no volume).
pause
