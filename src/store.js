
import { UI_LABELS, AVAILABLE_LANGUAGES } from './i18n.js';
import { github } from './services/github.js';
import { aiService } from './services/ai.js';

const OFFICIAL_DOMAINS = [
    'treesys-org.github.io',
    'localhost',
    '127.0.0.1',
    'raw.githubusercontent.com'
];

const DEFAULT_SOURCES = [
    {
        id: 'default-arbor',
        name: 'Arbor Knowledge (Official)',
        url: 'https://raw.githubusercontent.com/treesys-org/arbor-knowledge/main/data/data.json',
        isDefault: true,
        isTrusted: true
    }
];

// Determine specific fruits for modules deterministically
const FRUIT_TYPES = ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍒', '🍑', '🍍', '🥥'];

class Store extends EventTarget {
    constructor() {
        super();
        this.state = {
            theme: localStorage.getItem('arbor-theme') || 'light',
            lang: localStorage.getItem('arbor-lang') || 'EN',
            sources: [],
            activeSource: null,
            data: null, // Current Tree Root (Lazy Loaded)
            searchIndex: [], // Flat list of ALL nodes (The Oracle)
            path: [], 
            completedNodes: new Set(),
            // Gamification State
            gamification: {
                xp: 0, // Lifetime XP
                dailyXP: 0,
                streak: 0,
                lastLoginDate: null, // YYYY-MM-DD
                fruits: [] // Array of { id: moduleId, icon: '🍎', date: timestamp }
            },
            // AI State
            ai: {
                status: 'idle', // idle, loading, ready, error
                progress: '',
                messages: [] 
            },
            selectedNode: null, 
            previewNode: null,
            loading: true,
            error: null,
            lastErrorMessage: null,
            viewMode: 'explore', 
            modal: null, 
            lastActionMessage: null,
            githubUser: null
        };
        
        this.loadProgress();
        this.checkStreak(); // Run daily check
        this.loadSources();
        
        const ghToken = localStorage.getItem('arbor-gh-token') || sessionStorage.getItem('arbor-gh-token');
        if (ghToken) {
            github.initialize(ghToken).then(user => {
                 if (user) this.update({ githubUser: user });
            });
        }

        document.documentElement.classList.toggle('dark', this.state.theme === 'dark');
    }

    get ui() { return UI_LABELS[this.state.lang]; }
    get value() { return this.state; }
    get availableLanguages() { return AVAILABLE_LANGUAGES; }
    get currentLangInfo() { return AVAILABLE_LANGUAGES.find(l => l.code === this.state.lang); }
    
    get dailyXpGoal() { return 50; }

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

    setTheme(theme) { this.update({ theme }); }
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

    isUrlTrusted(urlStr) {
        try {
            const url = new URL(urlStr, window.location.href);
            return OFFICIAL_DOMAINS.includes(url.hostname);
        } catch { return false; }
    }

    loadSources() {
        let sources = [];
        try { sources = JSON.parse(localStorage.getItem('arbor-sources')) || []; } catch(e) {}
        const mergedSources = [...DEFAULT_SOURCES];
        sources.forEach(s => {
            if (!DEFAULT_SOURCES.find(d => d.id === s.id)) mergedSources.push(s);
        });
        localStorage.setItem('arbor-sources', JSON.stringify(mergedSources));
        
        const savedActiveId = localStorage.getItem('arbor-active-source-id');
        let activeSource = mergedSources.find(s => s.id === savedActiveId);
        if (!activeSource) activeSource = mergedSources.find(s => s.id === 'default-arbor');

        this.update({ sources: mergedSources, activeSource });
        this.loadData(activeSource);
    }

