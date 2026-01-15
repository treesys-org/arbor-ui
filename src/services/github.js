
import { Octokit } from "octokit";
import { store } from "../store.js";
import { utf8_to_b64 } from "../utils/editor-engine.js";

class GitHubService {
    constructor() {
        this.octokit = null;
        this.currentUser = null;
        this.repoCache = null;
        this.codeOwnersRules = [];
        this.treeCache = null;
    }

    async initialize(token) {
        if (!token) return null;
        try {
            this.octokit = new Octokit({ auth: token });
            const userPromise = this.octokit.request("GET /user");
            const codeOwnersPromise = this.loadCodeOwners();
            const [userResponse] = await Promise.all([userPromise, codeOwnersPromise]);
            this.currentUser = userResponse.data;
            return this.currentUser;
        } catch (e) {
            console.error("GitHub Auth Failed", e);
            return null;
        }
    }

    disconnect() {
        this.octokit = null;
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
        if (!this.octokit) return false;
        try {
            const repo = this.getRepositoryInfo();
            if (!repo) return false;
            await this.octokit.request('GET /repos/{owner}/{repo}/contents/content', {
                 owner: repo.owner, repo: repo.repo
            });
            return true;
        } catch (e) { return false; }
    }

    async initializeSkeleton() {
        const repo = this.getRepositoryInfo();
        if (!repo) throw new Error("No repository detected.");
        const files = [
            { path: 'content/EN/01_Welcome/meta.json', content: JSON.stringify({ name: "Welcome", icon: "👋", order: "1" }, null, 2) },
            { path: 'content/EN/01_Welcome/01_Intro.md', content: "@title: Hello World\n@icon: 🌍\n@description: Your first lesson.\n\n# Welcome to Arbor\n\nThis is your first lesson. Click 'Edit' to change it!" },
            { path: '.github/CODEOWNERS', content: "# ARBOR GOVERNANCE\n# Define folder owners here\n/content/EN/ @"+this.currentUser.login }
        ];
        for (const file of files) {
            try { await this.commitFile(file.path, file.content, "chore: Initialize Arbor Skeleton"); } catch(e) {}
        }
        return true;
    }

    async protectBranch() {
        if (!this.octokit) throw new Error("Not authenticated");
        const repo = this.getRepositoryInfo();
        const { data: repoData } = await this.octokit.request('GET /repos/{owner}/{repo}', { owner: repo.owner, repo: repo.repo });
        await this.octokit.request('PUT /repos/{owner}/{repo}/branches/{branch}/protection', {
            owner: repo.owner, repo: repo.repo, branch: repoData.default_branch,
            required_status_checks: null, enforce_admins: false,
            required_pull_request_reviews: { dismiss_stale_reviews: false, require_code_owner_reviews: false, required_approving_review_count: 0 },
            restrictions: null
        });
        return true;
    }

