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

## Hugging Face

Choose **Hugging Face · public GGUF** under **Get models**, search, and open a model card. Choose a quantization the repository actually provides, then review the download. You can also enter `hf.co/owner/repository-GGUF:Q4_K_M` as an Ollama model ID.

Only formats supported by the selected runtime work locally. This path supports GGUF repositories, not arbitrary Safetensors weights, Python model code or every Hugging Face architecture. Gated/private repositories require the account access configured with Ollama/Hugging Face; CyMalika does not accept terms or bypass gates. Review the publisher’s license yourself. See [Hugging Face’s Ollama integration](https://huggingface.co/docs/hub/en/ollama) and [Ollama’s pull API](https://docs.ollama.com/api/pull).

## Several models

Install as many models as disk space permits. **Use this model** switches the active chat model. **Keep loaded** requests residency in memory; **Unload from memory** releases it without removing the download. The engine controls residency based on RAM/VRAM and its own configuration. Keeping multiple large models loaded can exhaust memory or slow tasks.

For engines started by CyMalika, **Maximum loaded models** is set before starting. Existing external engines keep their own settings. In **Settings → Agent controls**, choose how long Ollama should keep a model loaded after a response. Separate model files, process memory and GPU memory are different measurements. A larger context also uses more memory. CyMalika does not run a multi-agent ensemble automatically.

## Other engines and cloud APIs

Under **Connections**, save the current provider, endpoint, model and generation settings. Edit a connection in Settings, then save another name. Switch saved connections from the chat header. LM Studio, llama.cpp and vLLM can be connected when they expose an OpenAI-compatible API. Anthropic and other compatible hosted services remain available. These engines/services are not automatically installed by the Ollama runtime installer.

API keys are session-only and associated with provider/endpoint. Changing a URL clears the key field so a credential is not accidentally sent to another server. Keys are not included in saved profiles, chat exports or model downloads. Remote APIs receive the context you send them and may charge for usage.

## Name your assistant

Open **Settings → Appearance → Your assistant’s name**, enter a name and save. The sidebar, streamed replies, saved-reply labels and identity instructions use it. A model can still ignore instructions; changing the name does not retrain it. The installed application and publisher remain CyMalika. Model connections do not overwrite your chosen name, theme or workspace settings.

## Remove a model

Choose **Remove download**, type the exact model ID and confirm. This asks the selected local engine to delete that model. Chats remain. Shared layers used by other models may stay on disk. Removing a saved connection only removes its preset, not its model files.
