
import { AVAILABLE_LANGUAGES } from './i18n.js';
import { github } from './services/github.js';
import { aiService } from './services/ai.js';
import { puterSync } from './services/puter-sync.js';
import { UserStore } from './stores/user-store.js';
import { SourceManager } from './stores/source-manager.js';
import { TreeUtils } from './utils/tree-utils.js';
import { storageManager } from './stores/storage-manager.js'; // NEW
import { fileSystem } from './services/filesystem.js';

class Store extends EventTarget {
    constructor() {
        super();
        
        // --- NEW LOGIC FOR INITIAL LANGUAGE ---
        let initialLang = localStorage.getItem('arbor-lang');
        if (!initialLang) {
            // 'en-US' -> 'en' -> 'EN'
            const browserLang = navigator.language.split('-')[0].toUpperCase();
            const supportedLang = AVAILABLE_LANGUAGES.find(l => l.code === browserLang);
            initialLang = supportedLang ? supportedLang.code : 'EN'; // Default to English
        }
        
        // Internal Promise resolvers for Dialogs
        this._dialogResolver = null;

        // 2. Initial State (Moved up to fix initialization race condition)
        this.state = {
            theme: localStorage.getItem('arbor-theme') || 'light',
            lang: initialLang, // USE THE DETECTED LANGUAGE
            i18nData: null, 
            
            // Source & Data State (Managed via SourceManager)
            communitySources: [], 
            activeSource: null,
            availableReleases: [],
            manifestUrlAttempted: null, 
            pendingUntrustedSource: null, // NEW: For URL param warning
            
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
            constructionMode: false, // NEW: Construction Mode
            modal: null, 
            lastActionMessage: null,
            githubUser: null
        };

        // 1. User Persistence Sub-Store
        this.userStore = new UserStore(
            () => this.ui,
            (data) => this.handleAutoSync(data) 
        );

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
             // IMPORTANT: init() might return null if it triggers a warning modal
             if (source) {
                 this.loadData(source);
             } else {
                 // If init returns null, it means a modal is up, so we're not "loading"
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
        // Only show welcome if no other modal is pending (like the security warning)
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
                    
                    // Smart Fallback to prevent ugly keys like "navAbout" from appearing
                    const key = String(prop);
                    
                    // 1. Handle common specific keys
                    if (key === 'loading') return 'Loading...';
                    if (key === 'appTitle') return 'Arbor';
                    
                    // 2. Strip "nav" prefix (e.g. navAbout -> About)
                    let clean = key.replace(/^nav/, '');
                    
                    // 3. Add space before capital letters (e.g. AboutUs -> About Us)
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
    
    // EXPOSE STORAGE MANAGER
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

    // --- DIALOG SYSTEM (Replaces Alert/Confirm/Prompt) ---
    // Returns a Promise that resolves when the user interacts with the dialog
    showDialog({ type = 'alert', title = '', body = '', placeholder = '', confirmText = 'OK', cancelText = 'Cancel', danger = false }) {
        return new Promise((resolve) => {
            this._dialogResolver = resolve;
            this.setModal({
                type: 'dialog',
                dialogType: type, // 'alert', 'confirm', 'prompt'
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
        // Resolve the promise waiting in showDialog
        if (this._dialogResolver) {
            this._dialogResolver(result);
            this._dialogResolver = null;
        }
        this.setModal(null);
    }

    // Shorthands
    async alert(body, title = 'Notice') {
        return this.showDialog({ type: 'alert', title, body });
    }

    async confirm(body, title = 'Confirm', danger = false) {
        return this.showDialog({ type: 'confirm', title, body, danger });
    }

    async prompt(body, placeholder = '', title = 'Input') {
        return this.showDialog({ type: 'prompt', title, body, placeholder });
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
            
            // SMART HYDRATION: Expand completed branches into leaves in memory
            this.hydrateCompletionState(langData);

            this.update({ 
                data: langData, 
                rawGraphData: json,
                loading: false, 
                path: [langData], 
                lastActionMessage: this.ui.sourceSwitchSuccess 
            });
            
            this.dispatchEvent(new CustomEvent('graph-update'));
            setTimeout(() => this.update({ lastActionMessage: null }), 3000);
            
            // --- README MODAL TRIGGER ---
            // If the user hasn't explicitly skipped the readme for this source, show it.
            if (this.state.activeSource && !this.state.modal) {
                const sourceId = this.state.activeSource.id.split('-')[0]; // Use base ID, ignoring version suffix for preferences
                const skipKey = `arbor-skip-readme-${sourceId}`;
                
                // We show it if it's NOT skipped.
                if (localStorage.getItem(skipKey) !== 'true') {
                    // Small delay to allow UI to settle
                    setTimeout(() => {
                        // Only show if no other modal (like security warning) hijacked focus
                        if (!this.state.modal) this.setModal('readme');
                    }, 500);
                }
            }

        } catch (e) {
            console.error("Data Processing Error", e);
            this.update({ loading: false, error: "Failed to process data structure." });
        }
    }
    
    // --- SMART HYDRATION (THE COMPRESSION HACK) ---
    // If a branch ID is in `completedNodes`, automatically add all its children to the Set in memory.
    // This allows us to store just 1 ID in localStorage for an entire finished course.
    hydrateCompletionState(rootNode) {
        const completedSet = this.userStore.state.completedNodes;
        let hydratedCount = 0;

        const traverse = (node) => {
            // If parent is complete, ensure children are complete in memory
            if (completedSet.has(node.id)) {
                // If it has loaded children, mark them
                if (node.children) {
                    node.children.forEach(child => {
                        if (!completedSet.has(child.id)) {
                            completedSet.add(child.id);
                            hydratedCount++;
                        }
                        // Recurse down to ensure deep leaves are marked
                        traverse(child);
                    });
                } 
                // If children are unloaded but we have leafIds metadata
                else if (node.leafIds && Array.isArray(node.leafIds)) {
                    node.leafIds.forEach(id => {
                        if (!completedSet.has(id)) {
                            completedSet.add(id);
                            hydratedCount++;
                        }
                    });
                }
            } else {
                // Continue searching down
                if (node.children) node.children.forEach(traverse);
            }
        };
        
        traverse(rootNode);
        if (hydratedCount > 0) {
            console.log(`Arbor Hydration: Expanded ${hydratedCount} implicit completions from compressed save.`);
        }
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
            await this.loadLanguage(lang); 
            this.update({ lang, searchCache: {} });
            if (this.state.activeSource) await this.loadData(this.state.activeSource, false); 
            else this.update({ loading: false });
            
            if (!isWelcomeOpen) {
                this.goHome();
            }
        } catch (e) {
            this.update({ loading: false, error: `Language error: ${e.message}` });
            if (lang !== 'EN') this.setLanguage('EN');
        }
    }

    setTheme(theme) { this.update({ theme }); }
    toggleTheme() { this.update({ theme: this.state.theme === 'light' ? 'dark' : 'light' }); }
    setModal(modal) { this.update({ modal }); }
    
    toggleConstructionMode() {
        this.update({ constructionMode: !this.state.constructionMode });
    }
    
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
        
        // Prevent toggle if in construction mode dragging logic might conflict
        // (Handled in graph.js via click suppression)

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
                
                // HYDRATION CHECK: Since we just loaded children, check if they should be implicitly marked
                this.hydrateCompletionState(node);
                
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
    
    async moveNode(node, newParentId) {
        this.update({ loading: true });
        try {
            const newParent = this.findNode(newParentId);
            if(!newParent) throw new Error("Target parent not found");
            
            // Calculate new paths
            // Note: This logic assumes 'node' is the d3 data object or has required fields
            const oldPath = node.sourcePath;
            // The fileSystem moveNode expects: (sourcePath, newParentPath)
            // But we need the parent's sourcePath to construct the new path.
            
            const parentPath = newParent.sourcePath;
            
            // Call FileSystem
            await fileSystem.moveNode(oldPath, parentPath);
            
            // Refresh
            // For now, reload the whole tree as structural changes are complex to patch in-memory
            const source = this.state.activeSource;
            await this.loadData(source, false);
            
            this.notify("Node moved successfully!");
            
        } catch(e) {
            console.error(e);
            this.update({ error: "Move failed: " + e.message });
            setTimeout(() => this.update({ error: null }), 3000);
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
        // Automatically open modal if it's not open (e.g. called from code)
        if (!this.state.modal || this.state.modal.type !== 'sage') {
            this.setModal({ type: 'sage' });
        }

        const currentMsgs = [...this.state.ai.messages, { role: 'user', content: userText }];
        this.update({ ai: { ...this.state.ai, status: 'thinking', messages: currentMsgs } });

        try {
            let contextNode = this.state.selectedNode || this.state.previewNode;
            if (contextNode && !contextNode.content && contextNode.contentPath) await this.loadNodeContent(contextNode);

            const responseObj = await aiService.chat(currentMsgs, contextNode);
            let finalText = responseObj.text;
            if (responseObj.sources && responseObj.sources.length > 0) {
                finalText += `\n\n**Sources:**\n` + responseObj.sources.map(s => `• [${s.title}](${s.url})`).join('\n');
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

    // COMPRESSION OPTIMIZATION:
    // When marking a branch complete, we add the branch ID to the set
    // BUT we remove all children IDs from the set to save storage space.
    // The `hydrateCompletionState` function will re-add them in memory upon reload.
    markBranchComplete(branchId) {
        if (!branchId) return;
        constbranchNode = this.findNode(branchId);
        
        if (branchNode) {
            // 1. Mark Parent
            this.userStore.state.completedNodes.add(branchNode.id);
            
            // 2. Optimization: Remove children from disk storage (Implied Completion)
            const removeRecursive = (node) => {
                if (node.id !== branchId) {
                    this.userStore.state.completedNodes.delete(node.id);
                }
                if (node.children) node.children.forEach(removeRecursive);
            };
            removeRecursive(branchNode);
            
            if (branchNode.leafIds && Array.isArray(branchNode.leafIds)) {
                branchNode.leafIds.forEach(id => this.userStore.state.completedNodes.delete(id));
            }
            
            // 3. Ensure memory state is consistent immediately (Hydrate just this branch)
            this.hydrateCompletionState(branchNode);
        }
        
        this.userStore.persist();
        this.update({});
        this.dispatchEvent(new CustomEvent('graph-update'));
    }

    checkForModuleCompletion(relatedNodeId) {
        const modules = this.getModulesStatus();
        modules.forEach(m => {
            if (m.isComplete) {
                // If the module is newly complete, mark it explicitly
                // This triggers the compression logic inside markBranchComplete
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
            
            // NEW: Import game data
            if (data.d || data.gameData) {
                this.userStore.state.gameData = { ...this.userStore.state.gameData, ...(data.d || data.gameData) };
            }

            if (!Array.isArray(newProgress)) throw new Error("Invalid Format");

            const merged = new Set([...this.userStore.state.completedNodes, ...newProgress]);
            this.userStore.state.completedNodes = merged;
            this.userStore.persist();
            
            // Re-hydrate to ensure UI reflects implicit completions
            if (this.state.data) this.hydrateCompletionState(this.state.data);
            
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
