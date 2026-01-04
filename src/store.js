
import { UI_LABELS, AVAILABLE_LANGUAGES } from './i18n.js';

const DEFAULT_SOURCES = [
    {
        id: 'default-arbor',
        name: 'Arbor Official',
        url: './data/data.json',
        isDefault: true,
        isTrusted: true
    }
];

class Store extends EventTarget {
    constructor() {
        super();
        this.state = {
            theme: localStorage.getItem('arbor-theme') || 'light',
            lang: localStorage.getItem('arbor-lang') || 'ES',
            sources: [],
            activeSource: null,
            data: null, // Current Tree Root
            searchIndex: [],
            path: [], // Breadcrumbs
            completedNodes: new Set(),
            selectedNode: null, // For Content Panel
            previewNode: null, // For Preview Modal
            loading: false,
            error: null,
            viewMode: 'explore', // explore | certificates
            modal: null, // tutorial | about | sources | impressum | language
            lastActionMessage: null
        };
        
        // Load persisted data
        this.loadProgress();
        this.loadSources();
        
        // Initial Effect
        document.documentElement.classList.toggle('dark', this.state.theme === 'dark');
    }

    get ui() { return UI_LABELS[this.state.lang]; }
    get value() { return this.state; }
    get availableLanguages() { return AVAILABLE_LANGUAGES; }
    get currentLangInfo() { return AVAILABLE_LANGUAGES.find(l => l.code === this.state.lang); }

    update(partialState) {
        this.state = { ...this.state, ...partialState };
        this.dispatchEvent(new CustomEvent('state-change', { detail: this.state }));
        
        if (partialState.theme) {
            document.documentElement.classList.toggle('dark', this.state.theme === 'dark');
            localStorage.setItem('arbor-theme', this.state.theme);
        }
        if (partialState.lang) {
            localStorage.setItem('arbor-lang', this.state.lang);
        }
    }

    // --- Actions ---

    toggleTheme() { this.update({ theme: this.state.theme === 'light' ? 'dark' : 'light' }); }
    setLanguage(lang) { this.update({ lang }); this.loadData(this.state.activeSource); }
    setModal(modal) { this.update({ modal }); }
    setViewMode(viewMode) { this.update({ viewMode }); }

    // --- Sources ---
    
    loadSources() {
        let sources = [];
        try {
            sources = JSON.parse(localStorage.getItem('arbor-sources')) || [];
        } catch(e) {}
        
        if (sources.length === 0) sources = DEFAULT_SOURCES;
        
        // Persist default if first run
        if (sources !== DEFAULT_SOURCES) {
           // Ensure default is there if user deleted everything
           // Optional: logic to force default presence
        }

        const activeId = localStorage.getItem('arbor-active-source-id');
        let activeSource = sources.find(s => s.id === activeId) || sources[0];

        this.update({ sources, activeSource });
        this.loadData(activeSource);
    }

    addSource(url) {
        if (!url) return;
        const newSource = { 
            id: crypto.randomUUID(), 
            name: new URL(url).hostname, // Temp name, will update on load
            url, 
            isTrusted: false 
        };
        const newSources = [...this.state.sources, newSource];
        this.update({ sources: newSources });
        localStorage.setItem('arbor-sources', JSON.stringify(newSources));
        this.loadAndSmartMerge(newSource.id);
    }

    removeSource(id) {
        const newSources = this.state.sources.filter(s => s.id !== id);
        this.update({ sources: newSources });
        localStorage.setItem('arbor-sources', JSON.stringify(newSources));
        if (this.state.activeSource.id === id) {
            this.loadAndSmartMerge(newSources[0].id);
        }
    }

    // --- Data Loading ---

    async loadAndSmartMerge(sourceId) {
        const source = this.state.sources.find(s => s.id === sourceId);
        if (!source) return;
        
        this.loadData(source);
    }

    async loadData(source) {
        this.update({ loading: true, error: null, activeSource: source });
        localStorage.setItem('arbor-active-source-id', source.id);

        try {
            const res = await fetch(source.url);
            if (!res.ok) throw new Error("Failed to fetch data.json");
            const json = await res.json();
            
            // Search Index
            const searchUrl = source.url.replace('data.json', 'search-index.json');
            const searchRes = await fetch(searchUrl).catch(() => null);
            const searchIndex = searchRes && searchRes.ok ? await searchRes.json() : [];

            // Language Selection
            const langData = json.languages?.[this.state.lang] || Object.values(json.languages)[0];
            
            // Update Source Name if provided by JSON
            if (json.universeName && json.universeName !== source.name) {
                const updatedSources = this.state.sources.map(s => s.id === source.id ? {...s, name: json.universeName} : s);
                this.update({ sources: updatedSources });
                localStorage.setItem('arbor-sources', JSON.stringify(updatedSources));
            }

            this.update({ 
                data: langData, 
                searchIndex, 
                loading: false, 
                path: [langData],
                lastActionMessage: this.ui.sourceSwitchSuccess 
            });
            
            setTimeout(() => this.update({ lastActionMessage: null }), 3000);

        } catch (e) {
            console.error(e);
            this.update({ loading: false, error: e.message });
        }
    }

