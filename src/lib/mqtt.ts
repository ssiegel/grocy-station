// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
// SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { env } from "$env/dynamic/public";
import { parseBarcode } from "$lib/barcode";
import { screenOn } from "$lib/screen";
import {
  ErrorState,
  pageState,
  ProductState,
} from "$lib/state.svelte";

import { fetchProductStateInfo } from "./grocy";

import mqtt from "mqtt";

let mqttclient: mqtt.MqttClient;

export function setupMqtt() {
  if (env.PUBLIC_BROKER_URL === undefined || env.PUBLIC_TOPIC === undefined) {
    return pageState.current = new ErrorState(`MQTT not configured`);
  }

  mqttclient = mqtt.connect(env.PUBLIC_BROKER_URL);

  mqttclient.on("connect", () => {
    if (env.PUBLIC_TOPIC !== undefined) {
      mqttclient.subscribe(env.PUBLIC_TOPIC, (err) => {
        if (err) {
          pageState.current = new ErrorState(`Subscription error: ${err}`);
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

    screenOn(600_000);

    let barcode = parsed.grocy
    if (
          (pageState.current instanceof ProductState) &&
          (pageState.current.grocyData.barcode?.barcode === barcode) &&
          Number.isFinite(pageState.current.quantity())
        ) {
          return pageState.current.increaseQuantity();
        }
    try {
      let productStateInfo = await fetchProductStateInfo(barcode);
      let state = new ProductState(
          productStateInfo.grocyData,
          String(productStateInfo.unitSize),
        );
    
      state.setDbChangeInterval();
      pageState.current = state;
    } catch (e) {
      if (typeof e === "string") {
        pageState.current = new ErrorState(e);
        pageState.current.setWaitingStateOnTimeout(10_000);
      } else if (e instanceof Error) {
        pageState.current = new ErrorState(`${e.name}: ${e.message}`);
      } else {
        throw e;
      }
    }
  });

  mqttclient.on("error", (err) => {
    pageState.current = new ErrorState(`MQTT error: ${err}`);
  });
}

export function disconnectMqtt() {
  if (mqttclient && mqttclient.connected) {
    mqttclient.end();
    pageState.current = new ErrorState("Disconnected from MQTT broker");
  }
}
