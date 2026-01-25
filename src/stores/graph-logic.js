
import { TreeUtils } from '../utils/tree-utils.js';
import { fileSystem } from '../services/filesystem.js';
import { DataProcessor } from '../utils/data-processor.js';

export class GraphLogic {
    constructor(store) {
        this.store = store;
    }

    findNode(id) { 
        return TreeUtils.findNode(id, this.store.state.data); 
    }
    
    async navigateTo(nodeId, nodeData = null) {
        if (!nodeData) {
            const inTree = this.findNode(nodeId);
            if (inTree) nodeData = inTree;
            else return;
        }

        const pathStr = nodeData.path || nodeData.p;
        if (!pathStr) return;

        const pathNames = pathStr.split(' / ');
        let currentNode = this.store.state.data;
        
        for (let i = 1; i < pathNames.length; i++) {
            const ancestorName = pathNames[i];
            
            if (currentNode.hasUnloadedChildren) await this.loadNodeChildren(currentNode);

            let nextNode = currentNode.children?.find(child => child.name === ancestorName);

            if (!nextNode && currentNode.children) {
                const cleanTarget = TreeUtils.cleanString(ancestorName).replace(/\s+/g, '');
                nextNode = currentNode.children.find(child => {
                     const cleanChild = TreeUtils.cleanString(child.name).replace(/\s+/g, '');
                     return cleanChild === cleanTarget || child.name.includes(ancestorName);
                });
            }

            if (!nextNode) return;

            if (nextNode.type === 'branch' || nextNode.type === 'root') nextNode.expanded = true;
            currentNode = nextNode;
        }

        this.store.dispatchEvent(new CustomEvent('graph-update'));
        setTimeout(() => {
            this.toggleNode(nodeId);
            this.store.dispatchEvent(new CustomEvent('focus-node', { detail: nodeId }));
        }, 100);
    }

    async navigateToNextLeaf() {
        if (!this.store.state.selectedNode || !this.store.state.data) return;
        const leaves = [];
        const traverse = (node) => {
            if (node.type === 'leaf' || node.type === 'exam') leaves.push(node);
            if (node.children) node.children.forEach(traverse);
        };
        traverse(this.store.state.data);
        const currentIndex = leaves.findIndex(n => n.id === this.store.state.selectedNode.id);
        if (currentIndex !== -1 && currentIndex < leaves.length - 1) {
            const nextNode = leaves[currentIndex + 1];
            if (!nextNode.content && nextNode.contentPath) await this.loadNodeContent(nextNode);
            await this.navigateTo(nextNode.id, nextNode);
            this.store.update({ selectedNode: nextNode, previewNode: null });
        } else {
            this.store.closeContent();
        }
    }

    async toggleNode(nodeId) {
        const node = this.findNode(nodeId);
        if (!node) return;
        
        try {
            let path = [];
            let curr = node;
            while(curr) {
                path.unshift(curr);
                curr = curr.parentId ? this.findNode(curr.parentId) : null;
            }
            this.store.update({ path });

            if (!node.expanded) {
                if (node.parentId) {
                    const parent = this.findNode(node.parentId);
                    if (parent && parent.children) {
                        parent.children.forEach(sibling => {
                            if (sibling.id !== nodeId && sibling.expanded) this.collapseRecursively(sibling);
                        });
                    }
                }
            }

            if (node.type === 'leaf' || node.type === 'exam') {
                this.store.update({ previewNode: node, selectedNode: null });
            } else {
                this.store.update({ selectedNode: null, previewNode: null });
                if (!node.expanded) {
                    if (node.hasUnloadedChildren) await this.loadNodeChildren(node);
                    if (!node.children || node.children.length === 0) {
                        node.isEmpty = true; // Mark as empty state
                        this.store.setModal({ type: 'emptyModule', node: node });
                    }
                    node.expanded = true;
                } else {
                    this.collapseRecursively(node);
                }
            }
            this.store.dispatchEvent(new CustomEvent('graph-update')); 

        } catch (e) {
            console.error(e);
            this.store.update({ lastErrorMessage: "Error interacting with node: " + e.message });
            setTimeout(() => this.store.update({ lastErrorMessage: null }), 5000);
        }
    }

    collapseRecursively(node) {
        node.expanded = false;
        if (node.children) node.children.forEach(c => this.collapseRecursively(c));
    }

    async loadNodeChildren(node) {
        if (!node.apiPath) return;
        node.status = 'loading';
        this.store.dispatchEvent(new CustomEvent('graph-update'));
        
        try {
            const sourceUrl = this.store.state.activeSource.url;
            const baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/') + 1);
            const url = `${baseDir}nodes/${node.apiPath}.json`;
            
            const res = await fetch(url);
            if (res.ok) {
                let text = await res.text();
                if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                const children = JSON.parse(text.trim());
                
                if (children.length === 0) {
                    node.children = [];
                    node.isEmpty = true; // Mark as empty state
                    this.store.setModal({ type: 'emptyModule', node: node });
                } else {
                    children.forEach(child => child.parentId = node.id);
                    node.children = children;
                    const examPrefix = this.store.ui.examLabelPrefix || "Exam: ";
                    if (examPrefix) {
                        node.children.forEach(child => {
                            if (child.type === 'exam' && !child.name.startsWith(examPrefix)) child.name = examPrefix + child.name;
                        });
                    }
                }
                node.hasUnloadedChildren = false;
                
                // HYDRATION CHECK: Using the DataProcessor utility
                DataProcessor.hydrateCompletionState(this.store, node);
                
            } else {
                throw new Error(`Failed to load children: ${node.apiPath}.json`);
            }
        } catch(e) { 
            console.error(e);
            this.store.update({ lastErrorMessage: e.message });
        } finally {
            node.status = 'available';
            this.store.dispatchEvent(new CustomEvent('graph-update'));
        }
    }
    
    async loadNodeContent(node) {
        if (node.content) return;
        if (!node.contentPath) return; 
        
        this.store.update({ loading: true }); 
        
        try {
            const sourceUrl = this.store.state.activeSource.url;
            const baseDir = sourceUrl.substring(0, sourceUrl.lastIndexOf('/') + 1);
            const url = `${baseDir}content/${node.contentPath}`;
            
            const res = await fetch(url);
            if(res.ok) {
                const json = await res.json();
                node.content = json.content;
            } else {
                throw new Error(`Content missing for ${node.name}`);
            }
        } catch(e) {
            console.error("Content fetch failed", e);
            node.content = "Error loading content. Please check internet connection.";
        } finally {
            this.store.update({ loading: false });
        }
    }
    
    async moveNode(node, newParentId) {
        this.store.update({ loading: true });
        try {
            const newParent = this.findNode(newParentId);
            if(!newParent) throw new Error("Target parent not found");
            
            const oldPath = node.sourcePath;
            const parentPath = newParent.sourcePath;
            
            await fileSystem.moveNode(oldPath, parentPath);
            
            const source = this.store.state.activeSource;
            await this.store.loadData(source, false);
            
            this.store.notify(this.store.ui.nodeMoved || "Node moved successfully!");
            
        } catch(e) {
            console.error(e);
            this.store.update({ error: (this.store.ui.moveFailed || "Move failed: ") + e.message });
            setTimeout(() => this.store.update({ error: null }), 3000);
        } finally {
            this.store.update({ loading: false });
        }
    }
}
