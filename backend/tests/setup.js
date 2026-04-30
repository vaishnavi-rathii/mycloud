// Global Jest setup — runs once before all test suites
module.exports = async function () {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://mycloud:mycloud_secret@localhost:5432/mycloud';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_32_chars_minimum__';
  process.env.STORAGE_PATH = process.env.STORAGE_PATH || require('path').join(__dirname, '../storage');
};
