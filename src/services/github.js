

import { Octokit } from "octokit";
import { store } from "../store.js";
import { utf8_to_b64 } from "../utils/editor-engine.js";

class GitHubService {
    constructor() {
        this.octokit = null;
        this.currentUser = null;
        this.repoCache = null;
        this.codeOwnersRules = [];
    }

    async initialize(token) {
        if (!token) return null;
        try {
            // Octokit is exported by the bundle in index.html
            this.octokit = new Octokit({ auth: token });
            const { data } = await this.octokit.request("GET /user");
            this.currentUser = data;
            
            // Pre-load governance if possible
            await this.loadCodeOwners();
            
            return data;
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
    
    // --- REPO HEALTH & SETUP ---
    
    async checkHealth() {
        if (!this.octokit) return false;
        try {
            // Check if 'content' folder exists
            const repo = this.getRepositoryInfo();
            if (!repo) return false;
            
            await this.octokit.request('GET /repos/{owner}/{repo}/contents/content', {
                 owner: repo.owner, repo: repo.repo
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    async initializeSkeleton() {
        const repo = this.getRepositoryInfo();
        if (!repo) throw new Error("No repository detected.");
        
        const files = [
            {
                path: 'content/EN/01_Welcome/meta.json',
                content: JSON.stringify({ name: "Welcome", icon: "👋", order: "1" }, null, 2)
            },
            {
                path: 'content/EN/01_Welcome/01_Intro.md',
                content: "@title: Hello World\n@icon: 🌍\n@description: Your first lesson.\n\n# Welcome to Arbor\n\nThis is your first lesson. Click 'Edit' to change it!"
            },
            {
                path: '.github/CODEOWNERS',
                content: "# ARBOR GOVERNANCE\n# Define folder owners here\n/content/EN/ @"+this.currentUser.login
            }
        ];
        
        for (const file of files) {
            try {
                await this.createOrUpdateFileContents(file.path, file.content, "chore: Initialize Arbor Skeleton");
            } catch(e) { console.warn("File creation skipped", e); }
        }
        return true;
    }

    // --- CONTENT OPS ---

    async getFileContent(path) {
        if (!this.octokit) throw new Error("Editor Mode not connected.");
        const repo = this.getRepositoryInfo();
        
        try {
            // Add timestamp to prevent caching issues during editing sessions
            const { data } = await this.octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                owner: repo.owner, repo: repo.repo, path, timestamp: Date.now()
            });
            const cleanContent = data.content.replace(/\s/g, '');
            const decoded = new TextDecoder().decode(Uint8Array.from(atob(cleanContent), c => c.charCodeAt(0)));
            return { content: decoded, sha: data.sha };
        } catch (e) {
            throw new Error(`File not found: ${path}`);
        }
    }

    // Recursive Tree for Studio View
    async getRecursiveTree(path = 'content') {
        if (!this.octokit) return [];
        const repo = this.getRepositoryInfo();
        if (!repo) return [];
        
        try {
            // Get default branch ref
            const { data: repoData } = await this.octokit.request('GET /repos/{owner}/{repo}', {
                owner: repo.owner, repo: repo.repo
            });
            const branch = repoData.default_branch;

            const { data: ref } = await this.octokit.git.getRef({
                owner: repo.owner, repo: repo.repo, ref: `heads/${branch}`
            });
            
            const { data: treeData } = await this.octokit.git.getTree({
                owner: repo.owner, repo: repo.repo, tree_sha: ref.object.sha, recursive: 'true'
            });

            // Filter to show only content inside the specific path
            return treeData.tree.filter(node => node.path.startsWith(path));
        } catch (e) {
            console.error("Error fetching recursive tree", e);
            return [];
        }
    }

    async createPullRequest(filePath, newContent, message, branchName = null) {
        if (!this.octokit) throw new Error("Not authenticated");
        const repo = this.getRepositoryInfo();
        
        // 0. Fetch default branch info to be safe
        const { data: repoData } = await this.octokit.request('GET /repos/{owner}/{repo}', {
             owner: repo.owner, repo: repo.repo
        });
        const baseBranch = repoData.default_branch;
        
        const branch = branchName || `contrib/edit-${Date.now()}`;

        // 1. Get Base SHA
        const { data: ref } = await this.octokit.request('GET /repos/{owner}/{repo}/git/ref/heads/{base}', {
            owner: repo.owner, repo: repo.repo, base: baseBranch
        });
        
        // 2. Create Branch (only if it doesn't exist, generic check)
        try {
            await this.octokit.request('POST /repos/{owner}/{repo}/git/refs', {
                owner: repo.owner, repo: repo.repo, ref: `refs/heads/${branch}`, sha: ref.object.sha
            });
        } catch(e) { 
            // Branch might exist if we are adding multiple files to same PR (future feature)
        }

        // 3. Get File SHA (if exists)
        let fileSha = null;
        try {
            const { data: file } = await this.octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                owner: repo.owner, repo: repo.repo, path: filePath
            });
            fileSha = file.sha;
        } catch (e) {}

        // 4. Update File
        const contentB64 = utf8_to_b64(newContent); 
        await this.octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
            owner: repo.owner, repo: repo.repo, path: filePath,
            message, content: contentB64, branch, sha: fileSha
        });

        // 5. Create PR
        const { data: pr } = await this.octokit.request('POST /repos/{owner}/{repo}/pulls', {
            owner: repo.owner, repo: repo.repo,
            title: message, body: `Edit via Arbor UI`, head: branch, base: baseBranch
        });

        return pr.html_url;
    }

