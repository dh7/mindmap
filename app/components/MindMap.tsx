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
}

interface MindMapProps {
    initialData?: MindElixirData;
    onDataChange?: (data: MindElixirData) => void;
}

const defaultData: MindElixirData = {
    nodeData: {
        id: 'root',
        topic: 'My Mind Map',
        children: [
            {
                id: 'branch1',
                topic: 'Main Branch 1',
                direction: 0,
                children: [
                    { id: 'sub1', topic: 'Sub topic 1' },
                    { id: 'sub2', topic: 'Sub topic 2' },
                ],
            },
            {
                id: 'branch2',
                topic: 'Main Branch 2',
                direction: 1,
                children: [
                    { id: 'sub3', topic: 'Sub topic 3' },
                    { id: 'sub4', topic: 'Sub topic 4' },
                ],
            },
            {
                id: 'branch3',
                topic: 'Main Branch 3',
                direction: 0,
                children: [
                    { id: 'sub5', topic: 'Click to edit' },
                ],
            },
        ],
    },
};

const MindMap = forwardRef<MindMapRef, MindMapProps>(({ initialData, onDataChange }, ref) => {
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
                mindRef.current.refresh(data);
            }
        },
        getInstance: () => mindRef.current,
        getContainer: () => containerRef.current,
        toCenter: () => {
            if (mindRef.current) {
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
    }));

    const handleOperation = useCallback(() => {
        if (mindRef.current && onDataChange) {
            onDataChange(mindRef.current.getData());
        }
    }, [onDataChange]);

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

        // Initialize with data
        const data = initialData || defaultData;
        mind.init(data);

        // Listen for operations
        mind.bus.addListener('operation', handleOperation);

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
                <button
                    onClick={handleCenter}
                    title="Center view"
                    style={{
                        position: 'absolute',
                        top: '12px',
                        left: '12px',
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
                    }}
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
            )}
        </div>
    );
});

MindMap.displayName = 'MindMap';

export default MindMap;
