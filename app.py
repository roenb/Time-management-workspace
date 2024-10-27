import subprocess
from flask import Flask, render_template, request, jsonify, Response, send_file
import pyttsx3
import os
import json
import logging
import pygame
import requests
import platform
import speech_recognition as sr
from pydub import AudioSegment
from io import BytesIO
import ffmpeg
import threading
import time
from werkzeug.utils import secure_filename
from textblob import TextBlob
import spacy
import datetime

from spacy.cli import download

# Try loading the model, and if not found, download it
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    print("Downloading 'en_core_web_sm' model...")
    download("en_core_web_sm")
    nlp = spacy.load("en_core_web_sm")


app = Flask(__name__)
AUDIO_SAVE_DIR = os.path.join(os.getcwd(), "saved_audio")
# Keep audio files from the last 5 minutes only
MAX_FILE_AGE_SECONDS = 300  # 5 minutes = 300 seconds
FULL_TRANSCRIPTION_LOG_PATH = os.path.join(os.getcwd(), "logs", "full_transcription_log.txt")

# Initialize paths
os.makedirs(AUDIO_SAVE_DIR, exist_ok=True)
os.makedirs(os.path.dirname(FULL_TRANSCRIPTION_LOG_PATH), exist_ok=True)

# Setup logging
logging.basicConfig(filename='app.log', level=logging.INFO, format='%(asctime)s:%(levelname)s:%(message)s')


# Cache for detected commands
command_cache = []


# Function to check for a wide range of commands within transcribed text
def check_for_command(transcribed_text):
    lower_text = transcribed_text.lower().strip()

    # Define a large set of possible commands
    command_mapping = {
        "start task": "start_task",
        "stop task": "stop_task",
        "switch to task": "switch_task",
        "complete task": "complete_task",
        "add task": "add_task",
        "save task": "save_task",
        "delete task": "delete_task",
        "submit chat": "submit_chat",
        "switch to chat": "switch_chat",
        "start timer": "start_timer",
        "stop timer": "stop_timer",
        "set timer for": "set_timer",
        "pause timer": "pause_timer",
        "resume timer": "resume_timer",
        "start recording": "start_recording",
        "stop recording": "stop_recording"
    }

    # Check if the transcribed text contains any command
    for command_phrase, command_key in command_mapping.items():
        if command_phrase in lower_text and command_key not in command_cache:
            log_issued_commands(command_key)
            return command_key

    return None

# Cleanup old audio files every few minutes
def cleanup_old_audio_files():
    while True:
        current_time = time.time()
        for filename in os.listdir(AUDIO_SAVE_DIR):
            file_path = os.path.join(AUDIO_SAVE_DIR, filename)
            if os.path.isfile(file_path):
                file_creation_time = os.path.getctime(file_path)
                file_age = current_time - file_creation_time

                if file_age > MAX_FILE_AGE_SECONDS:
                    logging.info(f"Removing old file: {file_path} (Age: {file_age} seconds)")
                    os.remove(file_path)
        time.sleep(60)  # Check every minute

# Start background thread for cleanup
cleanup_thread = threading.Thread(target=cleanup_old_audio_files, daemon=True)
cleanup_thread.start()


# File path for full transcription log
FULL_TRANSCRIPTION_LOG_PATH = os.path.join(os.getcwd(), "logs", "full_transcription_log.txt")
os.makedirs(os.path.dirname(FULL_TRANSCRIPTION_LOG_PATH), exist_ok=True)

# Function to log transcriptions with timestamps
def log_full_transcription(transcribed_text, additional_info=None):
    with open(FULL_TRANSCRIPTION_LOG_PATH, 'a') as log_file:
        timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_entry = f"[{timestamp}] Transcription: {transcribed_text}\n"
        
        if additional_info:
            log_entry += f"Additional Info: {additional_info}\n"
        
        log_file.write(log_entry)

# Function to periodically log transcriptions (every 5 minutes)
def periodic_transcription_log(transcribed_text):
    log_full_transcription(transcribed_text)
    additional_info = {"command_cache": command_cache}
    log_full_transcription("", additional_info=additional_info)

# Function to log issued commands
def log_issued_commands(command):
    with open(FULL_TRANSCRIPTION_LOG_PATH, 'a') as log_file:
        timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_file.write(f"[{timestamp}] Command Issued: {command}\n")
    command_cache.append(command)

