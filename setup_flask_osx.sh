#!/bin/bash
# Bash Script to set up and run the Flask app on Linux/macOS

# Function to check if a package is installed
check_dependency() {
    if [ "$(uname)" == "Darwin" ]; then
        # macOS uses brew
        if ! brew ls --versions "$1" > /dev/null; then
            echo "Error: $1 is not installed."
            echo "Attempting to install $1..."
            brew install "$1" || {
                echo "Error: Failed to install $1. Please install it manually."
                exit 1
            }
        else
            echo "$1 is already installed."
        fi
    elif [ "$(uname)" == "Linux" ]; then
        # Linux uses apt
        if ! dpkg -s "$1" > /dev/null 2>&1; then
            echo "Error: $1 is not installed."
            echo "Attempting to install $1..."
            sudo apt-get install -y "$1" || {
                echo "Error: Failed to install $1. Please install it manually."
                exit 1
            }
        else
            echo "$1 is already installed."
        fi
    else
        echo "Unsupported OS. Please install $1 manually."
        exit 1
    fi
}

# Check required dependencies
echo "Checking for required dependencies..."

# For macOS and Linux, ensure Homebrew/apt and portaudio are installed
check_dependency "portaudio"

# Step 1: Remove existing virtual environment if it exists
if [ -d "venv" ]; then
    echo "Removing existing virtual environment..."
    rm -rf venv
    echo "Virtual environment removed."
fi

# Step 2: Create a new virtual environment
echo "Creating a new virtual environment..."
python3 -m venv venv

if [ $? -eq 0 ]; then
    echo "Virtual environment created successfully."
else
    echo "Error: Virtual environment creation failed."
    exit 1
fi

# Step 3: Activate the virtual environment
if [ -f "venv/bin/activate" ]; then
    echo "Activating virtual environment..."
    source venv/bin/activate
else
    echo "Error: Could not activate the virtual environment. Check if venv was created successfully."
    exit 1
fi

# Step 4: Upgrade pip inside the virtual environment
echo "Upgrading pip in the virtual environment..."
python3 -m pip install --upgrade pip --break-system-packages || {
    echo "Error: Failed to upgrade pip. Make sure pip is not managed externally or use '--break-system-packages'."
    exit 1
}

# Step 5: Install the requirements
echo "Installing requirements from requirements.txt..."
pip install -r requirements.txt || {
    echo "Error: Failed to install requirements."
    exit 1
}

# Step 6: Launch the Flask app
echo "Launching the Flask app..."
python3 app.py
