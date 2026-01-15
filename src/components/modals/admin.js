
import { store } from '../../store.js';
import { fileSystem } from '../../services/filesystem.js';
import { github } from '../../services/github.js'; 
import { AdminRenderer } from '../../utils/renderer.js';

class ArborAdminPanel extends HTMLElement {
    constructor() {
        super();
        this.state = {
            adminTab: 'explorer', // 'explorer' | 'faculty' | 'proposals' | 'archives'
            isAdmin: false,
            canWrite: false,
            isRepoHealthy: true, 
            adminData: { prs: [], users: [], gov: null },
            parsedRules: [], 
            treeNodes: [], 
            treeFilter: '',
            expandedPaths: new Set(['content', 'content/EN', 'content/ES']),
            
            // MASTER-DETAIL STATE
            selectedPath: null,
            selectedType: null, // 'folder' | 'file'
            
            activeUserFilter: null,
            isLoggingIn: false,
            loginError: null,
            
            // VERSIONS STATE
            releases: [],
            releasesLoading: false,
            newVersionName: '',
            creatingRelease: false
        };
    }

    connectedCallback() {
        const modalState = store.value.modal;
        if (modalState && modalState.tab) {
            this.state.adminTab = modalState.tab;
        }

        this.subscription = (e) => {
            this.render();
            if(store.value.activeSource) this.initData();
        };
        store.addEventListener('state-change', this.subscription);
        
        this.render();
        this.setupGlobalHandlers();
        
        if (store.value.activeSource) {
            this.initData();
        }
    }
    
    disconnectedCallback() {
        store.removeEventListener('state-change', this.subscription);
    }

    async initData() {
        if (!fileSystem.isLocal && !store.value.githubUser) return;

        const features = fileSystem.features;
        const isAdmin = features.hasGovernance && store.value.githubUser ? await github.isAdmin() : false;

        this.updateState({ 
            canWrite: features.canWrite,
            isAdmin: isAdmin
        });

        if (this.state.adminTab === 'explorer') {
            this.loadTreeData();
        }
        
        if (this.state.adminTab === 'archives') {
            this.loadReleases();
        }

        if (!fileSystem.isLocal && features.canWrite) {
            const isHealthy = await github.checkHealth();
            this.updateState({ isRepoHealthy: isHealthy });
            
            // Always load admin data if we can, needed for autocomplete/governance in Explorer too
            this.loadAdminData();
        }
    }

    async loadTreeData(force = false) {
        try {
            const flatNodes = await fileSystem.getTree();
            const tree = this.buildTree(flatNodes);
            this.updateState({ treeNodes: tree });
        } catch (e) {
            console.error("Failed to load tree", e);
        }
    }

    buildTree(flatNodes) {
        const root = [];
        const map = {};
        flatNodes.forEach(n => { map[n.path] = { ...n, children: [] }; });

        flatNodes.forEach(n => {
            const node = map[n.path];
            const parts = n.path.split('/'); 
            if (parts.length >= 1) {
                const parentPath = parts.slice(0, -1).join('/');
                if (map[parentPath]) {
                    map[parentPath].children.push(node);
                } else {
                    if (n.path.startsWith('content')) root.push(node); // Root at content
                }
            }
        });

        const sortFn = (a, b) => {
            if (a.type === b.type) return a.path.localeCompare(b.path);
            return a.type === 'tree' ? -1 : 1;
        };

        const sortRecursive = (n) => {
            if (n.children && n.children.length > 0) {
                n.children.sort(sortFn);
                n.children.forEach(sortRecursive);
            }
        };

        root.sort(sortFn);
        root.forEach(sortRecursive);
        return root;
    }

    async loadAdminData() {
        if (fileSystem.isLocal) return;
        
        const promises = [
            github.getPullRequests(),
            github.getCollaborators()
        ];
        
        if (fileSystem.features.hasGovernance) {
            promises.push(github.getCodeOwners());
        }

        const results = await Promise.all(promises);
        
        const prs = results[0] || [];
        const users = results[1] || [];
        const gov = results.length > 2 ? results[2] : null;

        const parsedRules = this.parseGovernance(gov?.content || '');

        this.updateState({ 
            adminData: { prs, users, gov },
            parsedRules: parsedRules
        });
    }
    
