(function () {
    const revengeApi = window.revenge || window.bunny || window.vendetta || {};
    const { metro, patcher } = revengeApi;
    const unpatches = [];

    function onLoad() {
        try {
            if (!metro || !patcher) {
                console.error("[ByeBlocked Mobile] Revenge/Vendetta API not available");
                return;
            }

            const RelationshipStore = metro.findByStoreName("RelationshipStore");
            const MessageStore = metro.findByStoreName("MessageStore");
            const TypingStore = metro.findByStoreName("TypingStore");
            const RowManager = metro.findByProps("getRows", "generateRows");
            const MessageActions = metro.findByProps("fetchMessages", "sendMessage");

            // 1. Completely remove Blocked Messages and Separator Bars from chat
            if (RowManager && RowManager.generateRows) {
                unpatches.push(
                    patcher.after("generateRows", RowManager, (args, rows) => {
                        if (!Array.isArray(rows)) return rows;
                        return rows.filter(row => {
                            if (!row) return false;
                            const type = String(row.type || "").toUpperCase();
                            if (type.includes("BLOCKED")) return false;

                            const authorId = row.message?.author?.id || row.author?.id;
                            if (authorId && RelationshipStore?.isBlocked?.(authorId)) {
                                return false;
                            }
                            return true;
                        });
                    })
                );
            }

            // 2. Hide Blocked Users from Typing Indicator
            if (TypingStore && TypingStore.getTypingUsers) {
                unpatches.push(
                    patcher.after("getTypingUsers", TypingStore, (args, res) => {
                        if (!res || typeof res !== "object") return res;
                        const filtered = {};
                        for (const userId in res) {
                            if (!RelationshipStore?.isBlocked?.(userId)) {
                                filtered[userId] = res[userId];
                            }
                        }
                        return filtered;
                    })
                );
            }

            // 3. Hide Blocked Users from Settings & Messaging Permissions (HideBlockedInSettings 1:1)
            const MessagingPermissions = metro.findByName("MessagingPermissions", false) || metro.findByProps("MessagingPermissions");
            if (MessagingPermissions && MessagingPermissions.default) {
                unpatches.push(
                    patcher.before("default", MessagingPermissions, (args) => {
                        if (args[0] && Array.isArray(args[0].blockedUsers)) {
                            args[0].blockedUsers = [];
                        }
                    })
                );
            }

            // 4. Bypass Blocked and Ignored Checks in UI Interactions (BypassBlockedOrIgnored 1:1)
            if (RelationshipStore) {
                if (RelationshipStore.isBlocked) {
                    unpatches.push(
                        patcher.instead("isBlocked", RelationshipStore, (args, orig) => {
                            const stack = new Error().stack || "";
                            if (stack.includes("Permission") || stack.includes("Voice") || stack.includes("ContextMenu") || stack.includes("Member")) {
                                return false;
                            }
                            return orig.apply(RelationshipStore, args);
                        })
                    );
                }
                if (RelationshipStore.isIgnored) {
                    unpatches.push(
                        patcher.instead("isIgnored", RelationshipStore, (args, orig) => {
                            const stack = new Error().stack || "";
                            if (stack.includes("Permission") || stack.includes("Voice") || stack.includes("ContextMenu") || stack.includes("Member")) {
                                return false;
                            }
                            return orig.apply(RelationshipStore, args);
                        })
                    );
                }
            }

            // 5. Message Load Failure Auto-Recovery (1:1 with desktop fix)
            if (MessageActions && MessageActions.fetchMessages) {
                const Dispatcher = metro.findByProps("dispatch", "subscribe");
                if (Dispatcher && Dispatcher.subscribe) {
                    const failureHandler = (action) => {
                        if (action.type === "LOAD_MESSAGES_FAILURE" && action.channelId) {
                            setTimeout(() => {
                                try {
                                    MessageActions.fetchMessages({ channelId: action.channelId });
                                } catch (_) {}
                            }, 300);
                        }
                    };
                    Dispatcher.subscribe("LOAD_MESSAGES_FAILURE", failureHandler);
                    unpatches.push(() => Dispatcher.unsubscribe("LOAD_MESSAGES_FAILURE", failureHandler));
                }
            }

            console.log("[ByeBlocked Mobile] Successfully loaded and active with all desktop privacy protections.");
        } catch (e) {
            console.error("[ByeBlocked Mobile] Error during onLoad:", e);
        }
    }

    function onUnload() {
        for (const unpatch of unpatches) {
            try {
                if (typeof unpatch === "function") unpatch();
            } catch (_) {}
        }
        unpatches.length = 0;
        console.log("[ByeBlocked Mobile] Unloaded.");
    }

    const plugin = { onLoad, onUnload };
    if (typeof module !== "undefined" && module.exports) {
        module.exports = plugin;
    }
    return plugin;
})();
