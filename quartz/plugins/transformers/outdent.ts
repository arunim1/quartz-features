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

    // Find the first non-indented block
    let firstNonIndentedBlockEnd = lines.findIndex((line, index) => {
      // if (index === 0) return false; // Skip the first line
      return line.startsWith('-') || line.trim() === '';
    });

    // If no non-indented content is found at the beginning, don't modify the file
    if (!(firstNonIndentedBlockEnd === -1 || firstNonIndentedBlockEnd === 0)) {
      // Wrap the first non-indented block with "---"
      lines = [
        "---",
        ...lines.slice(0, firstNonIndentedBlockEnd),
        "---",
        ...lines.slice(firstNonIndentedBlockEnd)
      ];
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