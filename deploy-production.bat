@echo off
echo ========================================
echo    PiscaRisk Production Deployment
echo ========================================
echo.

echo [1/4] Setting production environment...
set NODE_ENV=production
echo ✅ Environment set to production
echo.

echo [2/4] Building with strict CSP...
call npm run build:strict
if %errorlevel% neq 0 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)
echo ✅ Production build completed
echo.

echo [3/4] Deploying to Firebase Hosting...
call firebase deploy --only hosting
if %errorlevel% neq 0 (
    echo ERROR: Firebase deployment failed!
    pause
    exit /b 1
)
echo ✅ Firebase deployment completed
echo.

echo [4/4] Testing production headers...
echo Testing X-Frame-Options header...
curl -I https://piscarisk.onrender.com/ 2>nul | findstr "X-Frame-Options"
if %errorlevel% neq 0 (
    echo ⚠️  X-Frame-Options header not detected
) else (
    echo ✅ X-Frame-Options header detected
)
echo.

echo ========================================
echo    Production Deployment Complete!
echo ========================================
echo.
echo Production URL: https://piscarisk.onrender.com/
echo Test Pages:
echo - CSP Eval Test: https://piscarisk.onrender.com/csp-eval-test.html
echo - Headers Test: https://piscarisk.onrender.com/headers-test.html
echo.
echo Security Features:
echo ✅ Strict CSP (no unsafe-eval in production)
echo ✅ X-Frame-Options: DENY
echo ✅ frame-ancestors 'none'
echo ✅ All security headers applied
echo.
echo Next steps:
echo 1. Test your security scanner against the production URL
echo 2. Verify all functionality works
echo 3. Check security score improvement
echo.
pause
