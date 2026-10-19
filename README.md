# PlantSense Card

[![Open your Home Assistant instance and open this repository in HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=mattshax&repository=plantsense-ha-card&category=plugin)
[![Validate](https://github.com/mattshax/plantsense-ha-card/actions/workflows/validate.yaml/badge.svg)](https://github.com/mattshax/plantsense-ha-card/actions/workflows/validate.yaml)

A dashboard card for Home Assistant that shows a [PlantSense](https://myplantsense.com)
soil sensor the way the PlantSense app does: the plant name, a **Healthy /
Needs water / Too wet** status pill, and dials for **soil moisture, light,
temperature and humidity**, plus the battery level. It follows Home
Assistant's light and dark themes.

![PlantSense cards on a Home Assistant dashboard, light theme](https://raw.githubusercontent.com/mattshax/plantsense-ha-card/main/docs/card-light.png)

![The same cards in the dark theme](https://raw.githubusercontent.com/mattshax/plantsense-ha-card/main/docs/card-dark.png)

## Requirements

PlantSense sensors in Home Assistant, through either:

- the [PlantSense integration](https://github.com/mattshax/plantsense-ha-integration)
  (recommended): reads your sensors from your PlantSense account, so readings
  are there even while a sensor sleeps. Entities look like
  `sensor.fiddle_leaf_fig_moisture`, named after your plant; or
- a sensor adopted locally through
  [ESPHome](https://www.home-assistant.io/integrations/esphome/). Entities look
  like `sensor.plantsense_a1b2c3_soil_moisture`.

The card only reads entities, so it works the same with either.

## Installation

### HACS (recommended)

1. Open **HACS** in Home Assistant, or use the **Open in HACS** button above.
2. Search for **PlantSense Card** and click **Download**.
   - Not listed yet? In HACS, open the menu (top right) → **Custom
     repositories**, add `https://github.com/mattshax/plantsense-ha-card` with
     type **Dashboard**, then search again.
3. HACS adds the dashboard resource for you. Reload your browser so the card
   loads.

### Manual

1. Copy `plantsense-card.js` to `config/www/plantsense-card.js` on your Home
   Assistant (the `www/` folder is served at `/local/`).
2. Add it as a dashboard resource: **Settings → Dashboards → ⋮ → Resources →
   Add resource**, URL `/local/plantsense-card.js`, type **JavaScript module**.
   (In YAML mode: under `lovelace:` → `resources:`, add
   `- url: /local/plantsense-card.js` with `type: module`.)
3. Reload your browser.

## Usage

Edit a dashboard, **Add card**, and pick **PlantSense Card**. With the
PlantSense integration installed, the card fills in your first sensor; change
the entities to show another one. Or add it in YAML:

```yaml
type: custom:plantsense-card
name: Fiddle Leaf Fig
location: Living room
moisture: sensor.fiddle_leaf_fig_moisture
temperature: sensor.fiddle_leaf_fig_temperature
humidity: sensor.fiddle_leaf_fig_humidity
illuminance: sensor.fiddle_leaf_fig_illuminance
battery: sensor.fiddle_leaf_fig_battery
```

Tap a dial to open that entity's details and history.

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | string | `PlantSense` | Plant name shown in the header. |
| `location` | string | — | Optional sub-heading, e.g. a room. |
| `moisture` | entity id | — | Soil-moisture sensor (`%`). Drives the status pill. |
| `temperature` | entity id | — | Temperature sensor. |
| `humidity` | entity id | — | Humidity sensor (`%`). |
| `illuminance` | entity id | — | Light sensor (`lx`). `light` works too. |
| `battery` | entity id | — | Battery sensor (`%`). The battery chip is hidden without it. |
| `last_reading` | entity id | found automatically | The PlantSense integration's **Last reading** sensor. Normally found on its own from the device of the other entities. |
| `moisture_min` | number | `15` | Below this the pill reads **Needs water** and the moisture ring turns orange. |
| `moisture_max` | number | `60` | Above this the pill reads **Too wet**. |
| `illuminance_max` | number | `20000` | Lux that fills the light ring. |
| `temperature_min` | number | `10` (°C) / `50` (°F) | Temperature of an empty ring, in the sensor's unit. |
| `temperature_max` | number | `35` (°C) / `95` (°F) | Temperature of a full ring, in the sensor's unit. |

A missing or unavailable entity shows `—` with an empty ring; the card never
errors on a partly configured or offline sensor.

The sub-heading's "updated … ago" is when the sensor took its last reading,
from the integration's **Last reading** sensor (with ESPHome entities, when
Home Assistant last received a value). When the integration marks a sensor
offline (no reading for more than 6 hours), its readings are unavailable and
the pill reads **Offline**.

> **Tune the moisture range per plant.** 15–60% suits a typical houseplant.
> Succulents want it much lower (about 5–15%), tropicals a little higher
> (about 25–60%). The PlantSense app shows the range for your plant.

## Support

Questions and bug reports:
<https://github.com/mattshax/plantsense-ha-card/issues>

## License

[MIT](LICENSE)
