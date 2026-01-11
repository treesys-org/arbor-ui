

import { AVAILABLE_LANGUAGES } from './i18n.js';
import { github } from './services/github.js';
import { aiService } from './services/ai.js';
import { puterSync } from './services/puter-sync.js';
import { UserStore } from './stores/user-store.js';
import { SourceManager } from './stores/source-manager.js';
import { TreeUtils } from './utils/tree-utils.js';

class Store extends EventTarget {
    constructor() {
        super();
        
        // 1. User Persistence Sub-Store
        this.userStore = new UserStore(
            () => this.ui,
            (data) => this.handleAutoSync(data) 
        );

        // 2. Initial State
        this.state = {
            theme: localStorage.getItem('arbor-theme') || 'light',
            lang: localStorage.getItem('arbor-lang') || 'EN',
            i18nData: null, 
            
            // Source & Data State (Managed via SourceManager)
            communitySources: [], 
            activeSource: null,
            availableReleases: [],
            manifestUrlAttempted: null, 
            
            data: null, // Current Language Tree
            rawGraphData: null, // Full JSON
            
            searchCache: {}, 
            path: [], 
            
            // AI State
            ai: { status: 'idle', progress: '', messages: [] },
            
            // Cloud Sync State
            puterUser: null,
            isSyncing: false,
            lastSyncTime: null,

            // UI State
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

        // 3. Source Manager (Networking & Manifests)
        this.sourceManager = new SourceManager(
            (updates) => this.update(updates),
            () => this.ui
        );
        
        // 4. Initialization
        this.initialize().then(async () => {
             const streakMsg = this.userStore.checkStreak();
             if (streakMsg) this.notify(streakMsg);
             
             // Initial Source Load
             const source = await this.sourceManager.init();
             if (source) {
                 this.loadData(source);
             }
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
        const pUser = await puterSync.initialize();
        if (pUser) this.update({ puterUser: pUser });

        const welcomeSeen = localStorage.getItem('arbor-welcome-seen');
        if (!welcomeSeen) setTimeout(() => this.setModal('welcome'), 50); 
    }

    // --- PROXY ACCESSORS ---
    
    get ui() { 
        if (!this.state.i18nData) {
            return new Proxy({}, {
                get: (target, prop) => {
                    if (prop === 'welcomeSteps') return Array(5).fill({ title: 'Loading...', text: '...', icon: '...' });
                    return String(prop);
                }
            });
        }
        return this.state.i18nData; 
    }
    
    get value() { 
        return { 
            ...this.state,
            completedNodes: this.userStore.state.completedNodes,
            bookmarks: this.userStore.state.bookmarks,
            gamification: this.userStore.state.gamification
        }; 
    }
    
    get availableLanguages() { return AVAILABLE_LANGUAGES; }
    get currentLangInfo() { return AVAILABLE_LANGUAGES.find(l => l.code === this.state.lang); }
    get dailyXpGoal() { return this.userStore.dailyXpGoal; }

    // --- STATE MANAGEMENT ---

    update(partialState) {
        this.state = { ...this.state, ...partialState };
        this.dispatchEvent(new CustomEvent('state-change', { detail: this.value }));
        
        if (partialState.theme) {
            document.documentElement.classList.toggle('dark', this.state.theme === 'dark');
            localStorage.setItem('arbor-theme', this.state.theme);
        }
        if (partialState.lang) {
            localStorage.setItem('arbor-lang', this.state.lang);
        }
    }
    
    notify(msg) {
        this.update({ lastActionMessage: msg });
        setTimeout(() => this.update({ lastActionMessage: null }), 3000);
    }

    // --- SOURCE & DATA DELEGATION ---

    async loadData(source, forceRefresh = true) {
        try {
            const rawJson = await this.sourceManager.loadData(source, this.state.lang, forceRefresh, this.state.rawGraphData);
            this.processLoadedData(rawJson);
        } catch(e) {
            // Error handling is managed inside SourceManager -> update({error})
        }
    }

    processLoadedData(json) {
        try {
            // Fallback for lang
            if (!this.state.i18nData) this.loadLanguage(this.state.lang);

            let langData = null;
            if (json && json.languages) {
                langData = json.languages[this.state.lang];
                if (!langData) {
                    const availableLangs = Object.keys(json.languages);
                    if (availableLangs.length > 0) langData = json.languages[availableLangs[0]];
                }
            }

            if (!langData) {
                this.update({ loading: false, error: "No valid content found in this tree." });
                return;
            }
            
            // Post-processing (Exam Prefixes)
            const examPrefix = this.ui.examLabelPrefix || "Exam: ";
            if (examPrefix) {
                const applyPrefix = (node) => {
                    if (node.type === 'exam' && !node.name.startsWith(examPrefix)) node.name = examPrefix + node.name;
                };
                const traverse = (node) => {
                    applyPrefix(node);
                    if (node.children) node.children.forEach(traverse);
                };
                traverse(langData);
            }

            this.update({ 
                data: langData, 
                rawGraphData: json,
                loading: false, 
                path: [langData], 
                lastActionMessage: this.ui.sourceSwitchSuccess 
            });
            
            this.dispatchEvent(new CustomEvent('graph-update'));
            setTimeout(() => this.update({ lastActionMessage: null }), 3000);
        } catch (e) {
            console.error("Data Processing Error", e);
            this.update({ loading: false, error: "Failed to process data structure." });
        }
    }

    addCommunitySource(url) { this.sourceManager.addCommunitySource(url); }
    removeCommunitySource(id) { this.sourceManager.removeCommunitySource(id); }
    
    loadAndSmartMerge(sourceId) {
        let source = this.state.availableReleases.find(s => s.id === sourceId) ||
                     this.state.communitySources.find(s => s.id === sourceId);
        if (!source) return;
        this.loadData(source, true);
    }

    // --- LANGUAGE & UI ---

    async loadLanguage(langCode) {
        try {
            const path = `./locales/${langCode.toLowerCase()}.json`;
            const res = await fetch(path, { cache: 'no-cache' });
            if (!res.ok) throw new Error(`Missing language file: ${path}`);
            const data = await res.json();
            this.update({ i18nData: data });
        } catch (e) {
            console.error(`Language load failed for ${langCode}`, e);
            if (langCode !== 'EN') await this.loadLanguage('EN');
            else this.update({ i18nData: { appTitle: "Arbor (Recovery)", loading: "Loading...", errorTitle: "Error", errorNoTrees: "Language Error" }});
        }
    }

    async setLanguage(lang) { 
        if (this.state.lang === lang) return;
        this.update({ loading: true, error: null });
        try {
            await this.loadLanguage(lang); 
            this.update({ lang, searchCache: {} });
            if (this.state.activeSource) await this.loadData(this.state.activeSource, false); 
            else this.update({ loading: false });
            this.goHome();
        } catch (e) {
            this.update({ loading: false, error: `Language error: ${e.message}` });
            if (lang !== 'EN') this.setLanguage('EN');
        }
    }

    setTheme(theme) { this.update({ theme }); }
    toggleTheme() { this.update({ theme: this.state.theme === 'light' ? 'dark' : 'light' }); }
    setModal(modal) { this.update({ modal }); }
    
    setViewMode(viewMode) { 
        this.update({ viewMode });
        if(viewMode === 'certificates') this.update({ modal: null });
    }

    // --- GRAPH & NAVIGATION LOGIC ---

    findNode(id) { return TreeUtils.findNode(id, this.state.data); }
    
    async navigateTo(nodeId, nodeData = null) {
        if (!nodeData) {
            const inTree = this.findNode(nodeId);
            if (inTree) nodeData = inTree;
            else return;
        }

        const pathStr = nodeData.path || nodeData.p;
        if (!pathStr) return;

        const pathNames = pathStr.split(' / ');
        let currentNode = this.state.data;
        
        for (let i = 1; i < pathNames.length; i++) {
            const ancestorName = pathNames[i];
            
            if (currentNode.hasUnloadedChildren) await this.loadNodeChildren(currentNode);

            let nextNode = currentNode.children?.find(child => child.name === ancestorName);

            if (!nextNode && currentNode.children) {
                const cleanTarget = TreeUtils.cleanString(ancestorName).replace(/\s+/g, '');
                nextNode = currentNode.children.find(child => {
                     const cleanChild = TreeUtils.cleanString(child.name).replace(/\s+/g, '');
                     return cleanChild === cleanTarget || child.name.includes(ancestorName);
                });
            }

            if (!nextNode) return;

            if (nextNode.type === 'branch' || nextNode.type === 'root') nextNode.expanded = true;
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
            if (!nextNode.content && nextNode.contentPath) await this.loadNodeContent(nextNode);
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
                this.update({ selectedNode: null, previewNode: null });
                if (!node.expanded) {
                    if (node.hasUnloadedChildren) await this.loadNodeChildren(node);
                    if (!node.children || node.children.length === 0) this.setModal({ type: 'emptyModule', node: node });
                    node.expanded = true;
                } else {
                    this.collapseRecursively(node);
                }
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
                            if (child.type === 'exam' && !child.name.startsWith(examPrefix)) child.name = examPrefix + child.name;
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
    
    async loadNodeContent(node) {
        if (node.content) return;
        if (!node.contentPath) return; 
        
        this.update({ loading: true }); 
        
        try {
            const sourceUrl = this.state.activeSource.url;
            const baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/') + 1);
            const url = `${baseDir}content/${node.contentPath}`;
            
            const res = await fetch(url);
            if(res.ok) {
                const json = await res.json();
                node.content = json.content;
            } else {
                throw new Error(`Content missing for ${node.name}`);
            }
        } catch(e) {
            console.error("Content fetch failed", e);
            node.content = "Error loading content. Please check internet connection.";
        } finally {
            this.update({ loading: false });
        }
    }

    enterLesson() {
        const node = this.state.previewNode;
        if (node) {
             if (!node.content && node.contentPath) this.loadNodeContent(node).then(() => {
                 this.update({ selectedNode: node, previewNode: null });
             });
             else this.update({ selectedNode: node, previewNode: null });
        }
    }

    goHome() {
        this.update({ viewMode: 'explore', selectedNode: null, previewNode: null, modal: null });
        this.dispatchEvent(new CustomEvent('reset-zoom'));
    }
    closePreview() { this.update({ previewNode: null }); }
    closeContent() { this.update({ selectedNode: null }); }
    openEditor(node) { if (node) this.update({ modal: { type: 'editor', node: node } }); }
    
    async search(query) {
        return TreeUtils.search(query, this.state.activeSource, this.state.lang, this.state.searchCache);
    }

    async searchBroad(char) {
        return TreeUtils.searchBroad(char, this.state.activeSource, this.state.lang, this.state.searchCache);
    }

    // --- INTEGRATIONS (AI, Cloud, User) ---

    async initSage() {
        this.update({ ai: { ...this.state.ai, status: 'loading', progress: '0%' } });
        aiService.setCallback((progressReport) => {
             this.update({ ai: { ...this.state.ai, progress: progressReport.text } });
        });
        try {
            await aiService.initialize();
            const msgs = [{ role: 'assistant', content: this.ui.sageHello }];
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
        const initial = [{ role: 'assistant', content: this.ui.sageHello }];
        this.update({ ai: { ...this.state.ai, messages: initial, status: 'ready' } });
    }

    async chatWithSage(userText) {
        const currentMsgs = [...this.state.ai.messages, { role: 'user', content: userText }];
        this.update({ ai: { ...this.state.ai, status: 'thinking', messages: currentMsgs } });

        try {
            let contextNode = this.state.selectedNode || this.state.previewNode;
            if (contextNode && !contextNode.content && contextNode.contentPath) await this.loadNodeContent(contextNode);

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

    // --- PUTER SYNC ---
    async connectPuter() {
        try {
            const user = await puterSync.signIn();
            this.update({ puterUser: user });
            const cloudData = await puterSync.load();
            if (cloudData) {
                this.importProgress(JSON.stringify(cloudData));
                this.notify("Sync complete. Cloud data loaded.");
            } else {
                this.handleAutoSync(this.userStore.getPersistenceData());
                this.notify("Connected. Local data saved to cloud.");
            }
        } catch (e) {
            console.error(e);
            this.notify("Sync Error: " + e.message);
        }
    }

    async disconnectPuter() {
        await puterSync.signOut();
        this.update({ puterUser: null });
        this.notify("Puter disconnected.");
    }

    async handleAutoSync(data) {
        if (this.state.puterUser) {
            this.update({ isSyncing: true });
            try {
                await puterSync.save(data);
                this.update({ lastSyncTime: new Date() });
            } catch (e) {
                console.warn("Background sync failed", e);
            } finally {
                this.update({ isSyncing: false });
            }
        }
    }

    // --- USER STORE PROXIES ---

    computeHash(str) { return this.userStore.computeHash(str); }
    loadBookmarks() { this.userStore.loadBookmarks(); }
    saveBookmark(nodeId, contentRaw, index, visitedSet) { this.userStore.saveBookmark(nodeId, contentRaw, index, visitedSet); }
    getBookmark(nodeId, contentRaw) { return this.userStore.getBookmark(nodeId, contentRaw); }
    loadProgress() { this.userStore.loadProgress(); }
    
    checkStreak() { 
        const msg = this.userStore.checkStreak(); 
        if(msg) this.notify(msg);
        this.update({});
    }

    addXP(amount, silent = false) {
        const msg = this.userStore.addXP(amount);
        if (!silent && msg) this.notify(msg);
        this.update({});
    }

    harvestSeed(moduleId) {
        const msg = this.userStore.harvestSeed(moduleId);
        if(msg) this.notify(msg);
        this.update({});
    }

    updateGamification(updates) {
        this.userStore.updateGamification(updates);
        this.update({});
    }

    updateUserProfile(username, avatar) {
        this.userStore.updateGamification({ username, avatar });
        this.notify(this.ui.profileUpdated);
        this.update({});
    }

    markComplete(nodeId, forceState = null) {
        const xpMsg = this.userStore.markComplete(nodeId, forceState);
        if(xpMsg) this.notify(xpMsg);
        this.update({}); 
        this.checkForModuleCompletion(nodeId);
    }

    markBranchComplete(branchId) {
        if (!branchId) return;
        const branchNode = this.findNode(branchId);
        if (branchNode) {
            const markRecursive = (node) => {
                this.userStore.state.completedNodes.add(node.id);
                if (node.children) node.children.forEach(markRecursive);
            };
            markRecursive(branchNode);
            if (branchNode.leafIds && Array.isArray(branchNode.leafIds)) {
                branchNode.leafIds.forEach(id => this.userStore.state.completedNodes.add(id));
            }
        }
        this.userStore.persist();
        this.update({});
        this.dispatchEvent(new CustomEvent('graph-update'));
    }

    checkForModuleCompletion(relatedNodeId) {
        const modules = this.getModulesStatus();
        modules.forEach(m => {
            if (m.isComplete) {
                if (!this.userStore.state.completedNodes.has(m.id)) {
                     this.userStore.state.completedNodes.add(m.id);
                     this.userStore.persist();
                }
                this.harvestSeed(m.id);
            }
        });
    }

    getExportJson() { return this.userStore.getExportJson(); }

    downloadProgressFile() {
        const data = this.getExportJson();
        const blob = new Blob([data], {type: 'application/json;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        a.download = `arbor-progress-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
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
                this.userStore.state.gamification = { ...this.userStore.state.gamification, ...(data.g || data.gamification) };
                if (this.userStore.state.gamification.fruits && !this.userStore.state.gamification.seeds) {
                    this.userStore.state.gamification.seeds = this.userStore.state.gamification.fruits;
                }
            }
            
            if (data.b || data.bookmarks) {
                this.userStore.state.bookmarks = { ...this.userStore.state.bookmarks, ...(data.b || data.bookmarks) };
                localStorage.setItem('arbor-bookmarks', JSON.stringify(this.state.bookmarks));
            }

            if (!Array.isArray(newProgress)) throw new Error("Invalid Format");

            const merged = new Set([...this.userStore.state.completedNodes, ...newProgress]);
            this.userStore.state.completedNodes = merged;
            this.userStore.persist();
            this.update({});
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    isCompleted(id) { return this.userStore.isCompleted(id); }

    getAvailableCertificates() {
        if (this.state.data && this.state.data.certificates) {
            return this.state.data.certificates.map(c => {
                const isComplete = this.userStore.state.completedNodes.has(c.id);
                return { ...c, isComplete };
            });
        }
        return this.getModulesStatus().filter(m => m.isCertifiable);
    }

    getModulesStatus() {
        return TreeUtils.getModulesStatus(this.state.data, this.userStore.state.completedNodes);
    }
}

export const store = new Store();
