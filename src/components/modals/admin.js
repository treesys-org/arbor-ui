
import { store } from '../../store.js';
import { fileSystem } from '../../services/filesystem.js';
import { github } from '../../services/github.js'; 
import { AdminRenderer } from '../../utils/renderer.js';

class ArborAdminPanel extends HTMLElement {
    constructor() {
        super();
        this.state = {
            adminTab: 'explorer', // 'explorer' | 'prs' | 'team'
            isAdmin: false,
            canWrite: false,
            isRepoHealthy: true, 
            adminData: { prs: [], users: [], gov: null },
            parsedRules: [], // Visual representation of CODEOWNERS
            treeNodes: [], 
            treeFilter: '',
            expandedPaths: new Set(['content', 'content/EN', 'content/ES']),
            isLoggingIn: false,
            loginError: null
        };
    }

    connectedCallback() {
        // Check for deep-link tab in modal state
        const modalState = store.value.modal;
        if (modalState && modalState.tab) {
            this.state.adminTab = modalState.tab;
        }

        // Subscribe to state changes to react to login/logout events
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
        // If not logged in and not local, stop here (Render handles the login screen)
        if (!fileSystem.isLocal && !store.value.githubUser) return;

        const features = fileSystem.features;
        
        // Only run expensive admin checks if we are actually connected
        const isAdmin = features.hasGovernance && store.value.githubUser ? await github.isAdmin() : false;

        this.updateState({ 
            canWrite: features.canWrite,
            isAdmin: isAdmin
        });

        this.loadTreeData();

        if (!fileSystem.isLocal && features.canWrite) {
            const isHealthy = await github.checkHealth();
            this.updateState({ isRepoHealthy: isHealthy });
            
            // Auto-load data if we started on a data-heavy tab
            if (this.state.adminTab !== 'explorer') {
                this.loadAdminData();
            }
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
            // Handle different path separators if necessary, mostly '/'
            const parts = n.path.split('/'); 
            if (parts.length === 1) {
                root.push(node);
            } else {
                const parentPath = parts.slice(0, -1).join('/');
                if (map[parentPath]) {
                    map[parentPath].children.push(node);
                } else {
                    root.push(node);
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
        
        // Only fetch governance if supported
        if (fileSystem.features.hasGovernance) {
            promises.push(github.getCodeOwners());
        }

        const results = await Promise.all(promises);
        
        const prs = results[0] || [];
        const users = results[1] || [];
        const gov = results.length > 2 ? results[2] : null;

        // Parse CodeOwners into visual rules
        const parsedRules = this.parseGovernance(gov?.content || '');

        this.updateState({ 
            adminData: { prs, users, gov },
            parsedRules: parsedRules
        });
    }

    // --- GOVERNANCE PARSER ---
    parseGovernance(rawText) {
        if (!rawText) return [];
        const lines = rawText.split('\n');
        const rules = [];
        
        lines.forEach(line => {
            const clean = line.trim();
            if (!clean || clean.startsWith('#')) return;
            
            // Format: /path/to/folder @owner
            const parts = clean.split(/\s+/);
            if (parts.length >= 2) {
                rules.push({
                    path: parts[0],
                    owner: parts[1] // Includes the @
                });
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

        window.editFile = (path) => {
             // For local mode, attempt to resolve ID
             let nodeId = null;
             if (fileSystem.isLocal) {
                 const findId = (nodes) => {
                     for(const n of nodes) {
                         if(n.path === path) return n.id;
                         if(n.children) {
                             const found = findId(n.children);
                             if(found) return found;
                         }
                     }
                     return null;
                 };
                 nodeId = findId(this.state.treeNodes);
             }

             store.setModal({ 
                 type: 'editor', 
                 returnTo: 'contributor',
                 node: { 
                     name: path.split('/').pop(), 
                     sourcePath: path, 
                     id: nodeId || 'edit-'+Date.now() 
                 } 
             });
        };
        
        window.deleteFileAction = async (path, type) => {
            if(confirm(store.ui.adminConfirmDelete + path + '?')) {
                try {
                    await fileSystem.deleteNode(path, type);
                    this.loadTreeData();
                } catch(e) {
                    alert("Error: " + e.message);
                }
            }
        };

        window.renameNode = async (path, type) => {
            const parts = path.split('/');
            const oldName = parts[parts.length - 1];
            const newName = prompt(store.ui.adminRenamePrompt?.replace('{oldName}', oldName) || `Rename '${oldName}' to:`, oldName);
            
            if (newName && newName !== oldName) {
                try {
                    const treeContainer = this.querySelector('#tree-container');
                    if(treeContainer) treeContainer.classList.add('opacity-50', 'pointer-events-none');
                    
                    await fileSystem.renameNode(path, newName, type);
                    this.loadTreeData();
                } catch(e) {
                    alert("Error: " + e.message);
                } finally {
                    const treeContainer = this.querySelector('#tree-container');
                    if(treeContainer) treeContainer.classList.remove('opacity-50', 'pointer-events-none');
                }
            }
        };

        window.createNodeAction = async (type) => {
            const name = prompt(type === 'folder' ? "Folder Name:" : "Filename (e.g. Lesson.md):");
            if (!name) return;
            const parent = 'content/EN'; // Default Root for MVP
            try {
                await fileSystem.createNode(parent, name, type);
                this.loadTreeData();
            } catch(e) {
                alert("Error: " + e.message);
            }
        };
        
        window.handleDragStart = (e) => {};
        window.handleDragOver = (e) => {};
        window.handleDrop = (e) => {};
    }

    // --- AUTH ACTIONS ---
    async handleLogin() {
        const token = this.querySelector('#inp-token').value.trim();
        if (!token) return;

        this.updateState({ isLoggingIn: true, loginError: null });
        
        try {
            const user = await github.initialize(token);
            if (user) {
                localStorage.setItem('arbor-gh-token', token);
                store.update({ githubUser: user }); // This triggers initData via listener
            } else {
                throw new Error("Invalid Token");
            }
        } catch (e) {
            this.updateState({ loginError: "Authentication failed. Check your token.", isLoggingIn: false });
        }
    }

    handleLogout() {
        github.disconnect();
        localStorage.removeItem('arbor-gh-token');
        store.update({ githubUser: null });
        this.updateState({ 
            adminTab: 'explorer', 
            isAdmin: false, 
            canWrite: false, 
            adminData: { prs: [], users: [], gov: null },
            treeNodes: [],
            parsedRules: []
        });
    }

    // --- TEAM & GOV ACTIONS ---
    async handleProtectBranch() {
        if(confirm(store.ui.adminProtectConfirm)) {
            try {
                await github.protectBranch();
                alert(store.ui.adminProtectSuccess);
            } catch(e) {
                alert(store.ui.adminProtectError);
            }
        }
    }

    async handleInvite() {
        const username = prompt("GitHub Username:");
        if(username) {
            try {
                await github.inviteUser(username);
                alert(store.ui.adminInviteSent);
                this.loadAdminData();
            } catch(e) { alert("Error: " + e.message); }
        }
    }

    addRule() {
        const newRule = { path: '/content/', owner: '' };
        // Default owner to first admin if available
        if (this.state.adminData.users.length > 0) {
            newRule.owner = '@' + this.state.adminData.users[0].login;
        }
        const newRules = [...this.state.parsedRules, newRule];
        this.updateState({ parsedRules: newRules });
    }

    removeRule(index) {
        const newRules = [...this.state.parsedRules];
        newRules.splice(index, 1);
        this.updateState({ parsedRules: newRules });
    }

    updateRule(index, key, value) {
        const newRules = [...this.state.parsedRules];
        newRules[index][key] = value;
        // Don't full re-render on input typing to keep focus
        this.state.parsedRules = newRules;
    }

    async handleSaveGov() {
        const content = this.serializeGovernance(this.state.parsedRules);
        try {
            await github.saveCodeOwners('.github/CODEOWNERS', content, this.state.adminData.gov?.sha);
            alert("✅ Governance updated successfully.");
            this.loadAdminData();
        } catch(e) { alert("Error: " + e.message); }
    }

    render() {
        const ui = store.ui;
        // CRITICAL CHECK: Are we Local or Remote?
        // If Remote AND Not Logged In, show Login Screen.
        if (!fileSystem.isLocal && !store.value.githubUser) {
            this.renderLogin();
            return;
        }

        const { adminTab, isAdmin, canWrite, adminData, treeNodes, treeFilter, parsedRules } = this.state;
        const sourceName = store.value.activeSource?.name || 'Unknown Source';
        
        const header = `
        <div class="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950 shrink-0">
            <div class="flex items-center gap-3">
                <span class="text-2xl">${fileSystem.isLocal ? '🌱' : '🐙'}</span>
                <div>
                    <p class="font-black text-sm text-slate-800 dark:text-white leading-none">
                        ${fileSystem.isLocal ? 'Garden Manager' : 'Repository Admin'}
                    </p>
                    <p class="text-[10px] text-slate-400 font-bold mt-0.5">${sourceName}</p>
                </div>
            </div>
            <div class="flex gap-2">
                ${!fileSystem.isLocal ? `<button id="btn-logout" class="px-3 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-red-100 dark:hover:bg-red-900/30 text-xs font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:text-red-600 transition-colors">${ui.signOut || 'Log Out'}</button>` : ''}
                <button id="btn-close-panel" class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 transition-colors">✕</button>
            </div>
        </div>`;

        const tabs = `
        <div class="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 shrink-0">
            <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${adminTab === 'explorer' ? 'border-green-500 text-green-600' : 'border-transparent text-slate-400 hover:text-slate-600'}" id="tab-explorer">📂 ${ui.adminExplorer}</button>
            ${fileSystem.features.hasGovernance ? `
            <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${adminTab === 'prs' ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-400 hover:text-slate-600'}" id="tab-prs">${ui.adminPrs}</button>
            ` : ''}
            ${isAdmin ? `
            <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${adminTab === 'team' ? 'border-purple-500 text-purple-600' : 'border-transparent text-slate-400 hover:text-slate-600'}" id="tab-team">${ui.adminTeam} & ${ui.adminGovTitle || 'Access'}</button>
            ` : ''}
        </div>`;

        let content = '';

        // --- EXPLORER TAB ---
        if (adminTab === 'explorer') {
             content = `
             <div class="flex flex-col h-full bg-slate-50/30 overflow-hidden">
                <div class="p-2 border-b border-slate-100 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0 gap-2">
                    <div class="flex gap-1">
                        <button id="btn-refresh-tree" title="${ui.adminRefresh}" class="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-800">🔄</button>
                        ${canWrite ? `
                        <button id="btn-create-folder" title="${ui.adminNewFolder}" class="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-800">📁+</button>
                        <button id="btn-create-file" title="${ui.adminNewFile}" class="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-800">📄+</button>
                        ` : ''}
                    </div>
                    <div class="flex-1 relative">
                        <input id="inp-tree-filter" type="text" placeholder="${ui.searchPlaceholder}" value="${treeFilter}" class="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500">
                    </div>
                </div>
                <div id="tree-container" class="flex-1 overflow-y-auto custom-scrollbar p-2 select-none bg-white dark:bg-slate-900">
                    ${treeNodes.length === 0 ? `<div class="p-8 text-center text-slate-400 italic text-xs">Empty or Loading...</div>` : 
                      AdminRenderer.renderRecursiveTree(treeNodes, 0, {
                          filter: this.state.treeFilter.toLowerCase(),
                          expandedPaths: this.state.expandedPaths,
                          canEdit: () => canWrite,
                          ui: ui
                      })}
                </div>
             </div>`;
        }
        // --- PULL REQUESTS TAB ---
        else if (adminTab === 'prs') {
            content = `<div class="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/50 dark:bg-slate-900/50">
                ${adminData.prs.length === 0 ? `<div class="text-center p-8 text-slate-400">${ui.noResults}</div>` : 
                adminData.prs.map(pr => `
                    <div class="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex justify-between items-center hover:shadow-md transition-shadow">
                        <div>
                            <a href="${pr.html_url}" target="_blank" class="font-bold text-slate-800 dark:text-white hover:text-blue-600 hover:underline text-sm">#${pr.number} ${pr.title}</a>
                            <p class="text-xs text-slate-400 mt-1">@${pr.user.login}</p>
                        </div>
                        <a href="${pr.html_url}" target="_blank" class="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-lg">View</a>
                    </div>
                `).join('')}
            </div>`;
        }
        // --- TEAM & GOVERNANCE TAB (UNIFIED) ---
        else if (adminTab === 'team') {
            content = `
            <div class="flex flex-col h-full bg-slate-50/30 dark:bg-slate-900/20">
                
                <!-- TOP: COLLABORATORS -->
                <div class="p-6 pb-2">
                    <div class="flex justify-between items-center mb-4">
                        <h4 class="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            👥 ${ui.adminTeam} 
                            <span class="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-full text-[10px]">${adminData.users.length}</span>
                        </h4>
                        <div class="flex gap-2">
                            <button id="btn-invite" class="px-3 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg text-xs font-bold hover:opacity-80 transition-opacity shadow-sm">+ ${ui.adminInvite}</button>
                            <button id="btn-protect-branch" class="px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800 rounded-lg text-xs font-bold hover:bg-yellow-100 dark:hover:bg-yellow-900/40 transition-colors" title="${ui.adminProtectBranch}">🛡️</button>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-3 mb-6">
                        ${adminData.users.map(u => `
                            <div class="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center gap-3 shadow-sm">
                                <img src="${u.avatar}" class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700">
                                <div class="min-w-0 flex-1">
                                    <p class="font-bold text-slate-800 dark:text-white text-xs truncate">${u.login}</p>
                                    <p class="text-[10px] text-slate-400 font-bold uppercase">${u.role}</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="h-px bg-slate-200 dark:border-slate-700 mx-6"></div>

                <!-- BOTTOM: GOVERNANCE BUILDER -->
                <div class="flex-1 overflow-y-auto custom-scrollbar p-6 pt-6">
                    <div class="flex justify-between items-center mb-4">
                        <h4 class="text-xs font-black text-slate-400 uppercase tracking-widest">⚖️ ${ui.adminGovTitle || 'Access Rules'}</h4>
                        <button id="btn-save-gov" class="text-xs font-bold text-green-600 dark:text-green-400 hover:underline bg-green-50 dark:bg-green-900/20 px-3 py-1.5 rounded-lg border border-green-200 dark:border-green-800 hover:bg-green-100 transition-colors">
                            💾 ${ui.adminSaveGov}
                        </button>
                    </div>

                    <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div class="flex bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            <div class="w-7/12 pl-2">${ui.adminGovPath}</div>
                            <div class="w-4/12">${ui.adminGovOwner}</div>
                            <div class="w-1/12 text-center"></div>
                        </div>
                        
                        <div id="rules-container">
                            ${parsedRules.map((rule, idx) => `
                                <div class="flex items-center p-2 border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                    <div class="w-7/12 pr-2">
                                        <input type="text" class="w-full bg-transparent text-xs font-mono text-slate-700 dark:text-slate-300 outline-none border-b border-transparent focus:border-blue-500 placeholder-slate-300" 
                                            value="${rule.path}" 
                                            placeholder="/content/..."
                                            onchange="document.querySelector('arbor-admin-panel').updateRule(${idx}, 'path', this.value)">
                                    </div>
                                    <div class="w-4/12 pr-2">
                                        <select class="w-full bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 rounded py-1 px-2 border-none outline-none focus:ring-1 focus:ring-blue-500"
                                            onchange="document.querySelector('arbor-admin-panel').updateRule(${idx}, 'owner', this.value)">
                                            ${adminData.users.map(u => `<option value="@${u.login}" ${rule.owner.toLowerCase() === ('@' + u.login).toLowerCase() ? 'selected' : ''}>@${u.login}</option>`).join('')}
                                            ${!adminData.users.find(u => ('@'+u.login).toLowerCase() === rule.owner.toLowerCase()) ? `<option value="${rule.owner}" selected>${rule.owner}</option>` : ''}
                                        </select>
                                    </div>
                                    <div class="w-1/12 text-center">
                                        <button class="text-slate-400 hover:text-red-500 transition-colors text-lg leading-none" onclick="document.querySelector('arbor-admin-panel').removeRule(${idx})">×</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        
                        <button id="btn-add-rule" class="w-full py-2 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-t border-slate-100 dark:border-slate-700">
                            + ${ui.adminGovAdd}
                        </button>
                    </div>
                    
                    <p class="text-[10px] text-slate-400 mt-3 text-center italic">
                        Assigning ownership prevents other users from editing folders without approval.
                    </p>
                </div>
            </div>`;
        }

        this.innerHTML = `<div class="flex flex-col h-full overflow-hidden">${header}${tabs}${content}</div>`;
        this.bindEvents();
    }

    renderLogin() {
        const ui = store.ui;
        this.innerHTML = `
        <div class="flex flex-col h-full bg-slate-50 dark:bg-slate-950 relative">
            <button id="btn-close-panel" class="absolute top-4 right-4 w-8 h-8 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors flex items-center justify-center">✕</button>
            
            <div class="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto">
                <div class="w-20 h-20 bg-black text-white rounded-full flex items-center justify-center text-4xl mb-6 shadow-xl">
                    🐙
                </div>
                <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-2">${ui.contribTitle}</h2>
                <p class="text-sm text-slate-500 mb-8 leading-relaxed">${ui.contribDesc}</p>
                
                <input id="inp-token" type="password" placeholder="${ui.contribTokenPlaceholder}" class="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 mb-2 focus:ring-2 focus:ring-black dark:focus:ring-white outline-none transition-shadow">
                
                ${this.state.loginError ? `<p class="text-xs text-red-500 font-bold mb-4 animate-pulse">${this.state.loginError}</p>` : ''}
                
                <button id="btn-login" class="w-full py-3 bg-black dark:bg-white text-white dark:text-black font-bold rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all mb-4">
                    ${this.state.isLoggingIn ? 'Connecting...' : ui.contribConnect}
                </button>
                
                <a href="https://github.com/settings/tokens/new?scopes=repo&description=Arbor%20Editor" target="_blank" class="text-xs text-blue-600 hover:underline">
                    Generate Token (Classic)
                </a>
            </div>
        </div>`;
        
        this.querySelector('#btn-close-panel').onclick = () => store.setModal(null);
        
        const btnLogin = this.querySelector('#btn-login');
        if(btnLogin) btnLogin.onclick = () => this.handleLogin();
    }

    bindEvents() {
        // Ensure buttons exist before binding to avoid null reference errors
        const closeBtn = this.querySelector('#btn-close-panel');
        if (closeBtn) closeBtn.onclick = () => store.setModal(null);
        
        const logoutBtn = this.querySelector('#btn-logout');
        if (logoutBtn) logoutBtn.onclick = () => this.handleLogout();
        
        const tabExplorer = this.querySelector('#tab-explorer');
        if (tabExplorer) tabExplorer.onclick = () => { this.updateState({ adminTab: 'explorer' }); };
        
        const tabPrs = this.querySelector('#tab-prs');
        if (tabPrs) tabPrs.onclick = () => { 
            this.updateState({ adminTab: 'prs' });
            if (!fileSystem.isLocal) this.loadAdminData();
        };
        
        const tabTeam = this.querySelector('#tab-team');
        if (tabTeam) tabTeam.onclick = () => {
            this.updateState({ adminTab: 'team' });
            this.loadAdminData();
        };

        // Explorer Events
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
        }
        
        // Team Events
        if (this.state.adminTab === 'team') {
            const btnProtect = this.querySelector('#btn-protect-branch');
            if(btnProtect) btnProtect.onclick = () => this.handleProtectBranch();
            
            const btnInvite = this.querySelector('#btn-invite');
            if(btnInvite) btnInvite.onclick = () => this.handleInvite();
            
            const btnAddRule = this.querySelector('#btn-add-rule');
            if(btnAddRule) btnAddRule.onclick = () => this.addRule();
            
            const btnSaveGov = this.querySelector('#btn-save-gov');
            if(btnSaveGov) btnSaveGov.onclick = () => this.handleSaveGov();
        }
    }
}
customElements.define('arbor-admin-panel', ArborAdminPanel);
