

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GraphVisualizerComponent } from './components/graph-visualizer.component';
import { ContentPanelComponent } from './components/content-panel.component';
import { BreadcrumbsComponent } from './components/breadcrumbs.component';
import { LessonPreviewComponent } from './components/lesson-preview.component';
import { CertificatesGalleryComponent } from './components/certificates-gallery.component';
import { SourceManagerComponent } from './components/source-manager.component';
import { SidebarComponent } from './components/sidebar.component';
import { InfoModalsComponent } from './components/info-modals.component';
import { DataService } from './services/data.service';
import { SearchNode } from './models/arbor.model';
import { GoogleDriveSyncService } from './services/google-drive-sync.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule, 
    GraphVisualizerComponent, 
    ContentPanelComponent,
    BreadcrumbsComponent,
    LessonPreviewComponent,
    CertificatesGalleryComponent,
    SourceManagerComponent,
    SidebarComponent,
    InfoModalsComponent
  ],
  templateUrl: './app.component.html'
})
export class AppComponent {
  dataService = inject(DataService);
  googleDriveSyncService = inject(GoogleDriveSyncService);
  
  // Modal State - Default to 'tutorial' for new users
  activeModal: 'tutorial' | 'about' | 'impressum' | 'language' | null = 'tutorial';
  
  isSearchOpen = false;
  isProgressOpen = false;
  isSourceManagerOpen = false;

  searchQuery = '';
  searchResults: SearchNode[] = [];

  // Actions delegated to service or internal state
  closeModal() { this.activeModal = null; }
  openModal(type: 'tutorial' | 'about' | 'impressum' | 'language') { this.activeModal = type; }

  toggleSourceManager() {
    this.isSourceManagerOpen = !this.isSourceManagerOpen;
  }
  
  toggleProgress() {
    this.isProgressOpen = !this.isProgressOpen;
  }

  viewCertificates() {
    this.dataService.setViewMode('certificates');
    this.isProgressOpen = false;
  }

  openSearch() {
    this.isSearchOpen = true;
    this.isProgressOpen = false;
    setTimeout(() => {
        const input = document.getElementById('searchInput');
        if(input) input.focus();
    }, 100);
  }

  closeSearch() {
    this.isSearchOpen = false;
    this.searchQuery = '';
    this.searchResults = [];
  }

  onSearchInput() {
    this.searchResults = this.dataService.search(this.searchQuery);
  }

  navigateToResult(node: SearchNode) {
    this.dataService.navigateTo(node.id);
    this.closeSearch();
  }

  signIn() { this.googleDriveSyncService.signIn(); }
  signOut() { this.googleDriveSyncService.signOut(); }
}