
const OFFICIAL_DOMAINS = [
    'treesys-org.github.io',
    'localhost',
    '127.0.0.1',
    'raw.githubusercontent.com'
];

// Fallback if everything fails
const DEFAULT_SOURCES = [
    {
        id: 'default-arbor',
        name: 'Arbor Knowledge (Official)',
        url: 'https://raw.githubusercontent.com/treesys-org/arbor-knowledge/main/data/data.json',
        isDefault: true,
        isTrusted: true,
        year: 'Rolling'
    }
];

export class SourceManager {
    constructor(updateStateCallback, uiCallback) {
        this.update = updateStateCallback; // Function to update main store state
        this.getUi = uiCallback; // Function to get current UI strings
        this.state = {
            communitySources: [],
            activeSource: null,
            availableReleases: [],
            manifestUrlAttempted: null,
            loading: true,
            error: null
        };
    }

    init() {
        // 1. Load Community Sources (Local)
        let localSources = [];
        try { localSources = JSON.parse(localStorage.getItem('arbor-sources')) || []; } catch(e) {}
        
        this.update({ communitySources: localSources });
        this.state.communitySources = localSources;

        // 2. Determine Active Source
        const savedActiveId = localStorage.getItem('arbor-active-source-id');
        let activeSource = localSources.find(s => s.id === savedActiveId);

        if (!activeSource) {
            activeSource = { ...DEFAULT_SOURCES[0] };
            // Optimization: If running locally, prefer local relative URL
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                 this._checkLocalBoot().then(localSrc => {
                     if (localSrc) this.loadData(localSrc);
                     else this.loadData(activeSource);
                 });
                 return;
            }
        }

        this.loadData(activeSource);
    }

    async _checkLocalBoot() {
        try {
            const check = await fetch('./data/data.json', { method: 'HEAD' });
            if (check.ok) {
                return {
                    id: 'local-boot',
                    name: 'Local Workspace',
                    url: './data/data.json',
                    isTrusted: true,
                    type: 'rolling'
                };
            }
        } catch(e) {}
        return null;
    }

    isUrlTrusted(urlStr) {
        try {
            const url = new URL(urlStr, window.location.href);
            return OFFICIAL_DOMAINS.includes(url.hostname);
        } catch { return false; }
    }

    addCommunitySource(url) {
        if (!url) return;
        let name = 'New Tree';
        try { name = new URL(url, window.location.href).hostname; } catch (e) {}
        
        const newSource = { 
            id: crypto.randomUUID(), 
            name, 
            url, 
            isTrusted: this.isUrlTrusted(url),
            isOfficial: false,
            type: 'community'
        };
        
        const newSources = [...this.state.communitySources, newSource];
        this.update({ communitySources: newSources });
        this.state.communitySources = newSources;
        localStorage.setItem('arbor-sources', JSON.stringify(newSources));
        
        this.loadData(newSource);
    }

    removeCommunitySource(id) {
        const newSources = this.state.communitySources.filter(s => s.id !== id);
        this.update({ communitySources: newSources });
        this.state.communitySources = newSources;
        localStorage.setItem('arbor-sources', JSON.stringify(newSources));
        
        if (this.state.activeSource && this.state.activeSource.id === id) {
            this.init(); // Fallback to default
        }
    }

    async discoverManifest(sourceUrl) {
        if (!sourceUrl) return;

        try {
            const absoluteSource = new URL(sourceUrl, window.location.href).href;
            
            // STRATEGY 1: Check Sibling (Portable Standard)
            const siblingUrl = new URL('arbor-index.json', absoluteSource).href;
            
            // STRATEGY 2: Check Root (Legacy Standard)
            let rootUrl = null;
            const lower = absoluteSource.toLowerCase();
            if (lower.includes('/data/')) {
                 const idx = lower.lastIndexOf('/data/'); 
                 const rootBase = absoluteSource.substring(0, idx) + '/';
                 rootUrl = rootBase + 'arbor-index.json';
            }

            const candidates = [siblingUrl];
            if (rootUrl && rootUrl !== siblingUrl) candidates.push(rootUrl);

            for (const url of candidates) {
                 try {
                     const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-cache' });
                     if (res.ok) {
                         const manifest = await res.json();
                         const manifestBase = new URL('./', url).href;
                         const rebase = (u) => {
                            if (u && u.startsWith('./')) return new URL(u, manifestBase).href;
                            return u;
                         };

                         const versions = [];
                         if (manifest.rolling) {
                            versions.push({ ...manifest.rolling, url: rebase(manifest.rolling.url), type: 'rolling' });
                         }
                         if (manifest.releases && Array.isArray(manifest.releases)) {
                            versions.push(...manifest.releases.map(r => ({ ...r, url: rebase(r.url), type: 'archive' })));
                         }
                         
                         this.update({ availableReleases: versions, manifestUrlAttempted: url });
                         return; 
                     }
                 } catch(e) { }
            }
            this.update({ availableReleases: [], manifestUrlAttempted: candidates.join(' | ') });

        } catch (e) {
            this.update({ availableReleases: [] });
        }
    }

    async loadData(source, currentLang = 'EN', forceRefresh = true, existingRawData = null) {
        if (!source) return;
        
        this.update({ loading: true, error: null, activeSource: source });
        this.state.activeSource = source;
        
        this.discoverManifest(source.url);
        localStorage.setItem('arbor-active-source-id', source.id);

        try {
            let json;
            
            if (!forceRefresh && existingRawData && this.state.activeSource?.id === source.id) {
                json = existingRawData;
            } else {
                const url = source.url; 
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 20000); 

                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (!res.ok) throw new Error(`Failed to fetch data from ${source.name} (Status ${res.status}).`);
                json = await res.json();
            }
            
            // Name Refresh Logic
            if (json.universeName && json.universeName !== source.name) {
                const updatedCommunity = this.state.communitySources.map(s => s.id === source.id ? {...s, name: json.universeName} : s);
                this.update({ communitySources: updatedCommunity });
                localStorage.setItem('arbor-sources', JSON.stringify(updatedCommunity));
                this.update({ activeSource: { ...source, name: json.universeName } });
            }

            // Return the raw JSON for the main store to process language specifics
            return json;

        } catch (e) {
            console.error(e);
            this.update({ loading: false, error: e.message });
            throw e;
        }
    }
}
