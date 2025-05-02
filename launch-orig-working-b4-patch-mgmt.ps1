# Enable strict mode and stop on errors
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Configuration
$rootFolder = "$PSScriptRoot"  # Parent directory where this script resides
$requirementsFile = Join-Path $rootFolder "requirements.txt"
$envFile = Join-Path $rootFolder ".env"
$venvFolder = Join-Path $rootFolder "time_mgmt_venv"
$appFile = Join-Path $rootFolder "app.py"


# Step 1: Ensure the virtual environment is deactivated before cleanup
if ($env:VIRTUAL_ENV) {
    Write-Host "Deactivating virtual environment..." -ForegroundColor Yellow
    deactivate 2>$null
    Remove-Item Env:\VIRTUAL_ENV -ErrorAction SilentlyContinue
    Write-Host "Virtual environment deactivated successfully." -ForegroundColor Green
} else {
    Write-Host "No active virtual environment detected." -ForegroundColor Cyan
}

# Step 2: Remove lingering Python processes
Write-Host "Checking for active Python processes..." -ForegroundColor Cyan
Get-Process | Where-Object {$_.ProcessName -eq "python"} | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "Any active Python processes have been stopped." -ForegroundColor Green

# Step 3: Reset Python environment variables to avoid pointing to the deleted venv
Remove-Item Env:\PYTHONHOME -ErrorAction SilentlyContinue
Remove-Item Env:\PYTHONPATH -ErrorAction SilentlyContinue
Write-Host "Cleared Python environment variables to reset system state." -ForegroundColor Green

# Step 4: Remove existing virtual environment directory
Write-Host "Cleaning existing virtual environment..." -ForegroundColor Yellow
if (Test-Path $venvFolder) {
    try {
        Write-Host "Removing existing virtual environment..." -ForegroundColor Yellow
        cmd /c "rd /s /q $venvFolder"  # Use Windows built-in delete command
        Start-Sleep -Seconds 2
    } catch {
        Write-Host "Warning: Initial cleanup failed, trying alternative method..." -ForegroundColor Yellow
        try {
            Remove-Item -Recurse -Force -Path $venvFolder -ErrorAction Stop
        } catch {
            Write-Host "Warning: Could not delete .venv, please close all Python processes and try again" -ForegroundColor Red
            Exit 1
        }
    }
}


# Step 1: Ensure Python is installed
try {
    $pythonVersion = python --version
    Write-Host "Using $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "Error: Python is not available in the system PATH. Please install Python and try again." -ForegroundColor Red
    Exit 1
}

# Step 2: Create or clean up virtual environment
if (Test-Path $venvFolder) {
    Write-Host "Removing existing virtual environment..." -ForegroundColor Yellow
    try {
        Remove-Item -Recurse -Force -Path $venvFolder -ErrorAction Stop
    } catch {
        Write-Host "Warning: Could not delete venv. Please close all Python processes and try again." -ForegroundColor Red
        Exit 1
    }
}

Write-Host "Creating a new virtual environment..." -ForegroundColor Yellow
python -m venv $venvFolder
if ($LastExitCode -ne 0) {
    Write-Host "Error: Failed to create virtual environment." -ForegroundColor Red
    Exit 1
}

# Step 3: Activate virtual environment
Write-Host "Activating virtual environment..." -ForegroundColor Yellow
. "$venvFolder\Scripts\Activate.ps1"
if ($LastExitCode -ne 0) {
    Write-Host "Error: Failed to activate virtual environment." -ForegroundColor Red
    Exit 1
}

# Step 4: Set the path for ffmpeg binaries
$scriptPath = (Get-Location).Path  # Get the current script path
$ffmpegPath = Resolve-Path "$scriptPath\ffmpeg\win\ffmpeg-2024-10-02-git-358fdf3083-essentials_build\bin"
$env:FFMPEG_BINARY = "$ffmpegPath\ffmpeg.exe"
$env:FFPROBE_BINARY = "$ffmpegPath\ffprobe.exe"
Write-Host "FFmpeg paths set: $env:FFMPEG_BINARY" -ForegroundColor Cyan

# Step 5: Upgrade pip
Write-Host "Upgrading pip..." -ForegroundColor Yellow
python -m pip install --upgrade pip
if ($LastExitCode -ne 0) {
    Write-Host "Error: Failed to upgrade pip." -ForegroundColor Red
    Exit 1
}

# Step 6: Install dependencies
if (Test-Path $requirementsFile) {
    Write-Host "Installing dependencies from requirements.txt..." -ForegroundColor Yellow
    pip install -r $requirementsFile
    if ($LastExitCode -ne 0) {
        Write-Host "Error: Failed to install dependencies." -ForegroundColor Red
        Exit 1
    }
} else {
    Write-Host "Error: requirements.txt not found at $requirementsFile" -ForegroundColor Red
    Exit 1
}

# Step 7: Ensure .env file exists and load environment variables
if (Test-Path $envFile) {
    Write-Host "Loading environment variables from .env file..." -ForegroundColor Yellow
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^[a-zA-Z_][a-zA-Z0-9_]*=') {
            $key, $value = $_ -split '=', 2
            [System.Environment]::SetEnvironmentVariable($key.Trim(), $value.Trim(), [System.EnvironmentVariableTarget]::Process)
        }
    }
} else {
    Write-Host "Warning: .env file not found. Default values will be used." -ForegroundColor Yellow
}

# Step 8: Run the Flask application
Write-Host "Starting the Flask application..." -ForegroundColor Yellow
python $appFile
if ($LastExitCode -ne 0) {
    Write-Host "Error: Failed to start the Flask application." -ForegroundColor Red
    Exit 1
}

Write-Host "Script execution completed successfully!" -ForegroundColor Green
