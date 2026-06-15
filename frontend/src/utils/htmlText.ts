export function htmlToTextareaText(value: string) {
  if (!value.trim()) return ''

  const withLineBreaks = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|pre|blockquote|section|article|table|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')

  return decodeHtmlEntities(withLineBreaks)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}
