const crypto = require('crypto');
const env = require('../config/env');

const key = crypto.createHash('sha256').update(env.encryptionKey).digest();

function encryptText(value) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptText(payload) {
  if (!payload || !payload.includes(':')) {
    return '';
  }
  const [ivHex, encryptedHex] = payload.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

function maskRrn(rrn) {
  if (!rrn) return '';
  const cleaned = rrn.replace(/[^0-9]/g, '');
  if (cleaned.length < 7) return rrn;
  return `${cleaned.slice(0, 6)}-${cleaned.slice(6, 7)}******`;
}

module.exports = {
  encryptText,
  decryptText,
  maskRrn,
};

