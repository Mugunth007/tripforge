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

/* ── Place Card ── */
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

/* ── Chat Message ── */
const ChatMessage = memo(function ChatMessage({ msg }) {
  return (
    <div className={`chat-msg ${msg.role}`} role="listitem">
      <div className="chat-bubble">
        <div className="chat-sender">{msg.role === 'user' ? '🧑 You' : '🤖 TripForge AI'}</div>
        <div className="chat-text">{msg.text}</div>
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
  // AI Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  // Translation state
  const [translateText, setTranslateText] = useState('');
  const [translateTarget, setTranslateTarget] = useState('es');
  const [translateResult, setTranslateResult] = useState(null);
  const [translating, setTranslating] = useState(false);

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const directionsRenderer = useRef(null);
  const markersRef = useRef([]);
  const chatEndRef = useRef(null);

  // Fetch config + trips
  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(d => { if (d.mapsApiKey) setApiKey(d.mapsApiKey); }).catch(() => setToast('Failed to load API config'));
    fetch('/api/trips').then(r => r.json()).then(setTrips).catch(() => {});
  }, []);

  // Load Maps script
  useEffect(() => {
    if (!apiKey || mapsLoaded || document.getElementById('google-maps-script')) return;
    const s = document.createElement('script');
    s.id = 'google-maps-script';
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    s.async = true; s.defer = true;
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
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1a35' }] },
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      ],
      disableDefaultUI: true, zoomControl: true, mapTypeControl: true,
    });
    mapInstance.current = map;
    directionsRenderer.current = new window.google.maps.DirectionsRenderer({
      map, polylineOptions: { strokeColor: '#6366f1', strokeWeight: 5, strokeOpacity: 0.8 },
    });
    const setupAC = (id, setter) => {
      const el = document.getElementById(id);
      if (!el) return;
      const ac = new window.google.maps.places.Autocomplete(el, { fields: ['formatted_address', 'geometry'] });
      ac.addListener('place_changed', () => { const p = ac.getPlace(); if (p?.formatted_address) setter(p.formatted_address); });
    };
    setupAC('origin-input', setOrigin);
    setupAC('dest-input', setDestination);
  }, [mapsLoaded]);

  const clearMarkers = useCallback(() => { markersRef.current.forEach(m => m.setMap(null)); markersRef.current = []; }, []);

  // Plan route
  const planRoute = useCallback(async () => {
    if (!origin || !destination || !mapsLoaded) return;
    setPlanning(true); setRouteInfo(null); setDistanceMatrix(null); setElevation(null); setNearbyPlaces([]); clearMarkers();
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
        setRouteInfo({ distance: (dist / 1000).toFixed(1) + ' km', duration: formatDuration(dur), steps: legs.length, summary: result.routes[0].summary });
        // Distance Matrix
        try {
          const dm = await (await fetch(`/api/distance-matrix?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&mode=${travelMode.toLowerCase()}`)).json();
          if (dm.rows?.[0]?.elements?.[0]?.status === 'OK') setDistanceMatrix(dm.rows[0].elements[0]);
        } catch {}
        // Elevation
        try {
          const destLeg = legs[legs.length - 1];
          const elev = await (await fetch(`/api/elevation?locations=${destLeg.end_location.lat()},${destLeg.end_location.lng()}`)).json();
          if (elev.results?.[0]) setElevation(Math.round(elev.results[0].elevation) + ' m');
        } catch {}
      } else { setToast('Route not found: ' + status); }
      setPlanning(false);
    });
  }, [origin, destination, waypoints, travelMode, avoidTolls, avoidHighways, mapsLoaded, clearMarkers]);

  // Explore nearby
  const explorePlaces = useCallback(async (type) => {
    if (!routeInfo || !mapsLoaded) return;
    clearMarkers();
    try {
      const geo = await (await fetch(`/api/geocode?address=${encodeURIComponent(destination)}`)).json();
      if (geo.results?.[0]) {
        const loc = geo.results[0].geometry.location;
        const places = await (await fetch(`/api/places-nearby?lat=${loc.lat}&lng=${loc.lng}&type=${type}&radius=5000`)).json();
        if (places.results) {
          setNearbyPlaces(places.results.slice(0, 8));
          places.results.slice(0, 8).forEach(p => {
            const marker = new window.google.maps.Marker({
              position: p.geometry.location, map: mapInstance.current, title: p.name,
              icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#6366f1', fillOpacity: 0.9, strokeColor: '#fff', strokeWeight: 2 },
            });
            const iw = new window.google.maps.InfoWindow({ content: `<div style="color:#000;font-family:Inter"><strong>${p.name}</strong><br/>${p.vicinity || ''}<br/>⭐ ${p.rating || 'N/A'}</div>` });
            marker.addListener('click', () => iw.open(mapInstance.current, marker));
            markersRef.current.push(marker);
          });
        }
      }
    } catch { setToast('Could not load nearby places'); }
  }, [destination, routeInfo, mapsLoaded, clearMarkers]);

  // AI Chat
  const sendChat = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = { role: 'user', text: chatInput.trim() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);
    try {
      const history = chatMessages.slice(-10);
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.text, history }),
      });
      const data = await res.json();
      if (data.reply) {
        setChatMessages(prev => [...prev, { role: 'model', text: data.reply }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'model', text: data.error || 'Sorry, something went wrong.' }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'model', text: 'Network error. Please try again.' }]);
    }
    setChatLoading(false);
  }, [chatInput, chatLoading, chatMessages]);

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  // Translate
  const handleTranslate = useCallback(async () => {
    if (!translateText.trim() || translating) return;
    setTranslating(true); setTranslateResult(null);
    try {
      const res = await fetch('/api/translate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: translateText, target: translateTarget }),
      });
      const data = await res.json();
      setTranslateResult(data.translatedText || data.error || 'Translation failed');
    } catch { setTranslateResult('Network error'); }
    setTranslating(false);
  }, [translateText, translateTarget, translating]);

  // Trip CRUD
  const saveTrip = useCallback(() => {
    if (!tripName || !origin || !destination) { setToast('Fill in trip name, origin & destination'); return; }
    fetch('/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tripName, origin, destination, waypoints, preferences: { travelMode, avoidTolls, avoidHighways } }),
    }).then(r => r.json()).then(t => { setTrips(prev => [...prev, t]); setToast('Trip saved!'); setTripName(''); }).catch(() => setToast('Failed to save'));
  }, [tripName, origin, destination, waypoints, travelMode, avoidTolls, avoidHighways]);

  const loadTrip = useCallback((trip) => {
    setOrigin(trip.origin); setDestination(trip.destination); setWaypoints(trip.waypoints || []);
    setTravelMode(trip.preferences?.travelMode || 'DRIVING');
    setAvoidTolls(trip.preferences?.avoidTolls || false);
    setAvoidHighways(trip.preferences?.avoidHighways || false);
    setTripName(trip.name); setToast(`Loaded: ${trip.name}`);
    setTimeout(() => { const o = document.getElementById('origin-input'); const d = document.getElementById('dest-input'); if (o) o.value = trip.origin; if (d) d.value = trip.destination; }, 100);
  }, []);

  const deleteTrip = useCallback((id, e) => {
    e.stopPropagation();
    fetch(`/api/trips/${id}`, { method: 'DELETE' }).then(() => { setTrips(prev => prev.filter(t => t.id !== id)); setToast('Trip deleted'); });
  }, []);

  const addWaypoint = useCallback(() => { if (!waypointInput.trim()) return; setWaypoints(prev => [...prev, waypointInput.trim()]); setWaypointInput(''); }, [waypointInput]);

  const placeTypes = useMemo(() => [
    { type: 'tourist_attraction', label: '🏛 Attractions' }, { type: 'restaurant', label: '🍽 Restaurants' },
    { type: 'lodging', label: '🏨 Hotels' }, { type: 'gas_station', label: '⛽ Gas' }, { type: 'hospital', label: '🏥 Hospital' },
  ], []);

  const languages = useMemo(() => [
    { code: 'es', name: 'Spanish' }, { code: 'fr', name: 'French' }, { code: 'de', name: 'German' },
    { code: 'ja', name: 'Japanese' }, { code: 'zh', name: 'Chinese' }, { code: 'ko', name: 'Korean' },
    { code: 'ar', name: 'Arabic' }, { code: 'hi', name: 'Hindi' }, { code: 'pt', name: 'Portuguese' },
    { code: 'it', name: 'Italian' }, { code: 'ru', name: 'Russian' }, { code: 'th', name: 'Thai' },
  ], []);

  const tabs = useMemo(() => [
    { id: 'route', label: '🗺 Route' }, { id: 'explore', label: '🔍 Explore' },
    { id: 'ai', label: '🤖 AI Chat' }, { id: 'translate', label: '🌐 Translate' }, { id: 'trips', label: '💾 Trips' },
  ], []);

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <header className="app-bar" role="banner">
        <h1>✈ TripForge</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="badge badge-accent">Google Maps</span>
          <span className="badge badge-ai">Gemini AI</span>
          <span className="badge badge-success">Live</span>
        </div>
      </header>
      <div className="layout">
        <aside className="sidebar" role="complementary" aria-label="Trip planning controls">
          <div className="tabs" role="tablist" aria-label="Navigation tabs">
            {tabs.map(tab => (
              <button key={tab.id} role="tab" aria-selected={activeTab === tab.id} className={`tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)} id={`tab-${tab.id}`}>{tab.label}</button>
            ))}
          </div>

          {/* ROUTE TAB */}
          {activeTab === 'route' && (
            <div role="tabpanel" aria-labelledby="tab-route">
              <div className="section-title">Plan Your Route</div>
              <div className="field"><label htmlFor="origin-input">Origin</label><input id="origin-input" placeholder="e.g. San Francisco" defaultValue={origin} onChange={e => setOrigin(e.target.value)} aria-required="true" /></div>
              <div className="field" style={{marginTop:12}}><label htmlFor="dest-input">Destination</label><input id="dest-input" placeholder="e.g. Los Angeles" defaultValue={destination} onChange={e => setDestination(e.target.value)} aria-required="true" /></div>
              <div className="field" style={{marginTop:12}}>
                <label htmlFor="waypoint-input">Add Stop</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input id="waypoint-input" placeholder="e.g. Santa Barbara" value={waypointInput} onChange={e => setWaypointInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addWaypoint()} />
                  <button className="btn btn-outline" onClick={addWaypoint} aria-label="Add waypoint" style={{ minWidth: 48 }}>+</button>
                </div>
              </div>
              {waypoints.map((w, i) => (<div className="waypoint-item" key={i} style={{marginTop:8}}><span style={{ flex: 1 }}>{i + 1}. {w}</span><button onClick={() => setWaypoints(prev => prev.filter((_, j) => j !== i))} aria-label={`Remove ${w}`}>✕</button></div>))}
              <div className="section-title" style={{ marginTop: 16 }}>Preferences</div>
              <div className="field"><label htmlFor="travel-mode">Travel Mode</label>
                <select id="travel-mode" value={travelMode} onChange={e => setTravelMode(e.target.value)}>
                  <option value="DRIVING">🚗 Driving</option><option value="WALKING">🚶 Walking</option><option value="BICYCLING">🚴 Bicycling</option><option value="TRANSIT">🚌 Transit</option>
                </select>
              </div>
              <div className="pref-group" style={{marginTop:10}}>
                <div className={`pref-chip ${avoidTolls ? 'active' : ''}`} onClick={() => setAvoidTolls(!avoidTolls)} role="checkbox" aria-checked={avoidTolls} tabIndex={0} onKeyDown={e => e.key === 'Enter' && setAvoidTolls(!avoidTolls)}>Avoid Tolls</div>
                <div className={`pref-chip ${avoidHighways ? 'active' : ''}`} onClick={() => setAvoidHighways(!avoidHighways)} role="checkbox" aria-checked={avoidHighways} tabIndex={0} onKeyDown={e => e.key === 'Enter' && setAvoidHighways(!avoidHighways)}>Avoid Highways</div>
              </div>
              <button className="btn btn-primary" onClick={planRoute} disabled={!origin || !destination || planning} id="plan-route-btn" style={{ marginTop: 14 }}>{planning ? '⏳ Planning...' : '🗺 Plan Route'}</button>
              {routeInfo && (
                <div className="stats-grid" style={{marginTop:14}} role="region" aria-label="Route statistics">
                  <StatCard icon="📏" label="Distance" value={routeInfo.distance} />
                  <StatCard icon="⏱" label="Duration" value={routeInfo.duration} />
                  <StatCard icon="📍" label="Legs" value={routeInfo.steps} />
                  {elevation && <StatCard icon="⛰" label="Elevation" value={elevation} />}
                  {distanceMatrix && <StatCard icon="🛣" label="Matrix Dist." value={distanceMatrix.distance?.text || '—'} />}
                  {distanceMatrix && <StatCard icon="🕐" label="Matrix Time" value={distanceMatrix.duration?.text || '—'} />}
                </div>
              )}
              {routeInfo && (
                <div style={{marginTop:14}}>
                  <div className="section-title">Save This Trip</div>
                  <div className="field" style={{marginTop:8}}><label htmlFor="trip-name">Trip Name</label><input id="trip-name" placeholder="My Road Trip" value={tripName} onChange={e => setTripName(e.target.value)} /></div>
                  <button className="btn btn-outline" onClick={saveTrip} id="save-trip-btn" style={{marginTop:8}}>💾 Save Trip</button>
                </div>
              )}
            </div>
          )}

          {/* EXPLORE TAB */}
          {activeTab === 'explore' && (
            <div role="tabpanel" aria-labelledby="tab-explore">
              <div className="section-title">Explore Near Destination</div>
              {!routeInfo && <p className="hint">Plan a route first to explore nearby places.</p>}
              {routeInfo && (
                <>
                  <div className="pref-group" style={{marginTop:8}}>
                    {placeTypes.map(pt => (<button key={pt.type} className="pref-chip active" onClick={() => explorePlaces(pt.type)}>{pt.label}</button>))}
                  </div>
                  {nearbyPlaces.length > 0 && (<div className="places-list" style={{marginTop:12}} role="list" aria-label="Nearby places">{nearbyPlaces.map((p, i) => <PlaceCard key={i} place={p} />)}</div>)}
                </>
              )}
            </div>
          )}

          {/* AI CHAT TAB */}
          {activeTab === 'ai' && (
            <div role="tabpanel" aria-labelledby="tab-ai" className="chat-container">
              <div className="section-title">🤖 TripForge AI Assistant</div>
              <p className="hint" style={{marginTop:8}}>Ask me about destinations, itineraries, packing tips, budgets, or travel safety!</p>
              <div className="chat-messages" role="list" aria-label="Chat messages" aria-live="polite">
                {chatMessages.length === 0 && <div className="chat-empty">Start a conversation!</div>}
                {chatMessages.map((msg, i) => <ChatMessage key={i} msg={msg} />)}
                {chatLoading && <div className="chat-msg model"><div className="chat-bubble"><div className="chat-sender">🤖 TripForge AI</div><div className="chat-typing"><span></span><span></span><span></span></div></div></div>}
                <div ref={chatEndRef} />
              </div>
              <div className="chat-input-group">
                <input id="chat-input" placeholder="Ask about your trip..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} aria-label="Chat message input" />
                <button className="btn btn-primary" onClick={sendChat} disabled={chatLoading || !chatInput.trim()} aria-label="Send message" style={{ minWidth: 48 }}>➤</button>
              </div>
            </div>
          )}

          {/* TRANSLATE TAB */}
          {activeTab === 'translate' && (
            <div role="tabpanel" aria-labelledby="tab-translate">
              <div className="section-title">🌐 Travel Translator</div>
              <p className="hint" style={{marginTop:8}}>Translate phrases for your trip — powered by Google Cloud Translation.</p>
              <div className="field" style={{marginTop:12}}>
                <label htmlFor="translate-input">Text to Translate</label>
                <textarea id="translate-input" className="translate-textarea" placeholder="e.g. Where is the nearest train station?" value={translateText} onChange={e => setTranslateText(e.target.value)} rows={3} aria-required="true" />
              </div>
              <div className="field" style={{marginTop:12}}>
                <label htmlFor="translate-target">Target Language</label>
                <select id="translate-target" value={translateTarget} onChange={e => setTranslateTarget(e.target.value)}>
                  {languages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" onClick={handleTranslate} disabled={translating || !translateText.trim()} style={{ marginTop: 12 }} id="translate-btn">{translating ? '⏳ Translating...' : '🌐 Translate'}</button>
              {translateResult && (
                <div className="translate-result" role="region" aria-label="Translation result" aria-live="polite">
                  <div className="translate-label">Translation</div>
                  <div className="translate-text">{translateResult}</div>
                </div>
              )}
              <div className="section-title" style={{ marginTop: 16 }}>Quick Phrases</div>
              <div className="quick-phrases">
                {['Hello, how are you?', 'Where is the bathroom?', 'How much does this cost?', 'Thank you very much!', 'I need help, please.', 'Where is the nearest hospital?'].map(phrase => (
                  <button key={phrase} className="phrase-chip" onClick={() => { setTranslateText(phrase); }}>{phrase}</button>
                ))}
              </div>
            </div>
          )}

          {/* TRIPS TAB */}
          {activeTab === 'trips' && (
            <div role="tabpanel" aria-labelledby="tab-trips">
              <div className="section-title">Saved Trips ({trips.length})</div>
              {trips.length === 0 && <p className="hint">No saved trips yet.</p>}
              {trips.map(trip => (
                <div className="trip-card" key={trip.id} onClick={() => { loadTrip(trip); setActiveTab('route'); }} role="button" tabIndex={0} aria-label={`Load trip ${trip.name}`} style={{marginTop:8}}>
                  <h4>{trip.name}</h4><p>{trip.origin} → {trip.destination}</p>
                  <div className="meta"><span style={{ fontSize: 11, color: 'var(--muted)' }}>{trip.waypoints?.length || 0} stops</span>
                    <button className="btn btn-danger" onClick={e => deleteTrip(trip.id, e)} style={{ padding: '4px 10px', fontSize: 11 }} aria-label={`Delete trip ${trip.name}`}>Delete</button></div>
                </div>
              ))}
            </div>
          )}
        </aside>

        <main className="map-container" role="main" id="main-content" aria-label="Interactive map">
          <div id="map" ref={mapRef} aria-label="Google Map"></div>
          {planning && <div className="loading-overlay"><div className="spinner"></div>Planning your route...</div>}
          {!apiKey && <div className="loading-overlay">Loading configuration...</div>}
          {routeInfo && (
            <div className="info-panel" role="region" aria-label="Route summary">
              <h3>Route: {routeInfo.summary}</h3>
              <div><span className="stat">📏 {routeInfo.distance}</span><span className="stat">⏱ {routeInfo.duration}</span><span className="stat">📍 {routeInfo.steps} leg(s)</span>{elevation && <span className="stat">⛰ {elevation}</span>}</div>
            </div>
          )}
        </main>
      </div>
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </>
  );
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

export default App;
