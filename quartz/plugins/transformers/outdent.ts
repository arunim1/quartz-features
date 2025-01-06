import { QuartzTransformerPlugin } from "../types"
import { Root } from "mdast"
import { visit } from "unist-util-visit"

export const LogseqOutdent: QuartzTransformerPlugin = () => ({
  name: "LogseqOutdent",
  textTransform(ctx, src) {
    const content = typeof src === "string" ? src : src.toString()
    let lines = content.split("\n")

    // 1. Detect existing frontmatter
    const hasExistingFrontmatter = lines[0]?.trim() === "---"
    let frontmatterEndIndex = -1

    if (hasExistingFrontmatter) {
      return content
    }

    // Lines after existing frontmatter (or everything if none exists)
    const bodyStart = hasExistingFrontmatter ? frontmatterEndIndex + 1 : 0
    let bodyLines = lines.slice(bodyStart)

    // Detect indentation style by analyzing indented lines
    interface IndentStyle {
      type: 'space' | 'tab';
      size: number; // For spaces only
    }

    function detectIndentationStyle(lines: string[]): IndentStyle {
      const spaceIndents = new Map<number, number>() // size -> count
      let tabCount = 0
      
      for (const line of lines) {
        // Skip empty lines
        if (line.trim().length === 0) continue

        const hasTabs = /^\t+/.test(line)
        if (hasTabs) {
          tabCount++
          continue
        }

        const spaceMatch = /^( +)/.exec(line)
        if (spaceMatch) {
          const spaces = spaceMatch[1]
          const size = spaces.length
          spaceIndents.set(size, (spaceIndents.get(size) || 0) + 1)
        }
      }

      // If tabs are more common than any space indentation, use tabs
      let maxSpaceCount = 0
      let mostCommonSpaceSize = 2
      for (const [size, count] of spaceIndents) {
        if (count > maxSpaceCount) {
          maxSpaceCount = count
          mostCommonSpaceSize = size
        }
      }

      if (tabCount > maxSpaceCount) {
        return { type: 'tab', size: 1 }
      }

      // Default to 2 spaces if no clear winner or only single-space indents
      if (maxSpaceCount === 0 || mostCommonSpaceSize === 1) {
        return { type: 'space', size: 2 }
      }

      return { type: 'space', size: mostCommonSpaceSize }
    }

    const indentStyle = detectIndentationStyle(bodyLines)

    // 2. Extract "Logseq frontmatter" lines (those with `::`) 
    //    if we do NOT have an existing frontmatter block
    let extractedFrontmatter: string[] = []

    if (!hasExistingFrontmatter) {
      let i = 0
      // Keep scanning lines from the top while they contain `::`.
      // Ignore blank lines but keep going in case there's another frontmatter line below.
      while (i < bodyLines.length) {
        let line = bodyLines[i]
        const trimmed = line.trim()

        // If it's a completely blank line, skip it but keep scanning
        if (trimmed === "") {
          i++
          continue
        }
        // If no '::' is found, we stop scanning for frontmatter
        if (!trimmed.includes("::")) {
          break
        }
        // Remove leading '-' or indentation if present
        // so that "- tags:: doctors, blog" becomes "tags:: doctors, blog"
        line = line.replace(/^\s*-\s*/, "")

        extractedFrontmatter.push(line)
        i++
      }
      // Remove extracted frontmatter lines (and any skipped blank lines) from the body
      bodyLines.splice(0, i)
    }

    // 2b. Convert `::` => `:`, and rename `alias:` => `aliases:`
    extractedFrontmatter = extractedFrontmatter.map((line) =>
      line.replace(/::/g, ":").replace(/^alias:/i, "aliases:")
    )

    // 2c. Convert each frontmatter line into structured form: “key: [values...]”
    //     so multiple bracket refs or comma-sep items become a YAML array.
    const structuredFM: { key: string; values: string[] }[] = []
    for (const line of extractedFrontmatter) {
      // Split on first colon only
      const [rawKey, ...rest] = line.split(":")
      const key = rawKey.trim()
      const value = rest.join(":").trim()

      if (!value) {
        // e.g. "public:" with no value
        structuredFM.push({ key, values: [] })
        continue
      }

      // 1) Check bracket references: [[foo]] [[bar]]
      const bracketMatches = value.match(/\[\[(.*?)\]\]/g)
      if (bracketMatches) {
        const bracketedValues = bracketMatches.map((m) => m.slice(2, -2).trim())
        structuredFM.push({ key, values: bracketedValues })
        continue
      }

      // 2) If no bracket references, check for comma-separated
      const splittedByComma = value.split(",").map((v) => v.trim()).filter(Boolean)
      if (splittedByComma.length > 1) {
        structuredFM.push({ key, values: splittedByComma })
      } else {
        // Single string
        structuredFM.push({ key, values: [value] })
      }
    }

    // 2d. Rebuild into lines of YAML frontmatter
    let finalFrontmatterLines: string[] = []
    if (structuredFM.length > 0) {
      finalFrontmatterLines.push("---")
      for (const { key, values } of structuredFM) {
        if (values.length === 0) {
          // e.g. "public:"
          finalFrontmatterLines.push(`${key}:`)
        } else if (values.length === 1) {
          // e.g. "public: true"
          finalFrontmatterLines.push(`${key}: ${values[0]}`)
        } else {
          // e.g.
          // tags:
          //  - doctors
          //  - blog
          finalFrontmatterLines.push(`${key}:`)
          for (const v of values) {
            finalFrontmatterLines.push(`  - ${v}`)
          }
        }
      }
      finalFrontmatterLines.push("---")
    }

    // 3. Outdent lines and handle bullets appropriately
    const outdentedBody: string[] = []
    let lastLineWasEmpty = false

    for (const line of bodyLines) {
      const originalLine = line
      let indentLevel = 0
      let trimmedLine = line

      if (indentStyle.type === 'tab') {
        const tabMatch = /^(\t*)/.exec(line)
        if (tabMatch) {
          indentLevel = tabMatch[1].length
          trimmedLine = line.slice(tabMatch[1].length)
        }
      } else {
        const spaceMatch = /^(\s*)/.exec(line)
        if (spaceMatch) {
          indentLevel = Math.floor(spaceMatch[1].length / indentStyle.size)
          trimmedLine = line.slice(spaceMatch[1].length)
        }
      }

      // Handle empty lines or just bullet points
      if (trimmedLine === "" || trimmedLine === "-" || trimmedLine === "- ") {
        // Only add an empty line if the previous line wasn't empty
        if (!lastLineWasEmpty) {
          outdentedBody.push("")
          lastLineWasEmpty = true
        }
        continue
      }

      lastLineWasEmpty = false

      // Check for frontmatter in list items
      if (indentLevel === 0 && trimmedLine.startsWith("- ") && trimmedLine.includes("::")) {
        const frontmatterLine = trimmedLine.slice(2)
        extractedFrontmatter.push(frontmatterLine)
        continue
      }

      // Process the line
      if (indentLevel === 0 && trimmedLine.startsWith("- ")) {
        // Top-level bullet - remove the bullet
        outdentedBody.push(trimmedLine.slice(2))
      } else if (indentLevel > 0 && trimmedLine.startsWith("- ")) {
        // Sublist - reduce indentation by one level but preserve relative indentation
        const newIndentLevel = indentLevel - 1
        const newIndent = indentStyle.type === 'tab' 
          ? "\t".repeat(newIndentLevel)
          : " ".repeat(newIndentLevel * indentStyle.size)
        outdentedBody.push(newIndent + trimmedLine)
      } else {
        // Regular line - keep as is
        outdentedBody.push(originalLine)
      }

      // Add empty line after if not already empty
      if (!lastLineWasEmpty) {
        outdentedBody.push("")
        lastLineWasEmpty = true
      }
    }

    // Remove any trailing empty lines
    while (outdentedBody.length > 0 && outdentedBody[outdentedBody.length - 1] === "") {
      outdentedBody.pop()
    }

    // Ensure there's a blank line after frontmatter if we have content
    if ((hasExistingFrontmatter || finalFrontmatterLines.length > 0) && outdentedBody.length > 0 && outdentedBody[0] !== "") {
      outdentedBody.unshift("")
    }

    // 4. Merge everything back. If there was original frontmatter, keep it untouched.
    let finalLines: string[] = []

    if (hasExistingFrontmatter) {
      // Preserve original frontmatter lines:
      finalLines.push(...lines.slice(0, frontmatterEndIndex + 1))
      // Then add the rest (with outdents, etc.)
      finalLines.push(...outdentedBody)
    } else if (finalFrontmatterLines.length > 0) {
      // We extracted frontmatter. Insert it, then the transformed body
      finalLines.push(...finalFrontmatterLines, ...outdentedBody)
    } else {
      // No existing frontmatter, no logseq frontmatter, just outdent only
      finalLines.push(...outdentedBody)
    }

    return finalLines.join("\n")
  },
  markdownPlugins() {
    return [
      () =>
        (tree: Root, _file) => {
          // This simply clears the leading text node if offset === 0
          visit(tree, "text", (node) => {
            if (node.position?.start?.offset === 0) {
              node.value = ""
            }
          })
        },
    ]
  },
})
