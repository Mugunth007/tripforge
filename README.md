# TripForge — Travel Planning & Experience Engine

A dynamic travel planning application built with **Node.js**, **React**, and **Google Maps Platform**.

## Features

- 🗺 **Interactive Route Planning** with Google Maps Directions API
- 📍 **Place Autocomplete** for origin, destination, and waypoints
- 🚗 **Multi-modal Travel** — Driving, Walking, Bicycling, Transit
- ⚙️ **Preferences** — Avoid tolls, avoid highways, optimized waypoints
- 💾 **Save & Load Trips** via REST API
- 🎨 **Premium Dark UI** with responsive layout
- 🔒 **Secure** — Helmet, rate limiting, CORS, non-root Docker
- ✅ **Tested** — Jest + Supertest API tests

## Quick Start

```bash
npm install
echo "GOOGLE_MAPS_API_KEY=your-key-here" > .env
npm start
```

Visit `http://localhost:8080`

## Deploy to Cloud Run

```bash
gcloud run deploy tripforge --source . --region us-west1 --allow-unauthenticated \
  --set-env-vars GOOGLE_MAPS_API_KEY=your-key-here
```

## Tests

```bash
npm test
```

## Tech Stack

- **Backend**: Node.js, Express, Helmet, Winston
- **Frontend**: React 18 (CDN), Google Maps JavaScript API
- **Deployment**: Docker, Google Cloud Run
