# WebRTC Video Conferencing Application

A modern video conferencing application built with WebRTC and WebTransport (QUIC-based), featuring end-to-end encryption and low-latency communication.

## 🚀 Features

- **Real-time Audio/Video Communication** - High-quality peer-to-peer video calls
- **WebTransport Support** - QUIC-based low-latency data transfer with built-in security
- **End-to-End Encryption** - AES-256-GCM encryption for all communications
- **Screen Sharing** - Share your screen with other participants
- **Encrypted Chat** - Secure real-time messaging
- **Room Management** - Create and join meeting rooms with unique IDs
- **Simple Interface** - Clean UI with essential controls (mic, video, hang up)
- **Cross-Platform** - Works on desktop and mobile browsers

## 🛠 Technology Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Real-time Communication**: WebRTC for media, WebTransport (QUIC) for data channels
- **Encryption**: Web Crypto API (AES-256-GCM, ECDH)
- **Security**: HTTPS/TLS, Self-signed certificates for development

## Getting Started

### Prerequisites

- Node.js (v18.0.0 or higher)
- npm (usually comes with Node.js)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/quic-rtc-meet.git
   ```
2. Navigate to the project directory:
   ```bash
   cd quic-rtc-meet
   ```
3. Install the dependencies:
   ```bash
   npm install
   ```

### Running the Application

1. Start the server:
   ```bash
   npm start
   ```
2. Open your browser and navigate to `https://localhost:3443` to use the application over HTTPS.


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
1. Enter a Room ID (3–32 chars: letters, numbers, -, _)
2. Click "Create New Meeting" or "Join Meeting"
3. Share the room URL `/room/<ROOM_ID>` with participants

### Joining a Room
1. Enter the Room ID
2. Click "Join Meeting" to navigate to `/room/<ROOM_ID>`
3. Alternatively, paste the URL `/room/<ROOM_ID>` directly in the browser

### During a Call
- **Microphone**: Toggle with the mic button
- **Video**: Toggle with the camera button
- **Screen Share**: Click the screen share button
- **Chat**: Use the chat panel for encrypted messaging
- **Leave**: Click the hang up button to exit

### URL Scheme
- Rooms are accessible at `/room/<ROOM_ID>`
- The homepage provides a single Room ID field to create or join
- Legacy query `?room=<ROOM_ID>` is still accepted to prefill the form

### Cleanup Notes
- Removed clipboard auto-copy functionality from room page
- Deleted unused legacy scripts: `public/app.js`, `public/room.js`
- Pruned non-essential debug logs from `public/room-vue.js` and `public/webrtc-client.js`

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