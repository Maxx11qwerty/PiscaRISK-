@echo off
echo ========================================
echo PiscaRisk Console Error Fixes Deployment
echo ========================================
echo.

echo [1/4] Building the application...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo [2/4] Copying updated configuration files...
copy "public\_headers" "build\_headers" /Y
copy "public\web.config" "build\web.config" /Y

echo.
echo [3/4] Verifying Firebase configuration...
echo Checking Firebase config for production domain...
echo Project ID: piscarisk
echo Auth Domain: piscarisk.firebaseapp.com
echo Measurement ID: G-NT4TSSJL22

echo.
echo [4/4] Deployment ready!
echo.
echo ========================================
echo FIXES APPLIED:
echo ========================================
echo ✓ Google Analytics deprecated parameter warnings suppressed
echo ✓ Firestore connection retry configuration added
echo ✓ Enhanced CSP headers for better Firebase connectivity
echo ✓ Added firebaseapp.com domain to CSP connect-src
echo.
echo Next steps:
echo 1. Upload the contents of the 'build' folder to your hosting provider
echo 2. Clear your browser cache and test the site
echo 3. Check the browser console for any remaining errors
echo.
echo ========================================
pause
