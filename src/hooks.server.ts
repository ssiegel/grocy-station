// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

// cf. https://sami.website/blog/sveltekit-api-reverse-proxy
import { error, type Handle } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";

const GROCY_PROXY_PATH = "/api/grocy";

const handleGrocyApiProxy: Handle = async ({ event }) => {
  if (env.GROCY_BASE_URL === undefined) {
    console.error("Grocy not configured.");
    throw error(500, "Grocy not configured.");
  }

  // try to prevent 3rd party requests to the proxy
  const origin = event.request.headers.get("origin");
  const referer = event.request.headers.get("referer");
  if (
    !(origin && new URL(origin).origin === event.url.origin ||
      referer && new URL(referer).origin === event.url.origin)
  ) {
    throw error(403, "Forbidden");
  }

  return await fetch(
    new URL(
      env.GROCY_BASE_URL +
        event.url.pathname.slice(GROCY_PROXY_PATH.length) +
        event.url.search,
    ).toString(),
    {
      body: event.request.body,
      method: event.request.method,
      headers: {
        ...Object.fromEntries(event.request.headers),
        "GROCY-API-KEY": env.GROCY_API_KEY ?? "",
      },
      // @ts-expect-error TS2769: Prevent "RequestInit: duplex option is required when sending a body"
      duplex: "half",
    },
  ).catch((err) => {
    console.log("Upstream Grocy request failed: ", err);
    throw err;
  });
};

export const handle: Handle = async ({ event, resolve }) => {
  // intercept requests to GROCY_PROXY_PATH and handle them with `handleGrocyApiProxy`
  if (event.url.pathname.startsWith(GROCY_PROXY_PATH)) {
    return await handleGrocyApiProxy({ event, resolve });
  }

  return await resolve(event);
};
