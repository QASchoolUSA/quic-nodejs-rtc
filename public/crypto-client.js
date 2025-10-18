/**
 * Client-side crypto utilities for end-to-end encryption
 */
class CryptoClient {
    constructor() {
        this.algorithm = 'AES-GCM';
        this.keyLength = 256;
        this.ivLength = 12; // 96 bits for GCM
        this.tagLength = 16; // 128 bits
    }

    /**
     * Generate a random encryption key
     * @returns {Promise<CryptoKey>} AES-GCM key
     */
    async generateKey() {
        return await window.crypto.subtle.generateKey(
            {
                name: this.algorithm,
                length: this.keyLength
            },
            true, // extractable
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Import a key from hex string
     * @param {string} keyHex - Key in hex format
     * @returns {Promise<CryptoKey>} Imported key
     */
    async importKey(keyHex) {
        try {
            // Check if crypto API is available
            if (!window.crypto || !window.crypto.subtle) {
                throw new Error('Web Crypto API not available. Please use a modern browser.');
            }
            
            const keyBuffer = this.hexToArrayBuffer(keyHex);
            return await window.crypto.subtle.importKey(
                'raw',
                keyBuffer,
                { name: this.algorithm },
                false,
                ['encrypt', 'decrypt']
            );
        } catch (error) {
            console.error('Error importing key:', error);
            throw new Error('Failed to import encryption key: ' + error.message);
        }
    }

    /**
     * Export a key to hex string
     * @param {CryptoKey} key - Key to export
     * @returns {Promise<string>} Key in hex format
     */
    async exportKey(key) {
        const keyBuffer = await window.crypto.subtle.exportKey('raw', key);
        return this.arrayBufferToHex(keyBuffer);
    }

    /**
     * Generate a random IV
     * @returns {Uint8Array} Random IV
     */
    generateIV() {
        return window.crypto.getRandomValues(new Uint8Array(this.ivLength));
    }

    /**
     * Encrypt data using AES-GCM
     * @param {string} data - Data to encrypt
     * @param {CryptoKey} key - Encryption key
     * @param {Uint8Array} iv - Initialization vector
     * @returns {Promise<Object>} Encrypted data with IV
     */
    async encrypt(data, key, iv = null) {
        if (!iv) {
            iv = this.generateIV();
        }

        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);

        const encryptedBuffer = await window.crypto.subtle.encrypt(
            {
                name: this.algorithm,
                iv: iv
            },
            key,
            dataBuffer
        );

        return {
            encrypted: this.arrayBufferToHex(encryptedBuffer),
            iv: this.arrayBufferToHex(iv)
        };
    }

    /**
     * Decrypt data using AES-GCM
     * @param {string} encryptedHex - Encrypted data in hex
     * @param {CryptoKey} key - Decryption key
     * @param {string} ivHex - IV in hex format
     * @returns {Promise<string>} Decrypted data
     */
    async decrypt(encryptedHex, key, ivHex) {
        const encryptedBuffer = this.hexToArrayBuffer(encryptedHex);
        const iv = this.hexToArrayBuffer(ivHex);

        const decryptedBuffer = await window.crypto.subtle.decrypt(
            {
                name: this.algorithm,
                iv: iv
            },
            key,
            encryptedBuffer
        );

        const decoder = new TextDecoder();
        return decoder.decode(decryptedBuffer);
    }

    /**
     * Generate ECDH key pair for key exchange
     * @returns {Promise<CryptoKeyPair>} Key pair
     */
    async generateKeyPair() {
        return await window.crypto.subtle.generateKey(
            {
                name: 'ECDH',
                namedCurve: 'P-256'
            },
            true, // extractable
            ['deriveKey']
        );
    }

    /**
     * Export public key to JWK format
     * @param {CryptoKey} publicKey - Public key to export
     * @returns {Promise<Object>} JWK object
     */
    async exportPublicKey(publicKey) {
        return await window.crypto.subtle.exportKey('jwk', publicKey);
    }

    /**
     * Import public key from JWK format
     * @param {Object} jwk - JWK object
     * @returns {Promise<CryptoKey>} Imported public key
     */
    async importPublicKey(jwk) {
        return await window.crypto.subtle.importKey(
            'jwk',
            jwk,
            {
                name: 'ECDH',
                namedCurve: 'P-256'
            },
            false,
            []
        );
    }

    /**
     * Derive shared key using ECDH
     * @param {CryptoKey} privateKey - Your private key
     * @param {CryptoKey} publicKey - Peer's public key
     * @returns {Promise<CryptoKey>} Derived shared key
     */
    async deriveSharedKey(privateKey, publicKey) {
        return await window.crypto.subtle.deriveKey(
            {
                name: 'ECDH',
                public: publicKey
            },
            privateKey,
            {
                name: this.algorithm,
                length: this.keyLength
            },
            false, // not extractable
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Hash data using SHA-256
     * @param {string} data - Data to hash
     * @returns {Promise<string>} Hash in hex format
     */
    async hash(data) {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataBuffer);
        return this.arrayBufferToHex(hashBuffer);
    }

    /**
     * Generate HMAC signature
     * @param {string} data - Data to sign
     * @param {CryptoKey} key - HMAC key
     * @returns {Promise<string>} HMAC signature in hex
     */
    async createHMAC(data, key) {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        
        const signature = await window.crypto.subtle.sign(
            'HMAC',
            key,
            dataBuffer
        );
        
        return this.arrayBufferToHex(signature);
    }

    /**
     * Verify HMAC signature
     * @param {string} data - Original data
     * @param {CryptoKey} key - HMAC key
     * @param {string} signatureHex - Signature in hex
     * @returns {Promise<boolean>} True if signature is valid
     */
    async verifyHMAC(data, key, signatureHex) {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const signature = this.hexToArrayBuffer(signatureHex);
        
        return await window.crypto.subtle.verify(
            'HMAC',
            key,
            signature,
            dataBuffer
        );
    }

    /**
     * Convert ArrayBuffer to hex string
     * @param {ArrayBuffer} buffer - Buffer to convert
     * @returns {string} Hex string
     */
    arrayBufferToHex(buffer) {
        return Array.from(new Uint8Array(buffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Convert hex string to ArrayBuffer
     * @param {string} hex - Hex string to convert
     * @returns {ArrayBuffer} ArrayBuffer
     */
    hexToArrayBuffer(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return bytes.buffer;
    }

    /**
     * Generate a secure random string
     * @param {number} length - Length of the string
     * @returns {string} Random string
     */
    generateRandomString(length = 32) {
        const array = new Uint8Array(length);
        window.crypto.getRandomValues(array);
        return this.arrayBufferToHex(array.buffer);
    }
}

// Export for use in other modules
window.CryptoClient = CryptoClient;