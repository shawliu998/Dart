#!/usr/bin/env python3
"""Generate deterministic, valid PDF/DOCX/XLSX demo documents with stdlib only."""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "demo"
ZIP_TIME = (2026, 1, 1, 0, 0, 0)


def _zip_write(archive: zipfile.ZipFile, name: str, data: str | bytes) -> None:
    info = zipfile.ZipInfo(name, ZIP_TIME)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    archive.writestr(info, data.encode("utf-8") if isinstance(data, str) else data)


def make_pdf(path: Path, pages: list[list[str]], title: str) -> None:
    """Create a small Unicode CJK PDF using the standard STSong-Light CID font."""
    objects: list[bytes] = []

    def add(value: bytes) -> int:
        objects.append(value)
        return len(objects)

    catalog_id = add(b"")
    pages_id = add(b"")
    font_id = add(
        b"<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light "
        b"/Encoding /UniGB-UCS2-H /DescendantFonts [<< /Type /Font /Subtype /CIDFontType0 "
        b"/BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) "
        b"/Supplement 4 >> >>] >>"
    )
    page_ids: list[int] = []
    for page_no, lines in enumerate(pages, 1):
        content = [b"BT /F1 12 Tf 50 790 Td 16 TL"]
        all_lines = [title, f"第 {page_no} 页 / 共 {len(pages)} 页", *lines]
        for index, line in enumerate(all_lines):
            if index:
                content.append(b"T*")
            encoded = line.encode("utf-16-be").hex().upper().encode("ascii")
            content.append(b"<" + encoded + b"> Tj")
        content.append(b"ET")
        stream = b"\n".join(content)
        stream_id = add(b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream))
        page_id = add(
            b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 595 842] "
            b"/Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>"
            % (pages_id, font_id, stream_id)
        )
        page_ids.append(page_id)
    objects[catalog_id - 1] = b"<< /Type /Catalog /Pages %d 0 R >>" % pages_id
    kids = b" ".join(f"{page_id} 0 R".encode() for page_id in page_ids)
    objects[pages_id - 1] = b"<< /Type /Pages /Kids [%s] /Count %d >>" % (kids, len(page_ids))

    payload = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for number, obj in enumerate(objects, 1):
        offsets.append(len(payload))
        payload.extend(f"{number} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(payload)
    payload.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    payload.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        payload.extend(f"{offset:010d} 00000 n \n".encode())
    payload.extend(
        b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n"
        % (len(objects) + 1, catalog_id, xref)
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def make_docx(path: Path, paragraphs: list[str], *, tracked_change: str | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = []
    for text in paragraphs:
        body.append(f'<w:p><w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>')
    if tracked_change:
        body.append(
            '<w:p><w:ins w:id="1" w:author="演示复核员" w:date="2026-01-01T00:00:00Z">'
            f'<w:r><w:t>{escape(tracked_change)}</w:t></w:r></w:ins></w:p>'
        )
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f'<w:body>{"".join(body)}<w:sectPr/></w:body></w:document>'
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '</Types>'
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        '</Relationships>'
    )
    with zipfile.ZipFile(path, "w") as archive:
        _zip_write(archive, "[Content_Types].xml", content_types)
        _zip_write(archive, "_rels/.rels", rels)
        _zip_write(archive, "word/document.xml", document)


def _cell(ref: str, value: str | int | float) -> str:
    if isinstance(value, (int, float)):
        return f'<c r="{ref}"><v>{value}</v></c>'
    return f'<c r="{ref}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'


def make_xlsx(path: Path, rows: list[list[str | int | float]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet_rows = []
    for row_no, row in enumerate(rows, 1):
        cells = []
        for column_no, value in enumerate(row, 1):
            column = ""
            number = column_no
            while number:
                number, remainder = divmod(number - 1, 26)
                column = chr(65 + remainder) + column
            cells.append(_cell(f"{column}{row_no}", value))
        sheet_rows.append(f'<row r="{row_no}">{"".join(cells)}</row>')
    worksheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(sheet_rows)}</sheetData></worksheet>'
    )
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="演示数据" sheetId="1" r:id="rId1"/></sheets></workbook>'
    )
    workbook_rels = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '</Relationships>'
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '</Relationships>'
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '</Types>'
    )
    with zipfile.ZipFile(path, "w") as archive:
        _zip_write(archive, "[Content_Types].xml", content_types)
        _zip_write(archive, "_rels/.rels", root_rels)
        _zip_write(archive, "xl/workbook.xml", workbook)
        _zip_write(archive, "xl/_rels/workbook.xml.rels", workbook_rels)
        _zip_write(archive, "xl/worksheets/sheet1.xml", worksheet)


