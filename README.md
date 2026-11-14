# PlantSense Card

[![Open your Home Assistant instance and open this repository in HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=scietas&repository=plantsense-ha-card&category=plugin)
[![Validate](https://github.com/scietas/plantsense-ha-card/actions/workflows/validate.yaml/badge.svg)](https://github.com/scietas/plantsense-ha-card/actions/workflows/validate.yaml)

A dashboard card for Home Assistant that shows a [PlantSense](https://myplantsense.com)
soil sensor the way the PlantSense app does: the plant name, its health
(**Healthy / Fair / Warning / Needs attention**) and why, and dials for **soil
moisture, daily light, temperature and humidity**, plus the battery level. It follows Home
Assistant's light and dark themes.

[PlantSense](https://myplantsense.com) is a WiFi soil sensor for house plants
and garden beds: soil moisture, temperature, humidity and light, weeks on a
USB-C rechargeable battery, no hub and no subscription. Don't have one yet?
See [myplantsense.com/shop](https://myplantsense.com/shop).

<img src="https://raw.githubusercontent.com/scietas/plantsense-ha-card/main/docs/card-dark.png" alt="PlantSense cards on a Home Assistant dashboard, dark theme" width="720">

<img src="https://raw.githubusercontent.com/scietas/plantsense-ha-card/main/docs/card-light.png" alt="The same cards in the light theme" width="720">

## Requirements

PlantSense sensors in Home Assistant, through either:

- the [PlantSense integration](https://github.com/scietas/plantsense-ha-integration)
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
3. HACS adds the dashboard resource for you. Reload your browser so the card
   loads.

From Home Assistant 2026.11, HACS is built in as the **Marketplace**: go to
**Settings → Marketplace**, search for **PlantSense Card**, select
**Install**, and reload your browser.

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
| `moisture` | entity id | — | Soil-moisture sensor (`%`). |
| `temperature` | entity id | — | Temperature sensor. |
| `humidity` | entity id | — | Humidity sensor (`%`). |
| `illuminance` | entity id | — | Light sensor (`lx`). `light` works too. |
| `battery` | entity id | — | Battery sensor (`%`). The battery chip is hidden without it. |
| `health` | entity id | found automatically | The PlantSense integration's **Health** sensor (integration 1.4.0+). Drives the status pill. |
| `daily_light` | entity id | found automatically | The integration's **Daily light** sensor (1.4.0+). The light dial shows it instead of `illuminance`. |
| `last_reading` | entity id | found automatically | The PlantSense integration's **Last reading** sensor. |
| `moisture_min` | number | `15` | Without a Health sensor, or when set: below this the pill reads **Needs water** and the moisture ring turns orange. |
| `moisture_max` | number | `60` | Without a Health sensor, or when set: above this the pill reads **Too wet**. |
| `illuminance_max` | number | `20000` | Lux that fills the light ring. |
| `temperature_min` | number | `10` (°C) / `50` (°F) | Temperature of an empty ring, in the sensor's unit. |
| `temperature_max` | number | `35` (°C) / `95` (°F) | Temperature of a full ring, in the sensor's unit. |

The integration's entities (`health`, `daily_light`, `last_reading`) are found
on their own from the device of the other entities.

A missing or unavailable entity shows `—` with an empty ring; the card never
errors on a partly configured or offline sensor.

**Status pill.** With the PlantSense integration 1.4.0 or later, the pill is the
plant's health as the app shows it: **Healthy**, **Fair**, **Warning** or
**Needs attention**, with the reason under it (for example "Soil moisture is
low"). It is judged against your plant's own care ranges. The moisture ring
turns orange when soil moisture is low or saturated, and the light dial shows
the brightest light of the last 24 hours (**Daily light**), so it isn't empty
at night.

If you set `moisture_min` or `moisture_max`, or use ESPHome entities, the pill
reads soil moisture against that range instead.

The sub-heading's "updated … ago" is when the sensor took its last reading,
from the integration's **Last reading** sensor (with ESPHome entities, when
Home Assistant last received a value). When the integration marks a sensor
offline (no reading for more than 6 hours), its readings are unavailable and
the pill reads **Offline**.

> **Moisture range without the integration.** 15–60% suits a typical
> houseplant. Succulents want it much lower (about 5–15%), tropicals a little
> higher (about 25–60%). The PlantSense app shows the range for your plant.

## Support

Questions and bug reports:
<https://github.com/scietas/plantsense-ha-card/issues>

## License

[MIT](https://github.com/scietas/plantsense-ha-card/blob/main/LICENSE)

PlantSense is made by [Scietas](https://scietas.com).