    async loadReleases() {
        this.updateState({ releasesLoading: true });
        try {
            const tree = await fileSystem.getTree('content/releases');
            const releaseFolders = new Set();
            tree.forEach(node => {
                const path = node.path;
                const parts = path.split('/');
                if (parts.length >= 3 && parts[0] === 'content' && parts[1] === 'releases') {
                    releaseFolders.add(parts[2]);
                }
            });
            this.updateState({ releases: Array.from(releaseFolders).sort().reverse(), releasesLoading: false }); 
        } catch (e) {
            this.updateState({ releases: [], releasesLoading: false });
        }
    }

    async createRelease() {
        const name = this.state.newVersionName.trim().replace(/[^a-z0-9\.\-_]/gi, '');
        if (!name) return;
        this.updateState({ creatingRelease: true });
        try {
            await fileSystem.createNode('content/releases', name, 'folder');
            this.updateState({ newVersionName: '' });
            await this.loadReleases();
            alert(`Version '${name}' created.`);
        } catch (e) {
            alert("Error: " + e.message);
        } finally {
            this.updateState({ creatingRelease: false });
        }
    }

    switchToVersion(version) {
        const activeSource = store.value.activeSource;
        let dataRoot = activeSource.url;
        if (dataRoot.includes('/data.json')) {
            dataRoot = dataRoot.replace('/data.json', '');
        } else {
            dataRoot = dataRoot.substring(0, dataRoot.lastIndexOf('/'));
        }
        const newUrl = `${dataRoot}/releases/${version}.json`;

        if (confirm(`Switch to '${version}'?`)) {
            const newSource = {
                ...activeSource,
                id: `${activeSource.id}-${version}`,
                name: `${activeSource.name} (${version})`,
                url: newUrl,
                type: 'archive'
            };
            store.loadData(newSource);
            store.setModal(null);
        }
    }

    parseGovernance(rawText) {
        if (!rawText) return [];
        const lines = rawText.split('\n');
        const rules = [];
        lines.forEach(line => {
            const clean = line.trim();
            if (!clean || clean.startsWith('#')) return;
            const parts = clean.split(/\s+/);
            if (parts.length >= 2) {
                let path = parts[0];
                if (!path.startsWith('/')) path = '/' + path;
                rules.push({ path: path, owner: parts[1] });
            }
        });
        return rules;
    }

    serializeGovernance(rules) {
        const header = `# ARBOR GOVERNANCE FILE\n# This file is managed visually by Arbor UI.\n# Define folder ownership below.\n`;
        const body = rules.map(r => `${r.path} ${r.owner}`).join('\n');
        return header + '\n' + body;
    }

    updateState(partial) {
        this.state = { ...this.state, ...partial };
        this.render();
    }

    setupGlobalHandlers() {
        window.toggleFolder = (path) => {
            const set = this.state.expandedPaths;
            if (set.has(path)) set.delete(path); else set.add(path);
            this.updateState({ expandedPaths: new Set(set) });
        };
        
        window.selectAdminNode = (path, type) => {
            this.updateState({ selectedPath: path, selectedType: type });
        };
        
        window.updateGovRuleAction = (path, owner) => {
            const panel = document.querySelector('arbor-admin-panel');
            if (panel) panel.updateGovRule(path, owner);
        };

        window.editFile = (path) => {
             store.setModal({ 
                 type: 'editor', 
                 returnTo: 'contributor',
                 node: { name: path.split('/').pop(), sourcePath: path, id: 'edit-'+Date.now() } 
             });
        };
    }

    async handleLogin() {
        const token = this.querySelector('#inp-token').value.trim();
        if (!token) return;
        this.updateState({ isLoggingIn: true, loginError: null });
        try {
            const user = await github.initialize(token);
            if (user) {
                localStorage.setItem('arbor-gh-token', token);
                store.update({ githubUser: user });
            } else { throw new Error("Invalid Token"); }
        } catch (e) {
            this.updateState({ loginError: "Auth Failed", isLoggingIn: false });
        }
    }

    handleLogout() {
        github.disconnect();
        localStorage.removeItem('arbor-gh-token');
        store.update({ githubUser: null });
        this.updateState({ 
            adminTab: 'explorer', isAdmin: false, canWrite: false, 
            adminData: { prs: [], users: [], gov: null }, treeNodes: [], parsedRules: [],
            releases: []
        });
    }

