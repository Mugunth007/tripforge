/**
 * @fileoverview Utility functions for formatting and data transformation.
 * @module utils/formatters
 */

/**
 * Formats a duration in seconds to a human-readable string.
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted string (e.g., "2h 30m" or "45 min")
 * @example
 * formatDuration(7200) // "2h 0m"
 * formatDuration(2700) // "45 min"
 */
export function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

/**
 * Formats a distance in meters to a human-readable string.
 * @param {number} meters - Distance in meters
 * @returns {string} Formatted string (e.g., "123.4 km")
 */
export function formatDistance(meters) {
  return (meters / 1000).toFixed(1) + ' km';
}

/**
 * Calculates the total distance from an array of route legs.
 * @param {Array<{distance: {value: number}}>} legs - Route legs from Directions API
 * @returns {number} Total distance in meters
 */
export function sumLegDistance(legs) {
  return legs.reduce((sum, leg) => sum + leg.distance.value, 0);
}

/**
 * Calculates the total duration from an array of route legs.
 * @param {Array<{duration: {value: number}}>} legs - Route legs from Directions API
 * @returns {number} Total duration in seconds
 */
export function sumLegDuration(legs) {
  return legs.reduce((sum, leg) => sum + leg.duration.value, 0);
}
