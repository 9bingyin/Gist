import type { Element, Parent, Root, Text } from 'hast'
import type { Schema } from 'hast-util-sanitize'
import type { Components } from 'hast-util-to-jsx-runtime'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import rehypeParse from 'rehype-parse'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

export type ParseHtmlOptions = {
  components?: Components
}

// Emoji image class patterns (WordPress, EmojiOne, Twemoji, etc.)
const EMOJI_CLASS_PATTERNS = ['wp-smiley', 'emoji', 'emojione', 'emoticon', 'smiley']

// Check if a string contains emoji characters
function isEmojiChar(str: string): boolean {
  // Match common emoji ranges:
  // - Miscellaneous Symbols (U+2600-U+26FF)
  // - Dingbats (U+2700-U+27BF)
  // - Miscellaneous Symbols and Arrows (U+2B00-U+2BFF)
  // - Variation Selectors (U+FE00-U+FEFF)
  // - Supplemental Symbols (U+1F000-U+1FFFF)
  const emojiRegex =
    /[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{2B00}-\u{2BFF}]|[\u{FE00}-\u{FEFF}]|[\u{1F000}-\u{1FFFF}]/u
  return emojiRegex.test(str)
}

/**
 * Rehype plugin to convert emoji images back to native emoji text.
 * Handles WordPress wp-smiley, EmojiOne, Twemoji, and similar implementations.
 */
function rehypeEmojiImages() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'img' || !parent || index === undefined) return

      const props = node.properties || {}
      // className in hast is an array
      const classNames = Array.isArray(props.className) ? props.className : []
      const className = classNames.join(' ')
      const alt = String(props.alt || '')

      // Check if this is an emoji image by class name
      const isEmojiClass = EMOJI_CLASS_PATTERNS.some((pattern) =>
        className.toLowerCase().includes(pattern)
      )

      if (isEmojiClass && alt && isEmojiChar(alt)) {
        // Replace img with text node containing the emoji
        const textNode: Text = { type: 'text', value: alt }
        parent.children.splice(index, 1, textNode)
      }
    })
  }
}

/**
 * Remove trailing <br> elements from the tree
 */
function rehypeTrimEndBrElement() {
  function trim(tree: Parent): void {
    if (!Array.isArray(tree.children) || tree.children.length === 0) {
      return
    }

    for (let i = tree.children.length - 1; i >= 0; i--) {
      const item = tree.children[i]!
      if (item.type === 'element') {
        if ((item as Element).tagName === 'br') {
          tree.children.pop()
          continue
        } else {
          trim(item as Parent)
        }
      }
      break
    }
  }
  return trim
}

/**
 * Parse HTML string to React components
 */
export function parseHtml(content: string, options?: ParseHtmlOptions) {
  const { components } = options || {}

  // Configure sanitization schema
  const rehypeSchema: Schema = { ...defaultSchema }
  rehypeSchema.tagNames = [
    ...rehypeSchema.tagNames!,
    'video',
    'source',
    'audio',
    'figure',
    'figcaption',
    'details',
    'summary',
  ]

  rehypeSchema.attributes = {
    ...rehypeSchema.attributes,
    '*': [...rehypeSchema.attributes!['*']!, 'style', 'className'],
    video: ['src', 'poster', 'controls', 'autoplay', 'loop', 'muted', 'width', 'height'],
    audio: ['src', 'controls', 'autoplay', 'loop', 'muted'],
    source: ['src', 'type'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'srcset', 'sizes', 'className'],
  }

  // Build the processing pipeline
  const pipeline = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeSanitize, rehypeSchema)
    .use(rehypeEmojiImages)
    .use(rehypeTrimEndBrElement)
    .use(rehypeStringify)

  // Parse and process the HTML
  const tree = pipeline.parse(content)
  const hastTree = pipeline.runSync(tree, content)

  return {
    hastTree,
    toContent: () =>
      toJsxRuntime(hastTree, {
        Fragment,
        ignoreInvalidStyle: true,
        jsx: (type, props, key) => {
          // Prefer key from props (set by custom components) over auto-generated key
          const actualKey = props?.key ?? key
          // Type cast needed: hast-util-to-jsx-runtime's type is broader than React's jsx expects
          return jsx(type as React.ElementType, props, actualKey)
        },
        jsxs: (type, props, key) => {
          const actualKey = props?.key ?? key
          return jsxs(type as React.ElementType, props, actualKey)
        },
        passNode: true,
        components,
      }),
  }
}
