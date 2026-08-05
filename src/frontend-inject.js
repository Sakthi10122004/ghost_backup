(function () {
    'use strict';

    // ── Shared Plugin Registry & Controller ───────────────────────────
    if (!window.__GHOST_PLUGINS_REGISTRY__) {
        window.__GHOST_PLUGINS_REGISTRY__ = {
            plugins: [],
            register: function (plugin) {
                if (!this.plugins.some(p => p.id === plugin.id)) {
                    this.plugins.push(plugin);
                    this.render();
                }
            },
            togglePanel: function (id) {
                const panel = document.getElementById('ghost-plugin-panel-' + id);
                const btn = document.getElementById('ghost-plugin-btn-' + id);
                if (panel && btn) {
                    const isHidden = panel.classList.contains('hidden');
                    if (isHidden) {
                        panel.classList.remove('hidden');
                        btn.textContent = 'Close';
                    } else {
                        panel.classList.add('hidden');
                        btn.textContent = 'Open';
                    }
                }
            },
            render: function () {
                // 1. Inject into Sidebar ("Advanced" Section)
                const sidebar = document.getElementById('admin-x-settings-sidebar');
                if (sidebar && !document.getElementById('ghost-plugins-sidebar-link')) {
                    const headings = Array.from(sidebar.querySelectorAll('h2, h3, div'));
                    const advancedHeading = headings.find(h => h.textContent.trim().toLowerCase() === 'advanced');

                    if (advancedHeading) {
                        const ul = advancedHeading.nextElementSibling || advancedHeading.parentElement.querySelector('ul');
                        if (ul && ul.tagName === 'UL') {
                            const li = document.createElement('li');
                            li.setAttribute('data-setting-nav-item', 'true');
                            li.innerHTML = `
                                <a id="ghost-plugins-sidebar-link" class="mt-px flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-control font-medium text-text-secondary transition-all hover:bg-tab-hover focus-visible:bg-tab-hover" href="#installed-plugins">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-blocks size-4 shrink-0">
                                        <rect x="14" y="2" width="8" height="8" rx="1"></rect>
                                        <path d="M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2"></path>
                                    </svg>
                                    Installed Plugins
                                </a>
                            `;

                            li.querySelector('a').addEventListener('click', (e) => {
                                e.preventDefault();
                                const target = document.getElementById('installed-plugins');
                                if (target) {
                                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }
                            });

                            ul.prepend(li);
                        }
                    }
                }

                // 2. Inject Master Card inside Scroller
                const scroller = document.getElementById('admin-x-settings-scroller') || document.querySelector('.admin-x-settings');
                if (scroller && !document.getElementById('installed-plugins')) {
                    // Fallback selectors if data-testid="integrations" isn't immediately found
                    const anchorCard = document.querySelector('[data-testid="integrations"]') 
                                    || document.querySelector('[data-testid="code-injection"]')
                                    || document.querySelector('.group\\/setting-group');

                    if (anchorCard) {
                        const masterCard = document.createElement('div');
                        masterCard.id = 'installed-plugins';
                        masterCard.className = 'group/setting-group relative flex flex-col gap-6 rounded-xl border border-border-default bg-card p-5 md:p-7 mb-10';
                        masterCard.innerHTML = `
                            <div class="flex items-start justify-between gap-4">
                                <div class="flex flex-col gap-1">
                                    <h2 class="text-md m-0 font-semibold tracking-tight text-grey-900 dark:text-white">Installed Plugins</h2>
                                    <p class="m-0 text-sm text-grey-700 dark:text-grey-400">Manage custom system extensions and integrations.</p>
                                </div>
                            </div>
                            <div id="ghost-plugins-card-content" class="flex flex-col gap-6"></div>
                        `;
                        anchorCard.parentNode.insertBefore(masterCard, anchorCard);
                    }
                }

                // 3. Render Registered Plugin Panels
                const container = document.getElementById('ghost-plugins-card-content');
                if (container) {
                    this.plugins.forEach(plugin => {
                        if (!document.getElementById('ghost-plugin-wrapper-' + plugin.id)) {
                            const wrapper = document.createElement('div');
                            wrapper.id = 'ghost-plugin-wrapper-' + plugin.id;
                            wrapper.className = 'flex flex-col gap-4 border-t border-border-default pt-4 first:border-t-0 first:pt-0';

                            wrapper.innerHTML = `
                                <div class="flex items-center justify-between gap-4">
                                    <div class="flex items-center gap-3">
                                        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-grey-100 text-grey-800 dark:bg-grey-900 dark:text-grey-100">
                                            ${plugin.svgIcon}
                                        </div>
                                        <div class="flex flex-col">
                                            <span class="text-sm font-semibold text-grey-900 dark:text-white">${plugin.title}</span>
                                        </div>
                                    </div>
                                    <button id="ghost-plugin-btn-${plugin.id}" class="h-7 rounded-md px-3 text-sm font-medium hover:bg-grey-100 dark:hover:bg-grey-900 text-grey-900 dark:text-white transition-colors border border-border-default cursor-pointer">Open</button>
                                </div>
                                <div id="ghost-plugin-panel-${plugin.id}" class="hidden rounded-lg bg-grey-50 dark:bg-grey-950 p-4 border border-border-default text-sm text-grey-900 dark:text-white">
                                    ${plugin.renderInlineContent()}
                                </div>
                            `;

                            container.appendChild(wrapper);

                            // Delegate click directly on element rather than global inline function
                            const btn = wrapper.querySelector(`#ghost-plugin-btn-${plugin.id}`);
                            if (btn) {
                                btn.addEventListener('click', () => {
                                    window.__GHOST_PLUGINS_REGISTRY__.togglePanel(plugin.id);
                                });
                            }

                            if (typeof plugin.onMount === 'function') {
                                plugin.onMount();
                            }
                        }
                    });
                }
            }
        };

        // Mutation Observer to continuous re-evaluate DOM changes (React Page Swaps)
        const observer = new MutationObserver(() => {
            window.__GHOST_PLUGINS_REGISTRY__.render();
        });

        const startObserver = () => {
            observer.observe(document.body, { childList: true, subtree: true });
            window.__GHOST_PLUGINS_REGISTRY__.render();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startObserver);
        } else {
            startObserver();
        }
    }

    // ── Register Backup Plugin ───────────────────────────────
    window.__GHOST_PLUGINS_REGISTRY__.register({
        id: 'ghost-backup',
        title: 'Backup & Restore',
        svgIcon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
        renderInlineContent: () => {
            return `
                <div class="flex flex-col gap-4">
                    <p class="m-0 text-sm text-grey-700 dark:text-grey-400">
                        Stream-based full-system backups. Database and media assets will be compiled directly to your browser download stream.
                    </p>
                    <div class="flex items-center justify-between p-3 rounded-md border border-border-default bg-white dark:bg-black">
                        <div class="flex flex-col gap-1">
                            <span class="font-medium text-grey-900 dark:text-white">Create Full Snapshot</span>
                            <span class="text-xs text-grey-500">Container sandbox path: /tmp</span>
                        </div>
                        <a href="/ghost/backup/download" class="h-8 flex items-center rounded-md px-4 text-sm font-medium bg-green text-white hover:bg-green-400 transition-colors cursor-pointer" target="_blank" download style="text-decoration: none; color: #000; background-color: #34d399; border-radius: 4px;">
                            Download .tar.gz
                        </a>
                    </div>
                </div>
            `;
        }
    });

})();