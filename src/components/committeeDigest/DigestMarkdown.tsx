"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Render del resumen con la tipografía del sistema de diseño (variables cc-*). */
export function DigestMarkdown({ content }: { content: string }) {
  return (
    <div className="space-y-2 text-[14px] leading-relaxed cc-text-secondary">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => (
            <h3 className="text-xl leading-tight cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{children}</h3>
          ),
          h3: ({ children }) => <h4 className="mt-3 text-[13px] font-semibold uppercase tracking-[0.08em] cc-text-primary">{children}</h4>,
          p: ({ children }) => <p className="mt-2">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold cc-text-primary">{children}</strong>,
          ul: ({ children }) => <ul className="mt-1 list-disc space-y-0.5 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mt-1 list-decimal space-y-0.5 pl-5">{children}</ol>,
          a: ({ children }) => <span>{children}</span>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
