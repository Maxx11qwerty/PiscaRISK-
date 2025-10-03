@echo off
echo ========================================
echo    PiscaRisk Security Headers Deployment
echo ========================================
echo.

echo [1/6] Verifying configuration files...
if not exist "firebase.json" (
    echo ERROR: firebase.json not found!
    pause
    exit /b 1
)
if not exist "public\_headers" (
    echo ERROR: public\_headers not found!
    pause
    exit /b 1
)
if not exist "build\_headers" (
    echo ERROR: build\_headers not found!
    pause
    exit /b 1
)
echo ✅ Configuration files verified
echo.

echo [2/6] Building React application...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)
echo ✅ React build completed
echo.

echo [3/6] Copying security headers to build directory...
copy "public\_headers" "build\_headers" >nul
if %errorlevel% neq 0 (
    echo ERROR: Failed to copy _headers file!
    pause
    exit /b 1
)
copy "public\web.config" "build\web.config" >nul
if %errorlevel% neq 0 (
    echo ERROR: Failed to copy web.config file!
    pause
    exit /b 1
)
echo ✅ Security headers copied to build directory
echo.

echo [4/6] Deploying to Firebase Hosting...
call firebase deploy --only hosting
if %errorlevel% neq 0 (
    echo ERROR: Firebase deployment failed!
    pause
    exit /b 1
)
echo ✅ Firebase deployment completed
echo.

echo [5/6] Waiting for deployment to propagate...
timeout /t 30 /nobreak >nul
echo ✅ Wait period completed
echo.

echo [6/6] Testing security headers...
echo Testing Firebase Hosting headers...
curl -I https://piscarisk.firebaseapp.com/ 2>nul | findstr "Strict-Transport-Security"
if %errorlevel% neq 0 (
    echo ❌ Strict-Transport-Security header not detected on Firebase
) else (
    echo ✅ Strict-Transport-Security header detected on Firebase
)

curl -I https://piscarisk.firebaseapp.com/ 2>nul | findstr "Content-Security-Policy"
if %errorlevel% neq 0 (
    echo ❌ Content-Security-Policy header not detected on Firebase
) else (
    echo ✅ Content-Security-Policy header detected on Firebase
)

curl -I https://piscarisk.firebaseapp.com/ 2>nul | findstr "X-Frame-Options"
if %errorlevel% neq 0 (
    echo ❌ X-Frame-Options header not detected on Firebase
) else (
    echo ✅ X-Frame-Options header detected on Firebase
)

echo.
echo Testing Render.com headers...
curl -I https://piscarisk.onrender.com/ 2>nul | findstr "Strict-Transport-Security"
if %errorlevel% neq 0 (
    echo ❌ Strict-Transport-Security header not detected on Render
) else (
    echo ✅ Strict-Transport-Security header detected on Render
)

curl -I https://piscarisk.onrender.com/ 2>nul | findstr "Content-Security-Policy"
if %errorlevel% neq 0 (
    echo ❌ Content-Security-Policy header not detected on Render
) else (
    echo ✅ Content-Security-Policy header detected on Render
)

curl -I https://piscarisk.onrender.com/ 2>nul | findstr "X-Frame-Options"
if %errorlevel% neq 0 (
    echo ❌ X-Frame-Options header not detected on Render
) else (
    echo ✅ X-Frame-Options header detected on Render
)

echo.
echo ========================================
echo    Security Headers Deployment Complete!
echo ========================================
echo.
echo Deployment URLs:
echo - Firebase: https://piscarisk.firebaseapp.com/
echo - Render: https://piscarisk.onrender.com/
echo.
echo Test URLs:
echo - Security Headers Test: https://piscarisk.firebaseapp.com/headers-test.html
echo - CSP Test: https://piscarisk.firebaseapp.com/csp-test.html
echo - Production CSP: https://piscarisk.firebaseapp.com/production-csp.html
echo.
echo Security Features Deployed:
echo ✅ Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
echo ✅ Content-Security-Policy: Comprehensive policy for Firebase + Google services
echo ✅ X-Frame-Options: SAMEORIGIN
echo ✅ X-Content-Type-Options: nosniff
echo ✅ Referrer-Policy: strict-origin-when-cross-origin
echo ✅ Permissions-Policy: camera=(self), microphone=(), geolocation=(), interest-cohort=()
echo ✅ Cross-Origin-Opener-Policy: same-origin-allow-popups
echo ✅ Cross-Origin-Embedder-Policy: unsafe-none
echo.
echo Next steps:
echo 1. Run: node test-security-headers.js
echo 2. Test with online security scanners
echo 3. Verify all functionality works with new headers
echo 4. Monitor for any CSP violations in browser console
echo.
pause
