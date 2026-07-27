#!/usr/bin/env python3
"""Validate or explicitly run the versioned requirement-extraction evaluation."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.agents.provider import (  # noqa: E402
    OpenAICompatibleProvider,
    ProviderUnavailableError,
    build_structured_system_prompt,
    get_requirement_provider,
)
from app.parsers.deterministic import DeterministicTextParser  # noqa: E402
from app.schemas.requirements import RequirementBatch  # noqa: E402
from app.services.extraction import (  # noqa: E402
    PROMPT_VERSION,
    REQUIREMENT_PAGE_INPUT_TEMPLATE,
    REQUIREMENT_SYSTEM_PROMPT,
    build_requirement_page_input,
)

DEFAULT_DATASET = ROOT / "demo/evals/requirement_extraction_v1.json"
LIVE_ENV_NAMES = (
    "BIDEVIDENCE_LLM_BASE_URL",
    "BIDEVIDENCE_LLM_API_KEY",
    "BIDEVIDENCE_LLM_MODEL",
)


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_bytes(canonical_json(value).encode("utf-8"))


def metric(numerator: int, denominator: int) -> dict[str, int | float | None]:
    return {
        "numerator": numerator,
        "denominator": denominator,
        "value": round(numerator / denominator, 6) if denominator else None,
    }


def page_records(dataset: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "document_id": document["document_id"],
            "document_version": document["version"],
            "page_number": page["page_number"],
            "text": page["text"],
        }
        for document in dataset["documents"]
        for page in document["pages"]
    ]


def _mime_type(path: Path) -> str:
    if path.suffix.lower() == ".pdf":
        return "application/pdf"
    if path.suffix.lower() == ".docx":
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    raise ValueError(f"unsupported eval fixture type: {path.suffix}")


def validate_dataset(path: Path) -> tuple[dict[str, Any], dict[str, str]]:
    dataset = json.loads(path.read_text(encoding="utf-8"))
    if dataset.get("schema_version") != "1.0.0":
        raise ValueError("eval dataset schema_version must be 1.0.0")
    documents = dataset.get("documents")
    gold = dataset.get("gold_requirements")
    negatives = dataset.get("negative_spans")
    if not isinstance(documents, list) or len(documents) != 3:
        raise ValueError("eval dataset must contain exactly 3 documents")
    if not isinstance(gold, list) or len(gold) != 24:
        raise ValueError("eval dataset must contain exactly 24 gold requirements")
    if sum(bool(item["disqualification_if_failed"]) for item in gold) != 3:
        raise ValueError("eval dataset must contain exactly 3 disqualification requirements")
    if not isinstance(negatives, list) or not negatives:
        raise ValueError("eval dataset must contain explicit negative spans")

    parser = DeterministicTextParser()
    page_lookup: dict[tuple[str, int], str] = {}
    for document in documents:
        fixture_path = ROOT / document["fixture_path"]
        if sha256_bytes(fixture_path.read_bytes()) != document["file_sha256"]:
            raise ValueError(f"fixture SHA mismatch: {document['fixture_path']}")
        parsed = parser.parse(fixture_path.read_bytes(), _mime_type(fixture_path))
        expected_pages = document["pages"]
        if len(parsed) != len(expected_pages):
            raise ValueError(f"parsed page count mismatch: {document['fixture_path']}")
        for actual, expected in zip(parsed, expected_pages, strict=True):
            if actual.page_number != expected["page_number"] or actual.raw_text != expected["text"]:
                raise ValueError(
                    f"parsed page drift: {document['fixture_path']}:{expected['page_number']}"
                )
            page_lookup[(document["document_id"], expected["page_number"])] = expected["text"]

    codes: set[str] = set()
    for item in [*gold, *negatives]:
        if item["code"] in codes:
            raise ValueError(f"duplicate eval code: {item['code']}")
        codes.add(item["code"])
        source = item["source"]
        span = source["span"]
        text = page_lookup[(source["document_id"], source["page_number"])]
        if text[span["start"] : span["end"]] != span["text"]:
            raise ValueError(f"invalid source span: {item['code']}")

    oracle_path = ROOT / dataset["source_oracle"]["path"]
    if sha256_bytes(oracle_path.read_bytes()) != dataset["source_oracle"]["sha256"]:
        raise ValueError("source oracle SHA mismatch")
    oracle = json.loads(oracle_path.read_text(encoding="utf-8"))
    oracle_by_code = {item["code"]: item for item in oracle["requirements"]}
    filenames = {document["document_id"]: document["filename"] for document in documents}
    for item in gold:
        expected = oracle_by_code.get(item["code"])
        source = item["source"]
        if expected is None or any(
            (
                expected["category"] != item["category"],
                expected["mandatory"] != item["mandatory"],
                expected["disqualification_if_failed"]
                != item["disqualification_if_failed"],
                expected["source"]["file"] != filenames[source["document_id"]],
                expected["source"]["page"] != source["page_number"],
            )
        ):
            raise ValueError(f"gold requirement drift from v2 oracle: {item['code']}")

    hashes = {
        "dataset_file_sha256": sha256_bytes(path.read_bytes()),
        "input_sha256": sha256_json(page_records(dataset)),
        "prompt_sha256": sha256_json(
            {
                "prompt_version": PROMPT_VERSION,
                "structured_system_prompt": build_structured_system_prompt(
                    REQUIREMENT_SYSTEM_PROMPT,
                    RequirementBatch,
                ),
                "page_input_template": REQUIREMENT_PAGE_INPUT_TEMPLATE,
            }
        ),
        "schema_sha256": sha256_json(RequirementBatch.model_json_schema()),
    }
    for name in ("input_sha256", "prompt_sha256", "schema_sha256"):
        if hashes[name] != dataset["hashes"][name]:
            raise ValueError(f"{name} mismatch")
    if dataset["task"]["prompt_version"] != PROMPT_VERSION:
        raise ValueError("prompt_version mismatch")
    return dataset, hashes


def score_run(dataset: dict[str, Any], pages: list[dict[str, Any]]) -> dict[str, Any]:
    gold_by_source = {
        (
            item["source"]["document_id"],
            item["source"]["page_number"],
            item["source"]["span"]["text"],
        ): item
        for item in dataset["gold_requirements"]
    }
    predictions: list[tuple[dict[str, Any], dict[str, Any]]] = []
    schema_valid_pages = 0
    for page in pages:
        if page["schema_valid"]:
            schema_valid_pages += 1
        for prediction in (page.get("parsed_output") or {}).get("results", []):
            predictions.append((page, prediction))

    matched: list[tuple[dict[str, Any], dict[str, Any], dict[str, Any]]] = []
    unmatched_predictions: list[dict[str, Any]] = []
    matched_codes: set[str] = set()
    for page, prediction in predictions:
        key = (
            page["document_id"],
            prediction["source_page"],
            prediction["original_text"],
        )
        gold = gold_by_source.get(key)
        if gold is None or gold["code"] in matched_codes:
            unmatched_predictions.append(prediction)
            continue
        matched_codes.add(gold["code"])
        matched.append((page, prediction, gold))

    tp = len(matched)
    fp = len(predictions) - tp
    fn = len(dataset["gold_requirements"]) - tp
    category_correct = sum(pred["category"] == gold["category"] for _, pred, gold in matched)
    mandatory_correct = sum(pred["mandatory"] == gold["mandatory"] for _, pred, gold in matched)
    mandatory_recalled = sum(pred["mandatory"] for _, pred, gold in matched if gold["mandatory"])
    disqual_recalled = sum(
        pred["disqualification_if_failed"]
        for _, pred, gold in matched
        if gold["disqualification_if_failed"]
    )
    source_correct = sum(
        pred["original_text"] in page["input_text"]
        and pred["source_page"] == page["page_number"]
        for page, pred, _ in matched
    )
    prompt_version_correct = sum(
        pred["prompt_version"] == PROMPT_VERSION for _, pred, _ in matched
    )
    grounded_predictions = sum(
        prediction["source_page"] == page["page_number"]
        and prediction["original_text"] in page["input_text"]
        for page, prediction in predictions
    )
    negative_hits = 0
    for negative in dataset["negative_spans"]:
        source = negative["source"]
        negative_hits += any(
            page["document_id"] == source["document_id"]
            and prediction["source_page"] == source["page_number"]
            and source["span"]["text"] in prediction["original_text"]
            for page, prediction in predictions
        )

    metrics = {
        "requirement_precision": metric(tp, tp + fp),
        "requirement_recall": metric(tp, tp + fn),
        "requirement_f1": metric(2 * tp, 2 * tp + fp + fn),
        "mandatory_recall": metric(mandatory_recalled, sum(x["mandatory"] for x in dataset["gold_requirements"])),
        "disqualification_recall": metric(
            disqual_recalled,
            sum(x["disqualification_if_failed"] for x in dataset["gold_requirements"]),
        ),
        "category_accuracy": metric(category_correct, tp),
        "mandatory_accuracy": metric(mandatory_correct, tp),
        "source_accuracy": metric(source_correct, tp),
        "grounded_prediction_rate": metric(grounded_predictions, len(predictions)),
        "prompt_version_accuracy": metric(prompt_version_correct, tp),
        "schema_page_pass_rate": metric(schema_valid_pages, len(page_records(dataset))),
        "negative_specificity": metric(len(dataset["negative_spans"]) - negative_hits, len(dataset["negative_spans"])),
    }
    return {
        "counts": {
            "true_positive": tp,
            "false_positive": fp,
            "false_negative": fn,
            "predictions": len(predictions),
            "gold_requirements": len(dataset["gold_requirements"]),
            "negative_hits": negative_hits,
        },
        "metrics": metrics,
        "bad_cases": {
            "missed_requirement_codes": sorted(
                set(gold["code"] for gold in dataset["gold_requirements"]) - matched_codes
            ),
            "unmatched_predictions": unmatched_predictions,
            "ungrounded_predictions": [
                {
                    "document_id": page["document_id"],
                    "page_number": page["page_number"],
                    "prediction": prediction,
                }
                for page, prediction in predictions
                if prediction["source_page"] != page["page_number"]
                or prediction["original_text"] not in page["input_text"]
            ],
            "schema_errors": [
                {
                    "document_id": page["document_id"],
                    "page_number": page["page_number"],
                    "error": page.get("error"),
                }
                for page in pages
                if not page["schema_valid"]
            ],
        },
    }


async def run_live(dataset: dict[str, Any], runs: int) -> list[dict[str, Any]]:
    missing = [name for name in LIVE_ENV_NAMES if not os.getenv(name)]
    if missing:
        raise ValueError(f"--allow-live requires: {', '.join(missing)}")
    provider = get_requirement_provider("openai_compatible")
    if not isinstance(provider, OpenAICompatibleProvider):
        raise ValueError("live evaluation requires the approved openai_compatible provider")

    results: list[dict[str, Any]] = []
    for run_number in range(1, runs + 1):
        page_results: list[dict[str, Any]] = []
        for record in page_records(dataset):
            page_result: dict[str, Any] = {
                **{key: record[key] for key in ("document_id", "document_version", "page_number")},
                "input_sha256": sha256_bytes(record["text"].encode("utf-8")),
                "input_text": record["text"],
                "schema_valid": False,
                "parsed_output": None,
                "error": None,
            }
            try:
                batch = await provider.structured_generate(
                    system_prompt=REQUIREMENT_SYSTEM_PROMPT,
                    user_input=build_requirement_page_input(
                        record["text"],
                        record["page_number"],
                    ),
                    output_schema=RequirementBatch,
                    metadata={
                        "source_page": record["page_number"],
                        "prompt_version": PROMPT_VERSION,
                    },
                )
                page_result["parsed_output"] = batch.model_dump(mode="json")
                page_result["schema_valid"] = True
            except ProviderUnavailableError as exc:
                page_result["error"] = str(exc)
            trace = provider.last_call_trace
            if trace is not None:
                page_result["provider_trace"] = trace.model_dump()
                page_result["error"] = page_result["error"] or trace.error
            page_results.append(page_result)
        results.append(
            {
                "run_number": run_number,
                "pages": page_results,
                "score": score_run(dataset, page_results),
            }
        )
    return results


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "默认仅离线校验 3 文档/9 页 gold、parser、oracle 与固定哈希；"
            "只有显式 --allow-live 才读取 live 配置并调用模型。"
        )
    )
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--output", type=Path, help="将完整 JSON 结果写入此路径")
    parser.add_argument("--allow-live", action="store_true", help="显式允许逐页模型网络调用")
    parser.add_argument("--runs", type=int, default=3, help="live 评测轮数，默认 3")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.runs < 1:
        raise SystemExit("--runs must be positive")
    dataset, hashes = validate_dataset(args.dataset.resolve())
    result: dict[str, Any] = {
        "schema_version": "1.0.0",
        "eval_id": dataset["eval_id"],
        "created_at": datetime.now(UTC).isoformat(),
        "git_sha": os.popen("git rev-parse HEAD").read().strip() or None,
        "mode": "live" if args.allow_live else "offline_validation",
        "network_allowed": args.allow_live,
        "dataset": {
            "path": str(args.dataset.resolve()),
            "documents": len(dataset["documents"]),
            "pages": len(page_records(dataset)),
            "requirements": len(dataset["gold_requirements"]),
            "mandatory_requirements": sum(x["mandatory"] for x in dataset["gold_requirements"]),
            "disqualification_requirements": sum(
                x["disqualification_if_failed"] for x in dataset["gold_requirements"]
            ),
            "negative_spans": len(dataset["negative_spans"]),
        },
        "hashes": hashes,
        "runs": [],
    }
    if args.allow_live:
        if args.output is None:
            raise SystemExit("--allow-live requires --output so raw responses and errors are retained")
        result["runs"] = asyncio.run(run_live(dataset, args.runs))
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    print(
        json.dumps(
            {
                "mode": result["mode"],
                "network_allowed": result["network_allowed"],
                "dataset": result["dataset"],
                "hashes": hashes,
                "output": str(args.output.resolve()) if args.output else None,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
