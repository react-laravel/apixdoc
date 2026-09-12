"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-3 break-words text-sm leading-7 text-zinc-600 dark:text-zinc-300">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, href }) =>
            !href ? (
              <span>{children}</span>
            ) : (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline dark:text-blue-400"
              >
                {children}
              </a>
            ),
          img: ({ alt, src }) =>
            !src ? (
              <span>{alt || "图片"}</span>
            ) : (
              <a
                href={typeof src === "string" ? src : undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline dark:text-blue-400"
              >
                {alt || "查看图片"}
              </a>
            ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-lg bg-zinc-100 p-3 text-xs leading-6 dark:bg-zinc-800">
              {children}
            </pre>
          ),
          code: ({ children }) => (
            <code className="rounded bg-zinc-100 px-1 font-mono text-[0.9em] dark:bg-zinc-800">
              {children}
            </code>
          ),
          h1: ({ children }) => (
            <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">
              {children}
            </h4>
          ),
          ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1 pl-5">{children}</ol>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-800">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-zinc-200 p-2 dark:border-zinc-700">
              {children}
            </td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-blue-300 pl-4 text-zinc-500">
              {children}
            </blockquote>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
