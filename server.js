/**
 * @fileoverview Travel Planning & Experience Engine - Server
 * @description Express server integrating Google Maps, Gemini AI, Translation,
 * and providing trip CRUD with caching, security, and structured logging.
 * @version 2.0.0
 */
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const { createLogger, format, transports } = require('winston');

const app = express();
const PORT = process.env.PORT || 8080;

// =====================
// LOGGER
// =====================
const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

// =====================
// CACHE LAYER
// =====================
/** @type {Map<string, {data: object, timestamp: number}>} */
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Retrieves cached data if within TTL.
 * @param {string} key - Cache key
 * @returns {object|null} Cached data or null if expired/missing
 */
function getFromCache(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) return entry.data;
  cache.delete(key);
  return null;
}

/**
 * Stores data in cache with automatic eviction at 500 entries.
 * @param {string} key - Cache key
 * @param {object} data - Data to store
 */
function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
}

// =====================
// SECURITY MIDDLEWARE
// =====================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://maps.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://*.googleapis.com", "https://*.gstatic.com", "https://*.ggpht.com", "https://*.google.com"],
      connectSrc: ["'self'", "https://maps.googleapis.com"],
      frameSrc: ["'self'", "https://www.google.com"],
    },
  },
}));
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10kb' }));

// =====================
// RATE LIMITING
// =====================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', apiLimiter);

// =====================
// STATIC FILES
// =====================
app.use(express.static(path.join(__dirname, 'frontend/dist'), {
  maxAge: '1d',
  etag: true,
  lastModified: true,
}));

// =====================
// HELPERS
// =====================

/**
 * Returns the Google API key or null if not configured.
 * @returns {string|null}
 */
function getApiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || key === 'YOUR_API_KEY_HERE') return null;
  return key;
}

/**
 * Sanitizes user input by trimming and limiting length.
 * @param {string} input - Raw user input
 * @param {number} [maxLen=500] - Maximum allowed length
 * @returns {string} Sanitized string
 */
function sanitize(input, maxLen = 500) {
  if (typeof input !== 'string') return '';
  return input.trim().substring(0, maxLen);
}

// =====================
// CONFIG & HEALTH
// =====================

/** GET /api/config - Returns Maps API key for client-side SDK. */
app.get('/api/config', (req, res) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    logger.warn('Google Maps API key is not configured');
    return res.status(500).json({ error: 'Google Maps API key not configured' });
  }
  res.set('Cache-Control', 'private, max-age=300');
  res.json({ mapsApiKey: apiKey });
});

/** GET /api/health - Health check for Cloud Run. */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage().rss,
    cacheSize: cache.size,
  });
});

// =====================
// GOOGLE MAPS PROXIES
// =====================

/** GET /api/geocode?address=... - Google Geocoding API proxy. */
app.get('/api/geocode', async (req, res) => {
  const address = sanitize(req.query.address);
  if (!address) return res.status(400).json({ error: 'address query param required' });
  const apiKey = getApiKey();
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const cacheKey = `geocode:${address.toLowerCase()}`;
  const cached = getFromCache(cacheKey);
  if (cached) { logger.info(`Cache hit: geocode`); return res.json(cached); }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const data = await (await fetch(url)).json();
    setCache(cacheKey, data);
    res.set('Cache-Control', 'private, max-age=300');
    res.json(data);
  } catch (err) {
    logger.error('Geocoding error', { error: err.message });
    res.status(500).json({ error: 'Geocoding request failed' });
  }
});

/** GET /api/distance-matrix?origins=...&destinations=...&mode=... */
app.get('/api/distance-matrix', async (req, res) => {
  const origins = sanitize(req.query.origins);
  const destinations = sanitize(req.query.destinations);
  if (!origins || !destinations) return res.status(400).json({ error: 'origins and destinations query params required' });
  const apiKey = getApiKey();
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const mode = sanitize(req.query.mode || 'driving', 20);
  const cacheKey = `dm:${origins}|${destinations}|${mode}`;
  const cached = getFromCache(cacheKey);
  if (cached) { logger.info('Cache hit: distance-matrix'); return res.json(cached); }

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(destinations)}&mode=${mode}&key=${apiKey}`;
    const data = await (await fetch(url)).json();
    setCache(cacheKey, data);
    res.set('Cache-Control', 'private, max-age=300');
    res.json(data);
  } catch (err) {
    logger.error('Distance Matrix error', { error: err.message });
    res.status(500).json({ error: 'Distance Matrix request failed' });
  }
});

/** GET /api/places-nearby?lat=...&lng=...&type=...&radius=... */
app.get('/api/places-nearby', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng query params required' });
  const apiKey = getApiKey();
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const type = sanitize(req.query.type || 'tourist_attraction', 50);
  const radius = sanitize(req.query.radius || '5000', 10);
  const cacheKey = `places:${lat},${lng}|${type}|${radius}`;
  const cached = getFromCache(cacheKey);
  if (cached) { logger.info('Cache hit: places-nearby'); return res.json(cached); }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${apiKey}`;
    const data = await (await fetch(url)).json();
    setCache(cacheKey, data);
    res.set('Cache-Control', 'private, max-age=300');
    res.json(data);
  } catch (err) {
    logger.error('Places Nearby error', { error: err.message });
    res.status(500).json({ error: 'Places Nearby request failed' });
  }
});

/** GET /api/elevation?locations=lat,lng|lat,lng */
app.get('/api/elevation', async (req, res) => {
  const locations = sanitize(req.query.locations);
  if (!locations) return res.status(400).json({ error: 'locations query param required' });
  const apiKey = getApiKey();
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const cacheKey = `elev:${locations}`;
  const cached = getFromCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const url = `https://maps.googleapis.com/maps/api/elevation/json?locations=${encodeURIComponent(locations)}&key=${apiKey}`;
    const data = await (await fetch(url)).json();
    setCache(cacheKey, data);
    res.set('Cache-Control', 'private, max-age=300');
    res.json(data);
  } catch (err) {
    logger.error('Elevation error', { error: err.message });
    res.status(500).json({ error: 'Elevation request failed' });
  }
});

