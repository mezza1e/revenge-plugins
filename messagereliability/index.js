(function () {
    const revengeApi = window.revenge || window.bunny || window.vendetta || {};
    const { metro, patcher } = revengeApi;
    const unpatches = [];

    const recoveryDebounce = {};
    const recentGuildSwitches = new Map();

    function onLoad() {
        try {
            if (!metro || !patcher) {
                console.error("[MessageReliability Mobile] Revenge API not available");
                return;
            }

            const FluxDispatcher = metro.findByProps("dispatch", "subscribe");
            const MessageActions = metro.findByProps("fetchMessages", "sendMessage");
            const MessageStore = metro.findByStoreName("MessageStore");
            const SelectedChannelStore = metro.findByStoreName("SelectedChannelStore");
            const ChannelStore = metro.findByStoreName("ChannelStore");

            function clearChannelError(chId) {
                try {
                    if (!MessageStore) return;
                    const cm = MessageStore.getMessages?.(chId);
                    if (cm && cm.error) {
                        const cacheClass = cm.constructor;
                        if (cacheClass && typeof cacheClass.commit === "function") {
                            cacheClass.commit(cm.mutate({ error: false, loadingMore: true }));
                        }
                    }
                } catch (_) {}
            }

            // 1. Hook MessageActions.fetchMessages with intelligent auto-retry and backoff
            if (MessageActions && MessageActions.fetchMessages) {
                unpatches.push(
                    patcher.instead("fetchMessages", MessageActions, async (args, orig) => {
                        const params = args[0] || {};
                        const channelId = params.channelId;
                        if (!channelId) return orig.apply(MessageActions, args);

                        // Pre-flight delay if switched to a guild in the last 200ms
                        const channel = ChannelStore?.getChannel?.(channelId);
                        const guildId = channel?.guild_id;
                        if (guildId && recentGuildSwitches.has(guildId)) {
                            const diff = Date.now() - recentGuildSwitches.get(guildId);
                            if (diff < 200) {
                                await new Promise(r => setTimeout(r, 90));
                            }
                        }

                        let attempts = 0;
                        const maxAttempts = 3;
                        let delay = 250;

                        while (attempts < maxAttempts) {
                            attempts++;
                            try {
                                const res = await orig.apply(MessageActions, args);
                                if (res !== false) {
                                    clearChannelError(channelId);
                                    return res;
                                }
                            } catch (err) {
                                console.warn("[MessageReliability Mobile] Fetch attempt " + attempts + " rejected:", err);
                            }

                            if (attempts < maxAttempts) {
                                clearChannelError(channelId);
                                await new Promise(r => setTimeout(r, delay));
                                delay = Math.min(delay * 2, 800);
                            }
                        }

                        return false;
                    })
                );
            }

            // 2. Intercept LOAD_MESSAGES_FAILURE & CHANNEL_SELECT via FluxDispatcher
            if (FluxDispatcher && typeof FluxDispatcher.subscribe === "function") {
                const failureHandler = (action) => {
                    const chId = action?.channelId;
                    if (!chId) return;

                    clearChannelError(chId);

                    const activeId = SelectedChannelStore?.getChannelId?.();
                    if (chId === activeId && !recoveryDebounce[chId]) {
                        recoveryDebounce[chId] = setTimeout(() => {
                            delete recoveryDebounce[chId];
                            if (MessageActions?.fetchMessages) {
                                MessageActions.fetchMessages({
                                    channelId: chId,
                                    limit: 50,
                                    truncate: true
                                });
                            }
                        }, 200);
                    }
                };

                const selectHandler = (action) => {
                    const gId = action?.guildId;
                    if (gId) {
                        recentGuildSwitches.set(gId, Date.now());
                        if (recentGuildSwitches.size > 20) {
                            const oldest = recentGuildSwitches.keys().next().value;
                            recentGuildSwitches.delete(oldest);
                        }
                    }
                };

                FluxDispatcher.subscribe("LOAD_MESSAGES_FAILURE", failureHandler);
                FluxDispatcher.subscribe("CHANNEL_SELECT", selectHandler);

                unpatches.push(() => {
                    FluxDispatcher.unsubscribe("LOAD_MESSAGES_FAILURE", failureHandler);
                    FluxDispatcher.unsubscribe("CHANNEL_SELECT", selectHandler);
                });
            }

            console.log("[MessageReliability Mobile] Successfully loaded and active.");
        } catch (e) {
            console.error("[MessageReliability Mobile] Error during onLoad:", e);
        }
    }

    function onUnload() {
        for (const timer of Object.values(recoveryDebounce)) {
            clearTimeout(timer);
        }
        for (const unpatch of unpatches) {
            try {
                if (typeof unpatch === "function") unpatch();
            } catch (_) {}
        }
        unpatches.length = 0;
        console.log("[MessageReliability Mobile] Unloaded.");
    }

    const plugin = { onLoad, onUnload };
    if (typeof module !== "undefined" && module.exports) {
        module.exports = plugin;
    }
    return plugin;
})();