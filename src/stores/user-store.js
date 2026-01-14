
// BOTANICAL SEEDS: More universal concept for knowledge trees
const SEED_TYPES = ['🌲', '🌰', '🌾', '🍁', '🥥', '🥜', '🌰', '🫘', '🍄', '🌱'];

// CONSTANTS
const MAX_BOOKMARKS = 50; // Hard limit to prevent storage creep. 50 active lessons is plenty.

export class UserStore {
    constructor(uiStringsGetter, onPersistCallback = null) {
        this.getUi = uiStringsGetter; // Function to get current UI translations
        this.onPersist = onPersistCallback;
        this.state = {
            completedNodes: new Set(),
            bookmarks: {},
            installedGames: [], // Single games added manually
            gameRepos: [], // Repositories (manifests) of games
            gameData: {}, // Generic key-value store for games { [gameId]: { [key]: value } }
            localTrees: [], // Phase 1: Local Knowledge Trees
            gamification: {
                username: '',
                avatar: '👤',
                xp: 0,
                dailyXP: 0,
                streak: 0,
                lastLoginDate: null,
                seeds: []
            }
        };
        this.load();
    }

    get dailyXpGoal() { return 50; }

    load() {
        this.loadProgress();
        this.loadBookmarks();
        this.checkStreak();
    }

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
                                ...parsed.gamification.seeds
                            }));
                        }
                    }
                    if (parsed.installedGames) this.state.installedGames = parsed.installedGames;
                    if (parsed.gameRepos) this.state.gameRepos = parsed.gameRepos;
                    if (parsed.gameData) this.state.gameData = parsed.gameData; // Load game data
                    if (parsed.localTrees) this.state.localTrees = parsed.localTrees; // Load Local Trees
                }
            }
            
            // FIX: Always reset/update the Official Repo to ensure it points to the Cloud
            this.state.gameRepos = this.state.gameRepos.filter(r => r.id !== 'official');
            
            this.state.gameRepos.unshift({
                id: 'official',
                name: 'Arbor Official',
                url: 'https://raw.githubusercontent.com/treesys-org/arbor-games/main/manifest.json',
                isOfficial: true
            });

        } catch(e) {}
    }

    getPersistenceData() {
        return {
            progress: Array.from(this.state.completedNodes),
            gamification: this.state.gamification,
            bookmarks: this.state.bookmarks, // Add bookmarks to cloud sync
            installedGames: this.state.installedGames,
            gameRepos: this.state.gameRepos,
            gameData: this.state.gameData,
            localTrees: this.state.localTrees,
            timestamp: Date.now()
        };
    }

    persist() {
        try {
            const payload = this.getPersistenceData();
            localStorage.setItem('arbor-progress', JSON.stringify(payload));
            
            if (this.onPersist) {
                this.onPersist(payload);
            }
        } catch (e) {
            console.warn("Storage Error", e);
        }
    }
    
    getExportJson() {
        const data = { 
            v: 2, 
            ts: Date.now(), 
            p: Array.from(this.state.completedNodes), 
            g: this.state.gamification,
            b: this.state.bookmarks,
            games: this.state.installedGames,
            repos: this.state.gameRepos,
            d: this.state.gameData,
            t: this.state.localTrees 
        };
        return JSON.stringify(data, null, 2);
    }

    // --- LOCAL TREE MANAGEMENT (PHASE 1) ---

    plantTree(name) {
        const id = 'local-' + crypto.randomUUID();
        const now = new Date().toISOString();
        
        // Basic Skeleton compatible with Graph Renderer
        const skeleton = {
            generatedAt: now,
            universeId: id,
            universeName: name,
            languages: {
                "EN": {
                    id: `${id}-en-root`, name: name, type: "root", expanded: true,
                    icon: "🌱", description: "My Private Garden",
                    path: name,
                    children: [
                        {
                            id: `${id}-leaf-1`, parentId: `${id}-en-root`,
                            name: "First Lesson", type: "leaf", icon: "📝",
                            path: `${name} / First Lesson`,
                            order: "1",
                            description: "Your very first lesson in your new tree.",
                            content: "# Hello World\n\nThis is your first private lesson. Click **Edit** to change it."
                        }
                    ]
                }
            }
        };

        const newTree = {
            id: id,
            name: name,
            updated: Date.now(),
            data: skeleton
        };

        this.state.localTrees.push(newTree);
        this.persist();
        return newTree;
    }

    // AI Generation Strategy
    plantTreeFromAI(schema) {
        if (!schema || !schema.title) throw new Error("Invalid AI Schema");

        const id = 'local-' + crypto.randomUUID();
        const now = new Date().toISOString();
        const rootId = `${id}-en-root`;
        const treeName = schema.title;

        // Build Children
        const children = [];
        
        if (schema.modules) {
            schema.modules.forEach((mod, mIdx) => {
                const modId = `${id}-mod-${mIdx}`;
                const modPath = `${treeName} / ${mod.title}`;
                
                const modNode = {
                    id: modId,
                    parentId: rootId,
                    name: mod.title,
                    type: "branch",
                    icon: "📁",
                    description: mod.description || "",
                    path: modPath,
                    order: String(mIdx + 1),
                    expanded: false,
                    children: []
                };

                if (mod.lessons) {
                    mod.lessons.forEach((les, lIdx) => {
                        const lesId = `${id}-les-${mIdx}-${lIdx}`;
                        
                        // Construct basic markdown content
                        let content = `@title: ${les.title}\n@description: ${les.description}\n\n# ${les.title}\n\n${les.description}\n\n## Key Concepts\n${les.outline}\n\n*(This content was generated by AI. Click Edit to expand it.)*`;

                        const lesNode = {
                            id: lesId,
                            parentId: modId,
                            name: les.title,
                            type: "leaf",
                            icon: "📄",
                            path: `${modPath} / ${les.title}`,
                            order: String(lIdx + 1),
                            description: les.description || "",
                            content: content
                        };
                        
                        modNode.children.push(lesNode);
                    });
                }
                
                children.push(modNode);
            });
        }

        const skeleton = {
            generatedAt: now,
            universeId: id,
            universeName: treeName,
            languages: {
                "EN": {
                    id: rootId, name: treeName, type: "root", expanded: true,
                    icon: "🧠", description: schema.description || "AI Generated Curriculum",
                    path: treeName,
                    children: children
                }
            }
        };

        const newTree = {
            id: id,
            name: treeName,
            updated: Date.now(),
            data: skeleton
        };

        this.state.localTrees.push(newTree);
        this.persist();
        return newTree;
    }
    
    importLocalTree(jsonData) {
        if (!jsonData || !jsonData.universeName || !jsonData.languages) {
            throw new Error("Invalid Arbor tree format.");
        }
        
        const id = 'local-' + crypto.randomUUID();
        
        const newTree = {
            id: id,
            name: jsonData.universeName,
            updated: Date.now(),
            data: jsonData
        };
        
        this.state.localTrees.push(newTree);
        this.persist();
        return newTree;
    }

    deleteLocalTree(id) {
        this.state.localTrees = this.state.localTrees.filter(t => t.id !== id);
        this.persist();
    }

    getLocalTreeData(id) {
        return this.state.localTrees.find(t => t.id === id)?.data;
    }

    // Direct JSON Manipulation for Local Editing
    updateLocalNode(treeId, nodeId, newContent, newMeta) {
        const treeEntry = this.state.localTrees.find(t => t.id === treeId);
        if (!treeEntry) return false;

        let found = false;
        
        // Recursive search & update
        const updateRecursive = (node) => {
            if (found) return; // optimization
            if (node.id === nodeId) {
                if (newContent !== null) node.content = newContent;
                if (newMeta) {
                    if (newMeta.title) node.name = newMeta.title;
                    if (newMeta.icon) node.icon = newMeta.icon;
                    if (newMeta.description) node.description = newMeta.description;
                    if (newMeta.order) node.order = newMeta.order;
                }
                found = true;
                return;
            }
            if (node.children) {
                for (const child of node.children) {
                    updateRecursive(child);
                }
            }
        };

        // We assume EN for now for local trees as they are single-user
        for (const langKey in treeEntry.data.languages) {
            const root = treeEntry.data.languages[langKey];
            if (root) {
                // Check root first
                updateRecursive(root);
                
                // If it was the root being updated, and we changed the title,
                // we should update the tree metadata too
                if (found && nodeId === root.id && newMeta && newMeta.title) {
                    treeEntry.name = newMeta.title;
                    treeEntry.data.universeName = newMeta.title;
                }
            }
            if(found) break;
        }

        if (found) {
            treeEntry.updated = Date.now();
            this.state.localTrees = [...this.state.localTrees]; 
            this.persist();
        }
        return found;
    }

    // --- Bookmarks (Robust Count Limit Strategy) ---

    computeHash(str) {
        if (!str) return "0";
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return hash.toString(16);
    }

    loadBookmarks() {
        try {
            const saved = localStorage.getItem('arbor-bookmarks');
            if (saved) {
                this.state.bookmarks = JSON.parse(saved);
            }
        } catch (e) { console.warn("Could not load bookmarks"); }
    }

    saveBookmark(nodeId, contentRaw, index, visitedSet) {
        if (!nodeId || !contentRaw) return;
        const currentHash = this.computeHash(contentRaw);
        
        // Check Limit logic BEFORE adding
        const keys = Object.keys(this.state.bookmarks);
        
        // If we are at limit and adding a NEW bookmark (not updating existing)
        if (keys.length >= MAX_BOOKMARKS && !this.state.bookmarks[nodeId]) {
            // Find oldest based on timestamp
            let oldestKey = null;
            let oldestTime = Infinity;
            
            keys.forEach(k => {
                const ts = this.state.bookmarks[k].timestamp || 0;
                if (ts < oldestTime) {
                    oldestTime = ts;
                    oldestKey = k;
                }
            });
            
            if (oldestKey) {
                delete this.state.bookmarks[oldestKey];
            }
        }
        
        const newBookmark = {
            hash: currentHash,
            index: index || 0,
            visited: Array.from(visitedSet || []),
            timestamp: Date.now() // Critical for LRU pruning
        };
        
        this.state.bookmarks[nodeId] = newBookmark;
        localStorage.setItem('arbor-bookmarks', JSON.stringify(this.state.bookmarks));
        this.persist();
    }
    
    removeBookmark(nodeId) {
        if (!nodeId) return;
        if (this.state.bookmarks[nodeId]) {
            delete this.state.bookmarks[nodeId];
            localStorage.setItem('arbor-bookmarks', JSON.stringify(this.state.bookmarks));
            this.persist();
        }
    }

    getBookmark(nodeId, contentRaw) {
        if (!nodeId) return null;
        const bookmark = this.state.bookmarks[nodeId];
        if (!bookmark) return null;
        
        if (contentRaw) {
            const currentHash = this.computeHash(contentRaw);
            // If content changed (hash mismatch), the bookmark is invalid
            if (bookmark.hash !== currentHash) {
                delete this.state.bookmarks[nodeId];
                localStorage.setItem('arbor-bookmarks', JSON.stringify(this.state.bookmarks));
                return null;
            }
        }
        return bookmark;
    }
    
    // Get list of active bookmarks sorted by most recent
    getRecentBookmarks() {
        const entries = Object.entries(this.state.bookmarks);
        // Sort descending by timestamp
        entries.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
        return entries.map(([id, data]) => ({ id, ...data }));
    }

    // --- Gamification ---

    checkStreak() {
        const today = new Date().toISOString().slice(0, 10);
        const { lastLoginDate, streak } = this.state.gamification;

        let result = null;

        if (lastLoginDate === today) {
            // Already logged in today
        } else if (lastLoginDate) {
            const last = new Date(lastLoginDate);
            const now = new Date(today);
            const diffTime = Math.abs(now - last);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

            if (diffDays === 1) {
                this.updateGamification({ streak: streak + 1, lastLoginDate: today, dailyXP: 0 });
                result = this.getUi().streakKept;
            } else {
                this.updateGamification({ streak: 1, lastLoginDate: today, dailyXP: 0 });
            }
        } else {
            this.updateGamification({ streak: 1, lastLoginDate: today });
        }
        return result;
    }

    addXP(amount) {
        const { gamification } = this.state;
        const newDaily = gamification.dailyXP + amount;
        const newTotal = gamification.xp + amount;
        
        let msg = `+${amount} ${this.getUi().xpUnit}`;
        if (gamification.dailyXP < this.dailyXpGoal && newDaily >= this.dailyXpGoal) {
            msg = this.getUi().goalReached + " ☀️";
        }

        this.updateGamification({ xp: newTotal, dailyXP: newDaily });
        return msg;
    }

    harvestSeed(moduleId) {
        const { gamification } = this.state;
        if (gamification.seeds.find(f => f.id === moduleId)) return null;

        const charSum = moduleId.split('').reduce((a,b) => a + b.charCodeAt(0), 0);
        const seedIcon = SEED_TYPES[charSum % SEED_TYPES.length];

        const newSeed = { id: moduleId, icon: seedIcon, date: Date.now() };
        this.updateGamification({ seeds: [...gamification.seeds, newSeed] });
        
        return `${this.getUi().seedCollected} ${seedIcon}`;
    }

    updateGamification(updates) {
        this.state.gamification = { ...this.state.gamification, ...updates };
        this.persist();
    }

    markComplete(nodeId, forceState = null) {
        let isComplete = this.state.completedNodes.has(nodeId);
        let shouldAdd = forceState !== null ? forceState : !isComplete;
        let xpMsg = null;

        if (shouldAdd) {
             if (!isComplete) {
                 this.state.completedNodes.add(nodeId);
                 xpMsg = this.addXP(10); // 10 XP per lesson
             }
        } else {
             this.state.completedNodes.delete(nodeId);
        }
        
        this.persist();
        return xpMsg;
    }

    isCompleted(id) {
        return this.state.completedNodes.has(id);
    }
    
    // --- GAME DATA STORAGE ---
    saveGameData(gameId, key, value) {
        if (!this.state.gameData[gameId]) {
            this.state.gameData[gameId] = {};
        }
        this.state.gameData[gameId][key] = value;
        this.persist();
    }

    loadGameData(gameId, key) {
        return this.state.gameData[gameId]?.[key] || null;
    }


    // --- Arcade / Games ---
    addGame(name, url, icon) {
        const newGame = { id: crypto.randomUUID(), name, url, icon: icon || '🎮' };
        this.state.installedGames = [...this.state.installedGames, newGame];
        this.persist();
    }

    removeGame(id) {
        this.state.installedGames = this.state.installedGames.filter(g => g.id !== id);
        this.persist();
    }

    addGameRepo(url) {
        let name = "Custom Repository";
        try { name = new URL(url).hostname; } catch(e){}
        
        const newRepo = { id: crypto.randomUUID(), name, url, isOfficial: false };
        this.state.gameRepos.push(newRepo);
        this.persist();
    }

    removeGameRepo(id) {
        this.state.gameRepos = this.state.gameRepos.filter(r => r.id !== id);
        this.persist();
    }
}
