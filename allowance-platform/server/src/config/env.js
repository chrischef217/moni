const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET || 'change-me-session-secret',
  dbUrl: process.env.DATABASE_URL || '',
  sqlitePath: process.env.SQLITE_PATH || './database.sqlite',
  encryptionKey: process.env.ENCRYPTION_KEY || 'change-me-encryption-key',
  jwtSecret: process.env.JWT_SECRET || 'change-me-jwt-secret',
};

