
import { store } from '../store.js';
import { github } from '../services/github.js';
import { AdminRenderer } from '../utils/renderer.js';

class ArborAdminPanel extends HTMLElement {
    constructor() {
        super();
        this.state = {
            adminTab: 'explorer', // 'explorer' | 'prs' | 'team' | 'gov'
            isAdmin: false,
            isRepoHealthy: true, 
            adminData: { prs: [], users: [], gov: null },
            treeNodes: [], 
            treeFilter: '',
            expandedPaths: new Set(['content', 'content/EN', 'content/ES']),
            dragSource: null
        };
        this.lastRenderKey = null;
    }

    connectedCallback() {
        this.render();
        this.setupGlobalHandlers();

        // Initial Load if user exists
        if (store.value.githubUser) {
            this.initData();
        }
    }

    async initData() {
        const isAdmin = await github.isAdmin();
        const isHealthy = await github.checkHealth();
        this.state = { ...this.state, isAdmin, isRepoHealthy: isHealthy };
        
        if (isHealthy) {
            this.loadTreeData();
            if (isAdmin) this.loadAdminData();
        }
        this.render();
    }

    async loadTreeData() {
        try {
            const flatNodes = await github.getRecursiveTree();
            const tree = this.buildTree(flatNodes);
            this.updateState({ treeNodes: tree });
        } catch (e) {
            console.error("Failed to load tree", e);
        }
    }

    buildTree(flatNodes) {
        const root = [];
        const map = {};

        flatNodes.forEach(n => {
            map[n.path] = { ...n, children: [] };
        });

        flatNodes.forEach(n => {
            const node = map[n.path];
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
        const [prs, users, gov] = await Promise.all([
            github.getPullRequests(),
            github.getCollaborators(),
            github.getCodeOwners()
        ]);
        this.updateState({ adminData: { prs, users, gov } });
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
             store.setModal({ 
                 type: 'editor', 
                 returnTo: 'contributor',
                 node: { name: path.split('/').pop(), sourcePath: path, id: 'edit-'+Date.now() } 
             });
        };
        
        window.deleteFileAction = async (path, type) => {
            let message = store.ui.adminConfirmDelete + path + '?';
            let itemsToDelete = [];

            if (type === 'folder') {
                const children = this.getAllDescendants(path);
                if (children.length > 0) {
                    message = store.ui.adminConfirmDeleteFolder.replace('{count}', children.length).replace('{name}', path);
                    itemsToDelete = children;
                }
            } else {
                itemsToDelete = [{ path, type: 'blob' }]; 
            }

            if(confirm(message)) {
                try {
                    let deletedCount = 0;
                    for (const item of itemsToDelete) {
                        if (item.type === 'tree') continue;
                        try {
                            const { sha } = await github.getFileContent(item.path);
                            await github.deleteFile(item.path, `chore: Delete ${item.path}`, sha);
                            deletedCount++;
                        } catch(e) { console.warn(`Skipped ${item.path}`, e); }
                    }
                    alert(store.ui.adminDeletedCount.replace('{count}', deletedCount));
                    this.loadTreeData();
                } catch(e) {
                    alert("Error: " + e.message);
                }
            }
        };

        window.renameNode = async (oldPath, type) => {
            const oldName = oldPath.split('/').pop();
            const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
            
            const newName = prompt(store.ui.adminRenamePrompt.replace('{oldName}', oldName), oldName);
            if (!newName || newName === oldName) return;
            
            const safeName = newName.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-\.]/g, '');
            if(!safeName) return;

            const newPath = `${parentPath}/${safeName}`;

            try {
                if (type === 'file') {
                    await github.moveFile(oldPath, newPath, `chore: Rename ${oldName} to ${safeName}`);
                } else {
                    const children = this.getAllDescendants(oldPath);
                    if(children.length === 0) {
                         alert(store.ui.adminFolderEmptyRename);
                         return;
                    }
                    
                    if(!confirm(`${children.filter(x=>x.type!=='tree').length} ${store.ui.adminMoveFileCount}`)) return;

                    let movedCount = 0;
                    for (let child of children) {
                        if (child.type === 'tree') continue;
                        const relPath = child.path.substring(oldPath.length); 
                        const targetPath = `${newPath}${relPath}`;
                        await github.moveFile(child.path, targetFilePath, `chore: Rename folder ${oldName} to ${safeName}`);
                        movedCount++;
                    }
                    alert(store.ui.adminRenameSuccess.replace('{count}', movedCount));
                }
                this.loadTreeData();
            } catch(e) {
                alert("Error: " + e.message);
            }
        };

