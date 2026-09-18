# Revengecord Plugins by mezza1e (v4.0.0)

Clean, high-performance mobile ports of essential Discord desktop plugins for **Revengecord / Vendetta / Bunny**.

All memory engines, media prefetchers, and predictive warmers have been **abolished**. Only the requested core plugins are featured.

---

## 🚀 Quick Install: All-in-One Master Suite

Features **RemoveBlockedUsers**, **HideBlockedInSettings**, and **BypassBlockedOrIgnored** combined in a single lightweight plugin.

In Revengecord mobile app, go to **Settings > Plugins > Install Plugin** and paste:

```text
https://cdn.jsdelivr.net/gh/mezza1e/revenge-plugins@4.0.0/
```

*(Alternative GitHub Pages URL: `https://mezza1e.github.io/revenge-plugins/`)*

> [!IMPORTANT]
> **Do not append `/index.js` or `manifest.json` to the URL!**
> Revengecord requires the base directory URL ending in `/`.

---

## 📦 Individual Plugin URLs

If you prefer installing each feature as an independent plugin matching your desktop setup:

### 1. RemoveBlockedUsers (v1.8.1)
*Parity with DevilBro's RemoveBlockedUsers*
* Removes blocked & ignored messages completely from chat.
* Eliminates the collapsed "X blocked messages" bar.
* Prunes orphaned date dividers.
* Strips reply quotes and mentions of blocked users.
* Hides blocked users from channel and guild member lists with exact group count decrements.
* Suppresses typing indicators and presence.

```text
https://cdn.jsdelivr.net/gh/mezza1e/revenge-plugins@4.0.0/removeblockedusers/
```

---

### 2. HideBlockedInSettings (v1.3.0)
*Parity with Antigravity's HideBlockedInSettings*
* Hides "Blocked Accounts" and "Ignored Accounts" sections from all Settings tabs and forms.
* Hides the "Blocked" tab from the Friends navigation list.
* Returns empty arrays for settings relationship queries.

```text
https://cdn.jsdelivr.net/gh/mezza1e/revenge-plugins@4.0.0/hideblockedinsettings/
```

---

### 3. BypassBlockedOrIgnored (v1.0.12)
*Parity with nicola02nb's BypassBlockedOrIgnored*
* Bypasses the blocked/ignored user confirmation warning modal when joining a voice channel.
* Suppresses the warning popup when a blocked or ignored user joins your active voice channel.

```text
https://cdn.jsdelivr.net/gh/mezza1e/revenge-plugins@4.0.0/bypassblockedorignored/
```

---

## 🗑️ Abolished Features
The following experimental features have been completely removed from this repository:
- **DiscordMemoryEngine**: Abolished.
- **DiscordMessageReliability**: Abolished.
- Media prefetching & background warming: Abolished.
- FlatList virtualization overrides: Abolished.
