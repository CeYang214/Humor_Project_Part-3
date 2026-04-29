type JsonObject = Record<string, unknown>

function parseStrictJsonObject(raw: string): JsonObject {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Payload must be valid JSON or line-based key/value entries.')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Payload must resolve to an object.')
  }

  return parsed as JsonObject
}

function parseLineValue(raw: string): unknown {
  if (!raw) return ''

  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function parseLineObject(raw: string): JsonObject {
  const payload: JsonObject = {}
  const lines = raw.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const equalsIndex = trimmed.indexOf('=')
    const colonIndex = trimmed.indexOf(':')
    const separatorIndex = [equalsIndex, colonIndex]
      .filter((index) => index > 0)
      .sort((a, b) => a - b)[0]

    if (separatorIndex === undefined) {
      throw new Error('Each line must use `column: value` or `column=value`.')
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    if (!key) {
      throw new Error('Each payload line must include a column name before the separator.')
    }

    const rawValue = trimmed.slice(separatorIndex + 1).trim()
    payload[key] = parseLineValue(rawValue)
  }

  if (Object.keys(payload).length === 0) {
    throw new Error('Payload is required.')
  }

  return payload
}

function quoteIfNeeded(text: string) {
  if (!text) return '""'
  if (text.includes('\n')) return JSON.stringify(text)

  try {
    const parsed = JSON.parse(text)
    if (typeof parsed !== 'string' || parsed !== text) {
      return JSON.stringify(text)
    }
  } catch {
    // Keep plain text as-is.
  }

  return text
}

function formatLineValue(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'string') return quoteIfNeeded(value)

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function parsePayloadInput(raw: string): JsonObject {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('Payload is required.')
  }

  if (trimmed.startsWith('{')) {
    return parseStrictJsonObject(trimmed)
  }

  return parseLineObject(trimmed)
}

export function stringifyPayloadInput(value: JsonObject): string {
  const lines: string[] = []

  for (const [key, entryValue] of Object.entries(value)) {
    lines.push(`${key}: ${formatLineValue(entryValue)}`)
  }

  return lines.join('\n')
}
