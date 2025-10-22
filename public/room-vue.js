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

            // FaceTime-like layout state
            facetimeActive: false,
            primaryPeerId: null, // who is full-screen (prefer first remote)
            secondaryPeerId: 'local', // PiP defaults to local
            pipCorner: 'top-right', // default PiP corner
            pipCustomPosition: { left: null, top: null }, // for drag reposition
            pipDrag: { active: false, peerId: null, offsetX: 0, offsetY: 0, width: 0, height: 0 },

            // UI overlays and aspect tracking
            aspectClasses: { local: '' },
            showErrorOverlay: false,
            overlayPosition: 'overlay-bottom-right',
            chatVisible: false,
            unreadMessages: 0,
            focusedPeerId: null,
            lastTapTs: 0,
            doubleTapThreshold: 300,
            showRemoteControls: false,
            isRoomCreator: false,
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
                        if (navigator.mediaDevices) {
                            await this.getAvailableDevices();
                            if (navigator.mediaDevices.addEventListener) {
                                navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange);
                            }
                        }
                        this.joinRoom();
                    } catch (error) {
                        console.error("Initialization failed:", error);
                        // Keep UI usable in preview environments without MediaDevices
                        this.showConnectionStatus('Preview mode: limited functionality without media devices.', 'warning');
                    } finally {
                        // Keep loading state until network status is confirmed
                        // this.isInitializing will be set to false in onNetworkStatus when online
                        // Always bind UI listeners
                        this.setupEventListeners();
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
                        // Do not block initialization in dev; show a soft warning instead
                        this.showConnectionStatus('Some features may be limited (missing APIs).', 'warning');
                        return true;
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
                                // Detect aspect once metadata is available
                                localVideo.addEventListener('loadedmetadata', () => {
                                    this.assignAspectClass('local', localVideo);
                                }, { once: true });
                            }
                        });
                    });
                    
                    this.webrtcClient.on('localStreamUpdated', (stream) => {
                        
                        this.$nextTick(() => {
                            const localVideo = this.$refs.localVideo;
                            if (localVideo) {
                                localVideo.srcObject = stream;
                                // Re-evaluate aspect on updates
                                const handler = () => this.assignAspectClass('local', localVideo);
                                if (localVideo.readyState >= 1) {
                                    handler();
                                } else {
                                    localVideo.addEventListener('loadedmetadata', handler, { once: true });
                                }
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
                    // Handle Escape key to exit focused view
                    window.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape' && this.focusedPeerId) {
                            this.exitFocused();
                        }
                    });
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

                    // Global pointer handlers for PiP drag
                    window.addEventListener('pointermove', this.onPipPointerMove);
                    window.addEventListener('pointerup', this.onPipPointerUp);
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

            // Set FaceTime primary to first remote if active and unset
            if (this.facetimeActive && !this.primaryPeerId) {
                this.primaryPeerId = peerId;
            }
            
            this.$nextTick(() => {
                const videoElement = this.$refs[`remoteVideo-${peerId}`];
                if (videoElement && videoElement[0]) {
                    const el = videoElement[0];
                    el.srcObject = stream;
                    // Detect aspect for remote once metadata ready
                    const handler = () => this.assignAspectClass(peerId, el);
                    if (el.readyState >= 1) {
                        handler();
                    } else {
                        el.addEventListener('loadedmetadata', handler, { once: true });
                    }
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
        
        // Compute and assign aspect class for focused sizing
        assignAspectClass(id, videoEl) {
            try {
                const w = videoEl.videoWidth;
                const h = videoEl.videoHeight;
                if (!w || !h) {
                    setTimeout(() => this.assignAspectClass(id, videoEl), 100);
                    return;
                }
                const ratio = w / h;
                let cls = 'square';
                if (ratio > 1.1) cls = 'landscape';
                else if (ratio < 0.9) cls = 'portrait';
                this.aspectClasses = { ...this.aspectClasses, [id]: cls };
            } catch (e) {
                console.warn('Failed to evaluate aspect for', id, e);
            }
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
            if (now - this.lastTapTs <= this.doubleTapThreshold) {
                // Double tap toggles focus
                if (this.focusedPeerId === peerId) {
                    this.exitFocused();
                } else {
                    this.enterFocused(peerId);
                }
            }
            this.lastTapTs = now;
        },
        
        onTileDoubleClick(peerId) {
            if (this.focusedPeerId === peerId) {
                this.exitFocused();
            } else {
                this.enterFocused(peerId);
            }
        },
        
        exitFocused() {
            this.focusedPeerId = null;
        },

        // FaceTime layout toggle
        toggleFaceTime() {
            this.facetimeActive = !this.facetimeActive;
            if (this.facetimeActive) {
                // Disable focused mode when FaceTime is active
                this.focusedPeerId = null;
                const firstRemote = this.remotePeers.length > 0 ? this.remotePeers[0].id : null;
                this.primaryPeerId = firstRemote;
                this.secondaryPeerId = 'local';
                this.pipCorner = 'top-right';
                this.pipCustomPosition = { left: null, top: null };
                this.pipDrag.active = false;
            } else {
                this.primaryPeerId = null;
                this.secondaryPeerId = 'local';
                this.pipCorner = 'top-right';
                this.pipCustomPosition = { left: null, top: null };
                this.pipDrag.active = false;
            }
        },

        // Swap primary and secondary feeds
        swapPrimaryAndSecondary() {
            if (!this.facetimeActive) return;
            const prevPrimary = this.primaryPeerId;
            const prevSecondary = this.secondaryPeerId;
            this.primaryPeerId = prevSecondary;
            this.secondaryPeerId = prevPrimary;
            // Reset custom PiP position when swapping
            this.pipCorner = 'top-right';
            this.pipCustomPosition = { left: null, top: null };
            this.pipDrag.active = false;
        },

        // Inline style for custom PiP position
        pipStyle(peerId) {
            if (!this.facetimeActive) return {};
            if (this.secondaryPeerId !== peerId) return {};
            if (this.pipCorner !== 'custom') return {};
            const { left, top } = this.pipCustomPosition;
            if (left == null || top == null) return {};
            return { left: `${left}px`, top: `${top}px` };
        },

        // Start PiP drag
        onPipPointerDown(peerId, event) {
            if (!this.facetimeActive || this.secondaryPeerId !== peerId) return;
            const el = event.currentTarget;
            const rect = el.getBoundingClientRect();
            // Ensure we enter custom mode
            this.pipCorner = 'custom';
            // Initialize custom position if first drag
            if (this.pipCustomPosition.left == null || this.pipCustomPosition.top == null) {
                this.pipCustomPosition.left = rect.left;
                this.pipCustomPosition.top = rect.top;
            }
            this.pipDrag.active = true;
            this.pipDrag.peerId = peerId;
            this.pipDrag.width = rect.width;
            this.pipDrag.height = rect.height;
            this.pipDrag.offsetX = event.clientX - this.pipCustomPosition.left;
            this.pipDrag.offsetY = event.clientY - this.pipCustomPosition.top;
            try { el.setPointerCapture && el.setPointerCapture(event.pointerId); } catch (_) {}
        },

        // Move PiP while dragging
        onPipPointerMove(event) {
            if (!this.pipDrag.active) return;
            const margin = 12;
            const maxLeft = Math.max(0, window.innerWidth - this.pipDrag.width - margin);
            const maxTop = Math.max(0, window.innerHeight - this.pipDrag.height - margin);
            let newLeft = event.clientX - this.pipDrag.offsetX;
            let newTop = event.clientY - this.pipDrag.offsetY;
            newLeft = Math.min(Math.max(margin, newLeft), maxLeft);
            newTop = Math.min(Math.max(margin, newTop), maxTop);
            this.pipCustomPosition.left = newLeft;
            this.pipCustomPosition.top = newTop;
        },

        // End PiP drag
        onPipPointerUp(event) {
            if (!this.pipDrag.active) return;
            this.pipDrag.active = false;
            this.pipDrag.peerId = null;
            try { event.target.releasePointerCapture && event.target.releasePointerCapture(event.pointerId); } catch (_) {}
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
        window.removeEventListener('pointermove', this.onPipPointerMove);
        window.removeEventListener('pointerup', this.onPipPointerUp);
        if (this.webrtcClient) {
            this.webrtcClient.leaveRoom();
        }
    }
}).mount('#app');