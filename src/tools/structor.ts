
/**
 * Structor - Sprite Mapping Tool Logic
 */

class Structor {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private gridCanvas: HTMLCanvasElement;
    private gridCtx: CanvasRenderingContext2D;
    private previewCanvas: HTMLCanvasElement;
    private previewCtx: CanvasRenderingContext2D;
    private image: HTMLImageElement | null = null;

    private zoom: number = 1;
    private isDragging: boolean = false;
    private gridVisible: boolean = true;
    private selection = { x: 0, y: 0, w: 32, h: 32 };
    private config: any = {};

    constructor() {
        this.canvas = document.getElementById('spriteCanvas') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.gridCanvas = document.getElementById('gridOverlay') as HTMLCanvasElement;
        this.gridCtx = this.gridCanvas.getContext('2d')!;
        this.previewCanvas = document.getElementById('previewCanvas') as HTMLCanvasElement;
        this.previewCtx = this.previewCanvas.getContext('2d')!;

        this.setupEventListeners();
    }

    private setupEventListeners() {
        document.getElementById('fileInput')?.addEventListener('change', (e) => this.handleFile(e));
        document.getElementById('btnLoadDemo')?.addEventListener('click', () => this.loadDemo());

        const viewer = document.getElementById('viewer')!;
        viewer.addEventListener('mousedown', (e) => this.startSelection(e));
        window.addEventListener('mousemove', (e) => this.updateSelection(e));
        window.addEventListener('mouseup', () => this.endSelection());

        // Zoom controls
        document.getElementById('btnZoomIn')?.addEventListener('click', () => this.setZoom(this.zoom * 1.2));
        document.getElementById('btnZoomOut')?.addEventListener('click', () => this.setZoom(this.zoom / 1.2));
        document.getElementById('btnResetZoom')?.addEventListener('click', () => this.setZoom(1));
        document.getElementById('btnToggleGrid')?.addEventListener('click', () => {
            this.gridVisible = !this.gridVisible;
            this.gridCanvas.style.display = this.gridVisible ? 'block' : 'none';
        });

        // Coordinate inputs
        ['boxX', 'boxY', 'boxW', 'boxH'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => this.updateSelectionFromInputs());
        });

        document.getElementById('btnExport')?.addEventListener('click', () => this.exportToConfig());

        window.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    private handleKeyboard(e: KeyboardEvent) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            const step = e.shiftKey ? 1 : 32;
            if (e.key === 'ArrowUp') this.selection.y -= step;
            if (e.key === 'ArrowDown') this.selection.y += step;
            if (e.key === 'ArrowLeft') this.selection.x -= step;
            if (e.key === 'ArrowRight') this.selection.x += step;

            this.updateInputsFromSelection();
            this.updateSelectionBox();
            this.updatePreview();
            e.preventDefault();
        }
    }

    private handleFile(e: any) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            this.loadImage(event.target?.result as string);
        };
        reader.readAsDataURL(file);
    }

    private loadDemo() {
        const demoSheet = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAM0lEQVRYR+3VwQkAMAgEMKv779S7hyCId8ALEn6vSREIECBAgAABAgQIECBAgMAtfOAAESofvzwAAAAASUVORK5CYII=';
        this.loadImage(demoSheet);
    }

    private loadImage(src: string) {
        this.image = new Image();
        this.image.onload = () => {
            this.canvas.width = this.image!.width;
            this.canvas.height = this.image!.height;
            this.gridCanvas.width = this.image!.width;
            this.gridCanvas.height = this.image!.height;
            this.draw();
            this.drawGrid();
            this.updateSelectionBox();
        };
        this.image.src = src;
    }

    private drawGrid() {
        this.gridCtx.clearRect(0, 0, this.gridCanvas.width, this.gridCanvas.height);
        this.gridCtx.strokeStyle = '#fff';
        this.gridCtx.lineWidth = 0.5;
        this.gridCtx.beginPath();
        for (let x = 0; x <= this.gridCanvas.width; x += 32) {
            this.gridCtx.moveTo(x, 0);
            this.gridCtx.lineTo(x, this.gridCanvas.height);
        }
        for (let y = 0; y <= this.gridCanvas.height; y += 32) {
            this.gridCtx.moveTo(0, y);
            this.gridCtx.lineTo(this.gridCanvas.width, y);
        }
        this.gridCtx.stroke();
    }

    private setZoom(z: number) {
        this.zoom = Math.max(0.1, Math.min(10, z));
        const container = document.getElementById('canvasContainer')!;
        container.style.transform = `scale(${this.zoom})`;
    }

    private startSelection(e: MouseEvent) {
        if (!this.image) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / this.zoom;
        const y = (e.clientY - rect.top) / this.zoom;

        if (x >= 0 && x <= this.canvas.width && y >= 0 && y <= this.canvas.height) {
            this.isDragging = true;
            this.selection.x = Math.floor(x);
            this.selection.y = Math.floor(y);
            this.updateInputsFromSelection();
            this.updateSelectionBox();
        }
    }

    private updateSelection(e: MouseEvent) {
        if (!this.isDragging || !this.image) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / this.zoom;
        const y = (e.clientY - rect.top) / this.zoom;

        this.selection.w = Math.max(1, Math.floor(x - this.selection.x));
        this.selection.h = Math.max(1, Math.floor(y - this.selection.y));

        this.updateInputsFromSelection();
        this.updateSelectionBox();
    }

    private endSelection() {
        this.isDragging = false;
        this.updatePreview();
    }

    private updateSelectionFromInputs() {
        this.selection.x = parseInt((document.getElementById('boxX') as HTMLInputElement).value) || 0;
        this.selection.y = parseInt((document.getElementById('boxY') as HTMLInputElement).value) || 0;
        this.selection.w = parseInt((document.getElementById('boxW') as HTMLInputElement).value) || 32;
        this.selection.h = parseInt((document.getElementById('boxH') as HTMLInputElement).value) || 32;
        this.updateSelectionBox();
        this.updatePreview();
    }

    private updateInputsFromSelection() {
        (document.getElementById('boxX') as HTMLInputElement).value = this.selection.x.toString();
        (document.getElementById('boxY') as HTMLInputElement).value = this.selection.y.toString();
        (document.getElementById('boxW') as HTMLInputElement).value = this.selection.w.toString();
        (document.getElementById('boxH') as HTMLInputElement).value = this.selection.h.toString();
    }

    private updateSelectionBox() {
        const box = document.getElementById('selectionBox')!;
        box.style.left = `${this.selection.x}px`;
        box.style.top = `${this.selection.y}px`;
        box.style.width = `${this.selection.w}px`;
        box.style.height = `${this.selection.h}px`;
    }

    private draw() {
        if (!this.image) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.image, 0, 0);
    }

    private updatePreview() {
        if (!this.image) return;
        this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);

        // Mantener el aspecto en la vista previa
        const ratio = Math.min(this.previewCanvas.width / this.selection.w, this.previewCanvas.height / this.selection.h);
        const nw = this.selection.w * ratio;
        const nh = this.selection.h * ratio;

        this.previewCtx.drawImage(
            this.image,
            this.selection.x, this.selection.y, this.selection.w, this.selection.h,
            (this.previewCanvas.width - nw) / 2, (this.previewCanvas.height - nh) / 2, nw, nh
        );
    }

    private exportToConfig() {
        const cat = (document.getElementById('catSelect') as HTMLSelectElement).value;
        const clase = (document.getElementById('claseInput') as HTMLInputElement).value || 'default';
        const estado = (document.getElementById('estadoInput') as HTMLInputElement).value || 'idle';

        if (!this.config[cat]) this.config[cat] = {};
        if (!this.config[cat][clase]) this.config[cat][clase] = {};

        this.config[cat][clase][estado] = {
            x: this.selection.x,
            y: this.selection.y,
            w: this.selection.w,
            h: this.selection.h
        };

        document.getElementById('output')!.textContent = JSON.stringify(this.config, null, 2);
    }
}

new Structor();
