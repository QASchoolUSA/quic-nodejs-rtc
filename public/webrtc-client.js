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
        this.isVideoEnabled = false;
        this.currentCameraDeviceId = null;
        this.currentMicDeviceId = null;
        this.dataChannels = new Map();
        
        // Event emitter for Vue.js integration
        this.eventHandlers = new Map();
        
        // Encryption setup
        this.cryptoClient = new CryptoClient();
        this.roomKey = null;
        this.keyPair = null;
        this.peerKeys = new Map(); // Store shared keys with each peer
        
        // STUN/TURN configuration with performance optimizations
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10,
            // Performance optimizations
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
            iceTransportPolicy: 'all'
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
            } else {
                // Fallback to WebRTC Data Channels
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
            this.createPeerConnection(data.userId, true);
        });

        // Existing participants
        this.socket.on('existing-participants', (participants) => {
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
                // Accept either JWK object or JSON-stringified JWK for public key
                let publicKeyJwk;
                if (typeof yourKeyPair.publicKey === 'string') {
                    try {
                        publicKeyJwk = JSON.parse(yourKeyPair.publicKey);
                    } catch (e) {
                        console.warn('Public key is not valid JSON; expected JWK object or JSON string. Skipping import.');
                        publicKeyJwk = null;
                    }
                } else {
                    publicKeyJwk = yourKeyPair.publicKey;
                }

                this.keyPair = {
                    publicKey: publicKeyJwk ? await this.cryptoClient.importPublicKey(publicKeyJwk) : null,
                    privateKey: yourKeyPair.privateKey // Keep as string for now
                };
                

            } catch (error) {
                console.error('Failed to setup encryption keys:', error);
            }
        });

        // Connection events
        this.socket.on('connect', () => {});

        this.socket.on('disconnect', () => {});

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showError('Connection error: ' + error.message);
        });

        // Handle remote control commands
        this.socket.on('remote-control-video', (data) => {
            this.handleRemoteControl('video', data.enable);
        });

        this.socket.on('remote-control-audio', (data) => {
            this.handleRemoteControl('audio', data.enable);
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
                    autoGainControl: true,
                    sampleRate: 48000,
                    channelCount: 2
                },
                video: {
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 },
                    frameRate: { ideal: 30, max: 60 },
                    facingMode: 'user'
                }
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

            // Keep video off by default
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = false;
                this.isVideoEnabled = false;
            }

            // Update local video element
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.localStream;
            }

            // Emit local stream event for Vue.js
            this.emit('localStream', this.localStream);

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
            
            // Add video performance optimizations
            this.optimizeVideoPerformance(peerConnection);
            
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

            // Add local stream tracks with optimizations
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    if (track.kind === 'video') {
                        // Apply video track optimizations
                        this.optimizeVideoTrack(track);
                    }
                    peerConnection.addTrack(track, this.localStream);
                });
            }

            // Handle remote stream
            peerConnection.ontrack = (event) => {
                const stream = event.streams[0];
                
                // Optimize remote video tracks
                stream.getTracks().forEach(track => {
                    if (track.kind === 'video') {
                        this.optimizeVideoTrack(track);
                    }
                });
                
                this.handleRemoteStream(userId, stream);
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
                if (peerConnection.connectionState === 'failed') {
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


            
        } catch (error) {
            console.error('Error creating peer connection:', error);
        }
    }

    setupDataChannel(dataChannel, userId) {
        dataChannel.onopen = () => {
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

        dataChannel.onclose = () => {};
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

            // Store the new camera device ID
            this.currentCameraDeviceId = deviceId;
            // Stop current video track
            if (this.localStream) {
                const videoTrack = this.localStream.getVideoTracks()[0];
                if (videoTrack) {
                    videoTrack.stop();
                }
            }
            // Get new stream with selected camera
            const constraints = {
                audio: this.isAudioEnabled,
                video: { deviceId: { exact: deviceId } }
            };

            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            const newVideoTrack = newStream.getVideoTracks()[0];
            const newAudioTrack = newStream.getAudioTracks()[0];
            // Update local stream
            if (this.localStream) {
                const oldAudioTrack = this.localStream.getAudioTracks()[0];
                this.localStream = new MediaStream();
                if (oldAudioTrack && oldAudioTrack.readyState === 'live') {
                    this.localStream.addTrack(oldAudioTrack);
                } else if (newAudioTrack) {
                    this.localStream.addTrack(newAudioTrack);
                }
                this.localStream.addTrack(newVideoTrack);
            } else {
                this.localStream = newStream;
            }

            this.emit('localStreamUpdated', this.localStream);
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
            return true;
        } catch (error) {
            console.error('Error switching camera:', error);
            throw error;
        }
    }

    // Microphone switching
    async switchMicrophone(deviceId) {
        try {
            this.currentMicDeviceId = deviceId;
            const prevEnabled = this.isAudioEnabled;
            // Stop current audio track
            if (this.localStream) {
                const audioTrack = this.localStream.getAudioTracks()[0];
                if (audioTrack) {
                    audioTrack.stop();
                }
            }
            // Get new audio stream with selected microphone
            const audioStream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { exact: deviceId } }
            });
            const newAudioTrack = audioStream.getAudioTracks()[0];
            if (!newAudioTrack) {
                throw new Error('No audio track from selected microphone');
            }
            newAudioTrack.enabled = prevEnabled;
            // Update local stream while preserving video
            if (this.localStream) {
                const videoTrack = this.localStream.getVideoTracks()[0];
                const updatedStream = new MediaStream();
                updatedStream.addTrack(newAudioTrack);
                if (videoTrack && videoTrack.readyState === 'live') {
                    updatedStream.addTrack(videoTrack);
                }
                this.localStream = updatedStream;
            } else {
                this.localStream = new MediaStream([newAudioTrack]);
            }
            // Emit update for UI
            this.emit('localStreamUpdated', this.localStream);
            // Replace audio track in all peer connections
            const replacePromises = [];
            this.peers.forEach((peer) => {
                const sender = peer.peerConnection.getSenders().find(s => 
                    s.track && s.track.kind === 'audio'
                );
                if (sender) {
                    replacePromises.push(sender.replaceTrack(newAudioTrack));
                }
            });
            await Promise.all(replacePromises);
            return true;
        } catch (error) {
            console.error('Error switching microphone:', error);
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
        // Unknown data channel message type; no-op
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

    // Video performance optimization methods
    optimizeVideoPerformance(peerConnection) {
        // Set up connection state monitoring for performance
        peerConnection.onconnectionstatechange = () => {
            if (peerConnection.connectionState === 'connected') {
                // Connection is stable, we can optimize further
                this.optimizeConnectionForVideo(peerConnection);
            }
        };

        // Monitor ICE connection state
        peerConnection.oniceconnectionstatechange = () => {};
    }

    optimizeVideoTrack(track) {
        if (track.kind !== 'video') return;

        // Apply video track constraints for better performance
        const constraints = track.getConstraints();
        
        // Set optimal video settings
        track.applyConstraints({
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 60 },
            // Enable hardware acceleration hints
            advanced: [
                { width: { min: 640 } },
                { height: { min: 480 } },
                { frameRate: { min: 15 } }
            ]
        }).catch(error => {
            console.warn('Could not apply video constraints:', error);
        });
    }

    optimizeConnectionForVideo(peerConnection) {
        // Get video senders and optimize them
        peerConnection.getSenders().forEach(sender => {
            if (sender.track && sender.track.kind === 'video') {
                // Set optimal encoding parameters
                const params = sender.getParameters();
                if (params.encodings && params.encodings.length > 0) {
                    params.encodings.forEach(encoding => {
                        // Optimize for real-time video
                        encoding.maxBitrate = 2500000; // 2.5 Mbps max
                        encoding.scaleResolutionDownBy = 1; // No downscaling initially
                        encoding.maxFramerate = 30;
                    });
                    
                    sender.setParameters(params).catch(error => {
                        console.warn('Could not set encoding parameters:', error);
                    });
                }
            }
        });
    }

    // Handle remote control commands
    handleRemoteControl(type, enable) {
        if (type === 'video') {
            const videoTrack = this.localStream?.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = enable;
                this.isVideoEnabled = enable;
                this.emit('videoToggled', this.isVideoEnabled);
            }
        } else if (type === 'audio') {
            const audioTrack = this.localStream?.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = enable;
                this.isAudioEnabled = enable;
                this.emit('audioToggled', this.isAudioEnabled);
            }
        }
    }

    // Send remote control command (only room creator can use this)
    sendRemoteControl(targetUserId, type, enable) {
        this.socket.emit(`remote-control-${type}`, {
            targetUserId: targetUserId,
            enable: enable
        });
    }
}

window.WebRTCClient = WebRTCClient;