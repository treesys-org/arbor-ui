

import { AVAILABLE_LANGUAGES } from './i18n.js';
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

// BOTANICAL SEEDS: More universal concept for knowledge trees
// Pinecone, Acorn, Wheat, Leaf, Coconut, Peanut, Chestnut, Bean, Mushroom, Seedling
const SEED_TYPES = ['🌲', '🌰', '🌾', '🍁', '🥥', '🥜', '🌰', '🫘', '🍄', '🌱'];

class Store extends EventTarget {
    constructor() {
        super();
        this.state = {
            theme: localStorage.getItem('arbor-theme') || 'light',
            lang: localStorage.getItem('arbor-lang') || 'EN',
            i18nData: null, 
            sources: [],
            activeSource: null,
            data: null, 
            
            searchCache: {}, 
            
            path: [], 
            completedNodes: new Set(),
            // Gamification State
            gamification: {
                xp: 0, 
                dailyXP: 0,
                streak: 0,
                lastLoginDate: null, 
                seeds: [] // Changed from fruits to seeds
            },
            // AI State
            ai: {
                status: 'idle', 
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
        
        this.initialize().then(() => {
             this.loadProgress();
             this.checkStreak();
             this.loadSources();
        });

        const ghToken = localStorage.getItem('arbor-gh-token') || sessionStorage.getItem('arbor-gh-token');
        if (ghToken) {
            github.initialize(ghToken).then(user => {
                 if (user) this.update({ githubUser: user });
            });
        }

        document.documentElement.classList.toggle('dark', this.state.theme === 'dark');
    }

    async initialize() {
        await this.loadLanguage(this.state.lang);
        
        const welcomeSeen = localStorage.getItem('arbor-welcome-seen');
        if (!welcomeSeen) {
            setTimeout(() => {
                this.setModal('welcome');
            }, 50); 
        }
    }

    async loadLanguage(langCode) {
        try {
            const path = `./locales/${langCode.toLowerCase()}.json`;
            const res = await fetch(path);
            if (!res.ok) throw new Error(`Missing language file: ${path}`);
            const data = await res.json();
            this.update({ i18nData: data });
        } catch (e) {
            console.error("Language load failed, falling back to EN", e);
            if (langCode !== 'EN') await this.loadLanguage('EN');
        }
    }

    get ui() { 
        return this.state.i18nData || {}; 
    }
    
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
    
    async setLanguage(lang) { 
        if(this.state.lang !== lang) {
            this.update({ lang, searchCache: {} });
            await this.loadLanguage(lang); 
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
        if (!source) return;
        this.update({ loading: true, error: null, activeSource: source });
        localStorage.setItem('arbor-active-source-id', source.id);

        try {
            const url = source.url; 
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!res.ok) throw new Error(`Failed to fetch data from ${source.name} (Status ${res.status}).`);
            const json = await res.json();
            
            if (!this.state.i18nData) await this.loadLanguage(this.state.lang);

            let langData = json.languages?.[this.state.lang] || Object.values(json.languages)[0];
            
            if (json.universeName && json.universeName !== source.name) {
                const updatedSources = this.state.sources.map(s => s.id === source.id ? {...s, name: json.universeName} : s);
                this.update({ sources: updatedSources });
                localStorage.setItem('arbor-sources', JSON.stringify(updatedSources));
            }
            
            const examPrefix = this.ui.examLabelPrefix || "Exam: ";
            if (examPrefix) {
                const applyPrefix = (node) => {
                    if (node.type === 'exam' && !node.name.startsWith(examPrefix)) {
                        node.name = examPrefix + node.name;
                    }
                };
                const traverse = (node) => {
                    applyPrefix(node);
                    if (node.children) node.children.forEach(traverse);
                };
                traverse(langData);
            }

            this.update({ 
                data: langData, 
                loading: false, 
                path: [langData], 
                lastActionMessage: this.ui.sourceSwitchSuccess 
            });
            
            this.dispatchEvent(new CustomEvent('graph-update'));
            setTimeout(() => this.update({ lastActionMessage: null }), 3000);
        } catch (e) {
            console.error(e);
            const msg = e.name === 'AbortError' ? 'Connection timed out (15s).' : e.message;
            this.update({ loading: false, error: msg });
        }
    }

    cleanString(str) {
        if (!str) return "";
        return str.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
            .replace(/[^a-z0-9\s]/g, ""); 
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
    
    async navigateTo(nodeId, nodeData = null) {
        if (!nodeData) {
            const inTree = this.findNode(nodeId);
            if (inTree) nodeData = inTree;
            else {
                console.error("Cannot navigate: Node not found in memory or search result.");
                return;
            }
        }

        const pathStr = nodeData.path || nodeData.p;
        if (!pathStr) return;

        const pathNames = pathStr.split(' / ');
        let currentNode = this.state.data;
        
        for (let i = 1; i < pathNames.length; i++) {
            const ancestorName = pathNames[i];
            
            if (currentNode.hasUnloadedChildren) {
                await this.loadNodeChildren(currentNode);
            }

            let nextNode = currentNode.children?.find(child => child.name === ancestorName);

            if (!nextNode && currentNode.children) {
                const cleanTarget = this.cleanString(ancestorName).replace(/\s+/g, '');
                nextNode = currentNode.children.find(child => {
                     const cleanChild = this.cleanString(child.name).replace(/\s+/g, '');
                     if (cleanChild === cleanTarget) return true;
                     if (child.name.includes(ancestorName)) return true;
                     return false;
                });
            }

            if (!nextNode) return;

            if (nextNode.type === 'branch' || nextNode.type === 'root') {
                nextNode.expanded = true;
            }
            currentNode = nextNode;
        }

        this.dispatchEvent(new CustomEvent('graph-update'));
        
        setTimeout(() => {
            this.toggleNode(nodeId);
            this.dispatchEvent(new CustomEvent('focus-node', { detail: nodeId }));
        }, 100);
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
            await this.navigateTo(nextNode.id, nextNode);
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
            const url = `${baseDir}nodes/${node.apiPath}.json`;
            
            const res = await fetch(url);
            if (res.ok) {
                let text = await res.text();
                if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                const children = JSON.parse(text.trim());
                
                if (children.length === 0) {
                    node.children = [];
                    this.setModal({ type: 'emptyModule', node: node });
                } else {
                    children.forEach(child => child.parentId = node.id);
                    node.children = children;

                    const examPrefix = this.ui.examLabelPrefix || "Exam: ";
                    if (examPrefix) {
                        node.children.forEach(child => {
                            if (child.type === 'exam' && !child.name.startsWith(examPrefix)) {
                                child.name = examPrefix + child.name;
                            }
                        });
                    }
                }
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
        this.dispatchEvent(new CustomEvent('reset-zoom'));
    }
    enterLesson() {
        if (this.state.previewNode) this.update({ selectedNode: this.state.previewNode, previewNode: null });
    }
    closePreview() { this.update({ previewNode: null }); }
    closeContent() { this.update({ selectedNode: null }); }
    openEditor(node) { if (node) this.update({ modal: { type: 'editor', node: node } }); }
    
    async search(query) {
        if (!query || query.length < 2) return [];
        const q = this.cleanString(query);
        const prefix = q.substring(0, 2); 
        const lang = this.state.lang;
        const cacheKey = `${lang}_${prefix}`;

        if (!this.state.searchCache[cacheKey]) {
            try {
                const sourceUrl = this.state.activeSource.url;
                const baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/') + 1);
                const firstChar = prefix.charAt(0);
                const url = `${baseDir}search/${lang}/${firstChar}/${prefix}.json`;
                
                const res = await fetch(url);
                if (res.ok) {
                    const shard = await res.json();
                    
                    const normalized = shard.map(item => ({
                        id: item.id,
                        name: item.n || item.name,
                        type: item.t || item.type,
                        icon: item.i || item.icon,
                        description: item.d || item.description,
                        path: item.p || item.path,
                        lang: item.l || item.lang
                    }));
                    
                    this.state.searchCache[cacheKey] = normalized;
                } else {
                    this.state.searchCache[cacheKey] = [];
                }
            } catch (e) {
                console.warn(`Search shard not found for prefix ${prefix}`);
                this.state.searchCache[cacheKey] = [];
            }
        }

        const shard = this.state.searchCache[cacheKey] || [];
        return shard.filter(n => {
            return this.cleanString(n.name).includes(q);
        });
    }

    async searchBroad(char) {
        if (!char || char.length !== 1) return [];
        const c = this.cleanString(char);
        const lang = this.state.lang;
        
        const suffixes = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
        const prefixes = suffixes.map(s => c + s);
        
        const sourceUrl = this.state.activeSource.url;
        const baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/') + 1);
        
        const promises = prefixes.map(async (prefix) => {
            const cacheKey = `${lang}_${prefix}`;
            if (this.state.searchCache[cacheKey]) return this.state.searchCache[cacheKey];
            try {
                const url = `${baseDir}search/${lang}/${c}/${prefix}.json`;
                const res = await fetch(url);
                if (res.ok) {
                    const shard = await res.json();
                    const normalized = shard.map(item => ({
                        id: item.id,
                        name: item.n || item.name,
                        type: item.t || item.type,
                        icon: item.i || item.icon,
                        description: item.d || item.description,
                        path: item.p || item.path,
                        lang: item.l || item.lang
                    }));
                    this.state.searchCache[cacheKey] = normalized;
                    return normalized;
                }
            } catch(e) { }
            this.state.searchCache[cacheKey] = [];
            return [];
        });

        const results = await Promise.all(promises);
        const flat = results.flat();
        const seen = new Set();
        return flat.filter(item => {
            if(seen.has(item.id)) return false;
            const words = this.cleanString(item.name).split(/\s+/);
            const matchesInitial = words.some(w => w.startsWith(c));
            if (!matchesInitial) return false; 
            seen.add(item.id);
            return true;
        });
    }

    // --- AI / SAGE LOGIC ---

    async initSage() {
        this.update({ ai: { ...this.state.ai, status: 'loading', progress: '0%' } });
        
        aiService.setCallback((progressReport) => {
             this.update({ ai: { ...this.state.ai, progress: progressReport.text } });
        });

        try {
            await aiService.initialize();
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

    abortSage() {
        aiService.abort();
        this.update({ ai: { ...this.state.ai, status: 'ready' } });
    }

    clearSageChat() {
        const initial = [{ role: 'assistant', content: this.state.lang === 'ES' ? "🦉 ¡Huu huu! Estoy despierto. Pregúntame lo que quieras." : "🦉 Hoot hoot! I am awake. Ask me anything." }];
        this.update({ ai: { ...this.state.ai, messages: initial, status: 'ready' } });
    }

    async chatWithSage(userText) {
        const currentMsgs = [...this.state.ai.messages, { role: 'user', content: userText }];
        this.update({ ai: { ...this.state.ai, status: 'thinking', messages: currentMsgs } });

        try {
            const contextNode = this.state.selectedNode || this.state.previewNode;
            const responseObj = await aiService.chat(currentMsgs, contextNode);
            let finalText = responseObj.text;
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
                    if (parsed.gamification) {
                        this.state.gamification = { ...this.state.gamification, ...parsed.gamification };
                        
                        // MIGRATION: Fruits -> Seeds
                        if (parsed.gamification.fruits && !parsed.gamification.seeds) {
                            this.state.gamification.seeds = parsed.gamification.fruits.map(f => ({
                                ...f,
                                icon: SEED_TYPES[0] // Default to first seed icon during migration
                            }));
                        }
                    }
                }
            }
        } catch(e) {}
    }

    checkStreak() {
        const today = new Date().toISOString().slice(0, 10);
        const { lastLoginDate, streak } = this.state.gamification;

        if (lastLoginDate === today) {
        } else if (lastLoginDate) {
            const last = new Date(lastLoginDate);
            const now = new Date(today);
            const diffTime = Math.abs(now - last);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

            if (diffDays === 1) {
                this.updateGamification({ streak: streak + 1, lastLoginDate: today, dailyXP: 0 });
                this.update({ lastActionMessage: this.ui.streakKept });
                setTimeout(() => this.update({ lastActionMessage: null }), 3000);
            } else {
                this.updateGamification({ streak: 1, lastLoginDate: today, dailyXP: 0 });
            }
        } else {
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

    harvestSeed(moduleId) {
        const { gamification } = this.state;
        if (gamification.seeds.find(f => f.id === moduleId)) return;

        const charSum = moduleId.split('').reduce((a,b) => a + b.charCodeAt(0), 0);
        const seedIcon = SEED_TYPES[charSum % SEED_TYPES.length];

        const newSeed = { id: moduleId, icon: seedIcon, date: Date.now() };
        this.updateGamification({ seeds: [...gamification.seeds, newSeed] });
        
        this.update({ lastActionMessage: `${this.ui.seedCollected} ${seedIcon}` });
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

    markBranchComplete(branchId) {
        if (!branchId) return;
        
        this.state.completedNodes.add(branchId);
        const branchNode = this.findNode(branchId);
        
        if (branchNode) {
            const markLoadedRecursive = (node) => {
                this.state.completedNodes.add(node.id);
                if (node.children) {
                    node.children.forEach(markLoadedRecursive);
                }
            };
            if (branchNode.children) {
                branchNode.children.forEach(markLoadedRecursive);
            }
            if (branchNode.leafIds && Array.isArray(branchNode.leafIds)) {
                branchNode.leafIds.forEach(id => this.state.completedNodes.add(id));
            }
        }
        
        this.state.completedNodes = new Set(this.state.completedNodes); 
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
                this.harvestSeed(m.id);
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

    // Simple Copy to Clipboard utility
    copyExportToClipboard() {
        const data = this.getExportData();
        navigator.clipboard.writeText(data).then(() => {
            alert(this.ui.copySuccess || "Copied to clipboard!");
        });
    }

    importProgress(input) {
        try {
            let data;
            const cleaned = input.trim();
            if (cleaned.startsWith('{')) data = JSON.parse(cleaned);
            else data = JSON.parse(decodeURIComponent(escape(atob(cleaned))));

            let newProgress = [];
            if (Array.isArray(data)) newProgress = data;
            if (data.progress) newProgress = data.progress;
            if (data.p) newProgress = data.p;

            if (data.g || data.gamification) {
                this.state.gamification = { ...this.state.gamification, ...(data.g || data.gamification) };
                
                // Ensure seeds migration on import too
                if (this.state.gamification.fruits && !this.state.gamification.seeds) {
                    this.state.gamification.seeds = this.state.gamification.fruits;
                }
            }

            if (!Array.isArray(newProgress)) throw new Error("Invalid Format");

            const merged = new Set([...this.state.completedNodes, ...newProgress]);
            this.update({ completedNodes: merged });
            this.persistProgress();
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    isCompleted(id) { return this.state.completedNodes.has(id); }

    getModulesStatus() {
        if (!this.state.data) return [];
        
        const modules = [];
        const traverse = (node) => {
            if (node.type === 'branch' || node.type === 'root') {
                 const total = node.totalLeaves || 0;
                 if (total > 0 || node.type === 'branch') {
                     let completedCount = 0;
                     if (this.state.completedNodes.has(node.id)) {
                         completedCount = total;
                     } else if (node.leafIds) {
                         completedCount = node.leafIds.filter(id => this.state.completedNodes.has(id)).length;
                     }
                     
                     const isComplete = this.state.completedNodes.has(node.id) || (total > 0 && completedCount >= total);

                     if (node.type !== 'root') {
                        modules.push({
                            id: node.id,
                            name: node.name,
                            icon: node.icon,
                            description: node.description,
                            totalLeaves: total,
                            completedLeaves: completedCount,
                            isComplete: isComplete,
                            path: node.path,
                            isCertifiable: node.isCertifiable
                        });
                     }
                 }
            }
            if (node.children) node.children.forEach(traverse);
        };
        
        traverse(this.state.data);
        return modules.sort((a,b) => b.isComplete === a.isComplete ? 0 : (b.isComplete ? 1 : -1));
    }
}

export const store = new Store();
