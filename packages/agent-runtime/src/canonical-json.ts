import { addressSchema } from "@proof-of-vault/shared-types";

const enumLikeKeys = new Set(["severity", "result", "outcome", "verdict", "targetRole", "reasonCode"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function normalizeScalar(key: string | undefined, value: unknown): unknown {
  if (typeof value === "bigint" || typeof value === "number") {
    return value.toString();
  }

  if (typeof value === "string") {
    if (addressSchema.safeParse(value).success) {
      return value.toLowerCase();
    }

    if (key && enumLikeKeys.has(key)) {
      return value.toUpperCase();
    }
  }

  return value;
}

function normalizeValue(key: string | undefined, value: unknown): unknown {
  const scalar = normalizeScalar(key, value);

  if (Array.isArray(scalar)) {
    return scalar.map((item) => normalizeValue(undefined, item));
  }

  if (isPlainObject(scalar)) {
    return Object.fromEntries(
      Object.keys(scalar)
        .sort((left, right) => left.localeCompare(right))
        .map((entryKey) => [entryKey, normalizeValue(entryKey, scalar[entryKey])])
    );
  }

  return scalar;
}

export function normalizeForCanonicalJson<T>(value: T): T {
  return normalizeValue(undefined, value) as T;
}

export function stringifyCanonicalJson(value: unknown): string {
  return JSON.stringify(normalizeForCanonicalJson(value));
}
