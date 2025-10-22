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
            // New: network confirmation and error debounce
            connectionConfirmed: false,
            errorDebounceId: null,
            errorDebounceDelay: 500,
            pendingErrorMessage: null,
            
            // WebRTC client
            webrtcClient: null,

            // Focused view state
            focusedPeerId: null,
            lastTapTs: 0,
            doubleTapThreshold: 300,
            fullscreenPeerId: null,
            isRoomCreator: false,
            showRemoteControls: false,
            overlayPosition: 'overlay-bottom-center',
        };
    },
                async mounted() {
                    this.setAppHeight();
                    window.addEventListener('resize', this.setAppHeight);

                    // New: read room ID from path; fallback to legacy ?room=
                    const urlParams = new URLSearchParams(window.location.search);
                    const pathMatch = window.location.pathname.match(/\/room\/([^/?#]+)/);
                    this.roomId = (pathMatch && decodeURIComponent(pathMatch[1])) || urlParams.get('room') || 'default-room';

                    // Username no longer passed via URL; fallback to local storage or Anonymous
                    const nameFromStorage = localStorage.getItem('quic-rtc-username') || localStorage.getItem('username');
                    this.localUserName = nameFromStorage || 'Anonymous';

                    // Start join grace immediately to cover early handshake transitions
                    this.isJoining = true;
                    if (this.joinGraceTimeoutId) clearTimeout(this.joinGraceTimeoutId);
                    this.joinGraceTimeoutId = setTimeout(() => {
                        this.isJoining = false;
                        this.joinGraceTimeoutId = null;
                    }, 4000);

                    try {
                        await this.initWebRTC();
                        await this.getAvailableDevices();
                        if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
                            navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange);
                        }
                        this.joinRoom();
                        this.setupEventListeners();
                    } catch (error) {
                        console.error("Initialization failed:", error);
                    } finally {
                        // Keep loading state until network status is confirmed
                        // this.isInitializing will be set to false in onNetworkStatus when online
                    }
                },
            methods: {
                // Join room
                joinRoom() {
                    if (this.webrtcClient) {
                        // Remove creator flag driven by URL; server tracks the first joiner
                        this.isRoomCreator = false;
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
                        
                        this.addRemotePeer(data.userId, data.stream, data.username || 'Participant');
                    });
                    
                    this.webrtcClient.on('localStream', (stream) => {
                        
                        this.$nextTick(() => {
                            const localVideo = this.$refs.localVideo;
                            if (localVideo) {
                                localVideo.srcObject = stream;
                            }
                        });
                    });
                    
                    this.webrtcClient.on('localStreamUpdated', (stream) => {
                        
                        this.$nextTick(() => {
                            const localVideo = this.$refs.localVideo;
                            if (localVideo) {
                                localVideo.srcObject = stream;
                            }
                        });
                    });
                    
                    this.webrtcClient.on('peerRemoved', (userId) => {
                        
                        this.removeRemotePeer(userId);
                    });
                    
                    this.webrtcClient.on('participantJoined', (data) => {
                        
                        this.participantCount = data.participantCount || this.participantCount + 1;
                    });
                    
                                this.webrtcClient.on('participantLeft', (data) => {
                                    
                                    this.participantCount = Math.max(1, this.participantCount - 1);
                                });
                    
                                this.webrtcClient.on('videoToggled', (isEnabled) => {
                                    this.videoEnabled = isEnabled;
                                });
                    
                                this.webrtcClient.on('audioToggled', (isEnabled) => {
                                    this.micEnabled = isEnabled;
                                });

                                // Network status and error events
                                this.webrtcClient.on('network', ({ online }) => {
                                    this.onNetworkStatus(online);
                                });
                                this.webrtcClient.on('error', (message) => {
                                    this.onClientError(message);
                                });                    
                    // Initialize WebRTC and return the promise
                    return this.webrtcClient.init().then(() => {
                        
                        // Set transport type label based on runtime capability/use
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
            
            
            if (this.availableCameras.length <= 1) {
                this.showConnectionStatus('No additional cameras available', 'error');
                return;
            }
            
            try {
                // Cycle to next camera
                this.currentCameraIndex = (this.currentCameraIndex + 1) % this.availableCameras.length;
                const selectedCamera = this.availableCameras[this.currentCameraIndex];
                
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
        
        hangUp() {
            if (this.webrtcClient) {
                this.webrtcClient.leaveRoom();
            }
            window.location.href = '/';
        },
        
        showConnectionStatus(message, type) {
            // During initial load and early join handshake, downgrade errors to warnings
            if ((this.isInitializing || this.isJoining) && type === 'error') {
                type = 'warning';
            }

            // For errors, debounce for minimum 500ms to avoid transient flashes
            if (type === 'error') {
                if (this.errorDebounceId) {
                    clearTimeout(this.errorDebounceId);
                    this.errorDebounceId = null;
                }
                this.pendingErrorMessage = message;
                this.errorDebounceId = setTimeout(() => {
                    // Only show if not initializing or joining anymore
                    if (!this.isInitializing && !this.isJoining) {
                        this.connectionStatus = { message: this.pendingErrorMessage, type: 'error' };
                    }
                    this.pendingErrorMessage = null;
                    this.errorDebounceId = null;
                }, this.errorDebounceDelay);
                return;
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
        
        // Handle network status to keep loading state until confirmed
        onNetworkStatus(online) {
            if (online) {
                this.connectionConfirmed = true;
                // Drop initializing state now that network is confirmed
                this.isInitializing = false;
                // Cancel any pending error display
                if (this.errorDebounceId) {
                    clearTimeout(this.errorDebounceId);
                    this.errorDebounceId = null;
                    this.pendingErrorMessage = null;
                }
                // If an error is currently shown, clear it
                if (this.connectionStatus && this.connectionStatus.type === 'error') {
                    this.connectionStatus = null;
                }
            } else {
                // Schedule a debounced error if we lose the network
                this.showConnectionStatus('Network disconnected. Attempting to reconnect…', 'error');
            }
        },

        // Route client-emitted errors through the debounced status handler
        onClientError(message) {
            this.showConnectionStatus(message || 'Connection error', 'error');
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
                poor: 'warning'
            };
            
            const message = qualityMessages[quality] || 'Connection status updated';
            const type = qualityTypes[quality] || 'success';
            
            this.showConnectionStatus(message, type);
        },

        setAppHeight() {
            const appHeight = () => {
                const doc = document.documentElement;
                doc.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px');
            };
            appHeight();
        },
        
        enterFocused(peerId) {
            this.focusedPeerId = peerId;
        },
        
        onTileTap(peerId) {
            const now = Date.now();
            if (this.lastTapTs && now - this.lastTapTs < this.doubleTapThreshold) {
                this.enterFocused(peerId);
                this.lastTapTs = 0;
            } else {
                this.lastTapTs = now;
            }
        },
        
        exitFocused() {
            this.focusedPeerId = null;
        },
        
        toggleRemoteControls() {
            this.showRemoteControls = !this.showRemoteControls;
        },
        
        controlRemoteVideo(peerId, enable) {
            if (this.webrtcClient) {
                this.webrtcClient.sendRemoteControl(peerId, 'video', enable);
            }
        },
        
        controlRemoteAudio(peerId, enable) {
            if (this.webrtcClient) {
                this.webrtcClient.sendRemoteControl(peerId, 'audio', enable);
            }
        },
    },
    
    beforeUnmount() {
        window.removeEventListener('resize', this.setAppHeight);
        if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
            navigator.mediaDevices.removeEventListener('devicechange', this.handleDeviceChange);
        }
        if (this.webrtcClient) {
            this.webrtcClient.leaveRoom();
        }
    }
}).mount('#app');