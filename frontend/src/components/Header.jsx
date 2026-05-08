/**
 * @fileoverview Application header with branding and service badges.
 * @module components/Header
 */
import { memo } from 'react';
import { APP_NAME, GOOGLE_SERVICES } from '../utils/constants';

/**
 * Application header bar with gradient title, API badges, and service count.
 * Sticky-positioned at the top with a glassmorphism backdrop blur.
 *
 * @returns {JSX.Element}
 */
const Header = memo(function Header() {
  return (
    <header className="app-bar" role="banner">
      <h1>✈ {APP_NAME}</h1>
      <div className="header-badges">
        <span className="badge badge-accent">Google Cloud</span>
        <span className="badge badge-services">{GOOGLE_SERVICES.length} APIs</span>
        <span className="badge badge-success badge-pulse">Live</span>
      </div>
    </header>
  );
});

export default Header;
