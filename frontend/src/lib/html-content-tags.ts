export const NON_CONTENT_TAG_NAMES = [
  'style',
  'script',
  'noscript',
  'template',
  'head',
  'title',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'textarea',
  'noembed',
  'noframes',
] as const

export const NON_CONTENT_TAG_SELECTOR = NON_CONTENT_TAG_NAMES.join(',')
