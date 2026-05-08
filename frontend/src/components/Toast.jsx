/**
 * @fileoverview Toast notification component.
 * Displays a temporary message that auto-dismisses after 3 seconds.
 * @module components/Toast
 */
import { useEffect, memo } from 'react';

/**
 * Toast notification that appears at the top-right of the screen.
 * Automatically dismisses after 3000ms.
 *
 * @param {Object} props
 * @param {string} props.message - The notification text to display
 * @param {function} props.onDone - Callback to invoke when the toast expires
 * @returns {JSX.Element}
 */
const Toast = memo(function Toast({ message, onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3000);
    return () => clearTimeout(timer);
  }, [message, onDone]);

  return (
    <div className="toast" role="alert" aria-live="assertive">
      {message}
    </div>
  );
});

export default Toast;
