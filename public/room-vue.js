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
            videoEnabled: false,
            
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
            // Add a short grace period for participants right after join
            isJoining: false,
            joinGraceTimeoutId: null,
            
            // WebRTC client
            webrtcClient: null,

            // Fullscreen state
            fullscreenPeerId: null,
            isRoomCreator: false,
        };
    },
                async mounted() {
                    this.setAppHeight();
                    window.addEventListener('resize', this.setAppHeight);

                    // Get room ID and username from URL parameters
                    const urlParams = new URLSearchParams(window.location.search);
                    this.roomId = urlParams.get('room') || 'default-room';
                    this.localUserName = localStorage.getItem('username') || 'Anonymous';
        
                    try {
                        // Initialize WebRTC and get media permissions
                        await this.initWebRTC();
                        
                        // Get available devices now that permissions are granted
                        await this.getAvailableDevices();

                        // Listen for devices being added/removed (e.g., connecting AirPods)
                        if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
                            navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange);
                        }
                        
                        // Join the room
                        this.joinRoom();
                        
                        // Set up other event listeners
                        this.setupEventListeners();
        
                    } catch (error) {
                        // initWebRTC will have already set the error message
                        console.error("Initialization failed:", error);
                    } finally {
                        // Mark initialization as complete
                        this.isInitializing = false;
                    }
                },
            methods: {
                // Join room
                joinRoom() {
                    if (this.webrtcClient) {
                        // Check if this is a room creator (first person to join)
                        const urlParams = new URLSearchParams(window.location.search);
                        this.isRoomCreator = urlParams.get('creator') === 'true';
                        
                        // Start a brief grace period to avoid flashing error overlays
                        this.isJoining = true;
                        if (this.joinGraceTimeoutId) clearTimeout(this.joinGraceTimeoutId);
                        this.joinGraceTimeoutId = setTimeout(() => {
                            this.isJoining = false;
                            this.joinGraceTimeoutId = null;
                        }, 4000);
                        
                        this.webrtcClient.joinRoom(this.roomId, { 
                            name: this.localUserName,
                            isCreator: this.isRoomCreator 
                        });

                        // Auto-copy a clean room link for the creator
                        if (this.isRoomCreator) {
                            this.copyRoomLink();
                        }
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
                        // Keep message minimal during preflight; actual init will surface detailed errors
                        console.warn('Missing required APIs:', missingAPIs.join(', '));
                        return false;
                    }
                    
                    // Consider secure contexts and common local IPs as acceptable for dev
                    const hostname = location.hostname;
                    const isLocalIp = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname);
                    const isDevHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || isLocalIp;
                    const isSecure = window.isSecureContext || location.protocol === 'https:' || isDevHost;
                    
                    if (!isSecure) {
                        // Show a non-blocking warning instead of an error to avoid flashing the error overlay
                        this.showConnectionStatus(
                            'Tip: Use HTTPS or localhost for best camera/mic support.',
                            'warning'
                        );
                        // Proceed anyway; getUserMedia may still work depending on browser
                        return true;
                    }
                    
                    return true;
                },
        
                // Initialize WebRTC client
                initWebRTC() {
                    // Check browser support first
                    if (!this.checkBrowserSupport()) {
                        return Promise.reject(new Error("Browser not supported"));
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
                    
                                this.webrtcClient.on('videoToggled', (isEnabled) => {
                                    this.videoEnabled = isEnabled;
                                });
                    
                                this.webrtcClient.on('audioToggled', (isEnabled) => {
                                    this.micEnabled = isEnabled;
                                });                    
                    // Initialize WebRTC and return the promise
                    return this.webrtcClient.init().then(() => {
                        console.log('WebRTC client initialized');
                        this.showConnectionStatus('Connected to server', 'success');
                    }).catch(error => {
                        console.error('Failed to initialize WebRTC:', error);
                        if (error.name === 'NotAllowedError') {
                            this.showConnectionStatus('Camera and microphone permissions are required.', 'error');
                        } else {
                            this.showConnectionStatus('Failed to connect: ' + error.message, 'error');
                        }
                        // Re-throw the error so the calling function knows it failed
                        throw error;
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
                    
                    // Sync UI if user exits native fullscreen (ESC or gesture)
                    document.addEventListener('fullscreenchange', () => {
                        if (!document.fullscreenElement) {
                            this.fullscreenPeerId = null;
                        }
                    });
                    document.addEventListener('webkitfullscreenchange', () => {
                        if (!(document.fullscreenElement || document.webkitFullscreenElement)) {
                            this.fullscreenPeerId = null;
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
        
                // Device enumeration
                async getAvailableDevices() {
                    try {
                        const devices = await navigator.mediaDevices.enumerateDevices();
                        this.availableCameras = devices.filter(device => device.kind === 'videoinput');
                        this.availableMics = devices.filter(device => device.kind === 'audioinput');
                        
                        console.log('Available cameras:', this.availableCameras.map(cam => ({ id: cam.deviceId, label: cam.label })));
                        console.log('Available microphones:', this.availableMics.map(mic => ({ id: mic.deviceId, label: mic.label })));
        
                        if (this.availableCameras.length > 0 && this.webrtcClient && !this.webrtcClient.currentCameraDeviceId) {
                            this.webrtcClient.currentCameraDeviceId = this.availableCameras[0].deviceId;
                            this.currentCameraIndex = 0;
                        }
                        if (this.availableMics.length > 0 && this.webrtcClient && !this.webrtcClient.currentMicDeviceId) {
                            this.webrtcClient.currentMicDeviceId = this.availableMics[0].deviceId;
                            this.currentMicIndex = 0;
                        }
                    } catch (error) {
                        console.error('Error getting available devices:', error);
                        this.showConnectionStatus('Could not list media devices.', 'error');
                    }
                },

                async handleDeviceChange() {
                    try {
                        console.log('Media devices changed — re-enumerating...');
                        await this.getAvailableDevices();
                        
                        // Keep current mic selection if still present
                        const currentMicId = this.webrtcClient?.currentMicDeviceId;
                        if (currentMicId) {
                            const idx = this.availableMics.findIndex(d => d.deviceId === currentMicId);
                            if (idx !== -1) {
                                this.currentMicIndex = idx;
                            } else if (this.availableMics.length > 0) {
                                // Active mic disconnected, switch to first available
                                this.currentMicIndex = 0;
                                const firstMic = this.availableMics[0];
                                if (firstMic && this.webrtcClient) {
                                    await this.webrtcClient.switchMicrophone(firstMic.deviceId);
                                    this.showConnectionStatus(`Microphone changed to ${firstMic.label || 'default'}`, 'success');
                                }
                            }
                        }
                        
                        // Update camera index if needed (do not auto-switch camera to avoid surprises)
                        const currentCamId = this.webrtcClient?.currentCameraDeviceId;
                        if (currentCamId) {
                            const camIdx = this.availableCameras.findIndex(d => d.deviceId === currentCamId);
                            if (camIdx !== -1) {
                                this.currentCameraIndex = camIdx;
                            } else if (this.availableCameras.length > 0) {
                                this.currentCameraIndex = 0;
                            }
                        }
                        
                        // Update dropdown visibility if counts changed
                        if (this.availableMics.length <= 1) this.showMicDropdown = false;
                        if (this.availableCameras.length <= 1) this.showCameraDropdown = false;
                    } catch (error) {
                        console.error('Error handling device change:', error);
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
            
            // End join grace period once we have a remote stream
            if (this.isJoining) {
                this.isJoining = false;
                if (this.joinGraceTimeoutId) {
                    clearTimeout(this.joinGraceTimeoutId);
                    this.joinGraceTimeoutId = null;
                }
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

        updateVideoGridLayout() {
            this.$nextTick(() => {
                const videoGrid = this.$refs.videoGrid;
                if (videoGrid) {
                    const totalParticipants = this.remotePeers.length + 1;
                    let cols = 1;
                    if (totalParticipants === 2) {
                        cols = 2;
                    } else if (totalParticipants >= 3 && totalParticipants <= 4) {
                        cols = 2;
                    } else if (totalParticipants >= 5 && totalParticipants <= 9) {
                        cols = 3;
                    }
                    videoGrid.style.setProperty('--cols', cols);
                }
            });
        },
        
        // Utility functions
        async copyRoomLink() {
            const roomLink = `${window.location.origin}/room.html?room=${this.roomId}`;
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(roomLink);
                    this.showConnectionStatus('Room link copied to clipboard!', 'success');
                } else {
                    // Fallback: try execCommand copy (may require user gesture)
                    const textarea = document.createElement('textarea');
                    textarea.value = roomLink;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.focus();
                    textarea.select();
                    const ok = document.execCommand && document.execCommand('copy');
                    document.body.removeChild(textarea);

                    if (ok) {
                        this.showConnectionStatus('Room link copied to clipboard!', 'success');
                    } else {
                        // Do not show an error overlay here; just a gentle prompt
                        this.showConnectionStatus('Couldn’t auto-copy. Tap to copy from the address bar.', 'warning');
                    }
                }
            } catch (error) {
                console.error('Failed to copy room link:', error);
                // Avoid flashing error overlay for non-critical copy failures
                this.showConnectionStatus('Couldn’t auto-copy. Tap to copy from the address bar.', 'warning');
            }
        },
        
        hangUp() {
            if (this.webrtcClient) {
                this.webrtcClient.leaveRoom();
            }
            window.location.href = 'index.html';
        },
        
        showConnectionStatus(message, type) {
            // During initial load and early join handshake, downgrade errors to warnings
            if ((this.isInitializing || this.isJoining) && type === 'error') {
                type = 'warning';
            }
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

        setAppHeight() {
            const appHeight = window.innerHeight + 'px';
            document.documentElement.style.setProperty('--app-height', appHeight);
        },

        // Fullscreen methods
        enterFullscreen(peerId) {
            // Allow fullscreen on both mobile and desktop
            this.fullscreenPeerId = peerId;
            
            this.$nextTick(() => {
                let container = null;
                if (peerId === 'local') {
                    container = this.$refs.localContainer;
                } else {
                    const containers = this.$refs[`remoteContainer-${peerId}`];
                    container = containers && containers[0];
                }
                
                const videoEl = peerId === 'local'
                    ? this.$refs.localVideo
                    : (this.$refs[`remoteVideo-${peerId}`] && this.$refs[`remoteVideo-${peerId}`][0]);
                
                // Try Fullscreen API first
                const requestFS = (container && (container.requestFullscreen || container.webkitRequestFullscreen))
                    || (videoEl && (videoEl.requestFullscreen || videoEl.webkitRequestFullscreen));
                if (requestFS) {
                    try {
                        requestFS.call(container || videoEl);
                        return;
                    } catch (e) {
                        console.warn('Fullscreen API failed, using CSS fallback.', e);
                    }
                }
                
                // CSS fallback: classes already applied via fullscreenPeerId
                this.updateVideoGridLayout();
            });
        },

        exitFullscreen() {
            this.fullscreenPeerId = null;
            try {
                const exitFS = document.exitFullscreen || document.webkitExitFullscreen;
                if (exitFS && (document.fullscreenElement || document.webkitFullscreenElement)) {
                    exitFS.call(document);
                }
            } catch (e) {
                console.warn('Exit fullscreen failed:', e);
            }
            this.updateVideoGridLayout();
        },

        // Remote control methods for room creator
        toggleRemoteControls() {
            this.showRemoteControls = !this.showRemoteControls;
        },

        controlRemoteVideo(peerId, enable) {
            if (this.webrtcClient && this.isRoomCreator) {
                this.webrtcClient.sendRemoteControl(peerId, 'video', enable);
            }
        },

        controlRemoteAudio(peerId, enable) {
            if (this.webrtcClient && this.isRoomCreator) {
                this.webrtcClient.sendRemoteControl(peerId, 'audio', enable);
            }
        },
    },
    
    beforeUnmount() {
        if (this.webrtcClient) {
            this.webrtcClient.leaveRoom();
        }
        if (this.joinGraceTimeoutId) {
            clearTimeout(this.joinGraceTimeoutId);
            this.joinGraceTimeoutId = null;
        }
        window.removeEventListener('resize', this.setAppHeight);
        if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
            navigator.mediaDevices.removeEventListener('devicechange', this.handleDeviceChange);
        }
    }
}).mount('#app');