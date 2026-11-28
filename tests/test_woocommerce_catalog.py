import importlib.util
import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "api" / "woocommerce-catalog.py"
SPEC = importlib.util.spec_from_file_location("woocommerce_catalog_api", MODULE_PATH)
CATALOG = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CATALOG)


class CatalogAnalysisTests(unittest.TestCase):
    def test_woocommerce_export_finds_skus_missing_data_prices_and_image_urls(self):
        csv_text = '''Type,SKU,Name,Published,Regular price,Sale price,Categories,Images,Description
simple,DUP-1,Blue cotton shirt,1,29.95,19.95,Clothing,https://shop.example/images/shirt.jpg,Soft cotton shirt.
simple,dup-1,,1,not-a-price,30,,javascript:alert(1),
variable,,Size options,1,,,Clothing,,Parent product with variations.
variation,VAR-1,Large size,1,-2,,Clothing,https://127.0.0.1/private.jpg,Large variant.
simple,SALE-1,Sale item,1,10,10,Clearance,https://shop.example/images/sale.jpg,Sale example.
'''
        report = CATALOG.analyze_catalog(csv_text)
        codes = {issue["code"] for issue in report["issues"]}
        self.assertEqual(report["summary"]["products_scanned"], 5)
        self.assertIn("duplicate_sku", codes)
        self.assertIn("missing_name", codes)
        self.assertIn("invalid_regular_price", codes)
        self.assertIn("sale_not_below_regular", codes)
        self.assertIn("missing_images", codes)
        self.assertIn("invalid_image_url", codes)
        self.assertEqual(report["summary"]["duplicate_sku_groups"], 1)
        self.assertEqual(report["summary"]["invalid_image_urls"], 2)
        self.assertIn("sku", report["columns_recognized"])

    def test_price_parser_rejects_currency_symbols_and_exponent_notation(self):
        self.assertIsNone(CATALOG._parse_price("₦2,500"))
        self.assertIsNone(CATALOG._parse_price("1e3"))
        self.assertEqual(CATALOG._parse_price("0.00"), CATALOG.Decimal("0.00"))

    def test_variable_product_parent_does_not_require_a_price(self):
        report = CATALOG.analyze_catalog(
            "Type,SKU,Name,Published,Regular price\nvariable,VAR-PARENT,Variable product,1,\n"
        )
        self.assertNotIn("missing_regular_price", {issue["code"] for issue in report["issues"]})

    def test_generic_header_aliases_and_quoted_commas_are_supported(self):
        report = CATALOG.analyze_catalog(
            'stock_keeping_unit,product_name,regular_price,image_urls,product_description\n'
            'SKU-2,"Desk, oak finish",125.00,https://cdn.example/item.jpg,"A useful, sturdy desk."\n'
        )
        self.assertEqual(report["summary"]["products_scanned"], 1)
        self.assertIn("sku", report["columns_recognized"])
        self.assertIn("name", report["columns_recognized"])
        self.assertNotIn("missing_name", {issue["code"] for issue in report["issues"]})

    def test_missing_columns_are_reported_once_and_sku_is_case_insensitive(self):
        report = CATALOG.analyze_catalog("Product name\nFirst\nSecond\n")
        self.assertEqual(sum(issue["code"] == "missing_column" and issue["title"] == "SKU column not found" for issue in report["issues"]), 1)
        self.assertEqual(sum(issue["code"] == "missing_column" and issue["title"] == "Regular price column not found" for issue in report["issues"]), 1)

        duplicate = CATALOG.analyze_catalog("SKU,Name,Regular price\nabc,One,10\nABC,Two,12\n")
        self.assertEqual(duplicate["summary"]["duplicate_sku_products"], 2)

    def test_report_preserves_formula_like_sku_as_unexecuted_plain_data(self):
        report = CATALOG.analyze_catalog(
            'SKU,Name,Regular price,Images\n=1+2,Formula product,15,https://example.com/image.jpg\n'
            '=1+2,Duplicate formula product,20,https://example.com/other.jpg\n'
        )
        self.assertIn("=1+2", repr(report["issues"]), "The report should retain the source SKU for review.")

    def test_findings_response_is_capped_for_serverless_payload_limits(self):
        row = "SKU-row,,,,,"
        csv_text = "SKU,Name,Regular price,Categories,Images,Description\n" + (row + "\n") * CATALOG.MAX_ROWS
        report = CATALOG.analyze_catalog(csv_text)
        self.assertTrue(report["summary"]["findings_truncated"])
        self.assertEqual(len(report["issues"]), CATALOG.MAX_FINDINGS)
        self.assertNotIn("exports", report, "The browser creates its CSV from the bounded issue list to avoid duplicating response data.")
        self.assertLess(len(json.dumps(report).encode("utf-8")), 3_000_000)

    def test_row_limit_marks_partial_analysis_and_invalid_headers_are_rejected(self):
        rows = "SKU,Name,Regular price\n" + "SKU,Product,12\n" * (CATALOG.MAX_ROWS + 1)
        report = CATALOG.analyze_catalog(rows)
        self.assertEqual(report["summary"]["products_scanned"], CATALOG.MAX_ROWS)
        self.assertTrue(report["summary"]["rows_truncated"])
        with self.assertRaisesRegex(ValueError, "could not recognize"):
            CATALOG.analyze_catalog("ID,Post ID,Status\n1,2,publish\n")
        with self.assertRaisesRegex(ValueError, "3 MB"):
            CATALOG.analyze_catalog("SKU,Name\n" + ("X," + "a" * CATALOG.MAX_CSV_BYTES))

    def test_bad_csv_rows_and_image_urls_are_handled_without_fetching(self):
        with self.assertRaisesRegex(ValueError, "more values than the header"):
            CATALOG.analyze_catalog("SKU,Name\nSKU-1,Product,extra\n")
        self.assertFalse(CATALOG._valid_image_url("file:///etc/passwd"))
        self.assertFalse(CATALOG._valid_image_url("http://localhost/image.png"))
        self.assertFalse(CATALOG._valid_image_url("https://192.168.0.1/image.png"))
        self.assertTrue(CATALOG._valid_image_url("https://cdn.example/image.png"))


