@echo off
chcp 65001 > nul
title 皮卡學院官方網站 - 後端伺服器 (Pika Academy)
echo ========================================================
echo  正在啟動 皮卡學院 官方後端伺服器 (Python + SQLite)...
echo ========================================================
echo.
echo  官方網站網址: http://localhost:5000
echo  提示：按 Ctrl + C 可關閉伺服器。
echo ========================================================
echo.
timeout /t 1 > nul
start "" "http://localhost:5000"
python "%~dp0server.py"
if %errorlevel% neq 0 (
    echo.
    echo [錯誤] 伺服器異常終止，錯誤碼: %errorlevel%
    pause
)
pause
