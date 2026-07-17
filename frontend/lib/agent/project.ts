const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveAgentProjectId(value: string | string[] | undefined, fallback: string): string;
export function resolveAgentProjectId(value: string | string[] | undefined): string | undefined;
export function resolveAgentProjectId(value: string | string[] | undefined, fallback?: string): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && UUID_PATTERN.test(candidate) ? candidate : fallback;
}
