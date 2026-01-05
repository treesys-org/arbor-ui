

import { Octokit } from "octokit";
import { store } from "../store.js";

class GitHubService {
    constructor() {
        this.octokit = null;
        this.currentUser = null;
    }

    async initialize(token) {
        if (!token) return null;
        try {
            this.octokit = new Octokit({ auth: token });
            const { data } = await this.octokit.request("GET /user");
            this.currentUser = data;
            return data;
        } catch (e) {
            console.error("GitHub Auth Failed", e);
            return null;
        }
    }

    disconnect() {
        this.octokit = null;
        this.currentUser = null;
    }

    // Helper to get owner/repo from current Source URL
    // Assumption: The source URL is like 'https://raw.githubusercontent.com/OWNER/REPO/branch/data/data.json'
    getRepositoryInfo() {
        const url = store.value.activeSource?.url;
        if (!url) return null;

        try {
            // Case 1: Raw GitHub User Content
            if (url.includes('raw.githubusercontent.com')) {
                const parts = new URL(url).pathname.split('/');
                // pathname starts with /, so parts[0] is empty
                return { owner: parts[1], repo: parts[2] };
            }
            // Case 2: GitHub Pages (username.github.io/repo/...)
            if (url.includes('github.io')) {
                const hostParts = new URL(url).hostname.split('.');
                const owner = hostParts[0];
                const parts = new URL(url).pathname.split('/');
                const repo = parts[1];
                return { owner, repo };
            }
        } catch (e) {
            console.error("Could not parse repo info", e);
        }
        return null;
    }

    async getFileContent(path) {
        if (!this.octokit) throw new Error("Not authenticated");
        const repoInfo = this.getRepositoryInfo();
        if (!repoInfo) throw new Error("Could not determine repository");

        const { data } = await this.octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
            owner: repoInfo.owner,
            repo: repoInfo.repo,
            path: path
        });

        // Content is base64 encoded
        // Decode unicode strings properly
        const binaryString = atob(data.content);
        const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
        const decoded = new TextDecoder().decode(bytes);
        
        return {
            content: decoded,
            sha: data.sha
        };
    }

    async createPullRequest(filePath, newContent, message) {
        if (!this.octokit) throw new Error("Not authenticated");
        const repoInfo = this.getRepositoryInfo();
        const timestamp = Date.now();
        const branchName = `feat/edit-${timestamp}`;

        // 1. Get reference to main branch to find latest SHA
        const { data: refData } = await this.octokit.request('GET /repos/{owner}/{repo}/git/ref/heads/main', {
            owner: repoInfo.owner,
            repo: repoInfo.repo
        });
        const mainSha = refData.object.sha;

        // 2. Create new branch
        await this.octokit.request('POST /repos/{owner}/{repo}/git/refs', {
            owner: repoInfo.owner,
            repo: repoInfo.repo,
            ref: `refs/heads/${branchName}`,
            sha: mainSha
        });

        // 3. Get file SHA (needed for update)
        let fileSha = null;
        try {
            const { data: fileData } = await this.octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                owner: repoInfo.owner,
                repo: repoInfo.repo,
                path: filePath
            });
            fileSha = fileData.sha;
        } catch (e) {
            // File might not exist (creating new file)
        }

        // 4. Encode content to Base64 (UTF-8 safe)
        const utf8Bytes = new TextEncoder().encode(newContent);
        const base64Content = btoa(String.fromCharCode(...utf8Bytes));

        // 5. Update/Create file in new branch
        await this.octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
            owner: repoInfo.owner,
            repo: repoInfo.repo,
            path: filePath,
            message: message,
            content: base64Content,
            branch: branchName,
            sha: fileSha // Required if updating
        });

        // 6. Create Pull Request
        const { data: prData } = await this.octokit.request('POST /repos/{owner}/{repo}/pulls', {
            owner: repoInfo.owner,
            repo: repoInfo.repo,
            title: message,
            body: `Proposed changes to ${filePath} via Arbor Studio.`,
            head: branchName,
            base: 'main'
        });

        return prData.html_url;
    }

    async uploadImage(file) {
         if (!this.octokit) throw new Error("Not authenticated");
         const repoInfo = this.getRepositoryInfo();
         
         const reader = new FileReader();
         return new Promise((resolve, reject) => {
             reader.onload = async () => {
                 try {
                     const contentBase64 = reader.result.split(',')[1];
                     const ext = file.name.split('.').pop();
                     const filename = `assets/uploads/${Date.now()}.${ext}`;
                     
                     // Direct commit to main for assets (Simpler for now, or use same branch logic)
                     // IMPORTANT: Ideally should be in the PR branch, but for simplicity we upload to main 
                     // OR we need to pass the branch name if we are in the middle of an edit session.
                     // For this MVP, let's assume assets are uploaded to a specific 'assets' branch or main 
                     // but to avoid pollution let's upload to main so they are immediately available via raw URL
                     // WARNING: This is a "hot" commit.
                     
                     await this.octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
                         owner: repoInfo.owner,
                         repo: repoInfo.repo,
                         path: filename,
                         message: `Upload asset ${filename}`,
                         content: contentBase64
                     });
                     
                     // Construct Raw URL
                     // https://raw.githubusercontent.com/OWNER/REPO/main/path
                     const rawUrl = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/main/${filename}`;
                     resolve(rawUrl);

                 } catch (e) {
                     reject(e);
                 }
             };
             reader.readAsDataURL(file);
         });
    }
}

export const github = new GitHubService();
