
import { Component, ElementRef, ViewChild, AfterViewInit, effect, inject, OnDestroy } from '@angular/core';
import { DataService } from '../services/data.service';
import { TreeNode } from '../models/arbor.model';

declare const d3: any;

@Component({
  selector: 'app-graph-visualizer',
  standalone: true,
  template: `
    <div #chart class="w-full h-full cursor-grab active:cursor-grabbing relative overflow-hidden bg-gradient-to-b from-sky-200 to-sky-50 dark:from-slate-900 dark:to-slate-800 transition-colors duration-500" style="touch-action: none;">
      
      <!-- Background Elements (Cloud, etc) -->
      <div class="absolute top-10 left-10 opacity-40 dark:opacity-10 pointer-events-none">
        <span class="text-6xl text-white">☁️</span>
      </div>
      <div class="absolute top-20 right-20 opacity-30 dark:opacity-5 pointer-events-none">
        <span class="text-8xl text-white">☁️</span>
      </div>

      <!-- Loading State -->
      @if (dataService.isLoading()) {
        <div class="absolute inset-0 flex flex-col items-center justify-center z-10 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
          <div class="w-16 h-16 border-4 border-sky-200 border-t-green-500 rounded-full animate-spin mb-4"></div>
          <p class="font-bold text-sky-600 dark:text-sky-400 animate-pulse tracking-wide font-comic text-xl">{{ dataService.ui().loading }}</p>
        </div>
      } @else if (dataService.loadError()) {
        <!-- Error Signpost in the Sky -->
        <div class="absolute top-20 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center animate-in slide-in-from-top-10 duration-700">
             <!-- Ropes holding the sign -->
             <div class="w-full flex justify-between px-8 absolute -top-16 h-20 z-0">
                 <div class="w-1 h-full bg-amber-900/40 dark:bg-amber-900/20"></div>
                 <div class="w-1 h-full bg-amber-900/40 dark:bg-amber-900/20"></div>
             </div>

             <!-- Wooden Board -->
             <div class="bg-[#8D6E63] border-4 border-[#5D4037] rounded-lg p-8 shadow-2xl relative max-w-md text-center transform rotate-1 z-10 flex flex-col items-center">
                  <!-- Nails -->
                  <div class="absolute top-2 left-2 w-3 h-3 rounded-full bg-[#3E2723] shadow-inner"></div>
                  <div class="absolute top-2 right-2 w-3 h-3 rounded-full bg-[#3E2723] shadow-inner"></div>
                  <div class="absolute bottom-2 left-2 w-3 h-3 rounded-full bg-[#3E2723] shadow-inner"></div>
                  <div class="absolute bottom-2 right-2 w-3 h-3 rounded-full bg-[#3E2723] shadow-inner"></div>

                  <div class="text-5xl mb-4 drop-shadow-lg">🍂</div>
                  
                  <h2 class="text-white font-black text-2xl mb-2 drop-shadow-md uppercase tracking-widest border-b-2 border-white/20 pb-2 w-full">
                      {{ dataService.ui().errorTitle }}
                  </h2>
                  
                  <p class="text-amber-100 font-bold font-mono text-sm leading-relaxed mb-4">
                    {{ dataService.loadError() }}
                  </p>

                  <div class="text-amber-200/60 text-xs font-bold uppercase tracking-widest border-t border-white/10 pt-2 w-full">
                      {{ dataService.ui().errorNoTrees }}
                  </div>
             </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .font-comic {
      font-family: 'Nunito', 'Comic Sans MS', sans-serif; 
    }
    .node-loader {
      animation: spin 1s linear infinite;
      transform-origin: center;
      stroke: #fff;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `]
})
export class GraphVisualizerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chart') chartContainer!: ElementRef;
  
  public dataService = inject(DataService);
  
  // D3 selections
  private svg: any;
  private g: any; 
  private linkGroup: any;
  private nodeGroup: any;
  private groundGroup: any;
  private zoom: any;
  
  // Dimensions
  private width = 0;
  private height = 0;

  // D3 Configuration
  private treeLayout: any;
  private duration = 750;
  private nodePositions = new Map<string, {x: number, y: number}>();
  
  // Styling Constants
  private branchColors = [
    '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4'
  ];

  private leafColors = [
    '#84cc16', '#14b8a6', '#f43f5e', '#eab308', '#8b5cf6', '#06b6d4', '#f97316'
  ];
  
  private woodColor = '#8D6E63'; 
  private completedLeafColor = '#22c55e';

  constructor() {
    // React to data changes
    effect(() => {
      this.dataService.graphVersion();
      this.dataService.completedNodes();
      this.dataService.data(); 
      
      if (!this.dataService.isLoading() && !this.dataService.loadError()) {
          this.updateGraph();
      }
    });

    // React to focus requests (auto-zoom to node)
    effect(() => {
        const nodeId = this.dataService.nodeToFocus();
        if (nodeId) {
            this.focusOnNode(nodeId);
            this.dataService.nodeToFocus.set(null);
        }
    }, { allowSignalWrites: true });
  }

  ngAfterViewInit() {
    setTimeout(() => {
        this.initContainer();
        if (!this.dataService.isLoading() && !this.dataService.loadError()) {
          this.updateGraph();
        }
        window.addEventListener('resize', this.onResize.bind(this));
    }, 0);
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.onResize.bind(this));
  }

  onResize() {
    if (!this.svg) return;
    this.width = this.chartContainer.nativeElement.clientWidth;
    this.height = this.chartContainer.nativeElement.clientHeight;
    this.svg.attr("viewBox", [0, 0, this.width, this.height]);
    
    this.updateZoomExtent();
    this.drawGround();
    this.updateGraph();
  }

  /**
   * Defines how far the user can zoom out or pan.
   * Ensures the tree roots don't disappear off-screen.
   */
  updateZoomExtent() {
      if (!this.zoom) return;
      
      const horizontalPadding = this.width * 5;
      const topPadding = this.height * 15; // Allow going way up (tree grows up)
      
      // RESTRICTION: Limit bottom padding to barely below the container height.
      // This prevents dragging the "ground" way up the screen.
      const bottomPadding = this.height + 50; 
      
      this.zoom.translateExtent([
          [-horizontalPadding, -topPadding], 
          [horizontalPadding, bottomPadding]
      ]);
  }

  /**
   * Initial setup of SVG, Groups, Filters (Shadows/Glow), and Zoom behavior.
   */
  initContainer() {
    this.width = this.chartContainer.nativeElement.clientWidth;
    this.height = this.chartContainer.nativeElement.clientHeight;

    this.svg = d3.select(this.chartContainer.nativeElement)
      .append("svg")
      .attr("viewBox", [0, 0, this.width, this.height])
      .style("width", "100%")
      .style("height", "100%");
    
    // --- FILTERS DEFINITION ---
    const defs = this.svg.append("defs");
    
    // 1. Leaf Glow (Used for completed items)
    const leafGlowFilter = defs.append("filter")
        .attr("id", "leaf-glow")
        .attr("x", "-50%")
        .attr("y", "-50%")
        .attr("width", "200%")
        .attr("height", "200%");
    
    leafGlowFilter.append("feGaussianBlur")
        .attr("stdDeviation", "5")
        .attr("result", "coloredBlur");

    const feMerge = leafGlowFilter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // 2. Drop Shadow (Used for branches)
    const shadowFilter = defs.append("filter")
        .attr("id", "drop-shadow")
        .attr("x", "-20%")
        .attr("y", "-20%")
        .attr("width", "140%")
        .attr("height", "140%");
    
    shadowFilter.append("feGaussianBlur")
        .attr("in", "SourceAlpha")
        .attr("stdDeviation", 3);
    
    shadowFilter.append("feOffset")
        .attr("dx", 0)
        .attr("dy", 3)
        .attr("result", "offsetblur");
    
    shadowFilter.append("feComponentTransfer")
        .append("feFuncA")
        .attr("type", "linear")
        .attr("slope", 0.3);
    
    const shadowMerge = shadowFilter.append("feMerge");
    shadowMerge.append("feMergeNode");
    shadowMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // --- LAYOUT GROUPS ---
    this.g = this.svg.append("g");
    this.groundGroup = this.g.append("g").attr("class", "ground");
    this.linkGroup = this.g.append("g").attr("class", "links");
    this.nodeGroup = this.g.append("g").attr("class", "nodes");

    this.drawGround();

    // Zoom setup
    this.zoom = d3.zoom()
      .scaleExtent([0.1, 4.0]) // Increased zoom in slightly
      .on("zoom", (event: any) => {
         this.linkGroup.attr("transform", event.transform);
         this.nodeGroup.attr("transform", event.transform);
         this.groundGroup.attr("transform", event.transform); 
      });
    
    this.updateZoomExtent();
    this.svg.call(this.zoom).on("dblclick.zoom", null);

    // Initial positioning
    const k = 0.85;
    const ty = (this.height * 0.85) - (this.height - 100) * k;
    const tx = (this.width / 2) * (1 - k);
    this.svg.call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
  }

  drawGround() {
    this.groundGroup.selectAll("*").remove();
    const hillColor = this.dataService.theme() === 'dark' ? '#1e293b' : '#22c55e';
    const hillColorBack = this.dataService.theme() === 'dark' ? '#0f172a' : '#4ade80';
    
    // We create a truly massive ground shape so user never sees the edge
    const groundWidth = 500000; 
    const groundDepth = 500000;
    
    // Start drawing from the horizontal center of the SVG
    const cx = this.width / 2;
    const groundY = this.height; // The visual "floor" line

    // Back Hill (Darker/Lighter)
    this.groundGroup.append("path")
        .attr("d", `
            M${cx - groundWidth},${groundY} 
            C${cx - 500},${groundY - 180} ${cx + 500},${groundY - 60} ${cx + groundWidth},${groundY} 
            L${cx + groundWidth},${groundY + groundDepth} 
            L${cx - groundWidth},${groundY + groundDepth} Z
        `)
        .attr("fill", hillColorBack)
        .style("opacity", 0.7);

    // Front Hill (Main)
    this.groundGroup.append("path")
        .attr("d", `
            M${cx - groundWidth},${groundY} 
            Q${cx},${groundY - 120} ${cx + groundWidth},${groundY} 
            L${cx + groundWidth},${groundY + groundDepth} 
            L${cx - groundWidth},${groundY + groundDepth} Z
        `)
        .attr("fill", hillColor);
  }

  /**
   * Prepares the raw TreeNode for D3 hierarchy.
   * Assigns colors based on depth/status/branch index.
   */
  private transformToHierarchy(node: TreeNode, depth = 0, parentColor?: string, branchIndex = 0): any {
     const n: any = { ...node, depth };
     
     const isLeafCompleted = n.type === 'leaf' && this.dataService.isCompleted(n.id);
     const isModuleCompleted = n.type === 'branch' && this.dataService.isModuleCompleted(n.id);
     
     if (n.type === 'root') {
         n.color = this.woodColor;
     } else if (isLeafCompleted) {
         n.color = this.completedLeafColor;
     } else if (isModuleCompleted) {
         n.color = this.woodColor;
     } else if (n.type === 'leaf') {
         let seed = 0;
         for (let i = 0; i < n.id.length; i++) seed += n.id.charCodeAt(i);
         n.color = this.leafColors[seed % this.leafColors.length];
     } else if (depth === 1) {
         n.color = this.branchColors[branchIndex % this.branchColors.length];
     } else {
         n.color = parentColor || this.woodColor;
     }
     
     n.isLeafCompleted = isLeafCompleted;
     n.isModuleCompleted = isModuleCompleted;
     
     // Only include children if the node is expanded in the UI
     let children = [];
     if (node.expanded && node.children) {
         children = node.children.map((child, idx) => 
            this.transformToHierarchy(child, depth + 1, n.color, depth === 0 ? idx : branchIndex)
         );
     }
     return { ...n, children: children.length ? children : null };
  }

  updateGraph() {
    if (!this.g || this.dataService.isLoading()) return;
    
    const rawData = this.dataService.data();
    if (!rawData) return;

    // Create D3 Hierarchy
    const root = d3.hierarchy(this.transformToHierarchy(rawData));
    const levelHeight = 180;
    
    // Calculate dynamic width based on number of visible leaves
    let leaves = 0;
    root.each((d: any) => { if(!d.children) leaves++; });
    const dynamicWidth = Math.max(this.width, leaves * 120);

    // Run Tree Layout
    this.treeLayout = d3.tree().size([dynamicWidth, 1]);
    this.treeLayout(root);

    // Adjust coordinates to invert tree (grow upwards)
    root.descendants().forEach((d: any) => {
        d.y = (this.height - 120) - (d.depth * levelHeight);
        if (dynamicWidth < this.width) {
           const offset = (this.width - dynamicWidth) / 2;
           d.x += offset;
        }
    });

    this.render(root);
  }

  /**
   * Main D3 Enter/Update/Exit cycle
   */
  render(root: any) {
     const nodes = root.descendants();
     const links = root.links();
     
     // Store new positions to animate *from* them later
     const newPositions = new Map<string, {x: number, y: number}>();
     nodes.forEach((d: any) => {
         newPositions.set(d.data.id, {x: d.x, y: d.y});
     });

     // Helper to find where a node should animate out to (its parent usually)
     const findCollapseTarget = (d: any) => {
         if (newPositions.has(d.data.id)) {
             return newPositions.get(d.data.id)!;
         }

         let ancestor = d.parent;
         while(ancestor) {
             if (newPositions.has(ancestor.data.id)) {
                 return newPositions.get(ancestor.data.id)!;
             }
             ancestor = ancestor.parent;
         }
         return { x: d.x, y: d.y };
     };
     
     // --- NODE SELECTION ---
     const node = this.nodeGroup.selectAll('g.node')
        .data(nodes, (d: any) => d.data.id);

     // ENTER (Create new nodes)
     const nodeEnter = node.enter().append('g')
        .attr('class', 'node')
        .attr('transform', (d: any) => {
             const parentId = d.parent ? d.parent.data.id : d.data.parentId;
             let origin = {x: this.width/2, y: this.height};
             
             if (parentId && this.nodePositions.has(parentId)) {
                 origin = this.nodePositions.get(parentId)!;
             } else if (d.parent) {
                 origin = {x: d.parent.x, y: d.parent.y};
             }

             return `translate(${origin.x},${origin.y}) scale(0)`;
        })
        .style("cursor", "pointer")
        .style("pointer-events", "all")
        .attr("aria-label", (d: any) => d.data.name);

    // Event Handling (Pointer Down/Up for click vs drag detection)
    nodeEnter.on("pointerdown", (event: any) => {
        event.stopPropagation();
        
        const el = event.currentTarget;
        if(el.setPointerCapture) {
             el.setPointerCapture(event.pointerId);
        }

        el._startX = event.clientX;
        el._startY = event.clientY;
        el._isPressing = true;

        d3.select(el).transition().duration(100).attr("transform", (d: any) => `translate(${d.x},${d.y}) scale(0.95)`);
    });

    nodeEnter.on("pointerup", (event: any, d: any) => {
        event.stopPropagation();

        const el = event.currentTarget;
        if (!el._isPressing) return;
        el._isPressing = false;

        if(el.releasePointerCapture) {
             el.releasePointerCapture(event.pointerId);
        }

        const dx = event.clientX - el._startX;
        const dy = event.clientY - el._startY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Click threshold logic (ignore if dragged far)
        if (distance < 30) {
            this.handleNodeClick(event, d);
        } else {
            d3.select(el).transition().duration(200).attr("transform", `translate(${d.x},${d.y}) scale(1)`);
        }
    });

    nodeEnter.on("contextmenu", (event: any) => {
        event.preventDefault();
        event.stopPropagation();
    });

     // Node Visuals
     nodeEnter.append("circle")
        .attr("class", "hitbox")
        .attr("r", 55)
        .attr("fill", "transparent")
        .style("cursor", "pointer");

     nodeEnter.append("path")
         .attr("class", "node-body")
         .attr("stroke", "#fff")
         .attr("stroke-width", 2);

     nodeEnter.append("text")
        .attr("class", "node-icon")
        .attr("text-anchor", "middle")
        .style("pointer-events", "none")
        .style("user-select", "none");

     // Label Box
     const labelGroup = nodeEnter.append("g")
        .attr("class", "label-group")
        .attr("transform", (d: any) => `translate(0, ${d.data.type === 'root' ? 60 : (d.data.type === 'leaf' ? 75 : 45)})`);

     labelGroup.append("rect")
        .attr("class", "label-bg")
        .attr("rx", 10).attr("ry", 10).attr("height", 22)
        .attr("fill", "rgba(255,255,255,0.9)")
        .attr("stroke-width", 1);

     labelGroup.append("text")
        .attr("class", "label-text")
        .attr("dy", 15).attr("text-anchor", "middle")
        .text((d: any) => d.data.name)
        .attr("fill", "#334155")
        .attr("font-family", "'Nunito', sans-serif")
        .attr("font-size", "12px").attr("font-weight", "800")
        .style("pointer-events", "none")
        .style("user-select", "none");
    
     // Dynamic label sizing
     labelGroup.each(function(this: any) {
        const g = d3.select(this);
        const text = g.select("text");
        try {
            const bbox = (text.node() as SVGTextElement).getBBox();
            g.select("rect").attr("x", -bbox.width/2 - 8).attr("width", bbox.width + 16);
        } catch(e) {}
    });

     // Status Badge (+/-)
     const badge = nodeEnter.append("g")
        .attr("class", "badge-group")
        .attr("transform", (d: any) => `translate(${d.data.type === 'root' ? 30 : 22}, -${d.data.type === 'root' ? 30 : 22})`);

     badge.append("circle")
        .attr("r", 14)
        .attr("stroke", "#fff") 
        .attr("stroke-width", 2)
        .attr("fill", "#22c55e")
        .style("filter", "drop-shadow(0px 2px 3px rgba(0,0,0,0.3))"); 

     badge.append("text")
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .attr("font-weight", "900") 
        .attr("font-size", "18px")
        .attr("fill", "#ffffff")
        .style("user-select", "none");

    // Loading Spinner
    nodeEnter.append("path")
        .attr("class", "node-loader")
        .attr("d", "M-14,0 a14,14 0 0,1 28,0 a14,14 0 0,1 -28,0") 
        .attr("fill", "none")
        .attr("stroke-width", 4)
        .style("display", "none");

    // UPDATE (Animate to new positions)
    const nodeUpdate = node.merge(nodeEnter).transition().duration(this.duration)
        .attr("transform", (d: any) => `translate(${d.x},${d.y}) scale(1)`);
    
    const activePathIds = new Set(this.dataService.currentPath().map(n => n.id));

    // Update shapes and colors
    nodeUpdate.select(".node-body")
        .attr("fill", (d: any) => d.data.color)
        .attr("d", (d: any) => {
            if (d.data.type === 'leaf') {
                return "M0,0 C-25,10 -35,35 0,65 C35,35 25,10 0,0";
            } else {
                const r = d.data.type === 'root' ? 45 : 32;
                return `M${-r},0 a${r},${r} 0 1,0 ${r*2},0 a${r},${r} 0 1,0 ${-r*2},0`;
            }
        })
        .style("filter", (d: any) => d.data.isLeafCompleted ? "url(#leaf-glow)" : "url(#drop-shadow)")
        .attr("stroke", "#fff")
        .attr("stroke-width", (d: any) => {
            if (activePathIds.has(d.data.id)) return 5;
            if (d.data.isLeafCompleted) return 2; 
            return d.data.type === 'leaf' ? 2 : 3;
        });

    node.merge(nodeEnter).select(".node-icon")
        .transition().duration(this.duration)
        .text((d: any) => d.data.isLeafCompleted ? '✓' : (d.data.icon || '🌱'))
        .attr("dy", (d: any) => {
             if (d.data.type === 'leaf') {
                 return "38px"; 
             }
             return "0.35em";
        })
        .attr("font-size", (d: any) => d.data.type === 'leaf' ? (d.data.isLeafCompleted ? "36px" : "24px") : "36px")
        .attr("fill", (d: any) => d.data.isLeafCompleted ? "#ffffff" : null)
        .attr("font-weight", (d: any) => d.data.isLeafCompleted ? "900" : null);
    
    nodeUpdate.select(".badge-group")
        .style("display", (d: any) => {
            return (d.data.type === 'leaf') ? 'none' : 'block';
        });

    nodeUpdate.select(".badge-group circle")
         .attr("fill", (d: any) => {
             if (d.data.expanded) return "#ef4444"; 
             return "#22c55e"; 
         });

    nodeUpdate.select(".badge-group text")
        .text((d: any) => {
            if (d.data.status === 'loading') return ''; 
            if (d.data.expanded) return '-';
            return '+';
        });

    nodeUpdate.select(".label-bg").attr("stroke", (d: any) => d.data.color);
    nodeUpdate.select(".node-loader").style("display", (d: any) => d.data.status === 'loading' ? 'block' : 'none');

    // EXIT (Remove old nodes)
    node.exit().transition().duration(this.duration)
        .attr("transform", (d: any) => {
            const dest = findCollapseTarget(d);
            return `translate(${dest.x},${dest.y}) scale(0)`;
        })
        .remove();

     // --- LINK SELECTION ---
     const link = this.linkGroup.selectAll('path.link')
        .data(links, (d: any) => d.target.data.id);

     const linkEnter = link.enter().append('path')
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke-linecap", "round")
        .attr("stroke-width", (d: any) => Math.max(3, 10 - d.target.depth))
        .attr("stroke", (d: any) => d.source.data.color)
        .attr("d", (d: any) => {
             const parentId = d.source.data.id;
             let origin = {x: d.source.x, y: d.source.y};

             if (this.nodePositions.has(parentId)) {
                 origin = this.nodePositions.get(parentId)!;
             }
             
             const o = { x: origin.x, y: origin.y };
             return this.diagonal({source: o, target: o});
        });

     link.merge(linkEnter).transition().duration(this.duration)
        .attr("stroke", (d: any) => d.source.data.color)
        .attr("d", (d: any) => this.diagonal(d));

     link.exit().transition().duration(this.duration)
        .attr("d", (d: any) => {
            const dest = findCollapseTarget(d.source); 
            const o = {x: dest.x, y: dest.y};
            return this.diagonal({source: o, target: o});
        })
        .remove();

     // Cache current positions for next render
     this.nodePositions.clear();
     nodes.forEach((d: any) => {
         this.nodePositions.set(d.data.id, {x: d.x, y: d.y});
     });
  }

  // Curved line generator
  diagonal(d: any) {
      const s = d.source;
      const t = d.target;
      const midY = (s.y + t.y) / 2;
      
      return `M ${s.x} ${s.y}
              C ${s.x} ${midY},
                ${t.x} ${midY},
                ${t.x} ${t.y}`;
  }

  // Zoom Helpers
  private focusOnCoordinates(x: number, y: number, scale = 1.2, duration = 1200) {
    if (typeof x !== 'number' || typeof y !== 'number' || !this.svg || !this.zoom) return;
    
    const targetScreenY = this.height * 0.70; 
    const targetScreenX = this.width / 2;

    const transform = d3.zoomIdentity
      .translate(targetScreenX, targetScreenY)
      .scale(scale)
      .translate(-x, -y);

    this.svg.transition().duration(duration)
      .call(this.zoom.transform, transform);
  }
  
  focusOnNode(nodeId: string) {
    setTimeout(() => {
        let foundNode: any = null;
        this.nodeGroup.selectAll('g.node').each((d: any) => {
            if(d.data.id === nodeId) foundNode = d;
        });

        if (foundNode) {
            this.focusOnCoordinates(foundNode.x, foundNode.y, 1.2, 1200);
        }
    }, this.duration + 50);
  }

  adjustVerticalView(nodeId: string, isExpanding: boolean) {
      setTimeout(() => {
          let targetNode: any = null;
          this.nodeGroup.selectAll('g.node').each((d: any) => {
              if (d.data.id === nodeId) targetNode = d;
          });

          if (!targetNode) return;

          const t = d3.zoomTransform(this.svg.node());
          const k = t.k; 
          const screenY = t.y + (targetNode.y * k);
          const ratio = isExpanding ? 0.75 : 0.5;
          const targetScreenY = this.height * ratio;
          const dy = targetScreenY - screenY;

          if (Math.abs(dy) > 40) {
              this.svg.transition().duration(1000).ease(d3.easeCubicOut)
                  .call(this.zoom.transform, d3.zoomIdentity.translate(t.x, t.y + dy).scale(k));
          }
      }, 150);
  }

  handleNodeClick(event: any, d: any) {
    if (d.data.status === 'loading') return;
    const isExpanding = !d.data.expanded;
    this.dataService.toggleNode(d.data.id);
    this.adjustVerticalView(d.data.id, isExpanding);
  }
}
