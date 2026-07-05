import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN;
const POSTHOG_HOST = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;

let initialized = false;

export function initPosthog() {
  if (initialized) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    defaults: '2026-01-30',
    capture_pageview: true,
    capture_pageleave: true,
  });
  initialized = true;
}

export function setStreamerContext(streamerId, streamerName) {
  posthog.register({ streamer_id: streamerId, streamer_name: streamerName });
}

export function track(event, props = {}) {
  posthog.capture(event, props);
}

export { posthog };
