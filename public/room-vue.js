const { createApp } = Vue;

createApp({
    data() {
        return {
            // Room state
            roomId: '',
            localUserName: '',
            participantCount: 1,
            
            // Media controls
            micEnabled: true,
            videoEnabled: true,
            
            // Camera switching
            availableCameras: [],
            currentCameraIndex: 0,
            showCameraDropdown: false,
            
            // Microphone switching
            availableMics: [],
            currentMicIndex: 0,
            showMicDropdown: false,
            
            
            // Peers
            remotePeers: [],
            
            // Connection
            connectionStatus: null,
            isInitializing: true,
            
            // WebRTC client
            webrtcClient: null
        };
    },
        async mounted() {
            // Get room ID and username from URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            this.roomId = urlParams.get('room') || 'default-room';
            this.localUserName = localStorage.getItem('username') || 'Anonymous';
            
            // Initialize WebRTC immediately without delay
            this.initWebRTC();
            
            // Get available cameras and microphones
            await this.getAvailableCameras();
            await this.getAvailableMics();
            
            // Join room immediately
            this.joinRoom();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Mark initialization as complete
            this.isInitializing = false;
        },
    methods: {
        // Join room
        joinRoom() {
            if (this.webrtcClient) {
                this.webrtcClient.joinRoom(this.roomId, { name: this.localUserName });
                // Don't show connection status immediately to prevent flash
                // this.connectionStatus = {
                //     type: 'info',
                //     message: 'Joining room...'
                // };
            }
        },

        // Check if required APIs are available
        checkBrowserSupport() {
            const requiredAPIs = {
                'MediaDevices API': 'mediaDevices' in navigator,
                'getUserMedia': 'getUserMedia' in (navigator.mediaDevices || {}),
                'WebRTC': 'RTCPeerConnection' in window,
                'WebSocket': 'WebSocket' in window,
                'Crypto API': 'crypto' in window && 'subtle' in window.crypto
            };
            
            const missingAPIs = Object.entries(requiredAPIs)
                .filter(([name, available]) => !available)
                .map(([name]) => name);
            
            if (missingAPIs.length > 0) {
                this.showConnectionStatus(
                    `Missing required APIs: ${missingAPIs.join(', ')}. Please use a modern browser.`, 
                    'error'
                );
                return false;
            }
            
            // Check if running on HTTPS or localhost
            const isSecure = location.protocol === 'https:' || 
                           location.hostname === 'localhost' || 
                           location.hostname === '127.0.0.1';
            
            if (!isSecure) {
                this.showConnectionStatus(
                    'WebRTC requires HTTPS or localhost. Please access via HTTPS or localhost.', 
                    'error'
                );
                return false;
            }
            
            return true;
        },

        // Initialize WebRTC client
        initWebRTC() {
            // Check browser support first
            if (!this.checkBrowserSupport()) {
                return;
            }
            
            this.webrtcClient = new WebRTCClient();
            
            // Set up event listeners for WebRTC events
            this.webrtcClient.on('remoteStream', (data) => {
                console.log('Remote stream received:', data);
                this.addRemotePeer(data.userId, data.stream, data.username || 'Participant');
            });
            
            this.webrtcClient.on('localStream', (stream) => {
                console.log('Local stream received:', stream);
                this.$nextTick(() => {
                    const localVideo = this.$refs.localVideo;
                    if (localVideo) {
                        localVideo.srcObject = stream;
                    }
                });
            });
            
            this.webrtcClient.on('localStreamUpdated', (stream) => {
                console.log('Local stream updated:', stream);
                this.$nextTick(() => {
                    const localVideo = this.$refs.localVideo;
                    if (localVideo) {
                        localVideo.srcObject = stream;
                    }
                });
            });
            
            this.webrtcClient.on('peerRemoved', (userId) => {
                console.log('Peer removed:', userId);
                this.removeRemotePeer(userId);
            });
            
            this.webrtcClient.on('participantJoined', (data) => {
                console.log('Participant joined:', data);
                this.participantCount = data.participantCount || this.participantCount + 1;
            });
            
            this.webrtcClient.on('participantLeft', (data) => {
                console.log('Participant left:', data);
                this.participantCount = Math.max(1, this.participantCount - 1);
            });
            
            // Initialize WebRTC
            this.webrtcClient.init().then(() => {
                console.log('WebRTC client initialized');
                this.showConnectionStatus('Connected to server', 'success');
            }).catch(error => {
                console.error('Failed to initialize WebRTC:', error);
                this.showConnectionStatus('Failed to connect: ' + error.message, 'error');
            });
        },
        
        setupEventListeners() {
            // Handle page unload
            window.addEventListener('beforeunload', () => {
                if (this.webrtcClient) {
                    this.webrtcClient.leaveRoom();
                }
            });
            
            // Handle visibility change for unread messages
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && this.chatVisible) {
                    this.unreadMessages = 0;
                }
            });
            
            // Handle clicks outside dropdowns
            document.addEventListener('click', (event) => {
                if (this.showCameraDropdown && !event.target.closest('.control-group')) {
                    this.showCameraDropdown = false;
                }
                if (this.showMicDropdown && !event.target.closest('.control-group')) {
                    this.showMicDropdown = false;
                }
            });
        },
        
        // Media controls
        async toggleMicrophone() {
            if (this.webrtcClient) {
                this.micEnabled = this.webrtcClient.toggleAudio();
            }
        },
        
        async toggleVideo() {
            if (this.webrtcClient) {
                this.videoEnabled = this.webrtcClient.toggleVideo();
            }
        },

        // Camera switching
        async getAvailableCameras() {
            try {
                // Check if mediaDevices is available
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    console.warn('MediaDevices API not available');
                    this.availableCameras = [];
                    return;
                }
                
                // Request permissions first to get proper device labels
                await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                
                const devices = await navigator.mediaDevices.enumerateDevices();
                this.availableCameras = devices.filter(device => device.kind === 'videoinput');
                console.log('Available cameras:', this.availableCameras.map(cam => ({ id: cam.deviceId, label: cam.label })));
                
                // Set initial camera if not set
                if (this.availableCameras.length > 0 && this.webrtcClient && !this.webrtcClient.currentCameraDeviceId) {
                    this.webrtcClient.currentCameraDeviceId = this.availableCameras[0].deviceId;
                }
            } catch (error) {
                console.error('Error getting available cameras:', error);
                this.availableCameras = [];
                this.showConnectionStatus('Camera access denied or not available', 'error');
            }
        },

        // Microphone switching
        async getAvailableMics() {
            try {
                // Check if mediaDevices is available
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    console.warn('MediaDevices API not available');
                    this.availableMics = [];
                    return;
                }
                
                // Request permissions first to get proper device labels
                await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                
                const devices = await navigator.mediaDevices.enumerateDevices();
                this.availableMics = devices.filter(device => device.kind === 'audioinput');
                console.log('Available microphones:', this.availableMics.map(mic => ({ id: mic.deviceId, label: mic.label })));
                
                // Set initial microphone if not set
                if (this.availableMics.length > 0 && this.webrtcClient && !this.webrtcClient.currentMicDeviceId) {
                    this.webrtcClient.currentMicDeviceId = this.availableMics[0].deviceId;
                }
            } catch (error) {
                console.error('Error getting available microphones:', error);
                this.availableMics = [];
                this.showConnectionStatus('Microphone access denied or not available', 'error');
            }
        },

        // Camera dropdown methods
        toggleCameraDropdown() {
            this.showCameraDropdown = !this.showCameraDropdown;
            // Close mic dropdown when opening camera dropdown
            if (this.showCameraDropdown) {
                this.showMicDropdown = false;
            }
        },

        // Microphone dropdown methods
        toggleMicDropdown() {
            this.showMicDropdown = !this.showMicDropdown;
            // Close camera dropdown when opening mic dropdown
            if (this.showMicDropdown) {
                this.showCameraDropdown = false;
            }
        },

        async selectCamera(cameraIndex) {
            if (cameraIndex === this.currentCameraIndex) {
                this.showCameraDropdown = false;
                return;
            }

            try {
                this.currentCameraIndex = cameraIndex;
                const selectedCamera = this.availableCameras[cameraIndex];
                
                console.log('Switching to camera:', selectedCamera.label || `Camera ${cameraIndex + 1}`, 'Device ID:', selectedCamera.deviceId);
                
                // Switch camera in WebRTC client
                if (this.webrtcClient) {
                    await this.webrtcClient.switchCamera(selectedCamera.deviceId);
                    this.showConnectionStatus(`Switched to ${selectedCamera.label || 'Camera ' + (cameraIndex + 1)}`, 'success');
                } else {
                    console.error('WebRTC client not available');
                    this.showConnectionStatus('WebRTC client not available', 'error');
                }
                
                this.showCameraDropdown = false;
            } catch (error) {
                console.error('Error switching camera:', error);
                this.showConnectionStatus('Failed to switch camera: ' + error.message, 'error');
            }
        },

        async selectMic(micIndex) {
            if (micIndex === this.currentMicIndex) {
                this.showMicDropdown = false;
                return;
            }

            try {
                this.currentMicIndex = micIndex;
                const selectedMic = this.availableMics[micIndex];
                
                console.log('Switching to microphone:', selectedMic.label || `Microphone ${micIndex + 1}`, 'Device ID:', selectedMic.deviceId);
                
                // Switch microphone in WebRTC client
                if (this.webrtcClient) {
                    await this.webrtcClient.switchMicrophone(selectedMic.deviceId);
                    this.showConnectionStatus(`Switched to ${selectedMic.label || 'Microphone ' + (micIndex + 1)}`, 'success');
                } else {
                    console.error('WebRTC client not available');
                    this.showConnectionStatus('WebRTC client not available', 'error');
                }
                
                this.showMicDropdown = false;
            } catch (error) {
                console.error('Error switching microphone:', error);
                this.showConnectionStatus('Failed to switch microphone: ' + error.message, 'error');
            }
        },

        async switchCamera() {
            console.log('Switch camera called, available cameras:', this.availableCameras.length);
            
            if (this.availableCameras.length <= 1) {
                console.log('Not enough cameras to switch');
                this.showConnectionStatus('No additional cameras available', 'error');
                return;
            }
            
            try {
                // Cycle to next camera
                this.currentCameraIndex = (this.currentCameraIndex + 1) % this.availableCameras.length;
                const selectedCamera = this.availableCameras[this.currentCameraIndex];
                
                console.log('Switching to camera:', selectedCamera.label || `Camera ${this.currentCameraIndex + 1}`, 'Device ID:', selectedCamera.deviceId);
                
                // Switch camera in WebRTC client
                if (this.webrtcClient) {
                    await this.webrtcClient.switchCamera(selectedCamera.deviceId);
                    this.showConnectionStatus(`Switched to ${selectedCamera.label || 'Camera ' + (this.currentCameraIndex + 1)}`, 'success');
                } else {
                    console.error('WebRTC client not available');
                    this.showConnectionStatus('WebRTC client not available', 'error');
                }
            } catch (error) {
                console.error('Error switching camera:', error);
                this.showConnectionStatus('Failed to switch camera: ' + error.message, 'error');
            }
        },

        

        
        // Peer management
        addRemotePeer(peerId, stream, username) {
            const existingPeer = this.remotePeers.find(p => p.id === peerId);
            if (existingPeer) {
                existingPeer.stream = stream;
                existingPeer.username = username;
            } else {
                this.remotePeers.push({
                    id: peerId,
                    stream,
                    username: username || 'Participant'
                });
            }
            
            // Update participant count
            this.participantCount = this.remotePeers.length + 1;
            
            // Update video grid layout class for better browser compatibility
            this.updateVideoGridLayout();
            
            this.$nextTick(() => {
                const videoElement = this.$refs[`remoteVideo-${peerId}`];
                if (videoElement && videoElement[0]) {
                    videoElement[0].srcObject = stream;
                    console.log(`Video stream assigned to remote video element for peer ${peerId}`);
                } else {
                    console.warn(`Could not find video element for peer ${peerId}`);
                }
            });
        },
        
        removeRemotePeer(peerId) {
            const index = this.remotePeers.findIndex(p => p.id === peerId);
            if (index !== -1) {
                this.remotePeers.splice(index, 1);
                // Update participant count
                this.participantCount = this.remotePeers.length + 1;
                // Update video grid layout class
                this.updateVideoGridLayout();
            }
        },

        // Update video grid layout class for better browser compatibility
        updateVideoGridLayout() {
            this.$nextTick(() => {
                const videoGrid = this.$refs.videoGrid;
                if (videoGrid) {
                    // Remove existing layout classes
                    videoGrid.classList.remove('layout-1', 'layout-2', 'layout-3', 'layout-4', 'layout-5', 'layout-6', 'layout-7', 'layout-8', 'layout-9');
                    
                    // Add appropriate layout class based on total participants (including local)
                    const totalParticipants = this.remotePeers.length + 1; // +1 for local user
                    videoGrid.classList.add(`layout-${totalParticipants}`);
                }
            });
        },
        
        // Utility functions
        async copyRoomLink() {
            const roomLink = `${window.location.origin}/room.html?room=${this.roomId}`;
            try {
                await navigator.clipboard.writeText(roomLink);
                this.showConnectionStatus('Room link copied to clipboard!', 'success');
            } catch (error) {
                console.error('Failed to copy room link:', error);
                this.showConnectionStatus('Failed to copy room link', 'error');
            }
        },
        
        hangUp() {
            if (this.webrtcClient) {
                this.webrtcClient.leaveRoom();
            }
            window.location.href = 'index.html';
        },
        
        showConnectionStatus(message, type) {
            this.connectionStatus = { message, type };
            
            // Auto-hide after 5 seconds for non-error messages
            if (type !== 'error') {
                setTimeout(() => {
                    if (this.connectionStatus && this.connectionStatus.message === message) {
                        this.connectionStatus = null;
                    }
                }, 5000);
            }
        },
        
        updateConnectionQuality(quality) {
            const qualityMessages = {
                excellent: 'Connection: Excellent',
                good: 'Connection: Good',
                fair: 'Connection: Fair',
                poor: 'Connection: Poor'
            };
            
            const qualityTypes = {
                excellent: 'success',
                good: 'success',
                fair: 'warning',
                poor: 'error'
            };
            
            if (quality !== 'excellent') {
                this.showConnectionStatus(
                    qualityMessages[quality] || 'Connection issues detected',
                    qualityTypes[quality] || 'warning'
                );
            }
        },

        // Retry connection
        async retryConnection() {
            this.connectionStatus = null;
            this.showConnectionStatus('Retrying connection...', 'info');
            
            try {
                // Reinitialize WebRTC
                this.initWebRTC();
                
                // Re-get available devices
                await this.getAvailableCameras();
                await this.getAvailableMics();
                
                this.showConnectionStatus('Connection retried successfully', 'success');
            } catch (error) {
                console.error('Retry failed:', error);
                this.showConnectionStatus('Retry failed: ' + error.message, 'error');
            }
        }
    },
    
    beforeUnmount() {
        if (this.webrtcClient) {
            this.webrtcClient.leaveRoom();
        }
    }
}).mount('#app');