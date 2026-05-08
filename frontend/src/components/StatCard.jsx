/**
 * @fileoverview Stat card component for displaying route statistics.
 * @module components/StatCard
 */
import { memo } from 'react';

/**
 * A compact card displaying a single statistic with an icon.
 * Used in the Route tab to show distance, duration, elevation, etc.
 *
 * @param {Object} props
 * @param {string} props.icon - Emoji icon for the stat
 * @param {string} props.label - Short label (e.g., "Distance")
 * @param {string|number} props.value - The stat value to display
 * @returns {JSX.Element}
 */
const StatCard = memo(function StatCard({ icon, label, value }) {
  return (
    <div className="stat-card" role="figure" aria-label={`${label}: ${value}`}>
      <span className="stat-icon" aria-hidden="true">{icon}</span>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
});

export default StatCard;
