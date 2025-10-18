// Room page functionality
let webrtcClient = null;
let roomId = null;
let username = null;

document.addEventListener('DOMContentLoaded', async function() {
    // Extract room ID from URL
    const pathParts = window.location.pathname.split('/');
    roomId = pathParts[pathParts.length - 1];
    
    // Get username from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    username = urlParams.get('username') || 'Anonymous';

    // Display room info
    document.getElementById('roomIdDisplay').textContent = `Room: ${roomId}`;
    
    // Initialize WebRTC client
    try {
        webrtcClient = new WebRTCClient();
        
        // Wait a bit for initialization
        setTimeout(() => {
            webrtcClient.joinRoom(roomId, { name: username });
        }, 1000);
        
    } catch (error) {
        console.error('Failed to initialize WebRTC client:', error);
        showError('Failed to join the meeting. Please check your camera and microphone permissions.');
        return;
    }

    // Setup UI event handlers
    setupControlHandlers();
    setupChatHandlers();
    
    // Handle page unload
    window.addEventListener('beforeunload', () => {
        if (webrtcClient) {
            webrtcClient.leaveRoom();
        }
    });

    // Handle visibility change (tab switching)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            console.log('Tab hidden - could pause video to save bandwidth');
        } else {
            console.log('Tab visible - resume normal operation');
        }
    });
});

function setupControlHandlers() {
    // Microphone toggle
    const toggleMicBtn = document.getElementById('toggleMic');
    toggleMicBtn.addEventListener('click', () => {
        if (!webrtcClient) return;
        
        const isEnabled = webrtcClient.toggleAudio();
        updateMicButton(isEnabled);
    });

    // Video toggle
    const toggleVideoBtn = document.getElementById('toggleVideo');
    toggleVideoBtn.addEventListener('click', () => {
        if (!webrtcClient) return;
        
        const isEnabled = webrtcClient.toggleVideo();
        updateVideoButton(isEnabled);
    });

    // Screen share toggle
    const toggleScreenShareBtn = document.getElementById('toggleScreenShare');
    toggleScreenShareBtn.addEventListener('click', async () => {
        if (!webrtcClient) return;
        
        const isSharing = await webrtcClient.toggleScreenShare();
        updateScreenShareButton(isSharing);
    });

    // Chat toggle
    const toggleChatBtn = document.getElementById('toggleChat');
    const chatPanel = document.getElementById('chatPanel');
    toggleChatBtn.addEventListener('click', () => {
        chatPanel.classList.toggle('open');
        
        if (chatPanel.classList.contains('open')) {
            document.getElementById('messageInput').focus();
        }
    });

    // Close chat
    const closeChatBtn = document.getElementById('closeChatBtn');
    closeChatBtn.addEventListener('click', () => {
        chatPanel.classList.remove('open');
    });

    // Hang up
    const hangUpBtn = document.getElementById('hangUp');
    hangUpBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to leave the meeting?')) {
            leaveRoom();
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + M for mic toggle
        if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
            e.preventDefault();
            toggleMicBtn.click();
        }
        
        // Ctrl/Cmd + E for video toggle
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
            e.preventDefault();
            toggleVideoBtn.click();
        }
        
        // Ctrl/Cmd + D for screen share
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault();
            toggleScreenShareBtn.click();
        }
        
        // Ctrl/Cmd + Enter for chat toggle
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            toggleChatBtn.click();
        }
        
        // Escape to close chat
        if (e.key === 'Escape') {
            const chatPanel = document.getElementById('chatPanel');
            if (chatPanel.classList.contains('open')) {
                chatPanel.classList.remove('open');
            }
        }
    });
}

function setupChatHandlers() {
    const messageInput = document.getElementById('messageInput');
    const sendMessageBtn = document.getElementById('sendMessage');

    // Send message on button click
    sendMessageBtn.addEventListener('click', () => {
        sendChatMessage();
    });

    // Send message on Enter key
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });

    // Auto-resize input (optional enhancement)
    messageInput.addEventListener('input', () => {
        // Could implement auto-resize here
    });
}

function sendChatMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    
    if (!message || !webrtcClient) return;
    
    webrtcClient.sendChatMessage(message);
    messageInput.value = '';
}

function updateMicButton(isEnabled) {
    const toggleMicBtn = document.getElementById('toggleMic');
    const micIcon = toggleMicBtn.querySelector('.mic-icon');
    const micOffIcon = toggleMicBtn.querySelector('.mic-off-icon');
    
    if (isEnabled) {
        toggleMicBtn.classList.remove('mic-off');
        toggleMicBtn.classList.add('mic-on');
        micIcon.style.display = 'block';
        micOffIcon.style.display = 'none';
        toggleMicBtn.title = 'Mute Microphone';
    } else {
        toggleMicBtn.classList.remove('mic-on');
        toggleMicBtn.classList.add('mic-off');
        micIcon.style.display = 'none';
        micOffIcon.style.display = 'block';
        toggleMicBtn.title = 'Unmute Microphone';
    }
}