    updateGovRule(path, owner) {
        const formattedPath = path.startsWith('/') ? path : '/' + path;
        let newRules = this.state.parsedRules.filter(r => r.path !== formattedPath);
        if (owner) newRules.push({ path: formattedPath, owner: owner });
        this.updateState({ parsedRules: newRules });
    }

    async handleSaveGov() {
        const content = this.serializeGovernance(this.state.parsedRules);
        try {
            await github.saveCodeOwners('.github/CODEOWNERS', content, this.state.adminData.gov?.sha);
            alert("✅ Permissions updated.");
            this.loadAdminData();
        } catch(e) { alert("Error: " + e.message); }
    }
    
    // --- RENDERERS ---

    renderLogin() {
        const ui = store.ui;
        this.innerHTML = `
        <div class="flex flex-col h-full bg-slate-50 dark:bg-slate-950 relative rounded-3xl overflow-hidden">
            <button id="btn-close-panel" class="absolute top-6 right-6 w-10 h-10 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors flex items-center justify-center text-xl">✕</button>
            <div class="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto animate-in fade-in zoom-in duration-300">
                <div class="w-24 h-24 bg-black text-white rounded-3xl flex items-center justify-center text-5xl mb-8 shadow-2xl transform -rotate-6">🐙</div>
                <h2 class="text-3xl font-black text-slate-800 dark:text-white mb-2">${ui.contribTitle}</h2>
                <p class="text-lg text-slate-500 mb-10 font-medium leading-relaxed">${ui.contribDesc}</p>
                <input id="inp-token" type="password" placeholder="${ui.contribTokenPlaceholder}" class="w-full px-6 py-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 mb-4 focus:border-black dark:focus:border-white outline-none transition-colors text-lg font-bold text-center">
                ${this.state.loginError ? `<p class="text-sm text-red-500 font-bold mb-6 animate-pulse bg-red-50 px-4 py-2 rounded-lg">${this.state.loginError}</p>` : ''}
                <button id="btn-login" class="w-full py-4 bg-black dark:bg-white text-white dark:text-black font-black text-xl rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all mb-6">
                    ${this.state.isLoggingIn ? 'Connecting...' : ui.contribConnect}
                </button>
            </div>
        </div>`;
        this.querySelector('#btn-close-panel').onclick = () => store.setModal(null);
        const btnLogin = this.querySelector('#btn-login');
        if(btnLogin) btnLogin.onclick = () => this.handleLogin();
    }

