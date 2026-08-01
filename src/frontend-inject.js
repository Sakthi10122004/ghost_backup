(function() {
    'use strict';
    console.log('[ghost-backup] Admin UI Injector Booted.');

    // ── Shared Plugin Registry & Controller ───────────────────────────
    if (!window.__ghostPlugins) {
        window.__ghostPlugins = {
            registry: [],
            register: function(plugin) {
                if (!this.registry.some(p => p.id === plugin.id)) {
                    this.registry.push(plugin);
                    this.render();
                }
            },
            manage: function(id) {
                const plugin = this.registry.find(p => p.id === id);
                if (plugin && typeof plugin.action === 'function') {
                    this.closeDashboard();
                    setTimeout(() => {
                        plugin.action();
                    }, 200);
                }
            },
            render: function() {
                const overlay = document.getElementById('ghost-plugins-overlay');
                if (overlay) {
                    this.closeDashboard();
                    this.openDashboard();
                }
            },
            closeDashboard: function() {
                const overlay = document.getElementById('ghost-plugins-overlay');
                if (overlay) {
                    const box = document.getElementById('ghost-plugins-modal-box');
                    if (box) box.style.animation = 'pluginsSlideOut 0.2s ease-in forwards';
                    overlay.style.animation = 'pluginsFadeOut 0.2s ease-in forwards';
                    setTimeout(() => { overlay.remove(); }, 180);
                }
            },
            openDashboard: async function() {
                if (document.getElementById('ghost-plugins-overlay')) return;
                
                const isDark = document.documentElement.classList.contains('dark');
                const overlay = document.createElement('div');
                overlay.id = 'ghost-plugins-overlay';
                overlay.style.cssText = `
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background-color: rgba(8, 9, 12, 0.45); backdrop-filter: blur(4px);
                    z-index: 999998; display: flex; justify-content: center; align-items: center;
                    animation: pluginsFadeIn 0.2s ease-out;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                `;
                
                const GENERIC_TRUSTED_ICON = `
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                    </svg>
                `.trim();

                const registry = this.registry || [];
                const cardsContainer = document.createElement('div');
                
                for (const plugin of registry) {
                    let isActive = true;
                    if (typeof plugin.checkActive === 'function') {
                        try {
                            isActive = await plugin.checkActive();
                        } catch (e) {
                            console.error(`[${plugin.name}] Failed to fetch active status:`, e);
                            isActive = false;
                        }
                    }

                    const statusColor = isActive ? (isDark ? '#34d399' : '#10b981') : (isDark ? '#9ca3af' : '#6b7280');
                    const statusText = isActive ? 'Active' : 'Inactive';
                    const shadowStyle = isActive ? `box-shadow: 0 0 8px ${statusColor};` : '';

                    const card = document.createElement('div');
                    card.className = 'plugin-card';
                    card.style.cssText = `display: flex; align-items: center; padding: 18px; background: ${isDark ? '#191b1f' : '#f9fafb'}; border: 1px solid ${isDark ? '#2a2e35' : '#e5e7eb'}; border-radius: 10px; margin-bottom: 12px; transition: all 0.2s ease;`;

                    const iconDiv = document.createElement('div');
                    iconDiv.className = 'plugin-icon';
                    iconDiv.style.cssText = `width: 42px; height: 42px; border-radius: 8px; background: ${isDark ? '#24272d' : '#f3f4f6'}; display: flex; justify-content: center; align-items: center; margin-right: 16px; color: ${isDark ? '#e1e3e6' : '#1f2937'}; flex-shrink: 0;`;
                    iconDiv.innerHTML = plugin.icon || GENERIC_TRUSTED_ICON;
                    card.appendChild(iconDiv);

                    const bodyDiv = document.createElement('div');
                    bodyDiv.className = 'plugin-card-body';
                    bodyDiv.style.cssText = 'flex-grow: 1; min-width: 0; margin-right: 16px;';

                    const titleBlock = document.createElement('div');
                    titleBlock.style.cssText = 'display: flex; align-items: center; margin-bottom: 4px;';

                    const title = document.createElement('h4');
                    title.style.cssText = `margin: 0; font-size: 15px; font-weight: 600; color: ${isDark ? '#f3f4f6' : '#111827'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`;
                    title.textContent = plugin.name;
                    titleBlock.appendChild(title);

                    const versionSpan = document.createElement('span');
                    versionSpan.style.cssText = `font-size: 11px; color: ${isDark ? '#9ca3af' : '#6b7280'}; margin-left: 8px; padding: 1px 6px; background: ${isDark ? '#24272d' : '#f3f4f6'}; border-radius: 4px; font-weight: 500;`;
                    versionSpan.textContent = 'v' + (plugin.version || '1.0.0');
                    titleBlock.appendChild(versionSpan);

                    bodyDiv.appendChild(titleBlock);

                    const description = document.createElement('p');
                    description.style.cssText = `margin: 0; font-size: 13px; color: ${isDark ? '#9ca3af' : '#4b5563'}; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;`;
                    description.textContent = plugin.description || '';
                    bodyDiv.appendChild(description);

                    card.appendChild(bodyDiv);

                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'plugin-card-actions';
                    actionsDiv.style.cssText = 'display: flex; align-items: center; flex-shrink: 0;';

                    const statusSpan = document.createElement('span');
                    statusSpan.style.cssText = `display: flex; align-items: center; margin-right: 16px; font-size: 13px; color: ${statusColor}; font-weight: 500;`;

                    const statusDot = document.createElement('span');
                    statusDot.style.cssText = `width: 8px; height: 8px; border-radius: 50%; background-color: ${statusColor}; display: inline-block; margin-right: 6px; ${shadowStyle}`;
                    statusSpan.appendChild(statusDot);
                    
                    const statusTextNode = document.createTextNode(statusText);
                    statusSpan.appendChild(statusTextNode);
                    actionsDiv.appendChild(statusSpan);

                    const configureBtn = document.createElement('button');
                    configureBtn.style.cssText = `padding: 6px 14px; font-size: 13px; font-weight: 500; border-radius: 6px; border: 1px solid ${isDark ? '#3a404a' : '#d1d5db'}; background: ${isDark ? '#24272d' : '#ffffff'}; color: ${isDark ? '#f3f4f6' : '#374151'}; cursor: pointer; transition: all 0.15s ease;`;
                    configureBtn.textContent = 'Configure';
                    configureBtn.addEventListener('click', () => {
                        this.manage(plugin.id);
                    });
                    actionsDiv.appendChild(configureBtn);

                    card.appendChild(actionsDiv);
                    cardsContainer.appendChild(card);
                }
                
                overlay.innerHTML = `
                    <style>
                        @keyframes pluginsFadeIn { from { opacity: 0; } to { opacity: 1; } }
                        @keyframes pluginsFadeOut { from { opacity: 1; } to { opacity: 0; } }
                        @keyframes pluginsSlideIn { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                        @keyframes pluginsSlideOut { from { transform: translateY(0); opacity: 1; } to { transform: translateY(12px); opacity: 0; } }
                        
                        @media (max-width: 650px) {
                            #ghost-plugins-modal-box {
                                width: 100% !important;
                                height: 100% !important;
                                max-height: 100% !important;
                                border-radius: 0 !important;
                            }
                            .plugin-card {
                                flex-direction: column !important;
                                align-items: flex-start !important;
                                padding: 16px !important;
                            }
                            .plugin-card-body {
                                margin-right: 0 !important;
                                margin-bottom: 12px !important;
                                width: 100% !important;
                            }
                            .plugin-card-actions {
                                width: 100% !important;
                                justify-content: space-between !important;
                                display: flex !important;
                                align-items: center !important;
                            }
                        }
                    </style>
                    <div id="ghost-plugins-modal-box" style="width: 90%; max-width: 680px; height: 80%; max-height: 600px; background: ${isDark ? '#15171a' : '#ffffff'}; border: 1px solid ${isDark ? '#24272c' : '#f0f3f6'}; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.2); display: flex; flex-direction: column; animation: pluginsSlideIn 0.25s cubic-bezier(0.19, 1, 0.22, 1);">
                        <div style="padding: 24px; border-bottom: 1px solid ${isDark ? '#24272c' : '#f0f3f6'}; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h3 style="margin: 0 0 4px 0; font-size: 20px; font-weight: 700; color: ${isDark ? '#f3f4f6' : '#111827'};">Installed Plugins</h3>
                                <p style="margin: 0; font-size: 13.5px; color: ${isDark ? '#9ca3af' : '#6b7280'};">Manage and configure your custom Ghost extensions.</p>
                            </div>
                            <button id="ghost-plugins-close-btn" style="background: none; border: none; color: ${isDark ? '#9ca3af' : '#6b7280'}; cursor: pointer; padding: 6px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        <div id="ghost-plugins-list" style="flex-grow: 1; overflow-y: auto; padding: 24px;">
                        </div>
                    </div>
                `;
                
                overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeDashboard(); });
                document.body.appendChild(overlay);

                const closeBtn = overlay.querySelector('#ghost-plugins-close-btn');
                if (closeBtn) {
                    closeBtn.addEventListener('click', () => this.closeDashboard());
                }

                const listDiv = overlay.querySelector('#ghost-plugins-list');
                if (listDiv) {
                    if (registry.length > 0) {
                        listDiv.appendChild(cardsContainer);
                    } else {
                        const emptyMsg = document.createElement('div');
                        emptyMsg.style.cssText = 'text-align: center; padding: 48px 0; color: #6b7280;';
                        const emptyText = document.createElement('p');
                        emptyText.style.cssText = 'margin: 0; font-size: 15px; font-weight: 500;';
                        emptyText.textContent = 'No active plugins detected.';
                        emptyMsg.appendChild(emptyText);
                        listDiv.appendChild(emptyMsg);
                    }
                }
            },
            injectTab: function() {
                if (document.getElementById('ghost-plugins-nav-item')) {
                    return true;
                }

                if (this.registry.length === 0) {
                    return false;
                }

                const settingsLink = document.querySelector('[data-test-nav="settings"]')
                                  || document.querySelector('a[href*="settings"]')
                                  || document.querySelector('.gh-nav-bottom a');
                                  
                if (settingsLink) {
                    const settingsLi = settingsLink.closest('li') || settingsLink.parentElement;
                    if (!settingsLi || !settingsLi.parentElement) return false;

                    const li = document.createElement(settingsLi.tagName);
                    li.id = 'ghost-plugins-nav-item';
                    li.className = settingsLi.className;
                    
                    const a = document.createElement(settingsLink.tagName);
                    a.id = 'ghost-plugins-nav-link';
                    a.href = '#';
                    
                    const classes = settingsLink.className.split(' ').filter(c => !c.toLowerCase().includes('active'));
                    a.className = classes.join(' ');

                    const settingsSpan = settingsLink.querySelector('span');
                    
                    let svgHtml = `
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-right: 12px; vertical-align: middle;">
                            <rect x="3" y="3" width="7" height="9"></rect>
                            <rect x="14" y="3" width="7" height="5"></rect>
                            <rect x="14" y="12" width="7" height="9"></rect>
                            <rect x="3" y="16" width="7" height="5"></rect>
                        </svg>
                    `;

                    let spanHtml = settingsSpan 
                        ? `<span class="${settingsSpan.className}" style="vertical-align: middle;">Installed Plugins</span>`
                        : `<span style="vertical-align: middle;">Installed Plugins</span>`;

                    a.innerHTML = svgHtml + '\n' + spanHtml;
                    
                    a.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.openDashboard();
                    });
                    
                    li.appendChild(a);
                    settingsLi.parentElement.insertBefore(li, settingsLi);
                    console.log('[ghost-plugins] Injected Unified Plugins option tab in sidebar.');
                    return true;
                }
                return false;
            }
        };
    }

    // ── Backup Overlay Functions ──────────────────────────────────────

    window.openBackupOverlay = function() {
        if (document.getElementById('ghost-backup-overlay')) return;
        
        const isDark = document.documentElement.classList.contains('dark');
        const overlay = document.createElement('div');
        overlay.id = 'ghost-backup-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(8, 9, 12, 0.4); backdrop-filter: blur(2px);
            z-index: 999999; display: flex; justify-content: center; align-items: center;
            animation: backupFadeIn 0.2s ease-out;
        `;
        
        overlay.innerHTML = `
            <style>
                @keyframes backupFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes backupFadeOut { from { opacity: 1; } to { opacity: 0; } }
                @keyframes backupSlideIn { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                @keyframes backupSlideOut { from { transform: translateY(0); opacity: 1; } to { transform: translateY(12px); opacity: 0; } }
                
                @media (max-width: 650px) {
                    #ghost-backup-modal-box {
                        width: 100% !important;
                        height: 100% !important;
                        max-height: 100% !important;
                        border-radius: 0 !important;
                    }
                }
            </style>
            <div id="ghost-backup-modal-box" style="width: 90%; max-width: 880px; height: 680px; max-height: 680px; background: ${isDark ? '#15171a' : '#ffffff'}; border: 1px solid ${isDark ? '#24272c' : '#f0f3f6'}; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.15); display: flex; flex-direction: column; animation: backupSlideIn 0.25s cubic-bezier(0.19, 1, 0.22, 1);">
                <iframe src="/ghost/backup/" style="width: 100%; height: 100%; border: none; background: transparent; overflow: hidden;" scrolling="no"></iframe>
            </div>
        `;
        
        overlay.addEventListener('click', (e) => { if (e.target === overlay) window.closeBackupOverlay(); });
        document.body.appendChild(overlay);
    };

    window.closeBackupOverlay = function() {
        const overlay = document.getElementById('ghost-backup-overlay');
        if (overlay) {
            const box = document.getElementById('ghost-backup-modal-box');
            if (box) box.style.animation = 'backupSlideOut 0.2s ease-in forwards';
            overlay.style.animation = 'backupFadeOut 0.2s ease-in forwards';
            setTimeout(() => { overlay.remove(); }, 180);
        }
    };

    // ── Self Registration ─────────────────────────────────────────────

    window.__ghostPlugins.register({
        id: 'backup',
        name: 'Backup & Restore',
        description: 'One-click full-system backup and restore — database (SQLite/MySQL) and all media assets.',
        version: '1.0.0',
        icon: `
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
        `,
        checkActive: async () => true,
        action: window.openBackupOverlay
    });

    // ── Observers ─────────────────────────────────────────────────────

    const themeObserver = new MutationObserver(() => {
        const overlays = [
            { id: 'ghost-backup-overlay', boxId: 'ghost-backup-modal-box' },
            { id: 'ghost-plugins-overlay', boxId: 'ghost-plugins-modal-box' }
        ];
        overlays.forEach(ov => {
            const el = document.getElementById(ov.id);
            const box = document.getElementById(ov.boxId);
            if (el && box) {
                const isDark = document.documentElement.classList.contains('dark');
                box.style.background = isDark ? '#15171a' : '#ffffff';
                box.style.borderColor = isDark ? '#24272c' : '#f0f3f6';
            }
        });
    });

    let mainObserver = null;
    let runTimeout = null;

    function runInjection() {
        if (runTimeout) clearTimeout(runTimeout);
        runTimeout = setTimeout(() => {
            if (window.__ghostPlugins) {
                const success = window.__ghostPlugins.injectTab();
                if (success && mainObserver) {
                    mainObserver.disconnect();
                    mainObserver = null;
                    console.log('[ghost-plugins] Successfully injected nav item. Disconnecting observer.');
                }
            }
        }, 100);
    }

    if (document.body) {
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        mainObserver = new MutationObserver(runInjection);
        mainObserver.observe(document.body, { childList: true, subtree: true });
        runInjection();
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
            mainObserver = new MutationObserver(runInjection);
            mainObserver.observe(document.body, { childList: true, subtree: true });
            runInjection();
        });
    }
})();
