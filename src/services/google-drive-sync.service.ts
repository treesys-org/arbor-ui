
import { Injectable, signal, computed } from '@angular/core';

declare const gapi: any;
declare const google: any;

const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';

// SAFELY ACCESS PROCESS.ENV
// In browser environments (like GitHub Pages), 'process' is undefined.
// We must check for its existence to prevent a "ReferenceError: process is not defined" crash.
const API_KEY = (typeof process !== 'undefined' && process.env && process.env['API_KEY']) ? process.env['API_KEY'] : '';

const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const PROGRESS_FILE_NAME = 'arbor_progress.json';

interface UserProfile {
    name: string;
    email: string;
    picture: string;
}

@Injectable({
  providedIn: 'root'
})
export class GoogleDriveSyncService {
  private gapiReady = signal(false);
  private gisReady = signal(false);
  private tokenClient: any;
  private gapiInited = signal(false);
  private gisInited = signal(false);
  
  readonly isInitialized = computed(() => this.gapiInited() && this.gisInited());
  readonly isLoggedIn = signal(false);
  readonly isSyncing = signal(false);
  readonly syncError = signal<string | null>(null);
  readonly userProfile = signal<UserProfile | null>(null);

  constructor() {
    this.loadScripts();
  }

  private loadScripts() {
    (window as any)['onGapiLoad'] = () => {
      gapi.load('client', this.initializeGapiClient.bind(this));
    };
    (window as any)['onGisLoad'] = () => {
      this.initializeGisClient();
    };

    if (typeof gapi !== 'undefined' && gapi.load) {
        (window as any)['onGapiLoad']();
    } else {
        this.injectScript('https://apis.google.com/js/api.js', 'onGapiLoad');
    }

    if (typeof google !== 'undefined' && google.accounts) {
        (window as any)['onGisLoad']();
    } else {
        this.injectScript('https://accounts.google.com/gsi/client', 'onGisLoad');
    }
  }

  private injectScript(src: string, onloadCallbackName: string) {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = (window as any)[onloadCallbackName];
    document.body.appendChild(script);
  }

  private async initializeGapiClient() {
    try {
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: DISCOVERY_DOCS,
        });
        this.gapiInited.set(true);
    } catch (error) {
        console.error("Error initializing GAPI client", error);
        this.syncError.set('Could not initialize Google API client.');
    }
  }

  private initializeGisClient() {
    this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse: any) => {
            if (tokenResponse && tokenResponse.access_token) {
                this.handleAuthSuccess(tokenResponse);
            } else {
                this.handleAuthError(tokenResponse);
            }
        },
    });
    this.gisInited.set(true);
  }

  private async handleAuthSuccess(tokenResponse: any) {
    gapi.client.setToken(tokenResponse);
    this.isLoggedIn.set(true);
    this.fetchUserProfile();
  }
  
  private handleAuthError(error: any) {
    console.error("Authentication error:", error);
    this.syncError.set("Authentication failed. Please try again.");
    this.isLoggedIn.set(false);
  }

  private async fetchUserProfile() {
    try {
        const response = await gapi.client.oauth2.userinfo.get();
        this.userProfile.set(response.result);
    } catch (error) {
        console.error("Failed to fetch user profile", error);
    }
  }

  signIn() {
    if (!this.isInitialized()) {
      console.warn("Sync service not initialized yet.");
      return;
    }
    this.tokenClient.requestAccessToken();
  }

  signOut() {
    const token = gapi.client.getToken();
    if (token) {
        google.accounts.oauth2.revoke(token.access_token, () => {});
        gapi.client.setToken(null);
    }
    this.isLoggedIn.set(false);
    this.userProfile.set(null);
  }

  private async findProgressFile(): Promise<string | null> {
    try {
      const response = await gapi.client.drive.files.list({
        spaces: 'appDataFolder',
        fields: 'files(id, name)',
        pageSize: 10
      });
      const file = response.result.files.find((f: any) => f.name === PROGRESS_FILE_NAME);
      return file ? file.id : null;
    } catch (error) {
      console.error("Error finding progress file:", error);
      this.syncError.set("Could not search for progress file.");
      return null;
    }
  }

  async loadProgress(): Promise<Set<string>> {
    this.isSyncing.set(true);
    this.syncError.set(null);
    try {
      const fileId = await this.findProgressFile();
      if (!fileId) {
        return new Set(); 
      }
      
      const response = await gapi.client.drive.files.get({
        fileId: fileId,
        alt: 'media'
      });

      const progressData = JSON.parse(response.body);
      if (Array.isArray(progressData)) {
        return new Set(progressData);
      }
      return new Set();
    } catch (error) {
      console.error("Error loading progress:", error);
      this.syncError.set("Failed to load progress from Google Drive.");
      return new Set();
    } finally {
      this.isSyncing.set(false);
    }
  }

  async saveProgress(progress: Set<string>): Promise<void> {
    this.isSyncing.set(true);
    this.syncError.set(null);
    const content = JSON.stringify(Array.from(progress));
    
    try {
      const fileId = await this.findProgressFile();
      if (fileId) {
        await this.updateProgressFile(fileId, content);
      } else {
        await this.createProgressFile(content);
      }
    } catch (error) {
      console.error("Error saving progress:", error);
      this.syncError.set("Failed to save progress to Google Drive.");
    } finally {
      this.isSyncing.set(false);
    }
  }

  private async createProgressFile(content: string): Promise<void> {
    const metadata = {
      name: PROGRESS_FILE_NAME,
      parents: ['appDataFolder']
    };
    
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([content], { type: 'application/json' }));

    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: new Headers({ 'Authorization': 'Bearer ' + gapi.client.getToken().access_token }),
      body: form
    });
  }
  
  private async updateProgressFile(fileId: string, content: string): Promise<void> {
     await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: new Headers({ 
            'Authorization': 'Bearer ' + gapi.client.getToken().access_token,
            'Content-Type': 'application/json'
        }),
        body: content
     });
  }
}
