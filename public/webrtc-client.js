// WebRTC Client with WebTransport (QUIC) Data Channels and Vue.js Integration
class WebRTCClient {
    constructor() {
        this.socket = null;
        this.webTransportClient = null;
        this.useWebTransport = false;
        this.localStream = null;
        this.peers = new Map();
        this.roomId = null;
        this.username = null;
        this.isAudioEnabled = true;
        this.isVideoEnabled = true;
        this.currentCameraDeviceId = null;
        this.dataChannels = new Map();
        
        // Event emitter for Vue.js integration
        this.eventHandlers = new Map();
        
        // Encryption setup
        this.cryptoClient = new CryptoClient();
        this.roomKey = null;
        this.keyPair = null;
        this.peerKeys = new Map(); // Store shared keys with each peer
        
        // STUN/TURN configuration
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };
    }

    // Event emitter methods for Vue.js integration
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    emit(event, ...args) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).forEach(handler => {
                try {
                    handler(...args);
                } catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            });
        }
    }

    async init() {
        try {
            // Check if required APIs are available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('MediaDevices API not available. Please use a modern browser.');
            }
            
            if (!window.RTCPeerConnection) {
                throw new Error('WebRTC not supported. Please use a modern browser.');
            }
            
            // Check WebTransport support and initialize if available
            if (typeof WebTransport !== 'undefined') {
                this.webTransportClient = new WebTransportClient();
                this.useWebTransport = true;
                console.log('WebTransport (QUIC) support detected');
            } else {
                console.log('WebTransport not supported, using WebRTC Data Channels');
            }
            
            // Initialize Socket.IO connection
            this.socket = io();
            this.setupSocketHandlers();
            
            // Get user media
            await this.getUserMedia();
            
        } catch (error) {
            console.error('Failed to initialize WebRTC client:', error);
            this.emit('error', error.message || 'Failed to access camera/microphone. Please check permissions.');
            throw error;
        }
    }

    setupSocketHandlers() {
        // User joined room
        this.socket.on('user-joined', (data) => {
            console.log('User joined:', data);
            this.createPeerConnection(data.userId, true);
        });

        // Existing participants
        this.socket.on('existing-participants', (participants) => {
            console.log('Existing participants:', participants);
            participants.forEach(participant => {
                this.createPeerConnection(participant.id, false);
            });
        });

        // WebRTC signaling
        this.socket.on('offer', async (data) => {
            await this.handleOffer(data);
        });

        this.socket.on('answer', async (data) => {
            await this.handleAnswer(data);
        });

        this.socket.on('ice-candidate', async (data) => {
            await this.handleIceCandidate(data);
        });

        // User left
        this.socket.on('user-left', (data) => {
            this.removePeer(data.userId);
        });

        // Media state changes
        this.socket.on('media-state-change', (data) => {
            this.handleRemoteMediaStateChange(data);
        });

        // Handle room encryption keys
        this.socket.on('room-keys', async (data) => {
            try {
                const { roomKeys, yourKeyPair } = data;
                
                // Import room encryption key
                this.roomKey = await this.cryptoClient.importKey(roomKeys.encryptionKey);
                
                // Store our key pair (we'll use this for peer-to-peer key exchange)
                this.keyPair = {
                    publicKey: await this.cryptoClient.importPublicKey(JSON.parse(yourKeyPair.publicKey)),
                    privateKey: yourKeyPair.privateKey // Keep as string for now
                };
                
                console.log('🔐 Room encryption keys received and imported');
            } catch (error) {
                console.error('Failed to setup encryption keys:', error);
            }
        });

        // Connection events
        this.socket.on('connect', () => {
            console.log('Connected to signaling server');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from signaling server');
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showError('Connection error: ' + error.message);
        });
    }

    async getUserMedia() {
        try {
            // Check if we're in a secure context
            if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
                throw new Error('WebRTC requires HTTPS or localhost. Please access via HTTPS or localhost.');
            }
            
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: this.currentCameraDeviceId ? 
                    { deviceId: { exact: this.currentCameraDeviceId } } : 
                    {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        frameRate: { ideal: 30 }
                    }
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Update local video element
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.localStream;
            }
            
            // Emit local stream event for Vue.js
            this.emit('localStream', this.localStream);

            console.log('Got user media successfully');
            
            return this.localStream;
        } catch (error) {
            console.error('Error accessing media devices:', error);
            this.emit('error', 'Failed to access camera/microphone: ' + error.message);
            throw error;
        }
    }

    createPeerConnection(userId, isInitiator) {
        try {
            const peerConnection = new RTCPeerConnection(this.rtcConfig);
            
            // Create data channel for QUIC-like low-latency communication
            let dataChannel = null;
            if (isInitiator) {
                dataChannel = peerConnection.createDataChannel('messages', {
                    ordered: false, // For low latency
                    maxRetransmits: 0 // No retransmissions for real-time data
                });
                this.setupDataChannel(dataChannel, userId);
            }

            // Handle data channel from remote peer
            peerConnection.ondatachannel = (event) => {
                const channel = event.channel;
                this.setupDataChannel(channel, userId);
            };

            // Add local stream tracks
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, this.localStream);
                });
            }

            // Handle remote stream
            peerConnection.ontrack = (event) => {
                console.log('Received remote track:', event);
                this.handleRemoteStream(userId, event.streams[0]);
            };

            // Handle ICE candidates
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('ice-candidate', {
                        targetUserId: userId,
                        candidate: event.candidate
                    });
                }
            };

            // Handle connection state changes
            peerConnection.onconnectionstatechange = () => {
                console.log(`Connection state with ${userId}:`, peerConnection.connectionState);
                
                if (peerConnection.connectionState === 'failed') {
                    console.log('Connection failed, attempting to restart ICE');
                    peerConnection.restartIce();
                }
            };

            // Store peer connection
            this.peers.set(userId, {
                peerConnection,
                dataChannel: dataChannel || null
            });

            // If initiator, create and send offer
            if (isInitiator) {
                this.createOffer(userId);
            }

            console.log(`Created peer connection for user ${userId}`);
            
        } catch (error) {
            console.error('Error creating peer connection:', error);
        }
    }

    setupDataChannel(dataChannel, userId) {
        dataChannel.onopen = () => {
            console.log(`Data channel opened with ${userId}`);
            
            // Update peer data channel reference
            const peer = this.peers.get(userId);
            if (peer) {
                peer.dataChannel = dataChannel;
            }
        };

        dataChannel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleDataChannelMessage(userId, data);
            } catch (error) {
                console.error('Error parsing data channel message:', error);
            }
        };

        dataChannel.onerror = (error) => {
            console.error(`Data channel error with ${userId}:`, error);
        };

        dataChannel.onclose = () => {
            console.log(`Data channel closed with ${userId}`);
        };
    }

    async createOffer(userId) {
        try {
            const peer = this.peers.get(userId);
            if (!peer) return;

            const offer = await peer.peerConnection.createOffer();
            await peer.peerConnection.setLocalDescription(offer);

            this.socket.emit('offer', {
                targetUserId: userId,
                offer: offer
            });

        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    async handleOffer(data) {
        try {
            const { fromUserId, offer } = data;
            const peer = this.peers.get(fromUserId);
            
            if (!peer) {
                console.error('No peer connection found for user:', fromUserId);
                return;
            }

            await peer.peerConnection.setRemoteDescription(offer);
            
            const answer = await peer.peerConnection.createAnswer();
            await peer.peerConnection.setLocalDescription(answer);

            this.socket.emit('answer', {
                targetUserId: fromUserId,
                answer: answer
            });

        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    async handleAnswer(data) {
        try {
            const { fromUserId, answer } = data;
            const peer = this.peers.get(fromUserId);
            
            if (!peer) {
                console.error('No peer connection found for user:', fromUserId);
                return;
            }

            await peer.peerConnection.setRemoteDescription(answer);

        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }

    async handleIceCandidate(data) {
        try {
            const { fromUserId, candidate } = data;
            const peer = this.peers.get(fromUserId);
            
            if (!peer) {
                console.error('No peer connection found for user:', fromUserId);
                return;
            }

            await peer.peerConnection.addIceCandidate(candidate);

        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    }

    handleRemoteStream(userId, stream) {
        // Emit remote stream event for Vue.js
        this.emit('remoteStream', { userId, stream });
        console.log(`Added remote video for user ${userId}`);
    }

    removePeer(userId) {
        const peer = this.peers.get(userId);
        if (peer) {
            // Close peer connection
            peer.peerConnection.close();
            
            // Close data channel
            if (peer.dataChannel) {
                peer.dataChannel.close();
            }
            
            // Remove from peers map
            this.peers.delete(userId);
        }

        // Emit peer removal event for Vue.js
        this.emit('peerRemoved', userId);

        console.log(`Removed peer ${userId}`);
    }

    // Media control methods
    toggleAudio() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.isAudioEnabled = audioTrack.enabled;
                
                // Notify other peers
                this.socket.emit('media-state-change', {
                    audio: this.isAudioEnabled
                });

                return this.isAudioEnabled;
            }
        }
        return false;
    }

    // Camera switching
    async switchCamera(deviceId) {
        try {
            console.log('WebRTC switchCamera called with deviceId:', deviceId);
            
            // Store the new camera device ID
            this.currentCameraDeviceId = deviceId;
            
            // Stop current video track
            if (this.localStream) {
                const videoTrack = this.localStream.getVideoTracks()[0];
                if (videoTrack) {
                    videoTrack.stop();
                    console.log('Stopped current video track');
                }
            }
            
            // Get new stream with selected camera
            const constraints = {
                audio: this.isAudioEnabled,
                video: { deviceId: { exact: deviceId } }
            };
            
            console.log('Getting new stream with constraints:', constraints);
            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            const newVideoTrack = newStream.getVideoTracks()[0];
            const newAudioTrack = newStream.getAudioTracks()[0];
            
            // Update local stream
            if (this.localStream) {
                // Create new stream with existing audio state and new video
                const oldAudioTrack = this.localStream.getAudioTracks()[0];
                this.localStream = new MediaStream();
                
                // Add audio track (preserve existing audio or use new one)
                if (oldAudioTrack && oldAudioTrack.readyState === 'live') {
                    this.localStream.addTrack(oldAudioTrack);
                } else if (newAudioTrack) {
                    this.localStream.addTrack(newAudioTrack);
                }
                
                // Add new video track
                this.localStream.addTrack(newVideoTrack);
            } else {
                this.localStream = newStream;
            }
            
            console.log('Updated local stream with new video track');
            
            // Emit local stream update for Vue.js to handle video element update
            this.emit('localStreamUpdated', this.localStream);
            
            // Replace video track for all peer connections
            const replacePromises = [];
            this.peers.forEach((peer) => {
                const sender = peer.peerConnection.getSenders().find(s => 
                    s.track && s.track.kind === 'video'
                );
                
                if (sender) {
                    replacePromises.push(sender.replaceTrack(newVideoTrack));
                }
            });
            
            await Promise.all(replacePromises);
            console.log('Camera switched successfully for all peer connections');
            return true;
        } catch (error) {
            console.error('Error switching camera:', error);
            throw error;
        }
    }

    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                this.isVideoEnabled = videoTrack.enabled;
                
                // Notify other peers
                this.socket.emit('media-state-change', {
                    video: this.isVideoEnabled
                });

                return this.isVideoEnabled;
            }
        }
        return false;
    }





    handleDataChannelMessage(userId, data) {
        console.log('Unknown data channel message type:', data.type);
    }

    handleRemoteMediaStateChange(data) {
        const videoContainer = document.getElementById(`container-${data.userId}`);
        if (!videoContainer) return;

        // Update UI to show muted state
        if (data.audio !== undefined) {
            // Add/remove audio muted indicator
            let audioIndicator = videoContainer.querySelector('.audio-muted');
            if (!data.audio && !audioIndicator) {
                audioIndicator = document.createElement('div');
                audioIndicator.className = 'audio-muted';
                audioIndicator.innerHTML = '🔇';
                audioIndicator.style.position = 'absolute';
                audioIndicator.style.top = '10px';
                audioIndicator.style.right = '10px';
                audioIndicator.style.background = 'rgba(0,0,0,0.7)';
                audioIndicator.style.padding = '4px';
                audioIndicator.style.borderRadius = '4px';
                videoContainer.appendChild(audioIndicator);
            } else if (data.audio && audioIndicator) {
                audioIndicator.remove();
            }
        }
    }



    // Join room
    joinRoom(roomId, userData) {
        this.roomId = roomId;
        this.username = userData.name;
        
        this.socket.emit('join-room', {
            roomId: roomId,
            userData: userData
        });
    }

    // Leave room
    leaveRoom() {
        // Stop all streams
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }

        // Close all peer connections
        this.peers.forEach((peer) => {
            peer.peerConnection.close();
            if (peer.dataChannel) {
                peer.dataChannel.close();
            }
        });
        
        this.peers.clear();

        // Disconnect socket
        if (this.socket) {
            this.socket.disconnect();
        }
    }

    // Utility methods
    showError(message) {
        console.error(message);
        this.emit('error', message);
    }
}

// Export for use in room.js
window.WebRTCClient = WebRTCClient;