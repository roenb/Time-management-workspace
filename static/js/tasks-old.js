let estimatedTimeRemaining = 60;
let timerInterval;
let totalSeconds = 0;
let mantraText = '';  // Initialize mantraText, which will be fetched from the backend
let selectedTaskId = null; // Store the selected task ID for highlighting and other operations
let selectedMicrophone = null; // Selected microphone input device
let isAlwaysListening = true;

// DOM Elements
let alwaysListeningToggle = document.getElementById('alwaysListeningToggle');
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let mediaStream = null;  // Ensure this is the stream for microphone input
let analyser = null;
let microphone = null;
let volumeMeter = document.getElementById('volume-meter');
let volumeBar = document.getElementById('volume-bar');
let listeningStatus = document.getElementById('listening-status');
let micButton = document.getElementById('mic-button');

function startListening() {
    const savedMicrophone = localStorage.getItem('selectedMicrophone');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Your browser does not support audio recording.');
        return;
    }

    const audioConfig = savedMicrophone ? { audio: { deviceId: { exact: savedMicrophone } } } : { audio: true };

    navigator.mediaDevices.getUserMedia(audioConfig)
        .then(function (stream) {
            mediaStream = stream;  // Store the media stream for use
            if (mediaStream) {
                updateVoiceMeterState(mediaStream);  // Safely call the voice meter update only after the stream is ready
                recordAudioChunks(stream);  // Start chunking audio
            } else {
                console.error('Failed to obtain media stream.');
            }
        })
        .catch(function (err) {
            console.error('Error accessing microphone: ', err);
        });
}


function recordAudioChunks(stream) {
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

    mediaRecorder.ondataavailable = function(event) {
        audioChunks.push(event.data);

        // Send audio to backend in 5-second intervals
        if (audioChunks.length > 0) {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const formData = new FormData();
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            formData.append('audio', blob);
            formData.append('filename', `audio_${timestamp}.webm`);

            fetch('/process_audio_chunk', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.transcribed_text) {
                    appendTranscription(data.transcribed_text);  // Handle the transcribed text
                }
            })
            .catch(error => console.error('Error processing audio:', error));

            audioChunks = [];  // Clear chunks after processing
        }
    };

    mediaRecorder.start(5000);  // Start recording in 5-second chunks
}

function appendTranscription(transcribedText) {
    let chatInput = document.getElementById('user-input');
    let taskInput = document.getElementById('new-task');

    if (document.activeElement === taskInput && taskInput) {
        taskInput.value += transcribedText + ' ';
    } else if (chatInput) {
        chatInput.value += transcribedText + ' ';
    }
}


function autoExpandTextArea(element) {
    element.style.height = 'auto';  // Reset height
    element.style.height = (element.scrollHeight) + 'px';  // Adjust height based on content
}

function stopListening() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaRecorder.stop();
    }
    volumeMeter.style.display = 'none';
    listeningStatus.textContent = 'Not Listening';
}

