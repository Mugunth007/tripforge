/**
 * @fileoverview TripForge v3 — Travel Planning & Experience Engine
 * @description Express server integrating 10+ Google Cloud services with
 * server-side caching, security hardening, and structured logging.
 * @version 3.0.0
 * @author TripForge Team
 * @module server
 */
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const { createLogger, format, transports } = require('winston');

/** @type {import('express').Express} Express application instance */
const app = express();

// =====================
// CONSTANTS
// =====================

/** @constant {number} PORT - Server port, defaults to 8080 for Cloud Run */
const PORT = process.env.PORT || 8080;

/** @constant {number} CACHE_TTL_MS - Cache time-to-live in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** @constant {number} MAX_CACHE_SIZE - Maximum number of entries in the cache */
const MAX_CACHE_SIZE = 500;

/** @constant {number} RATE_LIMIT_WINDOW_MS - Rate limiting window (15 minutes) */
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** @constant {number} RATE_LIMIT_MAX - Maximum requests per window */
const RATE_LIMIT_MAX = 200;

/** @constant {number} MAX_INPUT_LENGTH - Default maximum input string length */
const MAX_INPUT_LENGTH = 500;

/** @constant {string} GOOGLE_MAPS_BASE_URL - Base URL for Google Maps APIs */
const GOOGLE_MAPS_BASE_URL = 'https://maps.googleapis.com/maps/api';

/** @constant {string} GOOGLE_TRANSLATE_BASE_URL - Base URL for Google Translation API */
const GOOGLE_TRANSLATE_BASE_URL = 'https://translation.googleapis.com/language/translate/v2';

// =====================
// LOGGER
// =====================

/**
 * Structured logger instance using Winston.
 * Outputs JSON-formatted logs with timestamps.
 * @type {import('winston').Logger}
 */
const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

// =====================
// CACHE LAYER
// =====================

/**
 * @typedef {Object} CacheEntry
 * @property {Object} data - The cached response data
 * @property {number} timestamp - Unix timestamp when the entry was created
 */

/** @type {Map<string, CacheEntry>} In-memory cache store */
const cache = new Map();

/**
 * Retrieves cached data if the entry exists and hasn't expired.
 * Automatically deletes stale entries on access.
 * @param {string} key - The cache key to look up
 * @returns {Object|null} The cached data, or null if expired/missing
 */
function getFromCache(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

/**
 * Stores data in the cache with automatic eviction when the cache
 * exceeds MAX_CACHE_SIZE entries (LRU-style oldest-first eviction).
 * @param {string} key - The cache key
 * @param {Object} data - The data to cache
 * @returns {void}
 */
function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
  if (cache.size > MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

// =====================
// SECURITY MIDDLEWARE
// =====================

/**
 * Helmet CSP configuration allowing Google Maps, Fonts, and Translation APIs.
 * Protects against XSS, clickjacking, and content injection attacks.
 */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://maps.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://*.googleapis.com", "https://*.gstatic.com", "https://*.ggpht.com", "https://*.google.com"],
      connectSrc: ["'self'", "https://maps.googleapis.com", "https://translation.googleapis.com"],
      frameSrc: ["'self'", "https://www.google.com"],
    },
  },
}));

/** Enable CORS for all origins */
app.use(cors());

/** Enable gzip/brotli compression for all responses */
app.use(compression());

/** Parse JSON request bodies with a 10KB limit to prevent payload attacks */
app.use(express.json({ limit: '10kb' }));

// =====================
// RATE LIMITING
// =====================

/**
 * API rate limiter — 200 requests per 15-minute window.
 * Returns standard rate limit headers (RateLimit-*).
 */
const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', apiLimiter);

// =====================
// STATIC FILES
// =====================

/**
 * Serve the Vite-built frontend from frontend/dist.
 * Assets are cached for 1 day with ETags for efficient revalidation.
 */
app.use(express.static(path.join(__dirname, 'frontend/dist'), {
  maxAge: '1d',
  etag: true,
  lastModified: true,
}));

// =====================
// HELPERS
// =====================

/**
 * Returns the Google API key from environment variables.
 * Returns null if the key is missing or is the placeholder value.
 * @returns {string|null} The API key or null
 */
function getApiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || key === 'YOUR_API_KEY_HERE') return null;
  return key;
}

/**
 * Sanitizes user input by trimming whitespace and limiting string length.
 * Returns an empty string for non-string inputs.
 * @param {*} input - Raw user input (any type)
 * @param {number} [maxLen=MAX_INPUT_LENGTH] - Maximum allowed length
 * @returns {string} The sanitized string
 */
function sanitize(input, maxLen = MAX_INPUT_LENGTH) {
  if (typeof input !== 'string') return '';
  return input.trim().substring(0, maxLen);
}

/**
 * Validates that all required query parameters are present.
 * Sends a 400 response if any are missing.
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {string[]} params - Array of required query parameter names
 * @returns {boolean} True if all params are present, false if response was sent
 */
function validateQueryParams(req, res, params) {
  const missing = params.filter(p => !req.query[p]);
  if (missing.length > 0) {
    res.status(400).json({ error: `${missing.join(' and ')} query param(s) required` });
    return false;
  }
  return true;
}

/**
 * Validates that all required body fields are present.
 * Sends a 400 response if any are missing.
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {string[]} fields - Array of required body field names
 * @returns {boolean} True if all fields are present, false if response was sent
 */
function validateBodyFields(req, res, fields) {
  const missing = fields.filter(f => !sanitize(req.body[f]));
  if (missing.length > 0) {
    res.status(400).json({ error: `${missing.join(' and ')} are required` });
    return false;
  }
  return true;
}

/**
 * Checks that the Google API key is configured. Sends 500 if not.
 * @param {import('express').Response} res - Express response object
 * @returns {string|null} The API key, or null if response was sent
 */
function requireApiKey(res) {
  const apiKey = getApiKey();
  if (!apiKey) {
    res.status(500).json({ error: 'API key not configured' });
    return null;
  }
  return apiKey;
}

/**
 * Generic Google API proxy handler. Fetches data from a Google API URL,
 * applies caching, and returns the JSON response.
 * @param {Object} options - Proxy configuration
 * @param {string} options.url - The full Google API URL
 * @param {string} options.cacheKey - The cache key for this request
 * @param {string} options.label - Human-readable label for logging
 * @param {import('express').Response} res - Express response object
 * @param {string} [options.cacheControl='private, max-age=300'] - Cache-Control header
 * @returns {Promise<void>}
 */
async function proxyGoogleApi({ url, cacheKey, label, res, cacheControl = 'private, max-age=300' }) {
  const cached = getFromCache(cacheKey);
  if (cached) {
    logger.info(`Cache hit: ${label}`);
    return res.json(cached);
  }

  try {
    const response = await fetch(url);
    const data = await response.json();
    setCache(cacheKey, data);
    res.set('Cache-Control', cacheControl);
    res.json(data);
  } catch (err) {
    logger.error(`${label} error`, { error: err.message });
    res.status(500).json({ error: `${label} request failed` });
  }
}

// =====================
// CONFIG & HEALTH
// =====================

/**
 * GET /api/config
 * Returns the Maps API key for the client-side Maps JavaScript SDK.
 * @route GET /api/config
 * @returns {Object} { mapsApiKey: string }
 */
app.get('/api/config', (req, res) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    logger.warn('Google Maps API key is not configured');
    return res.status(500).json({ error: 'Google Maps API key not configured' });
  }
  res.set('Cache-Control', 'private, max-age=300');
  res.json({ mapsApiKey: apiKey });
});

/**
 * GET /api/health
 * Health check endpoint for Cloud Run readiness/liveness probes.
 * @route GET /api/health
 * @returns {Object} { status, timestamp, uptime, memoryUsage, cacheSize, version, services }
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage().rss,
    cacheSize: cache.size,
    services: [
      'Maps JavaScript', 'Places Autocomplete', 'Directions',
      'Geocoding', 'Reverse Geocoding', 'Distance Matrix',
      'Places Nearby', 'Elevation', 'Timezone',
      'Static Maps', 'Cloud Translation',
    ],
  });
});

// =====================
// GOOGLE MAPS PROXIES
// =====================

/**
 * GET /api/geocode
 * Proxies to Google Geocoding API — converts addresses to coordinates.
 * @route GET /api/geocode
 * @queryparam {string} address - The address to geocode
 * @returns {Object} Google Geocoding API response
 */