class CatalogHandlerTests(unittest.TestCase):
    class FakeHandler(CATALOG.handler):
        def __init__(self, body, headers=None):
            self.headers = headers or {}
            self.rfile = io.BytesIO(body)
            self.wfile = io.BytesIO()
            self.status_code = None
            self.response_headers = {}

        def send_response(self, status):
            self.status_code = status

        def send_header(self, key, value):
            self.response_headers[key] = value

        def end_headers(self):
            pass

    def test_post_processes_uploaded_csv_in_memory_and_rejects_bad_origins_and_size(self):
        body = b"SKU,Name,Regular price\nSKU-1,Caf\xe9,invalid\n"
        headers = {
            "Content-Length": str(len(body)), "Host": "htech.example", "Origin": "https://htech.example",
            "x-forwarded-for": "catalog-test",
        }
        handler = self.FakeHandler(body, headers)
        with patch.object(CATALOG, "_rate_limited", return_value=False):
            handler.do_POST()
        self.assertEqual(handler.status_code, 200)
        result = json.loads(handler.wfile.getvalue())
        self.assertEqual(result["summary"]["products_scanned"], 1)
        self.assertTrue(any(issue["product_name"] == "Café" for issue in result["issues"]))
        self.assertEqual(handler.response_headers["Cache-Control"], "no-store, max-age=0")

        denied = self.FakeHandler(body, {**headers, "Origin": "https://attacker.example"})
        denied.do_POST()
        self.assertEqual(denied.status_code, 403)

        oversized = self.FakeHandler(b"", {**headers, "Content-Length": str(CATALOG.MAX_CSV_BYTES + 1)})
        oversized.do_POST()
        self.assertEqual(oversized.status_code, 413)

    def test_post_reports_invalid_csv_and_rate_limits_repeated_uploads(self):
        body = b"ID,Post ID\n1,1\n"
        headers = {"Content-Length": str(len(body)), "Host": "htech.example", "Origin": "https://htech.example", "x-forwarded-for": "blocked"}
        invalid = self.FakeHandler(body, headers)
        with patch.object(CATALOG, "_rate_limited", return_value=False):
            invalid.do_POST()
        self.assertEqual(invalid.status_code, 422)

        limited = self.FakeHandler(body, headers)
        with patch.object(CATALOG, "_rate_limited", return_value=True):
            limited.do_POST()
        self.assertEqual(limited.status_code, 429)


if __name__ == "__main__":
    unittest.main()
