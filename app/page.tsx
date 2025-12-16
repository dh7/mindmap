'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { MindMapRef } from './components/MindMap';
import type { MindElixirData } from 'mind-elixir';
import { snapdom } from '@zumer/snapdom';

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

// Icons as simple SVGs
const Icons = {
  New: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  ),
  Import: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7,10 12,15 17,10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  Export: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17,8 12,3 7,8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  Image: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21,15 16,10 5,21" />
    </svg>
  ),
  Save: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17,21 17,13 7,13 7,21" />
      <polyline points="7,3 7,8 15,8" />
    </svg>
  ),
  Brain: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.02" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.02" />
    </svg>
  ),
  Close: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
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

// Modal component
function Modal({
  isOpen,
  onClose,
  title,
  children
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export default function Home() {
  const mindMapRef = useRef<MindMapRef>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [importData, setImportData] = useState('');
  const [exportData, setExportData] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  }, []);

  const handleNew = useCallback(() => {
    if (mindMapRef.current) {
      const newData: MindElixirData = {
        nodeData: {
          id: 'root-' + Date.now(),
          topic: 'New Mind Map',
          children: [],
        },
      };
      mindMapRef.current.refresh(newData);
      showToast('New mind map created!', 'success');
    }
  }, [showToast]);

  const handleExportJSON = useCallback(() => {
    if (mindMapRef.current) {
      const data = mindMapRef.current.getDataString();
      setExportData(data);
      setShowExportModal(true);
    }
  }, []);

  const handleImportJSON = useCallback(() => {
    setImportData('');
    setShowImportModal(true);
  }, []);

  const handleImportSubmit = useCallback(() => {
    try {
      const data = JSON.parse(importData) as MindElixirData;
      if (mindMapRef.current && data.nodeData) {
        mindMapRef.current.refresh(data);
        setShowImportModal(false);
        setImportData('');
        showToast('Mind map imported successfully!', 'success');
      } else {
        showToast('Invalid mind map data format', 'error');
      }
    } catch {
      showToast('Failed to parse JSON data', 'error');
    }
  }, [importData, showToast]);

  const handleFileImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content) as MindElixirData;
          if (mindMapRef.current && data.nodeData) {
            mindMapRef.current.refresh(data);
            showToast('Mind map imported from file!', 'success');
          } else {
            showToast('Invalid mind map data format', 'error');
          }
        } catch {
          showToast('Failed to parse file', 'error');
        }
      };
      reader.readAsText(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [showToast]);

  const handleDownloadJSON = useCallback(() => {
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
      showToast('Mind map downloaded!', 'success');
    }
  }, [showToast]);

  const handleCopyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(exportData);
      showToast('Copied to clipboard!', 'success');
    } catch {
      showToast('Failed to copy to clipboard', 'error');
    }
  }, [exportData, showToast]);

  const handleExportImage = useCallback(async () => {
    if (mindMapRef.current) {
      const instance = mindMapRef.current.getInstance();
      if (instance && instance.nodes) {
        try {
          showToast('Generating image...', 'success');
          const result = await snapdom(instance.nodes);
          await result.download({ format: 'png', filename: `mindmap-${Date.now()}` });
          showToast('Image downloaded!', 'success');
        } catch (error) {
          console.error('Export error:', error);
          showToast('Failed to export image', 'error');
        }
      }
    }
  }, [showToast]);

  // Auto-save to localStorage
  const handleDataChange = useCallback((data: MindElixirData) => {
    try {
      localStorage.setItem('mindmap-autosave', JSON.stringify(data));
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Load from localStorage on mount
  const [initialData, setInitialData] = useState<MindElixirData | undefined>(undefined);

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

  return (
    <main className="mindmap-container">
      {/* Toolbar */}
      <div className="toolbar">
        <button className="btn-glass btn-primary" onClick={handleNew} title="New Mind Map">
          <Icons.New /> New
        </button>

        <div className="file-input-wrapper">
          <button className="btn-glass" title="Import from file">
            <Icons.Import /> Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileImport}
          />
        </div>

        <button className="btn-glass" onClick={handleImportJSON} title="Import from JSON">
          <Icons.Save /> Paste JSON
        </button>

        <button className="btn-glass btn-accent" onClick={handleDownloadJSON} title="Download as JSON">
          <Icons.Export /> Export
        </button>

        <button className="btn-glass" onClick={handleExportJSON} title="View/Copy JSON">
          <Icons.Save /> Copy JSON
        </button>

        <button className="btn-glass" onClick={handleExportImage} title="Export as Image">
          <Icons.Image /> Image
        </button>
      </div>

      {/* Mind Map */}
      <MindMap
        ref={mindMapRef}
        initialData={initialData}
        onDataChange={handleDataChange}
      />

      {/* App title */}
      <div className="app-title">
        <Icons.Brain />
        MindMap Pro
      </div>

      {/* Help tooltip */}
      <div className="help-tooltip">
        <kbd>Tab</kbd> Add child • <kbd>Enter</kbd> Add sibling • <kbd>Del</kbd> Delete • <kbd>Space</kbd> Edit
      </div>

      {/* Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Import Mind Map"
      >
        <textarea
          value={importData}
          onChange={(e) => setImportData(e.target.value)}
          placeholder="Paste your mind map JSON data here..."
        />
        <div className="modal-actions">
          <button className="btn-glass" onClick={() => setShowImportModal(false)}>
            Cancel
          </button>
          <button className="btn-glass btn-primary" onClick={handleImportSubmit}>
            Import
          </button>
        </div>
      </Modal>

      {/* Export Modal */}
      <Modal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export Mind Map"
      >
        <textarea
          value={exportData}
          readOnly
        />
        <div className="modal-actions">
          <button className="btn-glass" onClick={() => setShowExportModal(false)}>
            Close
          </button>
          <button className="btn-glass btn-primary" onClick={handleCopyToClipboard}>
            Copy to Clipboard
          </button>
        </div>
      </Modal>

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