function startRecording(stream) {
    if (stream instanceof MediaStream) {
        audioChunks = [];  // Clear previous chunks
        try {
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
            mediaRecorder.start();  // Start recording
            isRecording = true;

            updateVoiceMeterState(stream);  // Start the volume meter
            micButton.style.backgroundColor = 'green';  // Indicate recording visually
            listeningStatus.textContent = 'Recording...';  // Update recording status in the UI

            mediaRecorder.ondataavailable = function (event) {
                audioChunks.push(event.data);  // Collect audio chunks
                if (audioChunks.length > 0) {
                    const blob = new Blob(audioChunks, { type: 'audio/webm' });
                    const formData = new FormData();
                    const timestamp = new Date().toISOString().replace(/:/g, '-');
                    formData.append('audio', blob);
                    formData.append('filename', `audio_${timestamp}.webm`);

                    fetch('/save_audio', {
                        method: 'POST',
                        body: formData
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.transcribed_text) {
                            appendTranscription(data.transcribed_text);  // Append transcription to UI
                        }
                    })
                    .catch(error => console.error('Error processing audio:', error));

                    audioChunks = [];  // Clear chunks after processing
                }
            };

            mediaRecorder.onstop = function () {
                isRecording = false;
                volumeBar.style.width = '0%';  // Reset volume meter
                micButton.style.backgroundColor = 'red';  // Change icon back to indicate it's stopped
                listeningStatus.textContent = 'Listening...';  // Reset status
            };
        } catch (err) {
            console.error('Error starting MediaRecorder:', err);
            alert('Failed to start recording. Please ensure microphone is selected and allowed.');
        }
    } else {
        console.error('Invalid MediaStream passed to startRecording.');
        alert('Microphone is not selected or not accessible.');
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();  // Stop recording
        isRecording = false;
        updateVoiceMeterState();  // Ensure the visual state is updated
        micButton.style.backgroundColor = 'red';  // Change icon back
        listeningStatus.textContent = 'Listening...';  // Reset status
    }
}

function processRecording() {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', audioBlob);

    fetch('/process_audio_chunk', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.transcribed_text) {
            handleVoiceCommands(data.transcribed_text);  // Handle task trigger via voice commands
        }
    })
    .catch(error => console.error('Error processing audio:', error));
}


micButton.addEventListener('click', function (e) {
    e.preventDefault();
    if (mediaStream && isAlwaysListening) {
        if (audioChunks.length > 0) {
            processRecording();  // Append the transcription to the input
            micButton.style.backgroundColor = 'green';  // Provide feedback that transcription was appended
        } else {
            alert('No audio chunks available to process.');
        }
    } else {
        alert('Please ensure the microphone is active.');
    }
});

function updateVoiceMeterState(stream) {
    if (stream instanceof MediaStream) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        analyser.fftSize = 256;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        function updateMeter() {
            analyser.getByteFrequencyData(dataArray);
            const maxVolume = Math.max(...dataArray);
            const volumePercentage = (maxVolume / 256) * 100;
            volumeBar.style.width = volumePercentage + '%';

            if (stream.active) {
                requestAnimationFrame(updateMeter);
            } else {
                console.error("Media stream is not active.");
            }
        }

        updateMeter();
    } else {
        console.error('The stream passed to updateVoiceMeterState is not a valid MediaStream.', stream);
    }
}




// Function to initialize microphone stream with "Always Listening" toggle
function initializeMicrophone() {
    const isAlwaysListening = loadListeningState();  // Load the listening state from localStorage
    alwaysListeningToggle.checked = isAlwaysListening;  // Sync the toggle UI with the saved state

    if (isAlwaysListening) {
        startListening();  // Start listening if the toggle is on
    } else {
        stopListening();  // Ensure the microphone is not active if the toggle is off
    }

    // Event listener for Always Listening toggle
    alwaysListeningToggle.addEventListener('change', function () {
        const isAlwaysListening = this.checked;
        saveListeningState(isAlwaysListening);  // Save the state to localStorage

        if (isAlwaysListening) {
            startListening();  // Start the microphone stream when enabled
        } else {
            stopListening();  // Stop the microphone stream when disabled
        }
    });
}



// Automatically start listening if "Always Listening" is enabled on load
if (isAlwaysListening) {
    initializeMicrophone();  // Initialize microphone on load
}


