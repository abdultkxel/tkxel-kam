import { users } from '@/data/mock'

const mentionPattern = /@\{([^}]+)\}/g

export function extractMentionIds(text: string) {
  return Array.from(text.matchAll(mentionPattern)).map(match => match[1])
}

export function displayMention(token: string) {
  return users.find(user => user.id === token)?.name ?? token
}

export function initialsForUser(userId: string) {
  return users.find(user => user.id === userId)?.avatarInitials ?? '@'
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
