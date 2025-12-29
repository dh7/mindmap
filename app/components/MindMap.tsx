'use client';

import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import MindElixir, { type MindElixirData, type MindElixirInstance, type Options } from 'mind-elixir';
import { snapdom } from '@zumer/snapdom';

export interface MindMapRef {
    getData: () => MindElixirData;
    getDataString: () => string;
    refresh: (data: MindElixirData) => void;
    getInstance: () => MindElixirInstance | null;
    getContainer: () => HTMLDivElement | null;
    toCenter: () => void;
    exportPng: () => Promise<string>;
    exportSvg: () => Promise<string>;
    getMermaid: () => string;
    setMermaid: (mermaid: string) => void;
    collapseAll: () => void;
}

// Node type for internal processing
interface NodeData {
    id: string;
    topic: string;
    direction?: 0 | 1;
    expanded?: boolean;
    children?: NodeData[];
}

// Ensure all nodes have the required properties for MindElixir
// MindElixir's addChild/expandNode requires nodeObj.data.expanded to exist
function normalizeNodeData(node: NodeData): NodeData {
    const normalized: NodeData = {
        id: node.id,
        topic: node.topic,
        expanded: node.expanded ?? true,
        children: (node.children || []).map(normalizeNodeData),
    };
    if (node.direction !== undefined) {
        normalized.direction = node.direction;
    }
    return normalized;
}

// Normalize the full MindElixirData structure
function normalizeMindElixirData(data: MindElixirData): MindElixirData {
    if (!data.nodeData) return data;
    return {
        ...data,
        nodeData: normalizeNodeData(data.nodeData as NodeData)
    };
}

