# PowerShell Script to set up and run the Flask app on Windows

# Navigate to the project directory
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

# Step 3: Upgrade pip
Write-Host "Upgrading pip..."
python -m pip install --upgrade pip

# Step 4: Install the requirements
Write-Host "Installing requirements..."
pip install -r requirements.txt

# Step 5: Launch the Flask app
Write-Host "Launching the Flask app..."
python app.py
