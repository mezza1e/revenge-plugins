(function () {
    const revengeApi = window.revenge || window.bunny || window.vendetta || {};
    const { metro, patcher } = revengeApi;
    const unpatches = [];

    let recentChannels = [];
    const MAX_CHANNELS = 4;
    let idleTimer = null;

    function pruneMessages(MessageStore, currentId) {
        try {
            if (!MessageStore) return;
            const cache = MessageStore._channelMessages || MessageStore._messages;
            if (!cache || typeof cache !== "object") return;

            const allowed = new Set(recentChannels);
            if (currentId) allowed.add(currentId);

            let pruned = 0;
            for (const chId in cache) {
                if (!allowed.has(chId)) {
                    delete cache[chId];
                    pruned++;
                }
            }

            if (pruned > 0) {
                console.log(`[MemoryEngine Mobile] Pruned ${pruned} stale channels from Hermes memory.`);
            }
        } catch (e) {
            console.warn("[MemoryEngine Mobile] Prune warning:", e);
        }
    }

    function triggerMobileCleanup() {
        try {
            // Hermes GC if available
            if (typeof global.gc === "function") {
                global.gc();
            }
            // Clear React Native image memory cache
            const { Image } = metro.findByProps("Image") || {};
            if (Image && typeof Image.clearMemoryCache === "function") {
                Image.clearMemoryCache();
            }
        } catch (_) {}
    }

    function onLoad() {
        try {
            if (!metro || !patcher) {
                console.error("[MemoryEngine Mobile] Revenge/Vendetta API not available");
                return;
            }

            const SelectedChannelStore = metro.findByStoreName("SelectedChannelStore");
            const MessageStore = metro.findByStoreName("MessageStore");

            // 1. Hook channel changes to maintain bounded LRU memory
            if (SelectedChannelStore && SelectedChannelStore.addChangeListener) {
                const listener = () => {
                    const currentId = SelectedChannelStore.getChannelId?.();
                    if (!currentId) return;

                    recentChannels = recentChannels.filter(id => id !== currentId);
                    recentChannels.unshift(currentId);
                    if (recentChannels.length > MAX_CHANNELS) {
                        recentChannels.length = MAX_CHANNELS;
                    }

                    // Settle timer: prune stale messages 2s after switching
                    if (idleTimer) clearTimeout(idleTimer);
                    idleTimer = setTimeout(() => {
                        pruneMessages(MessageStore, currentId);
                        triggerMobileCleanup();
                    }, 2000);
                };

                SelectedChannelStore.addChangeListener(listener);
                unpatches.push(() => SelectedChannelStore.removeChangeListener(listener));
            }

            // 2. Patch FlatList / List components to enforce view virtualization
            const FlatList = metro.findByProps("FlatList")?.FlatList || metro.findByName("FlatList", false);
            if (FlatList && FlatList.render) {
                unpatches.push(
                    patcher.before("render", FlatList, (args) => {
                        const props = args[0];
                        if (props && typeof props === "object") {
                            // Enforce clipped subviews unmounting to prevent out-of-memory crashes
                            props.removeClippedSubviews = true;
                            if (!props.windowSize || props.windowSize > 7) {
                                props.windowSize = 5;
                            }
                        }
                    })
                );
            }

            console.log("[MemoryEngine Mobile] Successfully loaded and optimizing Hermes/React Native.");
        } catch (e) {
            console.error("[MemoryEngine Mobile] Error during onLoad:", e);
        }
    }

    function onUnload() {
        if (idleTimer) clearTimeout(idleTimer);
        for (const unpatch of unpatches) {
            try {
                if (typeof unpatch === "function") unpatch();
            } catch (_) {}
        }
        unpatches.length = 0;
        console.log("[MemoryEngine Mobile] Unloaded.");
    }

    const plugin = { onLoad, onUnload };
    if (typeof module !== "undefined" && module.exports) {
        module.exports = plugin;
    }
    return plugin;
})();