    // --- Graph Interaction ---

    findNode(id, node = this.state.data) {
        if (!node) return null;
        if (node.id === id) return node;
        if (node.children) {
            for (const child of node.children) {
                const found = this.findNode(id, child);
                if (found) return found;
            }
        }
        return null;
    }

    async toggleNode(nodeId) {
        const node = this.findNode(nodeId);
        if (!node) return;

        // Path update logic (simplified reconstruction)
        let path = [];
        let curr = node;
        while(curr) {
            path.unshift(curr);
            curr = curr.parentId ? this.findNode(curr.parentId) : null;
        }
        this.update({ path });

        if (node.type === 'leaf') {
            this.update({ previewNode: node, selectedNode: null });
        } else {
            // Collapse siblings
            if (node.parentId) {
                const parent = this.findNode(node.parentId);
                if (parent && parent.children) {
                    parent.children.forEach(sibling => {
                        if (sibling.id !== nodeId && sibling.expanded) {
                            this.collapseRecursively(sibling);
                        }
                    });
                }
            }
            
            // Toggle
            if (!node.expanded) {
                if (node.hasUnloadedChildren) await this.loadNodeChildren(node);
                node.expanded = true;
            } else {
                this.collapseRecursively(node);
            }
            
            this.update({ selectedNode: null, previewNode: null });
            this.dispatchEvent(new CustomEvent('graph-update')); 
        }
    }

    collapseRecursively(node) {
        node.expanded = false;
        if (node.children) node.children.forEach(c => this.collapseRecursively(c));
    }

    async loadNodeChildren(node) {
        if (!node.apiPath) return;
        node.status = 'loading';
        this.dispatchEvent(new CustomEvent('graph-update'));
        
        try {
            const url = this.state.activeSource.url.replace('data.json', `nodes/${node.apiPath}.json`);
            const res = await fetch(url);
            if (res.ok) {
                node.children = await res.json();
                node.hasUnloadedChildren = false;
            }
        } catch(e) { console.error(e); }
        finally {
            node.status = 'available';
            this.dispatchEvent(new CustomEvent('graph-update'));
        }
    }

    enterLesson() {
        if (this.state.previewNode) {
            this.update({ selectedNode: this.state.previewNode, previewNode: null });
        }
    }

    closePreview() { this.update({ previewNode: null }); }
    closeContent() { this.update({ selectedNode: null }); }

    // --- Progress & Modules ---

    loadProgress() {
        try {
            const saved = localStorage.getItem('arbor-progress');
            if (saved) this.state.completedNodes = new Set(JSON.parse(saved));
        } catch(e) {}
    }

    markComplete(nodeId) {
        this.state.completedNodes.add(nodeId);
        localStorage.setItem('arbor-progress', JSON.stringify([...this.state.completedNodes]));
        this.update({}); // Trigger re-render
        this.dispatchEvent(new CustomEvent('graph-update'));
    }

    isCompleted(id) { return this.state.completedNodes.has(id); }

    // Logic to calculate module completion (Certificates)
    getModulesStatus() {
        if (!this.state.data) return [];
        const modules = [];
        
        const traverse = (node, pathName) => {
            let total = 0, completed = 0;
            if (node.type === 'leaf') {
                total = 1;
                completed = this.isCompleted(node.id) ? 1 : 0;
            } else if (node.children) {
                node.children.forEach(child => {
                    const res = traverse(child, pathName ? `${pathName} > ${node.name}` : node.name);
                    total += res.total;
                    completed += res.completed;
                });
                
                if (total > 0 && node.type === 'branch') {
                    modules.push({
                        id: node.id,
                        name: node.name,
                        icon: node.icon,
                        description: node.description,
                        totalLeaves: total,
                        completedLeaves: completed,
                        isComplete: total === completed,
                        path: pathName
                    });
                }
            }
            return { total, completed };
        };
        
        traverse(this.state.data, '');
        return modules.sort((a,b) => b.isComplete === a.isComplete ? 0 : (b.isComplete ? 1 : -1));
    }

    // --- Search ---
    search(query) {
        if (!query) return [];
        const q = query.toLowerCase();
        return this.state.searchIndex.filter(n => 
            n.lang === this.state.lang && 
            (n.name.toLowerCase().includes(q) || (n.description && n.description.toLowerCase().includes(q)))
        );
    }

    navigateTo(nodeId) {
        // Simple navigate for now: just toggle. 
        // In a real clone, we'd need to expand parents path.
        this.toggleNode(nodeId);
        // Force graph focus
        this.dispatchEvent(new CustomEvent('focus-node', { detail: nodeId }));
    }
}

export const store = new Store();
