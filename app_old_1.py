from flask import Flask, render_template, request, jsonify, Response, send_file
import pyttsx3
import os
import json
import logging
import pygame
import requests

app = Flask(__name__)

# Setup logging
logging.basicConfig(filename='app.log', level=logging.INFO, format='%(asctime)s:%(levelname)s:%(message)s')

# Initialize pygame for sound playing
pygame.mixer.init()

# Paths for storing data
DATA_FILE_PATH = 'data/reflection_data.json'
TASKS_FILE_PATH = 'data/tasks.json'

# Mantra text to be spoken at the end of the timer
MANTRA_TEXT = """
We are in complete control of our righteous path, manifesting our destiny by focusing on achieving the goals we set for ourselves in our spiritual life, our personal life, and our business life.

Because we know that at minimum, this human realm is run using machinery that uses templates. And we now know how to manipulate the right templates to execute our divine plan of being in complete control of our righteous path.

Now rate what we accomplished and start a new timer.
"""
def add_task(task_name, parent_task=None):
    tasks_data = load_tasks()

    new_task = {
        "title": task_name,
        "description": "",
        "subtasks": [],
        "completed": False,
        "acceptance_criteria": [],
        "test_cases": [],
        "ascii_diagram": "",
        "additional_info": "",
        "related_tasks": []  # Store relationships here
    }

    if parent_task:
        parent_task['subtasks'].append(new_task)
    else:
        tasks_data['tasks'].append(new_task)
    
    save_tasks(tasks_data)
    return new_task

# In-memory data storage for demonstration and analysis
user_data = {
    "reflections": [],
    "task_progress": [],
    "skills": []
}

# Load config.json
try:
    with open('config.json', 'r') as f:
        config = json.load(f)
except FileNotFoundError:
    config = {
        "llm_api": {
            "system_message": "No config file found",
            "model": "",
            "url": "",
            "temperature": 0.7,
            "top_p": 0.9,
            "top_k": 40,
            "max_tokens": 500
        }
    }

# Function to load reflection data from the JSON file
def load_reflection_data():
    if os.path.exists(DATA_FILE_PATH):
        with open(DATA_FILE_PATH, 'r') as file:
            return json.load(file)
    else:
        return {"reflections": []}

# Function to save reflection data to the JSON file
def save_reflection_data(data):
    with open(DATA_FILE_PATH, 'w') as file:
        json.dump(data, file, indent=4)

# Function to update in-memory data for insights
def update_insights(reflection):
    user_data["reflections"].append(reflection)
    user_data["task_progress"].append(reflection["task_progress"])
    if reflection["new_skills"]:
        user_data["skills"].append(reflection["new_skills"])

# Function to load tasks from the JSON file with error handling
def load_tasks():
    if os.path.exists(TASKS_FILE_PATH):
        try:
            with open(TASKS_FILE_PATH, 'r') as file:
                data = file.read().strip()
                if not data:
                    return {"tasks": []}
                return json.loads(data)
        except json.JSONDecodeError:
            return {"tasks": []}
    else:
        return {"tasks": []}

# Function to save tasks to the JSON file
def save_tasks(data):
    with open(TASKS_FILE_PATH, 'w') as file:
        json.dump(data, file, indent=4)

# Route to add a new task
@app.route('/add_task', methods=['POST'])
def add_task():
    task_name = request.form['task']
    
    # Load existing tasks
    tasks_data = load_tasks()

    # Add the new task with default settings from config.json
    new_task = {
        "task": task_name,
        "completed": False,
        "subtasks": [],
        "notes": "Auto-generated task",
        "recommended_llm_settings": {
            "temperature": config["llm_api"]["temperature"],
            "top_p": config["llm_api"]["top_p"],
            "top_k": config["llm_api"]["top_k"],
            "max_tokens": config["llm_api"]["max_tokens"],
            "system_message": "Generate subtasks and insights."
        }
    }

    tasks_data['tasks'].append(new_task)
    
    # Save updated tasks
    save_tasks(tasks_data)
    
    return jsonify({"message": "Task added successfully", "task": task_name}), 200

# Route to get all tasks
@app.route('/get_tasks', methods=['GET'])
def get_tasks():
    tasks_data = load_tasks()
    return jsonify(tasks_data), 200

# Route to handle reflection data submission (merged both JSON and in-memory saving)
@app.route('/submit_reflection', methods=['POST'])
def submit_reflection():
    reflection = request.json

    # Save reflection data to in-memory storage for analysis
    update_insights(reflection)

    # Load existing reflection data from the JSON file
    data = load_reflection_data()

    # Append the new reflection
    data["reflections"].append(reflection)

    # Save the updated data back to the JSON file
    save_reflection_data(data)

    return jsonify({"message": "Reflection submitted successfully"}), 200

# Route to retrieve reflection data for chart generation
@app.route('/get_reflection_data', methods=['GET'])
def get_reflection_data():
    data = load_reflection_data()
    return jsonify(data)

# Route to analyze reflection data and generate insights
@app.route('/analyze_reflection', methods=['GET'])
def analyze_reflection():
    emotional_trends = {}
    progress_summary = sum(user_data["task_progress"]) / len(user_data["task_progress"]) if user_data["task_progress"] else 0
    skills_summary = {skill: user_data["skills"].count(skill) for skill in set(user_data["skills"])}

    for reflection in user_data["reflections"]:
        emotion = reflection["emotional_state"]
        emotional_trends[emotion] = emotional_trends.get(emotion, 0) + 1

    return jsonify({
        "emotional_trends": emotional_trends,
        "progress_summary": progress_summary,
        "skills_summary": skills_summary
    }), 200

