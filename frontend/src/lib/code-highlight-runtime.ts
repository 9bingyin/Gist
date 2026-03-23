import { createBundledHighlighter } from '@shikijs/core'
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript'
import {
  transformerNotationDiff,
  transformerNotationHighlight,
} from '@shikijs/transformers'

const languageLoaders = {
  javascript: () => import('@shikijs/langs/javascript'),
  typescript: () => import('@shikijs/langs/typescript'),
  jsx: () => import('@shikijs/langs/jsx'),
  tsx: () => import('@shikijs/langs/tsx'),
  json: () => import('@shikijs/langs/json'),
  html: () => import('@shikijs/langs/html'),
  css: () => import('@shikijs/langs/css'),
  python: () => import('@shikijs/langs/python'),
  bash: () => import('@shikijs/langs/bash'),
  shell: () => import('@shikijs/langs/shell'),
  markdown: () => import('@shikijs/langs/markdown'),
  yaml: () => import('@shikijs/langs/yaml'),
  xml: () => import('@shikijs/langs/xml'),
  sql: () => import('@shikijs/langs/sql'),
  go: () => import('@shikijs/langs/go'),
  rust: () => import('@shikijs/langs/rust'),
  java: () => import('@shikijs/langs/java'),
  php: () => import('@shikijs/langs/php'),
  c: () => import('@shikijs/langs/c'),
  cpp: () => import('@shikijs/langs/cpp'),
  diff: () => import('@shikijs/langs/diff'),
  dockerfile: () => import('@shikijs/langs/dockerfile'),
} as const

const themeLoaders = {
  'github-light': () => import('@shikijs/themes/github-light'),
  'github-dark': () => import('@shikijs/themes/github-dark'),
} as const

type SupportedLanguage = keyof typeof languageLoaders
type SupportedTheme = keyof typeof themeLoaders
type AppHighlighter = Awaited<ReturnType<typeof createHighlighter>>

const commonLanguages: SupportedLanguage[] = [
  'javascript',
  'typescript',
  'json',
  'html',
  'css',
  'python',
  'bash',
  'shell',
  'markdown',
  'yaml',
  'xml',
  'sql',
]

const createHighlighter = createBundledHighlighter<
  SupportedLanguage,
  SupportedTheme
>({
  langs: languageLoaders,
  themes: themeLoaders,
  engine: createJavaScriptRegexEngine,
})

let highlighterPromise: Promise<AppHighlighter> | null = null
const loadedLanguages = new Set<string>(commonLanguages)

function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return lang in languageLoaders
}

async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: commonLanguages,
    })
  }
  return highlighterPromise
}

export async function highlightCode(code: string, lang: string): Promise<string> {
  const highlighter = await getHighlighter()
  const normalizedLang =
    lang !== 'text' && isSupportedLanguage(lang) ? lang : 'text'

  if (normalizedLang !== 'text' && !loadedLanguages.has(normalizedLang)) {
    await highlighter.loadLanguage(normalizedLang)
    loadedLanguages.add(normalizedLang)
  }

  return highlighter.codeToHtml(code, {
    lang: normalizedLang,
    themes: {
      light: 'github-light',
      dark: 'github-dark',
    },
    defaultColor: false,
    transformers: [
      transformerNotationDiff(),
      transformerNotationHighlight(),
    ],
  })
}
