
import { UI_LABELS, AVAILABLE_LANGUAGES } from './i18n.js';
import { googleDrive } from './services/google-drive.js';

const OFFICIAL_DOMAINS = [
    'treesys-org.github.io',
    'localhost',
    '127.0.0.1',
    'raw.githubusercontent.com'
];

// REFACTOR: The philosophy is that Arbor is a browser for external repos.
// Only the official cloud curriculum is loaded by default.
const DEFAULT_SOURCES = [
    {
        id: 'default-arbor',
        name: 'Arbor Knowledge (Official)',
        // FIX: The builder script outputs to a 'data' folder, so the URL must include /data/
        url: 'https://treesys-org.github.io/arbor-knowledge/data/data.json',
        isDefault: true,
        isTrusted: true
    }
];

class Store extends EventTarget {
    constructor() {
        super();
        this.state = {
            theme: localStorage.getItem('arbor-theme') || 'light',
            lang: localStorage.getItem('arbor-lang') || 'EN',
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
            lastErrorMessage: null, // New error state for toasts
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

    // --- Theme & UI ---

    setTheme(theme) {
        this.update({ theme });
    }

    toggleTheme() { 
        this.update({ theme: this.state.theme === 'light' ? 'dark' : 'light' }); 
    }

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

    // --- Sources ---

    isUrlTrusted(urlStr) {
        try {
            const url = new URL(urlStr, window.location.href);
            return OFFICIAL_DOMAINS.includes(url.hostname);
        } catch { return false; }
    }

    loadSources() {
        let sources = [];
        try { sources = JSON.parse(localStorage.getItem('arbor-sources')) || []; } catch(e) {}
        
        // Always merge defaults to ensure we have the official repo
        // but preserve user-added sources
        const mergedSources = [...DEFAULT_SOURCES];
        
        sources.forEach(s => {
            // If user has a source that is NOT in defaults, add it
            if (!DEFAULT_SOURCES.find(d => d.id === s.id)) {
                mergedSources.push(s);
            }
        });

        // Save back the clean list
        localStorage.setItem('arbor-sources', JSON.stringify(mergedSources));
        
        // Determine active source
        const savedActiveId = localStorage.getItem('arbor-active-source-id');
        let activeSource = mergedSources.find(s => s.id === savedActiveId);
        
        // Fallback: Default Arbor Official
        if (!activeSource) {
            activeSource = mergedSources.find(s => s.id === 'default-arbor');
        }

        this.update({ sources: mergedSources, activeSource });
        this.loadData(activeSource);
    }

    addSource(url) {
        if (!url) return;
        const isTrusted = this.isUrlTrusted(url);
        let name = 'New Tree';
        try {
            name = new URL(url, window.location.href).hostname; 
        } catch (e) {}

        const newSource = { id: crypto.randomUUID(), name, url, isTrusted };
        const newSources = [...this.state.sources, newSource];
        
        this.update({ sources: newSources });
        localStorage.setItem('arbor-sources', JSON.stringify(newSources));
        this.loadAndSmartMerge(newSource.id);
    }

    removeSource(id) {
        const sourceToRemove = this.state.sources.find(s => s.id === id);
        // Prevent removing official defaults
        if (sourceToRemove?.isDefault) return;

        const newSources = this.state.sources.filter(s => s.id !== id);
        this.update({ sources: newSources });
        localStorage.setItem('arbor-sources', JSON.stringify(newSources));
        
        if (this.state.activeSource.id === id) {
            // Fallback to official if current was deleted
            const fallback = newSources.find(s => s.id === 'default-arbor') || newSources[0];
            this.loadAndSmartMerge(fallback.id);
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
            
            if (!res.ok) {
                throw new Error(`Failed to fetch data from ${source.name} (Status ${res.status}).`);
            }

            const json = await res.json();
            
            const searchUrl = source.url.replace('data.json', 'search-index.json');
            const searchRes = await fetch(searchUrl).catch(() => null);
            const searchIndex = searchRes && searchRes.ok ? await searchRes.json() : [];

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
                const parentId = currentId.substring(0, currentId.lastIndexOf('__'));
                
                if (!parentId || !parentId.includes('-root')) {
                    highestAncestorInMemory = this.state.data;
                    break;
                }
                currentId = parentId;
            }

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
        this.dispatchEvent(new CustomEvent('focus-node', { detail: nodeId }));
    }

    async navigateToNextLeaf() {
        if (!this.state.selectedNode || !this.state.data) return;
        
        const leaves = [];
        const traverse = (node) => {
            if (node.type === 'leaf') leaves.push(node);
            if (node.children) node.children.forEach(traverse);
        };
        traverse(this.state.data);

        const currentIndex = leaves.findIndex(n => n.id === this.state.selectedNode.id);
        
        if (currentIndex !== -1 && currentIndex < leaves.length - 1) {
            const nextNode = leaves[currentIndex + 1];
            // Wait for navigation (which handles opening parents)
            await this.navigateTo(nextNode.id);
            // Directly set to content view, bypassing preview
            this.update({ selectedNode: nextNode, previewNode: null });
        } else {
            // End of content
            this.closeContent();
        }
    }

    async toggleNode(nodeId) {
        console.log('Toggling Node:', nodeId);
        const node = this.findNode(nodeId);
        
        if (!node) {
            console.error('Node not found:', nodeId);
            return;
        }

        try {
            // 1. Update Path
            let path = [];
            let curr = node;
            while(curr) {
                path.unshift(curr);
                curr = curr.parentId ? this.findNode(curr.parentId) : null;
            }
            this.update({ path });

            // 2. Collapse siblings (Accordion) - Explicit loop
            // We only collapse siblings if we are EXPANDING.
            if (!node.expanded) {
                // Find parent to get siblings
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
            }

            // 3. Toggle Target
            if (node.type === 'leaf') {
                this.update({ previewNode: node, selectedNode: null });
            } else {
                if (!node.expanded) {
                    if (node.hasUnloadedChildren) {
                        await this.loadNodeChildren(node);
                    }
                    node.expanded = true;
                } else {
                    this.collapseRecursively(node);
                }
                this.update({ selectedNode: null, previewNode: null });
            }
            
            this.dispatchEvent(new CustomEvent('graph-update')); 

        } catch (e) {
            console.error('Error toggling node:', e);
            this.update({ lastErrorMessage: "Error interacting with node: " + e.message });
            setTimeout(() => this.update({ lastErrorMessage: null }), 5000);
        }
    }

    collapseRecursively(node) {
        node.expanded = false;
        if (node.children) node.children.forEach(c => this.collapseRecursively(c));
    }

    async loadNodeChildren(node) {
        if (!node.apiPath) {
            this.update({ lastErrorMessage: "Node API Path missing." });
            setTimeout(() => this.update({ lastErrorMessage: null }), 4000);
            return;
        }

        node.status = 'loading';
        this.dispatchEvent(new CustomEvent('graph-update'));
        
        try {
            // Robust URL construction
            const sourceUrl = this.state.activeSource.url;
            // Get base dir: "https://site.com/repo/data/" from "https://site.com/repo/data/data.json"
            const baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/') + 1);
            
            // This works for both local and remote if structure is maintained (data.json + nodes/)
            const url = `${baseDir}nodes/${node.apiPath}.json`;
            
            const res = await fetch(url);
            if (res.ok) {
                node.children = await res.json();
                node.hasUnloadedChildren = false;
            } else {
                const msg = `Failed to load children: Server responded with ${res.status}`;
                console.error(msg);
                this.update({ lastErrorMessage: msg });
                setTimeout(() => this.update({ lastErrorMessage: null }), 5000);
            }
        } catch(e) { 
            console.error(e); 
            this.update({ lastErrorMessage: "Network error loading node: " + e.message });
            setTimeout(() => this.update({ lastErrorMessage: null }), 5000);
        }
        finally {
            node.status = 'available';
            this.dispatchEvent(new CustomEvent('graph-update'));
        }
    }

    // --- UI Actions (Content) ---

    goHome() {
        this.update({
            viewMode: 'explore',
            selectedNode: null,
            previewNode: null,
            modal: null
        });
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

    markComplete(nodeId, forceState = null) {
        let isComplete = this.state.completedNodes.has(nodeId);
        let shouldAdd = false;
        
        if (forceState !== null) {
            shouldAdd = forceState;
        } else {
            shouldAdd = !isComplete; // Toggle default
        }

        if (shouldAdd) {
             this.state.completedNodes.add(nodeId);
        } else {
             this.state.completedNodes.delete(nodeId);
        }
        
        localStorage.setItem('arbor-progress', JSON.stringify([...this.state.completedNodes]));
        this.update({}); 
        this.dispatchEvent(new CustomEvent('graph-update'));

        if (googleDrive.userProfile) {
            clearTimeout(this.saveTimer);
            this.saveTimer = setTimeout(() => googleDrive.saveProgress(this.state.completedNodes), 2000);
        }
    }

    isCompleted(id) { return this.state.completedNodes.has(id); }

    getModulesStatus() {
        if (!this.state.data || !this.state.data.children) return [];
        const modules = [];
        
        this.state.data.children.forEach(topLevelNode => {
            if (topLevelNode.type !== 'branch') return; // Ignore loose files at root

            let total = 0;
            let completed = 0;

            // 1. Try to use pre-calculated Total from data.json (Metadata)
            if (typeof topLevelNode.totalLeaves === 'number' && topLevelNode.totalLeaves > 0) {
                 total = topLevelNode.totalLeaves;
            }

            // 2. Count completed leaves if not available
            if (total === 0) {
                const countLeaves = (node) => {
                    if (node.type === 'leaf') {
                        total++;
                    } else if (node.children) {
                        node.children.forEach(countLeaves);
                    }
                };
                countLeaves(topLevelNode);
            }

            // Calculate Completed
            this.state.completedNodes.forEach(id => {
                if (id.startsWith(topLevelNode.id + '__')) {
                    completed++;
                }
            });

            if (total > 0) {
                modules.push({
                    id: topLevelNode.id,
                    name: topLevelNode.name,
                    icon: topLevelNode.icon,
                    description: topLevelNode.description,
                    totalLeaves: total,
                    completedLeaves: completed,
                    isComplete: completed >= total, // >= just in case of weird sync states
                    path: topLevelNode.name
                });
            }
        });
        
        return modules.sort((a,b) => b.isComplete === a.isComplete ? 0 : (b.isComplete ? 1 : -1));
    }
}

export const store = new Store();