// Voice commands integration for task management and chat submission
function handleVoiceCommands(transcribedText) {
    let lowerCaseText = transcribedText.toLowerCase().trim();

    // Ensure no commands are added to the input fields
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

    // If the system is focused on task input, append the transcribed text to the task input field
    if (taskInputFocused) {
        appendTaskText(lowerCaseText);  // Append transcribed text to task input
    }

    // If the system is focused on chat input, append the transcribed text to the chat input field
    if (chatInputFocused) {
        appendChatText(lowerCaseText);  // Append transcribed text to chat input
    }

    // Switch Task Command (e.g., "switch to task 1")
    const switchTaskRegex = /switch to task (\d+)/;
    const switchMatch = lowerCaseText.match(switchTaskRegex);
    if (switchMatch) {
        const taskId = switchMatch[1];
        switchToTask(taskId);
    }

    // Complete Task Command (e.g., "complete task 1")
    const completeTaskRegex = /complete task (\d+)/;
    const completeMatch = lowerCaseText.match(completeTaskRegex);
    if (completeMatch) {
        const taskId = completeMatch[1];
        completeTask(taskId);
    }

    // Add Task Command (e.g., "add task [task content]")
    if (lowerCaseText.includes("add task")) {
        focusOnTaskInput();  // Focus on task input for appending transcribed text
    }

    // Save Task Command (e.g., "save task")
    if (transcribedText.includes("save task")) {
        saveTaskByVoice();  // Trigger task submission by voice command
    }

    // Switch to Chat Command (e.g., "switch to chat")
    if (lowerCaseText.includes("switch to chat")) {
        focusOnChat();  // Focus on chat input for appending transcribed text
    }

    // Submit Chat Command (e.g., "submit chat")
    if (transcribedText.includes("submit chat")) {
        submitChatByVoice();  // Trigger chat submission by voice command
    }

    // Start Timer Command (e.g., "start timer")
    if (lowerCaseText.includes("start timer")) {
        startTimer();
    }

    // Stop Timer Command (e.g., "stop timer")
    if (lowerCaseText.includes("stop timer")) {
        stopTimer();
    }

    // Set Timer Command (e.g., "set timer for 5 minutes")
    const setTimerRegex = /set timer for (\d+) (minutes|hours|seconds)/;
    const timerMatch = lowerCaseText.match(setTimerRegex);
    if (timerMatch) {
        const duration = parseInt(timerMatch[1]);
        const unit = timerMatch[2];
        setTimer(duration, unit);
    }
}

// Function to append transcribed text to the task input field
function appendTaskText(text) {
    const taskInput = document.getElementById('new-task');
    taskInput.value += text + ' ';  // Append transcribed text to the task input field
}

// Function to trigger task submission via voice command
function saveTaskByVoice() {
    const taskInput = document.getElementById('new-task');
    const taskName = taskInput.value.trim();

    if (taskName) {
        $.post('/add_task', { task: taskName }, function (response) {
            alert('Task saved: ' + taskName);
            taskInput.value = '';  // Clear the task input field after submission
            loadTasks();  // Reload the tasks to update the list
        }).fail(function () {
            alert('Error: Could not save task.');
        });
    }
}

// Function to append transcribed text to the chat input field
function appendChatText(text) {
    const chatInput = document.getElementById('user-input');
    chatInput.value += text + ' ';  // Append transcribed text to the chat input field
}

// Function to trigger chat submission via voice command
function submitChatByVoice() {
    const chatInput = document.getElementById('user-input');
    const chatMessage = chatInput.value.trim();

    if (chatMessage) {
        const chatBox = $('#chat-box');
        const spinner = $('#loading-spinner');
        spinner.show();
        chatBox.append('<p><strong>User:</strong> ' + chatMessage + '</p>');

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
                // Append LLM response to the chat
                chatBox.append('<p><strong>LLM:</strong> ' + response + '</p>');
                chatInput.value = '';  // Clear chat input field after submission
            },
            error: function () {
                spinner.hide();
                alert('Error: Could not submit chat.');
            }
        });
    }
}

// Function to focus on task input when the "add task" command is detected
function focusOnTaskInput() {
    const taskInput = document.getElementById('new-task');
    taskInput.focus();  // Set focus to the task input field
    taskInputFocused = true;  // Mark task input as focused
    chatInputFocused = false;  // Unmark chat input as focused
}

