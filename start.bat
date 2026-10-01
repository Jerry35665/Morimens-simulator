@echo off
cd /d "%~dp0"
echo 忘却前夜战斗模拟器启动中...
start "" http://127.0.0.1:8768
node server.js
pause
