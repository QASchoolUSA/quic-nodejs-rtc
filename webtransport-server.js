// WebTransport Server for QUIC-based data communication
const { createServer } = require('http');
const { WebSocketServer } = require('ws');

class WebTransportServer {
    constructor(port = 3001) {
        this.port = port;
        this.server = null;
        this.wss = null;
        this.connections = new Map();
        this.eventListeners = new Map();
    }

    // Start the WebTransport server (using WebSocket as fallback)
    async start() {
        try {
            this.server = createServer();
            
            // Set up WebSocket server for QUIC-like communication
            this.wss = new WebSocketServer({ 
                server: this.server,
                path: '/webtransport'
            });
            
            this.wss.on('connection', (ws, req) => {
                this.handleWebSocketConnection(ws, req);
            });

            this.server.listen(this.port, () => {
                console.log(`WebTransport (WebSocket fallback) server running on port ${this.port}`);
                this.emit('started', { port: this.port });
            });

        } catch (error) {
            console.error('Failed to start WebTransport server:', error);
            this.emit('error', error);
            throw error;
        }
    }

    // Handle WebSocket connection (WebTransport fallback)
    handleWebSocketConnection(ws, req) {
        const connectionId = this.generateConnectionId();
        this.connections.set(connectionId, ws);
        
        console.log(`WebTransport (WebSocket) connection established: ${connectionId}`);
        this.emit('connection', { connectionId, ws });
        
        // Handle incoming messages
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                message.connectionId = connectionId;
                this.emit('message', message);
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        });
        
        // Handle connection close
        ws.on('close', () => {
            console.log(`WebTransport (WebSocket) connection closed: ${connectionId}`);
            this.connections.delete(connectionId);
            this.emit('disconnection', { connectionId });
        });
        
        // Handle errors
        ws.on('error', (error) => {
            console.error(`WebSocket error for connection ${connectionId}:`, error);
            this.emit('error', { connectionId, error });
        });
    }

    // Send message to specific connection
    async sendMessage(connectionId, message) {
        const ws = this.connections.get(connectionId);
        if (!ws) {
            throw new Error(`Connection ${connectionId} not found`);
        }

        try {
            ws.send(JSON.stringify(message));
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    // Send message to all connections
    async broadcastMessage(message) {
        const promises = Array.from(this.connections.keys()).map(connectionId => 
            this.sendMessage(connectionId, message).catch(error => 
                console.error(`Error broadcasting to ${connectionId}:`, error)
            )
        );
        
        await Promise.allSettled(promises);
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

    // Generate unique connection ID
    generateConnectionId() {
        return Math.random().toString(36).substr(2, 9);
    }

    // Get connection count
    getConnectionCount() {
        return this.connections.size;
    }

    // Stop the server
    async stop() {
        if (this.wss) {
            this.wss.close();
        }
        
        if (this.server) {
            await new Promise((resolve) => {
                this.server.close(resolve);
            });
        }
        
        // Close all connections
        for (const [connectionId, ws] of this.connections) {
            try {
                ws.close();
            } catch (error) {
                console.error(`Error closing connection ${connectionId}:`, error);
            }
        }
        
        this.connections.clear();
        console.log('WebTransport server stopped');
    }
}

module.exports = WebTransportServer;