@app.errorhandler(500)
def handle_internal_error(error):
    logging.error(f"Server encountered an internal error: {error}")
    return jsonify({"error": "Internal server error occurred."}), 500


def set_ffmpeg_paths():
    current_os = platform.system()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    if current_os == "Windows":
        ffmpeg_path = os.path.join(script_dir, "ffmpeg", "win", "ffmpeg-2024-10-02-git-358fdf3083-essentials_build", "bin")
    elif current_os == "Darwin":
        ffmpeg_path = os.path.join(script_dir, "ffmpeg", "osx")
    else:
        ffmpeg_path = os.path.join(script_dir, "ffmpeg", "linux")

    os.environ["FFMPEG_BINARY"] = os.path.join(ffmpeg_path, "ffmpeg")
    os.environ["FFPROBE_BINARY"] = os.path.join(ffmpeg_path, "ffprobe")
    os.environ["FFPLAY_BINARY"] = os.path.join(ffmpeg_path, "ffplay")

set_ffmpeg_paths()
pygame.mixer.init()

# Transcoding function (restored FFmpeg logic)
def transcode_audio_to_wav(input_path, output_path):
    """
    Use FFmpeg to convert WebM audio file to WAV.
    """
    try:
        command = f'ffmpeg -i "{input_path}" -loglevel error -y "{output_path}"'
        process = subprocess.run(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        if process.returncode != 0:
            logging.error(f"FFmpeg transcoding failed: {process.stderr.decode('utf-8')}")
            raise Exception("FFmpeg transcoding failed")

        logging.info(f"Audio transcoded to WAV: {output_path}")
    except Exception as e:
        logging.error(f"Transcoding error: {e}")
        raise e


DATA_FILE_PATH = 'data/reflection_data.json'
TASKS_FILE_PATH = 'data/tasks.json'


# Mantra text to be spoken at the end of the timer
MANTRA_TEXT = """
We are in complete control of our righteous path, manifesting our destiny by focusing on achieving the goals we set for ourselves in our spiritual life, our personal life, and our business life.

Because we know that at minimum, this human realm is run using machinery that uses templates. And we now know how to manipulate the right templates to execute our divine plan of being in complete control of our righteous path.

Now rate what we accomplished and start a new timer.
"""

# Load the config from 'config.json'
def load_config():
    config_path = 'config.json'
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            return json.load(f)
    else:
        # Provide default config in case config.json is missing
        return {
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

# Load the configuration
config = load_config()

# Cache for transcriptions and detected commands
transcription_cache = []
command_cache = []

# Function to check for commands
def check_for_command(transcribed_text):
    lower_text = transcribed_text.lower()

    if "start task" in lower_text and "start task" not in command_cache:
        command_cache.append("start task")
        return "start_task"
    elif "stop timer" in lower_text and "stop timer" not in command_cache:
        command_cache.append("stop timer")
        return "stop_timer"
    return None

# NLP Functions for Sentiment, Keywords, Entities
def analyze_sentiment(text):
    blob = TextBlob(text)
    return blob.sentiment

def extract_keywords(text):
    doc = nlp(text)
    return [chunk.text for chunk in doc.noun_chunks]

def extract_entities(text):
    doc = nlp(text)
    return [(ent.text, ent.label_) for ent in doc.ents]

# Function to add or update a task
def add_task(task_name, parent_task=None):
    tasks_data = load_tasks()

    new_task = {
        "id": len(tasks_data['tasks']) + 1,  # Assign a unique ID
        "title": task_name,
        "description": "",
        "subtasks": [],
        "completed": False,
        "acceptance_criteria": [],
        "test_cases": [],
        "uml_diagram": "",
        "ascii_diagram": "",
        "additional_info": "",
        "related_tasks": [],
        "context": "",  # New field for context
        "recommended_llm_settings": {
            "temperature": config["llm_api"]["temperature"],
            "top_p": config["llm_api"]["top_p"],
            "top_k": config["llm_api"]["top_k"],
            "max_tokens": config["llm_api"]["max_tokens"],
            "system_message": "Generate subtasks, test cases, acceptance criteria, and insights."
        }
    }

    if parent_task:
        parent_task['subtasks'].append(new_task)
    else:
        tasks_data['tasks'].append(new_task)
    
    # Sort tasks by ID before saving
    tasks_data['tasks'].sort(key=lambda task: task['id'])
    save_tasks(tasks_data)
    return new_task


# Function to update task content based on hashtag (acceptance criteria, test cases, UML, etc.)
def update_task_by_hashtag(task_id, response_content, hashtag):
    tasks_data = load_tasks()
    
    # Find the task by matching its ID instead of using an index
    task = next((t for t in tasks_data['tasks'] if t['id'] == task_id), None)

    if task is None:
        # Return None if the task with the given ID was not found
        return None

    # Parse the response based on the hashtag and update the relevant field
    if hashtag == "#gentestcases":
        task["test_cases"] = response_content.get("test_cases", [])
    
    elif hashtag == "#gencriteria":
        task["acceptance_criteria"] = response_content.get("acceptance_criteria", [])
    
    elif hashtag == "#genuml":
        task["uml_diagram"] = response_content.get("uml_diagram", "")
    
    elif hashtag == "#genascii":
        task["ascii_diagram"] = response_content.get("ascii_diagram", "")
    
    elif hashtag == "#addnotes":
        task["additional_info"] = response_content.get("additional_info", "")
    
    elif hashtag == "#contextupdate":
        task["context"] = response_content.get("context", "")
    
    # Handle other potential hashtags for future extensions
    else:
        # Log or raise an error if the hashtag is unrecognized
        return {"error": f"Unknown hashtag: {hashtag}"}
    
    # Save the updated task data
    save_tasks(tasks_data)
    
    return task


# Function to load tasks from the JSON file with error handling
def load_tasks():
    if os.path.exists(TASKS_FILE_PATH):
        try:
            with open(TASKS_FILE_PATH, 'r') as file:
                data = file.read().strip()
                if not data:
                    return {"tasks": []}
                tasks = json.loads(data)
                tasks['tasks'].sort(key=lambda task: task['id'])  # Sort tasks by ID before returning
                return tasks
        except json.JSONDecodeError:
            return {"tasks": []}
    else:
        return {"tasks": []}


# Function to save tasks to the JSON file
def save_tasks(data):
    with open(TASKS_FILE_PATH, 'w') as file:
        json.dump(data, file, indent=4)
@app.route('/start_timer', methods=['POST'])
def start_timer():
    # Logic to start the timer dynamically from the backend
    return jsonify({"message": "Timer started successfully"}), 200

@app.route('/stop_timer', methods=['POST'])
def stop_timer():
    # Logic to stop the timer dynamically from the backend
    return jsonify({"message": "Timer stopped successfully"}), 200

@app.route('/set_timer', methods=['POST'])
def set_timer():
    duration = request.json.get('duration', 0)
    unit = request.json.get('unit', 'seconds')
    
    # Logic to convert duration and unit into a timer
    total_seconds = 0
    if unit == 'minutes':
        total_seconds = duration * 60
    elif unit == 'hours':
        total_seconds = duration * 3600
    else:
        total_seconds = duration
    
    return jsonify({"message": f"Timer set for {duration} {unit}"}), 200

@app.route('/')
def index():
    try:
        system_message = config['llm_api'].get('system_message', 'Default system message')
        llm_config = config['llm_api']
    except KeyError as e:
        return f"Missing key in config: {e}", 500

    # Pass the MANTRA_TEXT to the template
    return render_template('index.html', system_message=system_message, llm_config=llm_config, mantra_text=MANTRA_TEXT)


@app.route('/save_audio', methods=['POST'])
def save_audio():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400

    audio_file = request.files['audio']
    filename = request.form.get('filename')

    if not filename:
        timestamp = time.strftime('%Y%m%d-%H%M%S')
        filename = f'audio_{timestamp}.webm'
    else:
        filename = secure_filename(filename)

    # Save the audio file in the "saved_audio" directory
    audio_save_path = os.path.join(AUDIO_SAVE_DIR, filename)
    audio_file.save(audio_save_path)

    # Optionally, return some dummy text for now to see if it's processed:
    return jsonify({'message': 'Audio saved', 'file_path': audio_save_path, 'transcribed_text': 'Dummy transcription'}), 200


# Route to add a new task
@app.route('/add_task', methods=['POST'])
def add_task_route():
    task_name = request.form['task']
    
    # Load existing tasks
    tasks_data = load_tasks()

    # Add the new task
    new_task = add_task(task_name)
    
    return jsonify({"message": "Task added successfully", "task": task_name}), 200

# Route to get all tasks
@app.route('/get_tasks', methods=['GET'])
def get_tasks():
    tasks_data = load_tasks()
    print("Tasks Data:", tasks_data)  # Log the tasks data for verification
    return jsonify(tasks_data), 200

@app.route('/get_task/<int:task_index>', methods=['GET'])
def get_task(task_index):
    tasks_data = load_tasks()
    
    # Ensure the task_index is within range
    if task_index < len(tasks_data['tasks']):
        task = tasks_data['tasks'][task_index]
        return jsonify(task), 200
    else:
        return jsonify({"error": "Task not found"}), 404

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

# Route to get tasks by ID and update them with specific content (test cases, acceptance criteria, etc.)
@app.route('/update_task', methods=['POST'])
def update_task():
    task_id = int(request.form['task_id'])
    response_content = request.json['response_content']
    hashtag = request.json['hashtag']

    updated_task = update_task_by_hashtag(task_id, response_content, hashtag)

    if updated_task:
        return jsonify({"message": "Task updated successfully", "task": updated_task}), 200
    else:
        return jsonify({"error": "Task not found"}), 404

@app.route('/update_task_details/<int:task_id>', methods=['POST'])
def update_task_details(task_id):
    updated_task_data = request.json  # Receive the updated task data from the frontend
    tasks_data = load_tasks()

    if task_id < len(tasks_data['tasks']):
        task = tasks_data['tasks'][task_id]
        
        # Update the task with the new data from the frontend, including the context
        task['title'] = updated_task_data.get('title', task['title'])
        task['description'] = updated_task_data.get('description', task['description'])
        task['subtasks'] = updated_task_data.get('subtasks', task['subtasks'])
        task['acceptance_criteria'] = updated_task_data.get('acceptance_criteria', task['acceptance_criteria'])
        task['test_cases'] = updated_task_data.get('test_cases', task['test_cases'])
        task['ascii_diagram'] = updated_task_data.get('ascii_diagram', task['ascii_diagram'])
        task['additional_info'] = updated_task_data.get('additional_info', task['additional_info'])
        task['context'] = updated_task_data.get('context', task['context'])  # New field for context
        
        # Save the updated tasks back to the file
        save_tasks(tasks_data)

        return jsonify({"message": "Task updated successfully", "task": task}), 200
    else:
        return jsonify({"error": "Task not found"}), 404


# Streaming response handler for LLM
def stream_llm_response(llm_request_data):
    try:
        url = config['llm_api']['url']
        with requests.post(url, json=llm_request_data, stream=True) as response:
            response.raise_for_status()

            previous_token = None
            buffer = ''
            tokenBuffer = []
            bufferThreshold = 5

            for chunk in response.iter_content(chunk_size=None):
                if chunk:
                    chunk_str = chunk.decode('utf-8')
                    buffer += chunk_str

                    lines = buffer.split('\n')
                    for line in lines[:-1]:
                        line = line.strip()

                        if line.startswith("data:"):
                            token = line[5:].strip()

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
                                yield f"data:Error: Invalid response format\n\n"

                    buffer = lines[-1]

            if tokenBuffer:
                yield f"data:{' '.join(tokenBuffer)}\n\n"

    except requests.RequestException as e:
        yield f"data:Error: {str(e)}\n\n"

@app.route('/delete_task/<task_id>', methods=['POST'])
def delete_task(task_id):
    tasks_data = load_tasks()
    
    # Check if the task with the given id exists before deletion
    task_to_delete = [task for task in tasks_data['tasks'] if task['id'] == task_id]
    
    if not task_to_delete:
        return jsonify({"message": "Task not found"}), 404
    
    # Filter out the task to delete
    tasks_data['tasks'] = [task for task in tasks_data['tasks'] if task['id'] != task_id]
    
    save_tasks(tasks_data)
    return jsonify({"message": "Task deleted successfully"}), 200


# Route to submit LLM request and handle streaming or non-streaming responses

# LLM Endpoint for handling command execution
@app.route('/submit_llm', methods=['POST'])
def submit_llm():
    data = request.get_json()
    user_prompt = data.get('prompt')

    # NLP Analysis
    sentiment = analyze_sentiment(user_prompt)
    keywords = extract_keywords(user_prompt)
    entities = extract_entities(user_prompt)

    # LLM Request with NLP Context
    llm_request_data = {
        "model": config['llm_api']['model'],
        "messages": [
            {"role": "system", "content": data['system_message']},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": data['temperature'],
        "top_p": data['top_p'],
        "top_k": data['top_k'],
        "max_tokens": data['max_tokens'],
        "context": {
            "sentiment": sentiment,
            "keywords": keywords,
            "entities": entities
        }
    }

    # Process the LLM Request (non-streaming for simplicity)
    url = config['llm_api']['url']
    response = requests.post(url, json=llm_request_data)
    if response.status_code == 200:
        return jsonify(response.json())
    else:
        return jsonify({"error": "Failed to process LLM request"}), response.status_code


@app.route('/process_audio_chunk', methods=['POST'])
def process_audio_chunk():
    try:
        logging.info("Processing audio chunk request...")

        # Check if the request has an audio file
        if 'audio' not in request.files:
            logging.error("No audio file provided in the request.")
            return jsonify({'error': 'No audio file provided'}), 400

        audio_file = request.files['audio']
        filename = request.form.get('filename')

        if not filename:
            timestamp = time.strftime('%Y%m%d-%H%M%S')
            filename = f'audio_{timestamp}.webm'
        else:
            filename = secure_filename(filename)

        # Save the audio file temporarily for processing
        audio_save_path = os.path.join(AUDIO_SAVE_DIR, filename)
        audio_file.save(audio_save_path)

        logging.info(f"Audio file saved to {audio_save_path}")

        # Convert the file to WAV for processing
        output_wav_path = audio_save_path.replace(".webm", ".wav")
        command = f"ffmpeg -i {audio_save_path} -loglevel error -y {output_wav_path}"
        process = subprocess.run(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        if process.returncode != 0:
            logging.error(f"FFmpeg conversion failed: {process.stderr.decode('utf-8')}")
            return jsonify({"error": "FFmpeg conversion failed"}), 500

        logging.info(f"Audio converted to WAV: {output_wav_path}")

        # Initialize SpeechRecognition for real-time transcription
        recognizer = sr.Recognizer()

        with sr.AudioFile(output_wav_path) as source:
            audio_data = recognizer.record(source)
            try:
                # Transcribe the chunk of audio using on-device tools (Google Speech API is used here, but could be swapped for another)
                transcribed_text = recognizer.recognize_google(audio_data)  # Replace with another on-device tool if needed
                logging.info(f"Transcription successful: {transcribed_text}")

                # Log the full transcription and any additional metadata
                log_full_transcription(transcribed_text)

                # Perform NLP tasks: Command detection, sentiment analysis, etc.
                detected_command = check_for_command(transcribed_text)
                if detected_command:
                    logging.info(f"Command detected: {detected_command}")
                    log_issued_commands(detected_command)  # Log the detected command
                
                # (Optional) Sentiment analysis or other NLP tasks
                sentiment = analyze_sentiment(transcribed_text)
                logging.info(f"Sentiment Analysis: {sentiment}")
                
                # Return the transcription and detected command as the response
                return jsonify({
                    "transcribed_text": transcribed_text,
                    "detected_command": detected_command,
                    "sentiment": sentiment
                }), 200

            except sr.UnknownValueError:
                logging.warning("Speech Recognition could not understand the audio.")
                return jsonify({"transcribed_text": "", "error": "Speech could not be understood."}), 200

    except Exception as e:
        logging.error(f"Error processing audio chunk: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500



@app.route('/complete_task/<int:task_id>', methods=['POST'])
def complete_task(task_id):
    tasks_data = load_tasks()

    for task in tasks_data['tasks']:
        if task['id'] == task_id:
            task['completed'] = True
            save_tasks(tasks_data)
            return jsonify({"message": f"Task {task_id} completed successfully"}), 200
    
    return jsonify({"error": "Task not found"}), 404

@app.route('/switch_task/<int:task_id>', methods=['GET'])
def switch_task(task_id):
    tasks_data = load_tasks()

    for task in tasks_data['tasks']:
        if task['id'] == task_id:
            return jsonify(task), 200
    
    return jsonify({"error": "Task not found"}), 404

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

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

