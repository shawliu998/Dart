from __future__ import annotations

from pathlib import Path
import subprocess

from app.parsers.deterministic import ParsedPage
from app.parsers.ocr import OCRResult, TesseractOCRAdapter, apply_ocr, get_ocr_adapter
from app.main import health


class FakeOCRAdapter:
    name = "fake-ocr"

    def __init__(self, result: OCRResult) -> None:
        self.result = result

    def recognize(self, data: bytes, mime_type: str, page_number: int) -> OCRResult:
        return self.result


def _ocr_page() -> ParsedPage:
    return ParsedPage(
        1,
        "",
        {"adapter": "pypdf-v1", "ocr_required": True, "blocks": []},
    )


def test_apply_ocr_marks_success_only_when_text_is_returned() -> None:
    completed = apply_ocr(
        [_ocr_page()],
        b"image",
        "image/png",
        FakeOCRAdapter(OCRResult("投标人须提供营业执照", "fake-ocr")),
    )

    assert completed[0].raw_text == "投标人须提供营业执照"
    assert completed[0].ocr_used is True
    assert completed[0].layout_json["ocr_required"] is False
    assert completed[0].layout_json["ocr_engine"] == "fake-ocr"

    failed = apply_ocr(
        [_ocr_page()],
        b"image",
        "image/png",
        FakeOCRAdapter(OCRResult("", "fake-ocr", "no_text_detected")),
    )
    assert failed[0].raw_text == ""
    assert failed[0].ocr_used is False
    assert failed[0].layout_json["ocr_required"] is True
    assert failed[0].layout_json["ocr_error"] == "no_text_detected"


def test_tesseract_adapter_renders_one_pdf_page_then_recognizes(monkeypatch) -> None:
    calls: list[list[str]] = []

    def fake_run(args: list[str], **kwargs):
        calls.append(args)
        if args[0] == "/usr/bin/pdftoppm":
            Path(f"{args[-1]}.png").write_bytes(b"rendered")
            return subprocess.CompletedProcess(args, 0, b"", b"")
        return subprocess.CompletedProcess(args, 0, "扫描条款", "")

    monkeypatch.setattr(subprocess, "run", fake_run)
    adapter = TesseractOCRAdapter(
        tesseract_path="/usr/bin/tesseract",
        pdftoppm_path="/usr/bin/pdftoppm",
    )

    result = adapter.recognize(b"%PDF-fake", "application/pdf", 3)

    assert result.text == "扫描条款"
    assert calls[0][1:5] == ["-f", "3", "-l", "3"]
    assert calls[1][0] == "/usr/bin/tesseract"


def test_tesseract_timeout_and_missing_binary_degrade_without_text(monkeypatch) -> None:
    def timeout(*_args, **_kwargs):
        raise subprocess.TimeoutExpired("tesseract", 30)

    monkeypatch.setattr(subprocess, "run", timeout)
    adapter = TesseractOCRAdapter(
        tesseract_path="/usr/bin/tesseract",
        pdftoppm_path=None,
    )
    result = adapter.recognize(b"\x89PNG", "image/png", 1)
    assert result.text == ""
    assert result.error == "ocr_timeout"

    monkeypatch.setattr(
        "app.parsers.ocr._find_command", lambda _name, _fallback_paths: None
    )
    assert get_ocr_adapter("auto", "chi_sim+eng") is None
    assert get_ocr_adapter("disabled", "chi_sim+eng") is None

    monkeypatch.setenv("BIDEVIDENCE_OCR_MODE", "disabled")
    assert health()["ocr_status"] == "disabled"


def test_document_parse_job_persists_successful_offline_ocr(client, demo, monkeypatch) -> None:
    adapter = FakeOCRAdapter(OCRResult("投标人须提供营业执照", "fake-ocr"))
    monkeypatch.setattr(
        "app.services.documents.get_ocr_adapter", lambda _mode, _languages: adapter
    )
    uploaded = client.post(
        f"/api/projects/{demo['project_id']}/documents",
        headers=demo["auth_headers"],
        data={"document_type": "tender_attachment"},
        files={"file": ("扫描附件.png", b"\x89PNG\r\n\x1a\nfixture", "image/png")},
    )
    assert uploaded.status_code == 201, uploaded.text
    document_id = uploaded.json()["id"]

    parsed = client.post(f"/api/documents/{document_id}/parse", headers=demo["auth_headers"])
    assert parsed.status_code == 202, parsed.text
    job = client.get(f"/api/jobs/{parsed.json()['id']}", headers=demo["auth_headers"])
    assert job.json()["status"] == "completed"
    page = client.get(f"/api/documents/{document_id}/pages/1", headers=demo["auth_headers"])
    assert page.json()["raw_text"] == "投标人须提供营业执照"
    assert page.json()["ocr_used"] is True
    assert page.json()["layout_json"]["ocr_required"] is False
