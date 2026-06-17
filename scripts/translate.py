#!/usr/bin/env python3
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "deep-translator>=1.11.4",
# ]
# ///

"""
translate.py - i18n Translation Tool for Polyglot

Translates i18n JSON files from a source locale to multiple target locales.
Supports multiple translation backends: Google (free), DeepL, ChatGPT.

Usage:
    # With uv (recommended - auto-installs dependencies)
    uv run translate.py --source pt --targets en,es --dir locales/
    uv run translate.py --source pt --targets en --backend deepl --api-key YOUR_KEY

    # With pip
    pip install deep-translator
    python translate.py --source pt --targets en,es --dir locales/

Requirements:
    pip install deep-translator
    # For ChatGPT backend: pip install deep-translator[ai]
"""

import argparse
import json
import os
import re
import sys
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    from deep_translator import GoogleTranslator, DeeplTranslator, ChatGptTranslator
except ImportError:
    print("Error: deep-translator is not installed.")
    print("Install with: pip install deep-translator")
    print("For ChatGPT support: pip install deep-translator[ai]")
    sys.exit(1)


class TranslationError(Exception):
    pass


class VariablePreservationError(TranslationError):
    pass


class BackendError(TranslationError):
    pass


class TranslationBackend(ABC):
    @abstractmethod
    def translate_batch(self, texts: List[str], source: str, target: str) -> List[str]:
        pass

    @abstractmethod
    def name(self) -> str:
        pass

    @abstractmethod
    def requires_api_key(self) -> bool:
        pass


class GoogleBackend(TranslationBackend):
    def __init__(self):
        self._translator = GoogleTranslator(source="auto", target="en")

    def translate_batch(self, texts: List[str], source: str, target: str) -> List[str]:
        self._translator.source = source
        self._translator.target = target
        results = []
        batch_size = 50
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            try:
                translated = self._translator.translate_batch(batch)
                results.extend(translated)
            except Exception as e:
                raise BackendError(f"Google Translate error: {e}")
            if i + batch_size < len(texts):
                time.sleep(0.5)
        return results

    def name(self) -> str:
        return "Google Translate"

    def requires_api_key(self) -> bool:
        return False


class DeepLBackend(TranslationBackend):
    def __init__(self, api_key: str, use_free: bool = True):
        if not api_key:
            raise BackendError("DeepL requires an API key. Set DEEPL_API_KEY or pass --api-key")
        self._translator = DeeplTranslator(api_key=api_key, source="en", target="en", use_free_api=use_free)

    def translate_batch(self, texts: List[str], source: str, target: str) -> List[str]:
        self._translator.source = source
        self._translator.target = target
        results = []
        batch_size = 50
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            try:
                translated = self._translator.translate_batch(batch)
                results.extend(translated)
            except Exception as e:
                raise BackendError(f"DeepL error: {e}")
            if i + batch_size < len(texts):
                time.sleep(0.5)
        return results

    def name(self) -> str:
        return "DeepL"

    def requires_api_key(self) -> bool:
        return True


class ChatGPTBackend(TranslationBackend):
    def __init__(self, api_key: str):
        if not api_key:
            raise BackendError("ChatGPT requires an API key. Set OPENAI_API_KEY or pass --api-key")
        self._api_key = api_key

    def translate_batch(self, texts: List[str], source: str, target: str) -> List[str]:
        try:
            from deep_translator import ChatGptTranslator
        except ImportError:
            raise BackendError("ChatGPT backend requires: pip install deep-translator[ai]")

        results = []
        for text in texts:
            try:
                translator = ChatGptTranslator(api_key=self._api_key, target=target)
                translated = translator.translate(text)
                results.append(translated)
            except Exception as e:
                raise BackendError(f"ChatGPT error: {e}")
            time.sleep(0.2)
        return results

    def name(self) -> str:
        return "ChatGPT"

    def requires_api_key(self) -> bool:
        return True


