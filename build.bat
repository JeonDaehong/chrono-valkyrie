@echo off
cd /d "%~dp0"
echo Building Electron app...
npm run build:electron
if %ERRORLEVEL% == 0 (
    echo.
    echo Build complete! Output: dist-electron\
    explorer dist-electron
) else (
    echo.
    echo Build failed.
)
pause
