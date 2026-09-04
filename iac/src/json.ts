import { Schema } from "effect";

export type JsonValue = Schema.Json;
export type JsonObject = Schema.JsonObject;

const JsonObjectSchema = Schema.Record(Schema.String, Schema.Json);

export function jsonObject(value: JsonValue | undefined): JsonObject | undefined {
  try {
    return Schema.decodeUnknownSync(JsonObjectSchema)(value);
  } catch {
    return undefined;
  }
}

export function jsonString(value: JsonValue | undefined): string | undefined {
  try {
    return Schema.decodeUnknownSync(Schema.String)(value);
  } catch {
    return undefined;
  }
}
