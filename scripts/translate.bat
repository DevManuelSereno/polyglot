@echo off
REM Polyglot Translation Tool wrapper for Windows
REM Uses uv to automatically handle Python and dependencies

where uv >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: uv is not installed.
    echo Install with: powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    echo Or visit: https://docs.astral.sh/uv/getting-started/installation/
    exit /b 1
)

uv run "%~dp0translate.py" %*
