@echo off
rem Daily CIS Oracle SaaS assessment for the organisation (Windows Task Scheduler).
rem The daily run is what lets 4.2.1 compare today's payment setups with yesterday's.
setlocal
set PYTHONUTF8=1
set TENANT=04bffbdc-99c8-4ced-9e81-e67532119c7d
cd /d "%~dp0.."
if not exist logs mkdir logs
echo ==== %DATE% %TIME% >> logs\oracle-cis-daily.log
.venv\Scripts\python.exe manage.py run_oracle_cis --tenant %TENANT% >> logs\oracle-cis-daily.log 2>&1
