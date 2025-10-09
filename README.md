# QUIC-RTC Video Conferencing Application

A modern video conferencing application built with QUIC protocol, Node.js, and WebRTC, featuring end-to-end encryption and low-latency communication.

## 🚀 Features

- **Real-time Audio/Video Communication** - High-quality peer-to-peer video calls
- **QUIC Protocol Support** - Low-latency data transfer with built-in security
- **End-to-End Encryption** - AES-256-GCM encryption for all communications
- **Screen Sharing** - Share your screen with other participants
- **Encrypted Chat** - Secure real-time messaging
- **Room Management** - Create and join meeting rooms with unique IDs
- **Simple Interface** - Clean UI with essential controls (mic, video, hang up)
- **Cross-Platform** - Works on desktop and mobile browsers

## 🛠 Technology Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Real-time Communication**: WebRTC, QUIC/WebTransport
- **Encryption**: Web Crypto API (AES-256-GCM, ECDH)
- **Security**: HTTPS/TLS, Self-signed certificates for development

## 📋 Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Modern web browser with WebRTC support
- OpenSSL (for certificate generation)

## 🔧 Installation

1. **Clone or navigate to the project directory**
   ```bash
   cd /Users/nikitakedrov/Quic-RTC
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Generate SSL certificates** (already done)
   ```bash
   mkdir -p certs
   openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/C=US/ST=CA/L=San Francisco/O=QuicRTC/CN=localhost"
   ```

4. **Configure environment variables**
   - Copy `.env` file and modify as needed
   - Default ports: HTTP (3000), HTTPS (3443)

## 🚀 Running the Application

1. **Start the server**
   ```bash
   npm start
   # or
   node server.js
   ```

2. **Access the application**
   - **HTTPS (Recommended)**: https://localhost:3443
   - **HTTP (Fallback)**: http://localhost:3000

3. **Accept the self-signed certificate**
   - Your browser will show a security warning
   - Click "Advanced" → "Proceed to localhost (unsafe)"
   - This is safe for development purposes

## 🔐 Security Features

### End-to-End Encryption
- **Room Keys**: Each room generates unique AES-256 encryption keys
- **Message Encryption**: All chat messages are encrypted before transmission
- **Key Exchange**: ECDH key exchange for secure peer-to-peer communication
- **Certificate-based Security**: HTTPS/TLS for transport layer security

### Privacy Protection
- No data is stored on the server permanently
- Encryption keys are generated client-side
- Peer-to-peer connections minimize server involvement

## 📱 Usage Instructions

### Creating a Room
1. Enter your username
2. Click "Create New Room"
3. Share the room ID with participants

### Joining a Room
1. Enter your username
2. Enter the room ID
3. Click "Join Room"

### During a Call
- **Microphone**: Toggle with the mic button
- **Video**: Toggle with the camera button
- **Screen Share**: Click the screen share button
- **Chat**: Use the chat panel for encrypted messaging
- **Leave**: Click the hang up button to exit

## 🧪 Testing

### Single User Testing
1. Open https://localhost:3443
2. Create a room and test basic functionality
3. Verify microphone and camera permissions

### Multi-User Testing
1. **Same Device**: Open multiple browser tabs/windows
2. **Different Devices**: Use the same network, access via IP
3. **Different Networks**: Requires TURN server configuration

### Testing Checklist
- [ ] Room creation and joining
- [ ] Audio/video streaming
- [ ] Microphone and camera controls
- [ ] Screen sharing functionality
- [ ] Encrypted chat messaging
- [ ] Connection quality indicators
- [ ] Graceful disconnection handling

## 🌐 Network Configuration

### For Local Network Testing
1. Find your local IP address:
   ```bash
   # macOS/Linux
   ifconfig | grep "inet " | grep -v 127.0.0.1
   
   # Windows
   ipconfig | findstr "IPv4"
   ```

2. Update `.env` file:
   ```env
   HOST=0.0.0.0
   CORS_ORIGIN=https://YOUR_LOCAL_IP:3443
   ```

3. Access from other devices: `https://YOUR_LOCAL_IP:3443`

### For Production Deployment
1. **Get a valid SSL certificate** (Let's Encrypt recommended)
2. **Configure TURN servers** for NAT traversal
3. **Update environment variables** for production
4. **Set up proper firewall rules**
5. **Use a process manager** (PM2, systemd)

## 🔧 Configuration

### Environment Variables (.env)
```env
# Server Configuration
PORT=3000                    # HTTP port
HTTPS_PORT=3443             # HTTPS port
HOST=localhost              # Server host

# Security
CORS_ORIGIN=https://localhost:3443
SESSION_SECRET=your-secret-key

# STUN/TURN Servers
STUN_SERVER=stun:stun.l.google.com:19302
TURN_SERVER=                # Optional TURN server
TURN_USERNAME=              # TURN username
TURN_PASSWORD=              # TURN password

# Encryption
ENCRYPTION_ALGORITHM=aes-256-gcm
KEY_DERIVATION_ITERATIONS=100000
```

## 🐛 Troubleshooting

### Common Issues

1. **Certificate Warnings**
   - Expected with self-signed certificates
   - Click "Advanced" → "Proceed to localhost"

2. **Camera/Microphone Not Working**
   - Check browser permissions
   - Ensure HTTPS is being used
   - Try refreshing the page

3. **Connection Issues**
   - Check firewall settings
   - Verify STUN server accessibility
   - Consider TURN server for restrictive networks

4. **Audio/Video Quality Issues**
   - Check network bandwidth
   - Close other applications using camera/mic
   - Try different browsers

### Debug Mode
Enable debug logging by adding to `.env`:
```env
DEBUG=quic-rtc:*
NODE_ENV=development
```

## 📊 Performance Optimization

### For Better Performance
1. **Use TURN servers** for better connectivity
2. **Optimize video resolution** based on network
3. **Enable hardware acceleration** in browser
4. **Use dedicated server** for production
5. **Implement adaptive bitrate** for varying network conditions

## 🔒 Security Considerations

### Development vs Production
- **Development**: Self-signed certificates are acceptable
- **Production**: Use valid SSL certificates from trusted CA
- **Network**: Configure proper firewall rules
- **Updates**: Keep dependencies updated for security patches

### Best Practices
1. Change default session secrets
2. Use environment variables for sensitive data
3. Implement rate limiting for production
4. Regular security audits
5. Monitor for unusual activity

## 📄 License

This project is for educational and development purposes. Please ensure compliance with applicable laws and regulations when deploying in production.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For issues and questions:
1. Check the troubleshooting section
2. Review browser console for errors
3. Verify network connectivity
4. Test with different browsers/devices

---

**Note**: This application uses self-signed certificates for development. For production use, obtain proper SSL certificates and configure appropriate TURN servers for optimal connectivity across different network configurations.