// Function to focus on chat input when the "switch to chat" command is detected
function focusOnChat() {
    const chatInput = document.getElementById('user-input');
    chatInput.focus();  // Set focus to the chat input field
    chatInputFocused = true;  // Mark chat input as focused
    taskInputFocused = false;  // Unmark task input as focused
}



// Function to switch tasks by task ID
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


// Function to complete tasks by task ID
function completeTask(taskId) {
    console.log(`Completing task ${taskId}`);
    $.post(`/complete_task/${taskId}`, function (response) {
        alert(`Task ${taskId} marked as complete!`);
        loadTasks();
    }).fail(function () {
        alert('Error completing task');
    });
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



// Handle task addition via voice command
$('#add-task-by-voice').click(function () {
    if (mediaStream) {
        startRecording(mediaStream);

        setTimeout(() => {
            stopRecording();

            // After recording stops, the transcribed text will be appended to the task input field
        }, 15000);  // Stop after 15 seconds for task creation
    }
});

// Automatically expand the input field as text is added
document.getElementById('user-input').addEventListener('input', function () {
    this.style.height = 'auto';  // Reset height
    this.style.height = (this.scrollHeight) + 'px';  // Set height based on content
});


// Clear preferences when the user resets the microphone selection
$('#clear-mic-selection').click(function () {
    localStorage.removeItem('selectedMicrophone');
    localStorage.removeItem('voiceLanguage');
    localStorage.removeItem('voiceGender');
    localStorage.removeItem('voiceRate');
    localStorage.removeItem('voicePitch');
    alert('Microphone and voice settings cleared. Please re-select.');
    $('#microphoneModal').modal('show');
});

    // Reset session and reload page



// Function to send saved audio file for processing
function processSavedAudio(filePath) {
    const formData = new FormData();
    formData.append('file_path', filePath);  // Send the saved file path for processing

    fetch('/process_audio_chunk', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.transcribed_text) {
            console.log('Transcription:', data.transcribed_text);
            appendTranscription(data.transcribed_text);
        } else {
            console.error('Error in transcription:', data.error);
        }
    })
    .catch(error => {
        console.error('Error processing audio chunk:', error);
    });
}


function loadTasks() {
    $.get('/get_tasks', function (data) {
        console.log("Fetched Tasks:", data);  // Log the fetched data

        if (data && data.tasks) {
            $('#task-list').empty();  // Clear the task list

            data.tasks.forEach((task, index) => {
                // Ensure you use task.title or task.task depending on your backend's structure
                const taskTitle = task.title || "Untitled Task";  // Fallback if title is missing
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
                $('#task-list').append(taskItem);
            });
        } else {
            console.log("No tasks found or data structure is incorrect.");
        }
    }).fail(function () {
        console.error('Error: Could not load tasks from backend');
    });
}

// Task deletion logic
$('#delete-task').click(function () {
    // Example of using the dynamic modal for task deletion
    showDynamicConfirmationModal({
        title: 'Delete Task',
        message: 'Are you sure you want to delete this task? This action cannot be undone.',
        confirmAction: function() {
            // Execute task deletion logic
            deleteTask(taskId);
        }
    });
});


