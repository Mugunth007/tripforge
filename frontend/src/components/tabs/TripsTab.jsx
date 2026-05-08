/**
 * @fileoverview Trips tab component for managing saved trips.
 * @module components/tabs/TripsTab
 */

/**
 * Trips tab panel for viewing, loading, and deleting saved trips.
 *
 * @param {Object} props
 * @param {Array} props.trips - Array of saved trip objects
 * @param {function} props.onLoadTrip - Callback invoked with a trip object to load
 * @param {function} props.onDeleteTrip - Callback invoked with (tripId, event)
 * @returns {JSX.Element}
 */
export default function TripsTab({ trips, onLoadTrip, onDeleteTrip }) {
  return (
    <div role="tabpanel" aria-labelledby="tab-trips">
      <div className="section-title">Saved Trips ({trips.length})</div>

      {trips.length === 0 && (
        <p className="hint">No saved trips yet. Plan a route and save it!</p>
      )}

      {trips.map((trip) => (
        <div
          className="trip-card"
          key={trip.id}
          onClick={() => onLoadTrip(trip)}
          role="button"
          tabIndex={0}
          aria-label={`Load trip ${trip.name}`}
          onKeyDown={(e) => e.key === 'Enter' && onLoadTrip(trip)}
          style={{ marginTop: 8 }}
        >
          <h4>{trip.name}</h4>
          <p>{trip.origin} → {trip.destination}</p>
          <div className="meta">
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {trip.waypoints?.length || 0} stops
            </span>
            <button
              className="btn btn-danger"
              onClick={(e) => onDeleteTrip(trip.id, e)}
              style={{ padding: '4px 10px', fontSize: 11 }}
              aria-label={`Delete trip ${trip.name}`}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
