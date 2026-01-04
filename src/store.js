
import { UI_LABELS, AVAILABLE_LANGUAGES } from './i18n.js';
import { googleDrive } from './services/google-drive.js';

const OFFICIAL_DOMAINS = [
    'treesys-org.github.io',
    'localhost'
];

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
            path: [], 
            completedNodes: new Set(),
            selectedNode: null, 
            previewNode: null,
            loading: true,
            error: null,
            viewMode: 'explore', 
            modal: null, 
            lastActionMessage: null
        };
        
        this.saveTimer = null;
        this.loadProgress();
        this.loadSources();
        document.documentElement.classList.toggle('dark', this.state.theme === 'dark');

        // Sync Listener
        document.addEventListener('gdrive-sign-in', async () => {
            const remote = await googleDrive.loadProgress();
            const merged = new Set([...this.state.completedNodes, ...remote]);
            this.update({ completedNodes: merged });
            this.dispatchEvent(new CustomEvent('graph-update'));
        });
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

    // --- Sources ---

    isUrlTrusted(urlStr) {
        try {
            const url = new URL(urlStr);
            return OFFICIAL_DOMAINS.includes(url.hostname);
        } catch { return false; }
    }

    loadSources() {
        let sources = [];
        try { sources = JSON.parse(localStorage.getItem('arbor-sources')) || []; } catch(e) {}
        if (sources.length === 0) sources = DEFAULT_SOURCES;
        
        const activeId = localStorage.getItem('arbor-active-source-id');
        let activeSource = sources.find(s => s.id === activeId) || sources[0];

        this.update({ sources, activeSource });
        this.loadData(activeSource);
    }

    addSource(url) {
        if (!url) return;
        const isTrusted = this.isUrlTrusted(url);
        const name = new URL(url).hostname; 
        const newSource = { id: crypto.randomUUID(), name, url, isTrusted };
        const newSources = [...this.state.sources, newSource];
        
        this.update({ sources: newSources });
        localStorage.setItem('arbor-sources', JSON.stringify(newSources));
        this.loadAndSmartMerge(newSource.id);
    }

    removeSource(id) {
        const sourceToRemove = this.state.sources.find(s => s.id === id);
        if (sourceToRemove?.isDefault) return;

        const newSources = this.state.sources.filter(s => s.id !== id);
        this.update({ sources: newSources });
        localStorage.setItem('arbor-sources', JSON.stringify(newSources));
        
        if (this.state.activeSource.id === id) {
            this.loadAndSmartMerge(newSources[0].id);
        }
    }

    // --- Data Loading & Merging ---

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
            
            const searchUrl = source.url.replace('data.json', 'search-index.json');
            const searchRes = await fetch(searchUrl).catch(() => null);
            const searchIndex = searchRes && searchRes.ok ? await searchRes.json() : [];

            // Simple load for vanilla version (Switch, not merge, for simplicity unless needed)
            // But matching Angular behavior:
            const langData = json.languages?.[this.state.lang] || Object.values(json.languages)[0];
            
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
            
            this.dispatchEvent(new CustomEvent('graph-update'));
            setTimeout(() => this.update({ lastActionMessage: null }), 3000);

        } catch (e) {
            console.error(e);
            this.update({ loading: false, error: e.message });
        }
    }

    // --- Nodes & Navigation ---

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

    async navigateTo(nodeId) {
        let node = this.findNode(nodeId);
        
        if (!node) {
            // Logic ported from Angular DataService to reconstruct path for deep linking
            const pathIdsToUnfold = [];
            let currentId = nodeId;
            let highestAncestorInMemory = null;

            while (currentId) {
                const foundNode = this.findNode(currentId);
                if (foundNode) {
                    highestAncestorInMemory = foundNode;
                    break;
                }
                pathIdsToUnfold.unshift(currentId);
                
                // Heuristic: leaf IDs are "parent__leaf". 
                // We attempt to find parent ID.
                // For folders, if they are UUIDs, this fails and relies on user manually navigating or search index hints (not implemented in this simplified version).
                const parentId = currentId.substring(0, currentId.lastIndexOf('__'));
                
                if (!parentId || !parentId.includes('-root')) {
                    // Fallback to root if we can't determine parent by string
                    highestAncestorInMemory = this.state.data;
                    break;
                }
                currentId = parentId;
            }

            // Expand down
            let parentToExpand = highestAncestorInMemory;
            while (pathIdsToUnfold.length > 0 && parentToExpand) {
                if (parentToExpand.type !== 'leaf' && !parentToExpand.expanded) {
                    if (parentToExpand.hasUnloadedChildren) {
                        await this.loadNodeChildren(parentToExpand);
                    }
                    parentToExpand.expanded = true;
                }
                const nextIdToFind = pathIdsToUnfold.shift();
                parentToExpand = parentToExpand.children?.find(c => c.id === nextIdToFind) || null;
            }
        }
        
        node = this.findNode(nodeId);
        if (!node) return;

        this.toggleNode(nodeId);
        // Force graph to focus
        this.dispatchEvent(new CustomEvent('focus-node', { detail: nodeId }));
    }

    async toggleNode(nodeId) {
        const node = this.findNode(nodeId);
        if (!node) return;

        // Path update
        let path = [];
        let curr = node;
        while(curr) {
            path.unshift(curr);
            curr = curr.parentId ? this.findNode(curr.parentId) : null;
        }
        
        // Prune siblings (auto-collapse)
        const pathIds = new Set(path.map(p => p.id));
        const prune = (n) => {
            if (n.expanded && n.children) {
                n.children.forEach(child => {
                    if(pathIds.has(child.id)) prune(child);
                    else this.collapseRecursively(child);
                });
            }
        };
        if(this.state.data) prune(this.state.data);
        
        // Ensure parents expanded
        path.forEach(p => { if (p.type !== 'leaf') p.expanded = true; });
        this.update({ path });

        if (node.type === 'leaf') {
            this.update({ previewNode: node, selectedNode: null });
        } else {
            if (!node.expanded) {
                if (node.hasUnloadedChildren) await this.loadNodeChildren(node);
                node.expanded = true;
            } else {
                this.collapseRecursively(node);
            }
            this.update({ selectedNode: null, previewNode: null });
        }
        this.dispatchEvent(new CustomEvent('graph-update')); 
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

    // --- UI Actions ---

    toggleTheme() { this.update({ theme: this.state.theme === 'light' ? 'dark' : 'light' }); }
    setLanguage(lang) { 
        if(this.state.lang !== lang) {
            this.update({ lang }); 
            this.loadData(this.state.activeSource); 
        }
    }
    setModal(modal) { this.update({ modal }); }
    setViewMode(viewMode) { 
        this.update({ viewMode });
        if(viewMode === 'certificates') this.update({ modal: null });
    }
    enterLesson() {
        if (this.state.previewNode) {
            this.update({ selectedNode: this.state.previewNode, previewNode: null });
        }
    }
    closePreview() { this.update({ previewNode: null }); }
    closeContent() { this.update({ selectedNode: null }); }

    search(query) {
        if (!query) return [];
        const q = query.toLowerCase();
        return this.state.searchIndex.filter(n => 
            n.lang === this.state.lang && 
            (n.name.toLowerCase().includes(q) || (n.description && n.description.toLowerCase().includes(q)))
        );
    }

    // --- Progress ---

    loadProgress() {
        try {
            const saved = localStorage.getItem('arbor-progress');
            if (saved) this.state.completedNodes = new Set(JSON.parse(saved));
        } catch(e) {}
    }

    markComplete(nodeId) {
        if (this.state.completedNodes.has(nodeId)) {
             this.state.completedNodes.delete(nodeId);
        } else {
             this.state.completedNodes.add(nodeId);
        }
        
        localStorage.setItem('arbor-progress', JSON.stringify([...this.state.completedNodes]));
        this.update({}); 
        this.dispatchEvent(new CustomEvent('graph-update'));

        // Sync if logged in
        if (googleDrive.userProfile) {
            clearTimeout(this.saveTimer);
            this.saveTimer = setTimeout(() => googleDrive.saveProgress(this.state.completedNodes), 2000);
        }
    }

    isCompleted(id) { return this.state.completedNodes.has(id); }

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
}

export const store = new Store();