    renderInspector(path, type) {
        if (!path) {
            return `
            <div class="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-40">
                <div class="text-9xl mb-4 grayscale opacity-20">👈</div>
                <h3 class="font-black text-xl text-slate-800 dark:text-white">SELECT AN ITEM</h3>
                <p class="text-sm text-slate-500 mt-2 font-medium">View properties and permissions.</p>
            </div>`;
        }

        const name = path.split('/').pop();
        const { adminData, parsedRules, canWrite } = this.state;
        
        // Governance Logic
        const getOwner = (p) => {
            const normalized = p.startsWith('/') ? p : '/' + p;
            const rule = parsedRules.find(r => r.path === normalized);
            return rule ? rule.owner : null;
        };
        const currentOwner = getOwner(path);
        
        // --- INSPECTOR UI ---
        return `
        <div class="flex flex-col h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right-4 duration-200">
            <!-- HEADER -->
            <div class="p-6 border-b border-slate-100 dark:border-slate-800">
                <div class="flex items-center gap-3 mb-2">
                    <div class="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-3xl">
                        ${type === 'tree' || type === 'folder' ? '📁' : '📄'}
                    </div>
                    <div class="min-w-0">
                        <h3 class="font-black text-lg text-slate-800 dark:text-white truncate" title="${name}">${name}</h3>
                        <p class="text-[10px] text-slate-400 font-mono truncate">${path}</p>
                    </div>
                </div>
            </div>

            <!-- CONTENT -->
            <div class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                
                <!-- ACTIONS -->
                ${canWrite ? `
                <div class="grid grid-cols-2 gap-3">
                    <button class="py-3 px-4 bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 transition-colors" onclick="window.renameNode('${path}', '${type}')">
                        <span>✏️</span> Rename
                    </button>
                    <button class="py-3 px-4 bg-slate-50 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 font-bold rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 transition-colors" onclick="window.deleteFileAction('${path}', '${type}')">
                        <span>🗑️</span> Delete
                    </button>
                    <button class="col-span-2 py-4 bg-slate-900 dark:bg-white text-white dark:text-black font-black rounded-xl shadow-lg active:scale-95 transition-all text-sm flex items-center justify-center gap-2" onclick="window.editFile('${type === 'tree' || type === 'folder' ? path + '/meta.json' : path}')">
                        <span>${type === 'tree' || type === 'folder' ? '⚙️ Properties' : '📝 Edit Content'}</span>
                    </button>
                </div>
                ` : '<div class="text-center text-slate-400 text-xs italic">Read Only Mode</div>'}

                <!-- GOVERNANCE (FOLDERS ONLY) -->
                ${(type === 'tree' || type === 'folder') && !fileSystem.isLocal ? `
                <div>
                    <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 dark:border-slate-700 pb-2">Teacher Assignment</h4>
                    
                    <div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl mb-4 border border-slate-200 dark:border-slate-700 text-center">
                        <p class="text-xs text-slate-500 mb-1">Current Owner</p>
                        <div class="text-xl font-black text-purple-600 dark:text-purple-400">
                            ${currentOwner || "Unassigned"}
                        </div>
                    </div>

                    ${canWrite ? `
                    <div class="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                        <button onclick="window.updateGovRuleAction('${path}', '')" class="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 text-xs font-bold text-slate-500 hover:text-red-500 transition-colors">
                            ❌ Clear
                        </button>
                        ${adminData.users.map(u => `
                            <button onclick="window.updateGovRuleAction('${path}', '@${u.login}')" class="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/10 text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2 transition-colors ${currentOwner === '@'+u.login ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-500' : ''}">
                                <img src="${u.avatar}" class="w-5 h-5 rounded-full"> @${u.login}
                            </button>
                        `).join('')}
                    </div>
                    <button id="btn-save-gov-inspector" class="w-full mt-4 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow transition-colors text-xs">
                        Save Permissions
                    </button>
                    ` : ''}
                </div>
                ` : ''}

            </div>
        </div>
        `;
    }

