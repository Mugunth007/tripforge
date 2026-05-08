/**
 * @fileoverview Custom hook for toast notification management.
 * Provides a simple API to show timed toast messages.
 * @module hooks/useToast
 */
import { useState, useCallback } from 'react';

/**
 * Custom hook for managing toast notifications.
 * Automatically clears the toast after 3 seconds.
 * @returns {[string, function(string): void, function(): void]}
 *   [toast, showToast, clearToast]
 * @example
 * const [toast, showToast, clearToast] = useToast();
 * showToast('Trip saved!');
 */
export function useToast() {
  const [toast, setToast] = useState('');

  /** @param {string} message - Toast message to display */
  const showToast = useCallback((message) => {
    setToast(message);
  }, []);

  /** Clears the current toast */
  const clearToast = useCallback(() => {
    setToast('');
  }, []);

  return [toast, showToast, clearToast];
}