    async getFileContent(path) {
        if (!this.octokit) throw new Error("Editor Mode not connected.");
        const repo = this.getRepositoryInfo();
        try {
            const { data } = await this.octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                owner: repo.owner, repo: repo.repo, path, timestamp: Date.now()
            });
            const cleanContent = data.content.replace(/\s/g, '');
            const decoded = new TextDecoder().decode(Uint8Array.from(atob(cleanContent), c => c.charCodeAt(0)));
            return { content: decoded, sha: data.sha };
        } catch (e) { throw new Error(`File not found: ${path}`); }
    }

    async getRecursiveTree(path = 'content', forceRefresh = false) {
        if (this.treeCache && !forceRefresh) return this.treeCache.filter(node => node.path.startsWith(path));
        if (!this.octokit) return [];
        const repo = this.getRepositoryInfo();
        if (!repo) return [];
        try {
            const { data: repoData } = await this.octokit.request('GET /repos/{owner}/{repo}', { owner: repo.owner, repo: repo.repo });
            const { data: ref } = await this.octokit.git.getRef({ owner: repo.owner, repo: repo.repo, ref: `heads/${repoData.default_branch}` });
            const { data: treeData } = await this.octokit.git.getTree({ owner: repo.owner, repo: repo.repo, tree_sha: ref.object.sha, recursive: 'true' });
            this.treeCache = treeData.tree;
            return treeData.tree.filter(node => node.path.startsWith(path));
        } catch (e) { return []; }
    }

    async createPullRequest(filePath, newContent, message, branchName = null) {
        if (!this.octokit) throw new Error("Not authenticated");
        const repo = this.getRepositoryInfo();
        const { data: repoData } = await this.octokit.request('GET /repos/{owner}/{repo}', { owner: repo.owner, repo: repo.repo });
        const baseBranch = repoData.default_branch;
        const branch = branchName || `contrib/edit-${Date.now()}`;
        const { data: ref } = await this.octokit.request('GET /repos/{owner}/{repo}/git/ref/heads/{base}', { owner: repo.owner, repo: repo.repo, base: baseBranch });
        
        try {
            await this.octokit.request('POST /repos/{owner}/{repo}/git/refs', { owner: repo.owner, repo: repo.repo, ref: `refs/heads/${branch}`, sha: ref.object.sha });
        } catch(e) {}

        let fileSha = null;
        try {
            const { data: file } = await this.octokit.request('GET /repos/{owner}/{repo}/contents/{path}', { owner: repo.owner, repo: repo.repo, path: filePath });
            fileSha = file.sha;
        } catch (e) {}

        await this.octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
            owner: repo.owner, repo: repo.repo, path: filePath, message, content: utf8_to_b64(newContent), branch, sha: fileSha
        });

        const { data: pr } = await this.octokit.request('POST /repos/{owner}/{repo}/pulls', {
            owner: repo.owner, repo: repo.repo, title: message, body: `Edit via Arbor UI`, head: branch, base: baseBranch
        });
        return pr.html_url;
    }

    async commitFile(filePath, newContent, message, sha = null) {
        if (!this.octokit) throw new Error("Not authenticated");
        const repo = this.getRepositoryInfo();
        const { data } = await this.octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
            owner: repo.owner, repo: repo.repo, path: filePath, message, content: utf8_to_b64(newContent), sha
        });
        return data;
    }

    async createOrUpdateFileContents(filePath, newContent, message, sha = null) {
        return this.commitFile(filePath, newContent, message, sha);
    }

    async deleteFile(filePath, message, sha) {
        if (!this.octokit) throw new Error("Not authenticated");
        const repo = this.getRepositoryInfo();
        await this.octokit.request('DELETE /repos/{owner}/{repo}/contents/{path}', {
            owner: repo.owner, repo: repo.repo, path: filePath, message, sha
        });
    }

    // --- ENHANCED MOVE LOGIC (FILE & FOLDER) ---
    async moveFile(oldPath, newPath, message) {
        if (!this.octokit) throw new Error("Not authenticated");

        // 1. Is it a file?
        try {
            const fileData = await this.getFileContent(oldPath);
            // It's a file, perform simple move
            await this.commitFile(newPath, fileData.content, message);
            await this.deleteFile(oldPath, `chore: Move ${oldPath}`, fileData.sha);
            return true;
        } catch(e) {
            // It's likely a folder or doesn't exist
        }

        // 2. Handle Folder Recursion
        const allFiles = await this.getRecursiveTree(oldPath, true);
        const folderFiles = allFiles.filter(f => f.type === 'blob'); // Only move blobs

        if (folderFiles.length === 0) throw new Error("Cannot move: Path is empty or invalid.");

        // Process sequentially to avoid hitting API rate limits too hard
        // In a production app, we might create a Git Tree, but that's complex for this scope.
        let movedCount = 0;
        for (const file of folderFiles) {
            const relativePath = file.path.substring(oldPath.length);
            const targetPath = newPath + relativePath;
            
            // Get content
            const { content, sha } = await this.getFileContent(file.path);
            
            // Write to new location
            await this.commitFile(targetPath, content, `${message} (${movedCount + 1}/${folderFiles.length})`);
            
            // Delete old
            await this.deleteFile(file.path, `chore: Cleanup after move`, sha);
            movedCount++;
        }
        
        return true;
    }

    // --- PERMISSION ENGINE (CODEOWNERS) ---
    async loadCodeOwners() {
        if (!this.octokit) return;
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
        if (!this.octokit) return null;
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
        if (!this.octokit) return false;
        const repo = this.getRepositoryInfo();
        if (!repo) return false;
        try {
            const { data: perms } = await this.octokit.request('GET /repos/{owner}/{repo}/collaborators/{username}/permission', {
                owner: repo.owner, repo: repo.repo, username: this.currentUser.login
            });
            return perms.permission === 'admin';
        } catch (e) { return false; }
    }

    async getCollaborators() {
        const repo = this.getRepositoryInfo();
        const { data } = await this.octokit.request('GET /repos/{owner}/{repo}/collaborators', { owner: repo.owner, repo: repo.repo });
        return data.map(u => ({
            login: u.login,
            avatar: u.avatar_url,
            role: u.permissions.admin ? 'ADMIN' : (u.permissions.push ? 'EDITOR' : 'READ')
        }));
    }

    async inviteUser(username) {
        const repo = this.getRepositoryInfo();
        await this.octokit.request('PUT /repos/{owner}/{repo}/collaborators/{username}', { owner: repo.owner, repo: repo.repo, username, permission: 'push' });
    }

    async getPullRequests() {
        const repo = this.getRepositoryInfo();
        const { data } = await this.octokit.request('GET /repos/{owner}/{repo}/pulls', { owner: repo.owner, repo: repo.repo, state: 'open' });
        return data;
    }
}

export const github = new GitHubService();
