import { store } from "../store.js";
import { utf8_to_b64 } from "../utils/editor-engine.js";

class GitHubService {
    constructor() {
        this.token = null;
        this.currentUser = null;
        this.repoCache = null;
        this.codeOwnersRules = [];
        this.treeCache = null;
        this.baseUrl = "https://api.github.com";
    }

    // --- CORE HTTP CLIENT ---
    
    async request(endpoint, options = {}) {
        if (!this.token) throw new Error("Not authenticated");
        
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Authorization': `Bearer ${this.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            ...options.headers
        };

        const config = {
            method: options.method || 'GET',
            headers: headers
        };

        if (options.body) {
            config.body = JSON.stringify(options.body);
        }

        const response = await fetch(url, config);

        // Handle empty responses (like 204 No Content)
        if (response.status === 204) return null;

        if (!response.ok) {
            // Parse error if possible
            let errorMessage = `GitHub API Error: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorMessage;
            } catch (e) {}
            
            const error = new Error(errorMessage);
            error.status = response.status;
            throw error;
        }

        return await response.json();
    }

    // --- AUTH & INIT ---

    async initialize(token) {
        if (!token) return null;
        this.token = token;
        try {
            // Verify token and get user
            this.currentUser = await this.request("/user");
            
            // Load CODEOWNERS if we are in a repo context
            this.loadCodeOwners().catch(e => console.warn("Could not load CODEOWNERS", e));
            
            return this.currentUser;
        } catch (e) {
            console.error("GitHub Auth Failed", e);
            this.token = null;
            return null;
        }
    }

    disconnect() {
        this.token = null;
        this.currentUser = null;
        this.repoCache = null;
        this.codeOwnersRules = [];
        this.treeCache = null;
    }

    getRepositoryInfo() {
        if (this.repoCache) return this.repoCache;
        const url = store.value.activeSource?.url;
        if (!url) return null;
        try {
            if (url.includes('raw.githubusercontent.com')) {
                const parts = new URL(url).pathname.split('/');
                // /Owner/Repo/...
                this.repoCache = { owner: parts[1], repo: parts[2] };
            } else if (url.includes('github.io')) {
                const hostParts = new URL(url).hostname.split('.');
                const parts = new URL(url).pathname.split('/');
                this.repoCache = { owner: hostParts[0], repo: parts[1] };
            }
        } catch (e) { console.error("Repo parse error", e); }
        return this.repoCache;
    }
    
    async checkHealth() {
        if (!this.token) return false;
        try {
            const repo = this.getRepositoryInfo();
            if (!repo) return false;
            // Lightweight check: get contents of root content folder
            await this.request(`/repos/${repo.owner}/${repo.repo}/contents/content`);
            return true;
        } catch (e) { return false; }
    }

    // --- FILE OPERATIONS ---

    async getFileContent(path) {
        if (!this.token) throw new Error("Editor Mode not connected.");
        const repo = this.getRepositoryInfo();
        try {
            // Add timestamp to prevent caching
            const data = await this.request(`/repos/${repo.owner}/${repo.repo}/contents/${path}?t=${Date.now()}`);
            
            // GitHub returns content as base64 with newlines
            const cleanContent = data.content.replace(/\s/g, '');
            const decoded = new TextDecoder().decode(Uint8Array.from(atob(cleanContent), c => c.charCodeAt(0)));
            
            return { content: decoded, sha: data.sha };
        } catch (e) { 
            throw new Error(`File not found: ${path}`); 
        }
    }

    async getRecursiveTree(path = 'content', forceRefresh = false) {
        if (this.treeCache && !forceRefresh) return this.treeCache.filter(node => node.path.startsWith(path));
        if (!this.token) return [];
        
        const repo = this.getRepositoryInfo();
        if (!repo) return [];
        
        try {
            // 1. Get default branch name
            const repoData = await this.request(`/repos/${repo.owner}/${repo.repo}`);
            const branch = repoData.default_branch;
            
            // 2. Get Branch SHA
            const refData = await this.request(`/repos/${repo.owner}/${repo.repo}/git/ref/heads/${branch}`);
            const sha = refData.object.sha;
            
            // 3. Get Tree Recursive
            const treeData = await this.request(`/repos/${repo.owner}/${repo.repo}/git/trees/${sha}?recursive=true`);
            
            this.treeCache = treeData.tree;
            return treeData.tree.filter(node => node.path.startsWith(path));
        } catch (e) { 
            console.error("Tree fetch failed", e);
            return []; 
        }
    }

    async commitFile(filePath, newContent, message, sha = null) {
        if (!this.token) throw new Error("Not authenticated");
        const repo = this.getRepositoryInfo();
        
        const body = {
            message: message,
            content: utf8_to_b64(newContent)
        };
        if (sha) body.sha = sha;

        const data = await this.request(`/repos/${repo.owner}/${repo.repo}/contents/${filePath}`, {
            method: 'PUT',
            body: body
        });
        return data;
    }

    async deleteFile(filePath, message, sha) {
        if (!this.token) throw new Error("Not authenticated");
        const repo = this.getRepositoryInfo();
        
        await this.request(`/repos/${repo.owner}/${repo.repo}/contents/${filePath}`, {
            method: 'DELETE',
            body: {
                message: message,
                sha: sha
            }
        });
    }

    async createOrUpdateFileContents(filePath, newContent, message, sha = null) {
        return this.commitFile(filePath, newContent, message, sha);
    }

    // --- PULL REQUESTS & BRANCHING ---

    async createPullRequest(filePath, newContent, message, branchName = null) {
        if (!this.token) throw new Error("Not authenticated");
        const repo = this.getRepositoryInfo();
        
        // 1. Get Default Branch & SHA
        const repoData = await this.request(`/repos/${repo.owner}/${repo.repo}`);
        const baseBranch = repoData.default_branch;
        
        const refData = await this.request(`/repos/${repo.owner}/${repo.repo}/git/ref/heads/${baseBranch}`);
        const baseSha = refData.object.sha;

        // 2. Create New Branch
        const newBranch = branchName || `contrib/edit-${Date.now()}`;
        try {
            await this.request(`/repos/${repo.owner}/${repo.repo}/git/refs`, {
                method: 'POST',
                body: {
                    ref: `refs/heads/${newBranch}`,
                    sha: baseSha
                }
            });
        } catch (e) {
            // Ignore if branch exists, otherwise throw
            if (e.status !== 422) throw e;
        }

        // 3. Get file SHA (if it exists) to allow update
        let fileSha = null;
        try {
            const fileData = await this.request(`/repos/${repo.owner}/${repo.repo}/contents/${filePath}?ref=${newBranch}`);
            fileSha = fileData.sha;
        } catch (e) {}

        // 4. Commit to New Branch
        await this.request(`/repos/${repo.owner}/${repo.repo}/contents/${filePath}`, {
            method: 'PUT',
            body: {
                message: message,
                content: utf8_to_b64(newContent),
                branch: newBranch,
                sha: fileSha
            }
        });

        // 5. Create PR
        const pr = await this.request(`/repos/${repo.owner}/${repo.repo}/pulls`, {
            method: 'POST',
            body: {
                title: message,
                body: "Edit via Arbor UI",
                head: newBranch,
                base: baseBranch
            }
        });

        return pr.html_url;
    }

    // --- ADVANCED MOVE (File/Folder) ---
    
    async moveFile(oldPath, newPath, message) {
        if (!this.token) throw new Error("Not authenticated");

        // 1. Try simple file move first
        try {
            const fileData = await this.getFileContent(oldPath);
            // Create new
            await this.commitFile(newPath, fileData.content, message);
            // Delete old
            await this.deleteFile(oldPath, `chore: Move ${oldPath}`, fileData.sha);
            return true;
        } catch(e) {
            // Not a simple file, treat as folder
        }

        // 2. Folder Recursion
        const allFiles = await this.getRecursiveTree(oldPath, true);
        const folderFiles = allFiles.filter(f => f.type === 'blob');

        if (folderFiles.length === 0) throw new Error("Cannot move: Path is empty or invalid.");

        let movedCount = 0;
        for (const file of folderFiles) {
            const relativePath = file.path.substring(oldPath.length);
            const targetPath = newPath + relativePath;
            
            const { content, sha } = await this.getFileContent(file.path);
            
            await this.commitFile(targetPath, content, `${message} (${movedCount + 1}/${folderFiles.length})`);
            await this.deleteFile(file.path, `chore: Cleanup after move`, sha);
            movedCount++;
        }
        
        return true;
    }

    // --- GOVERNANCE & PERMISSIONS ---

    async loadCodeOwners() {
        if (!this.token) return;
        const paths = ['.github/CODEOWNERS', 'CODEOWNERS'];
        let content = '';
        for (const p of paths) {
            try {
                const res = await this.getFileContent(p);
                content = res.content;
                break;
            } catch(e) {}
        }
        
        this.codeOwnersRules = [];
        if (content) {
            content.split('\n').forEach(line => {
                const trim = line.trim();
                if(trim && !trim.startsWith('#')) {
                    const [pathPattern, owner] = trim.split(/\s+/);
                    if(pathPattern && owner) this.codeOwnersRules.push({ path: pathPattern, owner });
                }
            });
        }
    }

    async getCodeOwners() {
        if (!this.token) return null;
        const paths = ['.github/CODEOWNERS', 'CODEOWNERS'];
        for (const p of paths) {
            try {
                const res = await this.getFileContent(p);
                return { path: p, content: res.content, sha: res.sha };
            } catch(e) {}
        }
        return null;
    }
    
    async saveCodeOwners(path, content, sha) {
        return this.commitFile(path, content, "chore: Update CODEOWNERS", sha);
    }

    canEdit(path) {
        if (!this.currentUser) return false;
        const username = '@' + this.currentUser.login.toLowerCase();
        
        let applicableRule = null;
        let maxLen = 0;
        
        this.codeOwnersRules.forEach(rule => {
            const normRulePath = rule.path.startsWith('/') ? rule.path.substring(1) : rule.path;
            const normFilePath = path.startsWith('/') ? path.substring(1) : path;
            
            if (normFilePath.startsWith(normRulePath)) {
                if (normRulePath.length > maxLen) {
                    maxLen = normRulePath.length;
                    applicableRule = rule;
                }
            }
        });
        
        if (applicableRule) return applicableRule.owner.toLowerCase() === username;
        return true; 
    }

    async isAdmin() {
        if (!this.token) return false;
        const repo = this.getRepositoryInfo();
        if (!repo) return false;
        try {
            const perms = await this.request(`/repos/${repo.owner}/${repo.repo}/collaborators/${this.currentUser.login}/permission`);
            return perms.permission === 'admin';
        } catch (e) { return false; }
    }

    async getCollaborators() {
        const repo = this.getRepositoryInfo();
        const data = await this.request(`/repos/${repo.owner}/${repo.repo}/collaborators`);
        return data.map(u => ({
            login: u.login,
            avatar: u.avatar_url,
            role: u.permissions.admin ? 'ADMIN' : (u.permissions.push ? 'EDITOR' : 'READ')
        }));
    }

    async inviteUser(username) {
        const repo = this.getRepositoryInfo();
        await this.request(`/repos/${repo.owner}/${repo.repo}/collaborators/${username}`, {
            method: 'PUT',
            body: { permission: 'push' }
        });
    }

    async getPullRequests() {
        const repo = this.getRepositoryInfo();
        return await this.request(`/repos/${repo.owner}/${repo.repo}/pulls?state=open`);
    }
    
    // --- UTILS ---
    async initializeSkeleton() {
        // Not implemented in lightweight client yet (rare admin action)
        return true;
    }
}

export const github = new GitHubService();