// Confirm delete task
$('#confirm-delete-btn').on('click', function () {
    const taskId = $(this).data('task-id');
    $.post(`/delete_task/${taskId}`, function () {
        $('#deleteModal').modal('hide');  // Hide the modal
        loadTasks();  // Reload tasks after deletion
    }).fail(() => {
        alert('Error: Could not delete task');
    });
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

window.onload = function () {
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

    // Continue with any other initializations like always listening
    const isAlwaysListening = localStorage.getItem('alwaysListening') === 'true';
    const alwaysListeningToggle = document.getElementById('alwaysListeningToggle');
    alwaysListeningToggle.checked = isAlwaysListening;

    if (isAlwaysListening) {
        startListening();  // This should initialize the microphone and volume meter
    } else {
        stopListening();  // In case it's not, make sure to stop any active streams
    }
};

// Helper functions for saving and loading listening state from localStorage
function saveListeningState(state) {
    localStorage.setItem('alwaysListening', state);
}

function loadListeningState() {
    return localStorage.getItem('alwaysListening') === 'true';
}


function speakText(text, settings = {}) {
    const voiceSelect = document.getElementById('voice-selection');
    const selectedVoiceIndex = voiceSelect.value;  // Get the selected voice's index
    const voices = speechSynthesis.getVoices();

    const defaultSettings = {
        language: 'en-US',  // Default to English (US) if no selection
        rate: 2.7,
        pitch: 1.2
    };

    // Merge provided settings with defaults
    const { language, rate, pitch } = { ...defaultSettings, ...settings };

    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = rate;  // Use the configured speech rate
        utterance.pitch = pitch;  // Use the configured pitch

        // Use the selected voice
        if (voices[selectedVoiceIndex]) {
            utterance.voice = voices[selectedVoiceIndex];
        }

        // Handle when speech ends
        utterance.onend = function() {
            console.log("Speech finished.");
        };

        window.speechSynthesis.speak(utterance);
    }
}


// Timer form submission
document.getElementById('timer-form').addEventListener('submit', function(e) {
    e.preventDefault();

    let hours = parseInt(document.getElementById('hours').value);
    let minutes = parseInt(document.getElementById('minutes').value);
    let seconds = parseInt(document.getElementById('seconds').value);

    totalSeconds = (hours * 3600) + (minutes * 60) + seconds;
    const originalSeconds = totalSeconds;

    if (totalSeconds > 0) {
        document.getElementById('timer-output').classList.add('running');
        document.getElementById('notification-sound').play();
        speakText(`Check your Plan! Can you do this task in ${Math.floor(originalSeconds / 60)} minutes?`);

        // Timer logic
        timerInterval = setInterval(function() {
            if (totalSeconds <= 0) {
                clearInterval(timerInterval);
                document.getElementById('timer-output').classList.remove('running');
                document.getElementById('timer-output').textContent = 'Time: 00:00:00';

                // Play gong sound when the timer finishes
                document.getElementById('gong-sound').play();

                // Set a slight delay to give space between the gong and the applause/mantra
                setTimeout(() => {
                    // Play the applause sound
                    document.getElementById('applause-sound').play();

                    // After the applause starts, read the mantra
                    speakText(mantraText);  // Use the fetched mantra here
                }, 2000);  // 2-second delay after gong

                // Automatically trigger the accordion to open for session rating
                $('#collapseOne').collapse('show');
                return;
            }

            // Inside the timer countdown
            totalSeconds--;
            let displayHours = Math.floor(totalSeconds / 3600);
            let displayMinutes = Math.floor((totalSeconds % 3600) / 60);
            let displaySeconds = totalSeconds % 60;
            document.getElementById('timer-output').textContent = `Time: ${String(displayHours).padStart(2, '0')}:${String(displayMinutes).padStart(2, '0')}:${String(displaySeconds).padStart(2, '0')}`;

            // Trigger notifications at 10%, 30%, 60%
            if (totalSeconds === Math.floor(originalSeconds * 0.9)) {
                speakText("Great Job!");
                document.getElementById('applause-sound').play();
            } else if (totalSeconds === Math.floor(originalSeconds * 0.669)) {
                speakText("Start the Work or refine this task into smaller pieces");
                document.getElementById('notification-sound').play();
            } else if (totalSeconds === Math.floor(originalSeconds * 0.331)) {
                speakText("Time to reflect on, refine or finish this task");
                document.getElementById('notification-sound').play();
            }
        }, 1000);
    }
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

    // Handle LLM response reading
    document.getElementById('read-response-button').addEventListener('click', function() {
        let llmResponse = document.getElementById('chat-box').innerText;
        if (llmResponse) {
            speakText(llmResponse);
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

// LLM form submission with streaming
$('#chat-form').on('submit', function (e) {
    e.preventDefault();

    let message = $('#user-input').val();
    let chatBox = $('#chat-box');
    let spinner = $('#loading-spinner');
    spinner.show();
    chatBox.append('<p><strong>User:</strong> ' + message + '</p>');  // Append user input to chat

    // Clearing the user input after submission
    $('#user-input').val(''); // This will clear the input after submit

    let temperature = $('#temperature').val();
    let top_p = $('#top_p').val();
    let top_k = $('#top_k').val();
    let max_tokens = $('#max_tokens').val();
    let stream = $('#stream').is(':checked');
    let system_message = $('#system-message').val();

    const requestData = {
        prompt: message,
        temperature: parseFloat(temperature),
        top_p: parseFloat(top_p),
        top_k: parseInt(top_k),
        max_tokens: parseInt(max_tokens),
        system_message: system_message,
        stream: stream
    };

    let llmResponseParagraph = $('<p><strong>LLM:</strong> </p>');
    chatBox.append(llmResponseParagraph);  // Create one LLM response paragraph to append tokens

    let buffer = '';  // Buffer for accumulating tokens
    let previousToken = "";  // Variable to track the previous token to avoid repeats
    let tokenBuffer = [];
    let bufferThreshold = 5;  // Buffer 5 tokens before appending to chat

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
                let token = line.substring(5).trim();  // Extract the token

                if (token === "[DONE]") {
                    spinner.hide();  // End the response handling
                    return;
                }

                if (token.startsWith('_')) {
                    previousToken += token;  // Merge with previous token (no space)
                } else {
                    if (previousToken) {
                        tokenBuffer.push(previousToken);
                        previousToken = "";
                    }
                    tokenBuffer.push(token);

                    if (tokenBuffer.length >= bufferThreshold) {
                        llmResponseParagraph.append(tokenBuffer.join(' '));
                        tokenBuffer = [];
                    }
                }

                chatBox.scrollTop(chatBox[0].scrollHeight);
            }
        }

        buffer = lines[lines.length - 1];  // Keep leftover buffer for the next iteration
    };

    xhr.onload = function () {
        spinner.hide();

        // If streaming was not enabled, handle the full response here
        if (!stream) {
            const fullResponse = xhr.responseText;

            try {
                const jsonResponse = JSON.parse(fullResponse);
                const assistantMessage = jsonResponse.choices[0].message?.content;

                if (assistantMessage) {
                    llmResponseParagraph.append(assistantMessage);  // Append only the assistant's content to the chat
                } else {
                    llmResponseParagraph.append('<p class="text-danger">Error: No assistant message found.</p>');
                }
            } catch (error) {
                llmResponseParagraph.append('<p class="text-danger">Error: Invalid response format or malformed JSON.</p>');
            }
        }

        // Append any remaining tokens in the buffer
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

    // Send the request with the LLM data
    xhr.send(JSON.stringify(requestData));
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
    }function populateVoiceList() {
    if (typeof speechSynthesis === 'undefined') {
        return;
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
}

// Populate voices on page load and when voices change
populateVoiceList();
speechSynthesis.onvoiceschanged = populateVoiceList;


        // Handle visibility change
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                pauseTasks();  // Pause tasks that aren't needed in the background
            } else {
                resumeTasks();  // Resume any necessary tasks when visible
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

    // Populate default LLM settings
    window.onload = function () {
        document.getElementById("top_p").value = 0.9;
        document.getElementById("top_k").value = 40;
    };


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
                    startListening();  // Start the listening process with the selected microphone
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
            icon: '/path/to/icon.png',  // Optional icon for the notification
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
// Function to save and load microphone settings already exists and is optimized.
$(document).ready(function () {
    // Initialize microphone and load settings
    const savedMicrophone = localStorage.getItem('selectedMicrophone');
    const savedVoice = localStorage.getItem('selectedVoice');
    const savedLanguage = localStorage.getItem('voiceLanguage') || 'en-US';
    const savedRate = localStorage.getItem('voiceRate') || 2.7;
    const savedPitch = localStorage.getItem('voicePitch') || 1.2;

    // Set form fields to saved settings
    $('#voice-language').val(savedLanguage);
    $('#voice-rate').val(savedRate);
    $('#voice-pitch').val(savedPitch);

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

    // Populate voice list
    populateVoiceList();

    // Auto-load tasks and settings
    loadTasks();
    loadMantra();

    // Automatically start listening if "Always Listening" is enabled
    const isAlwaysListening = localStorage.getItem('alwaysListening') === 'true';
    $('#alwaysListeningToggle').prop('checked', isAlwaysListening);

    if (isAlwaysListening) {
        startListening();
    }

    // Auto-expand chat input as text is typed
    $('#user-input').on('input', function () {
        this.style.height = 'auto';  // Reset height
        this.style.height = (this.scrollHeight) + 'px';  // Adjust based on content
    });

    function showDynamicConfirmationModal({ title, message, confirmAction }) {
        // Set the modal title and message dynamically
        $('#dynamicConfirmationModalLabel').text(title);  // Assuming the modal title has this ID
        $('#dynamicConfirmationMessage').text(message);  // Assuming the modal message has this ID
    
        // Set the confirm button action
        $('#dynamicConfirmationAction').off('click').on('click', function () {
            // Execute the passed confirm action function
            confirmAction();
    
            // Hide the modal after the action
            $('#dynamicConfirmationModal').modal('hide');
        });
    
        // Show the modal
        $('#dynamicConfirmationModal').modal('show');
    }
    
    $('#reset-session').click(function (e) {
        e.preventDefault();  // Prevent default behavior, including form submission or page reload
    
        // Call the unified function to show the modal
        showDynamicConfirmationModal({
            title: 'Reset Session',
            message: 'Are you sure you want to reset the session?',
            confirmAction: function () {
                location.reload();  // Example action: Reload the page
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

        let llmResponseParagraph = $('<p><strong>LLM:</strong> </p>');
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

            // If not streaming, handle full response
            if (!requestData.stream) {
                try {
                    const jsonResponse = JSON.parse(xhr.responseText);
                    const assistantMessage = jsonResponse.choices[0].message?.content;
                    if (assistantMessage) {
                        llmResponseParagraph.append(assistantMessage);
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

    // Confirm delete task
    $('#confirm-delete-btn').on('click', function () {
        const taskId = $(this).data('task-id');
        $.post(`/delete_task/${taskId}`, function () {
            $('#deleteModal').modal('hide');
            loadTasks();
        }).fail(() => {
            alert('Error: Could not delete task');
        });
    });

    // Task selection and loading details
    $(document).on('click', '.select-task', function () {
        const taskItem = $(this).closest('.list-group-item');
        const taskIndex = taskItem.data('task-id');
        selectedTaskId = taskIndex;
        $('.list-group-item').removeClass('active');
        taskItem.addClass('active');

        $.get(`/get_task/${taskIndex}`, function (task) {
            if (task) {
                $('#task-details-container').html(`
                    <div id="taskAccordion">
                        <h6>${task.title || "Untitled Task"}</h6>
                        <p>Description: ${task.description || "No description"}</p>
                        <!-- Add more task details here -->
                    </div>
                `);
                $('#collapseTaskDetails').collapse('show');
            } else {
                alert("Error: Task not found");
            }
        }).fail(function () {
            console.error("Error fetching task details.");
        });
    });

    // Handle LLM response reading
    $('#read-response-button').on('click', function () {
        let llmResponse = $('#chat-box').text();
        if (llmResponse) {
            speakText(llmResponse);
        }
    });
});  // Closing the ready function correctly
