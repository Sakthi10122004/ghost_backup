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
                    // Find the "Advanced" heading - it's an h2 rendered inside the nav
                    const allHeadings = Array.from(sidebar.querySelectorAll('h2, h3, span, div'));
                    const advancedHeading = allHeadings.find(function(el) {
                        var text = el.textContent.trim().toLowerCase();
                        return text === 'advanced' && (el.tagName === 'H2' || el.tagName === 'H3');
                    });

                    if (advancedHeading) {
                        // Walk siblings and ancestors to find the nearest <ul> after the heading
                        var ul = null;
                        var sibling = advancedHeading.nextElementSibling;
                        // Direct sibling check
                        while (sibling) {
                            if (sibling.tagName === 'UL') { ul = sibling; break; }
                            var nested = sibling.querySelector('ul');
                            if (nested) { ul = nested; break; }
                            sibling = sibling.nextElementSibling;
                        }
                        // If not found as sibling, try parent's next sibling (React fragments)
                        if (!ul) {
                            var parent = advancedHeading.parentElement;
                            if (parent) {
                                sibling = parent.nextElementSibling;
                                while (sibling) {
                                    if (sibling.tagName === 'UL') { ul = sibling; break; }
                                    var nestedUl = sibling.querySelector('ul');
                                    if (nestedUl) { ul = nestedUl; break; }
                                    sibling = sibling.nextElementSibling;
                                }
                            }
                        }
                        // Final fallback: find any <ul> that appears after the heading in DOM order
                        if (!ul) {
                            var allUls = Array.from(sidebar.querySelectorAll('ul'));
                            for (var i = 0; i < allUls.length; i++) {
                                if (advancedHeading.compareDocumentPosition(allUls[i]) & Node.DOCUMENT_POSITION_FOLLOWING) {
                                    ul = allUls[i];
                                    break;
                                }
                            }
                        }

                        if (ul) {
                            var li = document.createElement('li');
                            var templateLink = sidebar.querySelector('a#integrations') || sidebar.querySelector('a');
                            
                            if (templateLink) {
                                var clonedLink = templateLink.cloneNode(true);
                                clonedLink.id = 'ghost-plugins-sidebar-link';
                                clonedLink.removeAttribute('href'); // Remove href to prevent breaking React hash routing
                                clonedLink.removeAttribute('data-testid'); // Clean up any react test ids
                                
                                // Ensure it's not styled as "active" (Ghost uses these specific classes for active states)
                                clonedLink.className = clonedLink.className.replace(/bg-\[#243043\]/g, '').replace(/bg-\[#202630\]/g, '').replace(/text-white/g, 'text-\\[\\#c8ccd3\\]').replace(/bg-grey-100/g, '').replace(/bg-black/g, '');
                                
                                // Ensure hover classes exist
                                if (!clonedLink.className.includes('hover:')) {
                                    clonedLink.className += ' hover:bg-white/5';
                                }

                                // Swap SVG icon to puzzle piece
                                var svg = clonedLink.querySelector('svg');
                                if (svg) {
                                    svg.innerHTML = '<path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.611c-.946.946-2.461.946-3.408 0L8.73 19.73a.98.98 0 0 1-.276-.837c.07-.47.48-.802.925-.968a2.5 2.5 0 1 0-3.214-3.214c-.166-.446-.497-.855-.968-.925a.979.979 0 0 1-.837-.276L2.748 11.9a2.42 2.42 0 0 1 0-3.408l1.568-1.568a.98.98 0 0 1 .837-.276c.47.07.802.48.968.925a2.501 2.501 0 1 0 3.214-3.214c-.446-.166-.855-.497-.925-.968a.979.979 0 0 1 .276-.837l1.61-1.611c.946-.946 2.461-.946 3.408 0l1.568 1.568a.98.98 0 0 1 .276.837c-.07.47-.48.802-.925.968a2.5 2.5 0 1 0 3.214 3.214c.166.446.497.855.968.925Z"></path>';
                                }
                                
                                // Swap text
                                for (var i = 0; i < clonedLink.childNodes.length; i++) {
                                    var node = clonedLink.childNodes[i];
                                    if (node.nodeType === 3 && node.nodeValue.trim().length > 0) {
                                        node.nodeValue = 'Installed Plugins';
                                        break;
                                    }
                                }
                                
                                clonedLink.addEventListener('click', function(e) {
                                    e.preventDefault();
                                    var target = document.getElementById('installed-plugins');
                                    var scroller = document.getElementById('admin-x-settings-scroller');
                                    if (target && scroller) {
                                        // Calculate offset to account for sticky header
                                        var targetPos = target.offsetTop;
                                        scroller.scrollTo({ top: targetPos - 60, behavior: 'smooth' });
                                    } else if (target) {
                                        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }
                                });
                                
                                li.appendChild(clonedLink);
                            }
                            
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
                                plugin.onMount(wrapper);
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
        svgIcon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px;"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>`,
        onMount: (wrapper) => {
            // Scope the query to the wrapper in case of document fragment issues or shadow DOMs
            const btn = (wrapper || document).querySelector('#ghost-backup-open-console');
            if (btn && !btn.hasAttribute('data-bound')) {
                btn.setAttribute('data-bound', 'true');
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (document.getElementById('ghost-backup-modal')) return;
                    
                    const overlay = document.createElement('div');
                    overlay.id = 'ghost-backup-modal';
                    // Fallback to inline styles for z-index and positioning because Ghost's Tailwind JIT compiler 
                    // won't recognize arbitrary classes (like z-[99999]) injected at runtime.
                    overlay.className = 'flex items-center justify-center p-4 md:p-10';
                    overlay.style.position = 'fixed';
                    overlay.style.top = '0';
                    overlay.style.left = '0';
                    overlay.style.right = '0';
                    overlay.style.bottom = '0';
                    overlay.style.zIndex = '2147483647'; // Maximum z-index
                    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
                    overlay.style.backdropFilter = 'blur(4px)';
                    
                    overlay.innerHTML = `
                        <div class="relative w-full max-w-[600px] h-full max-h-[85vh] bg-white dark:bg-[#15171a] rounded-xl overflow-hidden shadow-2xl flex flex-col border border-border-default" style="animation: backupModalPop 0.2s ease-out; max-width: 600px;">
                            <style>
                                @keyframes backupModalPop {
                                    from { opacity: 0; transform: scale(0.97); }
                                    to { opacity: 1; transform: scale(1); }
                                }
                            </style>
                            <iframe src="/ghost/backup/" class="w-full h-full border-none" style="flex: 1;"></iframe>
                        </div>
                    `;
                    
                    overlay.addEventListener('click', (ev) => {
                        if (ev.target === overlay) {
                            document.body.removeChild(overlay);
                        }
                    });
                    
                    window.__GHOST_BACKUP_CLOSE_MODAL__ = function() {
                        if (document.body.contains(overlay)) {
                            document.body.removeChild(overlay);
                        }
                    };
                    
                    document.body.appendChild(overlay);
                });
            }
        },
        renderInlineContent: () => {
            return `
                <div class="flex flex-col gap-4">
                    <p class="m-0 text-[15px] text-grey-700 dark:text-grey-400">
                        Create full-system snapshots and securely restore your database and media assets.
                    </p>
                    <div class="flex items-center justify-between p-3 rounded-md border border-grey-200 dark:border-grey-900 bg-white dark:bg-black mt-2">
                        <div class="flex flex-col gap-1">
                            <span class="text-sm font-semibold text-grey-900 dark:text-white uppercase tracking-wide">Backup Dashboard</span>
                            <span class="text-[13px] text-grey-500">Launch the one-click Backup & Restore console</span>
                        </div>
                        <button id="ghost-backup-open-console" class="h-8 flex items-center rounded-md px-4 text-sm font-medium bg-black text-white hover:bg-grey-900 dark:bg-white dark:text-black dark:hover:bg-grey-200 transition-colors cursor-pointer shadow-sm border-0">
                            Open Console
                        </button>
                    </div>
                </div>
            `;
        }
    });

})();