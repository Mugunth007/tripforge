/**
 * Tests for Travel Planner API
 */
const request = require('supertest');
const app = require('../server');

describe('Health Check', () => {
  it('GET /api/health should return healthy status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.timestamp).toBeDefined();
  });
});

describe('Config', () => {
  it('GET /api/config returns error when key not set', async () => {
    const original = process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('not configured');
    process.env.GOOGLE_MAPS_API_KEY = original;
  });

  it('GET /api/config returns key when set', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key-123';
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.mapsApiKey).toBe('test-key-123');
  });
});

describe('Trips API', () => {
  let tripId;

  it('POST /api/trips creates a trip', async () => {
    const res = await request(app).post('/api/trips').send({
      name: 'Test Trip',
      origin: 'New York',
      destination: 'Boston',
      waypoints: ['Philadelphia'],
      preferences: { travelMode: 'DRIVING', avoidTolls: false }
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Trip');
    expect(res.body.id).toBeDefined();
    tripId = res.body.id;
  });

  it('POST /api/trips validates required fields', async () => {
    const res = await request(app).post('/api/trips').send({ name: 'Bad Trip' });
    expect(res.status).toBe(400);
  });

  it('GET /api/trips lists all trips', async () => {
    const res = await request(app).get('/api/trips');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/trips/:id returns a specific trip', async () => {
    const res = await request(app).get(`/api/trips/${tripId}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Test Trip');
  });

  it('GET /api/trips/:id returns 404 for missing trip', async () => {
    const res = await request(app).get('/api/trips/nonexistent');
    expect(res.status).toBe(404);
  });

  it('DELETE /api/trips/:id deletes a trip', async () => {
    const res = await request(app).delete(`/api/trips/${tripId}`);
    expect(res.status).toBe(204);
  });

  it('DELETE /api/trips/:id returns 404 for missing trip', async () => {
    const res = await request(app).delete('/api/trips/nonexistent');
    expect(res.status).toBe(404);
  });
});
