#!/usr/bin/env python3
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "deep-translator>=1.11.4",
# ]
# ///

"""
Tests for translate.py

Run with: uv run test_translate.py
"""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent))

from translate import (
    ChatGPTBackend,
    DeepLBackend,
    GoogleBackend,
    TranslationEngine,
    detect_locales_dir,
    find_source_file,
)


class TestFlattenUnflatten(unittest.TestCase):
    def setUp(self):
        self.engine = TranslationEngine(MagicMock())

    def test_flatten_simple(self):
        data = {"common": {"save": "Salvar", "cancel": "Cancelar"}}
        result = self.engine.flatten_keys(data)
        expected = {"common.save": "Salvar", "common.cancel": "Cancelar"}
        self.assertEqual(result, expected)

    def test_flatten_nested(self):
        data = {
            "settings": {
                "header": {"title": "Configuracoes"},
                "form": {"language": "Idioma"},
            }
        }
        result = self.engine.flatten_keys(data)
        expected = {
            "settings.header.title": "Configuracoes",
            "settings.form.language": "Idioma",
        }
        self.assertEqual(result, expected)

    def test_unflatten_simple(self):
        flat = {"common.save": "Save", "common.cancel": "Cancel"}
        result = self.engine.unflatten_keys(flat)
        expected = {"common": {"save": "Save", "cancel": "Cancel"}}
        self.assertEqual(result, expected)

    def test_unflatten_nested(self):
        flat = {
            "settings.header.title": "Settings",
            "settings.form.language": "Language",
        }
        result = self.engine.unflatten_keys(flat)
        expected = {
            "settings": {
                "header": {"title": "Settings"},
                "form": {"language": "Language"},
            }
        }
        self.assertEqual(result, expected)

    def test_roundtrip(self):
        original = {
            "common": {"save": "Salvar", "cancel": "Cancelar"},
            "settings": {"title": "Configuracoes"},
        }
        flat = self.engine.flatten_keys(original)
        restored = self.engine.unflatten_keys(flat)
        self.assertEqual(restored, original)


class TestVariableExtraction(unittest.TestCase):
    def setUp(self):
        self.engine = TranslationEngine(MagicMock())

    def test_extract_single_variable(self):
        text = "Hello {name}"
        result = self.engine.extract_variables(text)
        self.assertEqual(result, ["name"])

    def test_extract_multiple_variables(self):
        text = "{name} has {count} items"
        result = self.engine.extract_variables(text)
        self.assertEqual(result, ["name", "count"])

    def test_extract_no_variables(self):
        text = "Hello world"
        result = self.engine.extract_variables(text)
        self.assertEqual(result, [])

    def test_validate_variables_valid(self):
        source = "Hello {name}"
        translated = "Hola {name}"
        is_valid, missing = self.engine.validate_variables(source, translated, "test.key")
        self.assertTrue(is_valid)
        self.assertEqual(missing, [])

    def test_validate_variables_missing(self):
        source = "Hello {name}"
        translated = "Hola"
        is_valid, missing = self.engine.validate_variables(source, translated, "test.key")
        self.assertFalse(is_valid)
        self.assertEqual(missing, ["name"])

    def test_restore_variables(self):
        source = "Hello {name}, you have {count} items"
        translated = "Hola, tienes elementos"
        result = self.engine.restore_variables(source, translated)
        self.assertIn("{name}", result)
        self.assertIn("{count}", result)


class TestGoogleBackend(unittest.TestCase):
    def test_name(self):
        backend = GoogleBackend()
        self.assertEqual(backend.name(), "Google Translate")

    def test_requires_api_key(self):
        backend = GoogleBackend()
        self.assertFalse(backend.requires_api_key())


class TestDeepLBackend(unittest.TestCase):
    def test_requires_api_key(self):
        backend = DeepLBackend(api_key="test-key")
        self.assertTrue(backend.requires_api_key())

    def test_name(self):
        backend = DeepLBackend(api_key="test-key")
        self.assertEqual(backend.name(), "DeepL")


