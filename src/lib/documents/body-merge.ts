import {
  parseDocumentJson,
  stringifyDocumentJson,
} from "@/lib/documentation/json";
import { mergeMedia } from "@/lib/specification/media";
import { record } from "@/lib/specification/value";
/** The selected MIME duplicates schema/example in the editing model. Merge those user fields independently of their derived cache. */
export function expandBodyMerge(
  base: Record<string, unknown>,
  mine: Record<string, unknown>,
  current: Record<string, unknown>,
) {
  const bodies = [base, mine, current].map((s) => record(s.requestBody));
  if (
    bodies.some((b) => !b.contentType) ||
    bodies.some((b) => b.contentType !== bodies[0].contentType)
  )
    return { base, mine, current, expanded: false };
  try {
    const values = [base, mine, current].map((section, index) => {
      const body = bodies[index];
      const all = record(parseDocumentJson(String(body.content || "{}")));
      const selected = String(body.contentType);
      const cache: Record<string, string> = Object.create(null);
      for (const mime of new Set([...Object.keys(all), selected])) {
        const media = { ...record(all[mime]) };
        if (mime === selected) {
          const direct = Object.hasOwn(media, "example");
          delete media.schema;
          delete media.example;
          delete media["x-apixdoc-raw-example"];
          if (!direct && media.examples) {
            const examples = { ...record(media.examples) };
            const first = Object.keys(examples)[0];
            if (first) {
              examples[first] = { ...record(examples[first]) };
              delete record(examples[first]).value;
            }
            media.examples = examples;
          }
        }
        cache[mime] = stringifyDocumentJson(media);
      }
      return { ...section, requestBody: { ...body, content: cache } };
    });
    return {
      base: values[0],
      mine: values[1],
      current: values[2],
      expanded: true,
    };
  } catch {
    return { base, mine, current, expanded: false };
  }
}
export function finishBodyMerge(
  value: Record<string, unknown>,
  expanded: boolean,
): Record<string, unknown> {
  if (!expanded) return value;
  const body = record(value.requestBody);
  const content = Object.fromEntries(
    Object.entries(record(body.content)).map(([mime, text]) => [
      mime,
      parseDocumentJson(String(text)),
    ]),
  );
  return {
    ...value,
    requestBody: {
      ...body,
      content: mergeMedia(
        stringifyDocumentJson(content),
        String(body.contentType),
        String(body.schema || "{}"),
        String(body.example || ""),
      ),
    },
  };
}
