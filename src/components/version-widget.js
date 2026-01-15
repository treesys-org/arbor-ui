
import { store } from '../store.js';

class ArborVersionWidget extends HTMLElement {
    constructor() {
        super();
        this.renderKey = null;
    }

    connectedCallback() {
        this.render();
        store.addEventListener('state-change', () => this.render());
    }

    openTimeline() {
        store.setModal('releases');
    }

    render() {
        // Only show on desktop for now to avoid cluttering mobile header
        // (Mobile users can access versions via Tree Manager if needed)
        this.className = "hidden md:flex fixed top-4 right-28 z-30 flex-col items-end pointer-events-none";

        const { activeSource } = store.value;
        const isRolling = !activeSource?.type || activeSource.type === 'rolling' || activeSource.type === 'local';
        
        // Determine display label
        let label = "Live";
        let subLabel = "Rolling";
        let icon = "🌊";
        let colorClass = "text-green-600 dark:text-green-400 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20";

        if (activeSource) {
            if (activeSource.type === 'archive') {
                label = "Snapshot";
                // Try to extract version from name "Universe (v1.0)" -> "v1.0"
                const match = activeSource.name.match(/\((.*?)\)/);
                subLabel = match ? match[1] : (activeSource.year || "Archive");
                icon = "🏛️";
                colorClass = "text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20";
            } else if (activeSource.type === 'local') {
                label = "Local";
                subLabel = "Workspace";
                icon = "🌱";
                colorClass = "text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20";
            }
        }

        const renderKey = `${label}-${subLabel}-${store.value.theme}`;
        if (renderKey === this.renderKey) return;
        this.renderKey = renderKey;

        this.innerHTML = `
            <button id="btn-timeline" class="pointer-events-auto flex items-center gap-3 px-3 py-1.5 rounded-full border shadow-sm backdrop-blur-md transition-all hover:scale-105 active:scale-95 group bg-white/80 dark:bg-slate-900/80 ${colorClass}">
                <span class="text-lg">${icon}</span>
                <div class="text-left flex flex-col leading-none">
                    <span class="text-[8px] font-bold uppercase tracking-widest opacity-60">Version</span>
                    <span class="text-xs font-black">${subLabel}</span>
                </div>
                <div class="w-px h-6 bg-current opacity-20 mx-1"></div>
                <span class="text-[10px] font-bold opacity-60 group-hover:opacity-100 transition-opacity">Timeline ➜</span>
            </button>
        `;

        this.querySelector('#btn-timeline').onclick = () => this.openTimeline();
    }
}

customElements.define('arbor-version-widget', ArborVersionWidget);