@app.route('/test_requests', methods=['GET'])
def test_requests():
    try:
        # Send a test request to a public API
        response = requests.get('https://jsonplaceholder.typicode.com/posts/1')
        data = response.json()
        return jsonify(data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Serve the mantra text to the frontend if needed
@app.route('/mantra_text', methods=['GET'])
def get_mantra_text():
    return jsonify({"mantra": MANTRA_TEXT})

# Function to play audio using pygame
def play_sound(file_path):
    pygame.mixer.music.load(file_path)
    pygame.mixer.music.play()

# Route to generate speech audio on the server and send it to the client
@app.route('/generate_audio', methods=['POST'])
def generate_audio():
    text = request.json.get('text', '')
    engine = pyttsx3.init()
    engine.setProperty('rate', 250)  # Speed of speech

    # Save the speech to a file
    audio_file = os.path.join(app.static_folder, 'media/audio/generated_speech.mp3')
    engine.save_to_file(text, audio_file)
    engine.runAndWait()

    return send_file(audio_file, mimetype='audio/mp3')

# Static route for audio files if needed
@app.route('/audio/<filename>')
def get_audio_file(filename):
    audio_path = os.path.join('static', 'media', 'audio', filename)
    if os.path.exists(audio_path):
        return send_file(audio_path, mimetype='audio/wav')
    else:
        return jsonify({"error": "File not found"}), 404

@app.route('/')
def index():
    try:
        system_message = config['llm_api'].get('system_message', 'Default system message')
        llm_config = config['llm_api']
    except KeyError as e:
        return f"Missing key in config: {e}", 500

    return render_template('index.html', system_message=system_message, llm_config=llm_config)

# Helper function to log events
def log_event(event_type, content, additional_info=None):
    logging.info(f"Event: {event_type} | Content: {content}")
    if additional_info:
        logging.info(f"Additional Info: {additional_info}")

# Function to get the full response if streaming is disabled
def get_llm_response(llm_request_data):
    try:
        url = config['llm_api']['url']
        response = requests.post(url, json=llm_request_data)
        response.raise_for_status()
        return response.text
    except requests.RequestException as e:
        log_event('LLM Request Error', str(e))
        return f'Error: {str(e)}'

# Streaming response handler for LLM
def stream_llm_response(llm_request_data):
    try:
        url = config['llm_api']['url']
        with requests.post(url, json=llm_request_data, stream=True) as response:
            response.raise_for_status()

            previous_token = None  # Track the previous token
            buffer = ''  # Buffer for accumulating chunks
            tokenBuffer = []  # Buffer for tokens to be appended together
            bufferThreshold = 5  # Number of tokens to buffer before sending them

            # Process the stream content
            for chunk in response.iter_content(chunk_size=None):
                if chunk:
                    chunk_str = chunk.decode('utf-8')
                    buffer += chunk_str

                    # Split buffer into lines
                    lines = buffer.split('\n')
                    for line in lines[:-1]:  # Process all lines except the last incomplete one
                        line = line.strip()

                        # Process lines that start with "data:"
                        if line.startswith("data:"):
                            token = line[5:].strip()

                            # End of stream
                            if token == "[DONE]":
                                yield "data:[DONE]\n\n"
                                return

                            try:
                                token_json = json.loads(token)
                                delta_content = token_json['choices'][0]['delta'].get('content', '')

                                if delta_content and delta_content != previous_token:
                                    previous_token = delta_content
                                    tokenBuffer.append(delta_content)

                                    if len(tokenBuffer) >= bufferThreshold:
                                        yield f"data:{' '.join(tokenBuffer)}\n\n"
                                        tokenBuffer = []

                            except json.JSONDecodeError:
                                log_event('LLM Stream Error', f'Invalid JSON format: {token}')
                                yield f"data:Error: Invalid response format\n\n"

                    buffer = lines[-1]

            if tokenBuffer:
                yield f"data:{' '.join(tokenBuffer)}\n\n"

    except requests.RequestException as e:
        log_event('LLM Stream Error', str(e))
        yield f"data:Error: {str(e)}\n\n"

@app.route('/submit_llm', methods=['POST'])
def submit_llm():
    data = request.get_json()
    logging.info(f"Received LLM request: {data}")

    try:
        llm_request_data = {
            "model": config['llm_api']['model'],
            "messages": [
                {"role": "system", "content": data['system_message']},
                {"role": "user", "content": data['prompt']}
            ],
            "temperature": data['temperature'],
            "top_p": data['top_p'],
            "top_k": data['top_k'],
            "max_tokens": data['max_tokens'],
            "stream": data.get('stream', True)
        }
        logging.info(f"LLM request data prepared: {llm_request_data}")
    except KeyError as e:
        logging.error(f"KeyError in LLM request data: {e}")
        return jsonify({"error": f"Missing key in LLM request data: {e}"}), 400

    if data.get('stream', True):
        return Response(stream_llm_response(llm_request_data), mimetype='text/plain')
    else:
        full_response = get_llm_response(llm_request_data)
        logging.info(f"Full LLM response: {full_response}")
        
        # Parse response and return JSON
        try:
            json_response = json.loads(full_response)
            return jsonify(json_response)
        except ValueError:
            logging.error("Error parsing LLM response")
            return jsonify({"error": "Invalid response format"}), 500

if __name__ == '__main__':
    app.run(debug=True)
