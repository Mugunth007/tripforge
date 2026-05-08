/**
 * @fileoverview Translation tab component powered by Google Cloud Translation API.
 * @module components/tabs/TranslateTab
 */
import { LANGUAGES, QUICK_PHRASES } from '../../utils/constants';

/**
 * Translation tab panel with text input, language selector, and quick phrases.
 *
 * @param {Object} props
 * @param {string} props.translateText - Current text to translate
 * @param {function} props.setTranslateText - Text input setter
 * @param {string} props.translateTarget - Target language code
 * @param {function} props.setTranslateTarget - Target language setter
 * @param {string|null} props.translateResult - Translation result text
 * @param {boolean} props.translating - Whether a translation is in progress
 * @param {function} props.onTranslate - Callback to trigger translation
 * @returns {JSX.Element}
 */
export default function TranslateTab({
  translateText, setTranslateText,
  translateTarget, setTranslateTarget,
  translateResult, translating, onTranslate,
}) {
  return (
    <div role="tabpanel" aria-labelledby="tab-translate">
      <div className="section-title">🌐 Travel Translator</div>
      <p className="hint" style={{ marginTop: 8 }}>
        Translate phrases for your trip — powered by Google Cloud Translation.
      </p>

      {/* Text input */}
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="translate-input">Text to Translate</label>
        <textarea
          id="translate-input"
          className="translate-textarea"
          placeholder="e.g. Where is the nearest train station?"
          value={translateText}
          onChange={(e) => setTranslateText(e.target.value)}
          rows={3}
          aria-required="true"
        />
      </div>

      {/* Language selector */}
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="translate-target">Target Language</label>
        <select
          id="translate-target"
          value={translateTarget}
          onChange={(e) => setTranslateTarget(e.target.value)}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.name}</option>
          ))}
        </select>
      </div>

      {/* Translate button */}
      <button
        className="btn btn-primary"
        onClick={onTranslate}
        disabled={translating || !translateText.trim()}
        style={{ marginTop: 12 }}
        id="translate-btn"
      >
        {translating ? '⏳ Translating...' : '🌐 Translate'}
      </button>

      {/* Result */}
      {translateResult && (
        <div className="translate-result" role="region" aria-label="Translation result" aria-live="polite">
          <div className="translate-label">Translation</div>
          <div className="translate-text">{translateResult}</div>
        </div>
      )}

      {/* Quick phrases */}
      <div className="section-title" style={{ marginTop: 16 }}>Quick Phrases</div>
      <div className="quick-phrases">
        {QUICK_PHRASES.map((phrase) => (
          <button
            key={phrase}
            className="phrase-chip"
            onClick={() => setTranslateText(phrase)}
            aria-label={`Use phrase: ${phrase}`}
          >
            {phrase}
          </button>
        ))}
      </div>
    </div>
  );
}
