import { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';

/* ── Toast Component ── */
function Toast({ message, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [message, onDone]);
  return <div className="toast" role="alert">{message}</div>;
}

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
  const [trips, setTrips] = useState([]);
  const [toast, setToast] = useState('');
  const [planning, setPlanning] = useState(false);

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const directionsRenderer = useRef(null);
  const originAC = useRef(null);
  const destAC = useRef(null);

  // Fetch API key and trips on mount
  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(d => { if (d.mapsApiKey) setApiKey(d.mapsApiKey); })
      .catch(() => setToast('Failed to load API config'));
    fetch('/api/trips').then(r => r.json()).then(setTrips).catch(() => {});
  }, []);

  // Load Google Maps script
  useEffect(() => {
    if (!apiKey || mapsLoaded) return;
    const existingScript = document.getElementById('google-maps-script');
    if (existingScript) return; // Prevent multiple additions in strict mode
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
    if (!mapsLoaded || !mapRef.current) return;
    if (mapInstance.current) return; // Already initialized

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 39.8283, lng: -98.5795 }, // Center of US
      zoom: 4,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#0b1120" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#131a2e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#253256" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1a35" }] },
        { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }
      ],
      disableDefaultUI: true, zoomControl: true,
    });
    mapInstance.current = map;
    directionsRenderer.current = new window.google.maps.DirectionsRenderer({
      map, polylineOptions: { strokeColor: '#6366f1', strokeWeight: 5 },
      suppressMarkers: false,
    });
    
    // Autocomplete
    const setupAC = (inputId, setter) => {
      const el = document.getElementById(inputId);
      if (!el) return null;
      const ac = new window.google.maps.places.Autocomplete(el, { fields: ['formatted_address', 'geometry'] });
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (place?.formatted_address) setter(place.formatted_address);
      });
      return ac;
    };
    originAC.current = setupAC('origin-input', setOrigin);
    destAC.current = setupAC('dest-input', setDestination);
  }, [mapsLoaded]);

  // Plan route
  const planRoute = useCallback(() => {
    if (!origin || !destination || !mapsLoaded) return;
    setPlanning(true); setRouteInfo(null);
    const svc = new window.google.maps.DirectionsService();
    svc.route({
      origin, destination,
      waypoints: waypoints.map(w => ({ location: w, stopover: true })),
      travelMode: window.google.maps.TravelMode[travelMode],
      avoidTolls, avoidHighways, optimizeWaypoints: true,
    }, (result, status) => {
      setPlanning(false);
      if (status === 'OK') {
        directionsRenderer.current.setDirections(result);
        const leg = result.routes[0].legs;
        const dist = leg.reduce((s, l) => s + l.distance.value, 0);
        const dur = leg.reduce((s, l) => s + l.duration.value, 0);
        setRouteInfo({
          distance: (dist / 1000).toFixed(1) + ' km',
          duration: Math.round(dur / 60) + ' min',
          steps: leg.length,
          summary: result.routes[0].summary,
        });
      } else {
        setToast('Route not found: ' + status);
      }
    });
  }, [origin, destination, waypoints, travelMode, avoidTolls, avoidHighways, mapsLoaded]);

  // Save trip
  const saveTrip = () => {
    if (!tripName || !origin || !destination) { setToast('Fill in trip name, origin & destination'); return; }
    fetch('/api/trips', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tripName, origin, destination, waypoints, preferences: { travelMode, avoidTolls, avoidHighways } }),
    }).then(r => r.json()).then(t => {
      setTrips(prev => [...prev, t]);
      setToast('Trip saved!');
      setTripName('');
    }).catch(() => setToast('Failed to save trip'));
  };

  // Load a saved trip
  const loadTrip = (trip) => {
    setOrigin(trip.origin); setDestination(trip.destination);
    setWaypoints(trip.waypoints || []);
    setTravelMode(trip.preferences?.travelMode || 'DRIVING');
    setAvoidTolls(trip.preferences?.avoidTolls || false);
    setAvoidHighways(trip.preferences?.avoidHighways || false);
    setTripName(trip.name);
    setToast(`Loaded: ${trip.name}`);
    // Update autocomplete inputs
    setTimeout(() => {
      const oi = document.getElementById('origin-input');
      const di = document.getElementById('dest-input');
      if (oi) oi.value = trip.origin;
      if (di) di.value = trip.destination;
    }, 100);
  };

  // Delete trip
  const deleteTrip = (id, e) => {
    e.stopPropagation();
    fetch(`/api/trips/${id}`, { method: 'DELETE' }).then(() => {
      setTrips(prev => prev.filter(t => t.id !== id));
      setToast('Trip deleted');
    });
  };

  // Add waypoint
  const addWaypoint = () => {
    if (!waypointInput.trim()) return;
    setWaypoints(prev => [...prev, waypointInput.trim()]);
    setWaypointInput('');
  };

  return (
    <>
      <header className="app-bar" role="banner">
        <h1>✈ TripForge</h1>
        <span className="badge">Google Maps</span>
      </header>
      <div className="layout">
        <aside className="sidebar" role="complementary" aria-label="Trip planning controls">
          {/* Route Planning */}
          <div className="section-title">Plan Your Route</div>
          <div className="field">
            <label htmlFor="origin-input">Origin</label>
            <input id="origin-input" placeholder="e.g. San Francisco" defaultValue={origin} onChange={e => setOrigin(e.target.value)} aria-required="true" />
          </div>
          <div className="field">
            <label htmlFor="dest-input">Destination</label>
            <input id="dest-input" placeholder="e.g. Los Angeles" defaultValue={destination} onChange={e => setDestination(e.target.value)} aria-required="true" />
          </div>

          {/* Waypoints */}
          <div className="field">
            <label htmlFor="waypoint-input">Add Stop</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="waypoint-input" placeholder="e.g. Santa Barbara" value={waypointInput} onChange={e => setWaypointInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addWaypoint()} />
              <button className="btn btn-outline" onClick={addWaypoint} aria-label="Add waypoint" style={{ minWidth: 48 }}>+</button>
            </div>
          </div>
          {waypoints.length > 0 && waypoints.map((w, i) => (
            <div className="waypoint-item" key={i}>
              <span style={{ flex: 1 }}>{i + 1}. {w}</span>
              <button onClick={() => setWaypoints(prev => prev.filter((_, j) => j !== i))} aria-label={`Remove ${w}`}>✕</button>
            </div>
          ))}

          {/* Preferences */}
          <div className="section-title" style={{ marginTop: 4 }}>Preferences</div>
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
            <div className={`pref-chip ${avoidTolls ? 'active' : ''}`} onClick={() => setAvoidTolls(!avoidTolls)} role="checkbox" aria-checked={avoidTolls} tabIndex={0}>Avoid Tolls</div>
            <div className={`pref-chip ${avoidHighways ? 'active' : ''}`} onClick={() => setAvoidHighways(!avoidHighways)} role="checkbox" aria-checked={avoidHighways} tabIndex={0}>Avoid Highways</div>
          </div>

          <button className="btn btn-primary" onClick={planRoute} disabled={!origin || !destination || planning} id="plan-route-btn" style={{ marginTop: 4 }}>
            {planning ? 'Planning...' : '🗺 Plan Route'}
          </button>

          {/* Save Trip */}
          <div className="section-title" style={{ marginTop: 4 }}>Save Trip</div>
          <div className="field">
            <label htmlFor="trip-name">Trip Name</label>
            <input id="trip-name" placeholder="My Road Trip" value={tripName} onChange={e => setTripName(e.target.value)} />
          </div>
          <button className="btn btn-outline" onClick={saveTrip} id="save-trip-btn">💾 Save Trip</button>

          {/* Saved Trips */}
          {trips.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: 4 }}>Saved Trips ({trips.length})</div>
              {trips.map(trip => (
                <div className="trip-card" key={trip.id} onClick={() => loadTrip(trip)} role="button" tabIndex={0} aria-label={`Load trip ${trip.name}`}>
                  <h4>{trip.name}</h4>
                  <p>{trip.origin} → {trip.destination}</p>
                  <div className="meta">
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{trip.waypoints?.length || 0} stops</span>
                    <button className="btn btn-danger" onClick={(e) => deleteTrip(trip.id, e)} style={{ padding: '4px 10px', fontSize: 11 }} aria-label={`Delete trip ${trip.name}`}>Delete</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </aside>

        {/* Map */}
        <main className="map-container" role="main" aria-label="Interactive map">
          <div id="map" ref={mapRef} aria-label="Google Map displaying your planned route"></div>
          {planning && <div className="loading-overlay">Planning your route...</div>}
          {!apiKey && <div className="loading-overlay">Loading configuration...</div>}
          {routeInfo && (
            <div className="info-panel" role="region" aria-label="Route information">
              <h3>Route: {routeInfo.summary}</h3>
              <div>
                <span className="stat">📏 {routeInfo.distance}</span>
                <span className="stat">⏱ {routeInfo.duration}</span>
                <span className="stat">📍 {routeInfo.steps} leg(s)</span>
              </div>
            </div>
          )}
        </main>
      </div>
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </>
  );
}

export default App;
