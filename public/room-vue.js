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
            
            // Peers
            remotePeers: [],
            
            // Connection
            connectionStatus: null,
            
            // WebRTC client
            webrtcClient: null
        };
    },
        async mounted() {
            // Get room ID and username from URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            this.roomId = urlParams.get('room') || 'default-room';
            this.localUserName = localStorage.getItem('username') || 'Anonymous';
            
            // Initialize WebRTC
            this.initWebRTC();
            
            // Get available cameras
            await this.getAvailableCameras();
            
            // Join room after initialization
            setTimeout(() => {
                this.joinRoom();
            }, 1000);
            
            // Set up event listeners
            this.setupEventListeners();
        },
    methods: {
        // Join room
        joinRoom() {
            if (this.webrtcClient) {
                this.webrtcClient.joinRoom(this.roomId, { name: this.localUserName });
                this.connectionStatus = {
                    type: 'info',
                    message: 'Joining room...'
                };
            }
        },

        // Initialize WebRTC client
        initWebRTC() {
            this.webrtcClient = new WebRTCClient();
            
            // Set up event listeners for Vue.js integration
            this.webrtcClient.on('localStream', (stream) => {
                this.$nextTick(() => {
                    const localVideo = this.$refs.localVideo;
                    if (localVideo) {
                        localVideo.srcObject = stream;
                    }
                });
            });

            this.webrtcClient.on('remoteStream', ({ userId, stream }) => {
                this.remotePeers[userId] = {
                    stream: stream,
                    label: `User ${userId.substring(0, 8)}`
                };
            });

            this.webrtcClient.on('peerRemoved', (userId) => {
                delete this.remotePeers[userId];
            });

            this.webrtcClient.on('error', (message) => {
                this.connectionStatus = {
                    type: 'error',
                    message: message
                };
            });

            // Initialize WebRTC
            this.webrtcClient.init().then(() => {
                this.connectionStatus = {
                    type: 'success',
                    message: 'Connected to server'
                };
            }).catch((error) => {
                this.connectionStatus = {
                    type: 'error',
                    message: 'Failed to initialize: ' + error.message
                };
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
                const devices = await navigator.mediaDevices.enumerateDevices();
                this.availableCameras = devices.filter(device => device.kind === 'videoinput');
                console.log('Available cameras:', this.availableCameras.length);
            } catch (error) {
                console.error('Error getting available cameras:', error);
                this.availableCameras = [];
            }
        },

        async switchCamera() {
            if (this.availableCameras.length <= 1) return;
            
            try {
                // Cycle to next camera
                this.currentCameraIndex = (this.currentCameraIndex + 1) % this.availableCameras.length;
                const selectedCamera = this.availableCameras[this.currentCameraIndex];
                
                console.log('Switching to camera:', selectedCamera.label || `Camera ${this.currentCameraIndex + 1}`);
                
                // Switch camera in WebRTC client
                if (this.webrtcClient) {
                    await this.webrtcClient.switchCamera(selectedCamera.deviceId);
                }
            } catch (error) {
                console.error('Error switching camera:', error);
                this.showConnectionStatus('Failed to switch camera', 'error');
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
                    username
                });
            }
            
            this.$nextTick(() => {
                const videoElement = this.$refs[`remoteVideo-${peerId}`];
                if (videoElement && videoElement[0]) {
                    videoElement[0].srcObject = stream;
                }
            });
        },
        
        removeRemotePeer(peerId) {
            const index = this.remotePeers.findIndex(p => p.id === peerId);
            if (index !== -1) {
                this.remotePeers.splice(index, 1);
            }
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
        }
    },
    
    beforeUnmount() {
        if (this.webrtcClient) {
            this.webrtcClient.leaveRoom();
        }
    }
}).mount('#app');