class TranslationEngine:
    VARIABLE_PATTERN = re.compile(r"\{([^}]+)\}")
    PLURAL_PATTERN = re.compile(r"\{count,\s*plural,\s*(.+?)\}", re.DOTALL)
    SELECT_PATTERN = re.compile(r"\{[^,]+,\s*select,\s*(.+?)\}", re.DOTALL)

    def __init__(self, backend: TranslationBackend):
        self._backend = backend

    def flatten_keys(self, obj: Dict[str, Any], prefix: str = "") -> Dict[str, str]:
        keys = {}
        for key, value in obj.items():
            full_key = f"{prefix}.{key}" if prefix else key
            if isinstance(value, dict):
                keys.update(self.flatten_keys(value, full_key))
            else:
                keys[full_key] = str(value) if value is not None else ""
        return keys

    def unflatten_keys(self, flat: Dict[str, str]) -> Dict[str, Any]:
        result: Dict[str, Any] = {}
        for compound_key, value in flat.items():
            parts = compound_key.split(".")
            current = result
            for part in parts[:-1]:
                if part not in current:
                    current[part] = {}
                current = current[part]
            current[parts[-1]] = value
        return result

    def extract_variables(self, text: str) -> List[str]:
        return self.VARIABLE_PATTERN.findall(text)

    def validate_variables(self, source: str, translated: str, key: str) -> Tuple[bool, List[str]]:
        source_vars = self.extract_variables(source)
        translated_vars = self.extract_variables(translated)
        missing = [v for v in source_vars if v not in translated_vars]
        return len(missing) == 0, missing

    def restore_variables(self, source: str, translated: str) -> str:
        source_vars = self.extract_variables(source)
        translated_vars = self.extract_variables(translated)
        if not source_vars:
            return translated
        for var in source_vars:
            if var not in translated_vars:
                placeholder = f"{{{var}}}"
                translated = self._insert_variable(translated, placeholder)
        return translated

    def _insert_variable(self, text: str, placeholder: str) -> str:
        sentences = re.split(r"(?<=[.!?])\s+", text)
        if sentences:
            sentences[-1] = sentences[-1].rstrip() + " " + placeholder
            return " ".join(sentences)
        return text + " " + placeholder

    def translate_keys(
        self,
        flat_keys: Dict[str, str],
        source_lang: str,
        target_lang: str,
        verbose: bool = False,
    ) -> Dict[str, str]:
        texts = list(flat_keys.values())
        keys = list(flat_keys.keys())

        if not texts:
            return {}

        if verbose:
            print(f"  Translating {len(texts)} strings from '{source_lang}' to '{target_lang}'...")

        try:
            translated = self._backend.translate_batch(texts, source_lang, target_lang)
        except BackendError as e:
            raise TranslationError(f"Translation failed: {e}")

        if len(translated) != len(texts):
            raise TranslationError(
                f"Translation count mismatch: expected {len(texts)}, got {len(translated)}"
            )

        result = {}
        warnings = []
        for key, source_text, translated_text in zip(keys, texts, translated):
            is_valid, missing_vars = self.validate_variables(source_text, translated_text, key)
            if not is_valid:
                translated_text = self.restore_variables(source_text, translated_text)
                warnings.append(
                    f"  Warning: Key '{key}' missing variables {missing_vars}, restored"
                )

            result[key] = translated_text

        if verbose and warnings:
            for warning in warnings:
                print(warning)

        return result

    def translate_file(
        self,
        source_path: Path,
        target_langs: List[str],
        source_lang: str,
        output_dir: Path,
        draft: bool = False,
        verbose: bool = False,
        dry_run: bool = False,
    ) -> Dict[str, Dict[str, Any]]:
        with open(source_path, "r", encoding="utf-8") as f:
            source_data = json.load(f)

        flat_keys = self.flatten_keys(source_data)

        if verbose:
            print(f"Source file: {source_path}")
            print(f"Keys found: {len(flat_keys)}")
            print(f"Target locales: {', '.join(target_langs)}")
            print(f"Backend: {self._backend.name()}")
            print()

        results = {}
        for target_lang in target_langs:
            if verbose:
                print(f"Processing: {target_lang}")

            if dry_run:
                results[target_lang] = {"status": "dry-run", "keys": len(flat_keys)}
                if verbose:
                    print(f"  [DRY RUN] Would translate {len(flat_keys)} keys to '{target_lang}'")
                continue

            translated = self.translate_keys(flat_keys, source_lang, target_lang, verbose)
            target_data = self.unflatten_keys(translated)

            if draft:
                target_data = self._mark_as_draft(target_data)

            results[target_lang] = target_data

            output_path = output_dir / f"{target_lang}.json"
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(target_data, f, indent=2, ensure_ascii=False)

            if verbose:
                print(f"  Written: {output_path}")
                print()

        return results

    def _mark_as_draft(self, data: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "_draft": True,
            "_note": "Translations generated by machine. Review required before production use.",
            **data,
        }


def detect_locales_dir() -> Optional[Path]:
    candidates = ["locales", "messages", "i18n", "lang", "translations", "public/locales"]
    for candidate in candidates:
        path = Path(candidate)
        if path.is_dir():
            return path
    return None


def find_source_file(locales_dir: Path, source_lang: str) -> Optional[Path]:
    candidates = [
        f"{source_lang}.json",
        f"{source_lang}.yaml",
        f"{source_lang}.yml",
    ]
    for candidate in candidates:
        path = locales_dir / candidate
        if path.is_file():
            return path
    return None


