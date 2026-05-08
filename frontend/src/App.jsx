/**
 * @fileoverview TripForge v3 — Main Application Component.
 * Orchestrates Google Maps integration, route planning, translation,
 * and trip management through a tabbed Accentricity UI.
 * @version 3.0.0
 * @module App
 */
import { useState, useEffect, useCallback } from 'react';
import './index.css';

// Components
import Header from './components/Header';
import Toast from './components/Toast';
import RouteTab from './components/tabs/RouteTab';
import ExploreTab from './components/tabs/ExploreTab';
import TranslateTab from './components/tabs/TranslateTab';
import InfoTab from './components/tabs/InfoTab';
import TripsTab from './components/tabs/TripsTab';

// Hooks & Utils
import { useToast } from './hooks/useToast';
import { useGoogleMaps, setupAutocomplete } from './hooks/useGoogleMaps';
import { TABS } from './utils/constants';
import { formatDuration, formatDistance, sumLegDistance, sumLegDuration } from './utils/formatters';
import * as api from './utils/api';

/**
 * Root application component that manages global state and coordinates
 * between Google Maps, the sidebar tabs, and the map display.
 *
 * @returns {JSX.Element} The complete TripForge application
 */
function App() {
  // ── API & Map State ──
  const [apiKey, setApiKey] = useState(null);
  const [toast, showToast, clearToast] = useToast();
  const { mapRef, mapsLoaded, markersRef, clearMarkers } = useGoogleMaps(apiKey, showToast);

  // ── Route State ──
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [waypointInput, setWaypointInput] = useState('');
  const [waypoints, setWaypoints] = useState([]);
  const [tripName, setTripName] = useState('');
  const [travelMode, setTravelMode] = useState('DRIVING');
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [avoidHighways, setAvoidHighways] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [distanceMatrix, setDistanceMatrix] = useState(null);
  const [elevation, setElevation] = useState(null);
  const [timezone, setTimezone] = useState(null);
  const [staticMapUrl, setStaticMapUrl] = useState(null);
  const [planning, setPlanning] = useState(false);

  // ── Explore State ──
  const [nearbyPlaces, setNearbyPlaces] = useState([]);

  // ── Translation State ──
  const [translateText, setTranslateText] = useState('');
  const [translateTarget, setTranslateTarget] = useState('es');
  const [translateResult, setTranslateResult] = useState(null);
  const [translating, setTranslating] = useState(false);

  // ── Trips State ──
  const [trips, setTrips] = useState([]);
  const [activeTab, setActiveTab] = useState('route');

  // ── Refs for map instances (accessed via useGoogleMaps internals) ──
  const mapInstanceRef = { current: null };
  const directionsRendererRef = { current: null };

  // ─────────────────────────
  // INITIALIZATION
  // ─────────────────────────

  /** Fetch API config and saved trips on mount */
  useEffect(() => {
    api.fetchConfig()
      .then((d) => { if (d.mapsApiKey) setApiKey(d.mapsApiKey); })
      .catch(() => showToast('Failed to load API config'));

    api.fetchTrips()
      .then(setTrips)
      .catch(() => { /* trips may not exist yet */ });
  }, [showToast]);

  /** Initialize map and autocomplete once Maps SDK loads */
  useEffect(() => {
    if (!mapsLoaded) return;

    // Store references for route planning
    const mapEl = document.getElementById('map');
    if (mapEl && !mapInstanceRef.current) {
      // Map is already initialized by useGoogleMaps hook
      // Setup autocomplete on inputs
      setupAutocomplete('origin-input', setOrigin);
      setupAutocomplete('dest-input', setDestination);
    }
  }, [mapsLoaded]);

  // ─────────────────────────
  // ROUTE PLANNING
  // ─────────────────────────

  /**
   * Plans a route using the Google Directions Service.
   * Also fetches Distance Matrix, Elevation, Timezone, and Static Map data.
   * @returns {Promise<void>}
   */
  const planRoute = useCallback(async () => {
    if (!origin || !destination || !mapsLoaded) return;

    setPlanning(true);
    setRouteInfo(null);
    setDistanceMatrix(null);
    setElevation(null);
    setTimezone(null);
    setStaticMapUrl(null);
    setNearbyPlaces([]);
    clearMarkers();

    const mapEl = document.getElementById('map');
    const map = mapEl?.__gm_map || window._tripforgeMap;

    const svc = new window.google.maps.DirectionsService();
    svc.route({
      origin,
      destination,
      waypoints: waypoints.map((w) => ({ location: w, stopover: true })),
      travelMode: window.google.maps.TravelMode[travelMode],
      avoidTolls,
      avoidHighways,
      optimizeWaypoints: true,
    }, async (result, status) => {
      if (status === 'OK') {
        // Render directions on map
        if (window._tripforgeRenderer) {
          window._tripforgeRenderer.setDirections(result);
        }

        const legs = result.routes[0].legs;
        const totalDist = sumLegDistance(legs);
        const totalDur = sumLegDuration(legs);

        setRouteInfo({
          distance: formatDistance(totalDist),
          duration: formatDuration(totalDur),
          steps: legs.length,
          summary: result.routes[0].summary,
        });

        // Fetch supplementary data in parallel
        const destLeg = legs[legs.length - 1];
        const destLat = destLeg.end_location.lat();
        const destLng = destLeg.end_location.lng();

        const [dmRes, elevRes, tzRes, smRes] = await Promise.allSettled([
          api.fetchDistanceMatrix(origin, destination, travelMode),
          api.fetchElevation(destLat, destLng),
          api.fetchTimezone(destLat, destLng),
          api.fetchStaticMap(destination),
        ]);

        // Distance Matrix
        if (dmRes.status === 'fulfilled' && dmRes.value.rows?.[0]?.elements?.[0]?.status === 'OK') {
          setDistanceMatrix(dmRes.value.rows[0].elements[0]);
        }

        // Elevation
        if (elevRes.status === 'fulfilled' && elevRes.value.results?.[0]) {
          setElevation(Math.round(elevRes.value.results[0].elevation) + ' m');
        }

        // Timezone
        if (tzRes.status === 'fulfilled' && tzRes.value.timeZoneName) {
          setTimezone(tzRes.value.timeZoneName);
        }

        // Static Map
        if (smRes.status === 'fulfilled' && smRes.value.url) {
          setStaticMapUrl(smRes.value.url);
        }
      } else {
        showToast('Route not found: ' + status);
      }
      setPlanning(false);
    });
  }, [origin, destination, waypoints, travelMode, avoidTolls, avoidHighways, mapsLoaded, clearMarkers, showToast]);

  // ─────────────────────────
  // EXPLORE NEARBY
  // ─────────────────────────

  /**
   * Searches for nearby places at the destination.
   * @param {string} type - Google Places type filter
   * @returns {Promise<void>}
   */
  const explorePlaces = useCallback(async (type) => {
    if (!routeInfo || !mapsLoaded) return;
    clearMarkers();

    try {
      const geo = await api.fetchGeocode(destination);
      if (geo.results?.[0]) {
        const loc = geo.results[0].geometry.location;
        const places = await api.fetchNearbyPlaces(loc.lat, loc.lng, type);

        if (places.results) {
          const topPlaces = places.results.slice(0, 8);
          setNearbyPlaces(topPlaces);

          // Add markers to map
          topPlaces.forEach((p) => {
            const marker = new window.google.maps.Marker({
              position: p.geometry.location,
              map: window._tripforgeMap,
              title: p.name,
              icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#6366f1',
                fillOpacity: 0.9,
                strokeColor: '#fff',
                strokeWeight: 2,
              },
            });
            const infoWindow = new window.google.maps.InfoWindow({
              content: `<div style="color:#000;font-family:Inter"><strong>${p.name}</strong><br/>${p.vicinity || ''}<br/>⭐ ${p.rating || 'N/A'}</div>`,
            });
            marker.addListener('click', () => infoWindow.open(window._tripforgeMap, marker));
            markersRef.current.push(marker);
          });
        }
      }
    } catch {
      showToast('Could not load nearby places');
    }
  }, [destination, routeInfo, mapsLoaded, clearMarkers, markersRef, showToast]);

  // ─────────────────────────
  // TRANSLATION
  // ─────────────────────────

  /**
   * Translates the current text to the selected target language.
   * @returns {Promise<void>}
   */
  const handleTranslate = useCallback(async () => {
    if (!translateText.trim() || translating) return;
    setTranslating(true);
    setTranslateResult(null);

    try {
      const data = await api.translateText(translateText, translateTarget);
      setTranslateResult(data.translatedText || data.error || 'Translation failed');
    } catch {
      setTranslateResult('Network error');
    }
    setTranslating(false);
  }, [translateText, translateTarget, translating]);

  // ─────────────────────────
  // TRIP CRUD
  // ─────────────────────────

  /**
   * Saves the current route as a named trip.
   * @returns {void}
   */
  const saveTrip = useCallback(() => {
    if (!tripName || !origin || !destination) {
      showToast('Fill in trip name, origin & destination');
      return;
    }
    api.createTrip({
      name: tripName, origin, destination, waypoints,
      preferences: { travelMode, avoidTolls, avoidHighways },
    })
      .then((t) => { setTrips((prev) => [...prev, t]); showToast('Trip saved!'); setTripName(''); })
      .catch(() => showToast('Failed to save'));
  }, [tripName, origin, destination, waypoints, travelMode, avoidTolls, avoidHighways, showToast]);

  /**
   * Loads a saved trip into the route planning form.
   * @param {Object} trip - Trip object to load
   */
  const loadTrip = useCallback((trip) => {
    setOrigin(trip.origin);
    setDestination(trip.destination);
    setWaypoints(trip.waypoints || []);
    setTravelMode(trip.preferences?.travelMode || 'DRIVING');
    setAvoidTolls(trip.preferences?.avoidTolls || false);
    setAvoidHighways(trip.preferences?.avoidHighways || false);
    setTripName(trip.name);
    showToast(`Loaded: ${trip.name}`);
    setActiveTab('route');

    // Update DOM inputs after render
    setTimeout(() => {
      const o = document.getElementById('origin-input');
      const d = document.getElementById('dest-input');
      if (o) o.value = trip.origin;
      if (d) d.value = trip.destination;
    }, 100);
  }, [showToast]);

  /**
   * Deletes a trip by ID.
   * @param {string} id - Trip ID
   * @param {Event} e - Click event (stopped from propagating to card)
   */
  const handleDeleteTrip = useCallback((id, e) => {
    e.stopPropagation();
    api.deleteTrip(id).then(() => {
      setTrips((prev) => prev.filter((t) => t.id !== id));
      showToast('Trip deleted');
    });
  }, [showToast]);

  // ─────────────────────────
  // RENDER
  // ─────────────────────────

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Header />

      <div className="layout">
        <aside className="sidebar" role="complementary" aria-label="Trip planning controls">
          {/* Tab navigation */}
          <nav className="tabs" role="tablist" aria-label="Navigation tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                id={`tab-${tab.id}`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Tab panels */}
          {activeTab === 'route' && (
            <RouteTab
              origin={origin} setOrigin={setOrigin}
              destination={destination} setDestination={setDestination}
              waypointInput={waypointInput} setWaypointInput={setWaypointInput}
              waypoints={waypoints} setWaypoints={setWaypoints}
              travelMode={travelMode} setTravelMode={setTravelMode}
              avoidTolls={avoidTolls} setAvoidTolls={setAvoidTolls}
              avoidHighways={avoidHighways} setAvoidHighways={setAvoidHighways}
              routeInfo={routeInfo} elevation={elevation}
              distanceMatrix={distanceMatrix} timezone={timezone}
              planning={planning} onPlanRoute={planRoute}
              tripName={tripName} setTripName={setTripName}
              onSaveTrip={saveTrip}
            />
          )}

          {activeTab === 'explore' && (
            <ExploreTab
              routeInfo={routeInfo}
              nearbyPlaces={nearbyPlaces}
              onExplorePlaces={explorePlaces}
            />
          )}

          {activeTab === 'translate' && (
            <TranslateTab
              translateText={translateText} setTranslateText={setTranslateText}
              translateTarget={translateTarget} setTranslateTarget={setTranslateTarget}
              translateResult={translateResult}
              translating={translating}
              onTranslate={handleTranslate}
            />
          )}

          {activeTab === 'info' && (
            <InfoTab
              routeInfo={routeInfo}
              timezone={timezone}
              elevation={elevation}
              staticMapUrl={staticMapUrl}
            />
          )}

          {activeTab === 'trips' && (
            <TripsTab
              trips={trips}
              onLoadTrip={loadTrip}
              onDeleteTrip={handleDeleteTrip}
            />
          )}
        </aside>

        <main className="map-container" role="main" id="main-content" aria-label="Interactive map">
          <div id="map" ref={mapRef} aria-label="Google Map" />
          {planning && (
            <div className="loading-overlay">
              <div className="spinner" />
              Planning your route...
            </div>
          )}
          {!apiKey && <div className="loading-overlay">Loading configuration...</div>}
          {routeInfo && (
            <div className="info-panel" role="region" aria-label="Route summary">
              <h3>Route: {routeInfo.summary}</h3>
              <div>
                <span className="stat">📏 {routeInfo.distance}</span>
                <span className="stat">⏱ {routeInfo.duration}</span>
                <span className="stat">📍 {routeInfo.steps} leg(s)</span>
                {elevation && <span className="stat">⛰ {elevation}</span>}
                {timezone && <span className="stat">🕐 {timezone}</span>}
              </div>
            </div>
          )}
        </main>
      </div>

      {toast && <Toast message={toast} onDone={clearToast} />}
    </>
  );
}

export default App;
