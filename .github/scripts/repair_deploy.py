from pathlib import Path

root = Path.cwd()


def replace_once(filename: str, old: str, new: str) -> None:
    path = root / filename
    content = path.read_text()
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {filename}, found {count}: {old[:100]!r}")
    path.write_text(content.replace(old, new, 1))


replace_once(
    "scripts/onet/source.ts",
    "export type JsonRow = Record<string, unknown>;",
    "export type JsonRow = Record<string, unknown>;\nexport type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;",
)
replace_once(
    "scripts/onet/source.ts",
    "export async function detectLatestRelease(fetcher: typeof fetch = fetch): Promise<string> {",
    "export async function detectLatestRelease(fetcher: Fetcher = fetch): Promise<string> {",
)
replace_once(
    "scripts/onet/source.ts",
    "  fetcher: typeof fetch = fetch,",
    "  fetcher: Fetcher = fetch,",
)
replace_once(
    "scripts/onet/source.ts",
    '].map((match) => (match[2] ? `${match[1]}.${match[2]}` : match[1]!));',
    '].flatMap((match) => {\n    const majorOrVersion = match[1];\n    if (!majorOrVersion) return [];\n    return [match[2] ? `${majorOrVersion}.${match[2]}` : majorOrVersion];\n  });',
)
replace_once(
    "scripts/onet/transform.ts",
    'if (value > 0) {\n        occupation.interestHighPoints.push({',
    'if (value > 0) {\n        const area = IH_AREA_BY_CODE[value];\n        if (!area) throw new Error(`Unknown IH high-point code ${value} for ${occupation.code} ${id}.`);\n        occupation.interestHighPoints.push({',
)
replace_once("scripts/onet/transform.ts", "area: IH_AREA_BY_CODE[value]!,", "area,")
replace_once(
    "scripts/onet/transform.ts",
    "const canonicalName = OI_ELEMENTS.get(id)!;",
    'const canonicalName = OI_ELEMENTS.get(id);\n    if (!canonicalName) throw new Error(`Unknown OI dimension ${id} for ${occupation.code}.`);',
)
replace_once(
    "scripts/onet/transform.ts",
    "if (!occupations.has(code) || !occupations.has(relatedCode)) continue;",
    "const occupation = occupations.get(code);\n    if (!occupation || !occupations.has(relatedCode)) continue;",
)
replace_once(
    "scripts/onet/transform.ts",
    "occupations.get(code)!.related.push({ code: relatedCode, tier: relationType, index });",
    "occupation.related.push({ code: relatedCode, tier: relationType, index });",
)
replace_once(
    "scripts/onet/transform.ts",
    '    const id = text(row, "element_id");\n    const name = text(row, "element_name");\n    if (!occupation || !id) continue;',
    '    const id = text(row, "element_id");\n    if (!occupation || !id) continue;',
)
replace_once(
    "scripts/onet/refresh-remote.ts",
    'import { mkdir, readFile, writeFile } from "node:fs/promises";',
    'import { mkdir, writeFile } from "node:fs/promises";',
)
replace_once(
    "scripts/validate-interest-profiler.ts",
    'import { readFile } from "node:fs/promises";',
    'import { readFile } from "node:fs/promises";\nimport { dirname, resolve } from "node:path";\nimport { fileURLToPath } from "node:url";',
)
replace_once(
    "scripts/validate-interest-profiler.ts",
    'const assetPath = new URL("../src/data/interest-profiler/mini-ip-30.en.json", import.meta.url);\nconst schemaPath = new URL("../src/data/interest-profiler/mini-ip-30.schema.json", import.meta.url);',
    'const scriptDirectory = dirname(fileURLToPath(import.meta.url));\nconst assetPath = resolve(scriptDirectory, "../src/data/interest-profiler/mini-ip-30.en.json");\nconst schemaPath = resolve(scriptDirectory, "../src/data/interest-profiler/mini-ip-30.schema.json");',
)
replace_once(
    "scripts/validate-interest-profiler.ts",
    'if (rule.items) value.forEach((item, index) => validateSchema(item, rule.items!, `${path}[${index}]`, errors));',
    'const itemRule = rule.items;\n    if (itemRule) {\n      value.forEach((item, index) => {\n        validateSchema(item, itemRule, `${path}[${index}]`, errors);\n      });\n    }',
)
replace_once(
    "scripts/validate-provider-boundaries.ts",
    'import { extname, join, relative } from "node:path";',
    'import { dirname, extname, join, relative, resolve } from "node:path";',
)
replace_once(
    "scripts/validate-provider-boundaries.ts",
    'const root = fileURLToPath(new URL("..", import.meta.url));',
    'const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");',
)
replace_once(
    "scripts/validate-provider-boundaries.ts",
    'const configFiles = [join(root, "wrangler.jsonc")];',
    'const wranglerConfigPath = join(root, "wrangler.jsonc");\nconst configFiles = [wranglerConfigPath];',
)
replace_once(
    "scripts/validate-provider-boundaries.ts",
    "contents.get(configFiles[0]!)",
    "contents.get(wranglerConfigPath)",
)
replace_once(
    "src/lib/http.ts",
    "difference |= a[index]! ^ b[index]!;",
    "difference |= (a[index] ?? 0) ^ (b[index] ?? 0);",
)
replace_once(
    "src/lib/interest-profiler.ts",
    "const leftDelta = left[index]! - leftMean;\n    const rightDelta = right[index]! - rightMean;",
    "const leftValue = left[index];\n    const rightValue = right[index];\n    if (leftValue === undefined || rightValue === undefined) return null;\n    const leftDelta = leftValue - leftMean;\n    const rightDelta = rightValue - rightMean;",
)
replace_once(
    "src/lib/edge.ts",
    'import { CareerOneStopClient } from "./careeronestop";',
    'import type { CareerOneStopClient } from "./careeronestop";',
)
replace_once(
    "src/lib/edge.ts",
    'value.forEach((item, index) => inspect(item, `${path}[${index}]`));',
    'value.forEach((item, index) => {\n      inspect(item, `${path}[${index}]`);\n    });',
)
replace_once("src/lib/edge.ts", "let nextIndex = 0;", "const iterator = items.entries();")
replace_once(
    "src/lib/edge.ts",
    "const index = nextIndex;\n      nextIndex += 1;\n      if (index >= items.length) return;\n      results[index] = await mapper(items[index]!, index);",
    "const next = iterator.next();\n      if (next.done) return;\n      const [index, item] = next.value;\n      results[index] = await mapper(item, index);",
)
replace_once(
    "src/lib/careeronestop.ts",
    "await backoff(attempt);\n          continue;",
    "await backoff(attempt);",
)
replace_once(
    "src/lib/careeronestop.ts",
    'export function sanitizeText(value: string, maxLength = MAX_TEXT_LENGTH): string {\n  return decodeEntities(value)\n    .replace(/<[^>]*>/g, " ")\n    .replace(/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]/g, "")\n    .replace(/\\s+/g, " ")\n    .trim()\n    .slice(0, maxLength);\n}',
    'export function sanitizeText(value: string, maxLength = MAX_TEXT_LENGTH): string {\n  const withoutMarkup = decodeEntities(value).replace(/<[^>]*>/g, " ");\n  const withoutControlCharacters = Array.from(withoutMarkup).filter(isAllowedTextCharacter).join("");\n  return withoutControlCharacters.replace(/\\s+/g, " ").trim().slice(0, maxLength);\n}\n\nfunction isAllowedTextCharacter(character: string): boolean {\n  const codePoint = character.codePointAt(0);\n  return (\n    codePoint === undefined ||\n    (codePoint > 8 &&\n      codePoint !== 11 &&\n      codePoint !== 12 &&\n      (codePoint < 14 || codePoint > 31) &&\n      codePoint !== 127)\n  );\n}',
)
replace_once(
    "src/lib/edge-validation.ts",
    'function string(value: unknown, field: string, maxLength: number): string {\n  if (typeof value !== "string") fail(`${field} must be a string.`);\n  const normalized = value.trim();\n  if (!normalized) fail(`${field} is required.`);\n  if (normalized.length > maxLength) fail(`${field} exceeds ${maxLength} characters.`);\n  if (/[\\u0000-\\u001F\\u007F]/.test(normalized)) fail(`${field} contains control characters.`);\n  return normalized;\n}',
    'function string(value: unknown, field: string, maxLength: number): string {\n  if (typeof value !== "string") fail(`${field} must be a string.`);\n  const normalized = value.trim();\n  if (!normalized) fail(`${field} is required.`);\n  if (normalized.length > maxLength) fail(`${field} exceeds ${maxLength} characters.`);\n  if (Array.from(normalized).some(isControlCharacter)) fail(`${field} contains control characters.`);\n  return normalized;\n}\n\nfunction isControlCharacter(character: string): boolean {\n  const codePoint = character.codePointAt(0);\n  return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);\n}',
)
replace_once(
    "src/lib/validation.ts",
    'term.replace(/["*:^(){}\\[\\]]/g, "")',
    'term.replace(/["*:^(){}[\\]]/g, "")',
)
replace_once(
    "test/source.test.ts",
    'await expect(detectLatestRelease(fakeFetch as typeof fetch)).resolves.toBe("30.3");',
    'await expect(detectLatestRelease(fakeFetch)).resolves.toBe("30.3");',
)
replace_once(
    "test/source.test.ts",
    'await expect(detectLatestRelease(fakeFetch as typeof fetch)).rejects.toThrow(',
    'await expect(detectLatestRelease(fakeFetch)).rejects.toThrow(',
)
