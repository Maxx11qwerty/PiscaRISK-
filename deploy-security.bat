@echo off
echo ========================================
echo    PiscaRisk Security Deployment
echo ========================================
echo.

echo [1/4] Building React app...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)
echo ✅ Build completed successfully
echo.

echo [2/4] Deploying to Firebase Hosting...
call firebase deploy --only hosting
if %errorlevel% neq 0 (
    echo ERROR: Firebase deployment failed!
    pause
    exit /b 1
)
echo ✅ Firebase deployment completed
echo.

echo [3/4] Testing headers...
echo Testing X-Frame-Options header...
curl -I https://piscarisk.onrender.com/ 2>nul | findstr "X-Frame-Options"
if %errorlevel% neq 0 (
    echo ⚠️  X-Frame-Options header not detected
) else (
    echo ✅ X-Frame-Options header detected
)
echo.

echo [4/4] Security test pages available:
echo - Headers Test: https://piscarisk.onrender.com/headers-test.html
echo - Production CSP: https://piscarisk.onrender.com/production-csp.html
echo.

echo ========================================
echo    Deployment Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Test your security scanner against the deployed URL
echo 2. Check headers-test.html for configuration details
echo 3. Use production-csp.html for maximum security score
echo.
pause
