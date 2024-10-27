let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let mediaStream = null;  // Stream for microphone input
let volumeMeter = document.getElementById('volume-meter');
let volumeBar = document.getElementById('volume-bar');
let listeningStatus = document.getElementById('listening-status');
let micButton = document.getElementById('mic-button');
let isPipingToUserInput = false;
let audioBuffer = [];  // Buffer for holding audio data
let chunkInterval = 60000;  // Rotate the chunks every 60 seconds
let chunkTimeout = null;
let isAlwaysListening = loadListeningState();  // Fetch always listening state


// Automatically start listening if "Always Listening" is enabled on page load
window.onload = function () {
    isAlwaysListening = loadListeningState();  // Initialize or update the state here
    if (isAlwaysListening) {
        initializeAssistant();  // Initialize the assistant to start listening
    }
};


function loadListeningState() {
    return localStorage.getItem('alwaysListening') === 'true';
}
// Helper function to start the real-time transcription process
function processAndSaveChunk() {
    if (audioChunks.length > 0) {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', blob, 'audio_chunk.webm');

        fetch('/process_audio_chunk', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            console.log('Transcription response:', data);
            if (data.transcribed_text) {
                appendTranscription(data.transcribed_text);  // Append transcribed text to the UI
            }
            if (data.detected_command) {
                console.log('Detected command:', data.detected_command);
                // Handle detected command logic if necessary
            }
        })
        .catch(error => {
            console.error('Real-time transcription error:', error);
        });
    }

    audioChunks = [];  // Clear the audio chunks after processing
}

// Function to start the recording process and initialize the microphone stream
function startRecording(stream) {
    if (!stream) {
        console.error('No stream found to start recording.');
        return;
    }

    audioChunks = [];  // Clear previous chunks
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

    mediaRecorder.start();
    mediaRecorder.ondataavailable = function (event) {
        audioChunks.push(event.data);  // Collect audio chunks

        // Send chunk to server for transcription in real-time
        processAndSaveChunk();  // This sends audio chunk to server for processing
    };

    isRecording = true;
    micButton.style.backgroundColor = 'green';  // Show recording state
    listeningStatus.textContent = 'Recording...';
}

// Function to stop recording manually
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        clearInterval(chunkTimeout);  // Clear chunk rotation interval
        mediaRecorder.stop();  // Stop the recorder
        isRecording = false;
        micButton.style.backgroundColor = 'red';  // Show stopped recording state
        listeningStatus.textContent = 'Stopped recording...';  // Reset status
    }
}

// Initialize microphone and handle events
function initializeMicrophone() {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
            mediaStream = stream;
            startRecording(stream);  // Start recording the stream
        })
        .catch((error) => {
            console.error('Error accessing microphone: ', error);
            alert('Error accessing microphone. Please check your microphone settings.');
        });
}

// Helper function to append the transcribed text to the chat or task input
function appendTranscription(transcribedText) {
    const chatInput = document.getElementById('user-input');
    const taskInput = document.getElementById('new-task');

    if (document.activeElement === taskInput) {
        taskInput.value += transcribedText + ' ';
    } else if (chatInput) {
        chatInput.value += transcribedText + ' ';
    }
}

// Consolidated initialization for assistant and recording
function initializeAssistant() {
    // speakText("Hello! Welcome back. Are there any immediate tasks I can assist you with?");

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
            mediaStream = stream;
            startRecording(mediaStream);  // Start recording immediately
            console.log('Assistant initialized with always listening mode.');
        })
        .catch((error) => {
            console.error('Error accessing microphone: ', error);
            alert('Error accessing microphone. Please check your microphone settings.');
        });
}


// Event listeners
micButton.addEventListener('click', function (e) {
    e.preventDefault();

    if (!isAlwaysListening) {
        // Start/stop recording when isAlwaysListening is false
        if (!isRecording) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then((stream) => {
                    mediaStream = stream;
                    startRecording(mediaStream);
                })
                .catch(error => console.error('Error accessing microphone: ', error));
        } else {
            stopRecording();
        }
    } else {
        // Toggle piping of transcription to chat input
        isPipingToUserInput = !isPipingToUserInput;
        micButton.style.backgroundColor = isPipingToUserInput ? 'green' : 'red';  // Show piping state
        listeningStatus.textContent = isPipingToUserInput ? 'Piping to user input...' : 'Listening...';
    }
});
