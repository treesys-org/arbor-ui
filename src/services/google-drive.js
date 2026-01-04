
const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com'; // Replace with real ID

// Safety check for process.env to prevent "ReferenceError: process is not defined" in browser
const getEnvVar = (key) => {
    if (typeof process !== 'undefined' && process.env) {
        return process.env[key];
    }
    return '';
};

const API_KEY = getEnvVar('API_KEY') || ''; 
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const PROGRESS_FILE_NAME = 'arbor_progress.json';

class GoogleDriveSync {
    constructor() {
        this.gapiInited = false;
        this.gisInited = false;
        this.tokenClient = null;
        this.userProfile = null;
        this.isSyncing = false;
        this.listeners = [];
        
        this.loadScripts();
    }

    subscribe(cb) {
        this.listeners.push(cb);
        return () => this.listeners = this.listeners.filter(l => l !== cb);
    }

    notify() {
        this.listeners.forEach(cb => cb());
    }

    loadScripts() {
        // Define global callbacks for Google Scripts
        window.onGapiLoad = () => gapi.load('client', this.initializeGapiClient.bind(this));
        window.onGisLoad = () => this.initializeGisClient();

        // Check if scripts are already loaded or load them
        if (typeof gapi !== 'undefined' && gapi.load) window.onGapiLoad();
        else this.injectScript('https://apis.google.com/js/api.js', 'onGapiLoad');

        if (typeof google !== 'undefined' && google.accounts) window.onGisLoad();
        else this.injectScript('https://accounts.google.com/gsi/client', 'onGisLoad');
    }

    injectScript(src, cbName) {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.defer = true;
        script.onload = window[cbName];
        document.body.appendChild(script);
    }

    async initializeGapiClient() {
        try {
            await gapi.client.init({ apiKey: API_KEY, discoveryDocs: DISCOVERY_DOCS });
            this.gapiInited = true;
        } catch (error) {
            console.error("GAPI Init Error", error);
        }
    }

    initializeGisClient() {
        try {
            this.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: (resp) => {
                    if (resp && resp.access_token) this.handleAuthSuccess(resp);
                    else console.error("Auth Error", resp);
                }
            });
            this.gisInited = true;
        } catch (e) {
            console.error("GIS Init Error", e);
        }
    }

    handleAuthSuccess(tokenResponse) {
        if (gapi && gapi.client) {
            gapi.client.setToken(tokenResponse);
            this.fetchUserProfile();
        }
    }

    async fetchUserProfile() {
        try {
            const res = await gapi.client.oauth2.userinfo.get();
            this.userProfile = res.result;
            this.notify();
            document.dispatchEvent(new CustomEvent('gdrive-sign-in'));
        } catch (e) { console.error(e); }
    }

    signIn() {
        if (this.gapiInited && this.gisInited && this.tokenClient) {
            this.tokenClient.requestAccessToken();
        } else {
            console.warn("Google Services not initialized yet");
        }
    }

    signOut() {
        if (gapi && gapi.client) {
            const token = gapi.client.getToken();
            if (token) {
                google.accounts.oauth2.revoke(token.access_token, () => {});
                gapi.client.setToken(null);
            }
        }
        this.userProfile = null;
        this.notify();
    }

    async findProgressFile() {
        try {
            const res = await gapi.client.drive.files.list({
                spaces: 'appDataFolder',
                fields: 'files(id, name)',
                pageSize: 10
            });
            const file = res.result.files.find(f => f.name === PROGRESS_FILE_NAME);
            return file ? file.id : null;
        } catch(e) { return null; }
    }

    async loadProgress() {
        if (!this.userProfile) return new Set();
        this.isSyncing = true; 
        this.notify();
        try {
            const fileId = await this.findProgressFile();
            if (!fileId) return new Set();
            const res = await gapi.client.drive.files.get({ fileId, alt: 'media' });
            this.isSyncing = false;
            this.notify();
            return new Set(res.result || []); 
        } catch(e) { 
            this.isSyncing = false; 
            this.notify();
            return new Set(); 
        }
    }

    async saveProgress(progressSet) {
        if (!this.userProfile) return;
        this.isSyncing = true;
        this.notify();
        const content = JSON.stringify(Array.from(progressSet));
        try {
            const fileId = await this.findProgressFile();
            const blob = new Blob([content], {type: 'application/json'});
            
            if (fileId) {
                await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
                    method: 'PATCH',
                    headers: { 'Authorization': 'Bearer ' + gapi.client.getToken().access_token, 'Content-Type': 'application/json' },
                    body: blob
                });
            } else {
                const metadata = { name: PROGRESS_FILE_NAME, parents: ['appDataFolder'] };
                const form = new FormData();
                form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                form.append('file', blob);
                await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + gapi.client.getToken().access_token },
                    body: form
                });
            }
        } catch(e) { console.error(e); }
        finally { this.isSyncing = false; this.notify(); }
    }
}

export const googleDrive = new GoogleDriveSync();
