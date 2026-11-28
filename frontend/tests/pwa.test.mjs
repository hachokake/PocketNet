import assert from "node:assert/strict";
import test from "node:test";
import {
  INSTALL_DISMISSAL_DURATION_MS,
  INSTALL_DISMISSAL_KEY,
  dismissInstallInvitation,
  getInstallGuide,
  isAppleMobileDevice,
  isStandaloneMode,
  wasInstallDismissed,
} from "../src/pwa.mjs";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  };
}

test("detects installed standalone and Apple mobile presentations", () => {
  assert.equal(isStandaloneMode(
    { standalone: false },
    { matchMedia: (query) => ({ matches: query === "(display-mode: standalone)" }) },
  ), true);
  assert.equal(isStandaloneMode(
    { standalone: true },
    { matchMedia: () => ({ matches: false }) },
  ), true);
  assert.equal(isAppleMobileDevice({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    platform: "iPhone",
    maxTouchPoints: 1,
  }), true);
  assert.equal(isAppleMobileDevice({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
    platform: "MacIntel",
    maxTouchPoints: 5,
  }), true);
  assert.equal(isAppleMobileDevice({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    platform: "Win32",
    maxTouchPoints: 0,
  }), false);
});

test("provides platform-specific installation guidance without calling shortcuts PWAs", () => {
  const iosSafari = getInstallGuide({
    appleMobile: true,
    appleSafari: true,
    userAgent: "iPhone Safari",
  });
  assert.match(iosSafari.title, /écran d’accueil/);
  assert.equal(iosSafari.steps.length, 3);

  const androidChrome = getInstallGuide({
    appleMobile: false,
    appleSafari: false,
    userAgent: "Mozilla/5.0 (Linux; Android 15) Chrome/150.0.0.0",
  });
  assert.match(androidChrome.hint, /Chrome/);
  assert.ok(androidChrome.steps.some((step) => /Créer un raccourci/.test(step)));
  assert.ok(androidChrome.steps.some((step) => /ce n’est pas une installation PWA/.test(step)));
});

test("install invitation dismissal lasts exactly seven days", () => {
  const storage = createStorage();
  const now = 1_800_000_000_000;

  dismissInstallInvitation(storage, now);
  assert.equal(storage.values.get(INSTALL_DISMISSAL_KEY), String(now + INSTALL_DISMISSAL_DURATION_MS));
  assert.equal(wasInstallDismissed(storage, now + INSTALL_DISMISSAL_DURATION_MS - 1), true);
  assert.equal(wasInstallDismissed(storage, now + INSTALL_DISMISSAL_DURATION_MS), false);
  assert.equal(storage.values.has(INSTALL_DISMISSAL_KEY), false);
});

test("expired or malformed install dismissals do not suppress future invitations", () => {
  const storage = createStorage();
  storage.setItem(INSTALL_DISMISSAL_KEY, "not-a-timestamp");

  assert.equal(wasInstallDismissed(storage), false);
  assert.equal(storage.values.has(INSTALL_DISMISSAL_KEY), false);
});
