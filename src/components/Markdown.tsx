import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

/**
 * Renders assistant text as GitHub-flavoured Markdown with syntax-highlighted
 * code blocks — the way it looked in the original assistant UI. Memoised because
 * a transcript can hold hundreds of messages.
 */
export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
