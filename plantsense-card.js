/**
 * PlantSense Card — a custom Lovelace card for Home Assistant.
 *
 * Mirrors the PlantSense mobile app: a plant name, a status pill, and four
 * conic-gradient dial gauges (soil moisture / light / temperature / humidity),
 * with a small battery chip. Reads any entity ids you give it — the PlantSense
 * integration's (sensor.<plant>_moisture, ..._temperature, ..._humidity,
 * ..._illuminance, ..._battery) or a locally adopted ESPHome device's
 * (sensor.plantsense_xxxxxx_soil_moisture, ..._light, ...).
 *
 * Self-contained: no build step, no external dependencies. HA loads this file
 * as a JS-module Lovelace resource. The visual approach (conic-gradient rings
 * with an icon + value + uppercase label), the stroke glyphs and the dark
 * palette match the app's marketing dials in plantsense-mobile/store-assets/gen.py.
 * Follows Home Assistant's light/dark theme (hass.themes.darkMode).
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

// Dark theme — the dashboard's .dark surfaces (plantsense-dashboard index.css)
// with gen.py's dark dial tokens (DARK_CARD / DARK_TRACK / CREAM / LEAF_LIGHT).
// Leaf, gold, orange and info stay the same in both themes.
const PALETTE_DARK = {
  paper: '#14180F', // dashboard --surface (dark)
  surface: '#1E2117', // gen.py DARK_CARD — ring centre
  ink: '#FAF8F2', // gen.py CREAM
  ink2: 'rgba(250,248,242,.72)', // gen.py CREAM2
  mute: 'rgba(250,248,242,.5)', // gen.py CREAM3
  accent: '#A8D14F', // brand-light — the accent on dark surfaces
  hair: '#2E3226', // gen.py DARK_LINE
  track: '#2E3226', // gen.py DARK_TRACK
};

// Stroke glyphs (24x24) — the same paths as gen.py's _PATHS. No emoji.
const GLYPHS = {
  drop: '<path d="M12 2.7C12 2.7 5.5 9.5 5.5 14a6.5 6.5 0 0 0 13 0c0-4.5-6.5-11.3-6.5-11.3z"/>',
  thermo: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>',
  humidity:
    '<path d="M8 3.5C8 3.5 4.5 7.5 4.5 10.2a3.5 3.5 0 0 0 7 0C11.5 7.5 8 3.5 8 3.5z"/>' +
    '<path d="M16 9c0 0-3.5 4-3.5 6.7a3.5 3.5 0 0 0 7 0C19.5 13 16 9 16 9z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  battery: '<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 11v2"/>',
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
  temperature_min: 10, // °C — maps to an empty temperature ring
  temperature_max: 35, // °C — maps to a full temperature ring
};

// The same ring range for a temperature entity reported in °F (HA converts the
// integration's °C to the user's unit system). Used unless the YAML sets its own.
const DEFAULTS_F = {
  temperature_min: 50,
  temperature_max: 95,
};

const VERSION = '1.0.0';

class PlantSenseCard extends HTMLElement {
  constructor() {
    super();
    this._config = null;
    this._userConfig = {}; // the YAML as given, to tell explicit options from defaults
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
    this._userConfig = config;
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
    // Theme colours are CSS variables keyed off this attribute — no re-render needed.
    this.toggleAttribute('dark', !!(hass.themes && hass.themes.darkMode));
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

    // Ring range in the entity's own unit unless the YAML sets one explicitly.
    const tempDefaults = temp.unit === '°F' ? DEFAULTS_F : DEFAULTS;
    const tMin = 'temperature_min' in this._userConfig ? c.temperature_min : tempDefaults.temperature_min;
    const tMax = 'temperature_max' in this._userConfig ? c.temperature_max : tempDefaults.temperature_max;

    // Ring fill fractions (0-100). Missing readings render an empty track.
    const moisturePct = clamp(moisture.value, 0, 100);
    const humidityPct = clamp(humidity.value, 0, 100);
    const lightPct = light.value == null ? null : clamp((light.value / c.illuminance_max) * 100, 0, 100);
    const tempPct =
      temp.value == null
        ? null
        : clamp(((temp.value - tMin) / (tMax - tMin)) * 100, 0, 100);

    const dials =
      this._dial('moisture', c.moisture, 'drop', fmtPct(moisture.value), 'Moisture', moisturePct, moistureColor) +
      this._dial('illuminance', c.illuminance, 'sun', fmtLux(light.value), 'Light', lightPct, PALETTE.gold) +
      this._dial('temperature', c.temperature, 'thermo', fmtTemp(temp.value), 'Temp', tempPct, PALETTE.leaf) +
      this._dial('humidity', c.humidity, 'humidity', fmtPct(humidity.value), 'Humidity', humidityPct, PALETTE.info);

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
      const bColor = low ? 'var(--ps-orange)' : 'var(--ps-mute)';
      batteryChip =
        `<div class="battery" style="color:${bColor}">` +
        `${glyph('battery', 16, 'currentColor')}${battery.value == null ? '—' : Math.round(battery.value) + '%'}</div>`;
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
  _dial(key, entityId, glyphName, valueText, label, pct, color) {
    const deg = pct == null ? 0 : Math.round(pct * 3.6);
    const attr = entityId ? ` data-entity="${esc(entityId)}"` : '';
    const clickable = entityId ? ' clickable' : '';
    return (
      `<div class="dial${clickable}"${attr}>` +
      `<div class="ring" style="background:conic-gradient(${color} ${deg}deg, var(--ps-track) 0deg)">` +
      `<div class="ring-in">` +
      `<div class="ic">${glyph(glyphName, 24, color)}</div>` +
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
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hr ago`;
    const d = Math.floor(h / 24);
    return `${d} day${d > 1 ? 's' : ''} ago`;
  }

  _css() {
    const P = PALETTE;
    const D = PALETTE_DARK;
    return `
      :host {
        --ps-paper: ${P.paper};
        --ps-ink: ${P.ink}; --ps-ink2: ${P.ink2}; --ps-mute: ${P.mute};
        --ps-accent: ${P.accent}; --ps-leaf: ${P.leaf}; --ps-orange: ${P.orange};
        --ps-hair: ${P.hair}; --ps-track: ${P.track}; --ps-surface: ${P.surface};
      }
      :host([dark]) {
        --ps-paper: ${D.paper};
        --ps-ink: ${D.ink}; --ps-ink2: ${D.ink2}; --ps-mute: ${D.mute};
        --ps-accent: ${D.accent};
        --ps-hair: ${D.hair}; --ps-track: ${D.track}; --ps-surface: ${D.surface};
      }
      ha-card {
        background: var(--ps-paper);
        border: 1px solid var(--ps-hair);
        border-radius: 18px;
        overflow: hidden;
        font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
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
      .ic { line-height: 0; }
      .val { font-size: 22px; font-weight: 700; color: var(--ps-ink); margin-top: 4px; letter-spacing: -0.5px; }
      .dlabel {
        font-size: 11px; font-weight: 700; color: var(--ps-mute); margin-top: 10px;
        letter-spacing: 1.5px; text-transform: uppercase;
      }
      /* battery footer */
      .foot { display: flex; justify-content: center; margin-top: 16px; }
      .battery { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; }
    `;
  }

  // Card-picker stub config. Prefills the first device of the PlantSense
  // integration when there is one (so the picker preview shows real readings),
  // otherwise ESPHome-style placeholders to edit.
  static getStubConfig(hass) {
    const stub = {
      type: 'custom:plantsense-card',
      name: 'Monstera',
      location: 'Living room',
      moisture: 'sensor.plantsense_xxxxxx_soil_moisture',
      temperature: 'sensor.plantsense_xxxxxx_temperature',
      humidity: 'sensor.plantsense_xxxxxx_humidity',
      illuminance: 'sensor.plantsense_xxxxxx_light',
      battery: 'sensor.plantsense_xxxxxx_battery',
    };
    const registry = (hass && hass.entities) || {};
    const byDevice = {};
    for (const [entityId, entry] of Object.entries(registry)) {
      if (entry.platform !== 'plantsense' || !entry.device_id) continue;
      (byDevice[entry.device_id] = byDevice[entry.device_id] || []).push(entityId);
    }
    const deviceId = Object.keys(byDevice)[0];
    if (!deviceId) return stub;
    const ids = byDevice[deviceId];
    // Match on device class first (survives renamed entity ids), entity id suffix second.
    const pick = (deviceClass, suffix) =>
      ids.find((id) => ((hass.states[id] || {}).attributes || {}).device_class === deviceClass) ||
      ids.find((id) => id.endsWith(`_${suffix}`));
    const device = (hass.devices || {})[deviceId] || {};
    return {
      type: 'custom:plantsense-card',
      name: device.name_by_user || device.name || 'PlantSense',
      moisture: pick('moisture', 'moisture'),
      temperature: pick('temperature', 'temperature'),
      humidity: pick('humidity', 'humidity'),
      illuminance: pick('illuminance', 'illuminance'),
      battery: pick('battery', 'battery'),
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

// One gen.py stroke glyph as inline SVG, stroked in `color`.
function glyph(name, size, color) {
  return (
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" ` +
    `stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:block">${GLYPHS[name]}</svg>`
  );
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
  description: 'Plant health at a glance — moisture, light, temperature and humidity dials for a PlantSense sensor.',
  preview: true,
  documentationURL: 'https://myplantsense.com/docs/home-assistant',
});

// eslint-disable-next-line no-console
console.info(
  `%c PLANTSENSE-CARD %c v${VERSION} `,
  'color:#FAF8F2;background:#5E8A2A;font-weight:700;border-radius:4px 0 0 4px;padding:2px 6px',
  'color:#5E8A2A;background:#ECE8DC;border-radius:0 4px 4px 0;padding:2px 6px'
);
