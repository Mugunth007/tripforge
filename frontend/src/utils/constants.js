/**
 * @fileoverview Application-wide constants for TripForge v3.
 * Centralizes configuration values to avoid magic strings and numbers.
 * @module utils/constants
 */

/** @constant {string} APP_NAME - Application display name */
export const APP_NAME = 'TripForge';

/** @constant {string} APP_VERSION - Current application version */
export const APP_VERSION = '3.0.0';

/**
 * Navigation tab definitions for the sidebar.
 * @constant {Array<{id: string, label: string}>}
 */
export const TABS = [
  { id: 'route', label: '🗺 Route' },
  { id: 'explore', label: '🔍 Explore' },
  { id: 'translate', label: '🌐 Translate' },
  { id: 'info', label: '⏰ Info' },
  { id: 'trips', label: '💾 Trips' },
];

/**
 * Place type categories for the Explore tab.
 * @constant {Array<{type: string, label: string}>}
 */
export const PLACE_TYPES = [
  { type: 'tourist_attraction', label: '🏛 Attractions' },
  { type: 'restaurant', label: '🍽 Restaurants' },
  { type: 'lodging', label: '🏨 Hotels' },
  { type: 'gas_station', label: '⛽ Gas' },
  { type: 'hospital', label: '🏥 Hospital' },
];

/**
 * Supported languages for the Translation tab.
 * @constant {Array<{code: string, name: string}>}
 */
export const LANGUAGES = [
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'it', name: 'Italian' },
  { code: 'ru', name: 'Russian' },
  { code: 'th', name: 'Thai' },
];

/**
 * Quick-access travel phrases for the Translation tab.
 * @constant {string[]}
 */
export const QUICK_PHRASES = [
  'Hello, how are you?',
  'Where is the bathroom?',
  'How much does this cost?',
  'Thank you very much!',
  'I need help, please.',
  'Where is the nearest hospital?',
];

/**
 * Available travel modes for the Directions service.
 * @constant {Array<{value: string, label: string}>}
 */
export const TRAVEL_MODES = [
  { value: 'DRIVING', label: '🚗 Driving' },
  { value: 'WALKING', label: '🚶 Walking' },
  { value: 'BICYCLING', label: '🚴 Bicycling' },
  { value: 'TRANSIT', label: '🚌 Transit' },
];

/**
 * Dark-themed map styles for the Accentricity design system.
 * @constant {Array<Object>}
 */
export const MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#0b1120' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#131a2e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#253256' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1a35' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

/**
 * Google Services integrated into TripForge.
 * Used for display in the header and health endpoint.
 * @constant {string[]}
 */
export const GOOGLE_SERVICES = [
  'Maps JavaScript',
  'Places Autocomplete',
  'Directions',
  'Geocoding',
  'Reverse Geocoding',
  'Distance Matrix',
  'Places Nearby',
  'Elevation',
  'Timezone',
  'Static Maps',
  'Cloud Translation',
];
