# PowerShell Script to set up and run the Flask app on Windows

# Navigate to the project directory (optional, if needed)
# cd flask_time_management

# Step 1: Create a virtual environment
if (!(Test-Path -Path "./venv")) {
    python -m venv venv
    Write-Host "Virtual environment created."
} else {
    Write-Host "Virtual environment already exists."
}

# Step 2: Activate the virtual environment
Write-Host "Activating virtual environment..."
Set-ExecutionPolicy -Scope Process Bypass -Force
.\venv\Scripts\Activate

# Step 3: Set the path for ffmpeg binaries based on OS
$osName = (Get-CimInstance -ClassName Win32_OperatingSystem).Caption
$scriptPath = (Get-Location).Path  # Get the current script path

if ($osName -like "*Windows*") {
    $ffmpegPath = Resolve-Path "$scriptPath\ffmpeg\win\ffmpeg-2024-10-02-git-358fdf3083-essentials_build\bin"
    $env:FFMPEG_BINARY = "$ffmpegPath\ffmpeg.exe"
    $env:FFPROBE_BINARY = "$ffmpegPath\ffprobe.exe"
} else {
    # Set paths for macOS or other OS when needed
    Write-Host "This script currently only supports Windows."
}

# Step 4: Upgrade pip
Write-Host "Upgrading pip..."
python -m pip install --upgrade pip

# Step 5: Install the requirements
Write-Host "Installing requirements..."
pip install -r requirements.txt

# Step 6: Launch the Flask app
Write-Host "Launching the Flask app..."
python app.py
