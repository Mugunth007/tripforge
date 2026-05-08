/**
 * Travel Planning & Experience Engine - Server
 * 
 * A lightweight Express server that proxies Google Maps API requests
 * to keep the API key secure on the server side.
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
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [new transports.Console()],
});

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

// Rate limiting - 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// --- Static Files ---
app.use(express.static(path.join(__dirname, 'frontend/dist')));

// --- API Routes ---

/**
 * GET /api/config
 * Returns the Maps API key to the client.
 * In production, restrict the API key in Google Cloud Console to specific referrers.
 */
app.get('/api/config', (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
    logger.warn('Google Maps API key is not configured');
    return res.status(500).json({ error: 'Google Maps API key not configured' });
  }
  res.json({ mapsApiKey: apiKey });
});

/**
 * GET /api/health
 * Health check endpoint for Cloud Run.
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// --- In-Memory Trip Storage ---
const trips = new Map();

/**
 * POST /api/trips
 * Save a trip plan.
 */
app.post('/api/trips', (req, res) => {
  const { name, origin, destination, waypoints, preferences } = req.body;
  if (!name || !origin || !destination) {
    return res.status(400).json({ error: 'name, origin, and destination are required' });
  }
  const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
  const trip = { id, name, origin, destination, waypoints: waypoints || [], preferences: preferences || {}, createdAt: new Date().toISOString() };
  trips.set(id, trip);
  logger.info(`Trip created: ${id}`);
  res.status(201).json(trip);
});

/**
 * GET /api/trips
 * List all saved trips.
 */
app.get('/api/trips', (req, res) => {
  res.json(Array.from(trips.values()));
});

/**
 * GET /api/trips/:id
 * Get a specific trip.
 */
app.get('/api/trips/:id', (req, res) => {
  const trip = trips.get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  res.json(trip);
});

/**
 * DELETE /api/trips/:id
 * Delete a trip.
 */
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

// --- Error handler ---
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
