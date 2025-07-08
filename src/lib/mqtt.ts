// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
// SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { env } from "$env/dynamic/public";
import { parseBarcode } from "$lib/barcode";
import { screenOn } from "$lib/screen";
import {
  ErrorState,
  ProductState,
  setWaitingStateOnTimeout,
  WaitingState,
} from "$lib/state.svelte";

import mqtt from "mqtt";

let mqttclient: mqtt.MqttClient;

export function setupMqtt() {
  if (env.PUBLIC_BROKER_URL === undefined || env.PUBLIC_TOPIC === undefined) {
    return new ErrorState(`MQTT not configured`);
  }

  mqttclient = mqtt.connect(env.PUBLIC_BROKER_URL);

  mqttclient.on("connect", () => {
    if (env.PUBLIC_TOPIC !== undefined) {
      mqttclient.subscribe(env.PUBLIC_TOPIC, (err) => {
        if (err) {
          new ErrorState(`Subscription error: ${err}`);
        }
      });
    }
  });

  mqttclient.on("message", async (topic: string, payload: Buffer) => {
    if (topic !== env.PUBLIC_TOPIC) {
      return;
    }

    let parsed = parseBarcode(payload);
    if (!parsed.grocy) {
      return;
    }

    new WaitingState();
    screenOn(600_000);

    try {
      await ProductState.build(parsed.grocy);
    } catch (e) {
      if (typeof e === "string") {
        new ErrorState(e);
        setWaitingStateOnTimeout(10_000);
      } else if (e instanceof Error) {
        new ErrorState(`${e.name}: ${e.message}`);
      } else {
        throw e;
      }
    }
  });

  mqttclient.on("error", (err) => {
    new ErrorState(`MQTT error: ${err}`);
  });
}

export function disconnectMqtt() {
  if (mqttclient && mqttclient.connected) {
    mqttclient.end();
    new ErrorState("Disconnected from MQTT broker");
  }
}
