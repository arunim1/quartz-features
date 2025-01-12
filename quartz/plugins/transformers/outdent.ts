import { QuartzTransformerPlugin } from "../types"
import { Root } from "mdast"
import { visit } from "unist-util-visit"

export const LogseqOutdent: QuartzTransformerPlugin = () => ({
  name: "LogseqOutdent",
  textTransform(ctx, src) {
    const content = typeof src === 'string' ? src : src.toString()
    var lines = content.split("\n")

    // 1. Detect existing frontmatter
    const hasExistingFrontmatter = lines[0]?.trim() === "---"

    if (hasExistingFrontmatter) {
      return content
    } 

    // else: assume that we are operating in "logseq" mode
    // Detect indentation style by analyzing indented lines
    interface IndentStyle {
      type: 'space' | 'tab';
      size: number; // For spaces only
    }

    function detectIndentationStyle(lines: string[]): IndentStyle {
      // there are edge cases this does not capture. oh well.
      const spaceIndents = new Map<number, number>() // size -> count
      let tabCount = 0
      
      for (const line of lines) {
        // Only consider lines that are list items (have "- " after indentation)
        const listItemMatch = /^(\s+)- /.exec(line)
        if (!listItemMatch) continue

        const indent = listItemMatch[1]
        if (indent.includes('\t')) {
          tabCount++
          continue
        }

        const spaceCount = indent.length
        spaceIndents.set(spaceCount, (spaceIndents.get(spaceCount) || 0) + 1)
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

      // Default to 2 spaces if no clear winner
      if (maxSpaceCount === 0) {
        return { type: 'space', size: 2 }
      }

      return { type: 'space', size: mostCommonSpaceSize }
    }

    const indentStyle = detectIndentationStyle(lines)

    // Collect all frontmatter properties and content lines separately
    const frontmatterProps: string[] = []
    const contentLines: string[] = []
    
    lines.forEach(line => {
      // Check if line contains :: separator (frontmatter property)
      if (line.includes('::')) {
        const trimmedLine = line.trim()
        if (trimmedLine.startsWith('- ')) {
          frontmatterProps.push(trimmedLine.substring(2))
        } else {
          frontmatterProps.push(trimmedLine)
        }
      } else {
        contentLines.push(line)
      }
    })

    // Combine everything with frontmatter at the top
    if (frontmatterProps.length > 0) {
      lines = [
        "---",
        ...frontmatterProps,
        "---",
        ...contentLines
      ]
    }

    lines = lines
    .map(line => line.replace(/^(- )/, '\n'))
    .map(line => line.replace(new RegExp(`^(${indentStyle.type === 'tab' ? '\t' : ' '.repeat(indentStyle.size)})`), ''))
    .filter(line => line !== '-')
    
    // Convert [[]] wrapped text after :: to a list
    lines = lines.flatMap(line => {
      const [key, value] = line.split('::').map(s => s.trim());
      const matches = value?.match(/\[\[(.*?)\]\]/g);
      return matches ? [key + '::', ...matches.map(m => `- ${m.slice(2, -2)}`)] : [line];
    });

    // Convert :: to :
    lines = lines.map(line => line.replace(/::+/g, ':'));
    
    // Convert "alias" to "aliases"
    lines = lines.map(line => line.replace(/^alias:/i, 'aliases:'));
    
    return lines.join("\n")
  },
  markdownPlugins() {
    return [
      () => (tree: Root, _file) => {
        visit(tree, "text", (node) => {
          if (node.position?.start?.offset === 0) {
            node.value = ""
          }
        })
      },
    ]
  },
})