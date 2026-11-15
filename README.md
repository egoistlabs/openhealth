# Pedro

A local-LLM companion for astronauts on long missions, built for the NASA Space Apps Challenge 2026.

The spec is still being locked. Until it lands in `docs/`, this repo is the place to collect everyone's work.

## Tech Stack

- **Frontend:** Next.js
- **AI Runtime:** Ollama, or the Anthropic Claude API
- **AI Model:** MedGemma 4B locally, or a Claude model
- **Architecture:** Local inference by default, with an opt-in cloud mode

## Where things go

| Folder | What belongs there |
| --- | --- |
| `context/` | Raw material: research, notes, references, meeting notes, challenge info. Unpolished is fine. |
| `docs/product/` | What we are building and why: scope, users, features, demo script. |
| `docs/design/` | How it looks and feels: flows, wireframes, mockups, brand, copy. |
| `docs/tech-spec/` | How it is built: architecture, data model, model setup, decisions. |

Code will live at the repo root (for example `app/`) once the spec is locked.

## Prerequisites

Before running Pedro, make sure you have:

- [Node.js](https://nodejs.org/) installed.
- [pnpm](https://pnpm.io/installation) installed.
- [Ollama](https://ollama.com/download) installed for the default local mode, or an `ANTHROPIC_API_KEY` for cloud mode.
- At least 8 GB of system RAM recommended for experimenting with the 4B model. More available memory is preferable.

## Setting Up Ollama

Ollama runs MedGemma locally on your machine. You do not need Python, Docker, or a separate AI backend to run the model.

### 1. Install Ollama

Choose your operating system.

**macOS**

Option A: Download the application.

1. Visit [Ollama Downloads](https://ollama.com/download).
2. Download the macOS version.
3. Open the downloaded `.dmg` file.
4. Drag Ollama into your Applications folder.
5. Open Ollama and allow it to run in the background.

Option B: Install using Terminal.

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Verify the installation:

```bash
ollama --version
```

**Windows**

Option A: Download the installer.

1. Visit [Ollama Downloads](https://ollama.com/download).
2. Download the Windows installer.
3. Run `OllamaSetup.exe`.
4. Follow the installation instructions.
5. Open Ollama from the Start Menu.

Option B: Install using PowerShell.

```powershell
irm https://ollama.com/install.ps1 | iex
```

Verify the installation by opening PowerShell:

```powershell
ollama --version
```

### 2. Download MedGemma 4B

Once Ollama is installed, open your Terminal (macOS) or PowerShell (Windows).

Run:

```bash
ollama pull medgemma:4b
```

This downloads the MedGemma 4B model to your local machine.

**Model information:**

| Property | Value |
| --- | --- |
| Model | MedGemma |
| Parameters | 4B |
| Quantization | Q4_K_M |
| Download size | Approximately 3.3 GB |
| Context window | 128K |
| Capabilities | Text and image understanding |

Model reference: https://ollama.com/library/medgemma:4b

### 3. Run MedGemma

After downloading the model, start it:

```bash
ollama run medgemma:4b
```

You should now be able to interact with MedGemma directly from your terminal.

Try sending a message:

```text
Hello! Introduce yourself as an AI companion for astronauts.
```

To exit the interactive session:

```text
/bye
```

### 4. Verify Ollama is Running

Ollama normally runs automatically in the background after launching its desktop application.

To check downloaded models:

```bash
ollama list
```

To check currently running models:

```bash
ollama ps
```

To check whether the local API is responding:

```bash
curl http://localhost:11434/api/tags
```

If Ollama is not running, start the server manually:

```bash
ollama serve
```

Keep this terminal window open while using the application.

**Important:** If Ollama is already running as a background service, you do not need to execute `ollama serve` again.

**Optional, for faster replies:** give Ollama two parallel slots. Each message gets two model calls, the AI safety label and then the reply. With one slot, each call pushes the other's prompt out of Ollama's cache, so every safety label is processed from scratch: a few extra seconds on an M-series Mac, about 35 seconds on a Ryzen 5 7535U laptop running the model on its CPU. Pedro works either way.

`OLLAMA_NUM_PARALLEL` is a setting of the Ollama server, not of Pedro, so it goes on Ollama, not in `web/.env`. Set it before Ollama starts; whether Ollama or Next.js starts first doesn't matter.

- **Ollama started from a terminal:** stop it, then run `OLLAMA_NUM_PARALLEL=2 ollama serve`.
- **Ollama Mac app (menu-bar icon):** run `launchctl setenv OLLAMA_NUM_PARALLEL 2`, then quit Ollama from the menu bar and open it again. Repeat after a reboot.

## Running Pedro

Once Ollama and MedGemma are ready, you can start the Next.js application.

### 1. Clone the Repository

```bash
git clone <repository-url>
```

Navigate into the project:

```bash
cd openhealth
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Configure Environment Variables

Create a `.env` file inside `web/` (Next.js runs from that folder, so a root-level `.env` is not read):

```env
LOCAL_LLM=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=medgemma:4b
```

Optional safety-check settings:

| Variable | Default | What it does |
| --- | --- | --- |
| `SAFETY_CLASSIFIER` | on | Set to `0` to turn off the model's safety label and use the keyword checks only |
| `SAFETY_CLASSIFIER_TIMEOUT_MS` | `60000` | How long to wait for the safety label before the keyword checks decide alone |

`web/.env` is git-ignored. `web/.env.example` lists every setting with its default: `cp web/.env.example web/.env`.

#### Switching between Ollama and Claude

`LOCAL_LLM` chooses the provider. Both paths use the same pipeline, prompts, safety checks and evals:

| `LOCAL_LLM` | Provider | Model | Needs |
| --- | --- | --- | --- |
| `true` (default) | Ollama on this machine | `OLLAMA_MODEL`, default `medgemma:4b` | Ollama running |
| `false` | Anthropic Claude API | `ANTHROPIC_MODEL`, default `claude-sonnet-5` | `ANTHROPIC_API_KEY` |

For the cloud path, add:

```env
LOCAL_LLM=false
ANTHROPIC_API_KEY=your-key-here
ANTHROPIC_MODEL=claude-sonnet-5
```

Unset `LOCAL_LLM` means `true`, so existing local setups keep working unchanged. There is no silent fallback: if `LOCAL_LLM=false` and the key is missing, the request fails with a clear error instead of quietly using Ollama.

Restart the dev server after changing `.env`; the values are read at startup.

**Privacy:** with `LOCAL_LLM=false`, the question, chat history, the person's numbers and the selected brain excerpts are sent to the Anthropic API, and so is each message for the model's safety label. The keyword safety checks and the answer audits still run locally in code, but inference no longer stays on the machine. The default local mode sends nothing off the machine.

### 4. Start the Development Server

```bash
pnpm dev
```

Open your browser:

```text
http://localhost:3000
```

Make sure Ollama is running before testing AI conversations.

## Connecting Next.js to Ollama

Pedro communicates with Ollama through its local REST API in the default mode. When `LOCAL_LLM=false`, the same pipeline calls the Anthropic API instead; see [Switching between Ollama and Claude](#switching-between-ollama-and-claude).

**Chat endpoint:**

```text
POST http://localhost:11434/api/chat
```

Example request:

```json
{
  "model": "medgemma:4b",
  "messages": [
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ],
  "stream": false
}
```

For the application, requests should go through Next.js API routes or server-side code rather than directly from browser components.

This keeps the Ollama connection on the server side and avoids exposing unnecessary backend configuration.

Official API documentation: https://docs.ollama.com/api

## Useful Ollama Commands

| Command | Description |
| --- | --- |
| `ollama --version` | Check Ollama version |
| `ollama list` | List downloaded models |
| `ollama pull medgemma:4b` | Download MedGemma 4B |
| `ollama run medgemma:4b` | Start an interactive session |
| `ollama ps` | Show running models |
| `ollama stop medgemma:4b` | Stop the running model |
| `ollama serve` | Start the Ollama server |

## Troubleshooting

**Ollama is not recognized as a command**

- Make sure Ollama is installed.
- Restart your terminal after installation.
- On Windows, verify that Ollama is available in your system PATH.

**Cannot connect to localhost:11434**

- Make sure the Ollama desktop application is running.
- Try starting the server using `ollama serve` if it is not already running.
- Check whether port `11434` is being used by another application.

**MedGemma is not found**

Run:

```bash
ollama pull medgemma:4b
```

**The model responds slowly**

- Close unnecessary applications.
- Make sure sufficient system memory is available.
- Avoid running multiple large models simultaneously.

## Important Notes

- Pedro runs AI inference locally through Ollama by default.
- No external LLM API key is required for the default setup.
- Setting `LOCAL_LLM=false` switches inference to the Anthropic Claude API and sends prompt data off the machine.
- Model performance depends on the machine's available RAM and hardware acceleration.

## Adding Your Work

1. Put the file in the folder that fits. If unsure, use `context/`.
2. Name it in lowercase with hyphens, for example `sleep-research-notes.md`.
3. Prefer Markdown. Images, PDFs and exports are fine too. For Figma or Google Docs, add a short `.md` file with the link and a one-line summary.
4. Commit straight to `main`. Small, frequent commits are better than one big dump.

Do not commit secrets, API keys, or personal data.