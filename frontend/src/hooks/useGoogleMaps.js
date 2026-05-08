/**
 * @fileoverview Custom hook for Google Maps SDK initialization.
 * Handles script loading, map instance creation, and Places Autocomplete setup.
 * @module hooks/useGoogleMaps
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { MAP_STYLES } from '../utils/constants';

/**
 * Custom hook that manages the Google Maps JavaScript SDK lifecycle.
 * Loads the script, initializes the map, sets up DirectionsRenderer,
 * and configures Places Autocomplete on origin/destination inputs.
 *
 * @param {string|null} apiKey - Google Maps API key
 * @param {function} onError - Callback invoked with an error message string
 * @returns {Object} Map state and controls
 * @returns {React.RefObject} return.mapRef - Ref to attach to the map container div
 * @returns {boolean} return.mapsLoaded - Whether the Maps SDK has finished loading
 * @returns {Object|null} return.mapInstance - The google.maps.Map instance
 * @returns {Object|null} return.directionsRenderer - The DirectionsRenderer instance
 * @returns {React.MutableRefObject<Array>} return.markersRef - Ref to the markers array
 * @returns {function} return.clearMarkers - Function to remove all markers from the map
 */
export function useGoogleMaps(apiKey, onError) {
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const directionsRenderer = useRef(null);
  const markersRef = useRef([]);

  // Load the Google Maps script
  useEffect(() => {
    if (!apiKey || mapsLoaded || document.getElementById('google-maps-script')) return;

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => setMapsLoaded(true);
    script.onerror = () => onError('Failed to load Google Maps');
    document.head.appendChild(script);
  }, [apiKey, mapsLoaded, onError]);

  // Initialize the map instance
  useEffect(() => {
    if (!mapsLoaded || !mapRef.current || mapInstance.current) return;

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 20, lng: 0 },
      zoom: 3,
      styles: MAP_STYLES,
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: true,
    });

    mapInstance.current = map;
    directionsRenderer.current = new window.google.maps.DirectionsRenderer({
      map,
      polylineOptions: {
        strokeColor: '#6366f1',
        strokeWeight: 5,
        strokeOpacity: 0.8,
      },
    });
  }, [mapsLoaded]);

  /**
   * Removes all markers from the map and clears the markers array.
   * @returns {void}
   */
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
  }, []);

  return {
    mapRef,
    mapsLoaded,
    mapInstance: mapInstance.current,
    directionsRenderer: directionsRenderer.current,
    markersRef,
    clearMarkers,
  };
}

/**
 * Sets up Places Autocomplete on an input element.
 * @param {string} elementId - DOM ID of the input element
 * @param {function} setter - State setter to call when a place is selected
 * @returns {void}
 */
export function setupAutocomplete(elementId, setter) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const ac = new window.google.maps.places.Autocomplete(el, {
    fields: ['formatted_address', 'geometry'],
  });
  ac.addListener('place_changed', () => {
    const place = ac.getPlace();
    if (place?.formatted_address) setter(place.formatted_address);
  });
}
