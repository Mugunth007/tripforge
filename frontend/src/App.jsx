import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import './index.css';

/* ── Toast ── */
const Toast = memo(function Toast({ message, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [message, onDone]);
  return <div className="toast" role="alert">{message}</div>;
});

/* ── Stat Card ── */
const StatCard = memo(function StatCard({ icon, label, value }) {
  return (
    <div className="stat-card">
      <span className="stat-icon">{icon}</span>
      <div><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>
    </div>
  );
});

/* ── Nearby Place Card ── */
const PlaceCard = memo(function PlaceCard({ place }) {
  return (
    <div className="place-card" role="listitem">
      <div className="place-name">{place.name}</div>
      <div className="place-info">
        {place.rating && <span>⭐ {place.rating}</span>}
        {place.vicinity && <span className="place-vicinity">{place.vicinity}</span>}
      </div>
    </div>
  );
});

/* ── Main App ── */
function App() {
  const [apiKey, setApiKey] = useState(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);
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
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [elevation, setElevation] = useState(null);
  const [trips, setTrips] = useState([]);
  const [toast, setToast] = useState('');
  const [planning, setPlanning] = useState(false);
  const [activeTab, setActiveTab] = useState('route');

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const directionsRenderer = useRef(null);
  const markersRef = useRef([]);

  // Fetch config + trips on mount
  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(d => { if (d.mapsApiKey) setApiKey(d.mapsApiKey); })
      .catch(() => setToast('Failed to load API config'));
    fetch('/api/trips').then(r => r.json()).then(setTrips).catch(() => {});
  }, []);

  // Load Google Maps
  useEffect(() => {
    if (!apiKey || mapsLoaded) return;
    if (document.getElementById('google-maps-script')) return;
    const s = document.createElement('script');
    s.id = 'google-maps-script';
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    s.async = true;
    s.defer = true;
    s.onload = () => setMapsLoaded(true);
    s.onerror = () => setToast('Failed to load Google Maps');
    document.head.appendChild(s);
  }, [apiKey, mapsLoaded]);

  // Init map
  useEffect(() => {
    if (!mapsLoaded || !mapRef.current || mapInstance.current) return;
    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 20, lng: 0 }, zoom: 3,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#0b1120' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#131a2e' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#253256' }] },
        { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a2340' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1a35' }] },
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1a2340' }] },
      ],
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: true,
    });
    mapInstance.current = map;
    directionsRenderer.current = new window.google.maps.DirectionsRenderer({
      map,
      polylineOptions: { strokeColor: '#6366f1', strokeWeight: 5, strokeOpacity: 0.8 },
    });
    // Setup autocomplete
    const setupAC = (id, setter) => {
      const el = document.getElementById(id);
      if (!el) return;
      const ac = new window.google.maps.places.Autocomplete(el, { fields: ['formatted_address', 'geometry'] });
      ac.addListener('place_changed', () => {
        const p = ac.getPlace();
        if (p?.formatted_address) setter(p.formatted_address);
      });
    };
    setupAC('origin-input', setOrigin);
    setupAC('dest-input', setDestination);
  }, [mapsLoaded]);

  // Clear nearby markers
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
  }, []);

  // Plan route + fetch distance matrix + elevation
  const planRoute = useCallback(async () => {
    if (!origin || !destination || !mapsLoaded) return;
    setPlanning(true);
    setRouteInfo(null);
    setDistanceMatrix(null);
    setElevation(null);
    setNearbyPlaces([]);
    clearMarkers();

    const svc = new window.google.maps.DirectionsService();
    svc.route({
      origin, destination,
      waypoints: waypoints.map(w => ({ location: w, stopover: true })),
      travelMode: window.google.maps.TravelMode[travelMode],
      avoidTolls, avoidHighways, optimizeWaypoints: true,
    }, async (result, status) => {
      if (status === 'OK') {
        directionsRenderer.current.setDirections(result);
        const legs = result.routes[0].legs;
        const dist = legs.reduce((s, l) => s + l.distance.value, 0);
        const dur = legs.reduce((s, l) => s + l.duration.value, 0);
        const info = {
          distance: (dist / 1000).toFixed(1) + ' km',
          duration: formatDuration(dur),
          steps: legs.length,
          summary: result.routes[0].summary,
        };
        setRouteInfo(info);

        // Fetch Distance Matrix via our proxy
        try {
          const dmRes = await fetch(`/api/distance-matrix?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&mode=${travelMode.toLowerCase()}`);
          const dmData = await dmRes.json();
          if (dmData.rows?.[0]?.elements?.[0]?.status === 'OK') {
            setDistanceMatrix(dmData.rows[0].elements[0]);
          }
        } catch (e) { /* non-critical */ }

        // Fetch Elevation at destination
        try {
          const destLeg = legs[legs.length - 1];
          const lat = destLeg.end_location.lat();
          const lng = destLeg.end_location.lng();
          const elevRes = await fetch(`/api/elevation?locations=${lat},${lng}`);
          const elevData = await elevRes.json();
          if (elevData.results?.[0]) {
            setElevation(Math.round(elevData.results[0].elevation) + ' m');
          }
        } catch (e) { /* non-critical */ }
      } else {
        setToast('Route not found: ' + status);
      }
      setPlanning(false);
    });
  }, [origin, destination, waypoints, travelMode, avoidTolls, avoidHighways, mapsLoaded, clearMarkers]);

  // Explore nearby places at destination
  const explorePlaces = useCallback(async (type) => {
    if (!routeInfo || !mapsLoaded) return;
    clearMarkers();
    // Use geocode to get destination coords
    try {
      const geoRes = await fetch(`/api/geocode?address=${encodeURIComponent(destination)}`);
      const geoData = await geoRes.json();
      if (geoData.results?.[0]) {
        const loc = geoData.results[0].geometry.location;
        const placesRes = await fetch(`/api/places-nearby?lat=${loc.lat}&lng=${loc.lng}&type=${type}&radius=5000`);
        const placesData = await placesRes.json();
        if (placesData.results) {
          setNearbyPlaces(placesData.results.slice(0, 8));
          // Add markers
          placesData.results.slice(0, 8).forEach(p => {
            const marker = new window.google.maps.Marker({
              position: p.geometry.location,
              map: mapInstance.current,
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
            marker.addListener('click', () => infoWindow.open(mapInstance.current, marker));
            markersRef.current.push(marker);
          });
        }
      }
    } catch (err) {
      setToast('Could not load nearby places');
    }
  }, [destination, routeInfo, mapsLoaded, clearMarkers]);

  // Save trip
  const saveTrip = useCallback(() => {
    if (!tripName || !origin || !destination) { setToast('Fill in trip name, origin & destination'); return; }
    fetch('/api/trips', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tripName, origin, destination, waypoints, preferences: { travelMode, avoidTolls, avoidHighways } }),
    }).then(r => r.json()).then(t => {
      setTrips(prev => [...prev, t]);
      setToast('Trip saved!');
      setTripName('');
    }).catch(() => setToast('Failed to save trip'));
  }, [tripName, origin, destination, waypoints, travelMode, avoidTolls, avoidHighways]);

  // Load trip
  const loadTrip = useCallback((trip) => {
    setOrigin(trip.origin); setDestination(trip.destination);
    setWaypoints(trip.waypoints || []);
    setTravelMode(trip.preferences?.travelMode || 'DRIVING');
    setAvoidTolls(trip.preferences?.avoidTolls || false);
    setAvoidHighways(trip.preferences?.avoidHighways || false);
    setTripName(trip.name);
    setToast(`Loaded: ${trip.name}`);
    setTimeout(() => {
      const oi = document.getElementById('origin-input');
      const di = document.getElementById('dest-input');
      if (oi) oi.value = trip.origin;
      if (di) di.value = trip.destination;
    }, 100);
  }, []);

  // Delete trip
  const deleteTrip = useCallback((id, e) => {
    e.stopPropagation();
    fetch(`/api/trips/${id}`, { method: 'DELETE' }).then(() => {
      setTrips(prev => prev.filter(t => t.id !== id));
      setToast('Trip deleted');
    });
  }, []);

  // Add waypoint
  const addWaypoint = useCallback(() => {
    if (!waypointInput.trim()) return;
    setWaypoints(prev => [...prev, waypointInput.trim()]);
    setWaypointInput('');
  }, [waypointInput]);

  // Place types for explore
  const placeTypes = useMemo(() => [
    { type: 'tourist_attraction', label: '🏛 Attractions' },
    { type: 'restaurant', label: '🍽 Restaurants' },
    { type: 'lodging', label: '🏨 Hotels' },
    { type: 'gas_station', label: '⛽ Gas Stations' },
    { type: 'hospital', label: '🏥 Hospitals' },
  ], []);

  return (
    <>
      <header className="app-bar" role="banner">
        <h1>✈ TripForge</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="badge badge-accent">Google Maps</span>
          <span className="badge badge-success">Live</span>
        </div>
      </header>
      <div className="layout">
        <aside className="sidebar" role="complementary" aria-label="Trip planning controls">
          {/* Tabs */}
          <div className="tabs" role="tablist">
            {[{ id: 'route', label: '🗺 Route' }, { id: 'explore', label: '🔍 Explore' }, { id: 'trips', label: '💾 Trips' }].map(tab => (
              <button key={tab.id} role="tab" aria-selected={activeTab === tab.id} className={`tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>
            ))}
          </div>

          {/* ROUTE TAB */}
          {activeTab === 'route' && (
            <>
              <div className="section-title">Plan Your Route</div>
              <div className="field">
                <label htmlFor="origin-input">Origin</label>
                <input id="origin-input" placeholder="e.g. San Francisco" defaultValue={origin} onChange={e => setOrigin(e.target.value)} aria-required="true" />
              </div>
              <div className="field">
                <label htmlFor="dest-input">Destination</label>
                <input id="dest-input" placeholder="e.g. Los Angeles" defaultValue={destination} onChange={e => setDestination(e.target.value)} aria-required="true" />
              </div>
              <div className="field">
                <label htmlFor="waypoint-input">Add Stop</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input id="waypoint-input" placeholder="e.g. Santa Barbara" value={waypointInput} onChange={e => setWaypointInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addWaypoint()} />
                  <button className="btn btn-outline" onClick={addWaypoint} aria-label="Add waypoint" style={{ minWidth: 48 }}>+</button>
                </div>
              </div>
              {waypoints.map((w, i) => (
                <div className="waypoint-item" key={i}>
                  <span style={{ flex: 1 }}>{i + 1}. {w}</span>
                  <button onClick={() => setWaypoints(prev => prev.filter((_, j) => j !== i))} aria-label={`Remove ${w}`}>✕</button>
                </div>
              ))}
              <div className="section-title">Preferences</div>
              <div className="field">
                <label htmlFor="travel-mode">Travel Mode</label>
                <select id="travel-mode" value={travelMode} onChange={e => setTravelMode(e.target.value)}>
                  <option value="DRIVING">🚗 Driving</option>
                  <option value="WALKING">🚶 Walking</option>
                  <option value="BICYCLING">🚴 Bicycling</option>
                  <option value="TRANSIT">🚌 Transit</option>
                </select>
              </div>
              <div className="pref-group">
                <div className={`pref-chip ${avoidTolls ? 'active' : ''}`} onClick={() => setAvoidTolls(!avoidTolls)} role="checkbox" aria-checked={avoidTolls} tabIndex={0} onKeyDown={e => e.key === 'Enter' && setAvoidTolls(!avoidTolls)}>Avoid Tolls</div>
                <div className={`pref-chip ${avoidHighways ? 'active' : ''}`} onClick={() => setAvoidHighways(!avoidHighways)} role="checkbox" aria-checked={avoidHighways} tabIndex={0} onKeyDown={e => e.key === 'Enter' && setAvoidHighways(!avoidHighways)}>Avoid Highways</div>
              </div>
              <button className="btn btn-primary" onClick={planRoute} disabled={!origin || !destination || planning} id="plan-route-btn">
                {planning ? '⏳ Planning...' : '🗺 Plan Route'}
              </button>

              {/* Route Info Stats */}
              {routeInfo && (
                <div className="stats-grid" role="region" aria-label="Route statistics">
                  <StatCard icon="📏" label="Distance" value={routeInfo.distance} />
                  <StatCard icon="⏱" label="Duration" value={routeInfo.duration} />
                  <StatCard icon="📍" label="Legs" value={routeInfo.steps} />
                  {elevation && <StatCard icon="⛰" label="Dest. Elevation" value={elevation} />}
                  {distanceMatrix && <StatCard icon="🛣" label="Matrix Dist." value={distanceMatrix.distance?.text || '—'} />}
                  {distanceMatrix && <StatCard icon="🕐" label="Matrix Time" value={distanceMatrix.duration?.text || '—'} />}
                </div>
              )}

              {/* Save */}
              {routeInfo && (
                <>
                  <div className="section-title">Save This Trip</div>
                  <div className="field">
                    <label htmlFor="trip-name">Trip Name</label>
                    <input id="trip-name" placeholder="My Road Trip" value={tripName} onChange={e => setTripName(e.target.value)} />
                  </div>
                  <button className="btn btn-outline" onClick={saveTrip} id="save-trip-btn">💾 Save Trip</button>
                </>
              )}
            </>
          )}

          {/* EXPLORE TAB */}
          {activeTab === 'explore' && (
            <>
              <div className="section-title">Explore Near Destination</div>
              {!routeInfo && <p className="hint">Plan a route first to explore nearby places.</p>}
              {routeInfo && (
                <>
                  <div className="pref-group">
                    {placeTypes.map(pt => (
                      <button key={pt.type} className="pref-chip active" onClick={() => explorePlaces(pt.type)}>{pt.label}</button>
                    ))}
                  </div>
                  {nearbyPlaces.length > 0 && (
                    <div className="places-list" role="list" aria-label="Nearby places">
                      {nearbyPlaces.map((p, i) => <PlaceCard key={i} place={p} />)}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* TRIPS TAB */}
          {activeTab === 'trips' && (
            <>
              <div className="section-title">Saved Trips ({trips.length})</div>
              {trips.length === 0 && <p className="hint">No saved trips yet. Plan and save one!</p>}
              {trips.map(trip => (
                <div className="trip-card" key={trip.id} onClick={() => { loadTrip(trip); setActiveTab('route'); }} role="button" tabIndex={0} aria-label={`Load trip ${trip.name}`}>
                  <h4>{trip.name}</h4>
                  <p>{trip.origin} → {trip.destination}</p>
                  <div className="meta">
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{trip.waypoints?.length || 0} stops • {trip.preferences?.travelMode || 'DRIVING'}</span>
                    <button className="btn btn-danger" onClick={(e) => deleteTrip(trip.id, e)} style={{ padding: '4px 10px', fontSize: 11 }} aria-label={`Delete trip ${trip.name}`}>Delete</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </aside>

        <main className="map-container" role="main" aria-label="Interactive map">
          <div id="map" ref={mapRef} aria-label="Google Map"></div>
          {planning && <div className="loading-overlay"><div className="spinner"></div>Planning your route...</div>}
          {!apiKey && <div className="loading-overlay">Loading configuration...</div>}
          {routeInfo && (
            <div className="info-panel" role="region" aria-label="Route summary">
              <h3>Route: {routeInfo.summary}</h3>
              <div>
                <span className="stat">📏 {routeInfo.distance}</span>
                <span className="stat">⏱ {routeInfo.duration}</span>
                <span className="stat">📍 {routeInfo.steps} leg(s)</span>
                {elevation && <span className="stat">⛰ {elevation}</span>}
              </div>
            </div>
          )}
        </main>
      </div>
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </>
  );
}

/** Format seconds to human-friendly duration */
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

export default App;
