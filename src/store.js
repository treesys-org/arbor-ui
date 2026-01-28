
import { AVAILABLE_LANGUAGES } from './i18n.js';
import { github } from './services/github.js';
import { aiService } from './services/ai.js';
import { puterSync } from './services/puter-sync.js';
import { UserStore } from './stores/user-store.js';
import { SourceManager } from './stores/source-manager.js';
import { TreeUtils } from './utils/tree-utils.js';
import { storageManager } from './stores/storage-manager.js';
import { fileSystem } from './services/filesystem.js';

// --- NEW IMPORTS (Splitting Logic) ---
import { DataProcessor } from './utils/data-processor.js';
import { GraphLogic } from './stores/graph-logic.js';

class Store extends EventTarget {
    constructor() {
        super();
        
        let initialLang = localStorage.getItem('arbor-lang');
        if (!initialLang) {
            const browserLang = navigator.language.split('-')[0].toUpperCase();
            const supportedLang = AVAILABLE_LANGUAGES.find(l => l.code === browserLang);
            initialLang = supportedLang ? supportedLang.code : 'EN';
        }
        
        this._dialogResolver = null;

        this.state = {
            theme: localStorage.getItem('arbor-theme') || 'light',
            lang: initialLang,
            i18nData: null, 
            
            communitySources: [], 
            activeSource: null,
            availableReleases: [],
            manifestUrlAttempted: null, 
            pendingUntrustedSource: null,
            
            data: null, 
            rawGraphData: null,
            
            searchCache: {}, 
            path: [], 
            
            ai: { status: 'idle', progress: '', messages: [] },
            
            puterUser: null,
            isSyncing: false,
            lastSyncTime: null,

            selectedNode: null, 
            previewNode: null,
            loading: true,
            error: null,
            lastErrorMessage: null,
            viewMode: 'explore', 
            constructionMode: false,
            modal: null, 
            lastActionMessage: null,
            githubUser: null
        };

        // 1. Sub-Stores & Managers
        this.userStore = new UserStore(
            () => this.ui,
            (data) => this.handleAutoSync(data) 
        );

        this.sourceManager = new SourceManager(
            (updates) => this.update(updates),
            () => this.ui
        );
        
        // Graph Logic Delegator
        this.graphLogic = new GraphLogic(this);
        
        // 2. Initialization
        this.initialize().then(async () => {
             const streakMsg = this.userStore.checkStreak();
             if (streakMsg) this.notify(streakMsg);
             
             const source = await this.sourceManager.init();
             if (source) {
                 this.loadData(source);
             } else {
                 if (!this.state.modal) {
                     this.update({ loading: false });
                 }
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
        if (!welcomeSeen && !this.state.modal) {
            setTimeout(() => this.setModal('welcome'), 50); 
        }
    }

    // --- PROXY ACCESSORS ---
    
    get ui() { 
        if (!this.state.i18nData) {
            return new Proxy({}, {
                get: (target, prop) => {
                    if (prop === 'welcomeSteps') return Array(5).fill({ title: 'Loading...', text: '...', icon: '...' });
                    const key = String(prop);
                    if (key === 'loading') return 'Loading...';
                    if (key === 'appTitle') return 'Arbor';
                    let clean = key.replace(/^nav/, '');
                    clean = clean.replace(/([A-Z])/g, ' $1').trim();
                    return clean;
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
    get storage() { return storageManager; }

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
    
    notify(msg, isError = false) {
        if (isError) {
            this.update({ lastErrorMessage: msg });
            setTimeout(() => this.update({ lastErrorMessage: null }), 4000);
        } else {
            this.update({ lastActionMessage: msg });
            setTimeout(() => this.update({ lastActionMessage: null }), 3000);
        }
    }

    showDialog({ type = 'alert', title = '', body = '', placeholder = '', confirmText = 'OK', cancelText = 'Cancel', danger = false }) {
        return new Promise((resolve) => {
            this._dialogResolver = resolve;
            this.setModal({
                type: 'dialog',
                dialogType: type, 
                title,
                body,
                placeholder,
                confirmText,
                cancelText,
                danger
            });
        });
    }

    closeDialog(result) {
        if (this._dialogResolver) {
            this._dialogResolver(result);
            this._dialogResolver = null;
        }
        this.setModal(null);
    }

    async alert(body, title = 'Notice') { return this.showDialog({ type: 'alert', title, body }); }
    async confirm(body, title = 'Confirm', danger = false) { return this.showDialog({ type: 'confirm', title, body, danger }); }
    async prompt(body, placeholder = '', title = 'Input') { return this.showDialog({ type: 'prompt', title, body, placeholder }); }

    // --- SOURCE & DATA DELEGATION ---

    async loadData(source, forceRefresh = true) {
        try {
            const { json, finalSource } = await this.sourceManager.loadData(source, this.state.lang, forceRefresh, this.state.rawGraphData);
            if (json) {
                // Delegate massive data processing to utility
                DataProcessor.process(this, json, finalSource);
            }
        } catch(e) {
            this.update({ loading: false, error: e.message });
        }
    }
    
    proceedWithUntrustedLoad() {
        const source = this.state.pendingUntrustedSource;
        if (source) {
            this.update({ modal: null, pendingUntrustedSource: null });
            this.loadData(source);
        }
    }

    async cancelUntrustedLoad() {
        this.update({ modal: null, pendingUntrustedSource: null });
        const defaultSource = await this.sourceManager.getDefaultSource();
        this.loadData(defaultSource);
    }

    // Keep this method as a bridge for saving files (filesystem needs to call it to update state)
    processLoadedData(json) {
        DataProcessor.process(this, json, this.state.activeSource);
    }

    requestAddCommunitySource(url) {
        if (this.sourceManager.isUrlTrusted(url)) {
            this.sourceManager.addCommunitySource(url);
        } else {
            this.update({ modal: { type: 'security-warning', url: url } });
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
        const isWelcomeOpen = this.state.modal === 'welcome' || this.state.modal === 'tutorial';
        this.update({ loading: true, error: null });
        try {
            // Fetch language data but don't update state yet.
            const path = `./locales/${lang.toLowerCase()}.json`;
            const res = await fetch(path, { cache: 'no-cache' });
            if (!res.ok) throw new Error(`Missing language file: ${path}`);
            const i18nData = await res.json();
            
            // Batch the two main state changes to reduce re-renders.
            this.update({ lang, i18nData, searchCache: {} });
            
            // Proceed with data loading for the new language context.
            if (this.state.activeSource) await this.loadData(this.state.activeSource, false); 
            else this.update({ loading: false });
            
            if (!isWelcomeOpen) this.goHome();
        } catch (e) {
            this.update({ loading: false, error: `Language error: ${e.message}` });
            if (lang !== 'EN') this.setLanguage('EN'); // Fallback to English on error
        }
    }

    setTheme(theme) { this.update({ theme }); }
    toggleTheme() { this.update({ theme: this.state.theme === 'light' ? 'dark' : 'light' }); }
    setModal(modal) { this.update({ modal }); }
    
    toggleConstructionMode() { this.update({ constructionMode: !this.state.constructionMode }); }
    
    setViewMode(viewMode) { 
        this.update({ viewMode });
        if(viewMode === 'certificates') this.update({ modal: null });
    }

    // --- GRAPH & NAVIGATION DELEGATION ---
    // All heavy graph methods moved to GraphLogic module

    findNode(id) { return this.graphLogic.findNode(id); }
    async navigateTo(nodeId, nodeData = null) { return this.graphLogic.navigateTo(nodeId, nodeData); }
    async navigateToNextLeaf() { return this.graphLogic.navigateToNextLeaf(); }
    async toggleNode(nodeId) { return this.graphLogic.toggleNode(nodeId); }
    async loadNodeChildren(node) { return this.graphLogic.loadNodeChildren(node); }
    async loadNodeContent(node) { return this.graphLogic.loadNodeContent(node); }
    async moveNode(node, newParentId) { return this.graphLogic.moveNode(node, newParentId); }

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
        // Prevent infinite re-init loops if already busy
        if (this.state.ai.status === 'loading' || this.state.ai.status === 'thinking') return;

        this.update({ ai: { ...this.state.ai, status: 'loading', progress: '0%' } });
        
        aiService.setCallback((progressReport) => {
             this.update({ ai: { ...this.state.ai, progress: progressReport.text } });
        });
        
        try {
            await aiService.initialize();
            
            // Only add greeting AFTER successful init and if chat is empty
            let currentMsgs = [...this.state.ai.messages];
            if (currentMsgs.length === 0) {
                currentMsgs.push({ role: 'assistant', content: this.ui.sageHello });
            }
            
            this.update({ ai: { ...this.state.ai, status: 'ready', messages: currentMsgs } });
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
        if (!this.state.modal || this.state.modal.type !== 'sage') {
            this.setModal({ type: 'sage' });
        }

        const currentMsgs = [...this.state.ai.messages, { role: 'user', content: userText }];
        
        // Critical: Clear progress so the "Thinking" spinner appears instead of old status text
        this.update({ ai: { ...this.state.ai, status: 'thinking', progress: null, messages: currentMsgs } });

        try {
            let contextNode = this.state.selectedNode || this.state.previewNode;
            // Handle unloaded context content
            if (contextNode && !contextNode.content && contextNode.contentPath) {
                try {
                    await this.loadNodeContent(contextNode);
                } catch(err) {
                    console.warn("Could not load context for AI:", err);
                }
            }

            const responseObj = await aiService.chat(currentMsgs, contextNode);
            let finalText = responseObj.text;
            
            if (responseObj.sources && responseObj.sources.length > 0) {
                finalText += `\n\n**Sources:**\n` + responseObj.sources.map(s => `• [${s.title}](${s.url})`).join('\n');
            }
            const newMsgs = [...currentMsgs, { role: 'assistant', content: finalText }];
            this.update({ ai: { ...this.state.ai, status: 'ready', messages: newMsgs } });
        } catch (e) {
            // CRITICAL: SHOW THE REAL ERROR TO THE USER
            console.error("AI Error masked in Store:", e);
            const errorMsg = this.state.lang === 'ES' 
                ? `❌ Error del Sistema: ${e.message || e}` 
                : `❌ System Error: ${e.message || e}`;
            
            const newMsgs = [...currentMsgs, { role: 'assistant', content: errorMsg }];
            this.update({ ai: { ...this.state.ai, status: 'ready', messages: newMsgs } });
        }
    }

    async connectPuter() {
        try {
            const user = await puterSync.signIn();
            this.update({ puterUser: user });
            const cloudData = await puterSync.load();
            if (cloudData) {
                this.importProgress(JSON.stringify(cloudData));
                this.notify(this.ui.syncComplete || "Sync complete. Cloud data loaded.");
            } else {
                this.handleAutoSync(this.userStore.getPersistenceData());
                this.notify(this.ui.syncSaved || "Connected. Local data saved to cloud.");
            }
        } catch (e) {
            console.error(e);
            this.notify((this.ui.syncError || "Sync Error: ") + e.message);
        }
    }

    async disconnectPuter() {
        await puterSync.signOut();
        this.update({ puterUser: null });
        this.notify(this.ui.syncDisconnected || "Puter disconnected.");
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
    removeBookmark(nodeId) { this.userStore.removeBookmark(nodeId); this.update({}); }
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
            // 1. Mark the Module (Branch)
            this.userStore.state.completedNodes.add(branchNode.id);
            
            // 2. Mark all Children (Siblings of the exam)
            // Explicitly adding them to completedNodes ensures they turn green in graph immediately
            if (branchNode.children) {
                branchNode.children.forEach(child => {
                    this.userStore.state.completedNodes.add(child.id);
                });
            }
            
            // 3. Handle unloaded children if present
            if (branchNode.leafIds && Array.isArray(branchNode.leafIds)) {
                branchNode.leafIds.forEach(id => this.userStore.state.completedNodes.add(id));
            }
            
            DataProcessor.hydrateCompletionState(this, branchNode);
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
                     this.markBranchComplete(m.id);
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
            
            if (data.d || data.gameData) {
                this.userStore.state.gameData = { ...this.userStore.state.gameData, ...(data.d || data.gameData) };
            }

            if (!Array.isArray(newProgress)) throw new Error("Invalid Format");

            const merged = new Set([...this.userStore.state.completedNodes, ...newProgress]);
            this.userStore.state.completedNodes = merged;
            this.userStore.persist();
            
            if (this.state.data) DataProcessor.hydrateCompletionState(this, this.state.data);
            
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
