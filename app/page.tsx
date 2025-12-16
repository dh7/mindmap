'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { MindMapRef } from './components/MindMap';
import type { MindElixirData } from 'mind-elixir';

// Dynamic import for MindElixir to avoid SSR issues
const MindMap = dynamic(() => import('./components/MindMap'), {
  ssr: false,
  loading: () => (
    <div className="mindmap-container flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <p className="opacity-60">Loading mind map...</p>
      </div>
    </div>
  ),
});

// Icons
const Icons = {
  Save: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17,21 17,13 7,13 7,21" />
      <polyline points="7,3 7,8 15,8" />
    </svg>
  ),
  Download: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7,10 12,15 17,10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  Image: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21,15 16,10 5,21" />
    </svg>
  ),
  Open: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Brain: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.02" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.02" />
    </svg>
  ),
  Mermaid: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18" />
      <path d="M5 8l7-5 7 5" />
      <path d="M5 16l7 5 7-5" />
    </svg>
  ),
  Collapse: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  ),
};

// Toast notification component
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`toast ${type}`}>
      {type === 'success' ? '✓' : '✕'} {message}
    </div>
  );
}

export default function Home() {
  const mindMapRef = useRef<MindMapRef>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mermaidInputRef = useRef<HTMLInputElement>(null);
  const [initialData, setInitialData] = useState<MindElixirData | undefined>(undefined);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('mindmap-autosave');
      if (saved) {
        const data = JSON.parse(saved) as MindElixirData;
        if (data.nodeData) {
          setInitialData(data);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Auto-save to localStorage
  const handleDataChange = useCallback((data: MindElixirData) => {
    try {
      localStorage.setItem('mindmap-autosave', JSON.stringify(data));
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Open JSON file
  const handleOpenFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content) as MindElixirData;
          if (mindMapRef.current && data.nodeData) {
            mindMapRef.current.refresh(data);
            // Collapse all after a short delay to let the render complete
            setTimeout(() => mindMapRef.current?.collapseAll(), 300);
            showToast('Mind map loaded!', 'success');
          } else {
            showToast('Invalid file format', 'error');
          }
        } catch {
          showToast('Failed to parse file', 'error');
        }
      };
      reader.readAsText(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [showToast]);

  // Save JSON to disk
  const handleSaveJSON = useCallback(() => {
    if (mindMapRef.current) {
      const data = mindMapRef.current.getDataString();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mindmap-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('JSON saved!', 'success');
    }
  }, [showToast]);

  // Save PNG to disk
  const handleSavePng = useCallback(async () => {
    if (mindMapRef.current) {
      try {
        showToast('Generating PNG...', 'success');
        const base64 = await mindMapRef.current.exportPng();
        const a = document.createElement('a');
        a.href = base64;
        a.download = `mindmap-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('PNG saved!', 'success');
      } catch (error) {
        console.error('Export error:', error);
        showToast('Failed to export PNG', 'error');
      }
    }
  }, [showToast]);

  // Save SVG to disk
  const handleSaveSvg = useCallback(async () => {
    if (mindMapRef.current) {
      try {
        showToast('Generating SVG...', 'success');
        const dataUrl = await mindMapRef.current.exportSvg();
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `mindmap-${Date.now()}.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('SVG saved!', 'success');
      } catch (error) {
        console.error('Export error:', error);
        showToast('Failed to export SVG', 'error');
      }
    }
  }, [showToast]);

  // Open Mermaid file
  const handleOpenMermaid = useCallback(() => {
    mermaidInputRef.current?.click();
  }, []);

  const handleMermaidFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          if (mindMapRef.current && content.trim()) {
            mindMapRef.current.setMermaid(content);
            // Collapse all after a short delay to let the render complete
            setTimeout(() => mindMapRef.current?.collapseAll(), 300);
            showToast('Mermaid loaded!', 'success');
          } else {
            showToast('Invalid Mermaid file', 'error');
          }
        } catch {
          showToast('Failed to parse Mermaid', 'error');
        }
      };
      reader.readAsText(file);
    }
    if (mermaidInputRef.current) {
      mermaidInputRef.current.value = '';
    }
  }, [showToast]);

  // Save Mermaid to disk
  const handleSaveMermaid = useCallback(() => {
    if (mindMapRef.current) {
      const mermaid = mindMapRef.current.getMermaid();
      const blob = new Blob([mermaid], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mindmap-${Date.now()}.mmd`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Mermaid saved!', 'success');
    }
  }, [showToast]);

  const handleCollapse = useCallback(() => {
    if (mindMapRef.current) {
      mindMapRef.current.collapseAll();
      showToast('Nodes collapsed', 'success');
    }
  }, [showToast]);

  return (
    <main className="mindmap-container">
      {/* Header */}
      <header className="header">
        <div className="header-brand">
          <Icons.Brain />
          <span>MindMap</span>
        </div>
        <div className="header-actions">
          <button className="btn-header" onClick={handleOpenFile} title="Open JSON file">
            <Icons.Open />
            <span>Open</span>
          </button>
          <button className="btn-header" onClick={handleSaveJSON} title="Save as JSON">
            <Icons.Save />
            <span>Save JSON</span>
          </button>
          <button className="btn-header" onClick={handleOpenMermaid} title="Load Mermaid file">
            <Icons.Mermaid />
            <span>Load Mermaid</span>
          </button>
          <button className="btn-header" onClick={handleSaveMermaid} title="Save as Mermaid">
            <Icons.Mermaid />
            <span>Save Mermaid</span>
          </button>
          <button className="btn-header" onClick={handleCollapse} title="Collapse all except root and first level">
            <Icons.Collapse />
            <span>Collapse</span>
          </button>
          <button className="btn-header" onClick={handleSaveSvg} title="Save as SVG">
            <Icons.Image />
            <span>Save SVG</span>
          </button>
          <button className="btn-header btn-accent" onClick={handleSavePng} title="Save as PNG">
            <Icons.Image />
            <span>Save PNG</span>
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <input
          ref={mermaidInputRef}
          type="file"
          accept=".mmd,.md,.txt"
          onChange={handleMermaidFileChange}
          style={{ display: 'none' }}
        />
      </header>

      {/* Mind Map */}
      <div className="mindmap-content">
        <MindMap
          ref={mindMapRef}
          initialData={initialData}
          onDataChange={handleDataChange}
        />
      </div>

      {/* Toast notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </main>
  );
}
