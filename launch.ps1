# Enable strict mode and stop on errors
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Configuration
$rootFolder = "$PSScriptRoot"
$requirementsFile = Join-Path $rootFolder "requirements.txt"
$envFile = Join-Path $rootFolder ".env"
$venvFolder = Join-Path $rootFolder "time_mgmt_venv"
$appFile = "app.py"
$port = 4020

# Virtual environment cleanup
if ($env:VIRTUAL_ENV) {
    Write-Host "Deactivating virtual environment..." -ForegroundColor Yellow
    deactivate 2>$null
    Remove-Item Env:\VIRTUAL_ENV -ErrorAction SilentlyContinue
}

Get-Process | Where-Object {$_.ProcessName -eq "python"} | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item Env:\PYTHONHOME -ErrorAction SilentlyContinue
Remove-Item Env:\PYTHONPATH -ErrorAction SilentlyContinue

if (Test-Path $venvFolder) {
    cmd /c "rd /s /q $venvFolder"
    Start-Sleep -Seconds 2
}

# Create and activate venv
python -m venv $venvFolder
. "$venvFolder\Scripts\Activate.ps1"

# Set FFMPEG binaries if used
$ffmpegPath = Resolve-Path "$rootFolder\ffmpeg\win\ffmpeg-2024-10-02-git-358fdf3083-essentials_build\bin"
$env:FFMPEG_BINARY = "$ffmpegPath\ffmpeg.exe"
$env:FFPROBE_BINARY = "$ffmpegPath\ffprobe.exe"

# Install dependencies
python -m pip install --upgrade pip
if (Test-Path $requirementsFile) {
    pip install -r $requirementsFile
} else {
    Write-Host "requirements.txt not found" -ForegroundColor Red
    Exit 1
}

# Load environment variables
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^[a-zA-Z_][a-zA-Z0-9_]*=') {
            $key, $value = $_ -split '=', 2
            [System.Environment]::SetEnvironmentVariable($key.Trim(), $value.Trim(), [System.EnvironmentVariableTarget]::Process)
        }
    }
}

# Set Flask-specific environment variables for hot reload
$env:FLASK_APP = $appFile
$env:FLASK_ENV = "development"

# Start Flask app with hot reload
Write-Host "Starting the Flask application with hot reload on port $port..." -ForegroundColor Green
Start-Process -NoNewWindow -FilePath "python" -ArgumentList "-m flask run --host 0.0.0.0 --port $port"
