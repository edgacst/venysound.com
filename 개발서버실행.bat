@echo off
chcp 65001 >nul
echo 5000번 포트를 사용 중인 프로그램을 정리한 뒤 개발 서버를 켭니다...
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do (
  taskkill /PID %%a /F >nul 2>&1
  echo 기존 5000번 사용을 종료했습니다.
)
timeout /t 1 /nobreak >nul

echo.
echo 개발 서버를 시작합니다. 브라우저에서 http://localhost:5000 으로 접속하세요.
echo 종료하려면 이 창을 닫으세요.
echo.

cd /d "%~dp0"
call npm run dev

pause
