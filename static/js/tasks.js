// tasks.js - Complete and Robust Source Code
if ('speechSynthesis' in window) {
    console.log("Text-to-Speech is supported.");
} else {
    console.log("Text-to-Speech is NOT supported.");
}

let estimatedTimeRemaining = 60;
let timerInterval;
let totalSeconds = 0;
let selectedTaskId = null; // Store the selected task ID for highlighting and other operations

// DOM Elements
let alwaysListeningToggle = document.getElementById('alwaysListeningToggle');
let mantraText = '';  // Fetch the mantra text
// Declare isAlwaysListening globally or within the scope where it's used
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

let pausedTimer = false;  // Initialize it globally or within the correct scope.
// Initialize activeTimer globally
let activeTimer = false;

function loadListeningState() {
    return localStorage.getItem('alwaysListening') === 'true';
}
function resumeTasks() {
    if (pausedTimer) {
        startTimer();  // Resumes the timer when the page is back in focus.
        pausedTimer = false;  // Reset the pausedTimer flag.
    }
}

// Automatically start listening if "Always Listening" is enabled on page load

// Populate default LLM settings
window.onload = function () {
    // Continue with any other initializations like always listening
    // const isAlwaysListening = localStorage.getItem('alwaysListening') === 'true';
    // const alwaysListeningToggle = document.getElementById('alwaysListeningToggle');
    // alwaysListeningToggle.checked = isAlwaysListening;
    
    // // Ensure the language and voice are set correctly
    // const savedLanguage = localStorage.getItem('voiceLanguage') || 'en-US';
    // document.getElementById('voice-language').value = savedLanguage;

    // Load mantra and other initial tasks
    loadMantra();
    document.getElementById("top_p").value = 0.9;
    document.getElementById("top_k").value = 40;
    
    // Check if the microphone setup should be triggered
     if (localStorage.getItem('showMicrophoneSetup') === 'true') {
        // Trigger the microphone setup modal
        $('#microphoneModal').modal('show');
    
         // Clear the flag so it doesn't show the modal again on future reloads
        localStorage.removeItem('showMicrophoneSetup');
    }
    
    if (isAlwaysListening) {
        initializeMicrophone();  // This should initialize the microphone and volume meter
    } else {
        stopRecording();  // In case it's not, make sure to stop any active streams
    }

    printStorageData();
    populateVoiceList();  // Populate voice list on page load

    speechSynthesis.onvoiceschanged = populateVoiceList;  // Update when voices change
};

// Function to print localStorage and session data to the console
function printStorageData() {
    // Print all localStorage data
    console.log("Local Storage Data:");
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        console.log(`${key}: ${value}`);
    }

    // Print all session data (if any)
    if (sessionStorage.length > 0) {
        console.log("Session Storage Data:");
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            const value = sessionStorage.getItem(key);
            console.log(`${key}: ${value}`);
        }
    } else {
        console.log("No session data available.");
    }
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
    
    // initializeMicrophone();
    if (!stream) {
        console.error('No stream found to start recording.');
        alert('Unable to start recording. No microphone stream available.');
        return;
    }

    // Initialize the MediaRecorder
    audioChunks = [];  // Clear previous chunks
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

    // Start recording
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

// Initialize microphone and ensure it's available
function initializeMicrophone() {
    // Check if mediaStream already exists, if so, do nothing and return early
    if (mediaStream) {
        console.log('Microphone is already initialized, reusing existing stream.');
        return;  // Prevent creating a new stream
    }

    console.log('Initializing microphone...');  // Log every initialization attempt

    const selectedMicrophone = localStorage.getItem('selectedMicrophone') || $('#mic-selection').val();

    // Fetch available audio devices
    navigator.mediaDevices.enumerateDevices().then(devices => {
        const micList = devices.filter(device => device.kind === 'audioinput');
        const micAvailable = micList.some(device => device.deviceId === selectedMicrophone);

        if (micAvailable) {
            // Initialize the selected microphone if available
            navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: selectedMicrophone } } })
                .then((stream) => {
                    mediaStream = stream;  // Store the media stream
                    console.log('Media stream initialized:', stream);

                    // Start recording immediately if always listening mode is enabled
                    if (isAlwaysListening) {
                        startRecording(mediaStream);
                    }
                })
                .catch((error) => {
                    console.error('Error accessing microphone:', error);
                    alert('Microphone access error. Please check microphone settings.');
                });
        } else {
            alert('Selected microphone is not available. Please select a valid microphone.');
        }
    });
}


