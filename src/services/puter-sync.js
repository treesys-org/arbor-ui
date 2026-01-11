
import { store } from '../store.js';

class PuterSyncService {
    constructor() {
        this.user = null;
        this.key = 'arbor_user_progress_v1';
    }

    async initialize() {
        if (!window.puter) return null;
        try {
            // Check if already logged in silently
            const user = await window.puter.auth.getUser();
            this.user = user;
            return user;
        } catch (e) {
            return null;
        }
    }

    async signIn() {
        if (!window.puter) throw new Error("Puter.js not loaded");
        // This triggers the popup
        const user = await window.puter.auth.signIn();
        this.user = user;
        return user;
    }

    async signOut() {
        if (!window.puter) return;
        await window.puter.auth.signOut();
        this.user = null;
    }

    async save(data) {
        if (!this.user || !window.puter) return;
        // Save the entire progress object to Puter KV
        // We wrap it to add metadata like timestamp
        const payload = {
            updatedAt: Date.now(),
            data: data
        };
        await window.puter.kv.set(this.key, payload);
    }

    async load() {
        if (!this.user || !window.puter) return null;
        const payload = await window.puter.kv.get(this.key);
        if (payload && payload.data) {
            return payload.data;
        }
        return null;
    }

    isLoggedIn() {
        return !!this.user;
    }
}

export const puterSync = new PuterSyncService();