def main() -> None:
    tender_pages = [
        ["项目编号：2026-ZHYY-001", "采购人：某市产业园区管理委员会", "预算：5,900,000元", "最高限价：5,850,000元"],
        ["2.3 逾期送达的投标文件作无效投标处理。", "2.4 未按要求签字或盖章，否决投标。", "2.5 报价超过最高限价，投标无效。"],
        ["3.1 提供有效营业执照。", "3.2 提供有效ISO 9001证书。", "3.3 提供有效ISO 27001证书。", "3.4 近三年同类案例不少于2个。", "3.5 每个案例须提供验收证明。"],
        ["4.1 项目负责人相关经验不少于5年。", "4.2 合同签订后90日内完成交付。", "4.3 质保期不少于3年。", "4.4 投标有效期90日。", "4.5 增值税率统一为6%。"],
        ["5.1 投标文件必须为PDF格式。", "5.2 单个文件不超过100MB。", "5.3 提交签字授权委托书。", "5.4 全部材料企业主体名称应一致。", "5.5 报价大小写金额应一致。"],
        ["提交截止时间：2026年7月30日17:00。", "AI结果仅供辅助审查，最终结论由授权人员复核。"],
    ]
    make_pdf(DEMO / "tender/招标文件.pdf", tender_pages, "智慧园区综合管理平台采购项目 招标文件")
    make_docx(DEMO / "tender/技术需求附件.docx", ["技术需求附件", "1.1 并发用户数不少于5000。", "1.2 视频接入不少于1000路。", "1.3 日志留存不少于180天。", "1.4 支持国密算法。"])
    make_pdf(DEMO / "amendments/补充公告01.pdf", [["补充-1 提交截止时间由2026年7月30日17:00延后至2026年8月6日17:00。", "补充-2 视频接入参数由不少于1000路修改为不少于1200路。"], ["补充-3 新增：提供有效的网络安全等级保护三级证明。"]], "补充公告01")

    evidence_pdfs = {
        "营业执照.pdf": ["企业名称：上海智园数字科技有限公司", "统一社会信用代码：91310000DEMO000001", "状态：有效"],
        "ISO27001证书.pdf": ["持证主体：上海智园数字科技有限公司", "证书：ISO/IEC 27001", "有效期至：2027-12-31", "状态：有效"],
        "ISO9001证书.pdf": ["持证主体：上海智园数字科技有限公司", "证书：ISO 9001", "有效期至：2025-12-31（演示时已过期）"],
        "项目经理证书.pdf": ["姓名：张明", "相关从业经验：3年", "招标要求：不少于5年"],
        "案例合同A.pdf": ["案例：甲园区平台", "合同金额：6,200,000元", "对应验收材料：验收报告A"],
        "案例合同B.pdf": ["案例：乙园区平台", "合同金额：5,100,000元", "对应验收材料：缺失"],
        "验收报告A.pdf": ["案例：甲园区平台", "验收结论：通过", "验收日期：2025-06-30", "对应合同：案例合同A"],
    }
    for filename, lines in evidence_pdfs.items():
        make_pdf(DEMO / "evidence" / filename, [lines], filename.removesuffix(".pdf"))

    make_docx(DEMO / "bid_documents/投标函.docx", ["投标函", "投标人：上海智园科技有限公司（故意与营业执照不完全一致）", "投标总价：5,820,000元", "大写：伍佰捌拾贰万元整", "项目编号：2026-ZHYY-001", "投标有效期：90日"])
    make_xlsx(DEMO / "bid_documents/商务响应表.xlsx", [["要求", "响应"], ["交付期", "90日"], ["质保期", "3年"], ["税率", "6%"]])
    make_docx(DEMO / "bid_documents/技术响应文件.docx", ["技术响应文件", "并发用户数：5000", "视频接入：1000路", "日志留存：180天"], tracked_change="修订内容：视频接入能力待升级至1200路")
    make_xlsx(DEMO / "bid_documents/报价表.xlsx", [["项目", "金额（元）", "金额大写"], ["智慧园区综合管理平台", 5802000, "伍佰捌拾万零贰仟元整"], ["税率", "6%", ""]])

    generated = sorted(
        path.relative_to(DEMO).as_posix()
        for path in DEMO.rglob("*")
        if path.suffix.lower() in {".pdf", ".docx", ".xlsx"}
    )
    manifest = {
        "schema_version": "2.0.0",
        "generator": "scripts/generate_demo_assets.py",
        "files": [
            {"path": name, "sha256": hashlib.sha256((DEMO / name).read_bytes()).hexdigest()}
            for name in generated
        ],
    }
    manifest_path = DEMO / "expected_results/generated_manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已生成 {len(generated)} 个确定性演示文档。")


if __name__ == "__main__":
    main()
