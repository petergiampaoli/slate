# Slate

A local-first Markdown knowledge base for macOS — an Obsidian-style vault that lives in a folder of plain text files and syncs to a **private GitHub repository** you own.

![Slate](docs/screenshot.png)

Slate does not use a proprietary database. Notes are `.md` files, canvases are `.canvas` JSON, attachments are regular files, and version history is ordinary `git` history. You can open the vault in Finder, edit files in any editor, and Slate will pick up the changes.

---

## Features

### Notes & editor
- **CodeMirror 6** editor with a custom **live preview** renderer: headings, bold/italic, `==highlights==`, inline code, task checkboxes, images, wiki links, embeds, callouts and fenced code are styled inline while raw Markdown appears when your cursor is on the line.
- **Source** and **Reading** modes alongside live preview (`⌘E`).
- **Wiki links** — `[[Note]]`, `[[Note|alias]]`, `[[Note#Heading]]`, embeds `![[Note]]` — with autocomplete when you type `[[`.
- **Backlinks**, **outgoing links**, and **unlinked mentions** in the right sidebar.
- **Tags** with nested `#project/slate` support, a tag pane, and tag completion.
- **YAML frontmatter / properties** with an editable properties panel.
- **Daily notes** from a template with moment-style date tokens (`YYYY-MM-DD`, `dddd`…).
- **Templates** folder + insert-template command.
- **Code blocks** with syntax highlighting, **KaTeX math**, **Mermaid diagrams**, **GFM tables**, task lists, footnotes, and Obsidian **callouts** (`> [!tip]`).
- **Attachments**: drag & drop or paste images, resolved by filename so notes survive moves.
- **Canvas** — Obsidian-compatible `.canvas` files with text/note cards, groups, connections, drag, resize and zoom.
- **Graph view** — force-directed global graph and a local 2-hop graph, colour-coded by folder, with search and pan/zoom.

### Navigation & workspace
- Tabs, split panes, per-tab back/forward history, resizable sidebars, focus mode.
- **Quick switcher** (`⌘O`), **command palette** (`⌘P`), full-vault **search** with `tag:`, `path:`, `file:` and `/regex/` filters.
- **Outline** pane, bookmarks, starred tags, random note.
- **Reading view** with interactive task checkboxes, clickable wiki links and heading anchors.
- **Export** to PDF, HTML or Markdown; print-ready layout.
- Native macOS menu bar, traffic-light window, dark/light/system themes and eight accent colours.
- Custom CSS snippets, editor font/size/measure settings.

### Storage & sync
- The vault is a git repository. Sync = `fetch → pull --rebase --autostash → add → commit → push`.
- **Create a private GitHub repo** from Settings (uses the `gh` CLI), or connect any existing remote.
- **Automatic sync** on an interval, optionally after every save.
- **Version history** per note: browse commits, preview any revision, restore it.
- Conflicts are **reported, never silently overwritten**. External file changes are detected with `fs.watch` and reloaded unless you have unsaved edits (then you get a conflict banner).

---

## Quick start

```bash
cd slate
npm install
npm run dev        # development, hot reload
```

Build a distributable **.app / .dmg**:

```bash
npm run dist       # arm64 + x64
npm run dist:x64   # or a single architecture
```

Artifacts are written to `release/`. The build is unsigned (`identity: null`), which is fine for local use. If you download the DMG from elsewhere, right-click → Open the first time.

### Repositories

