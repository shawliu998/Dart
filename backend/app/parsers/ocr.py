"""Optional offline OCR adapter backed by local Tesseract and Poppler commands."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
from typing import Protocol

from app.parsers.deterministic import ParsedPage


@dataclass(frozen=True)
class OCRResult:
    text: str
    engine: str
    error: str | None = None


class OCRAdapter(Protocol):
    name: str

    def recognize(self, data: bytes, mime_type: str, page_number: int) -> OCRResult: ...


class TesseractOCRAdapter:
    """Run only fixed local binaries with bounded input, time and output."""

    name = "tesseract-local-v1"

    def __init__(
        self,
        *,
        tesseract_path: str,
        pdftoppm_path: str | None,
        languages: str = "chi_sim+eng",
        timeout_seconds: int = 30,
        max_output_chars: int = 200_000,
    ) -> None:
        self.tesseract_path = tesseract_path
        self.pdftoppm_path = pdftoppm_path
        self.languages = languages
        self.timeout_seconds = timeout_seconds
        self.max_output_chars = max_output_chars

    def recognize(self, data: bytes, mime_type: str, page_number: int) -> OCRResult:
        try:
            with TemporaryDirectory(prefix="bidevidence-ocr-") as directory:
                root = Path(directory)
                image_path = self._prepare_image(root, data, mime_type, page_number)
                completed = subprocess.run(
                    [
                        self.tesseract_path,
                        str(image_path),
                        "stdout",
                        "-l",
                        self.languages,
                        "--psm",
                        "6",
                    ],
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=self.timeout_seconds,
                )
                if completed.returncode != 0:
                    return OCRResult("", self.name, "tesseract_failed")
                text = completed.stdout.replace("\x00", "").strip()
                if len(text) > self.max_output_chars:
                    return OCRResult("", self.name, "ocr_output_too_large")
                return OCRResult(text, self.name, None if text else "no_text_detected")
        except subprocess.TimeoutExpired:
            return OCRResult("", self.name, "ocr_timeout")
        except (OSError, ValueError):
            return OCRResult("", self.name, "ocr_runtime_error")

    def _prepare_image(
        self, root: Path, data: bytes, mime_type: str, page_number: int
    ) -> Path:
        if mime_type.startswith("image/"):
            suffix = ".png" if mime_type == "image/png" else ".jpg"
            image_path = root / f"input{suffix}"
            image_path.write_bytes(data)
            return image_path
        if mime_type != "application/pdf" or self.pdftoppm_path is None:
            raise ValueError("unsupported OCR input")
        pdf_path = root / "input.pdf"
        output_prefix = root / "page"
        pdf_path.write_bytes(data)
        completed = subprocess.run(
            [
                self.pdftoppm_path,
                "-f",
                str(page_number),
                "-l",
                str(page_number),
                "-singlefile",
                "-png",
                "-r",
                "200",
                "-scale-to",
                "4000",
                str(pdf_path),
                str(output_prefix),
            ],
            check=False,
            capture_output=True,
            timeout=self.timeout_seconds,
        )
        image_path = output_prefix.with_suffix(".png")
        if completed.returncode != 0 or not image_path.is_file():
            raise ValueError("PDF page rendering failed")
        return image_path


def get_ocr_adapter(mode: str, languages: str) -> OCRAdapter | None:
    selected = mode.strip().lower()
    if selected == "disabled":
        return None
    if selected not in {"auto", "tesseract"}:
        return None
    tesseract_path = _find_command(
        "tesseract",
        ("/opt/homebrew/bin/tesseract", "/usr/local/bin/tesseract"),
    )
    if tesseract_path is None:
        return None
    return TesseractOCRAdapter(
        tesseract_path=tesseract_path,
        pdftoppm_path=_find_command(
            "pdftoppm",
            ("/opt/homebrew/bin/pdftoppm", "/usr/local/bin/pdftoppm"),
        ),
        languages=languages,
    )


def _find_command(name: str, fallback_paths: tuple[str, ...]) -> str | None:
    resolved = shutil.which(name)
    if resolved:
        return resolved
    return next((path for path in fallback_paths if Path(path).is_file()), None)


def apply_ocr(
    pages: list[ParsedPage],
    data: bytes,
    mime_type: str,
    adapter: OCRAdapter | None,
) -> list[ParsedPage]:
    if adapter is None:
        return pages
    enriched: list[ParsedPage] = []
    for page in pages:
        if page.layout_json.get("ocr_required") is not True:
            enriched.append(page)
            continue
        result = adapter.recognize(data, mime_type, page.page_number)
        layout = {
            **page.layout_json,
            "ocr_attempted": True,
            "ocr_engine": result.engine,
            "ocr_error": result.error,
        }
        if not result.text:
            enriched.append(
                ParsedPage(page.page_number, page.raw_text, layout, ocr_used=False)
            )
            continue
        layout["ocr_required"] = False
        layout["blocks"] = [
            {"type": "ocr_text", "bbox": [0, 0, 1, 1], "text": result.text}
        ]
        enriched.append(
            ParsedPage(page.page_number, result.text, layout, ocr_used=True)
        )
    return enriched
