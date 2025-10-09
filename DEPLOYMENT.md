# QUIC-RTC Deployment Guide

This guide covers deploying the QUIC-RTC video conferencing application to production environments.

## 🚀 Production Deployment

### Prerequisites
- Linux server (Ubuntu 20.04+ recommended)
- Node.js 16+ and npm
- Valid domain name
- SSL certificate (Let's Encrypt recommended)
- Firewall access to required ports

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Create application user
sudo useradd -m -s /bin/bash quicrtc
sudo usermod -aG sudo quicrtc
```

### 2. Application Deployment

```bash
# Switch to application user
sudo su - quicrtc

# Clone/upload your application
git clone <your-repo> /home/quicrtc/quic-rtc
cd /home/quicrtc/quic-rtc

# Install dependencies
npm install --production

# Create production environment file
cp .env .env.production
```

### 3. SSL Certificate Setup

#### Option A: Let's Encrypt (Recommended)
```bash
# Install Certbot
sudo apt install certbot

# Get certificate
sudo certbot certonly --standalone -d yourdomain.com

# Copy certificates to application
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem /home/quicrtc/quic-rtc/certs/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem /home/quicrtc/quic-rtc/certs/key.pem
sudo chown quicrtc:quicrtc /home/quicrtc/quic-rtc/certs/*
```

#### Option B: Custom Certificate
```bash
# Place your certificate files
cp your-cert.pem /home/quicrtc/quic-rtc/certs/cert.pem
cp your-key.pem /home/quicrtc/quic-rtc/certs/key.pem
```

### 4. Production Configuration

Update `.env.production`:
```env
# Server Configuration
PORT=80
HTTPS_PORT=443
HOST=0.0.0.0
NODE_ENV=production

# Security
CORS_ORIGIN=https://yourdomain.com
SESSION_SECRET=your-super-secure-random-session-secret

# STUN/TURN Servers
STUN_SERVER=stun:stun.l.google.com:19302
TURN_SERVER=turn:yourturnserver.com:3478
TURN_USERNAME=your-turn-username
TURN_PASSWORD=your-turn-password

# Encryption
ENCRYPTION_ALGORITHM=aes-256-gcm
KEY_DERIVATION_ITERATIONS=100000
```

### 5. Firewall Configuration

```bash
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow TURN server ports (if self-hosted)
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 49152:65535/udp

# Enable firewall
sudo ufw enable
```

### 6. Process Management with PM2

Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'quic-rtc',
    script: 'server.js',
    env_file: '.env.production',
    instances: 'max',
    exec_mode: 'cluster',
    watch: false,
    max_memory_restart: '1G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

Start the application:
```bash
# Create logs directory
mkdir -p logs

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u quicrtc --hp /home/quicrtc
```

## 🔧 TURN Server Setup (Optional)

For better connectivity across NAT/firewalls, set up a TURN server:

### Using Coturn
```bash
# Install Coturn
sudo apt install coturn

# Configure /etc/turnserver.conf
sudo tee /etc/turnserver.conf > /dev/null <<EOF
listening-port=3478
tls-listening-port=5349
listening-ip=YOUR_SERVER_IP
external-ip=YOUR_SERVER_IP
realm=yourdomain.com
server-name=yourdomain.com
lt-cred-mech
user=username:password
cert=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
pkey=/etc/letsencrypt/live/yourdomain.com/privkey.pem
EOF

# Start Coturn
sudo systemctl enable coturn
sudo systemctl start coturn
```

## 🔍 Monitoring and Logging

### 1. Application Monitoring
```bash
# View PM2 status
pm2 status

# View logs
pm2 logs quic-rtc

# Monitor resources
pm2 monit
```

### 2. System Monitoring
```bash
# Install monitoring tools
sudo apt install htop iotop nethogs

# Monitor system resources
htop

# Monitor network usage
nethogs
```

### 3. Log Rotation
```bash
# Setup logrotate for application logs
sudo tee /etc/logrotate.d/quic-rtc > /dev/null <<EOF
/home/quicrtc/quic-rtc/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 quicrtc quicrtc
    postrotate
        pm2 reloadLogs
    endscript
}
EOF
```

## 🔒 Security Hardening

### 1. System Security
```bash
# Update system regularly
sudo apt update && sudo apt upgrade -y

# Configure automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Install fail2ban
sudo apt install fail2ban
```

### 2. Application Security
```bash
# Set proper file permissions
chmod 600 /home/quicrtc/quic-rtc/.env.production
chmod 600 /home/quicrtc/quic-rtc/certs/*
```

### 3. Reverse Proxy (Optional)
Using Nginx for additional security:

```nginx
# /etc/nginx/sites-available/quic-rtc
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    location / {
        proxy_pass https://localhost:3443;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 📊 Performance Optimization

### 1. Node.js Optimization
```bash
# Increase file descriptor limits
echo "quicrtc soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "quicrtc hard nofile 65536" | sudo tee -a /etc/security/limits.conf
```

### 2. System Optimization
```bash
# Optimize network settings
sudo tee -a /etc/sysctl.conf > /dev/null <<EOF
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.ipv4.tcp_congestion_control = bbr
EOF

sudo sysctl -p
```

## 🔄 Maintenance

### Regular Tasks
```bash
# Update application
cd /home/quicrtc/quic-rtc
git pull
npm install --production
pm2 reload quic-rtc

# Renew SSL certificates (if using Let's Encrypt)
sudo certbot renew --quiet

# Clean up logs
pm2 flush

# Monitor disk space
df -h
```

### Backup Strategy
```bash
# Create backup script
#!/bin/bash
BACKUP_DIR="/backup/quic-rtc"
APP_DIR="/home/quicrtc/quic-rtc"

mkdir -p $BACKUP_DIR
tar -czf $BACKUP_DIR/quic-rtc-$(date +%Y%m%d).tar.gz \
    $APP_DIR --exclude=node_modules --exclude=logs
```

## 🚨 Troubleshooting

### Common Issues

1. **Certificate Issues**
   ```bash
   # Check certificate validity
   openssl x509 -in certs/cert.pem -text -noout
   
   # Test SSL connection
   openssl s_client -connect yourdomain.com:443
   ```

2. **Port Issues**
   ```bash
   # Check if ports are in use
   sudo netstat -tlnp | grep :443
   
   # Check firewall status
   sudo ufw status
   ```

3. **Performance Issues**
   ```bash
   # Monitor system resources
   htop
   
   # Check PM2 processes
   pm2 monit
   
   # Analyze logs
   pm2 logs quic-rtc --lines 100
   ```

### Health Checks
```bash
# Create health check script
#!/bin/bash
curl -f https://yourdomain.com/api/health || exit 1
```

## 📈 Scaling

### Horizontal Scaling
- Use load balancer (HAProxy, Nginx)
- Implement sticky sessions for WebSocket connections
- Use Redis for session storage
- Deploy multiple instances across servers

### Vertical Scaling
- Increase server resources (CPU, RAM)
- Optimize PM2 cluster configuration
- Tune Node.js memory limits

---

**Note**: Always test deployments in a staging environment before production. Monitor application performance and adjust configurations as needed.