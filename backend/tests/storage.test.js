const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { app } = require('../server');
const pool = require('../db/pool');

let adminToken;
let bucketName;
let createdBucketId;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@mycloud.local', password: 'admin123' });
  adminToken = res.body.token;
  bucketName = `test-bucket-${Date.now()}`;
});

afterAll(async () => {
  if (createdBucketId) {
    await pool.query('DELETE FROM objects WHERE bucket_id=$1', [createdBucketId]);
    await pool.query('DELETE FROM buckets WHERE id=$1', [createdBucketId]);
    const dir = path.join(process.env.STORAGE_PATH || './storage', createdBucketId);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  // Pool is shared; closed by globalTeardown
});

describe('POST /api/storage/buckets', () => {
  it('creates a bucket', async () => {
    const res = await request(app)
      .post('/api/storage/buckets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: bucketName, access: 'private' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(bucketName);
    expect(res.body.access).toBe('private');
    createdBucketId = res.body.id;
  });

  it('returns 409 for duplicate name', async () => {
    const res = await request(app)
      .post('/api/storage/buckets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: bucketName });
    expect(res.status).toBe(409);
  });

  it('returns 400 for invalid bucket name', async () => {
    const res = await request(app)
      .post('/api/storage/buckets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'AB' }); // too short and uppercase
    expect(res.status).toBe(400);
  });
});

describe('GET /api/storage/buckets', () => {
  it('returns list including new bucket', async () => {
    const res = await request(app)
      .get('/api/storage/buckets')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((b) => b.name === bucketName)).toBe(true);
  });
});

describe('PUT /storage/:bucket/:key', () => {
  it('uploads a file', async () => {
    const res = await request(app)
      .put(`/storage/${bucketName}/hello.txt`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('Hello, MyCloud!'), { filename: 'hello.txt', contentType: 'text/plain' });
    expect(res.status).toBe(200);
    expect(res.body.key).toBe('hello.txt');
  });
});

describe('GET /storage/:bucket/:key', () => {
  it('downloads a file', async () => {
    const res = await request(app)
      .get(`/storage/${bucketName}/hello.txt`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Hello, MyCloud!');
  });
});

describe('DELETE /storage/:bucket/:key', () => {
  it('deletes a file', async () => {
    const res = await request(app)
      .delete(`/storage/${bucketName}/hello.txt`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
  });
});

describe('DELETE /api/storage/buckets/:bucket (non-empty)', () => {
  it('returns 409 when bucket has files', async () => {
    // Upload a file first
    await request(app)
      .put(`/storage/${bucketName}/another.txt`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('data'), { filename: 'another.txt', contentType: 'text/plain' });

    const res = await request(app)
      .delete(`/api/storage/buckets/${bucketName}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);

    // Clean up so afterAll can delete the bucket
    await request(app)
      .delete(`/storage/${bucketName}/another.txt`)
      .set('Authorization', `Bearer ${adminToken}`);
  });
});
