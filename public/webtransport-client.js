// WebTransport Client for QUIC-based data communication (WebSocket fallback)
class WebTransportClient {
    constructor() {
        this.transport = null;
        this.ws = null;
        this.isConnected = false;
        this.eventListeners = new Map();
        this.useWebTransport = false;
    }

    // Check if WebTransport is supported
    isSupported() {
        return 'WebTransport' in window;
    }

    // Check if WebSocket is supported (fallback)
    isWebSocketSupported() {
        return 'WebSocket' in window;
    }

    // Connect to WebTransport server
    async connect(serverUrl) {
        // Try WebTransport first if supported
        if (this.isSupported()) {
            try {
                this.transport = new WebTransport(serverUrl);
                await this.transport.ready;
                this.isConnected = true;
                this.useWebTransport = true;
                
                console.log('WebTransport (QUIC) connected successfully');
                this.setupWebTransport();
                this.emit('connected');
                return true;
            } catch (error) {
                console.warn('WebTransport failed, falling back to WebSocket:', error);
            }
        }
        
        // Fallback to WebSocket
        if (this.isWebSocketSupported()) {
            try {
                const wsUrl = serverUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/webtransport';
                this.ws = new WebSocket(wsUrl);
                this.useWebTransport = false;
                
                this.ws.onopen = () => {
                    this.isConnected = true;
                    console.log('WebTransport (WebSocket fallback) connected successfully');
                    this.emit('connected');
                };
                
                this.ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        this.emit('message', message);
                    } catch (error) {
                        console.error('Error parsing WebSocket message:', error);
                    }
                };
                
                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    this.emit('error', error);
                };
                
                this.ws.onclose = () => {
                    this.isConnected = false;
                    this.emit('disconnected');
                };
                
                return true;
            } catch (error) {
                console.error('WebSocket connection failed:', error);
                this.emit('error', error);
                throw error;
            }
        }
        
        throw new Error('Neither WebTransport nor WebSocket is supported in this browser');
    }

    // Set up WebTransport (QUIC) communication
    setupWebTransport() {
        // Set up datagram communication for low-latency messages
        this.datagramWriter = this.transport.datagrams.writable.getWriter();
        this.datagramReader = this.transport.datagrams.readable.getReader();
        
        // Start reading datagrams
        this.readDatagrams();
        
        // Set up bidirectional streams for reliable communication
        this.transport.incomingBidirectionalStreams.getReader().then(reader => {
            this.handleIncomingStreams(reader);
        });
    }

    // Read incoming datagrams
    async readDatagrams() {
        try {
            while (this.isConnected) {
                const { value, done } = await this.datagramReader.read();
                if (done) break;
                
                // Parse the datagram data
                const message = JSON.parse(new TextDecoder().decode(value));
                this.emit('message', message);
            }
        } catch (error) {
            console.error('Error reading datagrams:', error);
            this.emit('error', error);
        }
    }

    // Handle incoming bidirectional streams
    async handleIncomingStreams(reader) {
        try {
            while (this.isConnected) {
                const { value, done } = await reader.read();
                if (done) break;
                
                const [readable, writable] = value;
                this.handleStream(readable, writable);
            }
        } catch (error) {
            console.error('Error handling incoming streams:', error);
            this.emit('error', error);
        }
    }

    // Handle individual stream
    async handleStream(readable, writable) {
        const reader = readable.getReader();
        const writer = writable.getWriter();
        
        try {
            while (this.isConnected) {
                const { value, done } = await reader.read();
                if (done) break;
                
                const message = JSON.parse(new TextDecoder().decode(value));
                this.emit('streamMessage', message);
            }
        } catch (error) {
            console.error('Error handling stream:', error);
        } finally {
            reader.releaseLock();
            writer.releaseLock();
        }
    }

    // Send message (low-latency for WebSocket, datagram for WebTransport)
    async sendMessage(message) {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }

        try {
            if (this.useWebTransport) {
                // Use datagrams for low-latency
                const data = new TextEncoder().encode(JSON.stringify(message));
                await this.datagramWriter.write(data);
            } else {
                // Use WebSocket
                this.ws.send(JSON.stringify(message));
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.emit('error', error);
            throw error;
        }
    }

    // Send reliable message (stream for WebTransport, regular message for WebSocket)
    async sendReliableMessage(message) {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }

        try {
            if (this.useWebTransport) {
                // Use streams for reliable delivery
                const { readable, writable } = await this.transport.createBidirectionalStream();
                const writer = writable.getWriter();
                const data = new TextEncoder().encode(JSON.stringify(message));
                await writer.write(data);
                await writer.close();
            } else {
                // Use WebSocket (already reliable)
                this.ws.send(JSON.stringify(message));
            }
        } catch (error) {
            console.error('Error sending reliable message:', error);
            this.emit('error', error);
            throw error;
        }
    }

    // Event system
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    emit(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }

    // Disconnect
    async disconnect() {
        this.isConnected = false;
        
        if (this.useWebTransport && this.transport) {
            if (this.datagramWriter) {
                try {
                    await this.datagramWriter.close();
                } catch (error) {
                    console.error('Error closing datagram writer:', error);
                }
            }
            
            if (this.datagramReader) {
                try {
                    await this.datagramReader.cancel();
                } catch (error) {
                    console.error('Error canceling datagram reader:', error);
                }
            }
            
            try {
                await this.transport.close();
            } catch (error) {
                console.error('Error closing transport:', error);
            }
        } else if (this.ws) {
            try {
                this.ws.close();
            } catch (error) {
                console.error('Error closing WebSocket:', error);
            }
        }
        
        this.emit('disconnected');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebTransportClient;
}
