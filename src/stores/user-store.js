
// BOTANICAL SEEDS: More universal concept for knowledge trees
const SEED_TYPES = ['🌲', '🌰', '🌾', '🍁', '🥥', '🥜', '🌰', '🫘', '🍄', '🌱'];

export class UserStore {
    constructor(uiStringsGetter, onPersistCallback = null) {
        this.getUi = uiStringsGetter; // Function to get current UI translations
        this.onPersist = onPersistCallback;
        this.state = {
            completedNodes: new Set(),
            bookmarks: {},
            installedGames: [], // Single games added manually
            gameRepos: [], // Repositories (manifests) of games
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
                }
            }
            
            // FIX: Always reset/update the Official Repo to ensure it points to the Cloud, not local folder
            // 1. Remove old/local official entry that might be cached in localStorage
            this.state.gameRepos = this.state.gameRepos.filter(r => r.id !== 'official');
            
            // 2. Add correct Cloud URL pointing to treesys-org/arbor-games
            this.state.gameRepos.unshift({
                id: 'official',
                name: 'Arbor Official',
                // Pointing to Raw GitHub ensures the manifest JSON loads correctly cross-origin.
                // Note: For the HTML games to run perfectly, GitHub Pages should be enabled on the repo.
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
            timestamp: Date.now()
        };
    }

    persist() {
        const payload = this.getPersistenceData();
        localStorage.setItem('arbor-progress', JSON.stringify(payload));
        
        // Trigger external persistence (e.g., Cloud Sync)
        if (this.onPersist) {
            this.onPersist(payload);
        }
    }

    getExportJson() {
        const data = { 
            v: 1, 
            ts: Date.now(), 
            p: Array.from(this.state.completedNodes), 
            g: this.state.gamification,
            b: this.state.bookmarks,
            games: this.state.installedGames,
            repos: this.state.gameRepos
        };
        return JSON.stringify(data, null, 2);
    }

    // --- Bookmarks ---

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
        
        const newBookmark = {
            hash: currentHash,
            index: index || 0,
            visited: Array.from(visitedSet || []),
            timestamp: Date.now()
        };
        
        this.state.bookmarks[nodeId] = newBookmark;
        localStorage.setItem('arbor-bookmarks', JSON.stringify(this.state.bookmarks));
        // Bookmarks change often, maybe debounce this in real app, but for now we sync
        this.persist();
    }

    getBookmark(nodeId, contentRaw) {
        if (!nodeId) return null;
        const bookmark = this.state.bookmarks[nodeId];
        if (!bookmark) return null;
        
        if (contentRaw) {
            const currentHash = this.computeHash(contentRaw);
            if (bookmark.hash !== currentHash) {
                delete this.state.bookmarks[nodeId];
                localStorage.setItem('arbor-bookmarks', JSON.stringify(this.state.bookmarks));
                return null;
            }
        }
        return bookmark;
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
