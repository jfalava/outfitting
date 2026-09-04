/**
 * Boundary parsers for JSON-shaped values.
 * `unknown` parameters live only in the type predicates here.
 */

export type JsonValue = string | number | boolean | null | readonly JsonValue[] | JsonObject;

export type JsonObject = { readonly [key: string]: JsonValue };

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isJsonArray(value: unknown): value is readonly JsonValue[] {
  return Array.isArray(value);
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || isString(value) || isBoolean(value) || isFiniteNumber(value)) {
    return true;
  }
  if (isJsonArray(value)) {
    return value.every(isJsonValue);
  }
  if (isJsonObject(value)) {
    return Object.values(value).every(isJsonValue);
  }
  return false;
}
