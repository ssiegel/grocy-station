// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
// SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { env } from "$env/dynamic/public";
import { parseBarcode } from "$lib/barcode";
import { screenOn } from "$lib/screen";
import { type Page, ProductState } from "$lib/state.svelte";

import mqtt from "mqtt";

let mqttclient: mqtt.MqttClient;

export function setupMqtt(page: Page) {
  if (env.PUBLIC_BROKER_URL === undefined || env.PUBLIC_TOPIC === undefined) {
    return page.toErrorState(`MQTT not configured`);
  }

  mqttclient = mqtt.connect(env.PUBLIC_BROKER_URL);
  page.state.progress = 50;

  mqttclient.on("connect", () => {
    if (env.PUBLIC_TOPIC !== undefined) {
      mqttclient.subscribe(env.PUBLIC_TOPIC, (err) => {
        if (err) {
          page.toErrorState(`Subscription error: ${err}`);
        }
      });
    }
  });

  mqttclient.on("message", async (topic: string, payload: Buffer) => {
    if (topic !== env.PUBLIC_TOPIC) {
      return;
    }

    const parsed = parseBarcode(payload);
    if (!parsed.grocy) {
      return;
    }

    screenOn(600_000);
    
    try {
      await page.doBarcode(parsed.grocy);
    } catch (e) {
      if (typeof e === "string") {
        page.toErrorState(e, 10_000);
      } else if (e instanceof Error) {
        page.toErrorState(`${e.name}: ${e.message}`);
      } else {
        throw e;
      }
    }
  });

  mqttclient.on("error", (err) => {
    page.toErrorState(`MQTT error: ${err}`);
  });
}

export function disconnectMqtt(page: Page) {
  if (mqttclient && mqttclient.connected) {
    mqttclient.end();
    page.toErrorState("Disconnected from MQTT broker");
  }
}
