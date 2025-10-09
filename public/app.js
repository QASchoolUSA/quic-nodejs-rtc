// Landing page functionality
document.addEventListener('DOMContentLoaded', function() {
    const usernameInput = document.getElementById('username');
    const roomIdInput = document.getElementById('roomId');
    const createRoomBtn = document.getElementById('createRoom');
    const joinRoomBtn = document.getElementById('joinRoom');

    // Load saved username
    const savedUsername = localStorage.getItem('quic-rtc-username');
    if (savedUsername) {
        usernameInput.value = savedUsername;
    }

    // Save username on input
    usernameInput.addEventListener('input', function() {
        localStorage.setItem('quic-rtc-username', this.value);
    });

    // Create new room
    createRoomBtn.addEventListener('click', async function() {
        const username = usernameInput.value.trim();
        
        if (!username) {
            alert('Please enter your name');
            usernameInput.focus();
            return;
        }

        try {
            showLoading(createRoomBtn, 'Creating Room...');
            
            const response = await fetch('/api/rooms', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to create room');
            }

            const data = await response.json();
            const roomId = data.roomId;

            // Redirect to room with username
            window.location.href = `/room/${roomId}?username=${encodeURIComponent(username)}`;
            
        } catch (error) {
            console.error('Error creating room:', error);
            showError('Failed to create room. Please try again.');
            resetButton(createRoomBtn, 'Create New Room');
        }
    });

    // Join existing room
    joinRoomBtn.addEventListener('click', function() {
        const username = usernameInput.value.trim();
        const roomId = roomIdInput.value.trim();
        
        if (!username) {
            alert('Please enter your name');
            usernameInput.focus();
            return;
        }

        if (!roomId) {
            alert('Please enter a room ID');
            roomIdInput.focus();
            return;
        }

        // Redirect to room with username
        window.location.href = `/room/${roomId}?username=${encodeURIComponent(username)}`;
    });

    // Enter key handlers
    roomIdInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            joinRoomBtn.click();
        }
    });

    usernameInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            if (roomIdInput.value.trim()) {
                joinRoomBtn.click();
            } else {
                createRoomBtn.click();
            }
        }
    });

    // Auto-focus username input
    usernameInput.focus();
});

// Utility functions
function showLoading(button, text) {
    button.disabled = true;
    button.textContent = text;
    button.style.opacity = '0.7';
}

function resetButton(button, originalText) {
    button.disabled = false;
    button.textContent = originalText;
    button.style.opacity = '1';
}

function showError(message) {
    // Remove existing error messages
    const existingError = document.querySelector('.error');
    if (existingError) {
        existingError.remove();
    }

    // Create and show new error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = message;
    
    const card = document.querySelector('.card');
    card.appendChild(errorDiv);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.remove();
        }
    }, 5000);
}

function showSuccess(message) {
    // Remove existing messages
    const existingMessage = document.querySelector('.success, .error');
    if (existingMessage) {
        existingMessage.remove();
    }

    // Create and show success message
    const successDiv = document.createElement('div');
    successDiv.className = 'success';
    successDiv.textContent = message;
    
    const card = document.querySelector('.card');
    card.appendChild(successDiv);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (successDiv.parentNode) {
            successDiv.remove();
        }
    }, 3000);
}

// Handle URL parameters for direct room access
function handleDirectRoomAccess() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    
    if (roomId) {
        document.getElementById('roomId').value = roomId;
    }
}

// Initialize direct room access handling
handleDirectRoomAccess();