# ⚡ Red Rain

**Red Rain** is a rebrand and enhancement fork of **Visual Studio Code 1.145.2 (stable)** —
same VS Code DNA (IntelliSense, extensions, remote, settings sync machinery), a storm-grade
identity on top: cracked-glass neon branding, a Modern-UI glassmorphism layer, a synthesized
typing-sound engine, live background effects, a full **Customization Center**, and a built-in
**AI Workstation**.

> Built on top of MIT-licensed VS Code source. License (MIT) and ThirdPartyNotices are preserved.

---

## What's inside (fork changes)

### Branding
- `product.json` fully rebranded: name **Red Rain**, binary `redrain`, data folder `.redrain`,
  protocol `redrain://`, new Windows GUIDs / AppUserModelID / bundle identifiers.
- All icons replaced with the Red Rain cracked-glass mark: `resources/win32/code.ico`,
  start-menu tiles, **Inno installer wizard bitmaps**, `resources/darwin/code.icns`,
  Linux/server PNGs, favicon, appx logos, and the in-app titlebar SVG mark.
- Start menu tile manifest renamed ("Red Rain").

### Theme — "Red Rain Storm"
- The default dark theme (settings id `Dark 2026` → `Red Rain Storm`) is recolored:
  near-black green-tinted surfaces, neon-green accent `#3bf58c`, glowing tab tops,
  translucent chrome (`#RRGGBBAA`) so the frosted-glass layers breathe.
- 83 color keys overridden + 16 added on top of the Dark Modern include chain
  (syntax colors stay VS Code-quality via `dark_plus.json`).

### Glassmorphism
- VS Code 1.145's native **Modern UI** (floating rounded panels, connected tabs) and
  **frosted glass** (`workbench.modernUIFrostedGlass`) are on by default.
- New `src/vs/workbench/browser/media/redrain.css` adds the Red Rain layer on top:
  aurora window background, titlebar/statusbar light seams, glowing active tabs,
  accent-glow buttons, command-center glow, slender glass scrollbars — all
  reduced-transparency aware.
- On **Windows 11**, set `window.backgroundMaterial` to `acrylic` for true
  see-through-desktop glass behind the translucent chrome.

### Typing engine (`src/vs/editor/contrib/redrain/`)
- Pure **WebAudio synthesized keystroke sounds** (zero audio assets):
  **rain drops** (default), mechanical, typewriter (ding on Enter), bubble, silent.
- Humanized pitch variance; softer space/backspace; distinct Enter character.
- **Keystroke FX** at the caret: rain streaks, sparks, stars (Web Animations API,
  global particle cap, paused when hidden).
- Toggle: **Ctrl+Alt+R** or the status bar `Rain On/Off` chip.

### Live backgrounds (`src/vs/workbench/contrib/redrain/`)
- Behind-the-editor canvas: **rain / particles / aurora / stars**, 30 fps capped,
  paused when hidden, opacity + speed + accent configurable.
- Optional **wallpaper image** behind translucent editor surfaces.
- Accent color drives FX + CSS variables live.
- Registers the `redrain.*` settings section, the status bar chip, and the
  **Red Rain: Open Customization Center** command (**Ctrl+Alt+U**).

### Customization Center (built-in extension `extensions/redrain-customizer`)
Glass webview with live preview:
- Accent presets (Storm Green, Crimson Rain, Midnight Violet, Ice Blue, Electric Gold,
  Neon Rose) + custom color picker.
- Frosted glass on/off + opacity slider.
- Background effect / opacity / speed / editor translucency / wallpaper picker.
- Typing sound pack / volume / keystroke FX.
- **Profile export/import** — the whole look as one JSON file.

### AI Workstation (built-in extension `extensions/redrain-ai`)
Activity-bar ⚡ panel with streaming chat:
- **Providers:** OpenAI, Anthropic Claude, Google Gemini, Ollama (local),
  and any **OpenAI-compatible** endpoint (DeepSeek, Groq, LM Studio…) via base URL.
- API keys stored in **SecretStorage** (OS keychain), never in plain settings.
- Attach active file/selection as context (toggleable).
- Code blocks get **Insert / New file / Copy** buttons.
- Quick actions on selection: Explain, Refactor, Add Comments, Generate Tests.
- Per-provider: model id (with suggestions), base URL override, temperature,
  max tokens, system prompt, "Test connection".

---

## Building the Windows executable

### Option A — one click (GitHub Actions)
1. Push this folder to a GitHub repository.
2. Open **Actions → "Red Rain — Windows Build" → Run workflow**.
3. Download artifacts: `Red-Rain-win32-x64-portable` (zip, run `RedRain*.exe`) and
   `Red-Rain-win32-x64-setup` (the Inno installer .exe).

### Option B — on your Windows machine
Requirements: **Node.js 24.22+** (see `.nvmrc`), git, ~10 GB free disk.

```cmd
scripts\redrain-build-win.cmd
```

Outputs:
- `..\VSCode-win32-x64\` — portable build (run the exe directly)
- `.build\win32-x64\` — the setup installer produced with the bundled Inno Setup compiler

### Option C — dev loop
```cmd
npm ci
npm run gulp -- vscode-win32-x64          :: package
npm run gulp -- vscode-win32-x64-user-setup :: installer
```
Note: the repo's tooling is npm-based (yarn is explicitly rejected by `preinstall`).

---

## Using Red Rain

| Thing | Where |
| --- | --- |
| Customization Center | `Ctrl+Alt+U` or Command Palette → "Red Rain: Customization Center" |
| Toggle typing sound | `Ctrl+Alt+R` or the status bar chip |
| AI Workstation | ⚡ icon in the activity bar; right-click selection → Red Rain AI actions |
| Frosted glass | `workbench.modernUIFrostedGlass` (on by default) |
| Windows 11 acrylic | set `window.backgroundMaterial: "acrylic"` |
| Themes | Command Palette → "Color Theme" → **Red Rain Storm** (default) |

Settings live under the `redrain.*` namespace — every knob in the Customization Center
maps 1:1 to a `redrain.*` setting, so you can also sync them via Settings Sync.

## Honest notes

- The fork is validated by transpile/bundle checks of every changed module and JSON
  integrity. Run the full typecheck (`npm run typecheck-client`) and packaging on a
  machine with ≥8 GB RAM — the CI workflow does this automatically.
- The AI Workstation sends only what you attach (active file/selection) to the provider
  you configure. Nothing ships without your own API key or a local Ollama.
- Terminal, debugging, remote development, and the extension marketplace behave exactly
  as in the VS Code OSS source you started from.
