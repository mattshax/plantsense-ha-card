/**
 * PlantSense Card — a custom Lovelace card for Home Assistant.
 *
 * Mirrors the PlantSense mobile app: a plant name, a status pill, and four
 * conic-gradient dial gauges (soil moisture / light / temperature / humidity),
 * with a small battery chip. Reads the ESPHome-native entities the device
 * auto-creates in HA (sensor.<device>_soil_moisture, ..._temperature,
 * ..._humidity, ..._light, ..._battery).
 *
 * Self-contained: no build step, no external dependencies. HA loads this file
 * as a JS-module Lovelace resource. The visual approach (conic-gradient rings
 * with an icon + value + uppercase label) matches the app's marketing dials in
 * plantsense-mobile/store-assets/gen.py.
 */

// --- "Grove" brand palette (mirrors plantsense-web globals.css / gen.py) -----
const PALETTE = {
  paper: '#FAF8F2', // warm paper background (the card surface)
  surface: '#FFFFFF', // ring centre / inner disc — makes the rings pop
  ink: '#16180F', // primary text (warm near-black)
  ink2: '#5C6152', // secondary text
  mute: '#8B907E', // tertiary text (sublabels, dial labels)
  accent: '#5E8A2A', // brand-dark — the one green accent on paper
  leaf: '#89B73F', // brand — healthy ring fill
  gold: '#E3A82E', // sun / light dial (distinct from the alert orange)
  orange: '#E8902B', // highlight — ALERTS ONLY (needs water / too wet / low batt)
  info: '#53B7FF', // humidity dial
  hair: '#E7E3D6', // hairline borders
  track: '#ECE8DC', // unfilled portion of a dial ring (warm stone)
};

// --- Config defaults ---------------------------------------------------------
// The moisture healthy band drives the status pill AND the moisture ring colour
// (green in-range, orange out-of-range — same behaviour as the app). Light and
// temperature have no natural 0-100 scale, so their ring fill is mapped against
// a configurable display range. These are display-only and never change the
// underlying reading.
const DEFAULTS = {
  name: 'PlantSense',
  moisture_min: 15, // % — below this the pill reads "Needs water" (repo default;
  moisture_max: 60, // % — above this "Too wet". See plantsense-infra/homeassistant/
                    // plantsense-plant-thresholds.md — succulents 5–15, tropicals 25–60.
  illuminance_max: 20000, // lux mapped to a full light ring
  temperature_min: 10, // maps to an empty temperature ring
  temperature_max: 35, // maps to a full temperature ring
};

const VERSION = '1.0.0';

class PlantSenseCard extends HTMLElement {
  constructor() {
    super();
    this._config = null;
    this._hass = null;
    this._root = null; // the content container we re-render into
    this.attachShadow({ mode: 'open' });
  }

