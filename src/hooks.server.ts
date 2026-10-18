// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

// cf. https://sami.website/blog/sveltekit-api-reverse-proxy
import { error, type Handle, type ServerInit } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";

const GROCY_PROXY_PATH = "/api/grocy";

export const init: ServerInit = () => {
  console.log(`Grocy Station version ${__APP_VERSION__}`);
};

// Require requests to /api/* to originate from the same origin, to prevent
// 3rd party sites from using this server as a proxy or event relay.
const isSameOrigin = (event: Parameters<Handle>[0]["event"]): boolean => {
  const origin = event.request.headers.get("origin");
  const referer = event.request.headers.get("referer");
  return !!(
    (origin && new URL(origin).origin === event.url.origin) ||
    (referer && new URL(referer).origin === event.url.origin)
  );
};

const handleGrocyApiProxy: Handle = async ({ event }) => {
  if (env.GROCY_BASE_URL === undefined) {
    console.error("Grocy not configured.");
    throw error(500, "Grocy not configured.");
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
        // fetch leaves the upstream content-encoding header in place after
        // already decompressing the body, so negotiate identity instead.
        "accept-encoding": "identity",
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
  if (event.url.pathname.startsWith("/api/") && !isSameOrigin(event)) {
    throw error(403, "Forbidden");
  }

  // intercept requests to GROCY_PROXY_PATH and handle them with `handleGrocyApiProxy`
  if (event.url.pathname.startsWith(GROCY_PROXY_PATH)) {
    return await handleGrocyApiProxy({ event, resolve });
  }

  return await resolve(event);
};
