import fs from 'node:fs/promises'
import path from 'node:path'

export const STARTER_FILES: Record<string, string> = {
  'Welcome.md': `---
title: Welcome to Slate
tags: [getting-started]
---

# Welcome to Slate

Slate is a local-first knowledge base. Every note is a plain text Markdown file in a folder you own, and that folder is backed up to a private GitHub repository.

## The basics

- **Create a note** with \`⌘N\`, or click the note icon in the sidebar.
- **Jump anywhere** with the quick switcher: \`⌘O\`.
- **Run any command** with the command palette: \`⌘P\`.
- **Search your vault** with \`⌘⇧F\`.
- **Toggle reading view** with \`⌘E\`.

## Link your thinking

Type \`[[\` to link to another note — for example [[Markdown cheat sheet]]. Backlinks appear in the right sidebar so you can see what points here.

You can link to a heading with \`[[Markdown cheat sheet#Tables]]\`, and to an alias with \`[[Markdown cheat sheet|the cheat sheet]]\`.

## Tags and tasks

Tag anything with #ideas or #project/slate. Tasks work like this:

- [ ] Write a first note
- [x] Install Slate

## Daily notes

Press \`⌘⇧D\` to open today's note. Each day lives in the \`Daily\` folder.

> [!tip] Everything is a file
> Slate never uses a proprietary database. Open your vault in Finder, edit files in any other editor, and Slate will notice the change.
`,
  'Markdown cheat sheet.md': `# Markdown cheat sheet

## Text

**Bold**, *italic*, ~~strikethrough~~, \`inline code\`, ==highlight==.

## Lists

1. First
2. Second
   - Nested bullet
   - Another one

- [ ] Open task
- [x] Done task

## Tables

| Feature | Shortcut |
| --- | --- |
| Quick switcher | ⌘O |
| Command palette | ⌘P |
| Search | ⌘⇧F |
| Reading view | ⌘E |

## Quotes and callouts

> A plain quote.

> [!note] Callouts
> Callouts support **markdown** inside them.

> [!warning] Careful
> Sync conflicts are reported rather than silently overwritten.

## Code

\`\`\`ts
export function greet(name: string): string {
  return \`Hello, \${name}\`
}
\`\`\`

## Math

Inline math like $e^{i\\pi} + 1 = 0$ and display math:

$$
\\int_0^1 x^2\\,dx = \\frac{1}{3}
$$

## Diagrams

\`\`\`mermaid
graph LR
  A[Idea] --> B[Note]
  B --> C[Link]
  C --> D[Graph]
\`\`\`

## Images and embeds

Drop an image into the editor to attach it, or embed a note with \`![[Welcome]]\`.
`,
  'Project ideas.md': `---
tags: [ideas, project/slate]
status: active
---

# Project ideas

- A reading queue that surfaces one item a day
- Weekly review template that pulls in open tasks
- Graph view filtered by tag

Related: [[Welcome]], [[Markdown cheat sheet]]
`,
  'Templates/Daily note.md': `# {{date:dddd, MMMM D, YYYY}}

## Focus
- 

## Notes

## Open loops
- [ ] 
`,
  'Templates/Meeting.md': `# {{title}}

**Date:** {{date}}
**Attendees:** 

## Agenda
- 

## Notes

## Action items
- [ ] 
`,
  'Daily/.gitkeep': ''
}

export async function writeStarterVault(root: string): Promise<void> {
  for (const [rel, content] of Object.entries(STARTER_FILES)) {
    const abs = path.join(root, rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    try {
      await fs.writeFile(abs, content, { encoding: 'utf8', flag: 'wx' })
    } catch {
      /* file already exists */
    }
  }
  const hello = path.join(root, 'Attachments')
  await fs.mkdir(hello, { recursive: true })
}