// =====================
// GOOGLE GEMINI AI
// =====================

/**
 * POST /api/ai/chat
 * Proxies to Google Gemini API for AI-powered travel planning assistance.
 * @body {string} message - User's message
 * @body {Array} history - Chat history for context
 */
app.post('/api/ai/chat', async (req, res) => {
  const message = sanitize(req.body.message, 1000);
  if (!message) return res.status(400).json({ error: 'message is required' });
  const apiKey = getApiKey();
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const history = Array.isArray(req.body.history) ? req.body.history.slice(-10) : [];

  const systemPrompt = `You are TripForge AI, a helpful travel planning assistant. You help users plan trips, suggest destinations, recommend activities, provide travel tips, packing lists, budget estimates, and safety advice. Keep responses concise (under 200 words), friendly, and practical. Use emojis sparingly for warmth.`;

  const contents = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'Understood! I\'m TripForge AI, your travel planning assistant. How can I help you plan your next adventure?' }] },
    ...history.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: sanitize(h.text, 500) }] })),
    { role: 'user', parts: [{ text: message }] },
  ];

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 500, temperature: 0.7 } }),
    });
    const data = await response.json();

    if (data.error) {
      logger.error('Gemini API error', { error: data.error.message });
      return res.status(502).json({ error: 'AI service error: ' + data.error.message });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response.';
    logger.info('Gemini AI response generated');
    res.json({ reply });
  } catch (err) {
    logger.error('Gemini AI error', { error: err.message });
    res.status(500).json({ error: 'AI chat request failed' });
  }
});

// =====================
// GOOGLE CLOUD TRANSLATION
// =====================

/**
 * POST /api/translate
 * Proxies to Google Cloud Translation API.
 * @body {string} text - Text to translate
 * @body {string} target - Target language code (e.g., 'es', 'fr', 'ja')
 * @body {string} [source] - Source language code (auto-detected if omitted)
 */
app.post('/api/translate', async (req, res) => {
  const text = sanitize(req.body.text, 1000);
  const target = sanitize(req.body.target, 10);
  if (!text || !target) return res.status(400).json({ error: 'text and target language are required' });
  const apiKey = getApiKey();
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const cacheKey = `translate:${target}:${text.substring(0, 100)}`;
  const cached = getFromCache(cacheKey);
  if (cached) { logger.info('Cache hit: translate'); return res.json(cached); }

  try {
    const source = sanitize(req.body.source || '', 10);
    let url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
    const body = { q: text, target };
    if (source) body.source = source;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();

    if (data.error) {
      logger.error('Translation API error', { error: data.error.message });
      return res.status(502).json({ error: 'Translation error: ' + data.error.message });
    }

    const result = {
      translatedText: data.data?.translations?.[0]?.translatedText || '',
      detectedSourceLanguage: data.data?.translations?.[0]?.detectedSourceLanguage || '',
    };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    logger.error('Translation error', { error: err.message });
    res.status(500).json({ error: 'Translation request failed' });
  }
});

/** GET /api/translate/languages - List supported languages. */
app.get('/api/translate/languages', async (req, res) => {
  const apiKey = getApiKey();
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const cached = getFromCache('languages');
  if (cached) return res.json(cached);

  try {
    const url = `https://translation.googleapis.com/language/translate/v2/languages?key=${apiKey}&target=en`;
    const data = await (await fetch(url)).json();
    const languages = data.data?.languages || [];
    setCache('languages', languages);
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(languages);
  } catch (err) {
    logger.error('Languages list error', { error: err.message });
    res.status(500).json({ error: 'Could not fetch languages' });
  }
});

// =====================
// TRIP CRUD
// =====================
/** @type {Map<string, object>} In-memory trip storage */
const trips = new Map();

/** POST /api/trips - Create a new trip. */
app.post('/api/trips', (req, res) => {
  const name = sanitize(req.body.name, 100);
  const origin = sanitize(req.body.origin, 200);
  const destination = sanitize(req.body.destination, 200);
  if (!name || !origin || !destination) {
    return res.status(400).json({ error: 'name, origin, and destination are required' });
  }
  const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
  const trip = {
    id, name, origin, destination,
    waypoints: Array.isArray(req.body.waypoints) ? req.body.waypoints.map(w => sanitize(w, 200)) : [],
    preferences: req.body.preferences || {},
    createdAt: new Date().toISOString(),
  };
  trips.set(id, trip);
  logger.info(`Trip created: ${id}`);
  res.status(201).json(trip);
});

/** GET /api/trips - List all trips. */
app.get('/api/trips', (req, res) => res.json(Array.from(trips.values())));

/** GET /api/trips/:id - Get a specific trip. */
app.get('/api/trips/:id', (req, res) => {
  const trip = trips.get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  res.json(trip);
});

/** DELETE /api/trips/:id - Delete a trip. */
app.delete('/api/trips/:id', (req, res) => {
  if (!trips.has(req.params.id)) return res.status(404).json({ error: 'Trip not found' });
  trips.delete(req.params.id);
  logger.info(`Trip deleted: ${req.params.id}`);
  res.status(204).send();
});

// =====================
// SPA FALLBACK & ERROR HANDLING
// =====================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist', 'index.html'));
});

/** Global error handler. */
app.use((err, req, res, _next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// =====================
// START SERVER
// =====================
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => logger.info(`TripForge running on port ${PORT}`));
}

module.exports = app;
