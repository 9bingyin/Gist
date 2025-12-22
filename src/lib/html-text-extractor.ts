/**
 * HTML text extraction and replacement utilities
 * Extract text nodes from HTML, translate them, and replace back
 */

import * as cheerio from "cheerio";
import type { AnyNode, Element, Text } from "domhandler";

// Elements that should not have their text translated
const SKIP_ELEMENTS = new Set([
  "script",
  "style",
  "code",
  "pre",
  "kbd",
  "samp",
  "var",
]);

interface TextNodeInfo {
  index: number;
  text: string;
  node: Text;
}

interface ExtractionResult {
  texts: string[];
  replaceTexts: (translations: string[]) => string;
}

/**
 * Extract translatable text from HTML and provide a replacement function
 */
export function extractTextsFromHtml(html: string): ExtractionResult {
  const $ = cheerio.load(html, { xml: false });
  const textNodes: TextNodeInfo[] = [];
  let index = 0;

  // Recursive function to find all text nodes
  function findTextNodes(nodes: AnyNode[]) {
    for (const node of nodes) {
      if (node.type === "text") {
        const textNode = node as Text;
        const text = textNode.data;
        // Only include non-empty text
        if (text && text.trim().length > 0) {
          textNodes.push({
            index: index++,
            text: text,
            node: textNode,
          });
        }
      } else if (node.type === "tag") {
        const element = node as Element;
        const tagName = element.tagName.toLowerCase();
        // Skip certain elements
        if (!SKIP_ELEMENTS.has(tagName) && element.children) {
          findTextNodes(element.children);
        }
      }
    }
  }

  // Start from root children
  const root = $.root()[0];
  if (root && "children" in root) {
    findTextNodes(root.children as AnyNode[]);
  }

  // Extract just the text strings
  const texts = textNodes.map((n) => n.text);

  // Return the texts and a function to replace them
  return {
    texts,
    replaceTexts: (translations: string[]) => {
      if (translations.length !== textNodes.length) {
        console.warn(
          `Translation count mismatch: expected ${textNodes.length}, got ${translations.length}`
        );
      }

      // Replace each text node with its translation
      for (let i = 0; i < Math.min(translations.length, textNodes.length); i++) {
        const nodeInfo = textNodes[i];
        // Only replace if translation is not empty
        if (translations[i]) {
          nodeInfo.node.data = translations[i];
        }
      }

      return $.html();
    },
  };
}

/**
 * Parse translation response back to array
 */
export function parseTranslationResponse(response: string, expectedCount: number): string[] {
  const lines = response.trim().split("\n");
  const result: string[] = new Array(expectedCount).fill("");

  for (const line of lines) {
    // Match [N] pattern at the start
    const match = line.match(/^\[(\d+)\]\s*(.*)/);
    if (match) {
      const index = parseInt(match[1], 10);
      const text = match[2];
      if (index >= 0 && index < expectedCount) {
        result[index] = text;
      }
    }
  }

  return result;
}

/**
 * Check if HTML has meaningful text content to translate
 */
export function hasTranslatableText(html: string): boolean {
  const { texts } = extractTextsFromHtml(html);
  return texts.some((t) => t.trim().length > 0);
}
