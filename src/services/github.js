
import { Octokit } from "octokit";

class GitHubService {
    constructor() {
        this.octokit = null;
        this.currentUser = null;
        this.activeUrl = null; // Store context locally to avoid circular dependency
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

    // Set the context manually from Store
    setContext(url) {
        this.activeUrl = url;
    }

    // Helper to get owner/repo from current Source URL
    getRepositoryInfo() {
        const url = this.activeUrl;
        if (!url) return null;

        try {
            // Case 1: Raw GitHub User Content
            if (url.includes('raw.githubusercontent.com')) {
                const parts = new URL(url).pathname.split('/');
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
        // Use a cleaner decoding method for UTF-8
        const binaryString = atob(data.content.replace(/\s/g, ''));
        const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
        const decoded = new TextDecoder().decode(bytes);
        
        return {
            content: decoded,
            sha: data.sha
        };
    }

    // Convert string to Base64 safely handling UTF-8 (emojis, etc.)
    utf8ToBase64(str) {
        const bytes = new TextEncoder().encode(str);
        const binString = Array.from(bytes, (byte) =>
            String.fromCodePoint(byte)
        ).join("");
        return btoa(binString);
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
        const base64Content = this.utf8ToBase64(newContent);

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
                     
                     await this.octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
                         owner: repoInfo.owner,
                         repo: repoInfo.repo,
                         path: filename,
                         message: `Upload asset ${filename}`,
                         content: contentBase64
                     });
                     
                     // Construct Raw URL
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
