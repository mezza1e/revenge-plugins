# Revengecord Plugins by mezza1e (v4.5.0)

Clean, high-performance mobile ports of essential Discord desktop plugins for **Revengecord / Vendetta / Bunny**.

All memory engines, media prefetchers, and predictive warmers have been **abolished**. Only the requested core plugins are featured.

---

## 🚀 Quick Install: All-in-One Master Suite

Features **RemoveBlockedUsers**, **HideBlockedInSettings**, and **BypassBlockedOrIgnored** combined in a single lightweight plugin.

In Revengecord mobile app:
1. Go to **Settings > Plugins**.
2. **Delete the old version** of the plugin if previously installed (to clear any disabled/cached state).
3. Tap **Install Plugin** (+) and paste:

```text
https://cdn.jsdelivr.net/gh/mezza1e/revenge-plugins@4.5.0/
```

*(Alternative GitHub Pages URL: `https://mezza1e.github.io/revenge-plugins/`)*

> [!IMPORTANT]
> **Do not append `/index.js` or `manifest.json` to the URL!**
> Revengecord requires the base directory URL ending in `/`.

---

## 📦 Individual Plugin URLs

If you prefer installing each feature as an independent plugin matching your desktop setup:

### 1. HideBlockedInSettings (v1.5.3)
*Parity with Antigravity's HideBlockedInSettings*
* Hides "Accounts you've blocked or ignored" section header from **Content & Social** settings.
* Hides "Blocked accounts" and "Ignored accounts" rows.
* Hides the feature guide disclaimer note ("You're in control. To compare your options...").
* Hides the "Blocked" tab from the Friends navigation list.
* Supports React.forwardRef and React.memo component patching.

```text
https://cdn.jsdelivr.net/gh/mezza1e/revenge-plugins@4.5.0/hideblockedinsettings/
```

---

### 2. RemoveBlockedUsers (v1.8.4)
*Parity with DevilBro's RemoveBlockedUsers*
* Removes blocked & ignored messages completely from chat.
* Eliminates the collapsed "X blocked messages" bar.
* Prunes orphaned date dividers.
* Strips reply quotes and mentions of blocked users.
* Hides blocked users from channel and guild member lists with DevilBro 80-line exact group count decrements.
* Suppresses typing indicators and presence.

```text
https://cdn.jsdelivr.net/gh/mezza1e/revenge-plugins@4.5.0/removeblockedusers/
```

---

### 3. BypassBlockedOrIgnored (v1.0.15)
*Parity with nicola02nb's BypassBlockedOrIgnored*
* Bypasses the blocked/ignored user confirmation warning modal when joining a voice channel.
* Suppresses the warning popup when a blocked or ignored user joins your active voice channel.

```text
https://cdn.jsdelivr.net/gh/mezza1e/revenge-plugins@4.5.0/bypassblockedorignored/
```