class TestChatGPTBackend(unittest.TestCase):
    def test_requires_api_key(self):
        backend = ChatGPTBackend(api_key="test-key")
        self.assertTrue(backend.requires_api_key())

    def test_name(self):
        backend = ChatGPTBackend(api_key="test-key")
        self.assertEqual(backend.name(), "ChatGPT")


class TestTranslationEngine(unittest.TestCase):
    def setUp(self):
        self.mock_backend = MagicMock()
        self.engine = TranslationEngine(self.mock_backend)

    def test_translate_keys_empty(self):
        result = self.engine.translate_keys({}, "pt", "en")
        self.assertEqual(result, {})

    def test_translate_keys_batch(self):
        self.mock_backend.translate_batch.return_value = ["Save", "Cancel"]
        flat_keys = {"common.save": "Salvar", "common.cancel": "Cancelar"}
        result = self.engine.translate_keys(flat_keys, "pt", "en")
        self.assertEqual(result, {"common.save": "Save", "common.cancel": "Cancel"})
        self.mock_backend.translate_batch.assert_called_once()

    def test_translate_keys_variable_preservation(self):
        self.mock_backend.translate_batch.return_value = ["Hello"]
        flat_keys = {"greeting": "Ola {name}"}
        result = self.engine.translate_keys(flat_keys, "pt", "en")
        self.assertIn("{name}", result["greeting"])

    def test_translate_file_dry_run(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            source_file = Path(tmpdir) / "pt.json"
            source_data = {"common": {"save": "Salvar"}}
            with open(source_file, "w") as f:
                json.dump(source_data, f)

            output_dir = Path(tmpdir) / "output"
            output_dir.mkdir()

            results = self.engine.translate_file(
                source_path=source_file,
                target_langs=["en"],
                source_lang="pt",
                output_dir=output_dir,
                dry_run=True,
            )

            self.assertEqual(results["en"]["status"], "dry-run")
            self.assertEqual(results["en"]["keys"], 1)
            self.assertFalse((output_dir / "en.json").exists())

    def test_translate_file_with_draft(self):
        self.mock_backend.translate_batch.return_value = ["Save"]

        with tempfile.TemporaryDirectory() as tmpdir:
            source_file = Path(tmpdir) / "pt.json"
            source_data = {"common": {"save": "Salvar"}}
            with open(source_file, "w") as f:
                json.dump(source_data, f)

            output_dir = Path(tmpdir) / "output"
            output_dir.mkdir()

            self.engine.translate_file(
                source_path=source_file,
                target_langs=["en"],
                source_lang="pt",
                output_dir=output_dir,
                draft=True,
            )

            with open(output_dir / "en.json") as f:
                result = json.load(f)

            self.assertTrue(result.get("_draft"))
            self.assertIn("_note", result)


class TestDetectLocalesDir(unittest.TestCase):
    def test_detect_locales(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            locales_dir = Path(tmpdir) / "locales"
            locales_dir.mkdir()
            original_cwd = os.getcwd()
            try:
                os.chdir(tmpdir)
                result = detect_locales_dir()
                self.assertIsNotNone(result)
                self.assertEqual(result.name, "locales")
            finally:
                os.chdir(original_cwd)

    def test_detect_messages(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            messages_dir = Path(tmpdir) / "messages"
            messages_dir.mkdir()
            original_cwd = os.getcwd()
            try:
                os.chdir(tmpdir)
                result = detect_locales_dir()
                self.assertIsNotNone(result)
                self.assertEqual(result.name, "messages")
            finally:
                os.chdir(original_cwd)


class TestFindSourceFile(unittest.TestCase):
    def test_find_json(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            locales_dir = Path(tmpdir)
            source_file = locales_dir / "pt.json"
            source_file.touch()
            result = find_source_file(locales_dir, "pt")
            self.assertEqual(result, source_file)

    def test_find_yaml(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            locales_dir = Path(tmpdir)
            source_file = locales_dir / "pt.yaml"
            source_file.touch()
            result = find_source_file(locales_dir, "pt")
            self.assertEqual(result, source_file)

    def test_not_found(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            locales_dir = Path(tmpdir)
            result = find_source_file(locales_dir, "pt")
            self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
