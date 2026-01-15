
import { store } from '../store.js';

class ArborVersionWidget extends HTMLElement {
    constructor() {
        super();
        this.isOpen = false;
        this.renderKey = null;
        // Bind click outside to close dropdown
        this.handleClickOutside = (e) => {
            if (this.isOpen && !this.contains(e.target)) {
                this.isOpen = false;
                this.render();
            }
        };
    }

    connectedCallback() {
        this.render();
        store.addEventListener('state-change', () => this.render());
        document.addEventListener('click', this.handleClickOutside);
    }

    disconnectedCallback() {
        document.removeEventListener('click', this.handleClickOutside);
    }

    toggleDropdown() {
        this.isOpen = !this.isOpen;
        this.render();
    }

    switchTo(release) {
        const activeSource = store.value.activeSource;
        
        // Logic to construct new Source Object
        const newSource = {
            ...activeSource,
            id: `${activeSource.id}-${release.id}`, // Unique ID to force refresh
            name: release.name || `${activeSource.name} (${release.id})`,
            url: release.url,
            type: release.type
        };
        
        store.loadData(newSource);
        this.isOpen = false;
        this.render();
    }

    switchToLive() {
        const activeSource = store.value.activeSource;
        const releases = store.value.availableReleases || [];
        const rolling = releases.find(r => r.type === 'rolling');
        
        let newUrl = rolling ? rolling.url : activeSource.url;
        
        // Fallback: If currently in archive, try to guess the live URL
        // e.g. .../data/releases/2023.json -> .../data/data.json
        if (!rolling && activeSource.type === 'archive') {
             if (activeSource.url.includes('/releases/')) {
                 newUrl = activeSource.url.split('/releases/')[0] + '/data.json';
             }
        }

        const newSource = {
            ...activeSource,
            id: `live-${Date.now()}`,
            name: activeSource.name.split(' (')[0], // Strip version suffix
            url: newUrl,
            type: 'rolling'
        };
        
        store.loadData(newSource);
        this.isOpen = false;
        this.render();
    }

    render() {
        // POSITIONING UPDATE: Changed top-4 to top-14 to avoid Architect Banner overlap
        this.className = "hidden md:flex fixed top-14 right-28 z-40 flex-col items-end pointer-events-none";

        const { activeSource, availableReleases, theme } = store.value;
        const releases = availableReleases || [];
        
        // Determine Current State
        const isArchive = activeSource?.type === 'archive';
        const isLocal = activeSource?.type === 'local';
        const isRolling = !isArchive && !isLocal;
        
        // Visuals for Main Button
        let label = "Live";
        let subLabel = "Rolling";
        let icon = "🌊";
        let colorClass = "text-green-600 dark:text-green-400 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20";

        if (isArchive) {
            label = "Snapshot";
            const match = activeSource.name.match(/\((.*?)\)/);
            subLabel = match ? match[1] : (activeSource.year || "Archive");
            icon = "🏛️";
            colorClass = "text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20";
        } else if (isLocal) {
            label = "Local";
            subLabel = "Workspace";
            icon = "🌱";
            colorClass = "text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20";
        }

        // Anti-flicker key
        const currentKey = `${label}-${subLabel}-${theme}-${this.isOpen}-${releases.length}`;
        if (currentKey === this.renderKey) return;
        this.renderKey = currentKey;

        // --- DROPDOWN CONTENT ---
        let dropdownHtml = '';
        if (this.isOpen) {
            const archives = releases.filter(r => r.type === 'archive').sort((a,b) => b.url.localeCompare(a.url));
            
            dropdownHtml = `
            <div class="absolute top-full right-0 mt-2 w-64 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 pointer-events-auto flex flex-col">
                <div class="p-2 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Select Version
                </div>
                
                <div class="max-h-64 overflow-y-auto custom-scrollbar p-1 space-y-1">
                    <!-- Live Option -->
                    <button id="btn-go-live" class="w-full text-left px-3 py-2 rounded-lg flex items-center justify-between text-xs font-bold transition-colors ${isRolling ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}">
                        <div class="flex items-center gap-2">
                            <span>🌊</span>
                            <span>Live / Rolling</span>
                        </div>
                        ${isRolling ? '<span>✔</span>' : ''}
                    </button>
                    
                    ${isLocal ? `
                    <div class="px-3 py-2 text-xs font-bold text-purple-500 bg-purple-50 dark:bg-purple-900/20 rounded-lg flex items-center gap-2 opacity-70 cursor-default">
                        <span>🌱</span> Local Workspace
                        <span class="ml-auto">✔</span>
                    </div>
                    ` : ''}

                    <!-- Archives List -->
                    ${archives.length > 0 ? 
                        archives.map(r => {
                            const isActive = isArchive && activeSource.url === r.url;
                            return `
                            <button class="btn-switch-ver w-full text-left px-3 py-2 rounded-lg flex items-center justify-between text-xs font-bold transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}" data-json='${JSON.stringify(r)}'>
                                <div class="flex items-center gap-2">
                                    <span>📦</span>
                                    <span>${r.year || r.name}</span>
                                </div>
                                ${isActive ? '<span>✔</span>' : ''}
                            </button>
                            `;
                        }).join('') 
                        : `<div class="p-4 text-center text-xs text-slate-400 italic">No archives found.</div>`
                    }
                </div>
                
                ${!isLocal ? `
                <div class="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-[9px] text-center text-slate-400">
                    Switching reloads the tree.
                </div>` : ''}
            </div>
            `;
        }

        this.innerHTML = `
            <div class="relative pointer-events-auto">
                <button id="btn-toggle" class="flex items-center gap-3 px-3 py-1.5 rounded-full border shadow-sm backdrop-blur-md transition-all hover:scale-105 active:scale-95 group bg-white/80 dark:bg-slate-900/80 ${colorClass}">
                    <span class="text-lg">${icon}</span>
                    <div class="text-left flex flex-col leading-none">
                        <span class="text-[8px] font-bold uppercase tracking-widest opacity-60">Version</span>
                        <span class="text-xs font-black">${subLabel}</span>
                    </div>
                    <div class="w-px h-6 bg-current opacity-20 mx-1"></div>
                    <span class="text-[10px] font-bold opacity-60 group-hover:opacity-100 transition-opacity">
                        ${this.isOpen ? '▲' : '▼'}
                    </span>
                </button>
                ${dropdownHtml}
            </div>
        `;

        // Bind Events
        const toggleBtn = this.querySelector('#btn-toggle');
        if(toggleBtn) toggleBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        };

        const liveBtn = this.querySelector('#btn-go-live');
        if(liveBtn) liveBtn.onclick = (e) => {
            e.stopPropagation();
            this.switchToLive();
        };

        this.querySelectorAll('.btn-switch-ver').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const data = JSON.parse(btn.dataset.json);
                this.switchTo(data);
            };
        });
    }
}

customElements.define('arbor-version-widget', ArborVersionWidget);