// Helper function to append transcribed text to task input
function appendTranscription(transcribedText) {
    const chatInput = document.getElementById('user-input');
    const taskInput = document.getElementById('new-task');

    if (document.activeElement === taskInput) {
        taskInput.value += transcribedText + ' ';
    } else if (chatInput) {
        chatInput.value += transcribedText + ' ';
    }
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


// Function to speak the mantra
function speakMantra() {
    speakText(mantraText);
}

// Timer functions
function startTimer() {
    $('#start-timer').trigger('click');
}

function stopTimer() {
    $('#stop-timer').trigger('click');
}

function setTimer(duration, unit) {
    let multiplier;
    switch (unit) {
        case 'minutes':
            multiplier = 60;
            break;
        case 'hours':
            multiplier = 3600;
            break;
        case 'seconds':
            multiplier = 1;
            break;
    }
    const totalSeconds = duration * multiplier;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    $('#hours').val(hours);
    $('#minutes').val(minutes);
    $('#seconds').val(seconds);

    startTimer();
}

// Function to handle voice commands for task management, timers, and chat submission
function handleVoiceCommands(transcribedText) {
    let lowerCaseText = transcribedText.toLowerCase().trim();

    // Commands related to task and chat input
    const actionCommands = ["save task", "submit chat"];

    // Function to remove action commands from the transcribed text
    function cleanText(text, commands) {
        commands.forEach(command => {
            if (text.includes(command)) {
                text = text.replace(command, '').trim();
            }
        });
        return text;
    }

    lowerCaseText = cleanText(lowerCaseText, actionCommands);

    // Voice command to switch tasks (e.g., "switch to task 1")
    const switchTaskRegex = /switch to task (\d+)/;
    const switchMatch = lowerCaseText.match(switchTaskRegex);
    if (switchMatch) {
        const taskId = switchMatch[1];
        switchToTask(taskId);
    }

    // Voice command to complete tasks (e.g., "complete task 1")
    const completeTaskRegex = /complete task (\d+)/;
    const completeMatch = lowerCaseText.match(completeTaskRegex);
    if (completeMatch) {
        const taskId = completeMatch[1];
        completeTask(taskId);
    }

    // Voice command to add tasks (e.g., "add task [task content]")
    if (lowerCaseText.includes("add task")) {
        focusOnTaskInput();  // Focus on task input for appending transcribed text
    }

    // Voice command to save tasks (e.g., "save task")
    if (transcribedText.includes("save task")) {
        saveTaskByVoice();  // Trigger task submission by voice command
    }

    // Voice command to switch to chat (e.g., "switch to chat")
    if (lowerCaseText.includes("switch to chat")) {
        focusOnChat();  // Focus on chat input for appending transcribed text
    }

    // Voice command to submit chat (e.g., "submit chat")
    if (transcribedText.includes("submit chat")) {
        submitChatByVoice();  // Trigger chat submission by voice command
    }

    // Voice command to start the timer (e.g., "start timer")
    if (lowerCaseText.includes("start timer")) {
        startTimer();
    }

    // Voice command to stop the timer (e.g., "stop timer")
    if (lowerCaseText.includes("stop timer")) {
        stopTimer();
    }

    // Voice command to set the timer (e.g., "set timer for 5 minutes")
    const setTimerRegex = /set timer for (\d+) (minutes|hours|seconds)/;
    const timerMatch = lowerCaseText.match(setTimerRegex);
    if (timerMatch) {
        const duration = parseInt(timerMatch[1]);
        const unit = timerMatch[2];
        setTimer(duration, unit);
    }
}

function loadTasks() {
    $.get('/get_tasks', function (data) {
        console.log("Fetched Tasks:", data);  // Log the fetched tasks

        if (data && data.tasks) {
            $('#task-list').empty();  // Clear the task list

            data.tasks.forEach((task, index) => {
                const taskTitle = task.title || "Untitled Task";  // Fallback if task title is missing
                const taskItem = `
                    <li class="list-group-item" data-task-id="${task.id}">
                        Task #${task.id}: ${taskTitle}
                        <div class="dropdown task-actions">
                            <button class="btn btn-link dropdown-toggle" type="button" id="taskActionMenu${index}" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                            <div class="dropdown-menu" aria-labelledby="taskActionMenu${index}">
                                <a class="dropdown-item select-task" href="#">Select</a>
                                <a class="dropdown-item edit-task" href="#">Edit</a>
                                <a class="dropdown-item delete-task" href="#" data-task-id="${task.id}">Delete</a>
                            </div>
                        </div>
                    </li>
                `;
                $('#task-list').append(taskItem);  // Append task item to the list
            });
        } else {
            console.log("No tasks found or data structure is incorrect.");
        }
    }).fail(function () {
        console.error('Error: Could not load tasks from backend');
    });
}



$(document).on('click', '.delete-task', function (e) {
    e.preventDefault();  // Prevent default action like page reload
    
    const taskId = $(this).data('task-id');  // Fetch the task ID from the clicked element
    console.log(`Attempting to delete task with ID: ${taskId}`);
    
    if (taskId) {
        // Show confirmation modal before deleting
        showDynamicConfirmationModal({
            title: 'Delete Task',
            message: 'Are you sure you want to delete this task? This action cannot be undone.',
            confirmAction: function() {

                // Call the delete task function with the correct taskId
                $.ajax({
                    url: `/delete_task/${taskId}`,  // Assume this is the correct endpoint
                    type: 'POST',
                    success: function (response) {
                        console.log(`Task ${taskId} deleted successfully.`);
                        $('#dynamicConfirmationModal').modal('hide');  // Close the modal
                        loadTasks();  // Reload tasks after deletion
                    },
                    error: function () {
                        alert('Error deleting task');
                    }
                });
            }
            
        });

    } else {
        console.error('Error: Invalid task ID.');
    }
});


// Function to switch tasks based on voice commands or task selection
function switchToTask(taskId) {
    console.log(`Switching to task ${taskId}`);
    $.get(`/get_task/${taskId}`, function (task) {
        if (task) {
            $('#task-details-container').html(`
                <h6>Task #${task.id}: ${task.title}</h6>
                <p>Description: ${task.description || "No description"}</p>
            `);
        } else {
            alert("Task not found.");
        }
    }).fail(function () {
        alert("Error fetching task details.");
    });
}

// Function to mark a task as complete
function completeTask(taskId) {
    console.log(`Completing task ${taskId}`);
    $.post(`/complete_task/${taskId}`, function (response) {
        alert(`Task ${taskId} marked as complete!`);
        loadTasks();  // Reload tasks after marking as complete
    }).fail(function () {
        alert('Error completing task');
    });
}

// Function to save tasks by voice command
function saveTaskByVoice() {
    const taskInput = document.getElementById('new-task');
    const taskName = taskInput.value.trim();

    if (taskName) {
        $.post('/add_task', { task: taskName }, function (response) {
            alert('Task saved: ' + taskName);
            taskInput.value = '';  // Clear task input field after saving
            loadTasks();  // Reload tasks after saving
        }).fail(function () {
            alert('Error: Could not save task.');
        });
    }
}

// Function to append transcribed text to the task input field
function appendTaskText(text) {
    const taskInput = document.getElementById('new-task');
    taskInput.value += text + ' ';  // Append transcribed text to the task input field
}

// Function to trigger task submission by voice command
function focusOnTaskInput() {
    const taskInput = document.getElementById('new-task');
    taskInput.focus();  // Focus on the task input field
}

// Function to append transcribed text to the chat input field
function appendChatText(text) {
    const chatInput = document.getElementById('user-input');
    chatInput.value += text + ' ';  // Append transcribed text to the chat input field
}

// Function to trigger chat submission by voice command
function submitChatByVoice() {
    const chatInput = document.getElementById('user-input');
    const chatMessage = chatInput.value.trim();

    if (chatMessage) {
        const chatBox = $('#chat-box');
        const spinner = $('#loading-spinner');
        spinner.show();
        chatBox.append('<p><strong>User:</strong> ' + chatMessage + '</p>');  // Append user input to chat

        const requestData = {
            prompt: chatMessage,
            temperature: parseFloat($('#temperature').val()),
            top_p: parseFloat($('#top_p').val()),
            top_k: parseInt($('#top_k').val()),
            max_tokens: parseInt($('#max_tokens').val()),
            system_message: $('#system-message').val(),
            stream: $('#stream').is(':checked')
        };

        $.ajax({
            url: '/submit_llm',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(requestData),
            success: function (response) {
                spinner.hide();
                chatBox.append('<p><strong>LLM:</strong> ' + response + '</p>');
                chatInput.value = '';  // Clear chat input after submission
            },
            error: function () {
                spinner.hide();
                alert('Error: Could not submit chat.');
            }
        });
    }
}

// Function to focus on the chat input field for appending transcribed text
function focusOnChat() {
    const chatInput = document.getElementById('user-input');
    chatInput.focus();  // Set focus on the chat input field
}


// Timer form submission to start the timer
document.getElementById('timer-form').addEventListener('submit', function (e) {
    e.preventDefault();

    let hours = parseInt(document.getElementById('hours').value);
    let minutes = parseInt(document.getElementById('minutes').value);
    let seconds = parseInt(document.getElementById('seconds').value);

    totalSeconds = (hours * 3600) + (minutes * 60) + seconds;
    const originalSeconds = totalSeconds;

    if (totalSeconds > 0) {
        document.getElementById('timer-output').classList.add('running');
        document.getElementById('notification-sound').play();  // Play start sound
        speakText(`Check your plan. Can you do this task in ${Math.floor(originalSeconds / 60)} minutes?`);

        // Timer logic
        timerInterval = setInterval(function () {
            if (totalSeconds <= 0) {
                clearInterval(timerInterval);
                document.getElementById('timer-output').classList.remove('running');
                document.getElementById('timer-output').textContent = 'Time: 00:00:00';

                // Play gong sound at the end of the timer
                document.getElementById('gong-sound').play();

                setTimeout(() => {
                    // Play the applause sound after the gong
                    document.getElementById('applause-sound').play();
                    speakText(mantraText);  // Read the mantra after applause
                }, 2000);  // 2-second delay after the gong

                // Open the accordion for session rating
                $('#collapseOne').collapse('show');
                return;
            }

            // Inside the timer countdown
            totalSeconds--;
            let displayHours = Math.floor(totalSeconds / 3600);
            let displayMinutes = Math.floor((totalSeconds % 3600) / 60);
            let displaySeconds = totalSeconds % 60;
            document.getElementById('timer-output').textContent = `Time: ${String(displayHours).padStart(2, '0')}:${String(displayMinutes).padStart(2, '0')}:${String(displaySeconds).padStart(2, '0')}`;

            // Trigger notifications at 10%, 30%, and 60% completion
            if (totalSeconds === Math.floor(originalSeconds * 0.9)) {
                speakText("Great job! You're 10% in.");
                document.getElementById('notification-sound').play();
            } else if (totalSeconds === Math.floor(originalSeconds * 0.669)) {
                speakText("You're doing great! Keep it up!");
                document.getElementById('notification-sound').play();
            } else if (totalSeconds === Math.floor(originalSeconds * 0.331)) {
                speakText("Almost there! Push through to the finish.");
                document.getElementById('notification-sound').play();
            }
        }, 1000);  // Timer updates every second
    }
});

// Stop Timer functionality
document.getElementById('stop-timer').addEventListener('click', function () {
    clearInterval(timerInterval);
    document.getElementById('timer-output').classList.remove('running');
    document.getElementById('timer-output').textContent = 'Timer stopped';
});

// Function to load the mantra from the backend
function loadMantra() {
    fetch('/mantra_text')
        .then(response => response.json())
        .then(data => {
            mantraText = data.mantra;
        })
        .catch(error => {
            console.error('Error fetching the mantra:', error);
        });
}



// Helper functions for saving and loading listening state from localStorage
function saveListeningState(state) {
    localStorage.setItem('alwaysListening', state);
}

// Function to set and validate the selected language in localStorage
function setLanguage(language) {
    console.log(`Attempting to set language to: ${language}`);
    localStorage.setItem('voiceLanguage', language);
    populateVoiceList();
    const storedLanguage = localStorage.getItem('voiceLanguage');
    console.log(`Confirmed stored language: ${storedLanguage}`);
}

// Update language when the 'voice-language' dropdown changes
document.getElementById('voice-language').addEventListener('change', function () {
    const selectedLanguage = this.value;
    setLanguage(selectedLanguage);
    console.log(`Language selection changed to: ${selectedLanguage}`);

    // Force re-fetch voices if 'en-GB' is selected to avoid mismatch
    if (selectedLanguage === 'en-GB') {
        console.log("Re-fetching voices for en-GB.");
        speechSynthesis.onvoiceschanged = populateVoiceList;
    }
});

// Populate the voices based on the selected language
function populateVoiceList() {
    if (typeof speechSynthesis === 'undefined') {
        console.error("Speech Synthesis API is not supported in this browser.");
        return;
    }

    const voiceSelect = document.getElementById('voice-selection');
    const selectedLanguage = document.getElementById('voice-language').value || 'en-US';
    const storedLanguage = localStorage.getItem('voiceLanguage');

    if (storedLanguage !== selectedLanguage) {
        console.warn(`Mismatch in stored language. Stored: ${storedLanguage}, Selected: ${selectedLanguage}`);
        localStorage.setItem('voiceLanguage', selectedLanguage);  // Reset to selected language
    }

    const voices = speechSynthesis.getVoices();
    const filteredVoices = voices.filter(voice => voice.lang.startsWith(selectedLanguage));

    console.log(`Populating voices for language: ${selectedLanguage}, Available voices:`, filteredVoices);

    // Populate the dropdown and set the correct voice
    voiceSelect.innerHTML = '';
    filteredVoices.forEach((voice, index) => {
        const option = document.createElement('option');
        option.value = index; // Set index for later retrieval
        option.textContent = `${voice.name} (${voice.lang})`;
        voiceSelect.appendChild(option);
    });

    const savedVoiceIndex = localStorage.getItem('selectedVoice') || 0;
    voiceSelect.value = savedVoiceIndex;
    console.log(`Voice selected: ${filteredVoices[savedVoiceIndex]?.name || "None"}`);
}

// Function to speak text with the selected voice
function speakText(text) {
    const voiceSelect = document.getElementById('voice-selection');
    const selectedVoiceIndex = parseInt(voiceSelect ? voiceSelect.value : 0, 10);
    const voices = speechSynthesis.getVoices();
    const selectedLanguage = localStorage.getItem('voiceLanguage') || 'en-US';
    const rate = parseFloat(localStorage.getItem('voiceRate')) || 1.0;
    const pitch = parseFloat(localStorage.getItem('voicePitch')) || 1.0;

    // Ensure selected voice exists and matches language
    const selectedVoice = voices.find((voice, index) => 
        index === selectedVoiceIndex && voice.lang.startsWith(selectedLanguage)
    );

    if (!selectedVoice) {
        console.error(`Voice mismatch or invalid selection. Expected: ${selectedLanguage}, Selected Index: ${selectedVoiceIndex}`);
        console.warn("Resetting to default voice due to mismatch.");
        localStorage.removeItem('selectedVoice');  // Clear erroneous selection
        populateVoiceList();  // Refresh list to correct mismatch
        return;
    }

    console.log(`Speaking with voice: ${selectedVoice.name} (${selectedVoice.lang}), Rate: ${rate}, Pitch: ${pitch}`);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
    utterance.rate = rate;
    utterance.pitch = pitch;

    utterance.onend = function () {
        console.log("Speech finished.");
    };

    utterance.onerror = function (event) {
        console.error('Error during speech synthesis:', event.error);
    };

    // Start speaking
    speechSynthesis.speak(utterance);
}

// Populate voices initially and when voices change
speechSynthesis.onvoiceschanged = populateVoiceList;




// Function to speak text with the selected voice
function speakText(text) {
    const voiceSelect = document.getElementById('voice-selection');
    const selectedVoiceIndex = parseInt(voiceSelect ? voiceSelect.value : 0, 10);
    const voices = speechSynthesis.getVoices();

    const selectedLanguage = localStorage.getItem('voiceLanguage') || 'en-US';
    const rate = parseFloat(localStorage.getItem('voiceRate')) || 1.0;
    const pitch = parseFloat(localStorage.getItem('voicePitch')) || 1.0;

    // Verify if selected voice index is valid
    if (!voices[selectedVoiceIndex]) {
        console.error("Invalid voice selection.");
        return;
    }

    const selectedVoice = voices[selectedVoiceIndex];

    // Ensure the voice matches the chosen language
    if (!selectedVoice.lang.startsWith(selectedLanguage)) {
        console.error(`Selected voice language mismatch. Expected: ${selectedLanguage}, Got: ${selectedVoice.lang}`);
        return;
    }

    console.log(`Speaking with voice: ${selectedVoice.name}, Language: ${selectedVoice.lang}, Rate: ${rate}, Pitch: ${pitch}`);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
    utterance.rate = rate;
    utterance.pitch = pitch;

    utterance.onend = function () {
        console.log("Speech finished.");
    };

    utterance.onerror = function (event) {
        console.error('Error during speech synthesis:', event.error);
    };

    // Start speaking
    speechSynthesis.speak(utterance);
}





// Populate sliders with respective values from localStorage
$(document).ready(function () {
    const savedRate = localStorage.getItem('voiceRate') || 1.0;
    const savedPitch = localStorage.getItem('voicePitch') || 1.0;

    $('#voice-rate').val(savedRate);
    $('#voice-rate-value').text(savedRate);
    $('#voice-pitch').val(savedPitch);
    $('#voice-pitch-value').text(savedPitch);
});


// Stop Timer functionality
document.getElementById('stop-timer').addEventListener('click', function() {
    clearInterval(timerInterval);
    document.getElementById('timer-output').classList.remove('running');
    document.getElementById('timer-output').textContent = 'Timer stopped';
});

// Automatically adjust the height of the text area as the user types
document.getElementById('user-input').addEventListener('input', function () {
    this.style.height = 'auto';  // Reset height
    this.style.height = (this.scrollHeight) + 'px';  // Set height based on content
});

// Function to handle speech synthesis in the chat window
document.getElementById('read-response-button').addEventListener('click', function () {
    // Select the chat box container
    const chatBox = document.getElementById('chat-box');

        // Find the last <span> element containing the LLM response
        const lastLLMResponse = $('#chat-box').find('p strong + span').last().text();

    // Check if there are any LLM responses
    if (lastLLMResponses.length > 0) {
        // Get the last LLM response text
        const lastResponse = lastLLMResponses[lastLLMResponses.length - 1].textContent;

        if (lastResponse) {
            // Call the speakText function to read the response out loud
            speakText(lastResponse);
        } else {
            console.log('No LLM response found to read.');
        }
    } else {
        console.log('No LLM responses in the chat.');
    }
});


    // Handle session feedback submission
    $('#feedback-form').on('submit', function (e) {
        e.preventDefault();
        let efficiency = $('#efficiency').val();
        let focus = $('#focus').val();
        let satisfaction = $('#satisfaction').val();
        let energy = $('#energy').val();

        $('#last-rating').text(satisfaction);
        $('#sessionAccordion .collapse').collapse('hide');
        alert("Feedback Submitted!");
    });

    
    // Handle task addition
$('#task-form').on('submit', function (e) {
    e.preventDefault();
    let task = $('#new-task').val();

    $.post('/add_task', { task: task }, function (response) {
        // Add the task to the task list on the frontend
        $('#task-list').append('<li class="list-group-item">' + response.task + '</li>');
        $('#new-task').val(''); // Clear the input field
    }).fail(function() {
        alert('Error: Could not add task');
    });
});



    // Handle hashtag shortcuts
    function selectPipeline() {
        const taskOption = document.getElementById("taskOptions").value;
        let systemMessage = document.getElementById("system-message");

        if (taskOption === "#taskgen") {
            systemMessage.value = "Generate a list of tasks and subtasks based on the user's input. Ensure that each task and subtask includes a \\\"task\\\" or \\\"subtask\\\" field, \\\"notes\\\" for additional details, and \\\"recommended_llm_settings\\\" that specify LLM parameters like temperature, top_p, top_k, and system_message. Use the following format as an example: \\{ \\\"tasks\\\": \\[ \\{ \\\"task\\\": \\\"Main Task 1\\\", \\\"subtasks\\\": \\[ \\{ \\\"subtask\\\": \\\"Subtask 1.1\\\", \\\"notes\\\": \\\"Details about this subtask\\\", \\\"recommended_llm_settings\\\": \\{ \\\"temperature\\\": 0.7, \\\"top_p\\\": 0.8, \\\"top_k\\\": 40, \\\"system_message\\\": \\\"Generate a detailed breakdown of this subtask.\\\" \\} \\}, \\{ \\\"subtask\\\": \\\"Subtask 1.2\\\", \\\"notes\\\": \\\"Details about this subtask\\\", \\\"recommended_llm_settings\\\": \\{ \\\"temperature\\\": 0.9, \\\"top_p\\\": 0.6, \\\"top_k\\\": 50, \\\"system_message\\\": \\\"Provide insights and further research options for this subtask.\\\" \\} \\} \\], \\\"notes\\\": \\\"Focus on the core aspects of the task\\\", \\\"recommended_llm_settings\\\": \\{ \\\"temperature\\\": 0.7, \\\"top_p\\\": 0.9, \\\"top_k\\\": 30, \\\"system_message\\\": \\\"Provide high-level guidance on this task.\\\" \\} \\} \\] \\}";
        } else if (taskOption === "#reflection") {
            systemMessage.value = "Analyze the user's reflection data and provide suggestions for improvement. Structure the output with \\\"strengths\\\", \\\"weaknesses\\\", and \\\"recommendations\\\" fields. Format the output as a structured JSON. Here is an example: \\{ \\\"suggestions\\\": \\[ \\\"Take regular breaks to avoid burnout.\\\", \\\"Improve task prioritization.\\\" \\], \\\"strengths\\\": \\[ \\\"Strong research skills.\\\", \\\"Great ability to meet deadlines.\\\" \\], \\\"weaknesses\\\": \\[ \\\"Occasionally lacks focus during long sessions.\\\", \\\"Needs to improve delegation skills.\\\" \\] \\}";
        } else if (taskOption === "#research") {
            systemMessage.value = "Conduct research based on the user's input. Return structured tasks and notes for further study. Format the output as a structured JSON. Here is an example: \\{ \\\"task\\\": \\\"Research AI trends\\\", \\\"subtasks\\\": \\[ \\\"Read the latest papers on ethical AI.\\\", \\\"Analyze AI contributions to healthcare.\\\" \\], \\\"notes\\\": \\[ \\\"Focus on the potential risks and benefits of AI.\\\" \\] \\}";
        } else if (taskOption === "#goalsetting") {
            systemMessage.value = "Set actionable goals based on the user's tasks and reflection. Provide a clear timeline and steps to achieve each goal. Format the output as a structured JSON. Here is an example: \\{ \\\"goals\\\": \\[ \\\"Complete a Python course in two weeks.\\\", \\\"Write a research paper on AI ethics.\\\" \\], \\\"timeline\\\": \\[ \\\"Week 1: Finish beginner Python exercises.\\\", \\\"Week 2: Start working on the research paper.\\\" \\] \\}";
        } else if (taskOption === "#chartgen") {
            systemMessage.value = "Analyze the user's performance data, and generate a graphical analysis. Include trends and key insights. Structure the output as JSON and include values for \\\"satisfaction_over_time\\\" and \\\"improvement_areas\\\". Here's an example: \\{ \\\"satisfaction_over_time\\\": \\[ \\{ \\\"week\\\": 1, \\\"score\\\": 7 \\}, \\{ \\\"week\\\": 2, \\\"score\\\": 8 \\}, \\{ \\\"week\\\": 3, \\\"score\\\": 9 \\} \\], \\\"improvement_areas\\\": \\[ \\\"Improve time management.\\\", \\\"Delegate tasks more efficiently.\\\" \\] \\}";
        } else if (taskOption === "#genuml") {
            systemMessage.value = "Generate UML diagram based on the provided task structure. Return as a Mermaid-compatible syntax.";
        } else if (taskOption === "#gentestcases") {
            systemMessage.value = "Generate test cases for the given task. Structure output as a JSON array.";
        } else if (taskOption === "#gencriteria") {
            systemMessage.value = "Generate acceptance criteria for the tasks. Format the output as a structured list.";
        }

        // Append the selected hashtag to the input field
        document.getElementById("user-input").value += taskOption;
    }

    // Handle hashtag shortcuts with detailed system messages
function selectPipeline() {
    const taskOption = document.getElementById("taskOptions").value;
    let systemMessage = document.getElementById("system-message");

    if (taskOption === "#taskgen") {
        systemMessage.value = `{
            "prompt": "Generate a list of tasks and subtasks based on the user's input. Each task should include 'task', 'subtask', 'description', 'notes', and 'related_tasks'. Example structure: 
            { 
                "tasks": [
                    { 
                        "task": "Main Task 1", 
                        "subtasks": [
                            { "subtask": "Subtask 1.1", "description": "Details about this subtask" },
                            { "subtask": "Subtask 1.2", "description": "Details about this subtask" }
                        ], 
                        "description": "Description of the task",
                        "notes": "Additional details about the task.",
                        "related_tasks": ["Task 2", "Task 3"]
                    }
                ] 
            }"
        }`;

    } else if (taskOption === "#reflection") {
        systemMessage.value = `{
            "prompt": "Analyze the user's reflection data and provide strengths, weaknesses, and recommendations. 
            Example structure: 
            {
                "strengths": ["Strong research skills", "Great time management"], 
                "weaknesses": ["Occasionally loses focus"], 
                "recommendations": ["Take regular breaks", "Improve task prioritization"]
            }"
        }`;

    } else if (taskOption === "#research") {
            systemMessage.value = "Conduct research based on the user's input. Return structured tasks and notes for further study. Format the output as a structured JSON. Here is an example: \\{ \\\"task\\\": \\\"Research AI trends\\\", \\\"subtasks\\\": \\[ \\\"Read the latest papers on ethical AI.\\\", \\\"Analyze AI contributions to healthcare.\\\" \\], \\\"notes\\\": \\[ \\\"Focus on the potential risks and benefits of AI.\\\" \\] \\}";
        } else if (taskOption === "#goalsetting") {
            systemMessage.value = "Set actionable goals based on the user's tasks and reflection. Provide a clear timeline and steps to achieve each goal. Format the output as a structured JSON. Here is an example: \\{ \\\"goals\\\": \\[ \\\"Complete a Python course in two weeks.\\\", \\\"Write a research paper on AI ethics.\\\" \\], \\\"timeline\\\": \\[ \\\"Week 1: Finish beginner Python exercises.\\\", \\\"Week 2: Start working on the research paper.\\\" \\] \\}";
        } else if (taskOption === "#chartgen") {
            systemMessage.value = "Analyze the user's performance data, and generate a graphical analysis. Include trends and key insights. Structure the output as JSON and include values for \\\"satisfaction_over_time\\\" and \\\"improvement_areas\\\". Here's an example: \\{ \\\"satisfaction_over_time\\\": \\[ \\{ \\\"week\\\": 1, \\\"score\\\": 7 \\}, \\{ \\\"week\\\": 2, \\\"score\\\": 8 \\}, \\{ \\\"week\\\": 3, \\\"score\\\": 9 \\} \\], \\\"improvement_areas\\\": \\[ \\\"Improve time management.\\\", \\\"Delegate tasks more efficiently.\\\" \\] \\}";
        } else if (taskOption === "#gentestcases") {
        systemMessage.value = `{
            "prompt": "Generate test cases for the given task. Each test case should include 'test_case', 'expected_input', 'expected_output', 'steps', and 'status'. Format output as a JSON array.
            Example structure:
            {
                "test_cases": [
                    {
                        "test_case": "Verify login functionality",
                        "expected_input": { "username": "valid_user", "password": "valid_pass" },
                        "expected_output": "User is successfully logged in",
                        "steps": ["Navigate to login page", "Enter valid credentials", "Click login button"],
                        "status": "Pending"
                    },
                    {
                        "test_case": "Verify error message for invalid credentials",
                        "expected_input": { "username": "invalid_user", "password": "invalid_pass" },
                        "expected_output": "Error message is displayed",
                        "steps": ["Navigate to login page", "Enter invalid credentials", "Click login button"],
                        "status": "Pending"
                    }
                ]
            }"
        }`;

    } else if (taskOption === "#gencriteria") {
        systemMessage.value = `{
            "prompt": "Generate acceptance criteria for the tasks. Each criterion should include 'criteria', 'condition', and 'status'. Format the output as a structured list.
            Example structure:
            {
                "acceptance_criteria": [
                    {
                        "criteria": "Login functionality works",
                        "condition": "User can log in with valid credentials",
                        "status": "Pending"
                    },
                    {
                        "criteria": "Error message displays for invalid credentials",
                        "condition": "Error is shown when wrong credentials are entered",
                        "status": "Pending"
                    }
                ]
            }"
        }`;

    } else if (taskOption === "#genuml") {
        systemMessage.value = `{
            "prompt": "Generate a UML diagram based on the task structure. Provide output in Mermaid syntax. Example structure: 
            graph TD;
            A[Start] --> B[Do Task];
            B --> C{Is Done?};
            C -->|Yes| D[Finish];
            C -->|No| E[Retry];"
        }`;
    }

    // Append the selected hashtag to the input field
    document.getElementById("user-input").value += taskOption;
}



    // Update displayed values for the range inputs
    $('#efficiency').on('input', function () {
        $('#efficiency-value').text($(this).val());
    });
    $('#focus').on('input', function () {
        $('#focus-value').text($(this).val());
    });
    $('#satisfaction').on('input', function () {
        $('#satisfaction-value').text($(this).val());
    });
    $('#energy').on('input', function () {
        $('#energy-value').text($(this).val());
    });

    // Function to update dashboard
    function updateDashboard() {
        $('#total-tasks').text('10');
        $('#total-timers').text('5');
        $('#avg-satisfaction').text('8.5');

        var ctx = document.getElementById('reflectionChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                datasets: [{
                    label: 'Satisfaction Score',
                    data: [7, 8, 9, 6],
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
 

    const voiceSelect = document.getElementById('voice-selection');
    const selectedLanguage = localStorage.getItem('voiceLanguage') || 'en-US';  // Get saved language
    const voices = speechSynthesis.getVoices();

    voiceSelect.innerHTML = '';  // Clear previous options

    const filteredVoices = voices.filter(voice => voice.lang.startsWith(selectedLanguage));  // Filter by language

    // If no voices are found for the selected language, fallback to the default voice
    if (filteredVoices.length === 0) {
        filteredVoices.push(...voices.filter(voice => voice.default));  // Use default voice
    }

    filteredVoices.forEach((voice, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${voice.name} (${voice.lang}) ${voice.default ? '[default]' : ''}`;
        voiceSelect.appendChild(option);
    });

    // Automatically select the first voice if no saved selection is found
    const savedVoiceIndex = localStorage.getItem('selectedVoice') || 0;
    voiceSelect.value = savedVoiceIndex;






        // Handle visibility change
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                if (activeTimer) {
                    console.log('Page is hidden, background task running...');
                    pauseTasks();  // Pause tasks that aren't needed in the background
                }
            } else {
                if (pausedTimer) {
                    console.log('Page is visible again, resuming tasks...');
                    resumeTasks();  // Resume any necessary tasks when visible
                }
            }
        });
        
        
        function pauseTasks() {
            if (activeTimer) {
                pausedTimer = true;
                stopTimer();  // Pauses the timer when the page is hidden
            }
        }
        
        function resumeTasks() {
            if (pausedTimer) {
                startTimer();  // Resumes the timer when the page is back in focus
            }
        }

        // Update displayed values of rate and pitch sliders
        $('#voice-rate').on('input', function() {
            $('#voice-rate-value').text($(this).val());
        });
        $('#voice-pitch').on('input', function() {
            $('#voice-pitch-value').text($(this).val());
        });

        // Consolidating the event listener for microphone and voice settings
        $('#confirm-mic-selection').click(function () {
            const selectedMicrophone = $('#mic-selection').val();
            const selectedVoice = $('#voice-selection').val();
            const selectedLanguage = $('#voice-language').val();
            const selectedRate = parseFloat($('#voice-rate').val());
            const selectedPitch = parseFloat($('#voice-pitch').val());
    
            // Store settings in localStorage
            localStorage.setItem('selectedMicrophone', selectedMicrophone);
            localStorage.setItem('selectedVoice', selectedVoice);
            localStorage.setItem('voiceLanguage', selectedLanguage);
            localStorage.setItem('voiceRate', selectedRate);
            localStorage.setItem('voicePitch', selectedPitch);
    
            $('#microphoneModal').modal('hide'); // Hide the modal after saving settings
    
            // Set up the selected microphone
            navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: selectedMicrophone } } })
                .then(stream => {
                    mediaStream = stream;  // Store the media stream for later use
                    console.log('Media stream obtained:', mediaStream);
                    startRecording(mediaStream);  // Start the listening process with the selected microphone
                })
                .catch(error => {
                    console.error('Error accessing microphone:', error);
                    alert('Could not access the selected microphone.');
                });
        });
    
        // Consolidated microphone button click event
        $('#mic-button').on('click', function (e) {
            e.preventDefault();
            if (!isRecording) {
                if (mediaStream) {
                    startRecording(mediaStream); // Start recording if stream is available
                    $(this).css('background-color', 'green');  // Indicate recording
                } else {
                    alert('Please select a microphone first.');
                }
            } else {
                stopRecording();
                $(this).css('background-color', 'red');  // Indicate stopped recording
            }
        });

        

// Task selection and loading details into the right column
$(document).on('click', '.select-task', function () {
    const taskItem = $(this).closest('.list-group-item');
    const taskIndex = taskItem.data('task-id');  // Use the data-task-id as the index
    selectedTaskId = taskIndex;
    $('.list-group-item').removeClass('active');  // Remove highlight from all items
    taskItem.addClass('active');  // Highlight the selected task

    // Load task details into the Task Details accordion
    $.get(`/get_task/${taskIndex}`, function (task) {
        if (task) {
            $('#task-details-container').html(`
                <div id="taskAccordion">
                    <h6>${task.title || "Untitled Task"}</h6>
                    <p>Description: ${task.description || "No description"}</p>

                    <div class="card">
                        <div class="card-header" id="subtasksHeader">
                            <h6>
                                Subtasks 
                                <button class="btn btn-link" type="button" data-toggle="collapse" data-target="#collapseSubtasks" aria-expanded="true" aria-controls="collapseSubtasks">
                                    <i class="fas fa-plus"></i>
                                </button>
                            </h6>
                        </div>
                        <div id="collapseSubtasks" class="collapse">
                            <div class="card-body">
                                ${task.subtasks.length > 0 ? task.subtasks.map((subtask, index) => `<p>${index + 1}. ${subtask}</p>`).join('') : "None"}
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header" id="acceptanceCriteriaHeader">
                            <h6>
                                Acceptance Criteria 
                                <button class="btn btn-link" type="button" data-toggle="collapse" data-target="#collapseCriteria" aria-expanded="true" aria-controls="collapseCriteria">
                                    <i class="fas fa-plus"></i>
                                </button>
                            </h6>
                        </div>
                        <div id="collapseCriteria" class="collapse">
                            <div class="card-body">
                                ${task.acceptance_criteria.length > 0 ? task.acceptance_criteria.map((criteria, index) => `<p>${index + 1}. ${criteria}</p>`).join('') : "None"}
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header" id="testCasesHeader">
                            <h6>
                                Test Cases 
                                <button class="btn btn-link" type="button" data-toggle="collapse" data-target="#collapseTestCases" aria-expanded="true" aria-controls="collapseTestCases">
                                    <i class="fas fa-plus"></i>
                                </button>
                            </h6>
                        </div>
                        <div id="collapseTestCases" class="collapse">
                            <div class="card-body">
                                ${task.test_cases.length > 0 ? task.test_cases.map((testCase, index) => `<p>${index + 1}. ${testCase}</p>`).join('') : "None"}
                            </div>
                        </div>
                    </div>

                    <p>ASCII Diagram: ${task.ascii_diagram || "None"}</p>
                    <p>Related Tasks: ${task.related_tasks.length > 0 ? task.related_tasks.join(', ') : "None"}</p>
                    <button class="btn btn-primary" id="edit-task-btn">Edit Task</button>
                </div>
            `);

            // Automatically open the task details accordion
            $('#collapseTaskDetails').collapse('show');
        } else {
            alert("Error: Task not found");
        }
    }).fail(function () {
        console.error("Error fetching task details.");
    });
});


$(document).on('click', '#edit-task-btn', function () {
    $.get(`/get_task/${selectedTaskId}`, function (task) {
        $('#task-details-container').html(`
            <h6>Edit Task: ${task.title}</h6>
            <form id="edit-task-form">
                <div class="form-group">
                    <label for="task-name">Task Name</label>
                    <input type="text" id="task-name" class="form-control" value="${task.title}">
                </div>
                <div class="form-group">
                    <label for="task-description">Description</label>
                    <textarea id="task-description" class="form-control">${task.description || ''}</textarea>
                </div>

                <!-- Editable Subtasks -->
                <div class="form-group">
                    <label for="subtasks-container">Subtasks</label>
                    <div id="subtasks-container">
                        ${task.subtasks.length > 0 ? task.subtasks.map((subtask, index) => `
                            <input type="text" class="form-control mb-2" value="${subtask}" id="subtask-${index}">`).join('') : `<p>No subtasks</p>`}
                    </div>
                    <button type="button" class="btn btn-success" id="add-subtask">Add Subtask</button>
                </div>

                <!-- Acceptance Criteria -->
                <div class="form-group">
                    <label for="criteria-container">Acceptance Criteria</label>
                    <div id="criteria-container">
                        ${task.acceptance_criteria.length > 0 ? task.acceptance_criteria.map((criteria, index) => `
                            <input type="text" class="form-control mb-2" value="${criteria}" id="criteria-${index}">`).join('') : `<p>No criteria</p>`}
                    </div>
                    <button type="button" class="btn btn-success" id="add-criteria">Add Criteria</button>
                </div>

                <!-- Editable Test Cases -->
                <div class="form-group">
                    <label for="test-cases-container">Test Cases</label>
                    <div id="test-cases-container">
                        ${task.test_cases.length > 0 ? task.test_cases.map((testCase, index) => `
                            <input type="text" class="form-control mb-2" value="${testCase}" id="test-case-${index}">`).join('') : `<p>No test cases</p>`}
                    </div>
                    <button type="button" class="btn btn-success" id="add-test-case">Add Test Case</button>
                </div>

                <div class="form-group">
                    <label for="ascii-diagram">ASCII Diagram</label>
                    <textarea id="ascii-diagram" class="form-control">${task.ascii_diagram || ''}</textarea>
                </div>

                <button type="submit" class="btn btn-success">Save Changes</button>
            </form>
        `);

        // Open the task accordion on edit
        $('#collapseTaskDetails').collapse('show');
    });
});



// Add new subtask dynamically
$(document).on('click', '#add-subtask', function () {
    // Append a new empty subtask input field
    $('#subtasks-container').append('<input type="text" class="form-control mb-2" placeholder="New subtask">');
});

// Add new acceptance criteria dynamically
$(document).on('click', '#add-criteria', function () {
    // Append a new empty acceptance criteria input field
    $('#criteria-container').append('<input type="text" class="form-control mb-2" placeholder="New acceptance criteria">');
});

// Add new test case dynamically
$(document).on('click', '#add-test-case', function () {
    // Append a new empty test case input field
    $('#test-cases-container').append('<input type="text" class="form-control mb-2" placeholder="New test case">');
});



$(document).on('submit', '#edit-task-form', function (e) {
    e.preventDefault();

    // Gather values from the form
    let updatedTask = {
        title: $('#task-name').val(),
        description: $('#task-description').val(),
        subtasks: [],
        acceptance_criteria: [],
        test_cases: [],
        ascii_diagram: $('#ascii-diagram').val()
    };

    // Collect subtasks values
    $('#subtasks-container input').each(function() {
        let subtask = $(this).val().trim();
        if (subtask) {
            updatedTask.subtasks.push(subtask);
        }
    });

    // Collect acceptance criteria values
    $('#criteria-container input').each(function() {
        let criteria = $(this).val().trim();
        if (criteria) {
            updatedTask.acceptance_criteria.push(criteria);
        }
    });

    // Collect test cases values
    $('#test-cases-container input').each(function() {
        let testCase = $(this).val().trim();
        if (testCase) {
            updatedTask.test_cases.push(testCase);
        }
    });

    // Send the updated task data to the backend
    $.ajax({
        url: `/update_task_details/${selectedTaskId}`,
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(updatedTask),
        success: function (response) {
            alert('Task updated successfully!');
            loadTasks();  // Reload the task list to reflect changes
        },
        error: function () {
            alert('Error updating task.');
        }
    });
});


// Function to update the visible value of sliders dynamically
function updateSliderValue(sliderId, outputId) {
    document.getElementById(sliderId).addEventListener('input', function() {
        document.getElementById(outputId).textContent = this.value;
    });
}

// Call the function for each slider with their respective IDs
updateSliderValue('confidence-level', 'confidence-value');
updateSliderValue('satisfaction', 'satisfaction-value');
updateSliderValue('task-progress', 'task-progress-value');

// Optional: Add percentage sign to task progress value
document.getElementById('task-progress').addEventListener('input', function() {
    document.getElementById('task-progress-value').textContent = this.value + '%';
});

// Function to update the selected voice in localStorage
function updateSelectedVoice() {
    const voiceSelect = document.getElementById('voice-selection');
    const selectedVoiceIndex = voiceSelect.value;
    localStorage.setItem('selectedVoice', selectedVoiceIndex);
    console.log(`Selected voice index saved: ${selectedVoiceIndex}`);
}

// Call this function whenever the user changes the voice selection
document.getElementById('voice-selection').addEventListener('change', updateSelectedVoice);


// Function to fetch the mantra from the backend
function loadMantra() {
    fetch('/mantra_text')
        .then(response => response.json())
        .then(data => {
            mantraText = data.mantra;
        })
        .catch(error => {
            console.error('Error fetching the mantra:', error);
        });
}
// Alternatively, you can handle page restoration using the 'pageshow' event
window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
        console.log('Page is restored from bfcache');
        resumeTasks(); // Tasks can be resumed if page was cached
    }
});
if ('Notification' in window) {
    // Request permission from the user
    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            console.log('Notification permission granted');
        } else {
            console.log('Notification permission denied');
        }
    });
}
// Function to create and show notifications
function showNotification(title, body) {
    if (Notification.permission === 'granted') {
        const notification = new Notification(title, {
            body: body,
            icon: '/static/images/icon.png',  // Optional icon for the notification
        });

        // Optional: Handle what happens when the notification is clicked
        notification.onclick = function () {
            window.focus();  // Bring the page back into focus
            console.log('Notification clicked!');
        };
    } else {
        console.log('Notifications are not permitted.');
    }
}
document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
        console.log('Page is hidden, background task running...');
        // Simulate task completion in the background
        setTimeout(() => {
            showNotification('Background Task', 'Task finished while page was hidden.');
        }, 3000);  // For example, this triggers after 3 seconds
    } else {
        console.log('Page is visible again, no need for notification.');
    }

});


function showDynamicConfirmationModal({ title, message, confirmAction }) {
    $('#dynamicConfirmationModalLabel').text(title);
    $('#dynamicConfirmationMessage').text(message);

    $('#dynamicConfirmationAction').off('click').on('click', function () {
        confirmAction(); // Execute the passed confirmation action

        // Now show the form dialog
        $('#formDialogModal').modal('show');  // Ensure the form dialog is shown after confirmation
    });

    $('#dynamicConfirmationModal').modal('show');
}


document.getElementById('save-settings-button').addEventListener('click', function() {
    const selectedMicrophone = document.getElementById('mic-selection').value;
    const selectedVoice = document.getElementById('voice-selection').value;
    const selectedLanguage = document.getElementById('voice-language').value;
    const selectedRate = parseFloat(document.getElementById('voice-rate').value);
    const selectedPitch = parseFloat(document.getElementById('voice-pitch').value);

    // Store settings
    localStorage.setItem('selectedMicrophone', selectedMicrophone);
    localStorage.setItem('selectedVoice', selectedVoice);
    localStorage.setItem('voiceLanguage', selectedLanguage);
    localStorage.setItem('voiceRate', selectedRate);
    localStorage.setItem('voicePitch', selectedPitch);

    console.log('Settings saved to localStorage:', {
        selectedMicrophone,
        selectedVoice,
        selectedLanguage,
        selectedRate,
        selectedPitch
    });

    $('#microphoneModal').modal('hide'); // Hide modal after saving
});


// Function to save and load microphone settings already exists and is optimized.
$(document).ready(function () {
    let mediaStream = null;

    // Initialize microphone and load settings
    const savedMicrophone = localStorage.getItem('selectedMicrophone');
    const savedVoice = localStorage.getItem('selectedVoice');
    const savedLanguage = localStorage.getItem('voiceLanguage') || 'en-US';
    const savedRate = localStorage.getItem('voiceRate') || 2.7;
    const savedPitch = localStorage.getItem('voicePitch') || 1.2;

    // Set form fields to saved settings    
    $('#voice-rate').val(savedRate);
    $('#voice-rate-value').text(savedRate);
    $('#voice-pitch').val(savedPitch);
    $('#voice-pitch-value').text(savedPitch);
    $('#voice-language').val(savedLanguage);


    populateVoiceList();
    speechSynthesis.onvoiceschanged = populateVoiceList;

    // Populate microphones and voices on page load
    navigator.mediaDevices.enumerateDevices().then(devices => {
        let micSelect = $('#mic-selection');
        micSelect.empty();  // Clear existing options
        devices.forEach(device => {
            if (device.kind === 'audioinput') {
                micSelect.append(new Option(device.label, device.deviceId));
            }
        });

        // Set the saved microphone, if available
        if (savedMicrophone) {
            micSelect.val(savedMicrophone);
        }
    });

    // Auto-load tasks and settings
    loadTasks();
    loadMantra();

    // Automatically start listening if "Always Listening" is enabled
    const isAlwaysListening = localStorage.getItem('alwaysListening') === 'true';
    $('#alwaysListeningToggle').prop('checked', isAlwaysListening);

    // if (isAlwaysListening) {
    //     initializeMicrophone();
    // }

    // Auto-expand chat input as text is typed
    $('#user-input').on('input', function () {
        this.style.height = 'auto';  // Reset height
        this.style.height = (this.scrollHeight) + 'px';  // Adjust based on content
    });

    $('#reset-session').click(function (e) {
        e.preventDefault();  // Prevent default behavior, including form submission or page reload
    
        // Call the unified function to show the confirmation modal
        showDynamicConfirmationModal({
            title: 'Reset Session',
            message: 'Are you sure you want to reset the session?',
            confirmAction: function () {
                // Hide the confirmation modal first
                $('#dynamicConfirmationModal').modal('hide');
    
                // After hiding the confirmation modal, show the microphone modal
                setTimeout(function () {
                    $('#microphoneModal').modal('show');  // Show the microphone modal
                }, 300);  // Delay to ensure smooth transition between modals
            }
        });
    });
    
    
    
    // Populate sliders with respective values and update dynamically
    updateSliderValue('confidence-level', 'confidence-value');
    updateSliderValue('satisfaction', 'satisfaction-value');
    updateSliderValue('task-progress', 'task-progress-value');

    // Add percentage sign to task progress value
    $('#task-progress').on('input', function () {
        $('#task-progress-value').text(this.value + '%');
    });

    // Handle LLM chat submission
    $('#chat-form').on('submit', function (e) {
        e.preventDefault();

        let message = $('#user-input').val();
        let chatBox = $('#chat-box');
        let spinner = $('#loading-spinner');
        spinner.show();
        chatBox.append('<p><strong>User:</strong> ' + message + '</p>');  // Append user input to chat

        $('#user-input').val('');  // Clear input

        let requestData = {
            prompt: message,
            temperature: parseFloat($('#temperature').val()),
            top_p: parseFloat($('#top_p').val()),
            top_k: parseInt($('#top_k').val()),
            max_tokens: parseInt($('#max_tokens').val()),
            system_message: $('#system-message').val(),
            stream: $('#stream').is(':checked')
        };

        // Generate a unique ID for the LLM response
        let llmResponseId = `llm-response-${new Date().getTime()}`;  
        let llmResponseParagraph = $(`<p><strong>LLM:</strong> <span id="${llmResponseId}"></span></p>`);
        chatBox.append(llmResponseParagraph);  // Placeholder for streaming tokens

        let buffer = '';
        let tokenBuffer = [];
        let bufferThreshold = 5;  // Accumulate tokens before appending

        // Fetch LLM response
        let xhr = new XMLHttpRequest();
        xhr.open('POST', '/submit_llm', true);
        xhr.setRequestHeader('Content-Type', 'application/json');

        xhr.onprogress = function () {
            let chunk = xhr.responseText;
            buffer += chunk;

            let lines = buffer.split('\n');
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i].trim();
                if (line.startsWith('data:')) {
                    let token = line.substring(5).trim();  // Extract token

                    if (token === "[DONE]") {
                        spinner.hide();  // End the spinner
                        return;
                    }

                    tokenBuffer.push(token);
                    if (tokenBuffer.length >= bufferThreshold) {
                        llmResponseParagraph.append(tokenBuffer.join(' ') + " ");
                        tokenBuffer = [];
                    }

                    chatBox.scrollTop(chatBox[0].scrollHeight);
                }
            }

            buffer = lines[lines.length - 1];  // Keep leftover buffer for next iteration
        };

        xhr.onload = function () {
            spinner.hide();

            
            // Handle full response
            if (!requestData.stream) {
                try {
                    const jsonResponse = JSON.parse(xhr.responseText);
                    const assistantMessage = jsonResponse.choices[0].message?.content;
                    if (assistantMessage) {
                        $(`#${llmResponseId}`).text(assistantMessage);
                    } else {
                        llmResponseParagraph.append('<p class="text-danger">Error: No assistant message found.</p>');
                    }
                } catch (error) {
                    llmResponseParagraph.append('<p class="text-danger">Error: Invalid response format or malformed JSON.</p>');
                }
            }

            // Append any remaining tokens
            if (tokenBuffer.length > 0) {
                llmResponseParagraph.append(tokenBuffer.join(' ') + " ");
                tokenBuffer = [];
            }

            chatBox.scrollTop(chatBox[0].scrollHeight);
        };

        xhr.onerror = function () {
            spinner.hide();
            chatBox.append('<p class="text-danger"><strong>Error:</strong> An error occurred during the request.</p>');
        };

        // Send LLM request
        xhr.send(JSON.stringify(requestData));
    });

    // Handle hashtag shortcuts
    $('#taskOptions').on('change', selectPipeline);

    // Handle task addition
    $('#task-form').on('submit', function (e) {
        e.preventDefault();
        let task = $('#new-task').val();

        $.post('/add_task', { task: task }, function (response) {
            $('#task-list').append('<li class="list-group-item">' + response.task + '</li>');
            $('#new-task').val('');  // Clear input field
        }).fail(function () {
            alert('Error: Could not add task');
        });
    });

    // Handle session feedback submission
    $('#feedback-form').on('submit', function (e) {
        e.preventDefault();
        $('#last-rating').text($('#satisfaction').val());
        $('#sessionAccordion .collapse').collapse('hide');
        alert("Feedback Submitted!");
    });
    

    // // Save and apply the selected settings
    // $('#save-settings-button').on('click', function () {
    //     const selectedMicrophone = $('#mic-selection').val();
    //     const selectedVoice = $('#voice-selection').val();
    //     const selectedLanguage = $('#voice-language').val();
    //     const selectedRate = parseFloat($('#voice-rate').val());
    //     const selectedPitch = parseFloat($('#voice-pitch').val());

    //     // Store settings in localStorage
    //     localStorage.setItem('selectedMicrophone', selectedMicrophone);
    //     localStorage.setItem('selectedVoice', selectedVoice);
    //     localStorage.setItem('voiceLanguage', selectedLanguage);
    //     localStorage.setItem('voiceRate', selectedRate);
    //     localStorage.setItem('voicePitch', selectedPitch);

    //     $('#microphoneModal').modal('hide');  // Hide the modal after saving settings
    //     initializeMicrophone();
    // });



});  // Closing the ready function correctly