        window.handleDragStart = (e, path, type) => {
            e.stopPropagation();
            this.state.dragSource = { path, type };
            e.dataTransfer.effectAllowed = 'move';
            e.target.classList.add('opacity-50');
        };

        window.handleDragOver = (e) => {
            e.preventDefault();
            e.currentTarget.classList.add('bg-blue-100', 'dark:bg-blue-900');
        };
        
        window.handleDragLeave = (e) => {
            e.currentTarget.classList.remove('bg-blue-100', 'dark:bg-blue-900');
        };

        window.handleDrop = async (e, targetPath, targetType) => {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.classList.remove('bg-blue-100', 'dark:bg-blue-900');
            document.querySelectorAll('.opacity-50').forEach(el => el.classList.remove('opacity-50'));

            if (!this.state.dragSource) return;
            const src = this.state.dragSource;

            if (src.path === targetPath) return;

            try {
                if (src.type === 'file' && targetType === 'file') {
                    const srcFolder = src.path.substring(0, src.path.lastIndexOf('/'));
                    const targetFolder = targetPath.substring(0, targetPath.lastIndexOf('/'));
                    
                    if (srcFolder === targetFolder) {
                        const msg = store.ui.adminSwapConfirm.replace('{a}', src.path.split('/').pop()).replace('{b}', targetPath.split('/').pop());
                        if (confirm(msg)) {
                            await github.swapOrder(src.path, targetPath);
                            this.loadTreeData();
                        }
                    }
                } 
                else if (targetType === 'folder') {
                    if (src.type === 'folder' && targetPath.startsWith(src.path)) {
                        alert("Cannot move folder into itself.");
                        return;
                    }
                    
                    const msg = store.ui.adminMoveConfirm.replace('{name}', src.path.split('/').pop()).replace('{target}', targetPath.split('/').pop());

                    if (confirm(msg)) {
                        if (src.type === 'file') {
                            const fileName = src.path.split('/').pop();
                            const newPath = `${targetPath}/${fileName}`;
                            await github.moveFile(src.path, newPath, `chore: Move ${fileName}`);
                        } else {
                            const children = this.getAllDescendants(src.path);
                            for (let child of children) {
                                if (child.type === 'tree') continue;
                                const relPath = child.path.substring(src.path.length); 
                                const targetFilePath = `${targetPath}/${src.path.split('/').pop()}${relPath}`;
                                await github.moveFile(child.path, targetFilePath, `chore: Move folder`);
                            }
                        }
                        
                        this.loadTreeData();
                    }
                }
            } catch(err) {
                alert("Error: " + err.message);
            }
            this.state.dragSource = null;
        };
    }

    getAllDescendants(folderPath) {
        const descendants = [];
        const traverse = (nodes) => {
            nodes.forEach(n => {
                if (n.path.startsWith(folderPath + '/')) descendants.push(n);
                if (n.children) traverse(n.children);
            });
        };
        traverse(this.state.treeNodes);
        return descendants;
    }

    render() {
        const user = store.value.githubUser;
        const ui = store.ui;

        if (!user) {
            this.innerHTML = `
            <div class="p-8 text-center flex flex-col items-center justify-center h-full relative">
                <button id="btn-close-login" class="absolute top-4 right-4 w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 transition-colors">✕</button>
                <div class="w-16 h-16 bg-slate-800 text-white rounded-full flex items-center justify-center text-3xl mb-6 shadow-xl">🐙</div>
                <h2 class="text-2xl font-black mb-2 dark:text-white">${ui.contribTitle}</h2>
                <p class="text-sm text-slate-500 mb-6 max-w-md">${ui.contribDesc}</p>
                
                <div class="space-y-4 w-full max-w-sm">
                    <input id="inp-gh-token" type="password" placeholder="${ui.contribTokenPlaceholder}" class="w-full border rounded-xl px-4 py-3 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-slate-500">
                    <div class="flex items-center justify-between px-1">
                        <label class="flex items-center gap-2"><input type="checkbox" id="chk-remember-me" checked><span class="text-xs font-bold text-slate-400">Remember</span></label>
                    </div>
                    <button id="btn-gh-connect" class="w-full py-4 bg-slate-900 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-transform">${ui.contribConnect}</button>
                    
                    <div class="relative py-2">
                        <div class="absolute inset-0 flex items-center"><span class="w-full border-t border-slate-200"></span></div>
                        <div class="relative flex justify-center text-xs uppercase"><span class="bg-white dark:bg-slate-900 px-2 text-slate-500">OR</span></div>
                    </div>
                    
                    <a href="https://github.com/settings/tokens/new?scopes=repo,workflow&description=Arbor%20Studio%20Access" target="_blank" class="block w-full py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors border border-slate-200">
                        🔑 Generate Token (GitHub)
                    </a>
                </div>
            </div>`;
            this.bindLoginEvents();
            return;
        }

        const { adminTab, isAdmin, adminData, treeNodes, treeFilter, isRepoHealthy } = this.state;
        
        const header = `
        <div class="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950 shrink-0">
            <div class="flex items-center gap-3">
                <img src="${user.avatar_url}" class="w-8 h-8 rounded-full border-2 border-white shadow-sm">
                <div>
                    <p class="font-black text-sm text-slate-800 dark:text-white leading-none">@${user.login}</p>
                    <p class="text-[10px] text-green-600 font-bold mt-0.5">● Arbor Studio</p>
                </div>
            </div>
            <div class="flex gap-2 items-center">
                <button id="btn-gh-disconnect" class="text-red-400 hover:text-red-600 text-xs font-bold px-3 py-1.5 border border-red-200 rounded-lg transition-colors">${ui.adminDisconnect}</button>
                <button id="btn-close-panel" class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 transition-colors" title="${ui.close}">✕</button>
            </div>
        </div>`;

        const tabs = `
        <div class="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 shrink-0">
            <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${adminTab === 'explorer' ? 'border-green-500 text-green-600' : 'border-transparent text-slate-400 hover:text-slate-600'}" id="tab-explorer">📂 ${ui.adminExplorer}</button>
            <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${adminTab === 'prs' ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-400 hover:text-slate-600'}" id="tab-prs">${ui.adminPrs}</button>
            ${isAdmin ? `
            <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${adminTab === 'team' ? 'border-purple-500 text-purple-600' : 'border-transparent text-slate-400 hover:text-slate-600'}" id="tab-team">${ui.adminTeam}</button>
            <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${adminTab === 'gov' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}" id="tab-gov">${ui.adminGov}</button>
            ` : ''}
        </div>`;

        let content = '';

        if (adminTab === 'explorer') {
             if (!isRepoHealthy) {
                 content = `
                 <div class="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-50 dark:bg-slate-900">
                    <div class="text-6xl mb-4">🚧</div>
                    <h3 class="text-xl font-black mb-2 dark:text-white">${ui.adminRepoEmpty}</h3>
                    <p class="text-slate-500 mb-6 max-w-sm">${ui.adminRepoEmptyDesc}</p>
                    <button id="btn-init-repo" class="bg-green-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-green-500 transition-transform active:scale-95">
                        ${ui.adminInitTree}
                    </button>
                 </div>`;
             } else {
                 content = `
                 <div class="flex flex-col h-full bg-slate-50/30 overflow-hidden">
                    <div class="p-2 border-b border-slate-100 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0 gap-2">
                        <div class="flex gap-1">
                            <button id="btn-refresh-tree" title="${ui.adminRefresh}" class="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-800"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
                            <button id="btn-create-folder" title="${ui.adminNewFolder}" class="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-800"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg></button>
                            <button id="btn-create-file" title="${ui.adminNewFile}" class="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-800"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></button>
                            
                            ${isAdmin ? `
                            <div class="w-px h-6 bg-slate-200 mx-1"></div>
                            <button id="btn-protect-branch" title="${ui.adminProtectBranch}" class="p-1.5 text-orange-400 hover:text-orange-600 rounded hover:bg-orange-50"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg></button>
                            ` : ''}
                        </div>
                        <div class="flex-1 relative">
                            <input id="inp-tree-filter" type="text" placeholder="${ui.searchPlaceholder}" value="${treeFilter}" class="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500">
                        </div>
                    </div>
                    <div id="tree-container" class="flex-1 overflow-y-auto custom-scrollbar p-2 select-none bg-white dark:bg-slate-900">
                        ${treeNodes.length === 0 ? `<div class="p-8 text-center text-slate-400 animate-pulse text-xs">${ui.editorLoading}</div>` : 
                          AdminRenderer.renderRecursiveTree(treeNodes, 0, {
                              filter: this.state.treeFilter.toLowerCase(),
                              expandedPaths: this.state.expandedPaths,
                              canEdit: (p) => github.canEdit(p),
                              ui: ui
                          })}
                    </div>
                 </div>`;
             }
        }
        else if (adminTab === 'prs') {
            content = `<div class="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/50 dark:bg-slate-900/50">
                ${adminData.prs.length === 0 ? `<div class="text-center p-8 text-slate-400">${ui.noResults}</div>` : 
                adminData.prs.map(pr => `
                    <div class="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex justify-between items-center hover:shadow-md transition-shadow">
                        <div>
                            <a href="${pr.html_url}" target="_blank" class="font-bold text-slate-800 dark:text-white hover:text-blue-600 hover:underline text-sm">#${pr.number} ${pr.title}</a>
                            <p class="text-xs text-slate-400 mt-1">@${pr.user.login} • ${Math.floor((Date.now() - new Date(pr.created_at))/86400000)} ${ui.days}</p>
                        </div>
                        <a href="${pr.html_url}" target="_blank" class="px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50">GitHub</a>
                    </div>
                `).join('')}
            </div>`;
        }
        else if (adminTab === 'team') {
             content = `
             <div class="p-4 border-b border-slate-100 dark:border-slate-800 flex gap-2 shrink-0">
                <input id="inp-invite" type="text" placeholder="GitHub Username" class="flex-1 text-sm p-2 border rounded-lg bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none">
                <button id="btn-invite" class="bg-purple-600 text-white px-3 py-2 rounded-lg text-xs font-bold shadow hover:bg-purple-500">${ui.adminInvite}</button>
             </div>
             <div class="flex-1 overflow-y-auto p-4 space-y-2">
                ${adminData.users.map(u => `
                    <div class="flex items-center justify-between p-2 border-b border-slate-100 dark:border-slate-800">
                        <div class="flex items-center gap-3">
                            <img src="${u.avatar}" class="w-8 h-8 rounded-full">
                            <span class="font-bold text-sm text-slate-700 dark:text-slate-300">${u.login}</span>
                        </div>
                        <span class="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-500">${u.role}</span>
                    </div>
                `).join('')}
             </div>`;
        }
        else if (adminTab === 'gov') {
            const rows = [];
            if (adminData.gov && adminData.gov.content) {
                 adminData.gov.content.split('\n').forEach(line => {
                     const trim = line.trim();
                     if(trim && !trim.startsWith('#')) {
                         const [p, o] = trim.split(/\s+/);
                         if(p && o) rows.push({ path: p, owner: o });
                     }
                 });
            }

            content = `
            <div class="flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/50">
                <div class="p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-xs shrink-0 flex flex-col gap-1">
                    <div class="flex justify-between items-center">
                        <span class="font-bold">CODEOWNERS</span>
                        <button id="btn-save-gov" class="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-bold shadow hover:bg-blue-500">${ui.adminSaveGov}</button>
                    </div>
                    <p class="opacity-70 text-[10px]">
                        Arbor uses this file to hide buttons in the UI. 
                        For real security, enable <strong>Branch Protection Rules</strong> on GitHub.com
                    </p>
                </div>
                <div class="flex-1 overflow-y-auto p-4">
                    <table class="w-full text-sm text-left bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
                        <thead class="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-700">
                            <tr>
                                <th class="px-6 py-3">${ui.adminGovPath}</th>
                                <th class="px-6 py-3">${ui.adminGovOwner}</th>
                                <th class="px-6 py-3 text-right">${ui.adminGovAction}</th>
                            </tr>
                        </thead>
                        <tbody id="gov-table-body">
                             ${rows.map(r => `
                                <tr class="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                    <td class="px-6 py-3 font-mono text-xs text-slate-600 dark:text-slate-300 gov-path">${r.path}</td>
                                    <td class="px-6 py-3 font-bold text-slate-800 dark:text-white gov-owner">${r.owner}</td>
                                    <td class="px-6 py-3 text-right"><button class="text-red-500 hover:text-red-700 text-xs font-bold btn-del-gov">✕</button></td>
                                </tr>
                             `).join('')}
                        </tbody>
                        <tfoot class="bg-slate-50 dark:bg-slate-950">
                            <tr>
                                <td class="px-6 py-3"><input id="new-gov-path" type="text" placeholder="/content/ES/" class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs"></td>
                                <td class="px-6 py-3"><input id="new-gov-user" type="text" placeholder="@user" class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs"></td>
                                <td class="px-6 py-3 text-right"><button id="btn-add-gov" class="text-blue-600 hover:text-blue-800 text-xs font-bold">${ui.adminGovAdd}</button></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>`;
        }

        this.innerHTML = `<div class="flex flex-col h-full overflow-hidden">${header}${tabs}${content}</div>`;
        
        this.bindDashboardEvents();
    }
    
    bindLoginEvents() {
        const btnClose = this.querySelector('#btn-close-login');
        if (btnClose) btnClose.onclick = () => store.setModal(null);

        const btnCon = this.querySelector('#btn-gh-connect');
        if (btnCon) {
            btnCon.onclick = async () => {
                const token = this.querySelector('#inp-gh-token').value.trim();
                const rememberMe = this.querySelector('#chk-remember-me').checked; 
                
                if(!token) return;
                
                const originalText = btnCon.innerHTML;
                btnCon.innerHTML = "⏳ ...";
                btnCon.disabled = true;

                try {
                    const user = await github.initialize(token);
                    if(user) {
                        store.update({ githubUser: user });
                        if(rememberMe) localStorage.setItem('arbor-gh-token', token);
                        else sessionStorage.setItem('arbor-gh-token', token);
                        this.initData();
                    } else { 
                         throw new Error(store.ui.contribTokenError);
                    }
                } catch(e) {
                    alert(e.message);
                    btnCon.innerHTML = originalText;
                    btnCon.disabled = false;
                }
            };
        }
    }
    
    bindDashboardEvents() {
        const tabExplorer = this.querySelector('#tab-explorer');
        if (tabExplorer) tabExplorer.onclick = () => { 
            this.updateState({ adminTab: 'explorer' });
            this.loadTreeData(); 
        };
        
        const tabPrs = this.querySelector('#tab-prs');
        if (tabPrs) tabPrs.onclick = () => { 
            this.updateState({ adminTab: 'prs' });
            this.loadAdminData(); 
        };
        
        if (this.state.isAdmin) {
            const tabTeam = this.querySelector('#tab-team');
            if (tabTeam) tabTeam.onclick = () => { 
                this.updateState({ adminTab: 'team' });
                this.loadAdminData();
            };
            const tabGov = this.querySelector('#tab-gov');
            if (tabGov) tabGov.onclick = () => { 
                this.updateState({ adminTab: 'gov' });
                this.loadAdminData();
            };
        }

        const filterInput = this.querySelector('#inp-tree-filter');
        if (filterInput) {
            filterInput.oninput = (e) => {
                this.updateState({ treeFilter: e.target.value });
                setTimeout(() => {
                    const el = this.querySelector('#inp-tree-filter');
                    if(el) {
                        el.focus();
                        el.selectionStart = el.selectionEnd = el.value.length;
                    }
                }, 10);
            };
        }
        
        const btnInitRepo = this.querySelector('#btn-init-repo');
        if (btnInitRepo) {
            btnInitRepo.onclick = async () => {
                btnInitRepo.innerText = "Processing...";
                btnInitRepo.disabled = true;
                
                try {
                    await github.initializeSkeleton();
                    try {
                         await github.protectBranch();
                         alert(store.ui.adminProtectSuccess);
                    } catch(e) {
                         alert(store.ui.adminProtectError);
                    }
                    this.loadTreeData();
                } catch(e) {
                    alert("Error: " + e.message);
                }
            };
        }
        
        const btnProtect = this.querySelector('#btn-protect-branch');
        if (btnProtect) {
            btnProtect.onclick = async () => {
                if(confirm(store.ui.adminProtectConfirm)) {
                    try {
                        await github.protectBranch();
                        alert(store.ui.adminProtectSuccess);
                    } catch(e) {
                        alert(store.ui.adminProtectError);
                    }
                }
            };
        }
        
        const btnRefresh = this.querySelector('#btn-refresh-tree');
        if(btnRefresh) btnRefresh.onclick = () => this.loadTreeData();
        
        const btnCreateFile = this.querySelector('#btn-create-file');
        if(btnCreateFile) btnCreateFile.onclick = () => {
             const name = prompt("Filename (e.g., 05_Lesson.md):");
             if(!name) return;
             const folder = 'content/EN'; 
             const path = `${folder}/${name}`;
             store.setModal({ 
                 type: 'editor', 
                 returnTo: 'contributor',
                 node: { name: name, sourcePath: path, id: 'new-'+Date.now() } 
             });
        };
        
        const btnCreateFolder = this.querySelector('#btn-create-folder');
        if(btnCreateFolder) btnCreateFolder.onclick = async () => {
            const name = prompt("Folder Name (e.g., 05_New_Module):");
            if(!name) return;
            const folder = 'content/EN';
            const path = `${folder}/${name}/meta.json`;
            
            const metaContent = JSON.stringify({
                name: name.replace(/_/g, ' '),
                icon: "📁",
                description: "New section",
                order: "99"
            }, null, 2);
            
            try {
                await github.createOrUpdateFileContents(path, metaContent, `feat: Create folder ${name}`);
                alert("OK");
                this.loadTreeData();
            } catch(e) {
                alert("Error: " + e.message);
            }
        };

        const btnDis = this.querySelector('#btn-gh-disconnect');
        if (btnDis) btnDis.onclick = () => {
            github.disconnect();
            store.update({ githubUser: null });
            localStorage.removeItem('arbor-gh-token');
            sessionStorage.removeItem('arbor-gh-token');
            this.updateState({ isAdmin: false, adminData: { prs:[], users:[], gov:null } });
        };
        
        const btnClose = this.querySelector('#btn-close-panel');
        if (btnClose) btnClose.onclick = () => store.setModal(null);
        
        if (this.state.adminTab === 'gov') {
             this.bindGovEvents();
        }
        
        if (this.state.adminTab === 'team') {
             const btnInvite = this.querySelector('#btn-invite');
             if (btnInvite) btnInvite.onclick = async () => {
                const user = this.querySelector('#inp-invite').value;
                if(user) {
                    await github.inviteUser(user);
                    alert(store.ui.adminInviteSent);
                }
             };
        }
    }
    
    bindGovEvents() {
        const btnAddGov = this.querySelector('#btn-add-gov');
        if (btnAddGov) btnAddGov.onclick = () => {
            const path = this.querySelector('#new-gov-path').value.trim();
            const user = this.querySelector('#new-gov-user').value.trim();
            if(path && user) {
                const newRow = `
                <tr class="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td class="px-6 py-3 font-mono text-xs text-slate-600 dark:text-slate-300 gov-path">${path}</td>
                    <td class="px-6 py-3 font-bold text-slate-800 dark:text-white gov-owner">${user}</td>
                    <td class="px-6 py-3 text-right"><button class="text-red-500 hover:text-red-700 text-xs font-bold btn-del-gov">✕</button></td>
                </tr>`;
                this.querySelector('#gov-table-body').insertAdjacentHTML('beforeend', newRow);
                this.bindGovDeleteButtons(); 
                this.querySelector('#new-gov-path').value = '';
                this.querySelector('#new-gov-user').value = '';
            }
        };

        const btnSaveGov = this.querySelector('#btn-save-gov');
        if (btnSaveGov) btnSaveGov.onclick = async () => {
             let content = "# ARBOR KNOWLEDGE GOVERNANCE\n# Syntax: [Folder Path] [Owner]\n\n";
             this.querySelectorAll('#gov-table-body tr').forEach(tr => {
                 const p = tr.querySelector('.gov-path').textContent;
                 const o = tr.querySelector('.gov-owner').textContent;
                 content += `${p.padEnd(20)} ${o}\n`;
             });
             
             const targetPath = this.state.adminData.gov ? this.state.adminData.gov.path : '.github/CODEOWNERS';
             const sha = this.state.adminData.gov ? this.state.adminData.gov.sha : null;
             
             try {
                 await github.saveCodeOwners(targetPath, content, sha);
                 alert(store.ui.editorSuccessPublish);
                 this.loadAdminData(); 
             } catch(e) { alert("Error: " + e.message); }
        };
        
        this.bindGovDeleteButtons();
    }
    
    bindGovDeleteButtons() {
        this.querySelectorAll('.btn-del-gov').forEach(btn => {
             btn.onclick = (e) => e.target.closest('tr').remove();
        });
    }
}
customElements.define('arbor-admin-panel', ArborAdminPanel);
