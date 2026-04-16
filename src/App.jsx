import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildTree,
  inOrder,
  layoutTree,
  levelOrder,
  postOrder,
  preOrder,
  predecessor,
  searchPath,
  successor,
  treeHeight,
  treeMax,
  treeMin,
  treeSize,
} from "./trees/baseTree";
import { TREE_CONFIG, TREE_TYPE_ORDER, TAB_TO_TYPE, TYPE_TO_TAB } from "./trees/treeRegistry";

const INITIAL_VALUES = [50, 30, 70, 20, 40, 60, 80, 10, 35, 55, 75];

const TRAVERSALS = [
  { key: "pre", label: "Pre-order", run: (root) => preOrder(root) },
  { key: "in", label: "In-order", run: (root) => inOrder(root) },
  { key: "post", label: "Post-order", run: (root) => postOrder(root) },
  { key: "level", label: "Level-order", run: (root) => levelOrder(root) },
];

const NODE_RADIUS = 24;

function ActionButton({ children, onClick, variant = "neutral", disabled = false }) {
  return (
    <button
      type="button"
      className={`btn ${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function LegendDot({ fill, stroke, label }) {
  return (
    <span className="legend-dot-wrap">
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="6" cy="6" r="5" fill={fill} stroke={stroke} strokeWidth="1.2" />
      </svg>
      {label}
    </span>
  );
}

function LearnPanel() {
  const cards = [
    {
      title: "Shared BST Base",
      points: [
        "One canonical node shape: value + left/right links.",
        "All trees share search path, predecessor/successor, traversals, min/max, and layout.",
        "BST insert/delete acts as the foundational behavior.",
      ],
    },
    {
      title: "AVL Layer",
      points: [
        "Extends the same base nodes with height metadata.",
        "Adds balance checks and rotations after insert/delete.",
        "Guarantees O(log n) operations through strict balancing.",
      ],
    },
    {
      title: "Red-Black Layer",
      points: [
        "Extends base nodes with color metadata.",
        "Uses left-leaning red-black transformations.",
        "Maintains near-perfect balance with fewer rotations.",
      ],
    },
    {
      title: "Unified UI Contract",
      points: [
        "The UI talks to a single tree registry for insert/delete logic.",
        "Swapping types switches strategy, not app structure.",
        "Every tree keeps identical controls and interactions.",
      ],
    },
  ];

  return (
    <section className="learn-grid">
      {cards.map((card) => (
        <article key={card.title} className="learn-card">
          <h3>{card.title}</h3>
          <ul>
            {card.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}

function TreeWorkspace({ type, root, onRoot, onHistory }) {
  const config = TREE_CONFIG[type];

  const [input, setInput] = useState("");
  const [message, setMessage] = useState({ ok: true, text: "Preloaded with 11 nodes" });
  const [pathSet, setPathSet] = useState(new Set());
  const [foundValue, setFoundValue] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [traversal, setTraversal] = useState({ name: "", values: [], index: -1 });

  const dragRef = useRef({ active: false, startX: 0, startY: 0, panX: 0, panY: 0 });
  const canvasRef = useRef(null);
  const timerRef = useRef(null);

  const layout = useMemo(
    () =>
      layoutTree(root, {
        nodeRadius: NODE_RADIUS,
        verticalGap: 64,
        padding: 44,
        horizontalSlot: NODE_RADIUS * 2 + 16,
      }),
    [root],
  );

  const currentTraversalValue =
    traversal.index >= 0 && traversal.index < traversal.values.length
      ? traversal.values[traversal.index]
      : null;

  const visitedTraversalValues = useMemo(
    () => new Set(traversal.values.slice(0, Math.max(0, traversal.index))),
    [traversal.values, traversal.index],
  );

  const stopTraversal = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setTraversal({ name: "", values: [], index: -1 });
  }, []);

  const clearSearch = useCallback(() => {
    setPathSet(new Set());
    setFoundValue(null);
  }, []);

  const fitCanvas = useCallback(() => {
    if (!layout || !canvasRef.current) return;

    const svgWidth = canvasRef.current.clientWidth || 760;
    const svgHeight = 428;
    const nextZoom = parseFloat(
      Math.min(1.45, (svgWidth - 24) / layout.width, (svgHeight - 24) / layout.height).toFixed(3),
    );

    setZoom(nextZoom);
    setPan({
      x: Math.max(0, (svgWidth - layout.width * nextZoom) / 2),
      y: 14,
    });
  }, [layout]);

  useEffect(() => {
    fitCanvas();
  }, [fitCanvas]);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  useEffect(() => {
    const svg = canvasRef.current;
    if (!svg) return undefined;

    const onWheel = (event) => {
      event.preventDefault();
      setZoom((current) =>
        parseFloat(Math.max(0.1, Math.min(4, current * (event.deltaY < 0 ? 1.12 : 0.9))).toFixed(3)),
      );
    };

    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const parseInput = () => {
    const value = Number.parseInt(input, 10);
    return Number.isNaN(value) ? null : value;
  };

  const setOk = (text) => setMessage({ ok: true, text });
  const setError = (text) => setMessage({ ok: false, text });

  const onInsert = () => {
    const value = parseInput();
    if (value === null) return setError("Enter an integer first.");

    clearSearch();
    stopTraversal();

    const nextRoot = config.insert(root, value);
    if (treeSize(nextRoot) === treeSize(root)) return setError(`${value} already exists.`);

    onRoot(nextRoot);
    onHistory((prev) => [...prev, value]);
    setOk(`Inserted ${value}. Height is now ${treeHeight(nextRoot)}.`);
    setInput("");
  };

  const onDelete = () => {
    const value = parseInput();
    if (value === null) return setError("Enter an integer first.");

    clearSearch();
    stopTraversal();

    const nextRoot = config.remove(root, value);
    if (treeSize(nextRoot) === treeSize(root)) return setError(`${value} was not found.`);

    onRoot(nextRoot);
    onHistory((prev) => prev.filter((entry) => entry !== value));
    setOk(`Deleted ${value}.`);
    setInput("");
  };

  const onSearch = () => {
    const value = parseInput();
    if (value === null) return setError("Enter an integer first.");

    stopTraversal();

    const { found, path } = searchPath(root, value);
    setPathSet(new Set(path));
    setFoundValue(found ? value : null);

    const pred = predecessor(root, value);
    const succ = successor(root, value);

    if (found) {
      setOk(`Found ${value} at depth ${path.length - 1}. Pred: ${pred ?? "-inf"}, Succ: ${succ ?? "+inf"}.`);
    } else {
      setError(`${value} not found. Fits between ${pred ?? "-inf"} and ${succ ?? "+inf"}.`);
    }
  };

  const onRandomInsert = () => {
    const existing = new Set(inOrderValues(root));
    if (existing.size >= 199) return setError("All values from 1 to 199 already exist.");

    clearSearch();
    stopTraversal();

    let value;
    do value = Math.floor(Math.random() * 199) + 1;
    while (existing.has(value));

    const nextRoot = config.insert(root, value);
    onRoot(nextRoot);
    onHistory((prev) => [...prev, value]);
    setOk(`Inserted ${value} (random).`);
  };

  const onClearAll = () => {
    clearSearch();
    stopTraversal();
    onRoot(null);
    onHistory([]);
    setOk("Tree cleared.");
  };

  const startTraversal = (name, runner) => {
    const sequence = runner(root);
    if (!sequence.length) return setError("Tree is empty.");

    clearSearch();
    stopTraversal();

    setTraversal({ name, values: sequence, index: 0 });

    let pointer = 0;
    timerRef.current = setInterval(() => {
      pointer += 1;
      if (pointer >= sequence.length) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        setTraversal((prev) => ({ ...prev, index: sequence.length }));
      } else {
        setTraversal((prev) => ({ ...prev, index: pointer }));
      }
    }, 620);
  };

  const getNodeColor = (node) => {
    if (node.val === foundValue) return { fill: "#FACC15", stroke: "#A16207", text: "#1F1302" };
    if (pathSet.has(node.val)) return { fill: "#FDE68A", stroke: "#B45309", text: "#6B3410" };
    if (currentTraversalValue === node.val) return { fill: "#818CF8", stroke: "#3730A3", text: "#FFFFFF" };
    if (visitedTraversalValues.has(node.val)) return { fill: "#C7D2FE", stroke: "#4338CA", text: "#1E1B4B" };

    if (type === "RB") {
      return node.color === "R"
        ? { fill: "#D9480F", stroke: "#7C2D12", text: "#FFFFFF" }
        : { fill: "#1F2937", stroke: "#111827", text: "#E5E7EB" };
    }

    if (type === "AVL") {
      const bf = (node.left?.h ?? 0) - (node.right?.h ?? 0);
      if (bf === 0) return { fill: "#34D399", stroke: "#065F46", text: "#042F2E" };
      if (Math.abs(bf) === 1) return { fill: "#FCD34D", stroke: "#92400E", text: "#1F1302" };
      return { fill: "#FCA5A5", stroke: "#B91C1C", text: "#7F1D1D" };
    }

    return { fill: "#7CC4FA", stroke: "#1D4ED8", text: "#082F6B" };
  };

  const edgePoints = (parentX, parentY, childX, childY) => {
    const dx = childX - parentX;
    const dy = childY - parentY;
    const d = Math.hypot(dx, dy);
    const nx = dx / d;
    const ny = dy / d;
    return {
      x1: parentX + nx * NODE_RADIUS,
      y1: parentY + ny * NODE_RADIUS,
      x2: childX - nx * NODE_RADIUS,
      y2: childY - ny * NODE_RADIUS,
    };
  };

  const renderEdges = (node) => {
    if (!node) return null;

    return (
      <>
        {node.left && (() => {
          const edge = edgePoints(node.cx, node.cy, node.left.cx, node.left.cy);
          return (
            <line
              key={`${node.val}-L`}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              className="tree-edge"
            />
          );
        })()}

        {node.right && (() => {
          const edge = edgePoints(node.cx, node.cy, node.right.cx, node.right.cy);
          return (
            <line
              key={`${node.val}-R`}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              className="tree-edge"
            />
          );
        })()}

        {renderEdges(node.left)}
        {renderEdges(node.right)}
      </>
    );
  };

  const renderNodes = (node) => {
    if (!node) return null;

    const palette = getNodeColor(node);
    const bf = type === "AVL" ? (node.left?.h ?? 0) - (node.right?.h ?? 0) : null;

    return (
      <>
        {currentTraversalValue === node.val && (
          <circle
            cx={node.cx}
            cy={node.cy}
            r={NODE_RADIUS + 5}
            fill="none"
            stroke="#6366F1"
            strokeWidth="2.4"
            opacity="0.8"
          />
        )}

        <circle
          cx={node.cx}
          cy={node.cy}
          r={NODE_RADIUS}
          fill={palette.fill}
          stroke={palette.stroke}
          strokeWidth="1.6"
        />

        <text
          x={node.cx}
          y={bf === null ? node.cy : node.cy - 5}
          textAnchor="middle"
          dominantBaseline="central"
          className="node-label"
          fill={palette.text}
        >
          {node.val}
        </text>

        {bf !== null && (
          <text
            x={node.cx}
            y={node.cy + 10}
            textAnchor="middle"
            dominantBaseline="central"
            className="node-sub-label"
            fill={palette.stroke}
          >
            {bf > 0 ? "+" : ""}
            {bf}
          </text>
        )}

        {renderNodes(node.left)}
        {renderNodes(node.right)}
      </>
    );
  };

  const typeLegend =
    type === "AVL"
      ? [
          { fill: "#34D399", stroke: "#065F46", label: "Balanced (bf=0)" },
          { fill: "#FCD34D", stroke: "#92400E", label: "Leaning (|bf|=1)" },
          { fill: "#FCA5A5", stroke: "#B91C1C", label: "Violation (|bf|>=2)" },
        ]
      : type === "RB"
        ? [
            { fill: "#D9480F", stroke: "#7C2D12", label: "Red node" },
            { fill: "#1F2937", stroke: "#111827", label: "Black node" },
          ]
        : [{ fill: "#7CC4FA", stroke: "#1D4ED8", label: "BST node" }];

  const extraMetric = config.extraMetric(root);

  return (
    <section className="workspace">
      <div className="toolbar-row">
        <input
          value={input}
          type="number"
          placeholder="integer"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && onInsert()}
          className="value-input"
        />

        <ActionButton variant="success" onClick={onInsert}>Insert</ActionButton>
        <ActionButton variant="danger" onClick={onDelete}>Delete</ActionButton>
        <ActionButton onClick={onSearch}>Search</ActionButton>
        <ActionButton onClick={() => (treeMin(root) === null ? setError("Tree is empty.") : setOk(`Minimum: ${treeMin(root)}`))}>Min</ActionButton>
        <ActionButton onClick={() => (treeMax(root) === null ? setError("Tree is empty.") : setOk(`Maximum: ${treeMax(root)}`))}>Max</ActionButton>
        <ActionButton onClick={onRandomInsert}>Random</ActionButton>
        <ActionButton onClick={clearSearch}>Clear Highlight</ActionButton>
        <ActionButton onClick={onClearAll}>Clear All</ActionButton>

        <span className={`status-pill ${message.ok ? "good" : "bad"}`}>{message.text}</span>
      </div>

      <div className="toolbar-row secondary">
        <span className="toolbar-label">Traverse</span>

        {TRAVERSALS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => startTraversal(option.label, option.run)}
            className={`chip ${traversal.name === option.label ? "active" : ""}`}
          >
            {option.label}
          </button>
        ))}

        {traversal.values.length > 0 && (
          <span className="sequence-readout">
            {traversal.name}: {traversal.values.map((value, idx) => (idx === traversal.index ? `[${value}]` : value)).join(", ")}
          </span>
        )}
      </div>

      <div className="metrics-row">
        <span>Nodes: <b>{treeSize(root)}</b></span>
        <span>Height: <b>{treeHeight(root)}</b></span>
        <span>Min: <b>{treeMin(root) ?? "-"}</b></span>
        <span>Max: <b>{treeMax(root) ?? "-"}</b></span>
        {extraMetric && <span>{extraMetric}</span>}

        <div className="zoom-controls">
          <button type="button" onClick={() => setZoom((value) => parseFloat(Math.min(4, value * 1.2).toFixed(3)))}>+</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((value) => parseFloat(Math.max(0.1, value / 1.2).toFixed(3)))}>-</button>
          <button type="button" onClick={fitCanvas}>Fit</button>
        </div>
      </div>

      <div className="canvas-shell">
        {!root && <div className="empty-state">Tree is empty. Insert a value to start.</div>}

        <svg
          ref={canvasRef}
          width="100%"
          height="428"
          className="tree-canvas"
          onMouseDown={(event) => {
            dragRef.current = {
              active: true,
              startX: event.clientX,
              startY: event.clientY,
              panX: pan.x,
              panY: pan.y,
            };
          }}
          onMouseMove={(event) => {
            if (!dragRef.current.active) return;
            setPan({
              x: dragRef.current.panX + event.clientX - dragRef.current.startX,
              y: dragRef.current.panY + event.clientY - dragRef.current.startY,
            });
          }}
          onMouseUp={() => {
            dragRef.current.active = false;
          }}
          onMouseLeave={() => {
            dragRef.current.active = false;
          }}
        >
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {layout && (
              <>
                {renderEdges(layout.root)}
                {renderNodes(layout.root)}
              </>
            )}
          </g>
        </svg>
      </div>

      <div className="legend-row">
        {typeLegend.map((entry) => (
          <LegendDot
            key={entry.label}
            fill={entry.fill}
            stroke={entry.stroke}
            label={entry.label}
          />
        ))}

        <LegendDot fill="#FDE68A" stroke="#B45309" label="Search path" />
        <LegendDot fill="#FACC15" stroke="#A16207" label="Search hit" />
        <LegendDot fill="#C7D2FE" stroke="#4338CA" label="Traversal visited" />
        <LegendDot fill="#818CF8" stroke="#3730A3" label="Traversal current" />

        <span className="legend-hint">Wheel to zoom, drag to pan.</span>
      </div>
    </section>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("learn");
  const [treeType, setTreeType] = useState("BST");
  const [root, setRoot] = useState(() => buildTree(INITIAL_VALUES, TREE_CONFIG.BST.insert));
  const [history, setHistory] = useState(INITIAL_VALUES);

  const convertTo = (nextType) => {
    if (nextType === treeType) return;

    const rebuiltRoot = buildTree(history, TREE_CONFIG[nextType].insert);

    setRoot(rebuiltRoot);
    setTreeType(nextType);
    setActiveTab(TYPE_TO_TAB[nextType]);
  };

  const switchTab = (tabKey) => {
    setActiveTab(tabKey);
    if (tabKey !== "learn" && TAB_TO_TYPE[tabKey] !== treeType) convertTo(TAB_TO_TYPE[tabKey]);
  };

  const tabs = [
    { key: "learn", label: "Concepts" },
    ...TREE_TYPE_ORDER.map((key) => ({ key: TREE_CONFIG[key].tab, label: TREE_CONFIG[key].shortLabel })),
  ];

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Modular Binary Tree Lab</h1>
        <p>
          One shared BST foundation. AVL and Red-Black are layered strategies, not separate disconnected systems.
        </p>
      </header>

      <nav className="tabs-row" aria-label="Tree view tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => switchTab(tab.key)}
            className={`tab-btn ${activeTab === tab.key ? "active" : ""}`}
          >
            {tab.label}
          </button>
        ))}

        <span className="tabs-summary">
          {activeTab === "learn" ? "Architecture first" : TREE_CONFIG[treeType].summary}
        </span>
      </nav>

      {activeTab === "learn" ? (
        <LearnPanel />
      ) : (
        <section className="tree-panel">
          <div className="tree-panel-header">
            <span className="tree-title">Current type: {TREE_CONFIG[treeType].title}</span>

            <div className="type-switch-row">
              {TREE_TYPE_ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => convertTo(key)}
                  className={`chip ${treeType === key ? "active" : ""}`}
                  disabled={treeType === key}
                >
                  {TREE_CONFIG[key].shortLabel}
                </button>
              ))}
            </div>
          </div>

          <TreeWorkspace
            type={treeType}
            root={root}
            onRoot={setRoot}
            onHistory={setHistory}
          />
        </section>
      )}
    </main>
  );
}
