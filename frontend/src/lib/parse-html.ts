import type { Element, Parent, Root, Text } from "hast";
import type { Schema } from "hast-util-sanitize";
import type { Components } from "hast-util-to-jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import rehypeParse from "rehype-parse";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { NON_CONTENT_TAG_NAMES } from "./html-content-tags";

export type ParseHtmlOptions = {
  components?: Components;
};

// Emoji image class patterns (WordPress, EmojiOne, Twemoji, etc.)
const EMOJI_CLASS_PATTERNS = [
  "wp-smiley",
  "emoji",
  "emojione",
  "emoticon",
  "smiley",
];

// Check if a string contains emoji characters
function isEmojiChar(str: string): boolean {
  const emojiRegex =
    /[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{2B00}-\u{2BFF}]|[\u{FE00}-\u{FEFF}]|[\u{1F000}-\u{1FFFF}]/u;
  return emojiRegex.test(str);
}

/**
 * Rehype plugin to convert emoji images back to native emoji text.
 * Handles WordPress wp-smiley, EmojiOne, Twemoji, and similar implementations.
 */
function rehypeEmojiImages() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "img" || !parent || index === undefined) return;

      const props = node.properties || {};
      const classNames = Array.isArray(props.className) ? props.className : [];
      const className = classNames.join(" ");
      const alt = String(props.alt || "");

      const isEmojiClass = EMOJI_CLASS_PATTERNS.some((pattern) =>
        className.toLowerCase().includes(pattern),
      );

      if (isEmojiClass && alt && isEmojiChar(alt)) {
        const textNode: Text = { type: "text", value: alt };
        parent.children.splice(index, 1, textNode);
      }
    });
  };
}

/**
 * Remove trailing <br> elements from the tree
 */
function rehypeTrimEndBrElement() {
  function trim(tree: Parent): void {
    if (!Array.isArray(tree.children) || tree.children.length === 0) {
      return;
    }

    for (let i = tree.children.length - 1; i >= 0; i--) {
      const item = tree.children[i]!;
      if (item.type === "element") {
        if ((item as Element).tagName === "br") {
          tree.children.pop();
          continue;
        } else {
          trim(item as Parent);
        }
      }
      break;
    }
  }
  return trim;
}

/**
 * Remove non-content elements entirely, including their text children.
 * This prevents tags like <style> from leaking raw CSS into article body text
 * after sanitize strips the tag wrapper.
 */
const BLOCKED_TAG_NAMES: ReadonlySet<string> = new Set(NON_CONTENT_TAG_NAMES);

function rehypeDropNonContentElements() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (!parent || index === undefined) return;
      if (!BLOCKED_TAG_NAMES.has(node.tagName)) return;

      parent.children.splice(index, 1);
      return index;
    });
  };
}

// Module-level sanitization schema (built once and reused)
const rehypeSchema: Schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "video",
    "source",
    "audio",
    "figure",
    "figcaption",
    "details",
    "summary",
  ],
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), "className"],
    pre: [...(defaultSchema.attributes?.pre ?? []), "className"],
    video: [
      "src",
      "poster",
      "controls",
      "autoplay",
      "loop",
      "muted",
      "width",
      "height",
    ],
    audio: ["src", "controls", "autoplay", "loop", "muted"],
    source: ["src", "type"],
    img: [
      "src",
      "alt",
      "title",
      "width",
      "height",
      "loading",
      "srcSet",
      "sizes",
      "className",
    ],
  },
};

// Frozen module-level unified pipeline (built once and reused across all parses)
const htmlPipeline = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeDropNonContentElements)
  .use(rehypeSanitize, rehypeSchema)
  .use(rehypeEmojiImages)
  .use(rehypeTrimEndBrElement)
  .freeze();

/**
 * Extract decoded image src strings directly from a parsed HAST tree.
 */
export function extractImagesFromHast(tree: Root): string[] {
  const srcs: string[] = [];
  visit(tree, "element", (node: Element) => {
    if (node.tagName !== "img") return;
    const src = node.properties?.src;
    if (typeof src === "string" && src.trim()) {
      srcs.push(src);
    }
  });
  return srcs;
}

/**
 * Render a parsed HAST tree into React elements.
 */
export function renderHast(hastTree: Root, components?: Components) {
  return toJsxRuntime(hastTree, {
    Fragment,
    ignoreInvalidStyle: true,
    jsx: (type, props, key) => {
      const actualKey = props?.key ?? key;
      return jsx(type as React.ElementType, props, actualKey);
    },
    jsxs: (type, props, key) => {
      const actualKey = props?.key ?? key;
      return jsxs(type as React.ElementType, props, actualKey);
    },
    passNode: true,
    components,
  });
}

/**
 * Parse HTML string to HAST and React components
 */
export function parseHtml(content: string, options?: ParseHtmlOptions) {
  const { components } = options || {};

  const tree = htmlPipeline.parse(content);
  const hastTree = htmlPipeline.runSync(tree, content);

  return {
    hastTree,
    toContent: () => renderHast(hastTree, components),
  };
}
