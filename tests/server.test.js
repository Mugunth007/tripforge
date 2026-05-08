/**
 * @fileoverview Comprehensive test suite for TripForge v3 API.
 * Covers health, config, CRUD, all Google API proxy validation,
 * translation, security headers, and error handling.
 * @version 3.0.0
 */
const request = require('supertest');
const app = require('../server');

// =====================
// HEALTH CHECK
// =====================

describe('Health Check', () => {
  it('GET /api/health returns healthy status with all metadata', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.version).toBe('3.0.0');
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.uptime).toBeDefined();
    expect(res.body.memoryUsage).toBeDefined();
    expect(res.body.cacheSize).toBeDefined();
    expect(res.body.services).toBeDefined();
    expect(Array.isArray(res.body.services)).toBe(true);
    expect(res.body.services.length).toBeGreaterThanOrEqual(10);
  });
});

// =====================
// CONFIG
// =====================

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

  it('GET /api/config sets cache-control header', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key-123';
    const res = await request(app).get('/api/config');
    expect(res.headers['cache-control']).toContain('max-age=300');
  });
});

// =====================
// TRIPS CRUD
// =====================

describe('Trips CRUD', () => {
  let tripId;

  it('POST /api/trips creates a trip with all fields', async () => {
    const res = await request(app).post('/api/trips').send({
      name: 'Test Trip', origin: 'New York', destination: 'Boston',
      waypoints: ['Philadelphia'], preferences: { travelMode: 'DRIVING' },
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Trip');
    expect(res.body.id).toBeDefined();
    expect(res.body.createdAt).toBeDefined();
    expect(res.body.waypoints).toEqual(['Philadelphia']);
    tripId = res.body.id;
  });

  it('POST /api/trips validates required fields', async () => {
    const res = await request(app).post('/api/trips').send({ name: 'Bad Trip' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('required');
  });

  it('POST /api/trips sanitizes input length', async () => {
    const longName = 'A'.repeat(200);
    const res = await request(app).post('/api/trips').send({
      name: longName, origin: 'NYC', destination: 'LA',
    });
    expect(res.status).toBe(201);
    expect(res.body.name.length).toBeLessThanOrEqual(100);
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
    expect(res.body.waypoints).toEqual(['Philadelphia']);
  });

  it('GET /api/trips/:id returns 404 for missing trip', async () => {
    const res = await request(app).get('/api/trips/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
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

// =====================
// GOOGLE MAPS API PROXIES — VALIDATION
// =====================

describe('Google Maps API Proxies — Validation', () => {
  it('GET /api/geocode requires address param', async () => {
    const res = await request(app).get('/api/geocode');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('address');
  });

  it('GET /api/reverse-geocode requires lat and lng', async () => {
    const res = await request(app).get('/api/reverse-geocode');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('lat');
  });

  it('GET /api/reverse-geocode requires lng param', async () => {
    const res = await request(app).get('/api/reverse-geocode?lat=40.7');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('lng');
  });

  it('GET /api/distance-matrix requires origins and destinations', async () => {
    const res = await request(app).get('/api/distance-matrix');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('origins');
  });

  it('GET /api/distance-matrix requires destinations param', async () => {
    const res = await request(app).get('/api/distance-matrix?origins=NYC');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('destinations');
  });

  it('GET /api/places-nearby requires lat and lng', async () => {
    const res = await request(app).get('/api/places-nearby');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('lat');
  });

  it('GET /api/elevation requires locations param', async () => {
    const res = await request(app).get('/api/elevation');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('locations');
  });
});

// =====================
// TIMEZONE API — VALIDATION
// =====================

describe('Timezone API — Validation', () => {
  it('GET /api/timezone requires lat and lng', async () => {
    const res = await request(app).get('/api/timezone');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('lat');
  });

  it('GET /api/timezone requires lng param', async () => {
    const res = await request(app).get('/api/timezone?lat=40.7');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('lng');
  });
});

// =====================
// STATIC MAPS API — VALIDATION
// =====================

describe('Static Maps API — Validation', () => {
  it('GET /api/static-map requires center param', async () => {
    const res = await request(app).get('/api/static-map');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('center');
  });

  it('GET /api/static-map returns URL with valid params', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key-123';
    const res = await request(app).get('/api/static-map?center=New+York');
    expect(res.status).toBe(200);
    expect(res.body.url).toBeDefined();
    expect(res.body.url).toContain('staticmap');
  });
});

// =====================
// TRANSLATION API — VALIDATION
// =====================

describe('Translation API — Validation', () => {
  it('POST /api/translate requires text and target', async () => {
    const res = await request(app).post('/api/translate').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('text');
  });

  it('POST /api/translate requires target language', async () => {
    const res = await request(app).post('/api/translate').send({ text: 'hello' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('target');
  });

  it('GET /api/translate/languages returns error without API key', async () => {
    const original = process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    const res = await request(app).get('/api/translate/languages');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('API key');
    process.env.GOOGLE_MAPS_API_KEY = original;
  });
});

// =====================
// SECURITY HEADERS
// =====================

describe('Security Headers', () => {
  it('Responses include CSP header', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('Responses include X-Content-Type-Options', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('Rate limit headers are present', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });
});
