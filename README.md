# Grocy Station

Grocy Station is a kiosk-style frontend for [Grocy](https://grocy.info/), built
with [SvelteKit](https://kit.svelte.dev/). It is designed to run on a tablet in
your kitchen and integrates with the Grocy API and a barcode scanner via MQTT.
The scanner typically uses the [hid2mqtt](https://github.com/ssiegel/hid2mqtt)
project to publish scanned barcodes over Wi‑Fi.

The application subscribes to an MQTT topic, parses incoming barcode messages
and shows product information from Grocy. Items can be marked as opened or
consumed directly from the interface.

## Features

- Connects to an MQTT broker and listens for barcode scan events
- Parses GS1 and other barcode symbologies via `@point-of-sale/barcode-parser`
- Displays product details, stock levels and packaging units
- Allows opening or consuming items with quick actions

## Configuration

Copy `.env.example` to `.env` and adjust the values:

```sh
ORIGIN=https://grocy-station.example/        # External URL under which Grocy Station will be running
PUBLIC_BROKER_URL=ws://mqtt.example:1882     # WebSocket URL of the MQTT broker
PUBLIC_TOPIC=hid2mqtt                        # MQTT topic where the scanner publishes messages
GROCY_BASE_URL=https://grocy.example/api     # Base URL of your Grocy API
GROCY_API_KEY=your-api-key                   # Grocy API key used by the proxy
```

The `PUBLIC_*` variables are exposed to the client. The Grocy variables are used
on the server side to proxy requests securely.

## Developing

Install the dependencies with `deno install` (which installs the packages from
`package.json` into the local cache). Then start a development server:

```sh
deno task dev
# or automatically open the app in a browser
deno task dev --open
```

## Building

To create a production build run:

```sh
deno task build
```

This writes the application to the `build/` directory. You can also build a
container image using the provided `Dockerfile`:

```sh
podman build .
```

The container exposes the HTTP service on port `3000`. Make sure to restrict
access appropriately when deploying.

## Running

Preview the production build locally with:

```sh
deno task preview
```

For a containerised demo setup, `docker-compose.yml` starts the service together
with a demo instance of Grocy as well as a Mosquitto MQTT broker:

```sh
podman compose up
```

The UI will then be reachable on
[http://localhost:8080/](http://localhost:8080/), Grocy will be reachable on
[http://localhost:8081/](http://localhost:8081/), and Mosquitto will be
available on Port 1883 (MQTT) and 8082 (MQTT over WebSocket). To simulate a
scanned barcode, you can send the message manually:

```sh
mosquitto_pub -h localhost -t hid2mqtt -m ']E442141099'
```

## License

Source files declare their respective licenses via SPDX headers. See the
`LICENSES/` directory for full texts. The project as a whole is provided under
the terms of the GNU AGPL v3 or later.
