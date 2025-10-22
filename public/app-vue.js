const { createApp } = Vue;

createApp({
    data() {
        return {
            roomId: '',
            isLoading: false,
            message: { text: '', type: '' }
        };
    },
    mounted() {
        // Pre-fill room ID from legacy URL param for backward compatibility
        const urlParams = new URLSearchParams(window.location.search);
        const roomFromUrl = urlParams.get('room');
        if (roomFromUrl) {
            this.roomId = roomFromUrl;
        }
    },
    methods: {
        validateRoomId(id) {
            return typeof id === 'string' && /^[A-Za-z0-9_-]{3,32}$/.test(id);
        },

        async createRoom() {
            const id = this.roomId.trim();
            if (!this.validateRoomId(id)) {
                this.showMessage('Invalid Room ID. Use 3-32 chars: letters, numbers, - and _.', 'error');
                return;
            }

            this.isLoading = true;
            try {
                const response = await fetch('/api/create-room', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ roomId: id })
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    throw new Error(err.message || `HTTP ${response.status}`);
                }

                const data = await response.json();
                if (data.success) {
                    this.showMessage('Room created! Redirecting…', 'success');
                    setTimeout(() => {
                        window.location.href = `/room/${id}`;
                    }, 500);
                } else {
                    throw new Error(data.message || 'Failed to create room');
                }
            } catch (error) {
                console.error('Error creating room:', error);
                this.showMessage(error.message || 'Failed to create room. Please try again.', 'error');
            } finally {
                this.isLoading = false;
            }
        },

        joinRoom() {
            const id = this.roomId.trim();
            if (!this.validateRoomId(id)) {
                this.showMessage('Invalid Room ID. Use 3-32 chars: letters, numbers, - and _.', 'error');
                return;
            }
            this.showMessage('Joining room…', 'success');
            setTimeout(() => {
                window.location.href = `/room/${id}`;
            }, 300);
        },

        handleEnterKey() {
            if (this.roomId.trim()) {
                this.joinRoom();
            } else {
                this.showMessage('Enter a Room ID', 'error');
            }
        },

        handleFormSubmit() {
            if (this.roomId.trim()) {
                this.joinRoom();
            } else {
                this.showMessage('Enter a Room ID', 'error');
            }
        },

        showMessage(text, type) {
            this.message = { text, type };
            setTimeout(() => { this.message = { text: '', type: '' }; }, 5000);
        }
    }
}).mount('#app');