
// BOTANICAL SEEDS: More universal concept for knowledge trees
const SEED_TYPES = ['🌲', '🌰', '🌾', '🍁', '🥥', '🥜', '🌰', '🫘', '🍄', '🌱'];

export class UserStore {
    constructor(uiStringsGetter) {
        this.getUi = uiStringsGetter; // Function to get current UI translations
        this.state = {
            completedNodes: new Set(),
            bookmarks: {},
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
                                icon: SEED_TYPES[0] 
                            }));
                        }
                    }
                }
            }
        } catch(e) {}
    }

    persist() {
        const payload = {
            progress: Array.from(this.state.completedNodes),
            gamification: this.state.gamification,
            timestamp: Date.now()
        };
        localStorage.setItem('arbor-progress', JSON.stringify(payload));
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
}
