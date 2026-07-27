#!/usr/bin/env python3
"""Generate deterministic, valid PDF/DOCX/XLSX demo documents."""

from __future__ import annotations

import hashlib
import json
import shutil
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "demo"
ZIP_TIME = (2026, 1, 1, 0, 0, 0)
PDF_FONT_NAME = "BidEvidenceFixtureSans"
PDF_FONT_PATH = DEMO / "fonts/BidEvidenceFixtureSans.ttf"
XLSX_TEMPLATE_DIR = DEMO / "templates"


def _zip_write(archive: zipfile.ZipFile, name: str, data: str | bytes) -> None:
    info = zipfile.ZipInfo(name, ZIP_TIME)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    archive.writestr(info, data.encode("utf-8") if isinstance(data, str) else data)


def make_pdf(path: Path, pages: list[list[str]], title: str) -> None:
    """Create a deterministic, self-contained CJK PDF with an embedded OFL font subset."""
    if not PDF_FONT_PATH.is_file():
        raise FileNotFoundError(f"missing demo PDF font: {PDF_FONT_PATH}")
    if PDF_FONT_NAME not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(PDF_FONT_NAME, str(PDF_FONT_PATH)))

    path.parent.mkdir(parents=True, exist_ok=True)
    width, height = A4
    document = canvas.Canvas(
        str(path), pagesize=A4, pageCompression=1, invariant=1, initialFontName=PDF_FONT_NAME
    )
    document.setTitle(title)
    document.setAuthor("BidEvidence deterministic fixture generator")
    document.setSubject("完全虚构的中文招投标测试材料")

    for page_no, lines in enumerate(pages, 1):
        document.setFillColor(colors.HexColor("#5B6472"))
        document.setFont(PDF_FONT_NAME, 8.5)
        document.drawString(48, height - 40, "BidEvidence 合成测试夹具｜完全虚构")

        document.setFillColor(colors.HexColor("#152238"))
        document.setFont(PDF_FONT_NAME, 16)
        document.drawCentredString(width / 2, height - 78, title)
        document.setStrokeColor(colors.HexColor("#CBD5E1"))
        document.line(48, height - 92, width - 48, height - 92)

        document.setFillColor(colors.HexColor("#334155"))
        document.setFont(PDF_FONT_NAME, 10)
        document.drawString(48, height - 120, "条款内容")
        y = height - 148
        for line in lines:
            for segment_start in range(0, len(line), 42):
                document.drawString(58, y, line[segment_start : segment_start + 42])
                y -= 22
            y -= 4

        document.setStrokeColor(colors.HexColor("#E2E8F0"))
        document.line(48, 52, width - 48, 52)
        document.setFillColor(colors.HexColor("#64748B"))
        document.setFont(PDF_FONT_NAME, 8.5)
        document.drawString(48, 36, "仅用于产品测试，不代表任何真实采购人、投标人或法律结论")
        document.drawRightString(width - 48, 36, f"第 {page_no} 页 / 共 {len(pages)} 页")
        document.showPage()
    document.save()


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


def copy_xlsx_template(filename: str) -> None:
    """Copy a visually QA'd, deterministic workbook fixture into the bid package."""
    source = XLSX_TEMPLATE_DIR / filename
    if not source.is_file():
        raise FileNotFoundError(f"missing demo XLSX template: {source}")
    destination = DEMO / "bid_documents" / filename
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)


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
    copy_xlsx_template("商务响应表.xlsx")
    make_docx(DEMO / "bid_documents/技术响应文件.docx", ["技术响应文件", "并发用户数：5000", "视频接入：1000路", "日志留存：180天"], tracked_change="修订内容：视频接入能力待升级至1200路")
    copy_xlsx_template("报价表.xlsx")

    generated = sorted(
        path.relative_to(DEMO).as_posix()
        for directory in ("tender", "amendments", "evidence", "bid_documents")
        for path in (DEMO / directory).rglob("*")
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
