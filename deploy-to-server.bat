@echo off
REM =====================================================
REM  Ergovia Alignment Deployment Script
REM  2-step deploy: 1 upload + 1 SSH = only 2 password prompts
REM  Pre-built archive: C:\Temp\ergovia-deploy.zip (112KB)
REM  Run from: c:\Users\gabri\OneDrive\Documents\ERGOVIA-2\
REM =====================================================

set SERVER=root@116.203.115.12
set PSCP="C:\Program Files\PuTTY\pscp.exe"
set PLINK="C:\Program Files\PuTTY\plink.exe"
set ZIPFILE=C:\Temp\ergovia-deploy.zip

echo ===================================================
echo  Ergovia Alignment Deployment  ^|  Target: %SERVER%
echo ===================================================
echo.

if not exist %ZIPFILE% (
    echo ERROR: Archive not found at %ZIPFILE%
    echo Re-run Claude Code to regenerate it.
    pause
    exit /b 1
)

echo [1/2] Uploading archive to server (enter password when prompted)...
%PSCP% %ZIPFILE% %SERVER%:/tmp/ergovia-deploy.zip
if %ERRORLEVEL% neq 0 (
    echo ERROR: Upload failed.
    pause
    exit /b 1
)
echo       Upload OK (112 KB)
echo.

echo [2/2] Extracting, deploying, restarting (enter password when prompted)...
%PLINK% %SERVER% "set -e; echo '--- Extracting files ---'; apt-get install -qq unzip 2>/dev/null || true; unzip -o /tmp/ergovia-deploy.zip -d /tmp/ergovia-staging; echo '--- Copying files ---'; mkdir -p /opt/optimized_workflows; cp /tmp/ergovia-staging/optimized_workflows/*.json /opt/optimized_workflows/; cp /tmp/ergovia-staging/ergovia-lite/server.js /opt/ergovia-lite/server.js; cp /tmp/ergovia-staging/ergovia-lite/db.js /opt/ergovia-lite/db.js; cp /tmp/ergovia-staging/ergovia-lite/services/v2-data.js /opt/ergovia-lite/services/v2-data.js; cp /tmp/ergovia-staging/ergovia-lite/services/n8n.js /opt/ergovia-lite/services/n8n.js; cp /tmp/ergovia-staging/ergovia-lite/public/v2/conversations.html /opt/ergovia-lite/public/v2/; cp /tmp/ergovia-staging/ergovia-lite/public/v2/calendar.html /opt/ergovia-lite/public/v2/; cp /tmp/ergovia-staging/ergovia-lite/public/v2/dashboard.html /opt/ergovia-lite/public/v2/; cp /tmp/ergovia-staging/ergovia-lite/public/v2/settings.html /opt/ergovia-lite/public/v2/; cp /tmp/ergovia-staging/ergovia-lite/public/v2/m1-dashboard.html /opt/ergovia-lite/public/v2/; cp /tmp/ergovia-staging/ergovia-lite/public/v2/m1-config.html /opt/ergovia-lite/public/v2/; cp /tmp/ergovia-staging/ergovia-lite/public/v2/assets/css/main.css /opt/ergovia-lite/public/v2/assets/css/; cp /tmp/ergovia-staging/ergovia-lite/public/v2/assets/js/dashboard.js /opt/ergovia-lite/public/v2/assets/js/; cp /tmp/ergovia-staging/ergovia-lite/public/v2/assets/js/fillup-form.js /opt/ergovia-lite/public/v2/assets/js/; cp /tmp/ergovia-staging/ergovia-lite/public/v2/assets/js/sync.js /opt/ergovia-lite/public/v2/assets/js/; cp /tmp/ergovia-staging/ergovia-lite/scripts/deploy-alignment-updates.js /opt/ergovia-lite/scripts/; echo '--- All 18 files copied ---'; echo '--- Restarting PM2 ---'; pm2 restart ergovia-lite; sleep 4; echo '--- Deploying WF1/WF6/WF7 to n8n ---'; cd /opt/ergovia-lite && node scripts/deploy-alignment-updates.js; echo '--- Running smoke tests ---'; node scripts/smoke-test.js; echo '=== DEPLOYMENT COMPLETE ==='"

echo.
echo ===================================================
echo Done! Check output above for any errors.
echo ===================================================
pause