app.get('/api/geocode', async (req, res) => {
  if (!validateQueryParams(req, res, ['address'])) return;
  const apiKey = requireApiKey(res);
  if (!apiKey) return;

  const address = sanitize(req.query.address);
  const cacheKey = `geocode:${address.toLowerCase()}`;
  const url = `${GOOGLE_MAPS_BASE_URL}/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  await proxyGoogleApi({ url, cacheKey, label: 'Geocoding', res });
});

/**
 * GET /api/reverse-geocode
 * Proxies to Google Reverse Geocoding API — converts coordinates to addresses.
 * @route GET /api/reverse-geocode
 * @queryparam {string} lat - Latitude
 * @queryparam {string} lng - Longitude
 * @returns {Object} Google Geocoding API response with address results
 */
app.get('/api/reverse-geocode', async (req, res) => {
  if (!validateQueryParams(req, res, ['lat', 'lng'])) return;
  const apiKey = requireApiKey(res);
  if (!apiKey) return;

  const { lat, lng } = req.query;
  const cacheKey = `revgeo:${lat},${lng}`;
  const url = `${GOOGLE_MAPS_BASE_URL}/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
  await proxyGoogleApi({ url, cacheKey, label: 'Reverse Geocoding', res });
});

/**
 * GET /api/distance-matrix
 * Proxies to Google Distance Matrix API — calculates travel distance and time.
 * @route GET /api/distance-matrix
 * @queryparam {string} origins - Origin location(s)
 * @queryparam {string} destinations - Destination location(s)
 * @queryparam {string} [mode=driving] - Travel mode
 * @returns {Object} Google Distance Matrix API response
 */
app.get('/api/distance-matrix', async (req, res) => {
  if (!validateQueryParams(req, res, ['origins', 'destinations'])) return;
  const apiKey = requireApiKey(res);
  if (!apiKey) return;

  const origins = sanitize(req.query.origins);
  const destinations = sanitize(req.query.destinations);
  const mode = sanitize(req.query.mode || 'driving', 20);
  const cacheKey = `dm:${origins}|${destinations}|${mode}`;
  const url = `${GOOGLE_MAPS_BASE_URL}/distancematrix/json?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(destinations)}&mode=${mode}&key=${apiKey}`;
  await proxyGoogleApi({ url, cacheKey, label: 'Distance Matrix', res });
});

/**
 * GET /api/places-nearby
 * Proxies to Google Places Nearby Search — finds places near a location.
 * @route GET /api/places-nearby
 * @queryparam {string} lat - Latitude
 * @queryparam {string} lng - Longitude
 * @queryparam {string} [type=tourist_attraction] - Place type filter
 * @queryparam {string} [radius=5000] - Search radius in meters
 * @returns {Object} Google Places API response
 */
app.get('/api/places-nearby', async (req, res) => {
  if (!validateQueryParams(req, res, ['lat', 'lng'])) return;
  const apiKey = requireApiKey(res);
  if (!apiKey) return;

  const { lat, lng } = req.query;
  const type = sanitize(req.query.type || 'tourist_attraction', 50);
  const radius = sanitize(req.query.radius || '5000', 10);
  const cacheKey = `places:${lat},${lng}|${type}|${radius}`;
  const url = `${GOOGLE_MAPS_BASE_URL}/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${apiKey}`;
  await proxyGoogleApi({ url, cacheKey, label: 'Places Nearby', res });
});

/**
 * GET /api/elevation
 * Proxies to Google Elevation API — returns elevation data for locations.
 * @route GET /api/elevation
 * @queryparam {string} locations - Pipe-separated lat,lng pairs
 * @returns {Object} Google Elevation API response
 */
