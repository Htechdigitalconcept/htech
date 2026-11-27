import importlib.util
import unittest
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from unittest.mock import patch
import socket


MODULE_PATH = Path(__file__).resolve().parents[1] / "api" / "growth-check.py"
SPEC = importlib.util.spec_from_file_location("growth_check_api", MODULE_PATH)
GROWTH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GROWTH)


class GrowthScanTests(unittest.TestCase):
    def test_normalizes_domain_and_drops_query_and_fragment(self):
        url, host, implicit_https = GROWTH._normalise_url("www.example.com/services/?campaign=private#top")
        self.assertEqual(url, "https://www.example.com/services/")
        self.assertEqual(host, "www.example.com")
        self.assertTrue(implicit_https)

    def test_rejects_private_addresses_credentials_and_custom_ports(self):
        for value in (
            "http://127.0.0.1",
            "http://localhost",
            "https://user:secret@example.com",
            "https://example.com:8443",
            "https://service.local",
        ):
            with self.subTest(value=value), self.assertRaises(GROWTH.ScanError):
                GROWTH._normalise_url(value)

    def test_parser_and_checks_find_real_html_signals(self):
        html = """<!doctype html><html lang='en'><head>
          <title>Example Services | Practical Support</title>
          <meta name='description' content='Practical support for growing local businesses and teams.'>
          <meta name='viewport' content='width=device-width, initial-scale=1'>
          <meta property='og:title' content='Example Services'>
          <meta property='og:description' content='Practical support for growing businesses.'>
          <link rel='canonical' href='https://example.com/'>
          </head><body><main><h1>Support for growing businesses</h1>
          <h2>Our services</h2><a href='/contact/'>Book a consultation</a>
          <a href='mailto:hello@example.com'>Email us</a><img src='/team.jpg' alt='Our team'>
          <form><label for='email'>Email</label><input id='email' type='email'></form>
          <p>Read a client testimonial and review of our work.</p></main></body></html>"""
        fetch_result = {
            "url": "https://example.com/", "status": 200, "html": html,
            "bytes": len(html), "truncated": False, "elapsed_ms": 240, "redirects": 0,
        }
        page = GROWTH._parse_page(fetch_result)
        checks = GROWTH._build_checks([page])
        by_id = {item["id"]: item for item in checks}
        self.assertEqual(page["h1"], ["Support for growing businesses"])
        self.assertEqual(page["viewport"], "width=device-width, initial-scale=1")
        self.assertEqual(by_id["mobile"]["status"], "good")
        self.assertEqual(by_id["security"]["status"], "good")
        self.assertEqual(by_id["images"]["status"], "good")
        self.assertEqual(by_id["forms"]["status"], "good")
        self.assertEqual(by_id["actions"]["status"], "attention")

    def test_action_check_flags_cta_links_without_a_destination(self):
        page = GROWTH._parse_page({
            "url": "https://example.com/", "status": 200,
            "html": "<html><body><h1>Example</h1><a href='#'>Book a consultation</a></body></html>",
            "bytes": 95, "truncated": False, "elapsed_ms": 100, "redirects": 0,
        })
        checks = {item["id"]: item for item in GROWTH._build_checks([page])}
        self.assertEqual(checks["actions"]["status"], "priority")
        self.assertIn("no usable destination", checks["actions"]["evidence"])

    def test_python_proposal_context_uses_prioritized_scan_findings(self):
        context = GROWTH._proposal_context([
            {"id": "mobile", "category": "Mobile experience", "title": "Mobile viewport setup", "status": "good", "recommendation": ""},
            {"id": "metadata", "category": "Search & discovery", "title": "Search appearance", "status": "attention", "recommendation": "Improve the page description."},
            {"id": "contact", "category": "Conversion", "title": "Contact & enquiry path", "status": "priority", "recommendation": "Add a clear enquiry form."},
        ])
        self.assertEqual(context["top_findings"][0]["id"], "contact")
        self.assertIn("clearer", context["focus"])
        self.assertIn("Search appearance", [item["title"] for item in context["top_findings"]])
        self.assertIn("Mobile viewport setup", context["strengths"])
        self.assertTrue(context["has_opportunities"])

    def test_priority_pages_stay_on_the_same_site(self):
        home = {
            "links": [
                {"href": "/contact/", "text": "Contact", "label": ""},
                {"href": "https://outside.example/booking", "text": "Book", "label": ""},
                {"href": "/about/", "text": "About us", "label": ""},
            ]
        }
        selected = GROWTH._priority_pages(home, "https://example.com/", "example.com")
        self.assertEqual(selected, ["https://example.com/contact/", "https://example.com/about/"])

    def test_end_to_end_scan_uses_home_and_priority_pages(self):
        document = b"""<!doctype html><html lang='en'><head>
          <title>Example Business | Quality Service</title>
          <meta name='description' content='A practical example description for growing businesses and local customers.'>
          <meta name='viewport' content='width=device-width, initial-scale=1'>
          <meta property='og:title' content='Example Business'>
          <meta property='og:description' content='A useful example service for customers.'>
          <link rel='canonical' href='http://example.com/'>
          </head><body><main><h1>Service for local customers</h1>
          <h2>What we do</h2><a href='/services/'>Explore our services</a>
          <a href='/contact/'>Contact our team</a><a href='mailto:hello@example.com'>Email us</a>
          <img src='/work.jpg' alt='Example work'>
          <p>Read our client testimonial and review.</p></main></body></html>"""

        class FixtureHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(document)))
                self.end_headers()
                self.wfile.write(document)

            def log_message(self, *_args):
                return

        server = ThreadingHTTPServer(('127.0.0.1', 0), FixtureHandler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        real_create_connection = socket.create_connection

        def route_to_fixture(_address, timeout=None, source_address=None):
            return real_create_connection(('127.0.0.1', server.server_port), timeout, source_address)

        try:
            with patch.object(GROWTH, '_public_addresses', return_value=['93.184.216.34']), \
                 patch.object(GROWTH.socket, 'create_connection', side_effect=route_to_fixture):
                result = GROWTH.scan_website('http://example.com')
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

        self.assertEqual(len(result['scanned_pages']), 3)
        self.assertEqual(result['domain'], 'example.com')
        self.assertEqual(len(result['checks']), 11)
        self.assertTrue(all(check['status'] in ('good', 'attention', 'priority') for check in result['checks']))
        self.assertIn('proposal_context', result)
        self.assertIn('focus', result['proposal_context'])
        self.assertIsInstance(result['proposal_context']['top_findings'], list)
        self.assertIn('up to two', result['scope'])


if __name__ == "__main__":
    unittest.main()