// Convert MindElixir data to Mermaid format
// Uses simple quoted text format with [R]/[L] prefixes for direction (best practice)
function dataToMermaid(data: MindElixirData): string {
    const lines: string[] = ['mindmap'];

    function processNode(node: NodeData, depth: number, isRoot: boolean = false): void {
        const indent = '  '.repeat(depth);
        // Escape double quotes inside the topic using #quot;
        const escapedTopic = node.topic.replace(/"/g, '#quot;');

        if (isRoot) {
            // Root uses (("..."))
            lines.push(`${indent}root(("${escapedTopic}"))`);
        } else {
            // For first-level children (depth === 2), add direction prefix [R] or [L]
            let prefix = '';
            if (depth === 2) {
                if (node.direction === 1) prefix = '[R] ';
                else if (node.direction === 0) prefix = '[L] ';
            }
            // Simple quoted text format - most compatible
            lines.push(`${indent}"${prefix}${escapedTopic}"`);
        }

        if (node.children && node.children.length > 0) {
            for (const child of node.children) {
                processNode(child, depth + 1);
            }
        }
    }

    if (data.nodeData) {
        processNode(data.nodeData as NodeData, 1, true);
    }

    return lines.join('\n');
}

// Convert Mermaid format to MindElixir data
// Handles [R]/[L] direction prefixes inside quoted text
function mermaidToData(mermaid: string): MindElixirData {
    const lines = mermaid.split('\n').filter(line => line.trim());

    // Skip 'mindmap' line if present
    let startIdx = 0;
    if (lines[0]?.trim().toLowerCase() === 'mindmap') {
        startIdx = 1;
    }

    if (startIdx >= lines.length) return { nodeData: { id: 'root', topic: 'Root', expanded: true, children: [] } };

    // Helper to extract content, direction, and unescape
    function extractContent(text: string): { topic: string, direction?: 0 | 1 } {
        let trimmed = text.trim();

        // Check for bare quoted string first: "..."
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
            let content = trimmed.substring(1, trimmed.length - 1);

            // Check for [R] or [L] prefix inside the quoted text
            let direction: 0 | 1 | undefined = undefined;
            if (content.startsWith('[R] ')) {
                direction = 1;
                content = content.substring(4);
            } else if (content.startsWith('[L] ')) {
                direction = 0;
                content = content.substring(4);
            }

            // Unescape
            content = content.replace(/#quot;/g, '"')
                .replace(/&quot;/g, '"')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&');

            return { topic: content, direction };
        }

        // Handle delimited formats: root((...)), [...], etc.
        const delimiters = [
            { open: '((', close: '))' },
            { open: '[[', close: ']]' },
            { open: '{{', close: '}}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '{', close: '}' }
        ];

        let content = trimmed;

        for (const { open, close } of delimiters) {
            const openIdx = trimmed.indexOf(open);
            if (openIdx !== -1 && trimmed.endsWith(close)) {
                content = trimmed.substring(openIdx + open.length, trimmed.length - close.length);
                break;
            }
        }

        // Remove surrounding quotes if present
        if (content.length >= 2 && content.startsWith('"') && content.endsWith('"')) {
            content = content.substring(1, content.length - 1);
        }

        // Check for [R]/[L] prefix
        let direction: 0 | 1 | undefined = undefined;
        if (content.startsWith('[R] ')) {
            direction = 1;
            content = content.substring(4);
        } else if (content.startsWith('[L] ')) {
            direction = 0;
            content = content.substring(4);
        }

        // Unescape entities
        content = content.replace(/#quot;/g, '"')
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');

        return { topic: content, direction };
    }

    function getIndent(line: string): number {
        const match = line.match(/^(\s*)/);
        return match ? match[1].length : 0;
    }

    // Stack-based parsing
    const rootLine = lines[startIdx];
    const { topic: rootTopic } = extractContent(rootLine);
    const rootNode: NodeData = {
        id: 'root',
        topic: rootTopic,
        expanded: true,
        children: []
    };

    const stack: { node: NodeData, indent: number }[] = [];
    stack.push({ node: rootNode, indent: getIndent(rootLine) });

    // Process rest
    for (let i = startIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        const indent = getIndent(line);
        const { topic, direction } = extractContent(line);

        const node: NodeData = {
            id: Math.random().toString(36).substr(2, 9),
            topic: topic,
            expanded: true,
            children: []
        };

        // Set direction if extracted from [R]/[L] prefix
        if (direction !== undefined) {
            node.direction = direction;
        }

        // Find parent in stack
        while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
            stack.pop();
        }

        if (stack.length === 0) {
            stack.push({ node: rootNode, indent: -1 });
        }

        const parent = stack[stack.length - 1].node;
        if (!parent.children) parent.children = [];
        parent.children.push(node);

        stack.push({ node, indent });
    }

    return {
        nodeData: normalizeNodeData(rootNode)
    };
}

interface MindMapProps {
    initialData?: MindElixirData;
    initialMermaid?: string | null;
    onDataChange?: (data: MindElixirData) => void;
}

const defaultData: MindElixirData = {
    nodeData: {
        id: 'root',
        topic: 'My Mind Map',
        expanded: true,
        children: [
            {
                id: 'branch1',
                topic: 'Main Branch 1',
                direction: 0,
                expanded: true,
                children: [
                    { id: 'sub1', topic: 'Sub topic 1', expanded: true, children: [] },
                    { id: 'sub2', topic: 'Sub topic 2', expanded: true, children: [] },
                ],
            },
            {
                id: 'branch2',
                topic: 'Main Branch 2',
                direction: 1,
                expanded: true,
                children: [
                    { id: 'sub3', topic: 'Sub topic 3', expanded: true, children: [] },
                    { id: 'sub4', topic: 'Sub topic 4', expanded: true, children: [] },
                ],
            },
            {
                id: 'branch3',
                topic: 'Main Branch 3',
                direction: 0,
                expanded: true,
                children: [
                    { id: 'sub5', topic: 'Click to edit', expanded: true, children: [] },
                ],
            },
        ],
    },
};

// Global clipboard to persist copy/cut data across mindmap switches
// MindElixir stores waitCopy on the instance, which is lost on remount
// This preserves the data as serialized node objects for cross-mindmap copy/paste
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let globalClipboard: { nodes: any[] | null; isCut: boolean } = { nodes: null, isCut: false };

const MindMap = forwardRef<MindMapRef, MindMapProps>(({ initialData, initialMermaid, onDataChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mindRef = useRef<MindElixirInstance | null>(null);
    const [isReady, setIsReady] = useState(false);

    useImperativeHandle(ref, () => ({
        getData: () => {
            if (mindRef.current) {
                return mindRef.current.getData();
            }
            return initialData || defaultData;
        },
        getDataString: () => {
            if (mindRef.current) {
                return mindRef.current.getDataString();
            }
            return JSON.stringify(initialData || defaultData, null, 2);
        },
        refresh: (data: MindElixirData) => {
            if (mindRef.current) {
                mindRef.current.refresh(normalizeMindElixirData(data));
            }
        },
        getInstance: () => mindRef.current,
        getContainer: () => containerRef.current,
        toCenter: () => {
            if (mindRef.current) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (mindRef.current as any).scale(1);
                mindRef.current.toCenter();
            }
        },
        exportPng: async () => {
            if (mindRef.current && mindRef.current.nodes) {
                const result = await snapdom(mindRef.current.nodes);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const img = await (result as any).toPng();
                return img.src as string;
            }
            throw new Error('Mind map not ready');
        },
        exportSvg: async () => {
            if (mindRef.current && mindRef.current.nodes) {
                const result = await snapdom(mindRef.current.nodes);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const svg = await (result as any).toSvg();
                // toSvg returns an SVG element, get its outerHTML and convert to data URL
                const svgString = new XMLSerializer().serializeToString(svg);
                return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
            }
            throw new Error('Mind map not ready');
        },
        getMermaid: () => {
            const data = mindRef.current?.getData() || initialData || defaultData;
            return dataToMermaid(data);
        },
        setMermaid: (mermaid: string) => {
            if (!mindRef.current) return;

            // Save current expanded states
            const currentData = mindRef.current.getData();
            const expandedStates: Record<string, boolean> = {};
            const saveExpandedStates = (node: any) => {
                if (node.id && node.expanded !== undefined) {
                    expandedStates[node.id] = node.expanded;
                }
                // Also save by topic as fallback (IDs might differ)
                if (node.topic) {
                    expandedStates[`topic:${node.topic}`] = node.expanded ?? true;
                }
                if (node.children) {
                    node.children.forEach(saveExpandedStates);
                }
            };
            if (currentData.nodeData) {
                saveExpandedStates(currentData.nodeData);
            }

            // Convert new mermaid to data
            const newData = mermaidToData(mermaid);

            // Restore expanded states to new data
            const restoreExpandedStates = (node: any) => {
                if (node.id && expandedStates[node.id] !== undefined) {
                    node.expanded = expandedStates[node.id];
                } else if (node.topic && expandedStates[`topic:${node.topic}`] !== undefined) {
                    node.expanded = expandedStates[`topic:${node.topic}`];
                }
                if (node.children) {
                    node.children.forEach(restoreExpandedStates);
                }
            };
            if (newData.nodeData) {
                restoreExpandedStates(newData.nodeData);
            }

            // Normalize to ensure all nodes have required properties (expanded, children)
            mindRef.current.refresh(normalizeMindElixirData(newData));
        },
        collapseAll: () => {
            if (mindRef.current) {
                const mind = mindRef.current;
                const data = mind.getData(); // Get current data clone/reference

                // Helper to modify expansion state
                const processNode = (node: any, depth: number) => {
                    // Only Level 0 (Root) is expanded.
                    // This shows Level 1 nodes, but collapses them (hiding Level 2+)
                    if (depth === 0) {
                        node.expanded = true;
                    }
                    // Level 1+: Collapsed
                    else {
                        node.expanded = false;
                    }

                    if (node.children && node.children.length > 0) {
                        node.children.forEach((child: any) => processNode(child, depth + 1));
                    }
                };

                if (data.nodeData) {
                    processNode(data.nodeData, 0);
                    // Normalize to ensure all nodes have required properties
                    mind.refresh(normalizeMindElixirData(data));

                    // Reset zoom and center
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (mind as any).scale(1);
                    mind.toCenter();
                }
            }
        },
    }));

    // Track last mouse position for determining drop direction during drag
    const lastMouseXRef = useRef<number>(0);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            lastMouseXRef.current = e.clientX;
        };
        // Also track during drag operations - dragover fires continuously during drag
        const handleDragOver = (e: DragEvent) => {
            lastMouseXRef.current = e.clientX;
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('dragover', handleDragOver);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('dragover', handleDragOver);
        };
    }, []);

    const handleOperation = useCallback(() => {
        if (mindRef.current && onDataChange) {
            onDataChange(mindRef.current.getData());
        }
    }, [onDataChange]);

    // Track the last initialMermaid we processed to detect changes
    const lastInitialMermaidRef = useRef<string | null | undefined>(undefined);

    // Handle initialMermaid changes (e.g., when switching mindmaps)
    useEffect(() => {
        // Skip if mindmap not ready or if this is the first render
        if (!mindRef.current || !isReady) return;

        // Skip if initialMermaid hasn't changed
        if (initialMermaid === lastInitialMermaidRef.current) return;

        // Update tracking
        lastInitialMermaidRef.current = initialMermaid;

        // Apply the new mermaid content
        const mermaidContent = initialMermaid || '';
        if (mermaidContent) {
            const newData = mermaidToData(mermaidContent);

            // Collapse all nodes first
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const processNode = (node: any, depth: number) => {
                if (!node) return;
                node.expanded = depth === 0;
                if (node.children) {
                    node.children.forEach((child: any) => processNode(child, depth + 1));
                }
            };
            if (newData.nodeData) {
                processNode(newData.nodeData, 0);
            }

            mindRef.current.refresh(normalizeMindElixirData(newData));
        } else {
            // Empty mermaid - reset to default
            mindRef.current.refresh(normalizeMindElixirData(defaultData));
        }

        // Center immediately after refresh
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mindRef.current as any).scale(1);
        mindRef.current.toCenter();
    }, [initialMermaid, isReady]);

    useEffect(() => {
        if (!containerRef.current || mindRef.current) return;

        // Mind Elixir types are incomplete - using type assertion for runtime-valid options
        const options = {
            el: containerRef.current,
            direction: MindElixir.SIDE,
            draggable: true,
            contextMenu: true,
            toolBar: false,
            keypress: true,
            locale: 'en',
            overflowHidden: false,
            mouseSelectionButton: 0,
            mainLinkStyle: 2,
            nodeMenu: true,
            // Disable MindElixir's built-in undo - it conflicts with cloud sync
            // (initial cloud data load gets added to undo stack, causing issues)
            allowUndo: false,
            contextMenuOption: {
                focus: true,
                link: true,
                extend: [
                    {
                        name: 'Toggle expand',
                        onclick: (e: MindElixirInstance) => {
                            const currentNode = e.currentNode;
                            if (currentNode) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const node = currentNode as any;
                                if (node.expanded === false) {
                                    e.expandNode(currentNode);
                                } else {
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    (e as any).collapseNode(currentNode);
                                }
                            }
                        },
                    },
                ],
            },
            // Before hooks to detect moves to root and set direction based on drop position
            before: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                moveNodeIn: async (from: any[], to: any) => {
                    const toNodeObj = to?.nodeObj;
                    // If dropping into root (no parent), set direction based on mouse position
                    if (toNodeObj && !toNodeObj.parent) {
                        const rootEl = containerRef.current?.querySelector('me-root');
                        if (rootEl && from.length > 0) {
                            const rootRect = rootEl.getBoundingClientRect();
                            const rootCenterX = rootRect.left + rootRect.width / 2;
                            const mouseX = lastMouseXRef.current;
                            const direction = mouseX < rootCenterX ? 0 : 1;

                            // Set direction DIRECTLY on the nodeObj before the move
                            for (const f of from) {
                                if (f.nodeObj) {
                                    f.nodeObj.direction = direction;
                                }
                            }
                        }
                    }
                    return true;
                },
            },
        } as Options;

        const mind = new MindElixir(options);
        mindRef.current = mind;

        // Initialize with data - prefer initialMermaid (from cloud) over initialData
        let data: MindElixirData;
        if (initialMermaid) {
            data = mermaidToData(initialMermaid);
        } else if (initialData) {
            data = initialData;
        } else {
            data = defaultData;
        }
        // Normalize all data before init to ensure expanded/children are set
        mind.init(normalizeMindElixirData(data));

        // If initialized from mermaid (cloud), collapse and center
        if (initialMermaid) {
            setTimeout(() => {
                // Collapse all nodes except root
                const currentData = mind.getData();
                const processNode = (node: any, depth: number) => {
                    if (!node) return;
                    node.expanded = depth === 0;
                    if (node.children) {
                        node.children.forEach((child: any) => processNode(child, depth + 1));
                    }
                };
                if (currentData.nodeData) {
                    processNode(currentData.nodeData, 0);
                    mind.refresh(normalizeMindElixirData(currentData));
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (mind as any).scale(1);
                mind.toCenter();
            }, 100);
        }

        // Listen for operations
        mind.bus.addListener('operation', handleOperation);

        // Override keyboard handler to use global clipboard for cross-mindmap copy/paste
        // MindElixir sets container.onkeydown, so we need to wrap it
        const originalKeyHandler = mind.container.onkeydown;
        mind.container.onkeydown = (e: KeyboardEvent) => {
            // Handle copy/cut/paste with global clipboard
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
                if (e.key === 'c' && mind.currentNodes && mind.currentNodes.length > 0) {
                    // Copy: deep clone the node data to prevent reference issues
                    // Use replacer to exclude 'parent' which creates circular reference
                    e.preventDefault();
                    globalClipboard.nodes = mind.currentNodes.map(n =>
                        JSON.parse(JSON.stringify(n.nodeObj, (key, value) =>
                            key === 'parent' ? undefined : value
                        ))
                    );
                    globalClipboard.isCut = false;
                    // Also set on instance for immediate same-mindmap paste
                    mind.waitCopy = mind.currentNodes;
                    return;
                }
                if (e.key === 'x' && mind.currentNodes && mind.currentNodes.length > 0) {
                    // Cut: store data, then remove
                    // Use replacer to exclude 'parent' which creates circular reference
                    e.preventDefault();
                    globalClipboard.nodes = mind.currentNodes.map(n =>
                        JSON.parse(JSON.stringify(n.nodeObj, (key, value) =>
                            key === 'parent' ? undefined : value
                        ))
                    );
                    globalClipboard.isCut = true;
                    // Remove the nodes
                    mind.removeNodes(mind.currentNodes);
                    return;
                }
                if (e.key === 'v' && mind.currentNode && globalClipboard.nodes) {
                    // Paste from global clipboard
                    e.preventDefault();
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const regenerateIds = (node: any): any => {
                        return {
                            ...node,
                            id: Math.random().toString(36).substr(2, 9),
                            children: node.children?.map(regenerateIds) || []
                        };
                    };
                    for (const nodeData of globalClipboard.nodes) {
                        const newNodeData = regenerateIds(nodeData);
                        // addChild(el, node) - adds node as child of el
                        mind.addChild(mind.currentNode, newNodeData);
                    }
                    return;
                }
            }
            // Fall through to original handler for everything else
            if (originalKeyHandler) {
                originalKeyHandler.call(mind.container, e);
            }
        };

        // Hook into event bus to capture operation events for direction fix
        const originalFire = mind.bus.fire.bind(mind.bus);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mind.bus as any).fire = (event: string, ...args: unknown[]) => {
            if (event === 'operation') {
                handleOperation();
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (originalFire as any)(event, ...args);
        };

        setIsReady(true);

        return () => {
            if (mindRef.current) {
                mindRef.current.bus.removeListener('operation', handleOperation);
            }
        };
    }, [initialData, handleOperation]);

    const handleCenter = () => {
        if (mindRef.current) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (mindRef.current as any).scale(1); // Reset zoom to 100%
            mindRef.current.toCenter();
        }
    };

    const handleCollapse = () => {
        if (mindRef.current) {
            const mind = mindRef.current;
            const data = mind.getData();

            const processNode = (node: any, depth: number) => {
                node.expanded = depth === 0;
                if (node.children && node.children.length > 0) {
                    node.children.forEach((child: any) => processNode(child, depth + 1));
                }
            };

            if (data.nodeData) {
                processNode(data.nodeData, 0);
                mind.refresh(normalizeMindElixirData(data));
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (mind as any).scale(1);
                mind.toCenter();
            }
        }
    };

    const handleZoomIn = () => {
        if (mindRef.current) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mind = mindRef.current as any;
            const currentScale = mind.scaleVal || 1;
            const newScale = Math.min(3, currentScale + 0.2);
            mind.scale(newScale);
        }
    };

    const handleZoomOut = () => {
        if (mindRef.current) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mind = mindRef.current as any;
            const currentScale = mind.scaleVal || 1;
            const newScale = Math.max(0.2, currentScale - 0.2);
            mind.scale(newScale);
        }
    };

    const buttonStyle: React.CSSProperties = {
        width: '40px',
        height: '40px',
        borderRadius: '10px',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        background: 'rgba(30, 30, 40, 0.8)',
        backdropFilter: 'blur(10px)',
        color: 'rgba(255, 255, 255, 0.9)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s ease',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div
                ref={containerRef}
                id="mindmap-wrapper"
                style={{
                    width: '100%',
                    height: '100%',
                    opacity: isReady ? 1 : 0,
                    transition: 'opacity 0.3s ease',
                }}
            />
            {isReady && (
                <div
                    style={{
                        position: 'absolute',
                        top: '12px',
                        left: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                    }}
                >
                    <button
                        onClick={handleCenter}
                        title="Center view"
                        style={buttonStyle}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(50, 50, 60, 0.9)';
                            e.currentTarget.style.transform = 'scale(1.05)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(30, 30, 40, 0.8)';
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <circle cx="12" cy="12" r="3" />
                            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                        </svg>
                    </button>
                    <button
                        onClick={handleCollapse}
                        title="Collapse all"
                        style={buttonStyle}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(50, 50, 60, 0.9)';
                            e.currentTarget.style.transform = 'scale(1.05)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(30, 30, 40, 0.8)';
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <polyline points="4 14 10 14 10 20" />
                            <polyline points="20 10 14 10 14 4" />
                            <line x1="14" y1="10" x2="21" y2="3" />
                            <line x1="3" y1="21" x2="10" y2="14" />
                        </svg>
                    </button>
                    <button
                        onClick={handleZoomIn}
                        title="Zoom in"
                        style={buttonStyle}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(50, 50, 60, 0.9)';
                            e.currentTarget.style.transform = 'scale(1.05)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(30, 30, 40, 0.8)';
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                    </button>
                    <button
                        onClick={handleZoomOut}
                        title="Zoom out"
                        style={buttonStyle}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(50, 50, 60, 0.9)';
                            e.currentTarget.style.transform = 'scale(1.05)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(30, 30, 40, 0.8)';
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
});

MindMap.displayName = 'MindMap';

export default MindMap;