function updateVideoButton(isEnabled) {
    const toggleVideoBtn = document.getElementById('toggleVideo');
    const videoIcon = toggleVideoBtn.querySelector('.video-icon');
    const videoOffIcon = toggleVideoBtn.querySelector('.video-off-icon');
    
    if (isEnabled) {
        toggleVideoBtn.classList.remove('video-off');
        toggleVideoBtn.classList.add('video-on');
        videoIcon.style.display = 'block';
        videoOffIcon.style.display = 'none';
        toggleVideoBtn.title = 'Turn Off Video';
    } else {
        toggleVideoBtn.classList.remove('video-on');
        toggleVideoBtn.classList.add('video-off');
        videoIcon.style.display = 'none';
        videoOffIcon.style.display = 'block';
        toggleVideoBtn.title = 'Turn On Video';
    }
}

function updateScreenShareButton(isSharing) {
    const toggleScreenShareBtn = document.getElementById('toggleScreenShare');
    
    if (isSharing) {
        toggleScreenShareBtn.classList.add('active');
        toggleScreenShareBtn.title = 'Stop Screen Share';
    } else {
        toggleScreenShareBtn.classList.remove('active');
        toggleScreenShareBtn.title = 'Share Screen';
    }
}

function leaveRoom() {
    if (webrtcClient) {
        webrtcClient.leaveRoom();
    }
    
    // Redirect to home page
    window.location.href = '/';
}

function showError(message) {
    // Create error notification
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-notification';
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #f44336;
        color: white;
        padding: 1rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        max-width: 300px;
    `;
    errorDiv.textContent = message;
    
    document.body.appendChild(errorDiv);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.remove();
        }
    }, 5000);
}

function showSuccess(message) {
    // Create success notification
    const successDiv = document.createElement('div');
    successDiv.className = 'success-notification';
    successDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 1rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        max-width: 300px;
    `;
    successDiv.textContent = message;
    
    document.body.appendChild(successDiv);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (successDiv.parentNode) {
            successDiv.remove();
        }
    }, 3000);
}

// Handle connection quality monitoring with adaptive video quality
function monitorConnectionQuality() {
    if (!webrtcClient) return;
    
    webrtcClient.peers.forEach((peer, userId) => {
        peer.peerConnection.getStats().then(stats => {
            let videoStats = null;
            let connectionStats = null;
            
            stats.forEach(report => {
                if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
                    videoStats = report;
                } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    connectionStats = report;
                }
            });
            
            if (videoStats) {
                const packetsLost = videoStats.packetsLost || 0;
                const packetsReceived = videoStats.packetsReceived || 0;
                const lossRate = packetsLost / (packetsLost + packetsReceived);
                const frameRate = videoStats.framesPerSecond || 0;
                
                // Adaptive quality based on connection quality
                let quality = 'high';
                if (lossRate > 0.1 || frameRate < 15) {
                    quality = 'low';
                } else if (lossRate > 0.05 || frameRate < 20) {
                    quality = 'medium';
                }
                
                // Apply adaptive quality
                if (webrtcClient.adaptVideoQuality) {
                    webrtcClient.adaptVideoQuality(peer.peerConnection, quality);
                }
                
                console.log(`Video quality for ${userId}: ${quality} (loss: ${(lossRate * 100).toFixed(1)}%, fps: ${frameRate.toFixed(1)})`);
            }
        }).catch(console.error);
    });
}

// Monitor connection quality every 3 seconds for more responsive adaptation
setInterval(monitorConnectionQuality, 3000);

// Handle window resize for responsive video grid
function handleResize() {
    const videoGrid = document.getElementById('videoGrid');
    const participantCount = videoGrid.children.length;
    
    // Adjust grid layout based on participant count
    if (participantCount <= 2) {
        videoGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(400px, 1fr))';
    } else if (participantCount <= 4) {
        videoGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    } else {
        videoGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    }
}

window.addEventListener('resize', handleResize);

// Copy room link functionality
function copyRoomLink() {
    const roomLink = window.location.href;
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(roomLink).then(() => {
            showSuccess('Room link copied to clipboard!');
        }).catch(() => {
            fallbackCopyTextToClipboard(roomLink);
        });
    } else {
        fallbackCopyTextToClipboard(roomLink);
    }
}

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        showSuccess('Room link copied to clipboard!');
    } catch (err) {
        console.error('Fallback: Could not copy text: ', err);
        showError('Could not copy room link');
    }
    
    document.body.removeChild(textArea);
}

// Add copy room link button functionality (if you want to add this feature)
document.addEventListener('click', (e) => {
    if (e.target.id === 'copyRoomLink') {
        copyRoomLink();
    }
});