@echo off
echo === Kerwen e-pocta (awtomatik) ===
echo.
echo 1) Google App Password sahypasy acylyar...
start https://myaccount.google.com/apppasswords
echo.
echo 2) "App password" doredin (16 harp).
echo 3) Proyektdaky .env faylynda goyun:
echo      MAIL_ENABLED=1
echo      SMTP_USER=kadr.kerwen@gmail.com
echo      SMTP_PASS=xxxx xxxx xxxx xxxx
echo 4) Serweri restart: npm.cmd run dev
echo.
echo Muhim: adaty Gmail paroly ishlemez — dine App Password!
echo.
pause
