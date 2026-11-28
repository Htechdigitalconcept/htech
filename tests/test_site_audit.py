import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "api" / "site-audit.py"
SPEC = importlib.util.spec_from_file_location("site_audit_api", MODULE_PATH)
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


class SiteAuditTests(unittest.TestCase):
    def test_internal_url_normalization_rejects_external_and_unsafe_links(self):
        self.assertEqual(
            AUDIT._internal_url("/services/?campaign=x#section", "https://example.com/", "example.com"),
            "https://example.com/services/",
        )
        self.assertIsNone(AUDIT._internal_url("https://outside.example/", "https://example.com/", "example.com"))
        self.assertIsNone(AUDIT._internal_url("javascript:alert(1)", "https://example.com/", "example.com"))
        self.assertIsNone(AUDIT._internal_url("http://example.com:8080/", "https://example.com/", "example.com"))

    def test_robots_and_sitemap_parsing(self):
        sitemap_urls, disallowed = AUDIT._parse_robots(
            "User-agent: *\nDisallow: /private\nSitemap: https://example.com/sitemap.xml\n"
        )
        self.assertEqual(sitemap_urls, ["https://example.com/sitemap.xml"])
        self.assertEqual(disallowed, ["/private"])
        self.assertTrue(AUDIT._is_disallowed("https://example.com/private/page", disallowed))
        self.assertFalse(AUDIT._is_disallowed("https://example.com/public", disallowed))
        locations = AUDIT._sitemap_locations(
            '<urlset><url><loc>https://example.com/</loc></url><url><loc><![CDATA[https://example.com/about]]></loc></url></urlset>'
        )
        self.assertEqual(locations, ["https://example.com/", "https://example.com/about"])

    def test_audit_does_not_fetch_a_disallowed_start_path(self):
        fetched_urls = []

        def fake_fetch(url, _host, **_kwargs):
            fetched_urls.append(url)
            if url == 'https://example.com/robots.txt':
                return {"html": "User-agent: HtechSiteAudit\nDisallow: /private", "content_type": "text/plain"}
            raise AssertionError('The scanner should stop before fetching a disallowed page.')

        with patch.object(AUDIT._GROWTH, '_fetch_page', side_effect=fake_fetch):
            with self.assertRaisesRegex(AUDIT.AuditError, 'disallowed'):
                AUDIT.scan_site('https://example.com/private/secret')
        self.assertEqual(fetched_urls, ['https://example.com/robots.txt'])

    def test_audit_reports_when_no_sitemap_is_discovered(self):
        body = "<html><head><title>Example Site Page Title</title></head><body><h1>Home</h1></body></html>"

        def fake_fetch(url, _host, **_kwargs):
            if url == 'https://example.com/':
                return {
                    "url": url, "status": 200, "html": body, "bytes": len(body),
                    "truncated": False, "elapsed_ms": 1, "redirects": 0,
                    "content_type": "text/html",
                }
            raise AUDIT._GROWTH.ScanError('Not found', status_code=404)

        with patch.object(AUDIT._GROWTH, '_fetch_page', side_effect=fake_fetch):
            result = AUDIT.scan_site('https://example.com/')
        self.assertFalse(result['summary']['sitemap_found'])
        self.assertIn('sitemap_not_found', {issue['code'] for issue in result['issues']})

    def test_audit_crawls_internal_pages_and_reports_duplicates_broken_urls_and_orphans(self):
        home_html = """<!doctype html><html lang='en'><head>
          <title>Shared title for the sample website</title>
          <meta name='description' content='A sufficiently detailed description for a sample website page that visitors can understand.'>
          <meta name='viewport' content='width=device-width, initial-scale=1'>
          <link rel='canonical' href='https://example.com/'>
          </head><body><main><h1>Home</h1>
          <a href='/about/'>About</a><a href='/dead/'>Services</a>
          <a href='https://outside.example/'>External</a>
          <img src='/image.jpg'><script type='application/ld+json'>{}</script>
          </main></body></html>"""
        about_html = """<!doctype html><html lang='en'><head>
          <title>Shared title for the sample website</title>
          <meta name='robots' content='noindex'>
          <link rel='canonical' href='https://example.com/about/'>
          </head><body><main><p>No main heading, description, or viewport.</p></main></body></html>"""
        orphan_html = """<!doctype html><html lang='en'><head>
          <title>Orphan page has its own clear title</title>
          <meta name='description' content='A separate and useful description written just for the orphaned page content.'>
          <meta name='viewport' content='width=device-width, initial-scale=1'>
          <link rel='canonical' href='https://example.com/orphan/'>
          </head><body><main><h1>Orphan page</h1></main></body></html>"""
        sitemap = """<?xml version='1.0'?><urlset>
          <url><loc>https://example.com/</loc></url>
          <url><loc>https://example.com/about/</loc></url>
          <url><loc>https://example.com/orphan/</loc></url>
          <url><loc>https://example.com/private/secret</loc></url>
        </urlset>"""
        fetched_urls = []

        def fake_fetch(url, allowed_host, **_kwargs):
            fetched_urls.append(url)
            if url.endswith('/robots.txt'):
                return {"html": "User-agent: *\nDisallow: /private\nSitemap: https://example.com/sitemap.xml", "content_type": "text/plain"}
            if url.endswith('/sitemap.xml'):
                return {"html": sitemap, "content_type": "application/xml"}
            if url == 'https://example.com/':
                body = home_html
            elif url == 'https://example.com/about/':
                body = about_html
            elif url == 'https://example.com/orphan/':
                body = orphan_html
            elif url == 'https://example.com/dead/':
                raise AUDIT._GROWTH.ScanError('HTTP 404', status_code=404)
            else:
                raise AssertionError('Unexpected URL fetched: ' + url)
            return {
                "url": url, "status": 200, "html": body, "bytes": len(body),
                "truncated": False, "elapsed_ms": 5, "redirects": 1 if url.endswith('/about/') else 0,
                "content_type": "text/html",
            }

        with patch.object(AUDIT._GROWTH, '_fetch_page', side_effect=fake_fetch):
            result = AUDIT.scan_site('https://example.com/')

        self.assertEqual(result['summary']['pages_scanned'], 3)
        self.assertTrue(result['summary']['sitemap_found'])
        codes = {item['code'] for item in result['issues']}
        self.assertIn('duplicate_title', codes)
        self.assertIn('broken_internal_url', codes)
        self.assertIn('redirect_chain', codes)
        self.assertIn('sitemap_unlinked', codes)
        self.assertIn('noindex', codes)
        self.assertNotIn('https://example.com/private/secret', fetched_urls)
        self.assertNotIn('https://outside.example/', fetched_urls)
        self.assertIn('robots.txt Disallow rules', result['scope'])


if __name__ == '__main__':
    unittest.main()
