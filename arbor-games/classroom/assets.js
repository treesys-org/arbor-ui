/**
 * ASSETS.JS
 * Procedural Pixel Art Generator
 */

export const Colors = {
    bg: '#cccccc', // Lighter grey wall
    board: '#2b382e',
    boardFrame: '#5c4033',
    skin: '#fca',
    hair_prof: '#444',
    suit_prof: '#1f2937',
    // Student Colors matching Mock
    lola: '#ef4444',   // Red
    timmy: '#3b82f6',  // Blue
    player: '#22c55e'  // Green
};

export class SpriteGen {
    static createCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        return { c, ctx: c.getContext('2d') };
    }

    static generateProfessor() {
        const { c, ctx } = this.createCanvas(64, 64);
        
        // Body
        ctx.fillStyle = Colors.suit_prof;
        ctx.fillRect(16, 32, 32, 32); 
        
        // Head
        ctx.fillStyle = Colors.skin;
        ctx.fillRect(20, 10, 24, 24);
        
        // Hair
        ctx.fillStyle = Colors.hair_prof;
        ctx.fillRect(18, 6, 28, 10);
        ctx.fillRect(18, 6, 6, 18);
        
        // Glasses
        ctx.fillStyle = '#000';
        ctx.fillRect(22, 20, 8, 4);
        ctx.fillRect(34, 20, 8, 4);
        ctx.fillStyle = '#fff';
        ctx.fillRect(23, 21, 2, 2);
        
        return c;
    }

    static generateStudent(colorOverride) {
        const { c, ctx } = this.createCanvas(64, 64);
        
        // Shirt
        ctx.fillStyle = colorOverride;
        ctx.fillRect(14, 34, 36, 30);
        
        // Head (Cube style)
        ctx.fillStyle = Colors.skin;
        ctx.fillRect(20, 14, 24, 20);
        
        // Eyes (Simple dots)
        ctx.fillStyle = '#000';
        ctx.fillRect(26, 20, 4, 4);
        ctx.fillRect(36, 20, 4, 4);
        
        return c;
    }

    static generateBackground(w, h) {
        const { c, ctx } = this.createCanvas(w, h);
        
        // Wall
        ctx.fillStyle = Colors.bg;
        ctx.fillRect(0, 0, w, h);
        
        // Floor
        ctx.fillStyle = '#4a3b32'; // Darker floor
        ctx.fillRect(0, h * 0.65, w, h * 0.35);
        
        // Blackboard (Wider)
        ctx.fillStyle = Colors.boardFrame;
        ctx.fillRect(w * 0.2 - 10, h * 0.1 - 10, w * 0.6 + 20, h * 0.35 + 20);
        ctx.fillStyle = Colors.board;
        ctx.fillRect(w * 0.2, h * 0.1, w * 0.6, h * 0.35);

        return c;
    }

    static generateDesk() {
        const { c, ctx } = this.createCanvas(80, 60);
        
        // Body (Solid wood)
        ctx.fillStyle = '#78350f';
        ctx.fillRect(0, 10, 80, 50);
        
        // Desktop Surface
        ctx.fillStyle = '#92400e'; 
        ctx.fillRect(0, 0, 80, 15);
        
        // Shadow/Detail underneath rim
        ctx.fillStyle = '#000';
        ctx.globalAlpha = 0.2;
        ctx.fillRect(5, 15, 70, 2);
        
        return c;
    }
}