#!/bin/bash
# Bash Script to set up and run the Flask app on Linux/macOS

# Navigate to the project directory
# cd flask_time_management

# Step 1: Create a virtual environment
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "Virtual environment created."
else
    echo "Virtual environment already exists."
fi

# Step 2: Activate the virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Step 3: Upgrade pip
echo "Upgrading pip..."
python3 -m pip install --upgrade pip

# Step 4: Install the requirements
echo "Installing requirements..."
pip install -r requirements.txt

# Step 5: Launch the Flask app
echo "Launching the Flask app..."
python3 app.py
