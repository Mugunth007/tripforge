/**
 * Travel Planning & Experience Engine - Server
 *
 * Express server with Google Maps API proxies (Geocoding, Distance Matrix,
 * Places Nearby), trip CRUD, caching, security, and structured logging.
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

// --- Logger Setup ---
const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

// --- Simple In-Memory Cache ---
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Returns cached data if still valid, otherwise null.
 * @param {string} key - Cache key
 * @returns {object|null} Cached data or null
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
 * Stores data in the cache.
 * @param {string} key - Cache key
 * @param {object} data - Data to cache
 */
function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
  // Evict oldest entries if cache grows too large
  if (cache.size > 500) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

// --- Security Middleware ---
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
app.use(express.json());

// --- Rate Limiting ---
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', apiLimiter);

// --- Static Files with Cache Headers ---
app.use(express.static(path.join(__dirname, 'frontend/dist'), {
  maxAge: '1d',
  etag: true,
  lastModified: true,
}));

// --- Helper: Get API Key ---
function getApiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || key === 'YOUR_API_KEY_HERE') return null;
  return key;
}

// =====================
// API ROUTES
// =====================

/**
 * GET /api/config
 * Returns the Maps API key to the client.
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
 * Health check endpoint for Cloud Run.
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage().rss,
  });
});

// =====================
// GOOGLE SERVICES PROXIES
// =====================

/**
 * GET /api/geocode?address=...
 * Proxy for Google Geocoding API. Converts address to lat/lng.
 */
app.get('/api/geocode', async (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: 'address query param required' });

  const apiKey = getApiKey();
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const cacheKey = `geocode:${address.toLowerCase().trim()}`;
  const cached = getFromCache(cacheKey);
  if (cached) {
    logger.info(`Cache hit: geocode for "${address}"`);
    return res.json(cached);
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    setCache(cacheKey, data);
    res.set('Cache-Control', 'private, max-age=300');
    res.json(data);
  } catch (err) {
    logger.error('Geocoding error', { error: err.message });
    res.status(500).json({ error: 'Geocoding request failed' });
  }
});

/**
 * GET /api/distance-matrix?origins=...&destinations=...&mode=...
 * Proxy for Google Distance Matrix API.
 */
app.get('/api/distance-matrix', async (req, res) => {
  const { origins, destinations, mode } = req.query;
  if (!origins || !destinations) {
    return res.status(400).json({ error: 'origins and destinations query params required' });
  }

  const apiKey = getApiKey();
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const travelMode = mode || 'driving';
  const cacheKey = `dm:${origins}|${destinations}|${travelMode}`;
  const cached = getFromCache(cacheKey);
  if (cached) {
    logger.info('Cache hit: distance-matrix');
    return res.json(cached);
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(destinations)}&mode=${travelMode}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    setCache(cacheKey, data);
    res.set('Cache-Control', 'private, max-age=300');
    res.json(data);
  } catch (err) {
    logger.error('Distance Matrix error', { error: err.message });
    res.status(500).json({ error: 'Distance Matrix request failed' });
  }
});

/**
 * GET /api/places-nearby?lat=...&lng=...&type=...&radius=...
 * Proxy for Google Places Nearby Search API.
 */
app.get('/api/places-nearby', async (req, res) => {
  const { lat, lng, type, radius } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng query params required' });
  }

  const apiKey = getApiKey();
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const searchType = type || 'tourist_attraction';
  const searchRadius = radius || '5000';
  const cacheKey = `places:${lat},${lng}|${searchType}|${searchRadius}`;
  const cached = getFromCache(cacheKey);
  if (cached) {
    logger.info('Cache hit: places-nearby');
    return res.json(cached);
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${searchRadius}&type=${searchType}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    setCache(cacheKey, data);
    res.set('Cache-Control', 'private, max-age=300');
    res.json(data);
  } catch (err) {
    logger.error('Places Nearby error', { error: err.message });
    res.status(500).json({ error: 'Places Nearby request failed' });
  }
});

/**
 * GET /api/elevation?locations=lat,lng|lat,lng
 * Proxy for Google Elevation API.
 */
app.get('/api/elevation', async (req, res) => {
  const { locations } = req.query;
  if (!locations) return res.status(400).json({ error: 'locations query param required' });

  const apiKey = getApiKey();
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const cacheKey = `elev:${locations}`;
  const cached = getFromCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const url = `https://maps.googleapis.com/maps/api/elevation/json?locations=${encodeURIComponent(locations)}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    setCache(cacheKey, data);
    res.set('Cache-Control', 'private, max-age=300');
    res.json(data);
  } catch (err) {
    logger.error('Elevation API error', { error: err.message });
    res.status(500).json({ error: 'Elevation request failed' });
  }
});

// =====================
// TRIP CRUD
// =====================
const trips = new Map();

/**
 * POST /api/trips - Create a trip.
 */
app.post('/api/trips', (req, res) => {
  const { name, origin, destination, waypoints, preferences } = req.body;
  if (!name || !origin || !destination) {
    return res.status(400).json({ error: 'name, origin, and destination are required' });
  }
  const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
  const trip = {
    id,
    name,
    origin,
    destination,
    waypoints: waypoints || [],
    preferences: preferences || {},
    createdAt: new Date().toISOString(),
  };
  trips.set(id, trip);
  logger.info(`Trip created: ${id}`);
  res.status(201).json(trip);
});

/** GET /api/trips - List all trips. */
app.get('/api/trips', (req, res) => {
  res.json(Array.from(trips.values()));
});

/** GET /api/trips/:id - Get a trip. */
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

// --- Fallback to SPA ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist', 'index.html'));
});

// --- Global Error Handler ---
app.use((err, req, res, _next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// --- Start Server ---
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`Travel Planner running on port ${PORT}`);
  });
}

module.exports = app;
