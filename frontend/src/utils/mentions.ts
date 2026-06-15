const mentionPattern = /@\{([^}]+)\}/g

export function extractMentionIds(text: string) {
  return Array.from(text.matchAll(mentionPattern)).map(match => match[1])
}

export function displayMention(token: string) {
  return token
}

export function initialsForUser(userId: string) {
  return userId ? userId.slice(0, 2).toUpperCase() : '@'
}

export function insertMentionToken(value: string, cursor: number, query: string, userId: string) {
  const start = Math.max(0, cursor - query.length - 1)
  const before = value.slice(0, start)
  const after = value.slice(cursor)
  const token = `@{${userId}} `
  return {
    value: `${before}${token}${after}`,
    cursor: before.length + token.length,
  }
}
