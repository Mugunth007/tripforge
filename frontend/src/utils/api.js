/**
 * @fileoverview API service layer for TripForge.
 * Provides typed, documented fetch wrappers for all backend endpoints.
 * @module utils/api
 */

/**
 * Fetches the Maps API key configuration from the backend.
 * @returns {Promise<{mapsApiKey: string}>} API configuration
 * @throws {Error} If the request fails
 */
export async function fetchConfig() {
  const res = await fetch('/api/config');
  return res.json();
}

/**
 * Fetches all saved trips from the backend.
 * @returns {Promise<Array<import('./constants').Trip>>} Array of trip objects
 */
export async function fetchTrips() {
  const res = await fetch('/api/trips');
  return res.json();
}

/**
 * Creates a new trip on the backend.
 * @param {Object} tripData - Trip creation payload
 * @param {string} tripData.name - Trip name
 * @param {string} tripData.origin - Origin location
 * @param {string} tripData.destination - Destination location
 * @param {string[]} [tripData.waypoints] - Intermediate stops
 * @param {Object} [tripData.preferences] - Travel preferences
 * @returns {Promise<Object>} The created trip object
 */
export async function createTrip(tripData) {
  const res = await fetch('/api/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tripData),
  });
  return res.json();
}

/**
 * Deletes a trip by ID.
 * @param {string} id - Trip ID to delete
 * @returns {Promise<Response>} Fetch response (204 on success)
 */
export async function deleteTrip(id) {
  return fetch(`/api/trips/${id}`, { method: 'DELETE' });
}

/**
 * Fetches distance matrix data between origin and destination.
 * @param {string} origins - Origin location
 * @param {string} destinations - Destination location
 * @param {string} mode - Travel mode (driving, walking, etc.)
 * @returns {Promise<Object>} Distance Matrix API response
 */
export async function fetchDistanceMatrix(origins, destinations, mode) {
  const res = await fetch(
    `/api/distance-matrix?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(destinations)}&mode=${mode.toLowerCase()}`
  );
  return res.json();
}

/**
 * Fetches elevation data for given coordinates.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<Object>} Elevation API response
 */
export async function fetchElevation(lat, lng) {
  const res = await fetch(`/api/elevation?locations=${lat},${lng}`);
  return res.json();
}

/**
 * Fetches timezone data for given coordinates.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<Object>} Timezone API response
 */
export async function fetchTimezone(lat, lng) {
  const res = await fetch(`/api/timezone?lat=${lat}&lng=${lng}`);
  return res.json();
}

/**
 * Geocodes an address to coordinates.
 * @param {string} address - Address to geocode
 * @returns {Promise<Object>} Geocoding API response
 */
export async function fetchGeocode(address) {
  const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
  return res.json();
}

/**
 * Fetches nearby places for given coordinates.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} type - Place type filter
 * @param {number} [radius=5000] - Search radius in meters
 * @returns {Promise<Object>} Places Nearby API response
 */
export async function fetchNearbyPlaces(lat, lng, type, radius = 5000) {
  const res = await fetch(`/api/places-nearby?lat=${lat}&lng=${lng}&type=${type}&radius=${radius}`);
  return res.json();
}

/**
 * Translates text to a target language.
 * @param {string} text - Text to translate
 * @param {string} target - Target language code
 * @returns {Promise<{translatedText: string, detectedSourceLanguage: string}>}
 */
export async function translateText(text, target) {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, target }),
  });
  return res.json();
}

/**
 * Generates a static map URL for a given location.
 * @param {string} center - Center location (address or lat,lng)
 * @param {string} [markers] - Marker locations
 * @returns {Promise<{url: string}>} Object containing the static map URL
 */
export async function fetchStaticMap(center, markers) {
  let url = `/api/static-map?center=${encodeURIComponent(center)}`;
  if (markers) url += `&markers=${encodeURIComponent(markers)}`;
  const res = await fetch(url);
  return res.json();
}
