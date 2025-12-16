'use client';

import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import MindElixir, { type MindElixirData, type MindElixirInstance, type Options } from 'mind-elixir';

export interface MindMapRef {
    getData: () => MindElixirData;
    getDataString: () => string;
    refresh: (data: MindElixirData) => void;
    getInstance: () => MindElixirInstance | null;
    getContainer: () => HTMLDivElement | null;
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
    }));

    const handleOperation = useCallback(() => {
        if (mindRef.current && onDataChange) {
            onDataChange(mindRef.current.getData());
        }
    }, [onDataChange]);

    useEffect(() => {
        if (!containerRef.current || mindRef.current) return;

        const options: Options = {
            el: containerRef.current,
            direction: MindElixir.SIDE,
            draggable: true,
            contextMenu: true,
            toolBar: true,
            nodeMenu: true,
            keypress: true,
            locale: 'en',
            overflowHidden: false,
            mainLinkStyle: 2,
            mouseSelectionButton: 0,
            contextMenuOption: {
                focus: true,
                link: true,
                extend: [
                    {
                        name: 'Toggle expand',
                        onclick: (e: MindElixirInstance) => {
                            const currentNode = e.currentNode;
                            if (currentNode) {
                                if (currentNode.expanded === false) {
                                    e.expandNode(currentNode);
                                } else {
                                    e.collapseNode(currentNode);
                                }
                            }
                        },
                    },
                ],
            },
        };

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

    return (
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
    );
});

MindMap.displayName = 'MindMap';

export default MindMap;
