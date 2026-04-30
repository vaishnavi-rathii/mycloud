module.exports = async function () {
  const pool = require('../db/pool');
  await pool.end();
};
