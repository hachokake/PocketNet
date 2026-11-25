import json
import struct

from django.conf import settings
from django.test import SimpleTestCase
from django.urls import reverse


class PocketNetEndpointTests(SimpleTestCase):
    def test_homepage_declares_the_pwa_assets_and_install_controls(self):
        response = self.client.get(reverse("home"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "PocketNet")
        self.assertContains(response, 'name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"')
        self.assertContains(response, 'name="theme-color" content="#1E3A8A"')
        self.assertContains(response, 'rel="manifest" href="/static/site.webmanifest"')
        self.assertContains(response, 'rel="apple-touch-icon"')
        self.assertContains(response, 'id="pwa-install-notice"')
        self.assertContains(response, 'id="pwa-update-notice"')
        self.assertContains(response, 'id="pwa-ios-dialog"')
        self.assertContains(response, 'href="/static/app.css?v=pwa-10"')
        self.assertContains(response, 'src="/static/app.js?v=pwa-9" type="module"')
        self.assertContains(response, 'src="/static/learning-center.mjs?v=learning-2" type="module"')
        self.assertContains(response, "Comprenez les réseaux. Construisez. Configurez. Simulez.")
        self.assertContains(response, 'href="#apprendre"')
        self.assertContains(response, 'href="#fonctionnalites"')
        self.assertContains(response, 'href="#equipements"')
        self.assertContains(response, 'id="resource-equipement-reference"')
        self.assertContains(response, "sans synchronisation serveur")
        self.assertContains(response, "© ")
        self.assertContains(response, 'id="simulation-events"')
        self.assertContains(response, 'data-add-device="laptop"')
        self.assertContains(response, 'data-add-device="access-point"')
        self.assertContains(response, "connectez deux ports Ethernet")
        self.assertContains(response, 'id="pc-management-dialog"')
        self.assertContains(response, 'data-pc-tab="terminal"')
        self.assertContains(response, 'id="pc-terminal-form"')
        self.assertContains(response, 'id="switch-management-dialog"')
        self.assertContains(response, 'id="switch-terminal-form"')
        self.assertContains(response, "Démarrer la simulation")
        self.assertContains(response, "STP n’est pas simulé")
        self.assertEqual(response.content.count(b'rel="manifest"'), 1)

    def test_manifest_points_to_the_official_raster_icons(self):
        manifest_path = settings.FRONTEND_PUBLIC_DIR / "site.webmanifest"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

        self.assertEqual(manifest["name"], "PocketNet")
        self.assertEqual(manifest["short_name"], "PocketNet")
        self.assertEqual(manifest["description"], "Simulateur interactif de réseaux informatiques.")
        self.assertEqual(manifest["display"], "standalone")
        self.assertEqual(manifest["orientation"], "any")
        self.assertEqual(manifest["start_url"], "/")
        self.assertEqual(manifest["scope"], "/")
        self.assertEqual(manifest["background_color"], "#FFFFFF")
        self.assertEqual(manifest["theme_color"], "#1E3A8A")
        self.assertEqual(len(list(settings.FRONTEND_PUBLIC_DIR.glob("*.webmanifest"))), 1)

        expected_icons = {
            "pocketnet-192.png": (192, 192, "any"),
            "pocketnet-512.png": (512, 512, "any"),
            "pocketnet-maskable-192.png": (192, 192, "maskable"),
            "pocketnet-maskable-512.png": (512, 512, "maskable"),
        }
        for filename, (width, height, purpose) in expected_icons.items():
            icon = next(item for item in manifest["icons"] if item["src"].endswith(filename))
            self.assertEqual(icon["purpose"], purpose)
            image = (settings.FRONTEND_PUBLIC_DIR / "brand" / filename).read_bytes()
            self.assertEqual(image[:8], b"\x89PNG\r\n\x1a\n")
            self.assertEqual(struct.unpack(">II", image[16:24]), (width, height))
            self.assertEqual(image[25], 2)

        apple_icon = (settings.FRONTEND_PUBLIC_DIR / "brand" / "pocketnet-apple-180.png").read_bytes()
        self.assertEqual(struct.unpack(">II", apple_icon[16:24]), (180, 180))

    def test_health_endpoint_reports_service_status(self):
        response = self.client.get(reverse("health"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"service": "pocketnet-api", "status": "ok"},
        )

    def test_service_worker_allows_root_scope(self):
        response = self.client.get(reverse("service-worker"))
        source = b"".join(response.streaming_content).decode("utf-8")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Service-Worker-Allowed"], "/")
        self.assertEqual(response["Cache-Control"], "no-cache")
        self.assertNotIn('  "/",', source)
        self.assertNotIn('caches.match("/")', source)
        self.assertIn('const OFFLINE_URL = "/static/offline.html";', source)
        self.assertIn('const CACHE_NAME = "pocketnet-shell-v29";', source)
        self.assertIn("/static/app.css?v=pwa-10", source)
        self.assertIn("/static/learning-center.mjs?v=learning-2", source)
        self.assertIn('{ cache: "reload" }', source)
        self.assertIn('fetch(request, { cache: "no-cache" })', source)
        self.assertIn('event.data?.type === "ACTIVATE_UPDATE"', source)
        self.assertIn('cacheName.startsWith(CACHE_PREFIX)', source)

    def test_offline_page_explains_that_full_offline_use_is_unavailable(self):
        offline_page = (settings.FRONTEND_PUBLIC_DIR / "offline.html").read_text(encoding="utf-8")

        self.assertIn("Connexion Internet requise", offline_page)
        self.assertIn("n’est pas disponible hors ligne pour le moment", offline_page)
