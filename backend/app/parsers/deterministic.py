from __future__ import annotations

import re
from io import BytesIO
from zipfile import BadZipFile, ZipFile
from dataclasses import dataclass
from xml.etree import ElementTree

from pypdf import PdfReader


@dataclass(frozen=True)
class ParsedPage:
    page_number: int
    raw_text: str
    layout_json: dict
    ocr_used: bool = False


class DeterministicTextParser:
    """Safe demo adapter; never executes document instructions or embedded code."""

    page_marker = re.compile(r"(?:^|\n)\s*(?:={2,}\s*)?第\s*\d+\s*页(?:\s*={2,})?\s*(?:\n|$)")

    def parse(self, data: bytes, mime_type: str) -> list[ParsedPage]:
        if data.startswith(b"%PDF") and mime_type == "application/pdf":
            return self._parse_pdf(data)
        if mime_type.endswith("wordprocessingml.document"):
            return self._parse_docx(data)
        payload = data.split(b"\n", 1)[1] if data.startswith(b"%PDF") else data
        text = payload.decode("utf-8", errors="replace").replace("\x00", "")
        chunks = text.split("\f")
        if len(chunks) == 1:
            chunks = self.page_marker.split(text)
        chunks = [item.strip() for item in chunks if item.strip()]
        if not chunks:
            chunks = ["[该页未提取到可用文本，需人工复核/OCR]"]
        return [
            ParsedPage(
                page_number=index,
                raw_text=chunk,
                layout_json={
                    "adapter": "deterministic-text-v1",
                    "blocks": [{"type": "paragraph", "bbox": [0, 0, 1, 1], "text": chunk}],
                },
            )
            for index, chunk in enumerate(chunks, start=1)
        ]

    def _parse_pdf(self, data: bytes) -> list[ParsedPage]:
        reader = PdfReader(BytesIO(data), strict=False)
        pages = []
        for index, pdf_page in enumerate(reader.pages, start=1):
            text = (pdf_page.extract_text() or "").strip()
            if not text:
                text = "[该页未提取到可用文本，需人工复核/OCR]"
            pages.append(
                ParsedPage(
                    index,
                    text,
                    {
                        "adapter": "pypdf-v1",
                        "blocks": [{"type": "page_text", "bbox": [0, 0, 1, 1], "text": text}],
                    },
                )
            )
        if not pages:
            raise ValueError("PDF contains no pages")
        return pages

    def _parse_docx(self, data: bytes) -> list[ParsedPage]:
        try:
            with ZipFile(BytesIO(data)) as archive:
                infos = archive.infolist()
                if len(infos) > 2000 or sum(item.file_size for item in infos) > 50 * 1024 * 1024:
                    raise ValueError("DOCX archive exceeds safe expansion limits")
                if any(".." in item.filename.split("/") for item in infos):
                    raise ValueError("DOCX contains unsafe paths")
                xml_data = archive.read("word/document.xml")
        except (BadZipFile, KeyError) as exc:
            raise ValueError("invalid DOCX package") from exc
        root = ElementTree.fromstring(xml_data)
        paragraphs = []
        for paragraph in root.iter(
            "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"
        ):
            text = "".join(
                node.text or ""
                for node in paragraph.iter(
                    "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"
                )
            ).strip()
            if text:
                paragraphs.append(text)
        return [
            ParsedPage(
                1,
                "\n".join(paragraphs) or "[文档未提取到可用文本，需人工复核]",
                {"adapter": "docx-xml-v1", "blocks": []},
            )
        ]
