# Home Assistant Integration

Diese Integration zeigt in Home Assistant an, wer aktuell anwesend ist, wer als nächstes kommt und welche Slots noch offen sind.

## Setup

### 1. Token holen

Als Admin in der App: Profil → iCal-Token kopieren (`ical_token` aus der `profiles`-Tabelle). Nur Admin-Tokens funktionieren — Assistenten haben keinen Zugriff auf die HA-API.

### 2. HA secrets.yaml

```yaml
assistenten_url: "https://karas.pro/api/ha/status?token=dein-ical-token-hier"
```

### 3. Package aktivieren

In `configuration.yaml`:

```yaml
homeassistant:
  packages: !include_dir_named packages
```

Datei `assistenten.yaml` in `<ha-config>/packages/` ablegen, HA neu starten.

### 4. Dashboard importieren

Einstellungen → Dashboards → **+ Dashboard hinzufügen** → "von Grund auf" → öffnen → ⋮ → "Dashboard bearbeiten" → ⋮ → "Steuerung in YAML-Modus" → Inhalt von `dashboard.yaml` einfügen.

## Verfügbare Entitäten

| Entity | Beschreibung |
|--------|--------------|
| `sensor.assistenten_status` | Roh-State (Name der aktuellen Assistentin) + alle Attribute |
| `sensor.aktuelle_assistentin` | Wer ist gerade da |
| `sensor.nachste_assistentin` | Wer kommt als nächstes |
| `sensor.offene_slots` | Anzahl unbesetzter Slots |
| `sensor.heute_assistentinnen` | Anzahl Slots heute + Liste der Namen als Attribut |
| `binary_sensor.assistentin_anwesend` | Sensor für Automationen (z.B. Licht an wenn jemand kommt) |

## Automationen-Beispiele

**Erinnerung 30 Min bevor jemand kommt:**

```yaml
automation:
  - alias: "Assistentin kommt bald"
    trigger:
      - platform: numeric_state
        entity_id: sensor.nachste_assistentin
        attribute: minutes_until
        below: 31
        above: 29
    action:
      - service: notify.mobile_app_dein_handy
        data:
          message: >
            {{ states('sensor.nachste_assistentin') }} kommt in 30 Min
            ({{ state_attr('sensor.nachste_assistentin', 'start_time') }} Uhr).
```

**Heizung hochdrehen wenn Assistentin ankommt:**

```yaml
automation:
  - alias: "Heizung wenn Assistentin da"
    trigger:
      - platform: state
        entity_id: binary_sensor.assistentin_anwesend
        to: "on"
    action:
      - service: climate.set_temperature
        target:
          entity_id: climate.wohnzimmer
        data:
          temperature: 22
```

## Polling-Intervall

Der REST-Sensor pollt alle **60 Sekunden**. In `assistenten.yaml` über `scan_interval` änderbar.
