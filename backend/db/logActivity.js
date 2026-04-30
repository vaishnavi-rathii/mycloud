const pool = require('./pool');

async function logActivity(userId, service, action, resourceId = null, metadata = {}) {
  try {
    await pool.query(
      `INSERT INTO activity_logs (user_id, service, action, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, service, action, resourceId, JSON.stringify(metadata)]
    );
    if (global.io) {
      global.io.emit('activity', { userId, service, action, resourceId, metadata, createdAt: new Date() });
    }
  } catch (err) {
    console.error('Failed to log activity:', err.message);
  }
}

module.exports = logActivity;
