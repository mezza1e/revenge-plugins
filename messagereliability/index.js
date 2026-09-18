(function(exports, metroCommon, patcher, metro, vendetta, plugin, storage, uiComponents) {
    'use strict';

    const _vendetta = (typeof vendetta !== 'undefined' && vendetta) ||
                      (typeof revenge !== 'undefined' && revenge) ||
                      (typeof bunny !== 'undefined' && bunny) ||
                      (typeof globalThis !== 'undefined' && (globalThis.vendetta || globalThis.revenge || globalThis.bunny)) ||
                      {};
    const _metro = metro || _vendetta.metro || {};
    const _patcher = patcher || _vendetta.patcher || {};
    const _common = metroCommon || _metro.common || {};
    const _FluxDispatcher = _common.FluxDispatcher || (_metro.findByProps && _metro.findByProps('dispatch', 'subscribe'));
    const unpatches = [];

    
    const recoveryDebounce = {};

    const mobilePrefetchedUrls = new Set();
    function preloadMobileMedia(url) {
        if (!url || typeof url !== 'string' || mobilePrefetchedUrls.has(url)) return;
        mobilePrefetchedUrls.add(url);
        if (mobilePrefetchedUrls.size > 600) {
            const first = mobilePrefetchedUrls.values().next().value;
            mobilePrefetchedUrls.delete(first);
        }
        try {
            const RNImage = (_metro.findByProps && (_metro.findByProps('prefetch', 'queryCache') || _metro.findByProps('resolveAssetSource'))) ||
                            (_common.React && _common.React.Image);
            if (RNImage && typeof RNImage.prefetch === 'function') {
                RNImage.prefetch(url).catch(() => {});
            } else if (typeof Image !== 'undefined' && typeof Image.prefetch === 'function') {
                Image.prefetch(url).catch(() => {});
            }
        } catch (_) {}
    }

    function preloadMessagesMedia(messages) {
        if (!Array.isArray(messages) || !messages.length) return;
        for (const msg of messages) {
            if (!msg) continue;
            if (Array.isArray(msg.attachments)) {
                for (const att of msg.attachments) {
                    const u = att.proxy_url || att.url;
                    if (u) preloadMobileMedia(u);
                }
            }
            if (Array.isArray(msg.embeds)) {
                for (const emb of msg.embeds) {
                    if (emb.image) preloadMobileMedia(emb.image.proxy_url || emb.image.url);
                    if (emb.thumbnail) preloadMobileMedia(emb.thumbnail.proxy_url || emb.thumbnail.url);
                }
            }
            if (Array.isArray(msg.sticker_items)) {
                for (const stk of msg.sticker_items) {
                    if (stk.id) preloadMobileMedia(`https://media.discordapp.net/stickers/${stk.id}.png?size=160`);
                }
            }
            if (typeof msg.content === 'string' && msg.content.includes('<')) {
                const matches = msg.content.matchAll(/<a?:[a-zA-Z0-9_]+:(\d+)>/g);
                for (const m of matches) {
                    preloadMobileMedia(`https://cdn.discordapp.com/emojis/${m[1]}.webp?size=64&quality=lossless`);
                }
            }
        }
    }


    function onLoad() {
        try {
            console.log('[DiscordMessageReliability Mobile] Initializing...');
            if (!_patcher || !_patcher.before) return;
            const MessageActions = _metro.findByProps ? _metro.findByProps('fetchMessages') : null;

            if (_FluxDispatcher && MessageActions) {
                unpatches.push(
                    _patcher.after('dispatch', _FluxDispatcher, ([event]) => {
                        if (!event) return;
                                                if (event.type === 'LOAD_MESSAGES_SUCCESS' && Array.isArray(event.messages)) {
                            const isHistorical = event.isBefore === true;
                            if (isHistorical) {
                                setTimeout(() => preloadMessagesMedia(event.messages), 400);
                            } else {
                                preloadMessagesMedia(event.messages);
                            }
                        }
                        if (event.type === 'LOAD_MESSAGES_FAILURE' || event.type === 'MESSAGE_FETCH_FAILED') {
                            const chId = event.channelId;
                            if (!chId || recoveryDebounce[chId]) return;
                            recoveryDebounce[chId] = setTimeout(() => {
                                delete recoveryDebounce[chId];
                                console.log('[MessageReliability] Auto-recovering failed messages for channel:', chId);
                                try {
                                    MessageActions.fetchMessages({ channelId: chId, limit: 50 });
                                } catch (_) {}
                            }, 1200);
                        }
                    })
                );
            }

            console.log('[DiscordMessageReliability Mobile] Loaded successfully!');
        } catch (err) {
            console.error('[DiscordMessageReliability Mobile] Error during onLoad:', err);
        }
    }

    function onUnload() {
        for (const t of Object.values(recoveryDebounce)) clearTimeout(t);
        for (const unpatch of unpatches) {
            try { if (typeof unpatch === 'function') unpatch(); } catch (_) {}
        }
        unpatches.length = 0;
        console.log('[DiscordMessageReliability Mobile] Unloaded.');
    }


    const pluginInstance = { onLoad, onUnload };
    exports.default = pluginInstance;
    exports.onLoad = pluginInstance.onLoad;
    exports.onUnload = pluginInstance.onUnload;
    Object.defineProperty(exports, '__esModule', { value: true });
    return exports;
})({},
    (typeof vendetta !== 'undefined' ? vendetta.metro?.common : (typeof revenge !== 'undefined' ? revenge.metro?.common : undefined)),
    (typeof vendetta !== 'undefined' ? vendetta.patcher : (typeof revenge !== 'undefined' ? revenge.patcher : undefined)),
    (typeof vendetta !== 'undefined' ? vendetta.metro : (typeof revenge !== 'undefined' ? revenge.metro : undefined)),
    (typeof vendetta !== 'undefined' ? vendetta : (typeof revenge !== 'undefined' ? revenge.metro : undefined)),
    (typeof vendetta !== 'undefined' ? vendetta.plugin : (typeof revenge !== 'undefined' ? revenge.plugin : undefined)),
    (typeof vendetta !== 'undefined' ? vendetta.storage : (typeof revenge !== 'undefined' ? revenge.storage : undefined)),
    (typeof vendetta !== 'undefined' ? vendetta.ui?.components : (typeof revenge !== 'undefined' ? revenge.ui?.components : undefined))
);
