import {
  parseDocumentJson,
  stringifyDocumentJson,
} from "@/lib/documentation/json";
import { isJsonContentType } from "@/lib/json-document";
import { record, wireText } from "./value";

export function readExample(media: unknown): string {
  const value = record(media);
  if (typeof value["x-apixdoc-raw-example"] === "string")
    return value["x-apixdoc-raw-example"] as string;
  if (Object.prototype.hasOwnProperty.call(value, "example"))
    return wireText(value.example);
  const first = record(Object.values(record(value.examples))[0]);
  return wireText(first.value);
}
export function readMedia(content: string, contentType: string) {
  let all = record(undefined);
  try {
    all = record(parseDocumentJson(content));
  } catch {
    /* Legacy bodies have no media map. */
  }
  const media = record(all[contentType]);
  return {
    exists: Object.prototype.hasOwnProperty.call(all, contentType),
    schema: stringifyDocumentJson(media.schema ?? {}),
    example: readExample(media),
  };
}
export function mergeMedia(
  content: string | undefined,
  contentType: string,
  schema: string,
  example: string,
): string {
  let all = record(undefined);
  try {
    all = record(parseDocumentJson(content || "{}"));
  } catch {
    /* Validation still occurs at save/export boundaries. */
  }
  if (!contentType) return stringifyDocumentJson(all);
  const media = { ...record(all[contentType]) };
  const previous = readMedia(content || "{}", contentType);
  if (!previous.exists || previous.schema !== schema) {
    try {
      media.schema = parseDocumentJson(schema || "{}");
    } catch {
      return content || "{}";
    }
  }
  if (!previous.exists || previous.example !== example) {
    let value: unknown = example;
    if (isJsonContentType(contentType) && example.trim()) {
      try {
        value = parseDocumentJson(example);
      } catch {
        /* Keep literal templates or deliberately invalid examples. */
      }
    }
    const examples = record(media.examples);
    const first = Object.keys(examples)[0];
    if (first && !Object.prototype.hasOwnProperty.call(media, "example"))
      media.examples = {
        ...examples,
        [first]: { ...record(examples[first]), value },
      };
    else media.example = value;
    media["x-apixdoc-raw-example"] = example;
  }
  all[contentType] = media;
  return stringifyDocumentJson(all);
}