  /**
   * Lovelace calls this once with the card's YAML config. Throw on hard errors
   * only — missing/typo'd entities are handled gracefully at render time (they
   * render as "—") so a partially-configured card is still useful.
   */
  setConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('PlantSense card: invalid configuration');
    }
    // Accept `illuminance` (documented) or `light` (ESPHome entity noun) alias.
    const illuminance = config.illuminance || config.light || null;
    this._config = {
      ...DEFAULTS,
      ...config,
      illuminance,
    };
    // Force a rebuild of the DOM skeleton on the next render.
    this._root = null;
    if (this._hass) this._render();
  }

  /**
   * HA sets this on every global state change. Re-render only when one of our
   * watched entities actually changed (cheap identity check — HA replaces the
   * state object on change) so a busy HA doesn't rebuild this card constantly.
   */
  set hass(hass) {
    const prev = this._hass;
    this._hass = hass;
    if (!this._config) return;
    if (!prev || !this._root || this._entitiesChanged(prev, hass)) {
      this._render();
    }
  }

  getCardSize() {
    return 4;
  }

  // Entity ids we depend on, for the change check + more-info wiring.
  _watchedEntities() {
    const c = this._config;
    return [c.moisture, c.temperature, c.humidity, c.illuminance, c.battery].filter(Boolean);
  }

  _entitiesChanged(prev, next) {
    for (const id of this._watchedEntities()) {
      if (prev.states[id] !== next.states[id]) return true;
    }
    return false;
  }

  // --- state helpers ---------------------------------------------------------

  /**
   * Resolve one entity to a numeric value + metadata. Returns value === null
   * for missing / unavailable / unknown / non-numeric states so callers can
   * uniformly render "—".
   */
  _read(entityId) {
    const out = { value: null, unit: null, lastUpdated: null, exists: false };
    if (!entityId || !this._hass) return out;
    const st = this._hass.states[entityId];
    if (!st) return out;
    out.exists = true;
    out.unit = (st.attributes && st.attributes.unit_of_measurement) || null;
    out.lastUpdated = st.last_updated || st.last_changed || null;
    const raw = st.state;
    if (raw == null || raw === 'unavailable' || raw === 'unknown' || raw === '') return out;
    const n = parseFloat(raw);
    out.value = Number.isNaN(n) ? null : n;
    return out;
  }

  // Moisture status → pill + moisture ring colour.
  _moistureStatus(mVal) {
    const { moisture_min: lo, moisture_max: hi } = this._config;
    if (mVal == null) return { text: 'No data', kind: 'none' };
    if (mVal < lo) return { text: 'Needs water', kind: 'dry' };
    if (mVal > hi) return { text: 'Too wet', kind: 'wet' };
    return { text: 'Healthy', kind: 'ok' };
  }

  // --- rendering -------------------------------------------------------------

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._root) this._buildSkeleton();

    const c = this._config;
    const moisture = this._read(c.moisture);
    const temp = this._read(c.temperature);
    const humidity = this._read(c.humidity);
    const light = this._read(c.illuminance);
    const battery = this._read(c.battery);

    const status = this._moistureStatus(moisture.value);
    const moistureColor = status.kind === 'ok' || status.kind === 'none' ? PALETTE.leaf : PALETTE.orange;

    // Ring fill fractions (0-100). Missing readings render an empty track.
    const moisturePct = clamp(moisture.value, 0, 100);
    const humidityPct = clamp(humidity.value, 0, 100);
    const lightPct = light.value == null ? null : clamp((light.value / c.illuminance_max) * 100, 0, 100);
    const tempPct =
      temp.value == null
        ? null
        : clamp(((temp.value - c.temperature_min) / (c.temperature_max - c.temperature_min)) * 100, 0, 100);

    const dials =
      this._dial('moisture', c.moisture, '💧', fmtPct(moisture.value), 'Moisture', moisturePct, moistureColor) +
      this._dial('illuminance', c.illuminance, '☀', fmtLux(light.value), 'Light', lightPct, PALETTE.gold) +
      this._dial('temperature', c.temperature, '🌡', fmtTemp(temp.value), 'Temp', tempPct, PALETTE.leaf) +
      this._dial('humidity', c.humidity, '💨', fmtPct(humidity.value), 'Humidity', humidityPct, PALETTE.info);

    // Sub-heading: "<location> · updated <relative>".
    const subParts = [];
    if (c.location) subParts.push(esc(c.location));
    const ago = this._ago(moisture.lastUpdated || temp.lastUpdated || humidity.lastUpdated || light.lastUpdated);
    if (ago) subParts.push('updated ' + ago);
    const subhead = subParts.join(' · ');

    // Battery chip (footer). Hidden entirely when no battery entity is set.
    let batteryChip = '';
    if (c.battery) {
      const low = battery.value != null && battery.value < 20;
      const bColor = low ? PALETTE.orange : PALETTE.mute;
      batteryChip =
        `<div class="battery" style="color:${bColor}">` +
        `<span class="bic">🔋</span>${battery.value == null ? '—' : Math.round(battery.value) + '%'}</div>`;
    }

    this._root.innerHTML =
      `<div class="head">` +
      `<div class="title">${esc(c.name)}</div>` +
      `<div class="pill ${status.kind}">${status.text}</div>` +
      `</div>` +
      (subhead ? `<div class="subhead">${subhead}</div>` : '') +
      `<div class="dials">${dials}</div>` +
      (batteryChip ? `<div class="foot">${batteryChip}</div>` : '');
  }

  /** One conic-gradient dial. `pct` null → empty track (no reading). */
  _dial(key, entityId, icon, valueText, label, pct, color) {
    const deg = pct == null ? 0 : Math.round(pct * 3.6);
    const attr = entityId ? ` data-entity="${esc(entityId)}"` : '';
    const clickable = entityId ? ' clickable' : '';
    return (
      `<div class="dial${clickable}"${attr}>` +
      `<div class="ring" style="background:conic-gradient(${color} ${deg}deg, ${PALETTE.track} 0deg)">` +
      `<div class="ring-in">` +
      `<div class="ic">${icon}</div>` +
      `<div class="val">${valueText}</div>` +
      `</div></div>` +
      `<div class="dlabel">${label}</div>` +
      `</div>`
    );
  }

  // Build the shadow DOM skeleton (style + <ha-card>) once, then re-render only
  // the inner content on state changes. Delegated click opens the entity's
  // more-info dialog — the standard HA card affordance.
  _buildSkeleton() {
    this.shadowRoot.innerHTML = `<style>${this._css()}</style><ha-card><div class="ps-root"></div></ha-card>`;
    this._root = this.shadowRoot.querySelector('.ps-root');
    this._root.addEventListener('click', (ev) => {
      const dial = ev.composedPath().find((el) => el.dataset && el.dataset.entity);
      if (!dial) return;
      const e = new Event('hass-more-info', { bubbles: true, composed: true });
      e.detail = { entityId: dial.dataset.entity };
      this.dispatchEvent(e);
    });
  }

  // Relative "time ago" for the sub-heading (dependency-free).
  _ago(iso) {
    if (!iso) return null;
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return null;
    const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (s < 45) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hr ago`;
    const d = Math.floor(h / 24);
    return `${d} day${d > 1 ? 's' : ''} ago`;
  }

  _css() {
    const P = PALETTE;
    return `
      :host {
        --ps-ink: ${P.ink}; --ps-ink2: ${P.ink2}; --ps-mute: ${P.mute};
        --ps-accent: ${P.accent}; --ps-leaf: ${P.leaf}; --ps-orange: ${P.orange};
        --ps-hair: ${P.hair}; --ps-track: ${P.track}; --ps-surface: ${P.surface};
      }
      ha-card {
        background: ${P.paper};
        border: 1px solid var(--ps-hair);
        border-radius: 18px;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .ps-root { padding: 16px 18px 18px; }
      .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
      .title { font-size: 22px; font-weight: 700; color: var(--ps-ink); letter-spacing: -0.4px; }
      .subhead { font-size: 13px; font-weight: 600; color: var(--ps-mute); margin-top: 4px; }
      /* status pill */
      .pill {
        font-size: 13px; font-weight: 700; padding: 5px 14px; border-radius: 999px;
        border: 1.5px solid var(--ps-hair); color: var(--ps-mute); white-space: nowrap;
      }
      .pill.ok { color: var(--ps-accent); border-color: ${P.leaf}66; background: rgba(137,183,63,.10); }
      .pill.dry, .pill.wet { color: var(--ps-orange); border-color: ${P.orange}66; background: rgba(232,144,43,.09); }
      .pill.none { color: var(--ps-mute); border-color: var(--ps-hair); background: rgba(139,144,126,.08); }
      /* dial grid */
      .dials {
        display: grid; grid-template-columns: 1fr 1fr; gap: 14px 10px;
        justify-items: center; margin-top: 16px;
      }
      .dial { display: flex; flex-direction: column; align-items: center; }
      .dial.clickable { cursor: pointer; }
      .ring {
        width: 108px; height: 108px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
      }
      .ring-in {
        width: 78%; height: 78%; background: var(--ps-surface); border-radius: 50%;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
      }
      .ic { font-size: 24px; line-height: 1; }
      .val { font-size: 22px; font-weight: 700; color: var(--ps-ink); margin-top: 4px; letter-spacing: -0.5px; }
      .dlabel {
        font-size: 11px; font-weight: 700; color: var(--ps-mute); margin-top: 10px;
        letter-spacing: 1.5px; text-transform: uppercase;
      }
      /* battery footer */
      .foot { display: flex; justify-content: center; margin-top: 16px; }
      .battery { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; }
      .bic { font-size: 15px; }
    `;
  }

  // Card-picker stub config (prefills the visual editor with placeholders).
  static getStubConfig() {
    return {
      type: 'custom:plantsense-card',
      name: 'Monstera',
      location: 'Living room',
      moisture: 'sensor.plantsense_xxxxxx_soil_moisture',
      temperature: 'sensor.plantsense_xxxxxx_temperature',
      humidity: 'sensor.plantsense_xxxxxx_humidity',
      illuminance: 'sensor.plantsense_xxxxxx_light',
      battery: 'sensor.plantsense_xxxxxx_battery',
    };
  }
}

// --- pure formatters ---------------------------------------------------------

function clamp(v, lo, hi) {
  if (v == null) return null;
  return Math.max(lo, Math.min(hi, v));
}

function fmtPct(v) {
  return v == null ? '—' : Math.round(v) + '%';
}

function fmtTemp(v) {
  return v == null ? '—' : Math.round(v) + '°';
}

// Compact lux: 850 -> "850", 8500 -> "8.5k", 12000 -> "12k".
function fmtLux(v) {
  if (v == null) return '—';
  if (v >= 10000) return Math.round(v / 1000) + 'k';
  if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.round(v));
}

// Escape user-supplied text before it goes into innerHTML.
function esc(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
  );
}

// --- registration ------------------------------------------------------------

if (!customElements.get('plantsense-card')) {
  customElements.define('plantsense-card', PlantSenseCard);
}

// Advertise the card to Lovelace's "Add card" picker.
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'plantsense-card',
  name: 'PlantSense Card',
  description: 'Plant health at a glance — moisture, light, temperature and humidity dials for an ESPHome PlantSense sensor.',
  preview: true,
  documentationURL: 'https://myplantsense.com/docs/home-assistant',
});

// eslint-disable-next-line no-console
console.info(
  `%c PLANTSENSE-CARD %c v${VERSION} `,
  'color:#FAF8F2;background:#5E8A2A;font-weight:700;border-radius:4px 0 0 4px;padding:2px 6px',
  'color:#5E8A2A;background:#ECE8DC;border-radius:0 4px 4px 0;padding:2px 6px'
);
