# Revengecord Plugins by mezza1e

High-performance, memory-optimized, and error-resilient plugins for Discord Mobile on Revengecord.

## 🚀 Quick Install (All-in-One Master Suite)

In the Revengecord mobile app, open **Settings > Plugins > Install Plugin** and paste this exact URL:

```text
https://cdn.jsdelivr.net/gh/mezza1e/revenge-plugins@3.0.1/
```

*(Alternative GitHub Pages URL: `https://mezza1e.github.io/revenge-plugins/`)*

> [!IMPORTANT]
> **Do not append `/index.js` or `manifest.json` to the URL!**
> Revengecord requires the base directory URL ending in `/`. It automatically fetches `manifest.json` and then loads the plugin code.

### Included Features:
1. **ByeBlocked**: 100% elimination of blocked user messages, collapsed bars, typing indicators, reactions, and settings listings.
2. **DiscordMemoryEngine**: LRU message cache bounds (4 channels max) + FlatList view virtualization.
3. **DiscordMessageReliability**: Eliminates "Messages failed to load" errors via automatic retry, pre-flight gateway sync, and silent Flux auto-recovery.

---

## 📦 Individual Plugin URLs

If you prefer installing features separately:

* **ByeBlocked Only:**
  `https://cdn.jsdelivr.net/gh/mezza1e/revenge-plugins@3.0.1/byeblocked/`

* **MemoryEngine Only:**
  `https://cdn.jsdelivr.net/gh/mezza1e/revenge-plugins@3.0.1/memoryengine/`

* **MessageReliability Only:**
  `https://cdn.jsdelivr.net/gh/mezza1e/revenge-plugins@3.0.1/messagereliability/`


