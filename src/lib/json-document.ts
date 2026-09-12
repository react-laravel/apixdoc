import {
  applyEdits,
  createScanner,
  format,
  parseTree,
  printParseErrorCode,
  type Node,
  type ParseError,
} from "jsonc-parser";

export const MAX_STRUCTURED_JSON_SIZE = 2 * 1024 * 1024;
const MAX_JSON_DEPTH = 200;
// jsonc-parser declares const enums, which cannot be imported with isolatedModules.
const Tokens = {
  OpenBrace: 1,
  CloseBrace: 2,
  OpenBracket: 3,
  CloseBracket: 4,
  EOF: 17,
} as const;
export interface JsonIssue {
  message: string;
  offset: number;
  length: number;
  line: number;
  column: number;
}
export interface JsonDocument {
  root?: Node;
  issue?: JsonIssue;
  empty: boolean;
  size: number;
}

const messages: Record<string, string> = {
  InvalidSymbol: "包含无效符号",
  InvalidNumberFormat: "数字格式不正确",
  PropertyNameExpected: "属性名需要使用双引号",
  ValueExpected: "缺少 JSON 值",
  ColonExpected: "属性名后缺少冒号",
  CommaExpected: "值之间缺少逗号",
  CloseBraceExpected: "缺少右花括号 }",
  CloseBracketExpected: "缺少右方括号 ]",
  EndOfFileExpected: "JSON 值之后存在多余内容",
  InvalidCommentToken: "标准 JSON 不支持注释",
  UnexpectedEndOfString: "字符串缺少结束双引号",
  UnexpectedEndOfNumber: "数字不完整",
  InvalidUnicode: "Unicode 转义不正确",
  InvalidEscapeCharacter: "字符串转义不正确",
  InvalidCharacter: "包含无效字符",
};

function issueAt(
  text: string,
  offset: number,
  length: number,
  message: string,
): JsonIssue {
  const lines = text.slice(0, offset).split(/\r\n|\r|\n/);
  return {
    message,
    offset,
    length,
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

export function inspectJson(text: string): JsonDocument {
  const size = new TextEncoder().encode(text).length;
  const result: JsonDocument = { empty: !text.trim(), size };
  if (result.empty) return result;
  if (size > MAX_STRUCTURED_JSON_SIZE)
    return {
      ...result,
      issue: issueAt(
        text,
        0,
        0,
        "内容超过 2 MB，保留原文查看、复制和下载，暂不展开结构",
      ),
    };
  const scanner = createScanner(text, true);
  let depth = 0;
  for (
    let token = scanner.scan();
    token !== Tokens.EOF;
    token = scanner.scan()
  ) {
    if (token === Tokens.OpenBrace || token === Tokens.OpenBracket) depth++;
    if (token === Tokens.CloseBrace || token === Tokens.CloseBracket) depth--;
    if (depth > MAX_JSON_DEPTH)
      return {
        ...result,
        issue: issueAt(
          text,
          scanner.getTokenOffset(),
          1,
          "JSON 嵌套超过 200 层，请简化结构",
        ),
      };
  }
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, {
    disallowComments: true,
    allowTrailingComma: false,
    allowEmptyContent: false,
  });
  if (errors.length) {
    const error = errors[0];
    return {
      ...result,
      issue: issueAt(
        text,
        error.offset,
        error.length,
        messages[printParseErrorCode(error.error)] || "JSON 格式不正确",
      ),
    };
  }
  return { ...result, root };
}

/** Operate on source tokens, never round-trip values through JS numbers. */
export function formatJson(text: string, indent: 2 | 4 = 2): string {
  const document = inspectJson(text);
  if (document.issue) throw new Error(document.issue.message);
  if (document.empty) return text;
  return applyEdits(
    text,
    format(text, undefined, { insertSpaces: true, tabSize: indent, eol: "\n" }),
  ).trim();
}

export function minifyJson(text: string): string {
  const document = inspectJson(text);
  if (document.issue) throw new Error(document.issue.message);
  if (document.empty) return text;
  const scanner = createScanner(text, true);
  const tokens: string[] = [];
  while (scanner.scan() !== Tokens.EOF)
    tokens.push(
      text.slice(
        scanner.getTokenOffset(),
        scanner.getTokenOffset() + scanner.getTokenLength(),
      ),
    );
  return tokens.join("");
}

export function jsonPointer(path: (string | number)[]): string {
  return path
    .map((part) => `/${String(part).replace(/~/g, "~0").replace(/\//g, "~1")}`)
    .join("");
}

export function jsonPath(path: (string | number)[]): string {
  return (
    "$" +
    path
      .map((part) =>
        typeof part === "number"
          ? `[${part}]`
          : /^[A-Za-z_$][\w$]*$/.test(part)
            ? `.${part}`
            : `[${JSON.stringify(part)}]`,
      )
      .join("")
  );
}

export function isJsonContentType(contentType: string): boolean {
  return /^(application|text)\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(
    contentType.trim(),
  );
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
