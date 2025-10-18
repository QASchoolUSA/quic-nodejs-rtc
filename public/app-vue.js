const { createApp } = Vue;

createApp({
    data() {
        return {
            username: '',
            roomId: '',
            isLoading: false,
            message: {
                text: '',
                type: ''
            }
        };
    },
    mounted() {
        // Load saved username from localStorage
        const savedUsername = localStorage.getItem('quic-rtc-username');
        if (savedUsername) {
            this.username = savedUsername;
        }

        // Check for room ID in URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const roomFromUrl = urlParams.get('room');
        if (roomFromUrl) {
            this.roomId = roomFromUrl;
        }
    },
    methods: {
        async createRoom() {
            if (!this.username.trim()) {
                this.showMessage('Please enter your name', 'error');
                return;
            }

            this.isLoading = true;
            this.saveUsername();

            try {
                const response = await fetch('/api/create-room', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username: this.username.trim() })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                
                if (data.success) {
                    this.showMessage('Room created successfully! Redirecting...', 'success');
                    setTimeout(() => {
                        window.location.href = `room.html?room=${data.roomId}&username=${encodeURIComponent(this.username.trim())}`;
                    }, 1000);
                } else {
                    throw new Error(data.message || 'Failed to create room');
                }
            } catch (error) {
                console.error('Error creating room:', error);
                this.showMessage('Failed to create room. Please try again.', 'error');
            } finally {
                this.isLoading = false;
            }
        },

        joinRoom() {
            if (!this.username.trim()) {
                this.showMessage('Please enter your name', 'error');
                return;
            }

            if (!this.roomId.trim()) {
                this.showMessage('Please enter a room ID', 'error');
                return;
            }

            this.saveUsername();
            this.showMessage('Joining room...', 'success');
            
            setTimeout(() => {
                window.location.href = `room.html?room=${this.roomId.trim()}&username=${encodeURIComponent(this.username.trim())}`;
            }, 500);
        },

        handleEnterKey() {
            if (this.roomId.trim()) {
                this.joinRoom();
            } else {
                this.createRoom();
            }
        },

        handleFormSubmit() {
            if (this.roomId.trim()) {
                this.joinRoom();
            } else {
                this.createRoom();
            }
        },

        saveUsername() {
            localStorage.setItem('quic-rtc-username', this.username.trim());
        },

        showMessage(text, type) {
            this.message = { text, type };
            
            // Clear message after 5 seconds
            setTimeout(() => {
                this.message = { text: '', type: '' };
            }, 5000);
        }
    }
}).mount('#app');