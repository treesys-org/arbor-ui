


import { store } from '../store.js';

class PuterSyncService {
    constructor() {
        this.user = null;
        this.key = 'arbor_user_progress_v1';
        this.isLoadingLib = false;
    }

    // NEW: Privacy-First Lazy Loader
    async loadLibrary() {
        if (window.puter) return true;
        if (this.isLoadingLib) {
            // Wait for existing promise if multiple calls happen at once
            return new Promise(resolve => {
                const check = setInterval(() => {
                    if (window.puter) { clearInterval(check); resolve(true); }
                }, 100);
            });
        }

        this.isLoadingLib = true;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = "https://js.puter.com/v2/";
            script.onload = () => {
                this.isLoadingLib = false;
                console.log("[Arbor Privacy] Puter.js loaded on demand.");
                resolve(true);
            };
            script.onerror = () => {
                this.isLoadingLib = false;
                reject(new Error("Failed to load Puter.js"));
            };
            document.head.appendChild(script);
        });
    }

    async initialize() {
        // Only check for silent login IF we have previously connected (Privacy)
        // We check localStorage for a flag.
        if (localStorage.getItem('arbor-cloud-connected') !== 'true') return null;

        await this.loadLibrary();
        
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
        await this.loadLibrary();
        if (!window.puter) throw new Error("Puter.js failed to load");
        
        // This triggers the popup
        const user = await window.puter.auth.signIn();
        this.user = user;
        
        // Mark as intentionally connected for future auto-loads
        if (user) localStorage.setItem('arbor-cloud-connected', 'true');
        
        return user;
    }

    async signOut() {
        if (!window.puter) return;
        await window.puter.auth.signOut();
        this.user = null;
        localStorage.removeItem('arbor-cloud-connected');
    }

    async save(data) {
        // Do not load library just to save if we aren't already initialized
        if (!this.user || !window.puter) return;
        
        // Save the entire progress object to Puter KV
        const payload = {
            updatedAt: Date.now(),
            data: data
        };
        await window.puter.kv.set(this.key, payload);
    }

    async load() {
        // Must be signed in to load
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