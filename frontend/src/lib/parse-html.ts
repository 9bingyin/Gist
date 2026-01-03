import type { Element, Parent } from 'hast'
import type { Schema } from 'hast-util-sanitize'
import type { Components } from 'hast-util-to-jsx-runtime'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import rehypeParse from 'rehype-parse'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import { unified } from 'unified'

export type ParseHtmlOptions = {
  components?: Components
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
    '*': [...rehypeSchema.attributes!['*']!, 'style', 'class'],
    video: ['src', 'poster', 'controls', 'autoplay', 'loop', 'muted', 'width', 'height'],
    audio: ['src', 'controls', 'autoplay', 'loop', 'muted'],
    source: ['src', 'type'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'srcset', 'sizes'],
  }

  // Build the processing pipeline
  const pipeline = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeSanitize, rehypeSchema)
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