    addSource(url) {
        if (!url) return;
        const isTrusted = this.isUrlTrusted(url);
        let name = 'New Tree';
        try { name = new URL(url, window.location.href).hostname; } catch (e) {}
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
            const fallback = newSources.find(s => s.id === 'default-arbor') || newSources[0];
            this.loadAndSmartMerge(fallback.id);
        }
    }

    async loadAndSmartMerge(sourceId) {
        const source = this.state.sources.find(s => s.id === sourceId);
        if (!source) return;
        this.loadData(source);
    }

    async loadData(source) {
        this.update({ loading: true, error: null, activeSource: source });
        localStorage.setItem('arbor-active-source-id', source.id);

        try {
            const url = `${source.url}?t=${Date.now()}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Failed to fetch data from ${source.name} (Status ${res.status}).`);
            const json = await res.json();
            
            const searchUrl = source.url.replace('data.json', 'search-index.json');
            const searchRes = await fetch(searchUrl).catch(() => null);
            let searchIndex = searchRes && searchRes.ok ? await searchRes.json() : [];

            let langData = json.languages?.[this.state.lang] || Object.values(json.languages)[0];
            
            if (json.universeName && json.universeName !== source.name) {
                const updatedSources = this.state.sources.map(s => s.id === source.id ? {...s, name: json.universeName} : s);
                this.update({ sources: updatedSources });
                localStorage.setItem('arbor-sources', JSON.stringify(updatedSources));
            }
            
            // --- NEW: Apply i18n prefix to exam names ---
            const examPrefix = this.ui.examLabelPrefix;
            if (examPrefix) {
                const applyPrefix = (node) => {
                    if (node.type === 'exam' && !node.name.startsWith(examPrefix)) {
                        node.name = examPrefix + node.name;
                    }
                };
                
                // Apply to main data tree
                const traverse = (node) => {
                    applyPrefix(node);
                    if (node.children) node.children.forEach(traverse);
                };
                traverse(langData);

                // Apply to search index
                searchIndex.forEach(node => applyPrefix(node));
            }
            // --- END NEW ---

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

    // Helper: Strip accents and lowercase for robust comparison
    cleanString(str) {
        if (!str) return "";
        return str.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
            .replace(/[^a-z0-9]/g, ""); // Remove non-alphanumeric
    }

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
    
    getTopLevelModule(nodeId) {
        let curr = this.findNode(nodeId);
        if (!curr) {
            return null;
        }

        // Traverse upwards until we find a node whose parent is the Root
        while(curr.parentId) {
            const parent = this.findNode(curr.parentId);
            if (!parent) break; 
            
            // If the parent is the Language Root, then 'curr' is the Top Level Module
            if (parent.type === 'root') return curr; 
            
            curr = parent;
        }
        // Fallback: If we are already at top level or structure is flat
        return curr;
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
            if (node.type === 'leaf' || node.type === 'exam') leaves.push(node);
            if (node.children) node.children.forEach(traverse);
        };
        traverse(this.state.data);
        const currentIndex = leaves.findIndex(n => n.id === this.state.selectedNode.id);
        if (currentIndex !== -1 && currentIndex < leaves.length - 1) {
            const nextNode = leaves[currentIndex + 1];
            await this.navigateTo(nextNode.id);
            this.update({ selectedNode: nextNode, previewNode: null });
        } else {
            this.closeContent();
        }
    }

    async toggleNode(nodeId) {
        const node = this.findNode(nodeId);
        if (!node) return;
        try {
            let path = [];
            let curr = node;
            while(curr) {
                path.unshift(curr);
                curr = curr.parentId ? this.findNode(curr.parentId) : null;
            }
            this.update({ path });

            if (!node.expanded) {
                if (node.parentId) {
                    const parent = this.findNode(node.parentId);
                    if (parent && parent.children) {
                        parent.children.forEach(sibling => {
                            if (sibling.id !== nodeId && sibling.expanded) this.collapseRecursively(sibling);
                        });
                    }
                }
            }

            if (node.type === 'leaf' || node.type === 'exam') {
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

        } catch (e) {
            console.error(e);
            this.update({ lastErrorMessage: "Error interacting with node: " + e.message });
            setTimeout(() => this.update({ lastErrorMessage: null }), 5000);
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
            const sourceUrl = this.state.activeSource.url;
            const baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/') + 1);
            const url = `${baseDir}nodes/${node.apiPath}.json?t=${Date.now()}`;
            
            const res = await fetch(url);
            if (res.ok) {
                let text = await res.text();
                if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                node.children = JSON.parse(text.trim());

                // --- NEW: Apply prefix to newly loaded children ---
                const examPrefix = this.ui.examLabelPrefix;
                if (examPrefix) {
                    node.children.forEach(child => {
                        if (child.type === 'exam' && !child.name.startsWith(examPrefix)) {
                            child.name = examPrefix + child.name;
                        }
                    });
                }
                // --- END NEW ---

                node.hasUnloadedChildren = false;
            } else {
                throw new Error(`Failed to load children: ${node.apiPath}.json`);
            }
        } catch(e) { 
            console.error(e);
            this.update({ lastErrorMessage: e.message });
        } finally {
            node.status = 'available';
            this.dispatchEvent(new CustomEvent('graph-update'));
        }
    }

    goHome() {
        this.update({ viewMode: 'explore', selectedNode: null, previewNode: null, modal: null });
    }
    enterLesson() {
        if (this.state.previewNode) this.update({ selectedNode: this.state.previewNode, previewNode: null });
    }
    closePreview() { this.update({ previewNode: null }); }
    closeContent() { this.update({ selectedNode: null }); }
    openEditor(node) { if (node) this.update({ modal: { type: 'editor', node: node } }); }
    search(query) {
        if (!query) return [];
        const q = this.cleanString(query);
        return this.state.searchIndex.filter(n => 
            n.lang === this.state.lang && 
            (this.cleanString(n.name).includes(q) || (n.description && this.cleanString(n.description).includes(q)))
        );
    }

    // --- AI / SAGE LOGIC ---

    async initSage() {
        this.update({ ai: { ...this.state.ai, status: 'loading', progress: '0%' } });
        
        aiService.setCallback((progressReport) => {
             this.update({ ai: { ...this.state.ai, progress: progressReport.text } });
        });

        try {
            await aiService.initialize();
            
            // Initial Welcome Message
            const msgs = [{ role: 'assistant', content: "🦉 Hoot hoot! I am awake. Ask me anything." }];
            if (this.state.lang === 'ES') {
                msgs[0].content = "🦉 ¡Huu huu! Estoy despierto. Pregúntame lo que quieras.";
            }

            this.update({ ai: { ...this.state.ai, status: 'ready', messages: msgs } });
        } catch (e) {
            console.error(e);
            this.update({ ai: { ...this.state.ai, status: 'error', progress: e.message } });
        }
    }

    async chatWithSage(userText) {
        const currentMsgs = [...this.state.ai.messages, { role: 'user', content: userText }];
        this.update({ ai: { ...this.state.ai, status: 'thinking', messages: currentMsgs } });

        try {
            const contextNode = this.state.selectedNode || this.state.previewNode;
            
            // Pass full messages history to AI Service, plus Context Node for RAG
            const responseObj = await aiService.chat(currentMsgs, contextNode);
            
            let finalText = responseObj.text;
            
            // Append Sources if available (Google Search Grounding)
            if (responseObj.sources && responseObj.sources.length > 0) {
                finalText += `\n\n**Fuentes:**\n` + responseObj.sources.map(s => `• [${s.title}](${s.url})`).join('\n');
            }

            const newMsgs = [...currentMsgs, { role: 'assistant', content: finalText }];
            this.update({ ai: { ...this.state.ai, status: 'ready', messages: newMsgs } });

        } catch (e) {
            const errorMsg = this.state.lang === 'ES' ? 'Error al pensar...' : 'Error thinking...';
            const newMsgs = [...currentMsgs, { role: 'assistant', content: `🦉 ${errorMsg}` }];
            this.update({ ai: { ...this.state.ai, status: 'ready', messages: newMsgs } });
        }
    }

    // --- GAMIFICATION & PROGRESS LOGIC ---

    loadProgress() {
        try {
            const saved = localStorage.getItem('arbor-progress');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    this.state.completedNodes = new Set(parsed);
                } else if (parsed.progress) {
                    this.state.completedNodes = new Set(parsed.progress);
                    if (parsed.gamification) this.state.gamification = { ...this.state.gamification, ...parsed.gamification };
                }
            }
        } catch(e) {}
    }

    checkStreak() {
        const today = new Date().toISOString().slice(0, 10);
        const { lastLoginDate, streak } = this.state.gamification;

        if (lastLoginDate === today) {
             // Already logged in today, do nothing
        } else if (lastLoginDate) {
            const last = new Date(lastLoginDate);
            const now = new Date(today);
            const diffTime = Math.abs(now - last);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

            if (diffDays === 1) {
                // Streak continues
                this.updateGamification({ streak: streak + 1, lastLoginDate: today, dailyXP: 0 });
                this.update({ lastActionMessage: this.ui.streakKept });
                setTimeout(() => this.update({ lastActionMessage: null }), 3000);
            } else {
                // Streak lost
                this.updateGamification({ streak: 1, lastLoginDate: today, dailyXP: 0 });
            }
        } else {
            // First time ever
            this.updateGamification({ streak: 1, lastLoginDate: today });
        }
    }

    addXP(amount, silent = false) {
        const { gamification } = this.state;
        const newDaily = gamification.dailyXP + amount;
        const newTotal = gamification.xp + amount;
        
        let msg = `+${amount} ${this.ui.xpUnit}`;
        if (gamification.dailyXP < this.dailyXpGoal && newDaily >= this.dailyXpGoal) {
            msg = this.ui.goalReached + " ☀️";
        }

        this.updateGamification({ xp: newTotal, dailyXP: newDaily });
        
        if (!silent) {
            this.update({ lastActionMessage: msg });
            setTimeout(() => this.update({ lastActionMessage: null }), 3000);
        }
    }

    harvestFruit(moduleId) {
        const { gamification } = this.state;
        // Check if already harvested
        if (gamification.fruits.find(f => f.id === moduleId)) return;

        // Deterministic Fruit Picker based on ID string char codes
        const charSum = moduleId.split('').reduce((a,b) => a + b.charCodeAt(0), 0);
        const fruitIcon = FRUIT_TYPES[charSum % FRUIT_TYPES.length];

        const newFruit = { id: moduleId, icon: fruitIcon, date: Date.now() };
        this.updateGamification({ fruits: [...gamification.fruits, newFruit] });
        
        this.update({ lastActionMessage: `${this.ui.fruitHarvested} ${fruitIcon}` });
        setTimeout(() => this.update({ lastActionMessage: null }), 4000);
    }

    updateGamification(updates) {
        this.state.gamification = { ...this.state.gamification, ...updates };
        this.persistProgress();
    }

    markComplete(nodeId, forceState = null) {
        let isComplete = this.state.completedNodes.has(nodeId);
        let shouldAdd = forceState !== null ? forceState : !isComplete;

        if (shouldAdd) {
             if (!isComplete) {
                 this.state.completedNodes.add(nodeId);
                 this.addXP(10); // 10 XP per lesson
             }
        } else {
             this.state.completedNodes.delete(nodeId);
        }
        
        this.persistProgress();
        this.checkForModuleCompletion(nodeId);
    }

    // PATH FLOODING STRATEGY (SIMPLIFIED)
    markBranchComplete(branchId) {
        if (!branchId) return;
        
        // Find the Branch Node in the Search Index to get its path
        const branchEntry = this.state.searchIndex.find(n => n.id === branchId && n.lang === this.state.lang);
        
        if (branchEntry) {
             const parentPath = branchEntry.path;
             const parentPathPrefix = parentPath + ' / ';
             
             // Find all descendant nodes based on path
             const descendants = this.state.searchIndex.filter(n => 
                n.lang === this.state.lang && n.path && (n.path === parentPath || n.path.startsWith(parentPathPrefix))
             );
             
             // Mark them all complete
             descendants.forEach(d => this.state.completedNodes.add(d.id));
        } else {
            // Fallback for safety: mark the branch ID itself anyway
            this.state.completedNodes.add(branchId);
        }
        
        this.state.completedNodes = new Set(this.state.completedNodes); // Force update
        
        this.persistProgress(); 
        this.dispatchEvent(new CustomEvent('graph-update'));
    }

    checkForModuleCompletion(relatedNodeId) {
        const modules = this.getModulesStatus();
        
        modules.forEach(m => {
            if (m.isComplete) {
                if (!this.state.completedNodes.has(m.id)) {
                     this.state.completedNodes.add(m.id);
                     this.persistProgress(); 
                }
                // Don't auto-award certificate here, only harvest fruit
                this.harvestFruit(m.id);
            }
        });
    }

    persistProgress() {
        const payload = {
            progress: Array.from(this.state.completedNodes),
            gamification: this.state.gamification,
            timestamp: Date.now()
        };
        localStorage.setItem('arbor-progress', JSON.stringify(payload));
        this.update({}); 
        this.dispatchEvent(new CustomEvent('graph-update'));
    }

    getExportData() {
        const data = { v: 1, ts: Date.now(), p: Array.from(this.state.completedNodes), g: this.state.gamification };
        return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    }

    downloadProgressFile() {
        const data = { version: 1, timestamp: Date.now(), progress: Array.from(this.state.completedNodes), gamification: this.state.gamification };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `arbor_backup_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    importProgress(input) {
        try {
            let data;
            if (input.trim().startsWith('{')) data = JSON.parse(input);
            else data = JSON.parse(decodeURIComponent(escape(atob(input.trim()))));

            let newProgress = [];
            if (Array.isArray(data)) newProgress = data;
            if (data.progress) newProgress = data.progress;
            if (data.p) newProgress = data.p;

            if (data.g || data.gamification) {
                this.state.gamification = { ...this.state.gamification, ...(data.g || data.gamification) };
            }

            if (!Array.isArray(newProgress)) throw new Error("Invalid Format");

            const merged = new Set([...this.state.completedNodes, ...newProgress]);
            this.update({ completedNodes: merged });
            this.persistProgress();
            
            const modules = this.getModulesStatus();
            modules.forEach(m => {
                if (m.isComplete) this.checkForModuleCompletion(m.id);
            });
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    isCompleted(id) { return this.state.completedNodes.has(id); }

    // MAJOR FIX: Use Robust Strategy for Status Calculation
    getModulesStatus() {
        if (!this.state.searchIndex || this.state.searchIndex.length === 0) {
             return [];
        }

        const allNodes = this.state.searchIndex.filter(n => n.lang === this.state.lang);
        const branches = allNodes.filter(n => n.type === 'branch');
        const leaves = allNodes.filter(n => n.type === 'leaf' || n.type === 'exam');

        const modules = branches.map(branch => {
            let branchLeavesIds = [];
            
            // 1. Memory First: Try to find the live node to use accurate IDs from builder script
            const liveNode = this.findNode(branch.id);
            if (liveNode && liveNode.leafIds && liveNode.leafIds.length > 0) {
                branchLeavesIds = liveNode.leafIds;
            } else {
                // 2. Fallback: Path String Matching from Search Index (More Robust)
                const branchPath = branch.path;
                const branchPathPrefix = branchPath + ' / ';
                const branchLeaves = leaves.filter(l => {
                    return l.path && (l.path.startsWith(branchPathPrefix));
                });
                branchLeavesIds = branchLeaves.map(l => l.id);
            }
            
            const total = branchLeavesIds.length;
            
            let isComplete = this.state.completedNodes.has(branch.id);
            
            let completedCount = 0;
            if (isComplete) {
                completedCount = total; 
            } else {
                completedCount = branchLeavesIds.filter(id => this.state.completedNodes.has(id)).length;
                if (total > 0 && completedCount >= total) isComplete = true;
            }

            return {
                id: branch.id,
                name: branch.name,
                icon: branch.icon,
                description: branch.description,
                totalLeaves: total,
                completedLeaves: completedCount,
                isComplete: isComplete,
                path: branch.path,
                isCertifiable: branch.isCertifiable || false // Use new flag
            };
        });

        return modules.filter(m => m.totalLeaves > 0 || m.isComplete)
                      .sort((a,b) => b.isComplete === a.isComplete ? 0 : (b.isComplete ? 1 : -1));
    }
}

export const store = new Store();
