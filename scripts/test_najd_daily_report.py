import json
import os
import unittest
from unittest.mock import patch
from najd_daily_report import create_report, normalize_diagnostics, render_markdown, safe_text
from najd_gemini import GeminiUnavailable


class FakeGemini:
    def __init__(self, answer=None, failure=None):
        self.answer = answer
        self.failure = failure
        self.prompt = None

    def generate(self, prompt, **kwargs):
        self.prompt = prompt
        if self.failure:
            raise self.failure
        return {'text': json.dumps(self.answer), 'model': 'models/test-flash'}


class DailyReportTests(unittest.TestCase):
    def test_only_safe_fields_enter_prompt(self):
        client = FakeGemini({'summary': 'اختبار', 'next_checks': ['تحقق من البحث']})
        report = create_report({'providers': [{'id': 'test', 'status': 'http_error', 'http_status': 403,
                                'seed_url': 'https://private.invalid/?token=SECRET', 'user_query': 'PRIVATE'}]}, client)
        self.assertNotIn('SECRET', client.prompt)
        self.assertNotIn('PRIVATE', client.prompt)
        self.assertEqual(report['repairs_applied'], 0)
        self.assertEqual(report['notification_mode'], 'github-only')

    def test_missing_key_preserves_real_evidence(self):
        report = create_report({'providers': [{'id': 'p', 'status': 'unavailable'}]}, FakeGemini(failure=GeminiUnavailable('missing')))
        self.assertEqual(report['gemini']['status'], 'unavailable')
        self.assertEqual(report['counts']['unavailable'], 1)
        self.assertIn('**0**', render_markdown(report))

    def test_invalid_model_output_is_not_executed(self):
        report = create_report({'providers': []}, FakeGemini({'summary': 'x', 'next_checks': 'execute shell'}))
        self.assertEqual(report['gemini']['status'], 'unavailable')

    def test_secrets_urls_and_mentions_redacted(self):
        with patch.dict(os.environ, {'GEMINI_API_KEY': 'secret-value'}):
            clean = safe_text('secret-value @owner <script> https://example.com/?token=x Bearer abc')
        for bad in ('secret-value', '@owner', '<script>', 'https://', 'abc'):
            self.assertNotIn(bad, clean)

    def test_mirrors_are_not_counted_as_independent(self):
        report = create_report({'providers': [{'id': 'original', 'status': 'reachable'}, {'id': 'mirror', 'mirror_of': 'original', 'status': 'unavailable'}]}, FakeGemini(failure=GeminiUnavailable()))
        self.assertEqual(report['independent_providers'], 1)
        self.assertEqual(report['mirror_providers'], 1)
        self.assertIn('مرآة: original', render_markdown(report))

    def test_bad_provider_ids_rejected(self):
        with self.assertRaises(ValueError):
            normalize_diagnostics({'providers': [{'id': '<script>', 'status': 'reachable'}]})

    def test_http_reachable_does_not_claim_playback(self):
        report = create_report({'providers': [{'id': 'p', 'status': 'reachable', 'http_status': 200}]}, FakeGemini(failure=GeminiUnavailable()))
        self.assertIn('لا يثبت', render_markdown(report))
        self.assertEqual(report['counts']['reachable'], 1)


if __name__ == '__main__':
    unittest.main()