    render() {
        const ui = store.ui;
        
        if (!fileSystem.isLocal && !store.value.githubUser) {
            this.renderLogin();
            return;
        }

        const { adminTab, treeNodes, treeFilter, expandedPaths, releases, releasesLoading, selectedPath, selectedType, adminData, creatingRelease, newVersionName } = this.state;
        const sourceName = store.value.activeSource?.name || 'Garden';
        const navButtonClass = (tab) => `flex-1 py-3 flex items-center justify-center gap-2 font-black uppercase text-xs tracking-widest transition-all ${adminTab === tab ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md rounded-xl' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl'}`;

        const header = `
        <div class="flex flex-col bg-white dark:bg-slate-950 shrink-0 z-20 border-b border-slate-100 dark:border-slate-800">
            <div class="p-4 flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-xl">🏛️</div>
                    <div>
                        <h2 class="text-lg font-black text-slate-800 dark:text-white uppercase leading-none tracking-tight">${sourceName}</h2>
                        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Control Center</p>
                    </div>
                </div>
                <div class="flex gap-2">
                    ${!fileSystem.isLocal ? `<button id="btn-logout" class="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/30 text-[10px] font-bold rounded-lg text-slate-500 hover:text-red-500 transition-colors">LOGOUT</button>` : ''}
                    <button id="btn-close-panel" class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 transition-colors">✕</button>
                </div>
            </div>
            
            <div class="flex px-4 pb-4 gap-2">
                <button id="tab-explorer" class="${navButtonClass('explorer')}">
                    <span>📚</span> ${ui.adminExplorer || "Curriculum"}
                </button>
                <button id="tab-faculty" class="${navButtonClass('faculty')}">
                    <span>👩‍🏫</span> ${ui.adminTeam || "Faculty"}
                </button>
                <button id="tab-proposals" class="${navButtonClass('proposals')}">
                    <span>📬</span> ${ui.adminPrs || "Proposals"}
                </button>
                <button id="tab-archives" class="${navButtonClass('archives')}">
                    <span>⏳</span> ${ui.adminVersions || "Archives"}
                </button>
            </div>
        </div>`;

        let content = '';

        // --- TAB 1: CURRICULUM (MASTER-DETAIL) ---
        if (adminTab === 'explorer') {
             content = `
             <div class="flex-1 flex overflow-hidden bg-slate-50 dark:bg-slate-900">
                <!-- LEFT: TREE -->
                <div class="w-7/12 flex flex-col border-r border-slate-200 dark:border-slate-800">
                    <div class="p-3 border-b border-slate-100 dark:border-slate-800 flex gap-2 bg-white dark:bg-slate-950">
                        ${this.state.canWrite ? `
                        <button id="btn-create-folder" class="px-3 py-2 bg-blue-50 text-blue-600 font-bold rounded-lg text-xs hover:bg-blue-100 transition-colors">📁+</button>
                        <button id="btn-create-file" class="px-3 py-2 bg-green-50 text-green-600 font-bold rounded-lg text-xs hover:bg-green-100 transition-colors">📄+</button>
                        ` : ''}
                        <button id="btn-refresh-tree" class="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 text-slate-400 hover:bg-slate-200">🔄</button>
                        <input id="inp-tree-filter" type="text" placeholder="Search..." value="${treeFilter}" class="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-3 text-xs font-bold text-slate-600 outline-none">
                    </div>
                    <div id="tree-container" class="flex-1 overflow-y-auto custom-scrollbar p-2">
                        ${treeNodes.length === 0 ? `<div class="p-8 text-center text-slate-300 font-bold text-xs">Loading...</div>` : 
                          AdminRenderer.renderRecursiveTree(treeNodes, 0, {
                              filter: treeFilter.toLowerCase(),
                              expandedPaths: expandedPaths,
                              canEdit: () => true, // Always show standard items
                              ui: ui
                          })}
                    </div>
                </div>

                <!-- RIGHT: INSPECTOR -->
                <div class="w-5/12 bg-white dark:bg-slate-900">
                    ${this.renderInspector(selectedPath, selectedType)}
                </div>
             </div>`;
        }
        
        // --- TAB 2: FACULTY (ROSTER ONLY) ---
        else if (adminTab === 'faculty') {
            content = `
            <div class="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900">
                <div class="max-w-2xl mx-auto">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="font-black text-xl text-slate-800 dark:text-white uppercase">Staff Directory</h3>
                        <button id="btn-invite" class="px-4 py-2 bg-purple-600 text-white font-bold rounded-xl text-xs shadow hover:bg-purple-500">
                            + Invite Teacher
                        </button>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${adminData.users.map(u => `
                            <div class="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                                <img src="${u.avatar}" class="w-12 h-12 rounded-full border-2 border-slate-200 dark:border-slate-600">
                                <div>
                                    <h4 class="font-bold text-slate-800 dark:text-white">@${u.login}</h4>
                                    <span class="text-[10px] font-black bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full uppercase">${u.role}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>`;
        }

        // --- TAB 3: PROPOSALS (PRs) ---
        else if (adminTab === 'proposals') {
            content = `<div class="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50 dark:bg-slate-900">
                ${adminData.prs.length === 0 ? `
                    <div class="flex flex-col items-center justify-center h-64 text-slate-400">
                        <span class="text-6xl mb-4 opacity-20">📭</span>
                        <p class="font-bold">Inbox Zero</p>
                    </div>
                ` : 
                adminData.prs.map(pr => `
                    <div class="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex justify-between items-center shadow-sm">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-sm">#${pr.number}</div>
                            <div>
                                <h4 class="font-bold text-sm text-slate-800 dark:text-white">${pr.title}</h4>
                                <p class="text-xs text-slate-500 font-bold mt-0.5">by <span class="text-blue-500">@${pr.user.login}</span></p>
                            </div>
                        </div>
                        <a href="${pr.html_url}" target="_blank" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs shadow transition-transform active:scale-95">Review</a>
                    </div>
                `).join('')}
            </div>`;
        }

        // --- TAB 4: ARCHIVES (VERSIONS) ---
        else if (adminTab === 'archives') {
            content = `
            <div class="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
                <div class="p-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950/50">
                    <label class="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Tag New Version</label>
                    <div class="flex gap-2 max-w-lg">
                        <input id="inp-version" type="text" placeholder="e.g. v2.0" class="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:text-white font-mono" value="${newVersionName}">
                        <button id="btn-create-release" class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl font-bold shadow-lg transition-all text-xs uppercase tracking-wider flex items-center gap-2" ${creatingRelease ? 'disabled' : ''}>
                            ${creatingRelease ? '<span class="animate-spin">⏳</span>' : '<span>+ Tag</span>'}
                        </button>
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
                    ${releasesLoading 
                        ? `<div class="p-12 text-center text-slate-400"><div class="animate-spin text-3xl mb-4 opacity-50">⏳</div></div>` 
                        : (releases.length === 0 
                            ? `<div class="p-8 text-center text-slate-400 italic text-sm">No archives found.</div>`
                            : releases.map(ver => `
                                <div class="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
                                    <div class="flex items-center gap-4">
                                        <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 flex items-center justify-center text-lg">📦</div>
                                        <span class="font-black text-lg text-slate-700 dark:text-slate-200 font-mono">${ver}</span>
                                    </div>
                                    <button class="btn-switch-release px-5 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-blue-600 hover:text-white text-slate-600 dark:text-blue-200 text-xs font-bold rounded-xl transition-colors" data-ver="${ver}">Load</button>
                                </div>
                            `).join(''))
                    }
                </div>
            </div>`;
        }

        this.innerHTML = `<div class="flex flex-col h-full overflow-hidden rounded-3xl">${header}${content}</div>`;
        this.bindEvents();
    }

    bindEvents() {
        const closeBtn = this.querySelector('#btn-close-panel');
        if (closeBtn) closeBtn.onclick = () => store.setModal(null);
        
        const logoutBtn = this.querySelector('#btn-logout');
        if (logoutBtn) logoutBtn.onclick = () => this.handleLogout();
        
        const tabs = ['explorer', 'faculty', 'proposals', 'archives'];
        tabs.forEach(t => {
            const btn = this.querySelector(`#tab-${t}`);
            if(btn) btn.onclick = () => { 
                this.updateState({ adminTab: t }); 
                if(t === 'explorer') this.loadTreeData();
                if(t === 'faculty' || t === 'proposals') this.loadAdminData();
                if(t === 'archives') this.loadReleases();
            };
        });