app.get('/api/elevation', async (req, res) => {
  if (!validateQueryParams(req, res, ['locations'])) return;
  const apiKey = requireApiKey(res);
  if (!apiKey) return;

  const locations = sanitize(req.query.locations);
  const cacheKey = `elev:${locations}`;
  const url = `${GOOGLE_MAPS_BASE_URL}/elevation/json?locations=${encodeURIComponent(locations)}&key=${apiKey}`;
  await proxyGoogleApi({ url, cacheKey, label: 'Elevation', res });
});

/**
 * GET /api/timezone
 * Proxies to Google Timezone API — returns timezone data for a location.
 * @route GET /api/timezone
 * @queryparam {string} lat - Latitude
 * @queryparam {string} lng - Longitude
 * @queryparam {string} [timestamp] - Unix timestamp (defaults to now)
 * @returns {Object} Google Timezone API response with timeZoneId and timeZoneName
 */
app.get('/api/timezone', async (req, res) => {
  if (!validateQueryParams(req, res, ['lat', 'lng'])) return;
  const apiKey = requireApiKey(res);
  if (!apiKey) return;

  const { lat, lng } = req.query;
  const timestamp = req.query.timestamp || Math.floor(Date.now() / 1000);
  const cacheKey = `tz:${lat},${lng}`;
  const url = `${GOOGLE_MAPS_BASE_URL}/timezone/json?location=${lat},${lng}&timestamp=${timestamp}&key=${apiKey}`;
  await proxyGoogleApi({ url, cacheKey, label: 'Timezone', res });
});

/**
 * GET /api/static-map
 * Proxies to Google Static Maps API — generates a map image URL.
 * Returns the image URL rather than the image itself to allow client-side rendering.
 * @route GET /api/static-map
 * @queryparam {string} center - Center of the map (address or lat,lng)
 * @queryparam {string} [zoom=12] - Zoom level (1-20)
 * @queryparam {string} [size=400x300] - Image dimensions
 * @queryparam {string} [markers] - Optional marker locations
 * @returns {Object} { url: string } - The static map image URL
 */
app.get('/api/static-map', (req, res) => {
  if (!validateQueryParams(req, res, ['center'])) return;
  const apiKey = requireApiKey(res);
  if (!apiKey) return;

  const center = sanitize(req.query.center);
  const zoom = sanitize(req.query.zoom || '12', 5);
  const size = sanitize(req.query.size || '400x300', 15);
  const markers = req.query.markers ? sanitize(req.query.markers) : '';
  const mapStyle = '&style=feature:all|element:geometry|color:0x0b1120&style=feature:water|color:0x0e1a35&style=feature:road|color:0x253256';

  let url = `${GOOGLE_MAPS_BASE_URL}/staticmap?center=${encodeURIComponent(center)}&zoom=${zoom}&size=${size}&maptype=roadmap${mapStyle}&key=${apiKey}`;
  if (markers) {
    url += `&markers=color:0x6366f1|${encodeURIComponent(markers)}`;
  }

  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ url });
});

// =====================
// GOOGLE CLOUD TRANSLATION
// =====================

/**
 * POST /api/translate
 * Proxies to Google Cloud Translation API v2 — translates text between languages.
 * Supports auto-detection of source language when source is omitted.
 * @route POST /api/translate
 * @bodyparam {string} text - Text to translate (max 1000 chars)
 * @bodyparam {string} target - Target language code (e.g., 'es', 'fr', 'ja')
 * @bodyparam {string} [source] - Source language code (auto-detected if omitted)
 * @returns {Object} { translatedText: string, detectedSourceLanguage: string }
 */
