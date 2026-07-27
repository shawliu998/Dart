export type ResponseDiffRow = {
  before: string | null;
  after: string | null;
  kind: "same" | "changed" | "removed" | "added";
};

type Operation = { kind: "same" | "removed" | "added"; value: string };

function blocks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  return normalized ? normalized.split(/\n+/).map((block) => block.trim()).filter(Boolean) : [];
}

export function diffResponseText(beforeText: string, afterText: string): ResponseDiffRow[] {
  const before = blocks(beforeText);
  const after = blocks(afterText);
  const lengths = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));

  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = before[i] === after[j]
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const operations: Operation[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      operations.push({ kind: "same", value: before[i] });
      i += 1;
      j += 1;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      operations.push({ kind: "removed", value: before[i] });
      i += 1;
    } else {
      operations.push({ kind: "added", value: after[j] });
      j += 1;
    }
  }
  while (i < before.length) operations.push({ kind: "removed", value: before[i++] });
  while (j < after.length) operations.push({ kind: "added", value: after[j++] });

  const rows: ResponseDiffRow[] = [];
  for (let cursor = 0; cursor < operations.length; cursor += 1) {
    const current = operations[cursor];
    const next = operations[cursor + 1];
    if (current.kind === "removed" && next?.kind === "added") {
      rows.push({ before: current.value, after: next.value, kind: "changed" });
      cursor += 1;
    } else if (current.kind === "added" && next?.kind === "removed") {
      rows.push({ before: next.value, after: current.value, kind: "changed" });
      cursor += 1;
    } else if (current.kind === "same") {
      rows.push({ before: current.value, after: current.value, kind: "same" });
    } else if (current.kind === "removed") {
      rows.push({ before: current.value, after: null, kind: "removed" });
    } else {
      rows.push({ before: null, after: current.value, kind: "added" });
    }
  }
  return rows.length ? rows : [{ before: "", after: "", kind: "same" }];
}
