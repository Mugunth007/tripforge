/**
 * @fileoverview Info tab component displaying destination details.
 * Shows timezone, elevation, and integrated Google services.
 * @module components/tabs/InfoTab
 */
import StatCard from '../StatCard';
import { GOOGLE_SERVICES } from '../../utils/constants';

/**
 * Info tab panel showing destination metadata and integrated services.
 * Displays timezone, elevation, and a list of all Google APIs in use.
 *
 * @param {Object} props
 * @param {Object|null} props.routeInfo - Current route information
 * @param {string|null} props.timezone - Destination timezone name
 * @param {string|null} props.elevation - Destination elevation string
 * @param {string|null} props.staticMapUrl - Static map image URL for the destination
 * @returns {JSX.Element}
 */
export default function InfoTab({ routeInfo, timezone, elevation, staticMapUrl }) {
  return (
    <div role="tabpanel" aria-labelledby="tab-info">
      <div className="section-title">⏰ Destination Info</div>

      {!routeInfo && (
        <p className="hint">Plan a route first to see destination details.</p>
      )}

      {routeInfo && (
        <>
          <div className="stats-grid" style={{ marginTop: 12 }}>
            {timezone && <StatCard icon="🕐" label="Local Timezone" value={timezone} />}
            {elevation && <StatCard icon="⛰" label="Elevation" value={elevation} />}
            <StatCard icon="📏" label="Distance" value={routeInfo.distance} />
            <StatCard icon="⏱" label="Duration" value={routeInfo.duration} />
          </div>

          {/* Static map preview */}
          {staticMapUrl && (
            <div className="static-map-preview" style={{ marginTop: 16 }}>
              <div className="section-title">Map Preview</div>
              <img
                src={staticMapUrl}
                alt={`Static map of ${routeInfo.summary}`}
                className="static-map-img"
                loading="lazy"
              />
            </div>
          )}
        </>
      )}

      {/* Google Services list */}
      <div className="section-title" style={{ marginTop: 16 }}>
        Integrated Google Services ({GOOGLE_SERVICES.length})
      </div>
      <div className="services-grid" style={{ marginTop: 8 }}>
        {GOOGLE_SERVICES.map((service) => (
          <div key={service} className="service-chip">
            <span className="service-dot" aria-hidden="true" />
            {service}
          </div>
        ))}
      </div>
    </div>
  );
}
