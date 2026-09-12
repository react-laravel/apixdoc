import { draftFromRequest } from "./prepare";
import {
  REQUEST_METHODS,
  type PreparedRequest,
  type RequestDraft,
  type RequestMethod,
} from "./types";

/** Tokenize a single command as data. Shell programs, files and expansions are never executed. */
export function tokenizeCurl(command: string): string[] {
  if (command.includes("\0")) throw new Error("cURL 命令不能包含空字节");
  if (command.length > 2 * 1024 * 1024) throw new Error("cURL 内容超过 2 MB");
  const tokens: string[] = [];
  let token = "";
  let quote: "single" | "double" | "ansi" | null = null;
  let started = false;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (quote === "single") {
      if (char === "'") quote = null;
      else token += char;
      continue;
    }
    if (quote === "ansi") {
      if (char === "'") {
        quote = null;
        continue;
      }
      if (char !== "\\") {
        token += char;
        continue;
      }
      const next = command[++i];
      const escape: Record<string, string> = {
        n: "\n",
        r: "\r",
        t: "\t",
        "\\": "\\",
        "'": "'",
        '"': '"',
      };
      if (escape[next] !== undefined) token += escape[next];
      else if (next === "x" || next === "u") {
        const length = next === "x" ? 2 : 4;
        const hex = command.slice(i + 1, i + length + 1);
        if (!new RegExp(`^[0-9a-f]{${length}}$`, "i").test(hex))
          throw new Error("cURL 字符串转义不正确");
        token += String.fromCharCode(parseInt(hex, 16));
        i += length;
      } else throw new Error("cURL 使用了不支持的字符串转义");
      continue;
    }
    if (quote === "double") {
      if (char === '"') {
        quote = null;
        continue;
      }
      if (char === "\\") {
        const next = command[i + 1];
        if (['"', "\\", "$", "`", "\n"].includes(next)) {
          if (next !== "\n") token += next;
          i++;
        } else token += char;
      } else {
        if (char === "$" || char === "`")
          throw new Error("请将 Shell 变量或命令替换为具体内容，再导入");
        token += char;
      }
      continue;
    }
    if (/\s/.test(char)) {
      if (started) {
        tokens.push(token);
        token = "";
        started = false;
      }
      continue;
    }
    if (char === "\\") {
      if (command[i + 1] === "\r" && command[i + 2] === "\n") {
        i += 2;
        continue;
      }
      if (command[i + 1] === "\n") {
        i++;
        continue;
      }
      if (i + 1 >= command.length) throw new Error("cURL 末尾的转义不完整");
      token += command[++i];
      started = true;
      continue;
    }
    if (char === "$" && command[i + 1] === "'") {
      quote = "ansi";
      started = true;
      i++;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char === "'" ? "single" : "double";
      started = true;
      continue;
    }
    if (/[;&|<>`$]/.test(char))
      throw new Error(
        "仅支持一条 cURL 请求，请移除 Shell 操作符，并将 URL 放在引号中",
      );
    started = true;
    token += char;
  }
  if (quote) throw new Error("cURL 引号未闭合");
  if (started) tokens.push(token);
  return tokens;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
export function exportCurl(request: PreparedRequest): string {
  if (request.body?.includes("\0"))
    throw new Error("二进制空字节无法直接复制为 cURL 参数");
  const lines = [
    `curl --request ${request.method} --url ${shellQuote(request.url)}`,
    `  --max-time ${request.timeoutMs / 1000}`,
  ];
  for (const [key, value] of Object.entries(request.headers))
    lines.push(`  --header ${shellQuote(`${key}: ${value}`)}`);
  if (request.body !== undefined)
    lines.push(`  --data-raw ${shellQuote(request.body)}`);
  return lines.join(" \\\n");
}

export function importCurl(command: string): {
  draft: RequestDraft;
  warnings: string[];
} {
  const tokens = tokenizeCurl(command.trim());
  if (!/^curl(?:\.exe)?$/i.test(tokens.shift() || ""))
    throw new Error("请粘贴以 curl 开头的请求命令");
  const headers: Record<string, string> = Object.create(null);
  const data: string[] = [];
  const warnings: string[] = [];
  let url = "";
  let method = "";
  let get = false;
  let json = false;
  let timeoutMs = 15000;
  let basic: string | undefined;
  const setUrl = (value: string) => {
    if (url) throw new Error("一次只能导入一个请求地址");
    url = value;
  };
  for (let i = 0; i < tokens.length; i++) {
    let option = tokens[i];
    if (/^-[sSLIGgi]{2,}$/.test(option)) {
      tokens.splice(
        i,
        1,
        ...option
          .slice(1)
          .split("")
          .map((flag) => `-${flag}`),
      );
      option = tokens[i];
    }
    if (option === "--") {
      for (const value of tokens.slice(i + 1)) setUrl(value);
      break;
    }
    if (!option.startsWith("-")) {
      setUrl(option);
      continue;
    }
    let inline: string | undefined;
    if (option.startsWith("--") && option.includes("=")) {
      const index = option.indexOf("=");
      inline = option.slice(index + 1);
      option = option.slice(0, index);
    } else if (/^-[XHduAbem]/.test(option) && option.length > 2) {
      inline = option.slice(2);
      option = option.slice(0, 2);
    }
    const argument = () => {
      if (inline !== undefined) return inline;
      if (tokens[i + 1] === undefined)
        throw new Error(`选项 ${option} 缺少参数`);
      return tokens[++i];
    };
    if (["-X", "--request"].includes(option)) method = argument().toUpperCase();
    else if (option === "--url") setUrl(argument());
    else if (["-H", "--header"].includes(option)) {
      const header = argument();
      const index = header.indexOf(":");
      if (index <= 0)
        throw new Error("请求头需要使用 Key: Value 格式，不支持从文件读取");
      headers[header.slice(0, index).trim().toLowerCase()] = header
        .slice(index + 1)
        .trimStart();
    } else if (
      [
        "-d",
        "--data",
        "--data-ascii",
        "--data-raw",
        "--data-binary",
        "--data-urlencode",
        "--json",
      ].includes(option)
    ) {
      let value = argument();
      if (option !== "--data-raw" && value.startsWith("@"))
        throw new Error("无法读取 cURL 引用的本地文件，请粘贴实际请求体");
      if (option === "--data-urlencode") {
        const equals = value.indexOf("=");
        if (equals < 0 && value.includes("@"))
          throw new Error("不支持从文件导入表单值");
        value =
          equals < 0
            ? encodeURIComponent(value)
            : `${equals ? value.slice(0, equals) + "=" : ""}${encodeURIComponent(value.slice(equals + 1))}`;
      }
      if (option === "--json") json = true;
      data.push(value);
    } else if (["-G", "--get"].includes(option)) get = true;
    else if (["-I", "--head"].includes(option)) method = "HEAD";
    else if (["-u", "--user"].includes(option)) basic = argument();
    else if (["-A", "--user-agent"].includes(option))
      headers["user-agent"] = argument();
    else if (["-e", "--referer"].includes(option)) headers.referer = argument();
    else if (["-b", "--cookie"].includes(option)) {
      const cookie = argument();
      if (!cookie.includes("=")) throw new Error("不支持读取 Cookie 文件");
      headers.cookie = cookie;
    } else if (["-m", "--max-time"].includes(option)) {
      timeoutMs = Number(argument()) * 1000;
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000)
        throw new Error("导入请求超时需介于 1 秒和 60 秒之间");
    } else if (["-L", "--location"].includes(option))
      warnings.push("当前发送服务显示首次响应，不自动跟随重定向。");
    else if (
      [
        "--compressed",
        "-s",
        "--silent",
        "-S",
        "--show-error",
        "-i",
        "--include",
        "-g",
        "--globoff",
      ].includes(option)
    ) {
      /* Output-only flags do not alter the request. */
    } else throw new Error(`暂不支持 cURL 选项 ${option}，请先移除此选项`);
  }
  if (!url) throw new Error("没有找到请求地址");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("请求地址不是有效 URL");
  }
  if (!["https:", "http:"].includes(parsed.protocol))
    throw new Error("只支持 http/https 请求");
  if (parsed.username || parsed.password)
    throw new Error("请用 --user 提供认证，不要将密码嵌入 URL");
  if (get && data.length)
    parsed.search += `${parsed.search ? "&" : "?"}${data.join("&")}`;
  method ||= get || !data.length ? "GET" : "POST";
  if (data.length && !get && ["GET", "HEAD"].includes(method))
    throw new Error(
      "当前发送服务不支持 GET/HEAD 请求体，请使用 --get 传递查询参数",
    );
  if (!REQUEST_METHODS.includes(method as RequestMethod))
    throw new Error("不支持该请求方法");
  if (data.length && !get)
    headers["content-type"] ||= json
      ? "application/json"
      : "application/x-www-form-urlencoded";
  if (json) headers.accept ||= "application/json";
  const request: PreparedRequest = {
    url: parsed.toString(),
    method: method as RequestMethod,
    headers,
    timeoutMs,
  };
  if (data.length && !get) request.body = data.join(json ? "" : "&");
  const draft = draftFromRequest(request);
  if (basic !== undefined) {
    const colon = basic.indexOf(":");
    if (colon < 0) warnings.push("Basic 密码未提供，请在认证配置中补全。");
    draft.auth = {
      type: "basic",
      username: colon < 0 ? basic : basic.slice(0, colon),
      password: colon < 0 ? "" : basic.slice(colon + 1),
    };
  }
  return { draft, warnings };
}
