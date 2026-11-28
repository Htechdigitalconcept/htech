import importlib.util
import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "api" / "migration-qa.py"
SPEC = importlib.util.spec_from_file_location("migration_qa_api", MODULE_PATH)
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


class MigrationAnalysisTests(unittest.TestCase):
    def test_normalizes_domains_and_suggests_unique_same_path_redirects(self):
        report = MIGRATION.analyse_migration({
            "old_urls": ["HTTPS://OLD.EXAMPLE.COM/about/#team", "https://old.example.com/unchanged/"],
            "new_urls": ["https://new.example.com/about/", "https://old.example.com/unchanged/"],
        })
        self.assertEqual(report["summary"]["old_urls"], 2)
        self.assertEqual(report["summary"]["unchanged"], 1)
        self.assertEqual(report["summary"]["matched"], 1)
        self.assertEqual(report["rules"], [{
            "source": "https://old.example.com/about/",
            "destination": "https://new.example.com/about/",
            "status": "ready",
        }])
        self.assertIn("suggested_same_path", {issue["code"] for issue in report["issues"]})

    def test_explicit_mapping_overrides_path_suggestion_and_flattens_chains(self):
        report = MIGRATION.analyse_migration({
            "old_urls": ["https://old.example.com/old/"],
            "new_urls": ["https://new.example.com/new/", "https://new.example.com/final/"],
            "redirects": [
                {"source": "https://old.example.com/old/", "destination": "https://new.example.com/new/"},
                {"source": "https://new.example.com/new/", "destination": "https://new.example.com/final/"},
            ],
        })
        self.assertIn("redirect_chain", {issue["code"] for issue in report["issues"]})
        rules = {rule["source"]: rule["destination"] for rule in report["rules"]}
        self.assertEqual(rules["https://old.example.com/old/"], "https://new.example.com/final/")
        self.assertEqual(rules["https://new.example.com/new/"], "https://new.example.com/final/")
        self.assertNotIn("source_not_in_inventory", {issue["code"] for issue in report["issues"]})

    def test_detects_missing_ambiguous_invalid_duplicate_and_loop_rows(self):
        report = MIGRATION.analyse_migration({
            "old_urls": [
                "https://old.example.com/missing/", "https://old.example.com/shared/",
                "https://old.example.com/loop-a/", "https://old.example.com/loop-b/",
                "https://old.example.com/shared/", "http://localhost/private/",
            ],
            "new_urls": ["https://one.example.com/shared/", "https://two.example.com/shared/"],
            "redirects": [
                {"source": "https://old.example.com/loop-a/", "destination": "https://old.example.com/loop-b/"},
                {"source": "https://old.example.com/loop-b/", "destination": "https://old.example.com/loop-a/"},
            ],
        })
        codes = {issue["code"] for issue in report["issues"]}
        self.assertTrue({"missing_destination", "ambiguous_path", "redirect_loop", "invalid_url", "duplicate_url"}.issubset(codes))
        self.assertEqual(report["summary"]["redirect_loops"], 2)
        self.assertEqual(report["summary"]["ambiguous"], 1)
        self.assertEqual(report["summary"]["missing"], 1)

    def test_slash_and_no_slash_sources_do_not_generate_conflicting_config_patterns(self):
        report = MIGRATION.analyse_migration({
            "old_urls": ["https://old.example.com/path", "https://old.example.com/path/"],
            "new_urls": ["https://new.example.com/one/", "https://new.example.com/two/"],
            "redirects": [
                {"source": "https://old.example.com/path", "destination": "https://new.example.com/one/"},
                {"source": "https://old.example.com/path/", "destination": "https://new.example.com/two/"},
            ],
        })
        apache = report["exports"]["apache"]
        self.assertIn("RewriteRule ^path$", apache)
        self.assertIn("RewriteRule ^path/$", apache)
        self.assertNotIn("RewriteRule ^path/?$", apache)
        nginx = report["exports"]["nginx"]
        self.assertEqual(nginx.count('location = "/path"'), 1)

    def test_query_specific_sources_are_flagged_and_excluded_from_platform_snippets(self):
        report = MIGRATION.analyse_migration({
            "old_urls": ["https://old.example.com/item/?variant=red"],
            "new_urls": ["https://new.example.com/item/?variant=red"],
        })
        self.assertEqual(report["summary"]["manual_rules"], 1)
        self.assertEqual(report["summary"]["redirect_rules"], 0)
        self.assertIn("query_source_review", {issue["code"] for issue in report["issues"]})
        self.assertEqual(json.loads(report["exports"]["vercel"])["redirects"], [])
        self.assertIn("manual_query_review", report["exports"]["csv"])

    def test_invalid_and_duplicate_mapping_sources_are_reported_without_unsafe_rules(self):
        report = MIGRATION.analyse_migration({
            "old_urls": ["https://old.example.com/a/"],
            "new_urls": ["https://new.example.com/a/"],
            "redirects": [
                {"source": "https://old.example.com/a/", "destination": "https://new.example.com/a/"},
                {"source": "https://old.example.com/a/", "destination": "https://new.example.com/missing/"},
                {"source": "javascript:alert(1)", "destination": "https://new.example.com/a/"},
            ],
        })
        codes = {issue["code"] for issue in report["issues"]}
        self.assertIn("duplicate_redirect_source", codes)
        self.assertIn("invalid_redirect_url", codes)
        self.assertEqual(len(report["rules"]), 1)

    def test_exports_are_valid_vercel_json_apache_nginx_and_csv(self):
        report = MIGRATION.analyse_migration({
            "old_urls": ["https://old.example.com/services/", "https://old.example.com/"],
            "new_urls": ["https://new.example.com/services/", "https://new.example.com/"],
        })
        exports = report["exports"]
        vercel = json.loads(exports["vercel"])
        self.assertEqual(len(vercel["redirects"]), 2)
        self.assertTrue(all(rule["permanent"] for rule in vercel["redirects"]))
        self.assertIn("RewriteCond %{HTTP_HOST}", exports["apache"])
        self.assertIn("R=301", exports["apache"])
        self.assertIn("server_name old.example.com", exports["nginx"])
        self.assertIn('location = "/services"', exports["nginx"], "Nginx output should cover the common no-trailing-slash request variant.")
        self.assertIn("return 301", exports["nginx"])
        self.assertIn("source,destination,status", exports["csv"])
        self.assertIn("Priority,Issue,Source URL", exports["findings_csv"])
        safe_csv = MIGRATION._findings_csv([{
            "severity": "high", "title": "Invalid URL", "source": "=1+2", "destination": "",
            "message": "Invalid URL", "recommendation": "Fix the URL",
        }])
        self.assertIn("'=1+2", safe_csv, "CSV exports should neutralize spreadsheet formulas from untrusted URL rows.")

    def test_requires_valid_non_empty_lists_and_enforces_limits(self):
        with self.assertRaisesRegex(MIGRATION.MigrationError, "at least one valid URL"):
            MIGRATION.analyse_migration({"old_urls": [], "new_urls": ["https://new.example.com/"]})
        with self.assertRaisesRegex(MIGRATION.MigrationError, "limited to 5,000"):
            MIGRATION.analyse_migration({"old_urls": ["https://old.example.com/"] * 5001, "new_urls": ["https://new.example.com/"]})
        with self.assertRaisesRegex(MIGRATION.MigrationError, "private or reserved"):
            MIGRATION._canonical_url("http://192.168.1.5/admin", "URL")
        with self.assertRaisesRegex(MIGRATION.MigrationError, "local address"):
            MIGRATION._canonical_url("http://preview.localhost/admin", "URL")


