// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
// SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { env } from '$env/dynamic/public';
import { parseBarcode } from '$lib/barcode';
import { screenOn } from '$lib/screen';
import { showGrocyProduct } from '$lib/grocy';
import { showError } from '$lib/error'

import mqtt from 'mqtt';

let mqttclient: mqtt.MqttClient;

export function setupMqtt() {
    if (env.PUBLIC_BROKER_URL === undefined || env.PUBLIC_TOPIC === undefined) {
        showError(`MQTT not configured`);
        return Error();
    }

    mqttclient = mqtt.connect(env.PUBLIC_BROKER_URL);

    mqttclient.on('connect', () => {
        if (env.PUBLIC_TOPIC !== undefined)
            mqttclient.subscribe(env.PUBLIC_TOPIC, (err) => {
                if (err)
                    showError(`Subscription error: ${err}`);
            });
    });

    mqttclient.on('message', async (topic: string, payload: Buffer) => {
        if (topic !== env.PUBLIC_TOPIC)
            return;

        let parsed = parseBarcode(payload);
        if (!parsed.grocy)
            return;

        showError();
        screenOn(600_000);

        try {
            await showGrocyProduct(parsed.grocy);
        } catch (e) {
            if (typeof e === 'string')
                showError(e, 10_000);
            else if (e instanceof Error)
                showError(`${e.name}: ${e.message}`);
            else
                throw e;
        }
    });

    mqttclient.on('error', (err) => {
        showError(`MQTT error: ${err}`);
    });
}

export function disconnectMqtt() {
    if (mqttclient && mqttclient.connected) {
        mqttclient.end();
        showError('Disconnected from MQTT broker');
    }
}