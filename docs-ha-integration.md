---
title: PlantSense + Home Assistant
description: Run PlantSense fully local in Home Assistant — ESPHome auto-discovery, no cloud, custom dashboard card, and watering automations.
---

# PlantSense works with Home Assistant

PlantSense runs [ESPHome](https://esphome.io) firmware, so it drops into
[Home Assistant](https://www.home-assistant.io) as a **native, local device** —
no PlantSense cloud account, no bridge, no third-party integration. Your soil,
light, temperature and humidity readings stay on your own network.

- **Auto-discovered.** As soon as a PlantSense device joins your Wi-Fi, Home
  Assistant offers to adopt it.
- **Local control.** Readings and firmware updates (OTA) run over your LAN.
- **No cloud, no lock-in.** The data never leaves your house unless you send it
  somewhere yourself.

---

## Adopt your PlantSense device

1. Get PlantSense onto your Wi-Fi (via the PlantSense mobile app onboarding, or
   ESPHome Wi-Fi provisioning).
2. In Home Assistant, open **Settings → Devices & Services**. A newly-joined
   PlantSense appears under **Discovered** as an **ESPHome** device — click
   **Configure** and confirm.
3. If it isn't auto-discovered, add it manually: **Add Integration → ESPHome →**
   the device's IP or `plantsense-xxxxxx.local`. If your firmware sets an API
   encryption key, paste it when prompted (it lives in the device's
   `secrets.yaml` as `api_key`).
4. The device and its sensors now show under that ESPHome integration.

> The `xxxxxx` in the name is a per-device suffix derived from the module's MAC
> address, so each unit gets a unique, stable entity prefix.

---

## Entities PlantSense exposes

| Reading | Entity | Unit | Notes |
|---|---|---|---|
| Soil moisture | `sensor.plantsense_xxxxxx_soil_moisture` | % | Capacitive, per-device calibrated. |
| Temperature | `sensor.plantsense_xxxxxx_temperature` | °C | **Ambient/air** (AHT20), not soil temperature. |
| Humidity | `sensor.plantsense_xxxxxx_humidity` | % | Relative humidity (AHT20). |
| Light | `sensor.plantsense_xxxxxx_light` | lux | Illuminance (estimated lux, not true PAR). |
| Battery | `sensor.plantsense_xxxxxx_battery` | % | From the LiPo discharge curve. |

Diagnostic entities are also exposed and hidden by default: battery voltage
(`..._battery_voltage`, V), raw moisture voltage (`..._raw_moisture`, V) and
Wi-Fi signal (`..._wifi_signal`, dBm).

---

## A quick word on battery life (deep sleep)

PlantSense is a **battery sensor that deep-sleeps ~90 minutes** between short
(~30s) wake cycles — that's how it lasts on a small LiPo. It affects how Home
Assistant sees it:

- **Always-on (mains-powered) unit:** the native ESPHome API stays connected,
  so you get live updates with nothing extra to configure.
- **Battery unit:** while the device sleeps, a persistent connection would show
  every entity as *unavailable*. Use the opt-in **MQTT** path (availability
  reporting disabled) so Home Assistant **retains the last published value** and
  your dashboard always shows the latest reading. Setup lives in the firmware
  repo's `HOME-ASSISTANT.md`.

Everything below works the same on either path — same entity ids, same card.

---

## Install the PlantSense dashboard card

The **PlantSense Card** is a custom Lovelace card that mirrors the app: a plant
name, a status pill, and four dial gauges.

### Via HACS (recommended)

1. In **HACS → ⋮ → Custom repositories**, add the PlantSense Card repository
   with category **Dashboard**.
2. Download **PlantSense Card**, then hard-refresh your browser.

### Manual install

1. Copy `plantsense-card.js` to `config/www/plantsense-card.js`.
2. **Settings → Dashboards → ⋮ → Resources → Add resource**: URL
   `/local/plantsense-card.js`, type **JavaScript Module**.
3. Hard-refresh your browser.

### Add the card

```yaml
type: custom:plantsense-card
name: Monstera
location: Living room
moisture: sensor.plantsense_a1b2c3_soil_moisture
temperature: sensor.plantsense_a1b2c3_temperature
humidity: sensor.plantsense_a1b2c3_humidity
illuminance: sensor.plantsense_a1b2c3_light
battery: sensor.plantsense_a1b2c3_battery
# optional — tune the healthy soil-moisture band per plant (defaults 15 / 60)
moisture_min: 15
moisture_max: 60
```

The moisture band drives the **Healthy / Needs water / Too wet** pill and the
colour of the moisture ring. Defaults suit a generic houseplant; succulents want
a much lower band, tropicals higher.

---

## Example automation: water when the soil gets dry

Because the readings are ordinary Home Assistant sensors, you can trigger
anything. This example sends a phone notification **and** runs a pump on a smart
plug for 20 seconds when soil moisture drops below 25% — then stops.

```yaml
alias: PlantSense — water Basil when dry
description: Notify and pulse a pump smart-plug when soil moisture is low.
mode: single
trigger:
  - platform: numeric_state
    entity_id: sensor.plantsense_a1b2c3_soil_moisture
    below: 25
    for:
      minutes: 10   # avoid reacting to a single noisy reading
condition:
  # Don't fire in the middle of the night.
  - condition: time
    after: "07:00:00"
    before: "21:00:00"
action:
  - service: notify.mobile_app_your_phone
    data:
      title: "Basil needs water"
      message: >-
        Soil moisture dropped to
        {{ states('sensor.plantsense_a1b2c3_soil_moisture') | round(0) }}%.
  # Optional: pulse a pump on a smart plug (remove if you water by hand).
  - service: switch.turn_on
    target:
      entity_id: switch.basil_pump
  - delay:
      seconds: 20
  - service: switch.turn_off
    target:
      entity_id: switch.basil_pump
```

Other ideas:

- **Low battery reminder** — `numeric_state` on `..._battery` below 15%.
- **Too dark for too long** — `..._light` below a lux threshold `for:` several
  hours during the day.
- **Weekly digest** — a template notification summarising each plant's status.

---

## Going further

- **Derived metrics** (VPD, a light PPFD/DLI estimate, a 0–100 health score) can
  be computed in Home Assistant from these base entities — see the
  `plantsense-infra/homeassistant/` templates.
- **Per-plant thresholds** — sensible min/max bands per metric live in
  `plantsense-plant-thresholds.md`.

Everything here is local and source-agnostic: the card and automations read the
same entity ids whether the data arrives over the native ESPHome API or MQTT.
