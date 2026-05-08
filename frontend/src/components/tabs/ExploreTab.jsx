/**
 * @fileoverview Explore tab component for discovering nearby places.
 * @module components/tabs/ExploreTab
 */
import PlaceCard from '../PlaceCard';
import { PLACE_TYPES } from '../../utils/constants';

/**
 * Explore tab panel for finding nearby attractions, restaurants, hotels, etc.
 * Requires a planned route before places can be searched.
 *
 * @param {Object} props
 * @param {Object|null} props.routeInfo - Current route information (null if no route planned)
 * @param {Array} props.nearbyPlaces - Array of Google Places results
 * @param {function} props.onExplorePlaces - Callback invoked with a place type string
 * @returns {JSX.Element}
 */
export default function ExploreTab({ routeInfo, nearbyPlaces, onExplorePlaces }) {
  return (
    <div role="tabpanel" aria-labelledby="tab-explore">
      <div className="section-title">Explore Near Destination</div>

      {!routeInfo && (
        <p className="hint">Plan a route first to explore nearby places.</p>
      )}

      {routeInfo && (
        <>
          <div className="pref-group" style={{ marginTop: 8 }}>
            {PLACE_TYPES.map((pt) => (
              <button
                key={pt.type}
                className="pref-chip active"
                onClick={() => onExplorePlaces(pt.type)}
                aria-label={`Search for ${pt.label}`}
              >
                {pt.label}
              </button>
            ))}
          </div>

          {nearbyPlaces.length > 0 && (
            <div
              className="places-list"
              style={{ marginTop: 12 }}
              role="list"
              aria-label="Nearby places"
            >
              {nearbyPlaces.map((place, i) => (
                <PlaceCard key={`place-${i}`} place={place} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
