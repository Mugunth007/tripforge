/**
 * @fileoverview Place card component for displaying nearby places.
 * @module components/PlaceCard
 */
import { memo } from 'react';

/**
 * Displays a nearby place with its name, rating, and address.
 * Used in the Explore tab after a Places Nearby search.
 *
 * @param {Object} props
 * @param {Object} props.place - Google Places API result object
 * @param {string} props.place.name - Place name
 * @param {number} [props.place.rating] - Star rating (1-5)
 * @param {string} [props.place.vicinity] - Short address
 * @returns {JSX.Element}
 */
const PlaceCard = memo(function PlaceCard({ place }) {
  return (
    <div className="place-card" role="listitem">
      <div className="place-name">{place.name}</div>
      <div className="place-info">
        {place.rating && <span aria-label={`Rating: ${place.rating} stars`}>⭐ {place.rating}</span>}
        {place.vicinity && <span className="place-vicinity">{place.vicinity}</span>}
      </div>
    </div>
  );
});

export default PlaceCard;
