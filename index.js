(function () {
    const revengeApi = window.revenge || window.bunny || window.vendetta || {};
    const { metro, patcher } = revengeApi;
    const unpatches = [];

    // --- MODULE 1: MEMORY ENGINE STATE ---
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
                console.log("[MasterSuite Mobile] Pruned " + pruned + " channels from memory.");
            }
        } catch (e) {
            console.warn("[MasterSuite Mobile] Prune warning:", e);
        }
    }

    function triggerMobileCleanup() {
        try {
            if (typeof global.gc === "function") global.gc();
            const { Image } = metro.findByProps("Image") || {};
            if (Image && typeof Image.clearMemoryCache === "function") {
                Image.clearMemoryCache();
            }
        } catch (_) {}
    }

    // --- MODULE 2: MESSAGE RELIABILITY STATE ---
    const recoveryDebounce = {};
    const recentGuildSwitches = new Map();

    function onLoad() {
        try {
            if (!metro || !patcher) {
                console.error("[MasterSuite Mobile] Revenge API not available");
                return;
            }

            const RelationshipStore = metro.findByStoreName("RelationshipStore");
            const FluxDispatcher = metro.findByProps("dispatch", "subscribe");
            const MessageActions = metro.findByProps("fetchMessages", "sendMessage");
            const MessageStore = metro.findByStoreName("MessageStore");
            const SelectedChannelStore = metro.findByStoreName("SelectedChannelStore");
            const ChannelStore = metro.findByStoreName("ChannelStore");

            // ==========================================
            // FEATURE 1: 100% BYEBLOCKED
            // ==========================================
            const isBlockedOrIgnored = (userId) => {
                if (!userId || !RelationshipStore) return false;
                try {
                    return RelationshipStore.isBlocked(userId) || (RelationshipStore.isIgnored && RelationshipStore.isIgnored(userId));
                } catch (_) {
                    return false;
                }
            };

            // Filter blocked messages on mobile
            if (MessageStore && MessageStore.getMessages) {
                unpatches.push(
                    patcher.after("getMessages", MessageStore, (args, res) => {
                        if (!res) return res;
                        try {
                            const filterFn = (m) => m && m.author && !isBlockedOrIgnored(m.author.id);
                            if (Array.isArray(res._array)) {
                                res._array = res._array.filter(filterFn);
                            } else if (Array.isArray(res)) {
                                return res.filter(filterFn);
                            }
                        } catch (_) {}
                        return res;
                    })
                );
            }

            // Suppress typing indicators for blocked users
            const TypingStore = metro.findByStoreName("TypingStore");
            if (TypingStore && TypingStore.getTypingUsers) {
                unpatches.push(
                    patcher.after("getTypingUsers", TypingStore, (args, res) => {
                        if (!res || typeof res !== "object") return res;
                        const filtered = {};
                        for (const userId in res) {
                            if (!isBlockedOrIgnored(userId)) {
                                filtered[userId] = res[userId];
                            }
                        }
                        return filtered;
                    })
                );
            }

            // Suppress blocked users in settings / lists
            if (RelationshipStore && RelationshipStore.getBlockedUserIds) {
                unpatches.push(
                    patcher.after("getBlockedUserIds", RelationshipStore, () => [])
                );
            }

            // ==========================================
            // FEATURE 2: MEMORY OPTIMIZATION & VIRTUALIZATION
            // ==========================================
            if (SelectedChannelStore && SelectedChannelStore.addChangeListener) {
                const memoryListener = () => {
                    const currentId = SelectedChannelStore.getChannelId?.();
                    if (!currentId) return;

                    recentChannels = recentChannels.filter(id => id !== currentId);
                    recentChannels.unshift(currentId);
                    if (recentChannels.length > MAX_CHANNELS) {
                        recentChannels.length = MAX_CHANNELS;
                    }

                    if (idleTimer) clearTimeout(idleTimer);
                    idleTimer = setTimeout(() => {
                        pruneMessages(MessageStore, currentId);
                        triggerMobileCleanup();
                    }, 2000);
                };
                SelectedChannelStore.addChangeListener(memoryListener);
                unpatches.push(() => SelectedChannelStore.removeChangeListener(memoryListener));
            }

            const FlatList = metro.findByProps("FlatList")?.FlatList || metro.findByName("FlatList", false);
            if (FlatList && FlatList.render) {
                unpatches.push(
                    patcher.before("render", FlatList, (args) => {
                        const props = args[0];
                        if (props && typeof props === "object") {
                            props.removeClippedSubviews = true;
                            if (!props.windowSize || props.windowSize > 7) {
                                props.windowSize = 5;
                            }
                        }
                    })
                );
            }

            // ==========================================
            // FEATURE 3: MESSAGE RELIABILITY & ERROR AUTO-HEALING
            // ==========================================
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

            if (MessageActions && MessageActions.fetchMessages) {
                unpatches.push(
                    patcher.instead("fetchMessages", MessageActions, async (args, orig) => {
                        const params = args[0] || {};
                        const channelId = params.channelId;
                        if (!channelId) return orig.apply(MessageActions, args);

                        // Pre-flight permission synchronization delay
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
                                console.warn("[MasterSuite Mobile] Fetch attempt " + attempts + " rejected:", err);
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

            console.log("[MasterSuite Mobile] Antigravity Master Suite loaded successfully with all features active.");
        } catch (e) {
            console.error("[MasterSuite Mobile] Error during onLoad:", e);
        }
    }

    function onUnload() {
        if (idleTimer) clearTimeout(idleTimer);
        for (const timer of Object.values(recoveryDebounce)) {
            clearTimeout(timer);
        }
        for (const unpatch of unpatches) {
            try {
                if (typeof unpatch === "function") unpatch();
            } catch (_) {}
        }
        unpatches.length = 0;
        console.log("[MasterSuite Mobile] Unloaded cleanly.");
    }

    const plugin = { onLoad, onUnload };
    if (typeof module !== "undefined" && module.exports) {
        module.exports = plugin;
    }
    return plugin;
})();