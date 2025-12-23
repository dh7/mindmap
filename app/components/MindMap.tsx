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
function dataToMermaid(data: MindElixirData): string {
    const lines: string[] = ['mindmap'];

    function processNode(node: NodeData, depth: number, isRoot: boolean = false): void {
        const indent = '  '.repeat(depth);
        const topic = node.topic.replace(/[()\[\]{}]/g, '');

        if (isRoot) {
            lines.push(`${indent}root((${topic}))`);
        } else {
            let line = `${indent}${topic}`;
            // Add direction class for first level nodes
            if (depth === 2) { // depth 1 is root call (processNode called with depth 1), inside processNode depth is passed.
                // Wait, logic check:
                // processNode(root, 1) -> Root.
                //   processNode(child, 2) -> Level 1 Node.
                if (node.direction === 0) line += ':::left';
                if (node.direction === 1) line += ':::right';
            }
            lines.push(line);
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
function mermaidToData(mermaid: string): MindElixirData {
    const lines = mermaid.split('\n').filter(line => line.trim());

    // Skip 'mindmap' line if present
    let startIdx = 0;
    if (lines[0]?.trim().toLowerCase() === 'mindmap') {
        startIdx = 1;
    }

    // Parse the root line
    const rootLine = lines[startIdx];
    const rootMatch = rootLine?.match(/root\(\((.+?)\)\)/) || rootLine?.match(/root\[(.+?)\]/) || rootLine?.match(/root\((.+?)\)/);
    const rootTopic = rootMatch ? rootMatch[1] : (rootLine?.trim() || 'Root');

    // Calculate indentation for each line
    function getIndent(line: string): number {
        const match = line.match(/^(\s*)/);
        return match ? match[1].length : 0;
    }

    // Build tree from remaining lines
    function buildTree(startLine: number, parentIndent: number): NodeData[] {
        const children: NodeData[] = [];
        let i = startLine;

        while (i < lines.length) {
            const line = lines[i];
            const indent = getIndent(line);
            const text = line.trim();

            // Skip root line
            if (text.includes('root((') || text.includes('root[') || text.includes('root(')) {
                i++;
                continue;
            }

            // If indentation is less or equal to parent, we're done with this level
            if (indent <= parentIndent && i > startLine) {
                break;
            }

            // If this is a direct child (one level deeper)
            if (indent > parentIndent) {
                // Find the end of this node's children
                let endIdx = i + 1;
                while (endIdx < lines.length && getIndent(lines[endIdx]) > indent) {
                    endIdx++;
                }

                let topic = text;
                let direction: 0 | 1 | undefined;

                if (topic.endsWith(':::left')) {
                    direction = 0;
                    topic = topic.replace(':::left', '');
                } else if (topic.endsWith(':::right')) {
                    direction = 1;
                    topic = topic.replace(':::right', '');
                }

                // Always include children array and expanded property - MindElixir requires these
                // when adding child nodes (it sets nodeObj.data.expanded = true)
                const childNodes = buildTree(i + 1, indent);
                const node: NodeData = {
                    id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    topic: topic,
                    direction: direction,
                    expanded: true,
                    children: childNodes.length > 0 ? childNodes : []
                };

                children.push(node);
                i = endIdx;
            } else {
                i++;
            }
        }

        return children;
    }

    const rootIndent = getIndent(lines[startIdx] || '');
    const rootChildren = buildTree(startIdx + 1, rootIndent);

    // Assign directions to main branches
    rootChildren.forEach((child) => {
        // If direction was parsed, keep it. Otherwise default to 1 (Right) to preserve order
        if (child.direction === undefined) {
            child.direction = 1;
        }
    });

    // Normalize all nodes to ensure they have required properties
    const rootNode: NodeData = {
        id: 'root',
        topic: rootTopic,
        expanded: true,
        children: rootChildren
    };

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

    const handleOperation = useCallback(() => {
        console.log('MindMap: operation event fired');
        if (mindRef.current && onDataChange) {
            onDataChange(mindRef.current.getData());
        }
    }, [onDataChange]);

    useEffect(() => {
        console.log('MindMap useEffect running, container:', !!containerRef.current, 'mindRef:', !!mindRef.current);
        if (!containerRef.current || mindRef.current) return;
        console.log('MindMap: Creating MindElixir instance');

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

        // Debug: log all events
        const originalFire = mind.bus.fire.bind(mind.bus);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mind.bus as any).fire = (event: string, ...args: unknown[]) => {
            console.log('MindElixir event:', event);
            if (event === 'operation') {
                console.log('Operation event - calling handleOperation');
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
                </div>
            )}
        </div>
    );
});

MindMap.displayName = 'MindMap';

export default MindMap;
