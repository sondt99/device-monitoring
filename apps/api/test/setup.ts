import { setEncryptionKey } from '../src/notifications/crypto.js';

setEncryptionKey(Buffer.from('test-only-encryption-key-32bytes', 'utf8'));