class MigrationHandlerTests(unittest.TestCase):
    class FakeHandler(MIGRATION.handler):
        def __init__(self, payload, headers=None):
            self.headers = headers or {}
            self.rfile = io.BytesIO(payload)
            self.wfile = io.BytesIO()
            self.status_code = None
            self.response_headers = {}

        def send_response(self, status):
            self.status_code = status

        def send_header(self, key, value):
            self.response_headers[key] = value

        def end_headers(self):
            pass

    def test_post_returns_report_and_rejects_cross_origin_and_oversized_requests(self):
        payload = json.dumps({"old_urls": ["https://old.example.com/"], "new_urls": ["https://new.example.com/"]}).encode()
        headers = {"Content-Length": str(len(payload)), "Host": "htech.example", "Origin": "https://htech.example", "x-forwarded-for": "test"}
        handler = self.FakeHandler(payload, headers)
        with patch.object(MIGRATION, "_rate_limited", return_value=False):
            handler.do_POST()
        self.assertEqual(handler.status_code, 200)
        response = json.loads(handler.wfile.getvalue())
        self.assertEqual(response["summary"]["matched"], 1)
        self.assertEqual(handler.response_headers["Cache-Control"], "no-store, max-age=0")

        denied = self.FakeHandler(payload, {**headers, "Origin": "https://attacker.example"})
        denied.do_POST()
        self.assertEqual(denied.status_code, 403)

        oversized = self.FakeHandler(b"", {**headers, "Content-Length": str(MIGRATION.MAX_BODY_BYTES + 1)})
        oversized.do_POST()
        self.assertEqual(oversized.status_code, 413)


if __name__ == "__main__":
    unittest.main()
