# Your models, inside CyMalika

## Start with an existing installation

1. Open **Models & downloads** beside the model picker.
2. Open **Installed models**. If needed, choose **Local engine**, connect to `http://localhost:11434`, and choose **Connect**.
3. Choose **Use this model**. Return to chat and describe a task.

Existing model files and services stay in place. Switching a model does not erase your chats. The selected model receives the conversation and any project/tool context needed for the task.

## Start without Ollama

1. Open **Local engine → Install local engine**.
2. Review the official runtime version, download size and SHA-256 digest. Choose **Install this engine**.
3. Wait for the download and verification, then choose **Start local engine**.
4. Open **Get models**, enter an Ollama model ID and choose **Find model**.
5. Review the model ID, license and available disk/RAM, then choose **Download this model**.
6. Wait for the engine to confirm the model is installed. Open **Installed models → Use this model**.

CyMalika installs the official runtime in its own data folder and starts it on `127.0.0.1:11435`. No administrator service is installed. The first runtime/model download requires internet access. Model downloads can be large; cancel them in the progress card and download the same ID again to resume the engine’s cached layers. Engine package downloads restart rather than resume. CyMalika stops only the engine it started when exiting. Model files remain on disk.

The current managed Ollama runtime requires macOS 14 or newer. CyMalika can still connect to an existing compatible API on macOS 13. Windows currently packages the x64 runtime. Linux extraction needs `tar` and `zstd`; the Debian package declares zstd. GPU drivers, optional AMD runtime packages and unsupported OS architectures are not installed automatically. Existing external runtimes or compatible APIs can be used instead.

## Find a model and understand its requirements

1. Open **Get models → Hugging Face · all formats**.
2. Search a name, enter `owner/model`, or paste the model’s Hugging Face URL. Search is not restricted to GGUF; use **Show more results** or a more specific name to narrow the public directory.
3. Choose **Requirements & ways to run**. Exact repository links open requirements directly.
4. Review the format, task, architecture, quantization, reported weight size, local RAM/disk and access/license requirements. Unknown metadata is shown as unknown. File sizes are not promises about usable RAM/VRAM, speed, architecture or tool support. Multiple checkpoint variants may inflate the repository total.
5. For a public GGUF repository with an identifiable quantization, choose **Review Ollama download**. No download starts until you confirm the separate review. Gated/private models need provider-side authentication and license approval.
6. For Safetensors, MLX, adapters or another format, read the model card and choose **Set up a runtime connection**. An adapter needs its compatible base model. An image, embedding or audio model is not automatically a chat agent.

Browsing requirements reads metadata and, when requested, the model card only. It never downloads weights, executes repository code, replaces a model or starts a runtime. Repository availability does not guarantee an installed runtime supports its architecture. The Ollama downloader still handles Ollama IDs and supported GGUF repositories; it does not convert arbitrary checkpoints.

A model larger than your Mac’s total RAM may require another checkpoint or remote hardware. For example, a roughly 510 GB FP8 checkpoint cannot fit in a 24 GiB Mac’s memory. A normal CPU VPS is not a practical substitute for a suitable GPU inference server. Check architecture/quantization support, GPU memory, context overhead and disk capacity before renting anything. A publisher’s example GPU count is not a capacity guarantee for arbitrary GPU sizes.

## Several models

Install as many models as disk space permits. **Use this model** switches the active chat model. **Keep loaded** requests residency in memory; **Unload from memory** releases it without removing the download. The engine controls residency based on RAM/VRAM and its own configuration. Keeping multiple large models loaded can exhaust memory or slow tasks.

For engines started by CyMalika, **Maximum loaded models** is set before starting. Existing external engines keep their own settings. In **Settings → Agent controls**, choose how long Ollama should keep a model loaded after a response. Separate model files, process memory and GPU memory are different measurements. A larger context also uses more memory. CyMalika does not run a multi-agent ensemble automatically.

## Connect another runtime or a remote model server

1. Start your chosen runtime separately with a compatible chat model. CyMalika’s built-in runtime installer manages Ollama only; the other runtimes are connected, not installed or launched automatically.
2. Open **Connections** and select **LM Studio**, **llama.cpp**, **MLX-LM**, **vLLM**, **SGLang**, **Hugging Face TGI**, or **Other / hosted OpenAI-compatible API**.
3. Enter the API base URL (usually ending in `/v1`) and optional API key. Preset ports are examples, not automatic discovery. Use the actual port your server reports. Use HTTPS for remote servers or a private SSH tunnel ending on localhost; do not publish an unauthenticated inference port.
4. Choose **Check connection & list models**. This sends only a model-list request. It does not load/download weights or send your project/chat. It verifies the API response, not chat, tool calls or full model readiness.
5. Select a model reported by the server, or type its exact served ID. Give the connection a name and choose **Save connection**. This preserves the active model.
6. Choose **Use connection** when ready. Test a small chat and a disposable coding task with review before trusting tool use. Runtime versions, parsers and model capabilities determine reliability. API providers may charge for usage.

The **Installed models** tab lists models reported by the active non-Ollama API. Loading, unloading, downloading and GPU scheduling for those models remain with their runtime. Ollama’s own installed shelf retains its local controls. Anthropic configurations remain available through **Advanced connection settings**.

API keys are session-only and associated with provider/endpoint. Editing the connection URL or choosing another runtime clears the new-connection key field. Keys are not included in saved profiles, chat exports or model downloads. Saving a profile does not switch the selected model, assistant name, theme or project. Remote APIs receive context only when you use them for a task.

## Name your assistant

Open **Settings → Appearance → Your assistant’s name**, enter a name and save. The sidebar, streamed replies, saved-reply labels and identity instructions use it. A model can still ignore instructions; changing the name does not retrain it. The installed application and publisher remain CyMalika. Model connections do not overwrite your chosen name, theme or workspace settings.

## Remove a model

Choose **Remove download**, type the exact model ID and confirm. This asks the selected local engine to delete that model. Chats remain. Shared layers used by other models may stay on disk. Removing a saved connection only removes its preset, not its model files.