        if (this.state.adminTab === 'explorer') {
            const btnRefresh = this.querySelector('#btn-refresh-tree');
            if (btnRefresh) btnRefresh.onclick = () => this.loadTreeData(true);

            const filterInput = this.querySelector('#inp-tree-filter');
            if (filterInput) {
                filterInput.oninput = (e) => {
                    this.updateState({ treeFilter: e.target.value });
                    setTimeout(() => this.querySelector('#inp-tree-filter')?.focus(), 10);
                };
            }

            const btnCreateF = this.querySelector('#btn-create-folder');
            if (btnCreateF) btnCreateF.onclick = () => window.createNodeAction('folder');
            const btnCreateFile = this.querySelector('#btn-create-file');
            if (btnCreateFile) btnCreateFile.onclick = () => window.createNodeAction('file');
            
            const btnSaveGov = this.querySelector('#btn-save-gov-inspector');
            if (btnSaveGov) btnSaveGov.onclick = () => this.handleSaveGov();
        }
        
        if (this.state.adminTab === 'faculty') {
            const btnInvite = this.querySelector('#btn-invite');
            if(btnInvite) btnInvite.onclick = () => this.handleInvite();
        }
        
        if (this.state.adminTab === 'archives') {
            const btnCreate = this.querySelector('#btn-create-release');
            if(btnCreate) btnCreate.onclick = () => this.createRelease();
            const inp = this.querySelector('#inp-version');
            if(inp) inp.oninput = (e) => this.state.newVersionName = e.target.value;
            this.querySelectorAll('.btn-switch-release').forEach(b => {
                b.onclick = (e) => this.switchToVersion(e.currentTarget.dataset.ver);
            });
        }
    }
}
customElements.define('arbor-admin-panel', ArborAdminPanel);
