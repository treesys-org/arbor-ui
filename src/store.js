
import { UI_LABELS } from './i18n.js';

class Store extends EventTarget {
    constructor() {
        super();
        this.state = {
            theme: 'light',
            lang: localStorage.getItem('arbor-lang') || 'ES',
            sources: [],
            activeSource: null,
            data: null, // Current Tree Root
            searchIndex: [],
            path: [], // Breadcrumbs
            completedNodes: new Set(),
            selectedNode: null,
            loading: false,
            error: null,
            viewMode: 'explore', // explore | certificates
            modal: null // tutorial | about | sources
        };

        // Load progress
        const savedProgress = localStorage.getItem('arbor-progress');
        if (savedProgress) {
            try {
                this.state.completedNodes = new Set(JSON.parse(savedProgress));
            } catch (e) {}
        }
    }

    get ui() { return UI_LABELS[this.state.lang]; }
    get value() { return this.state; }

    update(partialState) {
        this.state = { ...this.state, ...partialState };
        this.dispatchEvent(new CustomEvent('state-change', { detail: this.state }));
        
        if (partialState.theme) {
            document.documentElement.classList.toggle('dark', this.state.theme === 'dark');
            localStorage.setItem('arbor-theme', this.state.theme);
        }
    }

    setTheme(theme) { this.update({ theme }); }
    toggleTheme() { this.setTheme(this.state.theme === 'light' ? 'dark' : 'light'); }
    
    setModal(modal) { this.update({ modal }); }
    
    loadSources() {
        let sources = [];
        try {
            sources = JSON.parse(localStorage.getItem('arbor-sources')) || [];
        } catch(e) {}
        
        if (sources.length === 0) {
            sources = [{
                id: 'default',
                name: 'Arbor Local',
                url: './data/data.json',
                isDefault: true
            }];
        }
        
        this.update({ sources });
        this.loadData(sources[0]);
    }

    async loadData(source) {
        this.update({ loading: true, error: null, activeSource: source });
        try {
            const res = await fetch(source.url);
            if (!res.ok) throw new Error("No data found. Please run builder_script.py");
            const json = await res.json();
            
            // Assume structure: { languages: { ES: rootNode, EN: rootNode } }
            const langData = json.languages?.[this.state.lang] || Object.values(json.languages)[0];
            
            // Fetch search index relative to data.json
            const searchUrl = source.url.replace('data.json', 'search-index.json');
            const searchRes = await fetch(searchUrl).catch(() => null);
            const searchIndex = searchRes && searchRes.ok ? await searchRes.json() : [];

            this.update({ data: langData, searchIndex, loading: false, path: [langData] });
        } catch (e) {
            console.error(e);
            this.update({ loading: false, error: e.message });
        }
    }

    toggleNode(nodeId) {
        // Recursive find and toggle
        const findAndToggle = (node) => {
            if (node.id === nodeId) {
                if (node.type === 'leaf') {
                    this.update({ selectedNode: node });
                } else {
                    node.expanded = !node.expanded;
                    // Update Path
                    this.updatePath(node);
                }
                return true;
            }
            if (node.children) {
                for (let child of node.children) {
                    if (findAndToggle(child)) return true;
                }
            }
            return false;
        };

        if (this.state.data) {
            findAndToggle(this.state.data);
            this.dispatchEvent(new CustomEvent('graph-update')); // Force redraw
        }
    }

    updatePath(targetNode) {
        // Simple path reconstruction (bfs/dfs or parent pointers if available)
        // For simplicity, we just keep root -> ... -> target
        // In a real app, we'd traverse parentIds.
        // Here we just trigger an update.
    }

    markComplete(nodeId) {
        this.state.completedNodes.add(nodeId);
        localStorage.setItem('arbor-progress', JSON.stringify([...this.state.completedNodes]));
        this.dispatchEvent(new CustomEvent('state-change', { detail: this.state }));
        this.dispatchEvent(new CustomEvent('graph-update')); 
    }
}

export const store = new Store();