| Repository | Visibility | Purpose |
| --- | --- | --- |
| [petergiampaoli/slate](https://github.com/petergiampaoli/slate) | **public** | Application source |
| [petergiampaoli/slate-vault-user-Peter](https://github.com/petergiampaoli/slate-vault-user-Peter) | **private** | Peter’s notes (the default user) |

Every user gets their own **private** notes repository following the same convention:

```
slate-vault-user-<Name>
```

Slate never puts notes in the application repository. The earlier single `slate-vault` repository was archived after its history was moved to `slate-vault-user-Peter`.

### The vault

On first launch Slate creates `~/Documents/Slate Vault` with a welcome note, a Markdown cheat sheet, daily-note and meeting templates. Additional users live in `~/Documents/Slate Vaults/<Name>`. You can open any existing folder of Markdown files instead.

### Users

![User settings](docs/screenshot-users.png)

Slate is multi-user by design, so one Mac can host several people’s private vaults:

- The active user is shown in **Settings → General** and in the status bar.
- **Switch user…** opens that user’s vault. If the private repo exists it is cloned; if it does not, Slate creates the folder, starter notes and a private `slate-vault-user-<Name>` repository automatically.
- **+ New user vault** does the same for a brand-new name.
- Every user’s notes, git history and sync state are completely separate.
- The same actions are available from the command palette (`⌘P` → “Switch user vault”).

### Setting up sync in a new vault

1. Open **Settings → Sync & backup** (`⌘,`).
2. Press **Create private repo** — Slate runs `gh repo create slate-vault-user-<Name> --private --source . --remote origin --push`.
   Requires the GitHub CLI (`brew install gh`) and `gh auth login`.
3. Or paste an existing repository URL and press **Save**.
4. Use `⌘⇧S` or the status-bar item to sync manually.

> Prefer a different remote? Anything git can push to works: GitLab, a self-hosted server, or a bare repo on a NAS.

---

## Project structure

```
slate/
├── electron.vite.config.ts        # main / preload / renderer bundling
├── electron-builder.yml           # macOS packaging
├── build/                         # icon source + .icns
├── src/
│   ├── main/
│   │   ├── index.ts               # app lifecycle, window, protocol, menus
│   │   ├── ipc.ts                 # typed IPC surface (files, git, dialogs, export)
│   │   ├── vault.ts               # vault filesystem + watcher + path safety
│   │   ├── git.ts                 # status / sync / history / repo creation
│   │   ├── store.ts               # persisted settings
│   │   └── menu.ts                # macOS application menu
│   ├── preload/index.ts           # contextBridge API (window.slate)
│   ├── shared/types.ts            # shared TypeScript contracts
│   └── renderer/src/
│       ├── App.tsx                # shell, theme, menu actions, autosync
│       ├── state/store.ts         # zustand store: vault, tabs, index, sync
│       ├── lib/
│       │   ├── indexer.ts         # link parsing, resolution, backlinks, tags
│       │   ├── markdown.ts        # unified/remark/rehype rendering pipeline
│       │   ├── search.ts          # query parser, ranked search, fuzzy switcher
│       │   └── utils.ts
│       └── components/            # editor, sidebar, graph, canvas, modals…
```

### Design notes

- **Single source of truth for links.** `indexer.ts` parses every note into `NoteMeta` (frontmatter, tags, headings, links, words) and resolves links Obsidian-style: exact path, then shortest filename match, then alias.
- **The renderer owns no files.** All disk access goes through IPC with a path-traversal guard in `vault.absolute()`.
- **Attachments use a custom `slate://` protocol** rather than `file://`, so images and PDFs load inside the sandboxed renderer without disabling web security.
- **Live preview is a decoration pass**, not a separate document: one CodeMirror state, regex-driven `Decoration.mark`/`replace`/widget ranges, recomputed only on document, selection or viewport changes.
- **Crash-safe editing**: content is written 700 ms after you stop typing, on window blur, and before sync.

---

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| New note | `⌘N` |
| Quick switcher | `⌘O` |
| Command palette | `⌘P` |
| Search vault | `⌘⇧F` |
| Find in note | `⌘F` |
| Toggle reading view | `⌘E` |
| Toggle source mode | `⌘⌥E` |
| Daily note | `⌘⇧D` |
| Graph view | `⌘G` |
| Save | `⌘S` |
| Sync now | `⌘⇧S` |
| Bold / italic | `⌘B` / `⌘I` |
| Insert wikilink | `⌘K` |
| Toggle task | `⌘↵` |
| Back / forward | `⌘[` / `⌘]` |
| Close tab | `⌘W` |
| Toggle sidebars | `⌘⌥B` / `⌘⌥R` |
| Settings | `⌘,` |

Everything is also reachable through the command palette.

---

## Obsidian parity

Implemented: file explorer, Markdown + wiki links + backlinks, tags, properties, daily notes, templates, graph/local graph, canvas, search, quick switcher, command palette, split panes/tabs, themes + custom CSS, attachments, PDF/HTML export, git-based version history and sync.

Not implemented (deliberately out of scope for this build):

- A community plugin marketplace and the Obsidian plugin API (Slate is a standalone app, not a plugin host).
- Obsidian Publish / Sync services (Slate uses git instead).
- Mobile and Windows/Linux targets.
- Vim keybindings, multi-cursor, and arbitrary nested split layouts.
- Bases/databases and the newer Obsidian “Bases” table views.

---

## License

MIT. Slate is an independent project and is not affiliated with Obsidian.
