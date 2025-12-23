'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { MindMapRef } from '../components/MindMap';

const MindMap = dynamic(() => import('../components/MindMap'), {
    ssr: false,
    loading: () => <p>Loading MindMap for Testing...</p>,
});

// Helper Types
type TestResult = 'PASS' | 'FAIL' | 'RUNNING' | 'PENDING';

interface LogEntry {
    message: string;
    type: 'info' | 'success' | 'error';
    timestamp: string;
}

export default function TestPage() {
    const mindMapRef = useRef<MindMapRef>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [testStatus, setTestStatus] = useState<TestResult>('PENDING');
    const [debugInfo, setDebugInfo] = useState<string>('');

    const addLog = (message: string, type: LogEntry['type'] = 'info') => {
        setLogs(prev => [{
            message,
            type,
            timestamp: new Date().toLocaleTimeString()
        }, ...prev]);
    };

    // --- Test Helpers ---

    const generateRandomTree = (depth: number = 2, maxChildren: number = 3): string => {
        const lines = ['mindmap', '  root((Root))'];

        function addChildren(currentDepth: number, currentIndent: string) {
            if (currentDepth > depth) return;

            const numChildren = Math.floor(Math.random() * maxChildren) + 1;
            for (let i = 0; i < numChildren; i++) {
                const id = Math.random().toString(36).substring(7);
                lines.push(`${currentIndent}  node_${id}`);
                addChildren(currentDepth + 1, currentIndent + '  ');
            }
        }

        addChildren(1, '  ');
        return lines.join('\n');
    };

    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Helper to extract all topics from MindElixirData
    const getAllTopics = (data: any): string[] => {
        const topics: string[] = [];
        const traverse = (node: any) => {
            if (node.topic) topics.push(node.topic);
            if (node.children) node.children.forEach(traverse);
        };
        if (data.nodeData) traverse(data.nodeData);
        return topics;
    };

    // --- Tests ---

    const runRandomRoundTripTest = async () => {
        addLog('--- Starting Random Mermaid Round-trip Test ---', 'info');
        try {
            if (!mindMapRef.current) throw new Error('MindMap ref not available');

            const inputMermaid = generateRandomTree(2, 3);
            addLog(`Generated random mermaid with ${inputMermaid.split('\n').length} lines`, 'info');

            mindMapRef.current.setMermaid(inputMermaid);

            // Wait for rendering/state update
            await wait(500);

            const outputMermaid = mindMapRef.current.getMermaid();

            // Basic validation: Line count should match (ignoring empty lines/formatting differences if any)
            const inputNodes = inputMermaid.match(/node_[a-z0-9]+/g) || [];
            const missingNodes = inputNodes.filter(node => !outputMermaid.includes(node));

            if (missingNodes.length === 0) {
                addLog('PASS: All random nodes present after round-trip', 'success');
            } else {
                addLog(`FAIL: Missing nodes: ${missingNodes.join(', ')}`, 'error');
                throw new Error('Round-trip validation failed');
            }

        } catch (e: any) {
            addLog(`Test Failed: ${e.message}`, 'error');
            throw e;
        }
    };

    const runComplexRoundTripTest = async () => {
        addLog('--- Starting Complex Mermaid Round-trip Test ---', 'info');
        setDebugInfo(''); // Clear previous
        try {
            if (!mindMapRef.current) throw new Error('MindMap ref not available');

            // Generate a complex mermaid file
            const specialChars = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '[', ']', '{', '}', '<', '>', '?', '/', '\\', '|', ';', ':', '"', '\'', '`', '~', '+', '=', '-', '_', ' ', '\t', '😊', '🚀'];

            const lines = ['mindmap', '  root((Complex Root))'];

            let nodeCount = 0;
            function addComplexChildren(depth: number, indent: string) {
                if (depth > 5) return;

                const numChildren = Math.floor(Math.random() * 3) + 1; // 1-3 children
                for (let i = 0; i < numChildren; i++) {
                    const char = specialChars[Math.floor(Math.random() * specialChars.length)];
                    const char2 = specialChars[Math.floor(Math.random() * specialChars.length)];
                    const id = `node_${depth}_${i}_${Math.random().toString(36).substr(7)}`;
                    const topic = `Node ${depth}-${i} ${char}Special${char2}`;

                    lines.push(`${indent}  ${topic}`);
                    nodeCount++;
                    addComplexChildren(depth + 1, indent + '  ');
                }
            }

            addComplexChildren(1, '  ');
            const inputMermaid = lines.join('\n');
            // Extract expected topics directly from lines (trimming and handling potential partial matches if regex fails?)
            // actually the lines contain "  Node 1-0 ...", so trim is enough
            const inputTopics = lines.slice(2).map(l => l.trim());

            addLog(`Generated complex mermaid with ${nodeCount + 1} nodes`, 'info');

            mindMapRef.current.setMermaid(inputMermaid);
            await wait(1000);

            // Validation Strategy:
            // 1. Check if internal data matches input topics (verifies Parser)
            // 2. Export to Mermaid, Re-import, and check again (verifies Exporter + Round Trip)

            const buildDebugReport = (stage: string, missing: string[], internalTopics: string[]) => {
                return `FAILED AT STAGE: ${stage}
MISSING COUNT: ${missing.length}

MISSING TOPICS (First 10):
${missing.slice(0, 10).map(t => `- "${t}"`).join('\n')}

INPUT MERMAID (Partial):
${inputMermaid.split('\n').slice(0, 20).join('\n')}
...

INTERNAL TOPICS (First 20):
${internalTopics.slice(0, 20).map(t => `- "${t}"`).join('\n')}
...
`;
            };

            // Step 1: Check internal data
            const data1 = mindMapRef.current.getData();
            const topics1 = getAllTopics(data1);

            const missingInFirstLoad = inputTopics.filter(t => !topics1.includes(t));

            if (missingInFirstLoad.length > 0) {
                const report = buildDebugReport('Initial Parser Load', missingInFirstLoad, topics1);
                setDebugInfo(report);
                addLog(`FAIL: First load missing ${missingInFirstLoad.length} topics. First: ${missingInFirstLoad[0]}`, 'error');
                throw new Error('Parser failed to load special characters correctly');
            }
            addLog('PASS: Initial load preserved all special characters', 'success');

            // Step 2: Round Trip
            const outputMermaid = mindMapRef.current.getMermaid();
            mindMapRef.current.setMermaid(outputMermaid);
            await wait(1000);

            const data2 = mindMapRef.current.getData();
            const topics2 = getAllTopics(data2);

            const missingInRoundTrip = inputTopics.filter(t => !topics2.includes(t));

            if (missingInRoundTrip.length > 0) {
                const report = buildDebugReport('Round Trip (Export -> Import)', missingInRoundTrip, topics2);
                setDebugInfo(report + `\n\nOUTPUT MERMAID (Partial):\n${outputMermaid.split('\n').slice(0, 20).join('\n')}\n...`);
                addLog(`FAIL: Round-trip missing ${missingInRoundTrip.length} topics. First: ${missingInRoundTrip[0]}`, 'error');
                throw new Error('Round-trip validation failed');
            }

            addLog('PASS: Full round-trip preserved all special characters', 'success');
            setDebugInfo('ALL PASSED\n\n' + inputMermaid);

        } catch (e: any) {
            addLog(`Test Failed: ${e.message}`, 'error');
            throw e;
        }
    };

    const runFixedManipulationTest = async () => {
        addLog('--- Starting Fixed Manipulation Test ---', 'info');
        try {
            if (!mindMapRef.current) throw new Error('MindMap ref not available');

            const initial = 'mindmap\n  root((Root))\n    child1';
            mindMapRef.current.setMermaid(initial);
            await wait(500);

            // Verify Initial
            let currentMermaid = mindMapRef.current.getMermaid();
            if (!currentMermaid.includes('child1')) throw new Error('Initial load failed: child1 missing');
            addLog('Initial load verified', 'info');

            // Add Child via MindElixir API (simulating user action)
            const instance = mindMapRef.current.getInstance();
            if (!instance) throw new Error('MindElixir instance missing');

            const data = instance.getData();
            const rootNode = data.nodeData; // is root
            if (!rootNode) throw new Error('No root node found');

            // Create a simulated new node
            const newChild = {
                id: 'child2_' + Date.now(),
                topic: 'child2',
                expanded: true,
                children: []
            };

            if (!rootNode.children) rootNode.children = [];
            rootNode.children.push(newChild);

            instance.refresh(data);
            await wait(500);

            // Verify Add
            currentMermaid = mindMapRef.current.getMermaid();
            if (currentMermaid.includes('child2')) {
                addLog('PASS: child2 present after addition', 'success');
            } else {
                throw new Error('child2 missing after add');
            }

            // Remove child1
            // For testing, let's filter the children array
            rootNode.children = rootNode.children.filter((c: any) => c.topic !== 'child1');
            instance.refresh(data);
            await wait(500);

            // Verify Remove
            currentMermaid = mindMapRef.current.getMermaid();
            if (!currentMermaid.includes('child1') && currentMermaid.includes('child2')) {
                addLog('PASS: child1 removed, child2 persists', 'success');
            } else {
                throw new Error('Removal validation failed');
            }

        } catch (e: any) {
            addLog(`Test Failed: ${e.message}`, 'error');
            throw e;
        }
    };

    const runRootEditTest = async () => {
        addLog('--- Starting Root Edit Recursion Test ---', 'info');
        try {
            if (!mindMapRef.current) throw new Error('MindMap ref not available');

            // Initial: Standard root
            const initial = 'mindmap\n  root((TNBT))';
            mindMapRef.current.setMermaid(initial);
            await wait(500);

            // Round 1: Check if simple load works
            let output1 = mindMapRef.current.getMermaid();
            // output1 should contain root(("TNBT")) (plus indent/escapes)
            if (!output1.includes('TNBT')) throw new Error('Initial root load failed');

            // Validate no recursion in topic
            // e.g. NOT root(("root(("TNBT"))"))
            const data1 = mindMapRef.current.getData();
            if (data1.nodeData?.topic !== 'TNBT') {
                throw new Error(`Initial load topic mismatch. Got: ${data1.nodeData?.topic}`);
            }

            // Simulate "Update" - re-import the output
            // This is where recursion happens if parser doesn't strip 'root' prefix
            mindMapRef.current.setMermaid(output1);
            await wait(500);

            const data2 = mindMapRef.current.getData();
            if (data2.nodeData?.topic !== 'TNBT') {
                addLog(`FAIL: Recursion detected! Topic became: ${data2.nodeData?.topic}`, 'error');
                throw new Error('Root edit caused recursion');
            }

            addLog('PASS: Root topic remains stable after round-trip', 'success');

        } catch (e: any) {
            addLog(`Test Failed: ${e.message}`, 'error');
            throw e;
        }
    };

    const runAllTests = async () => {
        setLogs([]);
        setTestStatus('RUNNING');
        try {
            await runRandomRoundTripTest();
            await wait(500);
            await runComplexRoundTripTest();
            await wait(500);
            await runFixedManipulationTest();
            await wait(500);
            await runRootEditTest();
            setTestStatus('PASS');
            addLog('ALL TESTS PASSED', 'success');
        } catch (e) {
            setTestStatus('FAIL');
            addLog('TEST SUITE FAILED', 'error');
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-900 text-white p-4">
            <h1 className="text-2xl font-bold mb-4">Mermaid Integration Tests</h1>

            <div className="flex gap-4 mb-4">
                <button
                    onClick={runAllTests}
                    className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500 font-bold"
                    disabled={testStatus === 'RUNNING'}
                >
                    {testStatus === 'RUNNING' ? 'Running...' : 'Run All Tests'}
                </button>
                <div className={`px-4 py-2 rounded font-bold ${testStatus === 'PASS' ? 'bg-green-600' :
                        testStatus === 'FAIL' ? 'bg-red-600' :
                            'bg-gray-700'
                    }`}>
                    Status: {testStatus}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
                {/* Test Console */}
                <div className="flex flex-col gap-4">
                    <div className="bg-slate-800 rounded p-4 overflow-auto font-mono text-sm border border-slate-700 h-1/2">
                        <h2 className="text-lg font-bold mb-2 border-b border-slate-600 pb-2">Test Logs</h2>
                        {logs.length === 0 && <span className="text-gray-500">Ready to run tests...</span>}
                        {logs.map((log, i) => (
                            <div key={i} className={`mb-1 ${log.type === 'success' ? 'text-green-400' :
                                    log.type === 'error' ? 'text-red-400' :
                                        'text-gray-300'
                                }`}>
                                <span className="text-gray-500 text-xs mr-2">[{log.timestamp}]</span>
                                {log.message}
                            </div>
                        ))}
                    </div>
                    <div className="bg-slate-800 rounded p-4 flex flex-col font-mono text-xs border border-slate-700 h-1/2">
                        <h2 className="text-sm font-bold mb-2 text-gray-400 border-b border-slate-600 pb-1">Debug Info / Diff</h2>
                        <textarea
                            className="bg-slate-900 text-gray-300 p-2 flex-1 rounded border border-slate-700 resize-none font-mono text-xs whitespace-pre"
                            value={debugInfo}
                            readOnly
                            placeholder="Debug info will appear here on failure..."
                        />
                    </div>
                </div>

                {/* Visual Verification Area */}
                <div className="bg-slate-800 rounded border border-slate-700 p-2 flex flex-col">
                    <div className="text-xs text-gray-500 mb-1">Visual Verification Preview (MindMap Instance)</div>
                    <div className="flex-1 relative bg-slate-900 rounded overflow-hidden">
                        <MindMap ref={mindMapRef} />
                    </div>
                </div>
            </div>
        </div>
    );
}