    // Direct Commit (For Owners)
    async commitFile(filePath, newContent, message, sha = null) {
        if (!this.octokit) throw new Error("Not authenticated");
        const repo = this.getRepositoryInfo();
        const contentB64 = utf8_to_b64(newContent); 
        
        const { data } = await this.octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
            owner: repo.owner, repo: repo.repo, path: filePath,
            message, content: contentB64, sha
        });
        return data;
    }

    // Alias for compatibility with Editor Engine expectations if needed
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

    // --- COMPLEX OPERATIONS (Studio Features) ---

    // Optimized Move: Handles both File rename AND Folder rename (recursively)
    async moveFile(oldPath, newPath, message) {
        if (!this.octokit) throw new Error("Not authenticated");

        // 1. Determine if it's a file or a folder structure
        // We try to get file content first. If it fails, we assume it might be a directory or non-existent
        let isFile = false;
        let fileData = null;

        try {
            fileData = await this.getFileContent(oldPath);
            isFile = true;
        } catch(e) {
            isFile = false;
        }

        if (isFile) {
            // Case A: Single File Move
            // 1. Create New
            await this.commitFile(newPath, fileData.content, message);
            // 2. Delete Old
            await this.deleteFile(oldPath, `chore: Move file to ${newPath}`, fileData.sha);
            return;
        }

        // Case B: Folder Move (Recursive)
        // Note: GitHub API does not support moving folders directly.
        // We must identify all children, move them one by one.
        // Caller of this function should ideally provide the list of children to avoid re-fetching tree
        // but if not provided, we fetch.
        
        // Warning: This is expensive operations.
        // We rely on the UI/AdminPanel to iterate children and call moveFile for each file,
        // rather than doing the recursion here implicitly which can be opaque.
        
        // If execution reaches here, it means we tried to move a "file" that doesn't exist as a blob.
        throw new Error("Cannot move folder directly via API. Please use the Admin Panel which handles recursive moves.");
    }

    async swapOrder(pathA, pathB) {
        // 1. Get Contents
        const fileA = await this.getFileContent(pathA);
        const fileB = await this.getFileContent(pathB);

        // 2. Parse Orders (Simple regex to avoid full parser dependency here)
        const getOrder = (txt) => {
            const m = txt.match(/@order:\s*(\d+)/) || txt.match(/"order":\s*"(\d+)"/) || txt.match(/"order":\s*(\d+)/);
            return m ? m[1] : '99';
        };

        const orderA = getOrder(fileA.content);
        const orderB = getOrder(fileB.content);

        // 3. Swap in text
        const setOrder = (txt, oldVal, newVal) => {
            // Regex for Markdown metadata
            if(txt.includes(`@order`)) {
                return txt.replace(new RegExp(`@order:\\s*${oldVal}`), `@order: ${newVal}`);
            }
            // Regex for JSON metadata
            if(txt.includes(`"order"`)) {
                return txt.replace(new RegExp(`"order":\\s*"${oldVal}"`), `"order": "${newVal}"`)
                          .replace(new RegExp(`"order":\\s*${oldVal}`), `"order": "${newVal}"`);
            }
            return txt; // Fail safe
        };

        const newContentA = setOrder(fileA.content, orderA, orderB);
        const newContentB = setOrder(fileB.content, orderB, orderA);

        // 4. Commit Both
        await this.commitFile(pathA, newContentA, `chore: Swap order ${pathA}`, fileA.sha);
        await this.commitFile(pathB, newContentB, `chore: Swap order ${pathB}`, fileB.sha);
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
            const lines = content.split('\n');
            lines.forEach(line => {
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

        // If a rule exists, only the owner can edit.
        // If NO rule exists, anyone with a valid token can edit (default permissive for collaborators)
        if (applicableRule) {
             return applicableRule.owner.toLowerCase() === username;
        }
        return true; 
    }

    // --- ADMIN / GOVERNANCE OPS ---

    async isAdmin() {
        if (!this.octokit) return false;
        const repo = this.getRepositoryInfo();
        if (!repo) return false;
        try {
            // Check checks if user is a collaborator with admin permission
            const { data: perms } = await this.octokit.request('GET /repos/{owner}/{repo}/collaborators/{username}/permission', {
                owner: repo.owner, repo: repo.repo, username: this.currentUser.login
            });
            return perms.permission === 'admin';
        } catch (e) {
            return false;
        }
    }

    async getCollaborators() {
        const repo = this.getRepositoryInfo();
        const { data } = await this.octokit.request('GET /repos/{owner}/{repo}/collaborators', {
            owner: repo.owner, repo: repo.repo
        });
        return data.map(u => ({
            login: u.login,
            avatar: u.avatar_url,
            role: u.permissions.admin ? 'ADMIN' : (u.permissions.push ? 'EDITOR' : 'READ')
        }));
    }

    async inviteUser(username) {
        const repo = this.getRepositoryInfo();
        await this.octokit.request('PUT /repos/{owner}/{repo}/collaborators/{username}', {
            owner: repo.owner, repo: repo.repo, username, permission: 'push'
        });
    }

    async getPullRequests() {
        const repo = this.getRepositoryInfo();
        const { data } = await this.octokit.request('GET /repos/{owner}/{repo}/pulls', {
            owner: repo.owner, repo: repo.repo, state: 'open'
        });
        return data;
    }
}

export const github = new GitHubService();
