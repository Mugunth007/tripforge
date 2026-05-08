/**
 * @fileoverview Route planning tab component.
 * Handles origin/destination input, waypoint management, preferences, and route display.
 * @module components/tabs/RouteTab
 */
import { useCallback } from 'react';
import StatCard from '../StatCard';
import { TRAVEL_MODES } from '../../utils/constants';

/**
 * Route tab panel containing all route planning controls.
 *
 * @param {Object} props
 * @param {string} props.origin - Origin location string
 * @param {function} props.setOrigin - Origin state setter
 * @param {string} props.destination - Destination location string
 * @param {function} props.setDestination - Destination state setter
 * @param {string} props.waypointInput - Current waypoint input value
 * @param {function} props.setWaypointInput - Waypoint input setter
 * @param {string[]} props.waypoints - Array of waypoint strings
 * @param {function} props.setWaypoints - Waypoints array setter
 * @param {string} props.travelMode - Selected travel mode
 * @param {function} props.setTravelMode - Travel mode setter
 * @param {boolean} props.avoidTolls - Whether to avoid tolls
 * @param {function} props.setAvoidTolls - Avoid tolls setter
 * @param {boolean} props.avoidHighways - Whether to avoid highways
 * @param {function} props.setAvoidHighways - Avoid highways setter
 * @param {Object|null} props.routeInfo - Computed route information
 * @param {string|null} props.elevation - Destination elevation string
 * @param {Object|null} props.distanceMatrix - Distance Matrix result
 * @param {string|null} props.timezone - Destination timezone string
 * @param {boolean} props.planning - Whether a route is being planned
 * @param {function} props.onPlanRoute - Callback to trigger route planning
 * @param {string} props.tripName - Trip name for saving
 * @param {function} props.setTripName - Trip name setter
 * @param {function} props.onSaveTrip - Callback to save the current trip
 * @returns {JSX.Element}
 */
export default function RouteTab({
  origin, setOrigin, destination, setDestination,
  waypointInput, setWaypointInput, waypoints, setWaypoints,
  travelMode, setTravelMode, avoidTolls, setAvoidTolls,
  avoidHighways, setAvoidHighways, routeInfo, elevation,
  distanceMatrix, timezone, planning, onPlanRoute,
  tripName, setTripName, onSaveTrip,
}) {
  /** Adds the current waypoint input to the waypoints array */
  const addWaypoint = useCallback(() => {
    if (!waypointInput.trim()) return;
    setWaypoints((prev) => [...prev, waypointInput.trim()]);
    setWaypointInput('');
  }, [waypointInput, setWaypoints, setWaypointInput]);

  /** Removes a waypoint by index */
  const removeWaypoint = useCallback((index) => {
    setWaypoints((prev) => prev.filter((_, j) => j !== index));
  }, [setWaypoints]);

  return (
    <div role="tabpanel" aria-labelledby="tab-route">
      <div className="section-title">Plan Your Route</div>

      {/* Origin */}
      <div className="field">
        <label htmlFor="origin-input">Origin</label>
        <input
          id="origin-input"
          placeholder="e.g. San Francisco"
          defaultValue={origin}
          onChange={(e) => setOrigin(e.target.value)}
          aria-required="true"
        />
      </div>

      {/* Destination */}
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="dest-input">Destination</label>
        <input
          id="dest-input"
          placeholder="e.g. Los Angeles"
          defaultValue={destination}
          onChange={(e) => setDestination(e.target.value)}
          aria-required="true"
        />
      </div>

      {/* Waypoint input */}
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="waypoint-input">Add Stop</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="waypoint-input"
            placeholder="e.g. Santa Barbara"
            value={waypointInput}
            onChange={(e) => setWaypointInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addWaypoint()}
          />
          <button
            className="btn btn-outline"
            onClick={addWaypoint}
            aria-label="Add waypoint"
            style={{ minWidth: 48 }}
          >+</button>
        </div>
      </div>

      {/* Waypoints list */}
      {waypoints.map((w, i) => (
        <div className="waypoint-item" key={`wp-${i}`} style={{ marginTop: 8 }}>
          <span style={{ flex: 1 }}>{i + 1}. {w}</span>
          <button onClick={() => removeWaypoint(i)} aria-label={`Remove ${w}`}>✕</button>
        </div>
      ))}

      {/* Preferences */}
      <div className="section-title" style={{ marginTop: 16 }}>Preferences</div>
      <div className="field">
        <label htmlFor="travel-mode">Travel Mode</label>
        <select id="travel-mode" value={travelMode} onChange={(e) => setTravelMode(e.target.value)}>
          {TRAVEL_MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>
      <div className="pref-group" style={{ marginTop: 10 }}>
        <div
          className={`pref-chip ${avoidTolls ? 'active' : ''}`}
          onClick={() => setAvoidTolls(!avoidTolls)}
          role="checkbox"
          aria-checked={avoidTolls}
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setAvoidTolls(!avoidTolls)}
        >Avoid Tolls</div>
        <div
          className={`pref-chip ${avoidHighways ? 'active' : ''}`}
          onClick={() => setAvoidHighways(!avoidHighways)}
          role="checkbox"
          aria-checked={avoidHighways}
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setAvoidHighways(!avoidHighways)}
        >Avoid Highways</div>
      </div>

      {/* Plan button */}
      <button
        className="btn btn-primary"
        onClick={onPlanRoute}
        disabled={!origin || !destination || planning}
        id="plan-route-btn"
        style={{ marginTop: 14 }}
      >
        {planning ? '⏳ Planning...' : '🗺 Plan Route'}
      </button>

      {/* Route stats */}
      {routeInfo && (
        <div className="stats-grid" style={{ marginTop: 14 }} role="region" aria-label="Route statistics">
          <StatCard icon="📏" label="Distance" value={routeInfo.distance} />
          <StatCard icon="⏱" label="Duration" value={routeInfo.duration} />
          <StatCard icon="📍" label="Legs" value={routeInfo.steps} />
          {elevation && <StatCard icon="⛰" label="Elevation" value={elevation} />}
          {distanceMatrix && <StatCard icon="🛣" label="Matrix Dist." value={distanceMatrix.distance?.text || '—'} />}
          {distanceMatrix && <StatCard icon="🕐" label="Matrix Time" value={distanceMatrix.duration?.text || '—'} />}
          {timezone && <StatCard icon="🕐" label="Timezone" value={timezone} />}
        </div>
      )}

      {/* Save trip */}
      {routeInfo && (
        <div style={{ marginTop: 14 }}>
          <div className="section-title">Save This Trip</div>
          <div className="field" style={{ marginTop: 8 }}>
            <label htmlFor="trip-name">Trip Name</label>
            <input
              id="trip-name"
              placeholder="My Road Trip"
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
            />
          </div>
          <button className="btn btn-outline" onClick={onSaveTrip} id="save-trip-btn" style={{ marginTop: 8 }}>
            💾 Save Trip
          </button>
        </div>
      )}
    </div>
  );
}
