'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { MindCache } from 'mindcache';
import type { MindMapRef } from './components/MindMap';
import type { MindElixirData } from 'mind-elixir';
import type { SystemTag } from 'mindcache';

// System tags for LLM permissions (typed from MindCache)
const TAG_LLM_READ: SystemTag = 'LLMRead';
const TAG_LLM_WRITE: SystemTag = 'LLMWrite';
// User tag for mindmap organization
const TAG_MINDMAP = 'mindmap';

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
  Upload: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17,8 12,3 7,8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  Download: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7,10 12,15 17,10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  ChevronDown: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6,9 12,15 18,9" />
    </svg>
  ),
  Brain: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.02" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.02" />
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

  Plus: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Trash: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Pen: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
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
  const mermaidInputRef = useRef<HTMLInputElement>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Mindmap management state
  // Load last used mindmap from localStorage, fallback to default
  const [activeMindmap, setActiveMindmap] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('lastActiveMindmap') || 'mindmap-mermaid';
    }
    return 'mindmap-mermaid';
  });
  const activeMindmapRef = useRef(activeMindmap); // Ref for use in callbacks to avoid stale closures
  const [mindmapKeys, setMindmapKeys] = useState<string[]>([]);
  const [mindmapMenuOpen, setMindmapMenuOpen] = useState(false);
  const mindmapMenuRef = useRef<HTMLDivElement>(null);

  // Cloud sync state
  const [cloudConnected, setCloudConnected] = useState(false);
  const [cloudLoading, setCloudLoading] = useState(true);
  const [initialMermaid, setInitialMermaid] = useState<string | null>(null);
  const mindCacheRef = useRef<MindCache | null>(null);
  const syncingFromCloud = useRef(false);
  const skipCloudLoadRef = useRef(false); // Skip cloud load after rename
  const cloudConnectedRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    cloudConnectedRef.current = cloudConnected;
  }, [cloudConnected]);

  // Keep activeMindmapRef in sync with activeMindmap state and persist to localStorage
  useEffect(() => {
    activeMindmapRef.current = activeMindmap;
    // Persist to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('lastActiveMindmap', activeMindmap);
    }
  }, [activeMindmap]);

  // Keyboard shortcuts for undo/redo using MindCache
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mc = mindCacheRef.current;
      if (!mc || !cloudConnectedRef.current) return;

      // Cmd+Z or Ctrl+Z for undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (mc.canUndoAll()) {
          mc.undoAll();
          // Get the updated value and apply to mindmap

          const mermaid = mc.get_value(activeMindmap) as string;
          if (mermaid && mindMapRef.current) {
            syncingFromCloud.current = true;
            mindMapRef.current.setMermaid(mermaid);
            setTimeout(() => { syncingFromCloud.current = false; }, 100);
          }
          console.log('☁️ Undo via MindCache');
        }
      }

      // Cmd+Shift+Z or Ctrl+Shift+Z for redo (also Ctrl+Y on Windows)
      if ((e.metaKey || e.ctrlKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        if (mc.canRedoAll()) {
          mc.redoAll();
          // Get the updated value and apply to mindmap

          const mermaid = mc.get_value(activeMindmap) as string;
          if (mermaid && mindMapRef.current) {
            syncingFromCloud.current = true;
            mindMapRef.current.setMermaid(mermaid);
            setTimeout(() => { syncingFromCloud.current = false; }, 100);
          }
          console.log('☁️ Redo via MindCache');
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);

  }, []);

  // Close mindmap menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mindmapMenuRef.current && !mindmapMenuRef.current.contains(event.target as Node)) {
        setMindmapMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  }, []);

  // Sync to cloud on any data change
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDataChange = useCallback((_data: MindElixirData) => {
    // Don't sync if we're currently applying a remote update
    if (syncingFromCloud.current) {
      console.log('☁️ Skipping sync - currently applying remote update');
      return;
    }

    const mc = mindCacheRef.current;
    if (mc && cloudConnectedRef.current && mindMapRef.current) {
      const mermaid = mindMapRef.current.getMermaid();
      // Track what we're sending to detect echo in subscribe
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((mc as any)._setLastSent) {
        (mc as any)._setLastSent(mermaid);
      }

      mc.set_value(activeMindmapRef.current, mermaid);
      console.log('☁️ Synced to cloud');
    }
  }, [activeMindmap]);

  // Open Mermaid file (Import)
  const handleImport = useCallback(() => {
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
            showToast('Mind map imported!', 'success');
          } else {
            showToast('Invalid file', 'error');
          }
        } catch {
          showToast('Failed to parse file', 'error');
        }
      };
      reader.readAsText(file);
    }
    if (mermaidInputRef.current) {
      mermaidInputRef.current.value = '';
    }
  }, [showToast]);

  // Export functions
  const handleExportMermaid = useCallback(() => {
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
      showToast('Mermaid exported!', 'success');
      setExportMenuOpen(false);
    }
  }, [showToast]);

  const handleExportSvg = useCallback(async () => {
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
        showToast('SVG exported!', 'success');
        setExportMenuOpen(false);
      } catch (error) {
        console.error('Export error:', error);
        showToast('Failed to export SVG', 'error');
      }
    }
  }, [showToast]);

  const handleExportPng = useCallback(async () => {
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
        showToast('PNG exported!', 'success');
        setExportMenuOpen(false);
      } catch (error) {
        console.error('Export error:', error);
        showToast('Failed to export PNG', 'error');
      }
    }
  }, [showToast]);

  // Cloud auto-connect and sync
  useEffect(() => {
    const instanceId = process.env.NEXT_PUBLIC_INSTANCE_MINDMAP;
    if (!instanceId) {
      console.log('No NEXT_PUBLIC_INSTANCE_MINDMAP configured, cloud sync disabled');
      setCloudLoading(false);
      return;
    }

    const mc = new MindCache({
      accessLevel: 'admin', // Allow system tag operations
      cloud: {
        instanceId,
        baseUrl: process.env.NEXT_PUBLIC_MINDCACHE_API_URL || 'https://api.mindcache.dev',
        tokenEndpoint: '/api/ws-token'
      }
    });

    mindCacheRef.current = mc;
    let unsubscribe: (() => void) | null = null;
    // Track what we last sent to avoid echo
    let lastSentMermaid: string | null = null;

    // Connect and subscribe
    mc.waitForSync().then(() => {
      setCloudConnected(true);
      console.log('☁️ Connected to MindCache cloud');

      // Refresh function to update list of mindmaps
      const refreshMindmapList = () => {
        const keys = mc.getKeysByTag(TAG_MINDMAP);
        if (keys.length === 0) {
          // No mindmaps found, create default
          console.log('☁️ Creating default mindmap');
          const defaultKey = 'mindmap-mermaid';
          mc.set_value(defaultKey, '', { type: 'document' });
          mc.addTag(defaultKey, TAG_MINDMAP);

          // Set permissions for default
          mc.systemAddTag(defaultKey, TAG_LLM_READ);
          mc.systemAddTag(defaultKey, TAG_LLM_WRITE);

          setMindmapKeys([defaultKey]);
          setActiveMindmap(defaultKey);
        } else {
          setMindmapKeys(keys);
          // Use ref for current value to avoid stale closure
          const currentActive = activeMindmapRef.current;
          // If current active is not in list, switch to first
          if (!keys.includes(currentActive) && keys.length > 0) {
            setActiveMindmap(keys[0]);
          }

          // Ensure ONLY active mindmap has LLMRead/LLMWrite permissions and 'current' tag
          const activeKey = keys.includes(currentActive) ? currentActive : keys[0];
          keys.forEach(key => {
            // Always remove SystemPrompt from all mindmap keys
            mc.systemRemoveTag(key, 'SystemPrompt');

            if (key === activeKey) {
              // Add permissions to active
              mc.systemAddTag(key, TAG_LLM_READ);
              mc.systemAddTag(key, TAG_LLM_WRITE);
            } else {
              // Remove permissions from inactive
              mc.systemRemoveTag(key, TAG_LLM_READ);
              mc.systemRemoveTag(key, TAG_LLM_WRITE);
            }
          });
        }
      };

      // Initial list load
      refreshMindmapList();

      // Ensure the CURRENT active document exists (creates if not present)
      // This is required for document-type keys in MindCache
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(mc as any).get_document(activeMindmap)) {
        console.log('☁️ Initializing document-type key', activeMindmap);
        // Note: we usually do this in refreshMindmapList for new keys, but good fallback
        mc.set_value(activeMindmap, '', { type: 'document' });
        mc.addTag(activeMindmap, TAG_MINDMAP);
      }

      // Load initial data from cloud and store in state
      // Skip if we just renamed (skipCloudLoadRef is set)
      if (skipCloudLoadRef.current) {
        console.log('☁️ Skipping cloud load after rename');
        skipCloudLoadRef.current = false;
      } else {
        const cloudMermaid = mc.get_value(activeMindmap) as string;
        if (cloudMermaid) {
          console.log('☁️ Loading initial mindmap from cloud');
          setInitialMermaid(cloudMermaid);
          lastSentMermaid = cloudMermaid; // Track as "known"
        } else {
          setInitialMermaid(''); // Ensure we clear if empty
        }
      }

      // Now stop loading - MindMap will render with initialMermaid
      setCloudLoading(false);

      // Subscribe to cloud changes for future updates
      // Detect remote updates by comparing with what we last sent
      // Subscribing to the ACTIVE key
      unsubscribe = mc.subscribe(activeMindmap, (value: unknown) => {
        const mermaidContent = value as string;

        // If this is the same as what we just sent, it's an echo - ignore it
        if (mermaidContent === lastSentMermaid) {
          console.log('☁️ Ignoring echo of our own update');
          return;
        }

        // This is a remote update from another client
        if (mindMapRef.current && !syncingFromCloud.current) {
          console.log('☁️ Received REMOTE mermaid update from cloud');
          syncingFromCloud.current = true;
          lastSentMermaid = mermaidContent; // Update tracking to prevent re-echo

          // If null/undefined (maybe deleted?), treat as empty
          mindMapRef.current.setMermaid(mermaidContent || '');
          setTimeout(() => {
            syncingFromCloud.current = false;
          }, 100);
        }
      });

      // Also subscribe to ALL changes to detect if new mindmaps are added/removed by others
      // or if the current one is deleted
      const globalUnsub = mc.subscribeToAll(() => {
        refreshMindmapList();
      });

      // Monkey-patch unsubscribe to call globalUnsub too
      const originalUnsub = unsubscribe;
      unsubscribe = () => {
        if (originalUnsub) originalUnsub();
        if (globalUnsub) globalUnsub();
      };


      // Expose lastSentMermaid setter for handleDataChange
      (mc as any)._setLastSent = (val: string) => { lastSentMermaid = val; };

      // Expose refresh for UI components to trigger
      (mc as any)._refreshMindmaps = refreshMindmapList;

    }).catch((error) => {
      console.error('☁️ Cloud connection failed:', error);
      setCloudLoading(false);
    });

    return () => {
      if (unsubscribe) unsubscribe();
      mc.disconnect();
      setCloudConnected(false);
    };
  }, [activeMindmap]); // Re-run effect when activeMindmap changes

  const handleCreateMindmap = useCallback(() => {
    const mc = mindCacheRef.current;
    if (!mc) return;

    const name = prompt('Enter name for new mindmap:');
    if (!name) return;

    const key = `mindmap-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    if (mc.has(key)) {
      alert('Mindmap with this name already exists!');
      return;
    }

    // Deactivate current
    if (activeMindmap) {
      mc.systemRemoveTag(activeMindmap, TAG_LLM_READ);
      mc.systemRemoveTag(activeMindmap, TAG_LLM_WRITE);
    }

    // Create new
    mc.set_value(key, '', { type: 'document' });
    mc.addTag(key, TAG_MINDMAP);

    // Activate new
    mc.systemAddTag(key, TAG_LLM_READ);
    mc.systemAddTag(key, TAG_LLM_WRITE);

    setActiveMindmap(key);
    setInitialMermaid(''); // New one is empty
    setMindmapMenuOpen(false);

    // Refresh list explicitly
    if ((mc as any)._refreshMindmaps) (mc as any)._refreshMindmaps();
  }, [activeMindmap]);

  const handleSwitchMindmap = useCallback((key: string) => {
    if (key === activeMindmap) return;

    const mc = mindCacheRef.current;
    if (!mc) return;

    // Deactivate current
    mc.systemRemoveTag(activeMindmap, TAG_LLM_READ);
    mc.systemRemoveTag(activeMindmap, TAG_LLM_WRITE);

    // Activate new
    mc.systemAddTag(key, TAG_LLM_READ);
    mc.systemAddTag(key, TAG_LLM_WRITE);

    setActiveMindmap(key);
    setMindmapMenuOpen(false);
  }, [activeMindmap]);

  const handleRemoveMindmap = useCallback((keyToDelete: string) => {
    const mc = mindCacheRef.current;
    if (!mc) return;

    if (mindmapKeys.length <= 1) {
      alert('Cannot delete the last mindmap!');
      return;
    }

    if (!confirm(`Are you sure you want to delete "${keyToDelete}"?`)) return;

    // Delete the key
    mc.delete_key(keyToDelete);

    // If we deleted the active one, switch to another
    if (keyToDelete === activeMindmap) {
      const remaining = mindmapKeys.filter(k => k !== keyToDelete);
      if (remaining.length > 0) {
        const next = remaining[0];
        mc.systemAddTag(next, TAG_LLM_READ);
        mc.systemAddTag(next, TAG_LLM_WRITE);
        setActiveMindmap(next);
      }
    }

    setMindmapMenuOpen(false);
    // Refresh list explicitly
    if ((mc as any)._refreshMindmaps) (mc as any)._refreshMindmaps();
  }, [activeMindmap, mindmapKeys]);

  const handleRenameMindmap = useCallback(() => {
    const mc = mindCacheRef.current;
    if (!mc) return;
    const currentKey = activeMindmap;
    const currentDisplayName = currentKey.replace(/^mindmap-/, '');
    const newName = prompt('Enter new name for mindmap:', currentDisplayName);
    if (!newName || newName === currentDisplayName) return;
    // Strip any existing mindmap- prefix user might have typed, then add it back
    const cleanName = newName.replace(/^mindmap-/i, '').toLowerCase().replace(/[^a-z0-9]/g, '-');
    const newKey = 'mindmap-' + cleanName;
    if (mc.has(newKey)) { alert('A mindmap with this name already exists!'); return; }

    // Copy content to new key
    const content = mc.get_value(currentKey);
    mc.set_value(newKey, content || '', { type: 'document' });
    mc.addTag(newKey, TAG_MINDMAP);
    mc.systemAddTag(newKey, TAG_LLM_READ);
    mc.systemAddTag(newKey, TAG_LLM_WRITE);

    // Remove old key (after new one is ready)
    mc.systemRemoveTag(currentKey, TAG_LLM_READ);
    mc.systemRemoveTag(currentKey, TAG_LLM_WRITE);
    mc.delete_key(currentKey);

    // Update ref immediately to prevent stale closure issues
    activeMindmapRef.current = newKey;

    // Set flag to skip cloud load when useEffect runs
    skipCloudLoadRef.current = true;

    // Update initialMermaid to keep current content displayed
    setInitialMermaid(content as string || '');
    setActiveMindmap(newKey);
    setMindmapMenuOpen(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((mc as any)._refreshMindmaps) (mc as any)._refreshMindmaps();
  }, [activeMindmap]);

  return (
    <main className="mindmap-container">
      {/* Header */}
      <header className="header">
        <div className="header-brand">
          <Icons.Brain />
          <span>MindMap</span>
          {cloudConnected && (
            <span className="sync-indicator" title="Synced to cloud">
              <span className="sync-dot"></span>
            </span>
          )}
        </div>

        {/* Mindmap Switcher */}
        <div className="flex-1 flex justify-center">
          {cloudConnected && (
            <div className="relative" ref={mindmapMenuRef}>
              <div className="flex items-center gap-1">
                <button
                  className="px-3 py-1.5 rounded-md hover:bg-white/10 flex items-center gap-2 transition-colors font-medium"
                  onClick={() => setMindmapMenuOpen(!mindmapMenuOpen)}
                >
                  <span>{activeMindmap.replace(/^mindmap-/, '')}</span>
                  <Icons.ChevronDown />
                </button>
                <button
                  className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                  onClick={handleRenameMindmap}
                  title="Rename mindmap"
                >
                  <Icons.Pen />
                </button>
              </div>
              {mindmapMenuOpen && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-80 bg-[#1e1e28] border border-white/10 rounded-xl shadow-xl overflow-hidden py-1 z-50 flex flex-col">
                  <div className="px-3 py-2 text-xs font-semibold text-white/40 uppercase tracking-wider">
                    Switch Mindmap
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {[...mindmapKeys].sort((a, b) => a === activeMindmap ? -1 : b === activeMindmap ? 1 : 0).map(key => (
                      <div
                        key={key}
                        className={`w-full px-4 py-2 text-sm flex items-center justify-between hover:bg-white/5 transition-colors ${key === activeMindmap ? 'text-accent bg-accent/5' : 'text-white/80'}`}
                      >
                        <button
                          onClick={() => handleSwitchMindmap(key)}
                          className="flex-1 text-left truncate"
                        >
                          {key.replace(/^mindmap-/, '')}
                        </button>
                        {key === activeMindmap && <span className="text-accent mr-2">✓</span>}
                        {mindmapKeys.length > 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRemoveMindmap(key); }}
                            className="text-white/40 hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-colors"
                            title="Delete this mindmap"
                          >
                            <Icons.Trash />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="h-px bg-white/10 my-1"></div>

                  <button
                    onClick={handleCreateMindmap}
                    className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 text-white/80 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    <Icons.Plus />
                    <span>New Mindmap</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="header-actions">
          <button className="btn-header" onClick={handleImport} title="Import from Mermaid file">
            <Icons.Upload />
            <span>Import</span>
          </button>

          {/* Export dropdown */}
          <div className="dropdown" ref={exportMenuRef}>
            <button
              className="btn-header btn-accent"
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
              title="Export mind map"
            >
              <Icons.Download />
              <span>Export</span>
              <Icons.ChevronDown />
            </button>
            {exportMenuOpen && (
              <div className="dropdown-menu">
                <button onClick={handleExportMermaid} className="dropdown-item">
                  <span className="dropdown-icon">📝</span>
                  Mermaid (.mmd)
                </button>
                <button onClick={handleExportSvg} className="dropdown-item">
                  <span className="dropdown-icon">🎨</span>
                  SVG Image
                </button>
                <button onClick={handleExportPng} className="dropdown-item">
                  <span className="dropdown-icon">🖼️</span>
                  PNG Image
                </button>
              </div>
            )}
          </div>
        </div>
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
        {cloudLoading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading from cloud...</p>
          </div>
        ) : (
          <MindMap
            key={activeMindmap}
            ref={mindMapRef}
            initialMermaid={initialMermaid}
            onDataChange={handleDataChange}
          />
        )}
      </div>

      {/* Toast notifications */}
      {
        toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )
      }
    </main >
  );
}