// ==========================
// Updated Code for Local Storage Integration
// ==========================

$(document).ready(function () {
    // Default values for settings
    const defaultSettings = {
        alwaysListening: true,
        selectedMicrophone: null,
        selectedVoice: null,
        voiceLanguage: 'en-US',
        voiceRate: 1.0,
        voicePitch: 1.0,
        timerHours: 0,
        timerMinutes: 5,
        timerSeconds: 0,
        confidenceLevel: 5,
        satisfaction: 5,
        taskProgress: 50,
    };

    // Retrieve settings from localStorage or use defaults
    const settings = loadSettings();

    // Initialize form values from settings
    initializeFormValues();

    // Event listeners for real-time storage updates
    setupEventListeners();

    // Initialize any additional functions on load
    populateVoiceList();
    speechSynthesis.onvoiceschanged = populateVoiceList;

    // Functions below
    // ==========================================

    function initializeFormValues() {
        // Set default or saved values for form fields
        $('#alwaysListeningToggle').prop('checked', settings.alwaysListening);
        $('#mic-selection').val(settings.selectedMicrophone);
        $('#voice-selection').val(settings.selectedVoice);
        $('#voice-language').val(settings.voiceLanguage);
        $('#voice-rate').val(settings.voiceRate).siblings('#voice-rate-value').text(settings.voiceRate);
        $('#voice-pitch').val(settings.voicePitch).siblings('#voice-pitch-value').text(settings.voicePitch);
        $('#hours').val(settings.timerHours);
        $('#minutes').val(settings.timerMinutes);
        $('#seconds').val(settings.timerSeconds);
        $('#confidence-level').val(settings.confidenceLevel).siblings('#confidence-value').text(settings.confidenceLevel);
        $('#satisfaction').val(settings.satisfaction).siblings('#satisfaction-value').text(settings.satisfaction);
        $('#task-progress').val(settings.taskProgress).siblings('#task-progress-value').text(settings.taskProgress + '%');
    }

    function setupEventListeners() {
        // Store setting changes to localStorage immediately when changed
        $('#alwaysListeningToggle').on('change', e => saveSetting('alwaysListening', e.target.checked));
        $('#mic-selection').on('change', e => saveSetting('selectedMicrophone', e.target.value));
        $('#voice-selection').on('change', e => saveSetting('selectedVoice', e.target.value));
        $('#voice-language').on('change', e => saveSetting('voiceLanguage', e.target.value));
        $('#voice-rate').on('input', e => {
            saveSetting('voiceRate', parseFloat(e.target.value));
            $('#voice-rate-value').text(e.target.value);
        });
        $('#voice-pitch').on('input', e => {
            saveSetting('voicePitch', parseFloat(e.target.value));
            $('#voice-pitch-value').text(e.target.value);
        });
        $('#hours').on('input', e => saveSetting('timerHours', parseInt(e.target.value)));
        $('#minutes').on('input', e => saveSetting('timerMinutes', parseInt(e.target.value)));
        $('#seconds').on('input', e => saveSetting('timerSeconds', parseInt(e.target.value)));
        $('#confidence-level').on('input', e => {
            saveSetting('confidenceLevel', parseInt(e.target.value));
            $('#confidence-value').text(e.target.value);
        });
        $('#satisfaction').on('input', e => {
            saveSetting('satisfaction', parseInt(e.target.value));
            $('#satisfaction-value').text(e.target.value);
        });
        $('#task-progress').on('input', e => {
            saveSetting('taskProgress', parseInt(e.target.value));
            $('#task-progress-value').text(e.target.value + '%');
        });
    }

    function loadSettings() {
        // Retrieve all settings from localStorage or use defaults
        return {
            alwaysListening: JSON.parse(localStorage.getItem('alwaysListening')) ?? defaultSettings.alwaysListening,
            selectedMicrophone: localStorage.getItem('selectedMicrophone') ?? defaultSettings.selectedMicrophone,
            selectedVoice: localStorage.getItem('selectedVoice') ?? defaultSettings.selectedVoice,
            voiceLanguage: localStorage.getItem('voiceLanguage') ?? defaultSettings.voiceLanguage,
            voiceRate: parseFloat(localStorage.getItem('voiceRate')) ?? defaultSettings.voiceRate,
            voicePitch: parseFloat(localStorage.getItem('voicePitch')) ?? defaultSettings.voicePitch,
            timerHours: parseInt(localStorage.getItem('timerHours')) ?? defaultSettings.timerHours,
            timerMinutes: parseInt(localStorage.getItem('timerMinutes')) ?? defaultSettings.timerMinutes,
            timerSeconds: parseInt(localStorage.getItem('timerSeconds')) ?? defaultSettings.timerSeconds,
            confidenceLevel: parseInt(localStorage.getItem('confidenceLevel')) ?? defaultSettings.confidenceLevel,
            satisfaction: parseInt(localStorage.getItem('satisfaction')) ?? defaultSettings.satisfaction,
            taskProgress: parseInt(localStorage.getItem('taskProgress')) ?? defaultSettings.taskProgress,
        };
    }

    function saveSetting(key, value) {
        // Save individual setting to localStorage
        localStorage.setItem(key, JSON.stringify(value));
    }
});
