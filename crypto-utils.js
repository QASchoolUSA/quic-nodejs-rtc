const crypto = require('crypto');

/**
 * Crypto utilities for end-to-end encryption in the video conferencing app
 */
class CryptoUtils {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32; // 256 bits
        this.ivLength = 16;  // 128 bits
        this.tagLength = 16; // 128 bits
    }

    /**
     * Generate a random encryption key
     * @returns {Buffer} 256-bit encryption key
     */
    generateKey() {
        return crypto.randomBytes(this.keyLength);
    }

    /**
     * Generate a random initialization vector
     * @returns {Buffer} 128-bit IV
     */
    generateIV() {
        return crypto.randomBytes(this.ivLength);
    }

    /**
     * Encrypt data using AES-256-GCM
     * @param {Buffer|string} data - Data to encrypt
     * @param {Buffer} key - Encryption key
     * @param {Buffer} iv - Initialization vector
     * @returns {Object} Encrypted data with tag
     */
    encrypt(data, key, iv) {
        const cipher = crypto.createCipher(this.algorithm, key, { iv });
        
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const tag = cipher.getAuthTag();
        
        return {
            encrypted,
            tag: tag.toString('hex'),
            iv: iv.toString('hex')
        };
    }

    /**
     * Decrypt data using AES-256-GCM
     * @param {string} encryptedData - Encrypted data in hex
     * @param {Buffer} key - Decryption key
     * @param {string} ivHex - IV in hex format
     * @param {string} tagHex - Authentication tag in hex
     * @returns {string} Decrypted data
     */
    decrypt(encryptedData, key, ivHex, tagHex) {
        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        
        const decipher = crypto.createDecipher(this.algorithm, key, { iv });
        decipher.setAuthTag(tag);
        
        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }

    /**
     * Generate ECDH key pair for key exchange
     * @returns {Object} Key pair with public and private keys
     */
    generateKeyPair() {
        return crypto.generateKeyPairSync('ec', {
            namedCurve: 'secp256k1',
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        });
    }

    /**
     * Compute shared secret using ECDH
     * @param {string} privateKey - Private key in PEM format
     * @param {string} publicKey - Peer's public key in PEM format
     * @returns {Buffer} Shared secret
     */
    computeSharedSecret(privateKey, publicKey) {
        const ecdh = crypto.createECDH('secp256k1');
        ecdh.setPrivateKey(crypto.createPrivateKey(privateKey).export({
            type: 'sec1',
            format: 'der'
        }));
        
        const peerPublicKey = crypto.createPublicKey(publicKey).export({
            type: 'spki',
            format: 'der'
        });
        
        return ecdh.computeSecret(peerPublicKey);
    }

    /**
     * Derive encryption key from shared secret using PBKDF2
     * @param {Buffer} sharedSecret - Shared secret from ECDH
     * @param {string} salt - Salt for key derivation
     * @returns {Buffer} Derived encryption key
     */
    deriveKey(sharedSecret, salt) {
        return crypto.pbkdf2Sync(sharedSecret, salt, 100000, this.keyLength, 'sha256');
    }

    /**
     * Generate a secure random salt
     * @returns {string} Random salt in hex format
     */
    generateSalt() {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Hash data using SHA-256
     * @param {string|Buffer} data - Data to hash
     * @returns {string} Hash in hex format
     */
    hash(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Verify data integrity using HMAC
     * @param {string} data - Data to verify
     * @param {Buffer} key - HMAC key
     * @param {string} signature - Expected signature
     * @returns {boolean} True if signature is valid
     */
    verifyHMAC(data, key, signature) {
        const hmac = crypto.createHmac('sha256', key);
        hmac.update(data);
        const computedSignature = hmac.digest('hex');
        return crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(computedSignature, 'hex')
        );
    }

    /**
     * Create HMAC signature
     * @param {string} data - Data to sign
     * @param {Buffer} key - HMAC key
     * @returns {string} HMAC signature in hex
     */
    createHMAC(data, key) {
        const hmac = crypto.createHmac('sha256', key);
        hmac.update(data);
        return hmac.digest('hex');
    }
}

module.exports = CryptoUtils;