app.post('/api/translate', async (req, res) => {
  const text = sanitize(req.body.text, 1000);
  const target = sanitize(req.body.target, 10);
  if (!text || !target) {
    return res.status(400).json({ error: 'text and target language are required' });
  }
  const apiKey = requireApiKey(res);
  if (!apiKey) return;

  const cacheKey = `translate:${target}:${text.substring(0, 100)}`;
  const cached = getFromCache(cacheKey);
  if (cached) {
    logger.info('Cache hit: translate');
    return res.json(cached);
  }

  try {
    const source = sanitize(req.body.source || '', 10);
    const url = `${GOOGLE_TRANSLATE_BASE_URL}?key=${apiKey}`;
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

/**
 * GET /api/translate/languages
 * Lists all supported languages for the Cloud Translation API.
 * Results are cached for 24 hours since language lists rarely change.
 * @route GET /api/translate/languages
 * @returns {Array<{language: string, name: string}>} Supported languages
 */
app.get('/api/translate/languages', async (req, res) => {
  const apiKey = requireApiKey(res);
  if (!apiKey) return;

  const cached = getFromCache('languages');
  if (cached) return res.json(cached);

  try {
    const url = `${GOOGLE_TRANSLATE_BASE_URL}/languages?key=${apiKey}&target=en`;
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

/**
 * @typedef {Object} Trip
 * @property {string} id - Unique trip identifier
 * @property {string} name - Trip name (max 100 chars)
 * @property {string} origin - Starting location
 * @property {string} destination - End location
 * @property {string[]} waypoints - Intermediate stops
 * @property {Object} preferences - Travel preferences (mode, avoid options)
 * @property {string} createdAt - ISO 8601 creation timestamp
 */

/** @type {Map<string, Trip>} In-memory trip storage */
const trips = new Map();

/**
 * Generates a unique trip ID using base-36 timestamp and random suffix.
 * @returns {string} A unique identifier string
 */
function generateTripId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

/**
 * POST /api/trips
 * Creates a new trip with validated and sanitized inputs.
 * @route POST /api/trips
 * @bodyparam {string} name - Trip name
 * @bodyparam {string} origin - Origin location
 * @bodyparam {string} destination - Destination location
 * @bodyparam {string[]} [waypoints] - Optional waypoints
 * @bodyparam {Object} [preferences] - Travel preferences
 * @returns {Trip} The created trip object (201)
 */
app.post('/api/trips', (req, res) => {
  const name = sanitize(req.body.name, 100);
  const origin = sanitize(req.body.origin, 200);
  const destination = sanitize(req.body.destination, 200);
  if (!name || !origin || !destination) {
    return res.status(400).json({ error: 'name, origin, and destination are required' });
  }
  const id = generateTripId();
  /** @type {Trip} */
  const trip = {
    id,
    name,
    origin,
    destination,
    waypoints: Array.isArray(req.body.waypoints)
      ? req.body.waypoints.map(w => sanitize(w, 200))
      : [],
    preferences: req.body.preferences || {},
    createdAt: new Date().toISOString(),
  };
  trips.set(id, trip);
  logger.info('Trip created', { tripId: id, name });
  res.status(201).json(trip);
});

/**
 * GET /api/trips
 * Lists all saved trips.
 * @route GET /api/trips
 * @returns {Trip[]} Array of all trip objects
 */
app.get('/api/trips', (req, res) => {
  res.json(Array.from(trips.values()));
});

/**
 * GET /api/trips/:id
 * Retrieves a specific trip by its unique ID.
 * @route GET /api/trips/:id
 * @param {string} id - Trip ID
 * @returns {Trip} The trip object (200) or 404
 */
app.get('/api/trips/:id', (req, res) => {
  const trip = trips.get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  res.json(trip);
});

/**
 * DELETE /api/trips/:id
 * Deletes a trip by its unique ID.
 * @route DELETE /api/trips/:id
 * @param {string} id - Trip ID
 * @returns {void} 204 on success, 404 if not found
 */
app.delete('/api/trips/:id', (req, res) => {
  if (!trips.has(req.params.id)) {
    return res.status(404).json({ error: 'Trip not found' });
  }
  trips.delete(req.params.id);
  logger.info('Trip deleted', { tripId: req.params.id });
  res.status(204).send();
});

// =====================
// SPA FALLBACK & ERROR HANDLING
// =====================

/**
 * SPA fallback — serves index.html for all non-API routes.
 * This allows client-side routing to work correctly.
 */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist', 'index.html'));
});

/**
 * Global error handler middleware.
 * Catches unhandled errors and returns a generic 500 response.
 * @param {Error} err - The error object
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} _next - Next middleware (unused)
 */
app.use((err, req, res, _next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// =====================
// START SERVER
// =====================

/** Start the server only when not running in test mode */
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => logger.info(`TripForge v3 running on port ${PORT}`));
}

module.exports = app;