def create_backend(backend_name: str, api_key: Optional[str], use_free: bool = True) -> TranslationBackend:
    if backend_name == "google":
        return GoogleBackend()
    elif backend_name == "deepl":
        resolved_key = api_key or os.environ.get("DEEPL_API_KEY", "")
        return DeepLBackend(api_key=resolved_key, use_free=use_free)
    elif backend_name == "chatgpt":
        resolved_key = api_key or os.environ.get("OPENAI_API_KEY", "")
        return ChatGPTBackend(api_key=resolved_key)
    else:
        raise BackendError(f"Unknown backend: {backend_name}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="translate",
        description="Translate i18n JSON files to multiple locales using various backends.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python translate.py --source pt --targets en,es --dir locales/
  python translate.py --source pt --targets en --backend deepl --api-key YOUR_KEY
  python translate.py --source pt --targets en,es,fr --backend chatgpt --api-key YOUR_KEY
  python translate.py --source pt --targets en --dry-run
  python translate.py --source pt --targets en --draft

Backends:
  google   - Google Translate (free, no API key required)
  deepl    - DeepL API (requires DEEPL_API_KEY or --api-key)
  chatgpt  - OpenAI ChatGPT (requires OPENAI_API_KEY or --api-key)
        """,
    )

    parser.add_argument(
        "--source",
        "-s",
        required=True,
        help="Source locale code (e.g., pt, en, es)",
    )
    parser.add_argument(
        "--targets",
        "-t",
        required=True,
        help="Comma-separated target locale codes (e.g., en,es,fr)",
    )
    parser.add_argument(
        "--dir",
        "-d",
        type=Path,
        default=None,
        help="Directory containing translation files (auto-detected if omitted)",
    )
    parser.add_argument(
        "--backend",
        "-b",
        choices=["google", "deepl", "chatgpt"],
        default="google",
        help="Translation backend (default: google)",
    )
    parser.add_argument(
        "--api-key",
        "-k",
        default=None,
        help="API key for the translation backend (or set env var)",
    )
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=None,
        help="Output directory for translated files (defaults to --dir)",
    )
    parser.add_argument(
        "--draft",
        action="store_true",
        help="Mark translations as draft (adds _draft flag to output)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be translated without making changes",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Show detailed progress information",
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Run validate-keys.js after translation",
    )
    parser.add_argument(
        "--use-free-api",
        action="store_true",
        default=True,
        help="Use DeepL free API tier (default: true)",
    )

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    target_langs = [lang.strip() for lang in args.targets.split(",")]
    if not target_langs:
        print("Error: No target languages specified")
        sys.exit(1)

    locales_dir = args.dir or detect_locales_dir()
    if not locales_dir:
        print("Error: Could not find locales directory.")
        print("Specify with --dir or run from project root.")
        sys.exit(1)

    if not locales_dir.is_dir():
        print(f"Error: Directory not found: {locales_dir}")
        sys.exit(1)

    source_file = find_source_file(locales_dir, args.source)
    if not source_file:
        print(f"Error: Source file not found: {locales_dir}/{args.source}.json")
        sys.exit(1)

    output_dir = args.output or locales_dir

    try:
        backend = create_backend(args.backend, args.api_key, args.use_free_api)
    except BackendError as e:
        print(f"Error: {e}")
        sys.exit(1)

    engine = TranslationEngine(backend)

    print(f"Polyglot Translation Tool")
    print(f"Backend: {backend.name()}")
    print(f"Source: {args.source} ({source_file})")
    print(f"Targets: {', '.join(target_langs)}")
    print(f"Output: {output_dir}")
    if args.draft:
        print("Mode: DRAFT (translations marked for review)")
    if args.dry_run:
        print("Mode: DRY RUN (no files will be written)")
    print()

    try:
        results = engine.translate_file(
            source_path=source_file,
            target_langs=target_langs,
            source_lang=args.source,
            output_dir=output_dir,
            draft=args.draft,
            verbose=args.verbose,
            dry_run=args.dry_run,
        )
    except TranslationError as e:
        print(f"Error: {e}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in source file: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        sys.exit(1)

    if not args.dry_run:
        print("Translation complete!")
        print()
        print("Files generated:")
        for lang in target_langs:
            print(f"  {output_dir}/{lang}.json")

        if args.draft:
            print()
            print("Note: Translations are marked as DRAFT. Review before production use.")

        if args.validate:
            print()
            print("Running validation...")
            validate_script = Path(__file__).parent / "validate-keys.js"
            if validate_script.is_file():
                import subprocess

                result = subprocess.run(
                    ["node", str(validate_script), str(output_dir)],
                    capture_output=True,
                    text=True,
                )
                print(result.stdout)
                if result.returncode != 0:
                    print(result.stderr)
            else:
                print(f"Warning: validate-keys.js not found at {validate_script}")

    sys.exit(0)


if __name__ == "__main__":
    main()
