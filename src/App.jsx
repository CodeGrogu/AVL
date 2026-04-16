import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Trash2, Search, Eraser, ArrowDownToLine, ArrowUpToLine, Dices, Trash,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  ChevronDown, ZoomIn, ZoomOut, Maximize,
  SkipBack, Play, Pause, SkipForward, RotateCcw, Info
} from "lucide-react";
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
  treeLeavesCount,
  treeInternalNodesCount,
} from "./trees/baseTree";
import { TREE_CONFIG, TREE_TYPE_ORDER, TAB_TO_TYPE, TYPE_TO_TAB } from "./trees/treeRegistry";

const INITIAL_VALUES = [50, 30, 70, 20, 40, 60, 80, 10, 35, 55, 75];
const NODE_RADIUS = 24;
const STORAGE_KEY = "modular-tree-lab:v2";
const STORAGE_VERSION = 2;

const TRAVERSALS = [
  { key: "pre", label: "Pre-order", run: (root) => preOrder(root) },
  { key: "in", label: "In-order", run: (root) => inOrder(root) },
  { key: "post", label: "Post-order", run: (root) => postOrder(root) },
  { key: "level", label: "Level-order", run: (root) => levelOrder(root) },
];

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const APP_TITLE_FULL = "Modular Binary Tree Lab";
const APP_TITLE_COMPACT = "MBTL";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const getHistorySignature = (values) => values.join("|");

const cloneFrame = (frame) => ({
  ...frame,
  focus: Array.isArray(frame.focus) ? [...frame.focus] : [],
});

const cloneOperation = (operation) => ({
  ...operation,
  frames: Array.isArray(operation.frames) ? operation.frames.map(cloneFrame) : [],
});

const createEmptySession = () => ({
  operationHistory: [],
  selectedOperationId: null,
  timelineState: { frames: [], index: 0, playing: false },
  timelineSpeed: 1,
  zoom: 1,
  pan: { x: 0, y: 0 },
  historySignature: "",
});

const sanitizePersistedSession = (candidate) => {
  const fallback = createEmptySession();
  if (!candidate || typeof candidate !== "object") return fallback;

  const operationHistory = Array.isArray(candidate.operationHistory)
    ? candidate.operationHistory
        .filter((entry) => entry && typeof entry === "object")
        .map(cloneOperation)
    : [];

  const timelineFrames = Array.isArray(candidate.timelineState?.frames)
    ? candidate.timelineState.frames.map(cloneFrame)
    : [];

  const timelineMax = Math.max(0, timelineFrames.length - 1);
  const timelineIndex = Number.isFinite(candidate.timelineState?.index)
    ? clamp(Math.trunc(candidate.timelineState.index), 0, timelineMax)
    : 0;

  const selectedOperationId =
    typeof candidate.selectedOperationId === "string" &&
    operationHistory.some((entry) => entry.id === candidate.selectedOperationId)
      ? candidate.selectedOperationId
      : operationHistory[0]?.id ?? null;

  const panX = Number.isFinite(candidate.pan?.x) ? candidate.pan.x : 0;
  const panY = Number.isFinite(candidate.pan?.y) ? candidate.pan.y : 0;

  return {
    operationHistory,
    selectedOperationId,
    timelineState: {
      frames: timelineFrames,
      index: timelineIndex,
      playing: false,
    },
    timelineSpeed: Number.isFinite(candidate.timelineSpeed)
      ? clamp(candidate.timelineSpeed, 0.5, 3)
      : 1,
    zoom: Number.isFinite(candidate.zoom) ? clamp(candidate.zoom, 0.1, 4) : 1,
    pan: { x: panX, y: panY },
    historySignature: typeof candidate.historySignature === "string" ? candidate.historySignature : "",
  };
};

const createDefaultStorage = () => ({
  version: STORAGE_VERSION,
  app: {
    activeTab: "learn",
    treeType: "BST",
    history: [...INITIAL_VALUES],
  },
  sessionsByType: TREE_TYPE_ORDER.reduce((acc, type) => {
    acc[type] = createEmptySession();
    return acc;
  }, {}),
});

const sanitizeHistory = (candidate) => {
  if (!Array.isArray(candidate)) return [...INITIAL_VALUES];

  const parsed = candidate
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value));

  if (!parsed.length) return [];
  return [...new Set(parsed)];
};

const readPersistedState = () => {
  if (typeof window === "undefined") return createDefaultStorage();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultStorage();

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return createDefaultStorage();
    if (parsed.version !== STORAGE_VERSION) return createDefaultStorage();

    const treeType = TREE_CONFIG[parsed.app?.treeType] ? parsed.app.treeType : "BST";
    const activeTab = parsed.app?.activeTab === "learn" ? "learn" : TYPE_TO_TAB[treeType];
    const history = sanitizeHistory(parsed.app?.history);

    const sessionsByType = TREE_TYPE_ORDER.reduce((acc, type) => {
      acc[type] = sanitizePersistedSession(parsed.sessionsByType?.[type]);
      return acc;
    }, {});

    return {
      version: STORAGE_VERSION,
      app: { activeTab, treeType, history },
      sessionsByType,
    };
  } catch {
    return createDefaultStorage();
  }
};

const writePersistedState = (nextState) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  } catch {
    // Ignore write failures (e.g. private mode quota restrictions).
  }
};

const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);

const FRAME_KIND_META = {
  start: { label: "Start", tone: "neutral" },
  visit: { label: "Search Path", tone: "neutral" },
  insert: { label: "Insert", tone: "success" },
  delete: { label: "Delete", tone: "danger" },
  replace: { label: "Replace", tone: "case" },
  case: { label: "Case", tone: "case" },
  rotation: { label: "Rotation", tone: "rotation" },
  "rotation-result": { label: "After Rotation", tone: "rotation" },
  "color-flip": { label: "Color Flip", tone: "color" },
  "color-flip-result": { label: "After Color Flip", tone: "color" },
  "root-recolor": { label: "Root Recolor", tone: "color" },
  step: { label: "Step", tone: "neutral" },
  done: { label: "Complete", tone: "success" },
};

const getFrameKindMeta = (kind) => FRAME_KIND_META[kind] ?? { label: "Step", tone: "neutral" };

const summarizeFrames = (frames, fallback) => {
  for (let idx = frames.length - 1; idx >= 0; idx -= 1) {
    if (frames[idx].explanation) return frames[idx].explanation;
  }
  return fallback;
};

const nodeSignature = (node) => {
  if (!node) return "#";
  return `${node.val}:${node.h ?? "-"}:${node.color ?? "-"}|${nodeSignature(node.left)}|${nodeSignature(node.right)}`;
};

const dedupeFrames = (frames) => {
  const out = [];
  let prevSig = null;
  let prevLabel = null;

  for (const frame of frames) {
    const sig = nodeSignature(frame.root);
    if (sig === prevSig && frame.label === prevLabel) continue;
    out.push({ ...frame });
    prevSig = sig;
    prevLabel = frame.label;
  }

  return out;
};

const buildTimeline = ({ beforeRoot, path = [], traceFrames = [], afterRoot, actionLabel, value }) => {
  const valueLabel = value === undefined ? "" : ` ${value}`;
  const frames = [
    {
      root: beforeRoot,
      label: `${actionLabel} start`,
      focus: [],
      kind: "start",
      explanation: `Start ${actionLabel.toLowerCase()}${valueLabel}.`,
    },
  ];

  for (const visited of path) {
    frames.push({
      root: beforeRoot,
      label: `Visit ${visited}`,
      focus: [visited],
      kind: "visit",
      explanation: `Traverse through node ${visited} while searching the modification path.`,
    });
  }

  for (const trace of traceFrames) {
    frames.push({
      root: trace.root,
      label: trace.label ?? `${actionLabel} step`,
      focus: trace.focus ?? [],
      kind: trace.kind ?? "step",
      explanation: trace.explanation ?? "",
    });
  }

  frames.push({
    root: afterRoot,
    label: `${actionLabel} done${value !== undefined ? ` (${value})` : ""}`,
    focus: [],
    kind: "done",
    explanation: `${actionLabel} complete${valueLabel}.`,
  });

  return dedupeFrames(frames);
};

const interpolateLayout = (fromLayout, toLayout, progress) => {
  const fromNodeMap = fromLayout?.nodeMap ?? new Map();
  const toNodeMap = toLayout?.nodeMap ?? new Map();

  const nodeIds = new Set([...fromNodeMap.keys(), ...toNodeMap.keys()]);
  const nodeMap = new Map();

  for (const id of nodeIds) {
    const from = fromNodeMap.get(id) ?? toNodeMap.get(id);
    const to = toNodeMap.get(id) ?? fromNodeMap.get(id);
    const existsBefore = fromNodeMap.has(id);
    const existsAfter = toNodeMap.has(id);

    const x = from.x + (to.x - from.x) * progress;
    const y = from.y + (to.y - from.y) * progress;
    const opacity = existsBefore && existsAfter ? 1 : existsBefore ? 1 - progress : progress;

    const meta = {
      value: id,
      x,
      y,
      opacity,
      node: toNodeMap.get(id)?.node ?? fromNodeMap.get(id)?.node,
    };

    nodeMap.set(id, meta);
  }

  const getUndirected = (u, v) => JSON.stringify(u < v ? [u, v] : [v, u]);
  const parseUndirected = (key) => JSON.parse(key);

  const fromUndirected = new Map();
  for (const edge of fromLayout?.edges ?? []) {
    const [u, v] = edge.key.split("->").map(Number);
    fromUndirected.set(getUndirected(u, v), edge.key);
  }

  const toUndirected = new Map();
  for (const edge of toLayout?.edges ?? []) {
    const [u, v] = edge.key.split("->").map(Number);
    toUndirected.set(getUndirected(u, v), edge.key);
  }

  const common = new Set();
  const broken = new Set();
  const formed = new Set();

  for (const un of fromUndirected.keys()) {
    if (toUndirected.has(un)) common.add(un);
    else broken.add(un);
  }
  for (const un of toUndirected.keys()) {
    if (!fromUndirected.has(un)) formed.add(un);
  }

  const edges = [];

  for (const un of common) {
    const key = toUndirected.get(un);
    const [u, v] = key.split("->").map(Number);
    const source = nodeMap.get(u);
    const target = nodeMap.get(v);
    if (source && target) edges.push({ key, from: source, to: target, opacity: 1 });
  }

  const brokenArray = Array.from(broken);
  const formedArray = Array.from(formed);
  const pairedBroken = new Set();
  const pairedFormed = new Set();

  for (const b of brokenArray) {
    const [b1, b2] = parseUndirected(b);
    for (const f of formedArray) {
      if (pairedFormed.has(f)) continue;
      const [f1, f2] = parseUndirected(f);
      
      const sharedNode = b1 === f1 || b1 === f2 ? b1 : b2 === f1 || b2 === f2 ? b2 : null;
      if (sharedNode !== null) {
        pairedBroken.add(b);
        pairedFormed.add(f);
        
        const bOther = b1 === sharedNode ? b2 : b1;
        const fOther = f1 === sharedNode ? f2 : f1;
        
        const pivot = nodeMap.get(sharedNode);
        const sourceFrom = nodeMap.get(bOther);
        const sourceTo = nodeMap.get(fOther);
        
        if (pivot && sourceFrom && sourceTo) {
          const dynamicOther = {
            x: sourceFrom.x + (sourceTo.x - sourceFrom.x) * progress,
            y: sourceFrom.y + (sourceTo.y - sourceFrom.y) * progress,
          };
          
          const formedKey = toUndirected.get(f);
          const [fU] = formedKey.split("->").map(Number);
          
          if (fU === sharedNode) {
            edges.push({ key: formedKey, from: pivot, to: dynamicOther, opacity: 1 });
          } else {
            edges.push({ key: formedKey, from: dynamicOther, to: pivot, opacity: 1 });
          }
        }
        break;
      }
    }
  }

  for (const b of brokenArray) {
    if (pairedBroken.has(b)) continue;
    const key = fromUndirected.get(b);
    const [u, v] = key.split("->").map(Number);
    const source = nodeMap.get(u);
    const target = nodeMap.get(v);
    if (source && target) edges.push({ key, from: source, to: target, opacity: 1 - progress });
  }

  for (const f of formedArray) {
    if (pairedFormed.has(f)) continue;
    const key = toUndirected.get(f);
    const [u, v] = key.split("->").map(Number);
    const source = nodeMap.get(u);
    const target = nodeMap.get(v);
    if (source && target) edges.push({ key, from: source, to: target, opacity: progress });
  }

  const widthFrom = fromLayout?.width ?? toLayout?.width ?? 0;
  const widthTo = toLayout?.width ?? fromLayout?.width ?? 0;
  const heightFrom = fromLayout?.height ?? toLayout?.height ?? 0;
  const heightTo = toLayout?.height ?? fromLayout?.height ?? 0;

  return {
    width: widthFrom + (widthTo - widthFrom) * progress,
    height: heightFrom + (heightTo - heightFrom) * progress,
    nodes: [...nodeMap.values()],
    edges,
  };
};

function ActionButton({ children, onClick, variant = "neutral", disabled = false, icon: Icon }) {
  return (
    <button type="button" className={`btn ${variant}`} onClick={onClick} disabled={disabled}>
      {Icon && <Icon size={14} className="btn-icon" />}
      {children}
    </button>
  );
}

function LegendDot({ fill, stroke, label, ring }) {
  return (
    <span className="legend-dot-wrap">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        {ring ? (
          <>
            <circle cx="7" cy="7" r="5" fill={fill || "none"} stroke={stroke} strokeWidth="1.2" />
            <circle cx="7" cy="7" r="6.5" fill="none" stroke={ring} strokeWidth="1.4" strokeDasharray="3 2" />
          </>
        ) : (
          <circle cx="7" cy="7" r="5" fill={fill} stroke={stroke} strokeWidth="1.2" />
        )}
      </svg>
      {label}
    </span>
  );
}

// Rich context-aware tooltip for hovered tree nodes
function NodeTooltip({ hoveredNode, treeType, timelineFrame, frameFocusSet, pathSet, foundValue, traversal, pan, zoom, canvasRef }) {
  if (!hoveredNode || !canvasRef?.current) return null;

  const { value, node, x, y } = hoveredNode;
  const svgRect = canvasRef.current.getBoundingClientRect();

  const screenX = svgRect.left + pan.x + x * zoom;
  const screenY = svgRect.top + pan.y + y * zoom;

  const lines = [];

  lines.push({ tag: "title", text: `Node ${value}` });

  if (treeType === "AVL") {
    const leftH = node.left?.h ?? 0;
    const rightH = node.right?.h ?? 0;
    const bf = leftH - rightH;
    lines.push({ tag: "stat", label: "Height", text: `${node.h ?? "?"}` });
    lines.push({ tag: "stat", label: "Balance factor", text: `${bf > 0 ? "+" : ""}${bf}` });
    if (Math.abs(bf) >= 2) {
      lines.push({ tag: "alert", text: `Imbalanced (|bf|=${Math.abs(bf)}). A rotation is needed to restore AVL invariants.` });
    } else if (Math.abs(bf) === 1) {
      lines.push({ tag: "info", text: "Slightly leaning but within AVL tolerance." });
    } else {
      lines.push({ tag: "info", text: "Perfectly balanced at this subtree." });
    }
  }

  if (treeType === "RB") {
    const colorName = node.color === "R" ? "Red" : "Black";
    lines.push({ tag: "stat", label: "Color", text: colorName });
    if (node.color === "R") {
      lines.push({ tag: "info", text: "Red nodes represent temporary 3/4-node configurations in a 2-3 tree mapping." });
    } else {
      lines.push({ tag: "info", text: "Black nodes contribute to the black-height invariant ensuring O(log n) performance." });
    }
  }

  const children = [node.left ? `L:${node.left.val}` : null, node.right ? `R:${node.right.val}` : null].filter(Boolean);
  lines.push({ tag: "stat", label: "Children", text: children.length ? children.join(", ") : "None (leaf)" });

  const frame = timelineFrame;
  if (frame) {
    const isFocused = frameFocusSet.has(value);
    const kind = frame.kind;
    const kindMeta = FRAME_KIND_META[kind] ?? { label: "Step", tone: "neutral" };

    if (isFocused) {
      if (kind === "rotation" || kind === "rotation-result") {
        const focusArr = frame.focus ?? [];
        if (focusArr[0] === value) {
          lines.push({ tag: "highlight", text: `Rotation pivot: this node is the center of the current ${kindMeta.label.toLowerCase()} operation.` });
        } else {
          lines.push({ tag: "highlight", text: `Participating in a ${kindMeta.label.toLowerCase()}. This node is being repositioned in the subtree.` });
        }
      } else if (kind === "color-flip" || kind === "color-flip-result") {
        lines.push({ tag: "highlight", text: "This node's color is being flipped as part of a Red-Black rebalancing step." });
      } else if (kind === "root-recolor") {
        lines.push({ tag: "highlight", text: "The root is being recolored to black to maintain the Red-Black invariant." });
      } else if (kind === "case") {
        lines.push({ tag: "highlight", text: "Imbalance case detected here. The algorithm is deciding which rotation pattern to apply." });
      } else if (kind === "insert") {
        lines.push({ tag: "highlight", text: "This node was just inserted into the tree." });
      } else if (kind === "delete" || kind === "replace") {
        lines.push({ tag: "highlight", text: "This node is involved in the current deletion/replacement step." });
      } else if (kind === "visit") {
        lines.push({ tag: "highlight", text: "The search path is currently visiting this node." });
      } else {
        lines.push({ tag: "highlight", text: `Currently focused during: ${kindMeta.label}.` });
      }

      if (frame.explanation) {
        lines.push({ tag: "explain", text: frame.explanation });
      }
    }
  }

  if (foundValue === value) {
    lines.push({ tag: "highlight", text: "Search hit: this is the node matching the search query." });
  } else if (pathSet.has(value)) {
    lines.push({ tag: "info", text: "This node is on the search path traversed to find the target." });
  }

  if (traversal.name) {
    const tIdx = traversal.values.indexOf(value);
    if (tIdx === traversal.index) {
      lines.push({ tag: "highlight", text: `${traversal.name} traversal is currently visiting this node (position ${tIdx + 1}/${traversal.values.length}).` });
    } else if (tIdx >= 0 && tIdx < traversal.index) {
      lines.push({ tag: "info", text: `Already visited in ${traversal.name} (position ${tIdx + 1}).` });
    }
  }

  return (
    <div
      className="node-tooltip"
      style={{
        position: "fixed",
        left: `${screenX}px`,
        top: `${screenY - NODE_RADIUS * zoom - 12}px`,
      }}
    >
      <div className="node-tooltip-inner">
        {lines.map((line, i) => {
          if (line.tag === "title") return <div key={i} className="ntt-title">{line.text}</div>;
          if (line.tag === "stat") return <div key={i} className="ntt-stat"><span className="ntt-stat-label">{line.label}</span><span className="ntt-stat-value">{line.text}</span></div>;
          if (line.tag === "alert") return <div key={i} className="ntt-alert">{line.text}</div>;
          if (line.tag === "highlight") return <div key={i} className="ntt-highlight">{line.text}</div>;
          if (line.tag === "explain") return <div key={i} className="ntt-explain">{line.text}</div>;
          return <div key={i} className="ntt-info">{line.text}</div>;
        })}
      </div>
    </div>
  );
}

function TimelineSegmentTooltip({ hoveredSegment }) {
  if (!hoveredSegment?.frame) return null;

  const { frame, index, total, x, y } = hoveredSegment;
  const kindMeta = getFrameKindMeta(frame.kind);

  return (
    <div
      className="timeline-segment-tooltip"
      style={{ left: `${x}px`, top: `${y}px` }}
      role="tooltip"
      aria-hidden="true"
    >
      <div className="timeline-segment-tooltip-inner">
        <div className="timeline-segment-tooltip-meta">
          <span className={`frame-kind-badge tone-${kindMeta.tone}`}>{kindMeta.label}</span>
          <span className="timeline-segment-step">Frame {index + 1}/{total}</span>
        </div>
        <div className="timeline-segment-title">{frame.label}</div>
        {frame.focus?.length > 0 && (
          <div className="timeline-segment-focus">Focus: {frame.focus.join(" -> ")}</div>
        )}
        {frame.explanation && <p className="timeline-segment-body">{frame.explanation}</p>}
      </div>
    </div>
  );
}

function LearnPanel() {
  const cards = [
    {
      id: "bst",
      title: "Shared BST Base",
      intro:
        "Every tree mode in this lab starts from the same binary-search-tree contract: each node has one value, a left child for smaller values, and a right child for larger values.",
      how: [
        "Insert walks the search path until an empty slot is found.",
        "Delete handles leaf removal, single-child bypass, or in-order successor replacement.",
      ],
      why: [
        "Keeps behavior consistent across BST, AVL, and Red-Black modes.",
        "Algorithm differences are easier to compare when balancing logic is layered.",
      ],
    },
    {
      id: "avl",
      title: "AVL Layer",
      intro:
        "AVL augments each node with height metadata and restores strict balance after updates so lookups stay predictably fast.",
      how: [
        "Subtree heights are recalculated bottom-up after each update.",
        "Balance factor (left minus right height) is strictly maintained.",
        "Imbalances are fixed using single or double rotations (LL, RR, LR, RL).",
      ],
      why: [
        "Maintains tighter balance than Red-Black, improving lookup consistency.",
        "The timeline highlights precisely where and why each rotation happens.",
      ],
    },
    {
      id: "rb",
      title: "Red-Black Layer",
      intro:
        "Red-Black trees use node color rules instead of explicit height factors to keep tree height logarithmic with fewer rotations on average.",
      how: [
        "Insertions begin with a red node; fix-up rules resolve violations through recolors and rotations.",
        "Enforces invariants: black root, no adjacent red nodes, equal black height paths.",
      ],
      why: [
        "Often performs fewer rebalances during mixed insert/delete workloads.",
        "Case-by-case trace frames make color flips easy to follow.",
      ],
    },
    {
      id: "timeline",
      title: "Animation & Replay",
      intro:
        "Each structural operation is captured as an ordered frame sequence so you can inspect state transitions instead of only final results.",
      how: [
        "The scrubber maps one-to-one to recorded frames.",
        "Play/Pause, Prev/Next, and Replay let you inspect quickly or frame-by-frame.",
        "Operation history stores prior traces to replay specific inserts/deletes later.",
      ],
      why: [
        "Replay-first interaction turns balancing into a debuggable process.",
        "You can visually compare identical value sequences across the different tree variants.",
      ],
    },
  ];

  return (
    <div className="learn-container">
      <header className="learn-header">
        <h2>Core Concepts</h2>
        <p>Understand the foundational mechanics and architectural differences behind tree variants.</p>
      </header>
      <section className="learn-grid">
        {cards.map((card, index) => (
          <article key={card.title} className={`learn-card theme-${card.id}`}>
            <div className="card-glass-layer" />
            <div className="card-content">
              <div className="card-header">
                <span className="card-number">0{index + 1}</span>
                <h3>{card.title}</h3>
              </div>
              <p className="learn-card-intro">{card.intro}</p>

              <div className="card-body">
                <div className="card-section">
                  <h4>How it works</h4>
                  <ul>
                    {card.how.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
                <div className="card-section">
                  <h4>Why it matters</h4>
                  <ul>
                    {card.why.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function ConceptSwitcher({ tabs, activeTab, onSwitchTab, className = "" }) {
  return (
    <nav className={`concept-switcher ${className}`.trim()} aria-label="Tree concept switcher" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onSwitchTab(tab.key)}
          className={`switcher-btn ${activeTab === tab.key ? "active" : ""}`}
          role="tab"
          aria-selected={activeTab === tab.key}
          aria-controls={`panel-${tab.key}`}
          id={`switch-${tab.key}`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function TreeWorkspace({
  type,
  root,
  onRoot,
  onHistory,
  history,
  session,
  onSessionChange,
}) {
  const config = TREE_CONFIG[type];

  const [input, setInput] = useState("");
  const [message, setMessage] = useState({ ok: true, text: "Preloaded with 11 nodes" });
  const [pathSet, setPathSet] = useState(new Set());
  const [foundValue, setFoundValue] = useState(null);
  const [traversal, setTraversal] = useState({ name: "", values: [], index: -1 });

  const [timelineState, setTimelineState] = useState({
    frames: [],
    index: 0,
    playing: false,
  });
  const [timelineSpeed, setTimelineSpeed] = useState(1);
  const [operationHistory, setOperationHistory] = useState([]);
  const [selectedOperationId, setSelectedOperationId] = useState(null);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredTimelineSegment, setHoveredTimelineSegment] = useState(null);

  const dragRef = useRef({ active: false, startX: 0, startY: 0, panX: 0, panY: 0 });
  const canvasRef = useRef(null);
  const resizeTimeoutRef = useRef(null);
  const traversalTimerRef = useRef(null);
  const previousLayoutRef = useRef(null);
  const transitionRafRef = useRef(null);
  const operationIdRef = useRef(1);
  const hasTypeInitializedRef = useRef(false);
  const restoredTypeRef = useRef(null);
  const speedMenuRef = useRef(null);
  const historySignature = useMemo(() => getHistorySignature(history), [history]);

  const [transitionState, setTransitionState] = useState(null);

  const snapZoomValue = useCallback((value) => {
    const bounded = clamp(value, 0.1, 4);
    return parseFloat((Math.round(bounded * 20) / 20).toFixed(2));
  }, []);

  const snapPanPoint = useCallback((point) => ({ x: Math.round(point.x), y: Math.round(point.y) }), []);

  const renderedZoom = useMemo(() => snapZoomValue(zoom), [zoom, snapZoomValue]);
  const renderedPan = useMemo(() => snapPanPoint(pan), [pan, snapPanPoint]);

  const timelineFrame = timelineState.frames[timelineState.index] ?? null;
  const visualRoot = timelineFrame?.root ?? root;
  const frameFocusSet = useMemo(() => new Set(timelineFrame?.focus ?? []), [timelineFrame]);
  const frameFocusIndex = useMemo(() => {
    const map = new Map();
    (timelineFrame?.focus ?? []).forEach((value, idx) => {
      if (!map.has(value)) map.set(value, idx);
    });
    return map;
  }, [timelineFrame]);

  const frameKindMeta = getFrameKindMeta(timelineFrame?.kind);
  const frameExplanation =
    timelineFrame?.explanation ||
    (timelineState.frames.length
      ? "No additional explanation provided for this frame."
      : "Run an insert/delete operation to capture a replay timeline.");

  const selectedOperation = useMemo(
    () => operationHistory.find((entry) => entry.id === selectedOperationId) ?? null,
    [operationHistory, selectedOperationId],
  );

  const layoutOptions = useMemo(
    () => ({
      nodeRadius: NODE_RADIUS,
      verticalGap: 64,
      padding: 44,
      horizontalSlot: NODE_RADIUS * 2 + 16,
    }),
    [],
  );

  const currentLayout = useMemo(() => layoutTree(visualRoot, layoutOptions), [visualRoot, layoutOptions]);

  const fitCanvas = useCallback(() => {
    if (!currentLayout || !canvasRef.current) return;

    const svgWidth = canvasRef.current.clientWidth || 760;
    const svgHeight = canvasRef.current.clientHeight || 540;

    const nextZoom = snapZoomValue(
      Math.min(1.45, (svgWidth - 24) / currentLayout.width, (svgHeight - 24) / currentLayout.height),
    );

    setZoom(nextZoom);
    setPan(snapPanPoint({
      x: Math.max(0, (svgWidth - currentLayout.width * nextZoom) / 2),
      y: Math.max(14, (svgHeight - currentLayout.height * nextZoom) / 2),
    }));
  }, [currentLayout, snapPanPoint, snapZoomValue]);

  const handleCanvasWheel = useCallback((event) => {
    event.preventDefault();

    const isPinchGesture = event.ctrlKey || event.metaKey;

    if (isPinchGesture) {
      const svg = canvasRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;

      setZoom((currentZoom) => {
        const zoomFactor = event.deltaY < 0 ? 1.08 : 0.92;
        const nextZoom = snapZoomValue(currentZoom * zoomFactor);

        setPan((currentPan) => {
          const worldX = (pointerX - currentPan.x) / currentZoom;
          const worldY = (pointerY - currentPan.y) / currentZoom;

          return snapPanPoint({
            x: pointerX - worldX * nextZoom,
            y: pointerY - worldY * nextZoom,
          });
        });

        return nextZoom;
      });

      return;
    }

    setPan((currentPan) =>
      snapPanPoint({
        x: currentPan.x - event.deltaX,
        y: currentPan.y - event.deltaY,
      }),
    );
  }, [snapPanPoint, snapZoomValue]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const onWheel = (event) => {
      handleCanvasWheel(event);
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [handleCanvasWheel]);

  useEffect(() => {
    fitCanvas();
  }, [fitCanvas]);

  useEffect(() => {
    if (!canvasRef.current) return undefined;

    const observer = new ResizeObserver(() => {
      setIsResizing(true);
      fitCanvas();

      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = setTimeout(() => {
        setIsResizing(false);
      }, 100);
    });

    observer.observe(canvasRef.current);
    return () => {
      observer.disconnect();
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
    };
  }, [fitCanvas]);

  useEffect(() => {
    if (!speedMenuOpen) return undefined;

    const closeIfOutside = (event) => {
      if (!speedMenuRef.current?.contains(event.target)) {
        setSpeedMenuOpen(false);
      }
    };

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setSpeedMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", closeIfOutside);
    document.addEventListener("touchstart", closeIfOutside);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeIfOutside);
      document.removeEventListener("touchstart", closeIfOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [speedMenuOpen]);

  useEffect(
    () => () => {
      if (traversalTimerRef.current) clearInterval(traversalTimerRef.current);
      if (transitionRafRef.current) cancelAnimationFrame(transitionRafRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!timelineState.playing) return;
    if (!timelineState.frames.length) return;
    if (timelineState.index >= timelineState.frames.length - 1) {
      setTimelineState((prev) => ({ ...prev, playing: false }));
      return;
    }

    const delay = Math.max(110, 760 / timelineSpeed);
    const timer = setTimeout(() => {
      setTimelineState((prev) => ({
        ...prev,
        index: Math.min(prev.index + 1, prev.frames.length - 1),
      }));
    }, delay);

    return () => clearTimeout(timer);
  }, [timelineState, timelineSpeed]);

  useEffect(() => {
    const previous = previousLayoutRef.current;
    if (!previous) {
      previousLayoutRef.current = currentLayout;
      return;
    }

    if (previous === currentLayout) return;

    if (transitionRafRef.current) cancelAnimationFrame(transitionRafRef.current);

    const start = performance.now();
    const duration = Math.max(130, 420 / timelineSpeed);

    const animate = (now) => {
      const raw = clamp((now - start) / duration, 0, 1);
      const eased = easeInOutQuad(raw);
      setTransitionState({ from: previous, to: currentLayout, progress: eased });

      if (raw < 1) {
        transitionRafRef.current = requestAnimationFrame(animate);
      } else {
        setTransitionState(null);
        previousLayoutRef.current = currentLayout;
        transitionRafRef.current = null;
      }
    };

    setTransitionState({ from: previous, to: currentLayout, progress: 0 });
    transitionRafRef.current = requestAnimationFrame(animate);

    return () => {
      if (transitionRafRef.current) cancelAnimationFrame(transitionRafRef.current);
    };
  }, [currentLayout, timelineSpeed]);

  useEffect(() => {
    const resetTransientStates = () => {
      if (traversalTimerRef.current) {
        clearInterval(traversalTimerRef.current);
        traversalTimerRef.current = null;
      }

      previousLayoutRef.current = null;
      setTransitionState(null);
      setPathSet(new Set());
      setFoundValue(null);
      setTraversal({ name: "", values: [], index: -1 });
    };

    const buildSeedSession = () => {
      const replayValues = [...history];
      if (!replayValues.length) {
        return {
          ...createEmptySession(),
          historySignature,
        };
      }

      const targetConfig = TREE_CONFIG[type];
      let replayRoot = null;
      const operationHistory = [];

      replayValues.forEach((value, index) => {
        const path = searchPath(replayRoot, value).path;
        const trace = targetConfig.traceInsert(replayRoot, value);
        const actionLabel = "Insert";
        const frames = buildTimeline({
          beforeRoot: replayRoot,
          path,
          traceFrames: trace.frames,
          afterRoot: trace.root,
          actionLabel,
          value,
        });

        const id = `seed-${index}-${Date.now()}-${type.toLowerCase()}`;

        operationHistory.unshift({
          id,
          title: `${actionLabel} ${value}`,
          summary: summarizeFrames(frames, `Inserted ${value}.`),
          frames,
          timeLabel: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        });

        replayRoot = trace.root;
      });

      const selectedOp = operationHistory[0] || {};

      return {
        operationHistory: operationHistory.slice(0, 30),
        selectedOperationId: selectedOp.id || null,
        timelineState: {
          frames: selectedOp.frames || [],
          index: selectedOp.frames ? selectedOp.frames.length - 1 : 0,
          playing: false,
        },
        timelineSpeed: 1,
        zoom: 1,
        pan: { x: 0, y: 0 },
        historySignature,
      };
    };

    const applySession = (nextSession) => {
      const normalized = sanitizePersistedSession(nextSession);
      setOperationHistory(normalized.operationHistory);
      setSelectedOperationId(normalized.selectedOperationId);
      setTimelineState(normalized.timelineState);
      setTimelineSpeed(normalized.timelineSpeed);
      setZoom(normalized.zoom);
      setPan(normalized.pan);
    };

    const initializeForType = () => {
      resetTransientStates();

      const normalized = sanitizePersistedSession(session);
      const canRestore =
        normalized.operationHistory.length > 0 &&
        normalized.timelineState.frames.length > 0 &&
        normalized.historySignature === historySignature;

      if (canRestore) {
        applySession(normalized);
        restoredTypeRef.current = type;
        setMessage({ ok: true, text: `Restored ${config.shortLabel} timeline state.` });
        return;
      }

      const seed = buildSeedSession();
      applySession(seed);
      restoredTypeRef.current = type;

      if (!history.length) {
        setMessage({ ok: true, text: `${config.shortLabel} is empty.` });
      } else {
        setMessage({ ok: true, text: `Loaded ${history.length} values into ${config.shortLabel}.` });
      }
    };

    if (!hasTypeInitializedRef.current) {
      initializeForType();
      hasTypeInitializedRef.current = true;
      return;
    }

    initializeForType();
  }, [type]);

  useEffect(() => {
    if (!hasTypeInitializedRef.current) return;
    if (restoredTypeRef.current !== type) return;

    const timelineMax = Math.max(0, timelineState.frames.length - 1);
    const safeIndex = clamp(timelineState.index, 0, timelineMax);
    const safeSelectedOperationId = operationHistory.some((entry) => entry.id === selectedOperationId)
      ? selectedOperationId
      : operationHistory[0]?.id ?? null;

    onSessionChange({
      operationHistory: operationHistory.map(cloneOperation),
      selectedOperationId: safeSelectedOperationId,
      timelineState: {
        frames: timelineState.frames.map(cloneFrame),
        index: safeIndex,
        playing: false,
      },
      timelineSpeed,
      zoom,
      pan,
      historySignature,
    });
  }, [type, operationHistory, selectedOperationId, timelineState, timelineSpeed, zoom, pan, historySignature, onSessionChange]);

  const animatedGraph = useMemo(() => {
    if (!currentLayout) return null;
    if (!transitionState) return interpolateLayout(currentLayout, currentLayout, 1);
    return interpolateLayout(transitionState.from, transitionState.to, transitionState.progress);
  }, [currentLayout, transitionState]);

  const animatedNodeMap = useMemo(() => {
    const map = new Map();
    for (const nodeMeta of animatedGraph?.nodes ?? []) {
      map.set(nodeMeta.value, nodeMeta);
    }
    return map;
  }, [animatedGraph]);

  const focusEdgeKeys = useMemo(() => {
    const focus = timelineFrame?.focus ?? [];
    if (focus.length < 2) return new Set();
    return new Set([`${focus[0]}->${focus[1]}`, `${focus[1]}->${focus[0]}`]);
  }, [timelineFrame]);

  const focusConnector = useMemo(() => {
    const focus = timelineFrame?.focus ?? [];
    if (focus.length < 2) return null;
    const from = animatedNodeMap.get(focus[0]);
    const to = animatedNodeMap.get(focus[1]);
    if (!from || !to) return null;
    return { from, to };
  }, [timelineFrame, animatedNodeMap]);

  const currentTraversalValue =
    traversal.index >= 0 && traversal.index < traversal.values.length
      ? traversal.values[traversal.index]
      : null;

  const visitedTraversalValues = useMemo(
    () => new Set(traversal.values.slice(0, Math.max(0, traversal.index))),
    [traversal.values, traversal.index],
  );

  const setOk = (text) => setMessage({ ok: true, text });
  const setError = (text) => setMessage({ ok: false, text });

  const showTimelineSegmentTooltip = useCallback(
    ({ frame, index, clientX, clientY }) => {
      const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;
      const tooltipHalfWidth = 176;
      const safeX = viewportWidth
        ? clamp(clientX, tooltipHalfWidth, Math.max(tooltipHalfWidth, viewportWidth - tooltipHalfWidth))
        : clientX;

      setHoveredTimelineSegment({
        frame,
        index,
        total: timelineState.frames.length,
        x: safeX,
        y: clientY - 8,
      });
    },
    [timelineState.frames.length],
  );

  const hideTimelineSegmentTooltip = useCallback(() => {
    setHoveredTimelineSegment(null);
  }, []);

  useEffect(() => {
    if (!timelineState.frames.length) {
      setHoveredTimelineSegment(null);
    }
  }, [timelineState.frames.length]);

  const clearSearch = () => {
    setPathSet(new Set());
    setFoundValue(null);
  };

  const stopTraversal = useCallback(() => {
    if (traversalTimerRef.current) {
      clearInterval(traversalTimerRef.current);
      traversalTimerRef.current = null;
    }
    setTraversal({ name: "", values: [], index: -1 });
  }, []);

  const startTimeline = (frames, autoplay = true) => {
    if (!frames.length) {
      setTimelineState({ frames: [], index: 0, playing: false });
      return;
    }

    setTimelineState({
      frames,
      index: 0,
      playing: autoplay && frames.length > 1,
    });
  };

  const registerOperation = ({ title, summary, frames }) => {
    const id = `op-${Date.now()}-${operationIdRef.current}`;
    operationIdRef.current += 1;

    const timeLabel = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const entry = { id, title, summary, frames, timeLabel };

    setOperationHistory((prev) => [entry, ...prev].slice(0, 30));
    setSelectedOperationId(id);
    startTimeline(frames, true);
  };

  const loadOperation = (id, autoplay = false) => {
    const entry = operationHistory.find((candidate) => candidate.id === id);
    if (!entry) return;

    stopTraversal();
    clearSearch();
    setSelectedOperationId(entry.id);
    setTimelineState({
      frames: entry.frames,
      index: 0,
      playing: autoplay && entry.frames.length > 1,
    });
    setOk(`Loaded replay: ${entry.title}`);
  };

  const jumpToFrame = (index) => {
    setTimelineState((prev) => {
      if (!prev.frames.length) return prev;
      return {
        ...prev,
        playing: false,
        index: clamp(index, 0, prev.frames.length - 1),
      };
    });
  };

  const parseInput = () => {
    const value = Number.parseInt(input, 10);
    return Number.isNaN(value) ? null : value;
  };

  const isTimelinePlaying = timelineState.playing;
  const timelineHasFrames = timelineState.frames.length > 0;

  const runInsert = (value, random = false) => {
    const beforeRoot = root;
    const path = searchPath(beforeRoot, value).path;
    const trace = config.traceInsert(beforeRoot, value);
    const afterRoot = trace.root;

    if (treeSize(afterRoot) === treeSize(beforeRoot)) return false;

    clearSearch();
    stopTraversal();

    onRoot(afterRoot);
    onHistory((prev) => [...prev, value]);

    const actionLabel = random ? "Random insert" : "Insert";
    const frames = buildTimeline({
      beforeRoot,
      path,
      traceFrames: trace.frames,
      afterRoot,
      actionLabel,
      value,
    });

    registerOperation({
      title: `${actionLabel} ${value}`,
      summary: summarizeFrames(frames, `Inserted ${value}.`),
      frames,
    });

    setOk(`${random ? "Randomly inserted" : "Inserted"} ${value}.`);
    return true;
  };

  const onInsert = () => {
    const value = parseInput();
    if (value === null) return setError("Enter an integer first.");

    const changed = runInsert(value, false);
    if (!changed) return setError(`${value} already exists.`);

    setInput("");
  };

  const onDelete = () => {
    const value = parseInput();
    if (value === null) return setError("Enter an integer first.");

    const beforeRoot = root;
    const path = searchPath(beforeRoot, value).path;
    const trace = config.traceRemove(beforeRoot, value);
    const afterRoot = trace.root;

    if (treeSize(afterRoot) === treeSize(beforeRoot)) return setError(`${value} was not found.`);

    clearSearch();
    stopTraversal();

    onRoot(afterRoot);
    onHistory((prev) => prev.filter((entry) => entry !== value));

    const frames = buildTimeline({
      beforeRoot,
      path,
      traceFrames: trace.frames,
      afterRoot,
      actionLabel: "Delete",
      value,
    });

    registerOperation({
      title: `Delete ${value}`,
      summary: summarizeFrames(frames, `Deleted ${value}.`),
      frames,
    });

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
    const allValues = new Set(inOrder(root));
    if (allValues.size >= 199) return setError("All values from 1 to 199 already exist.");

    let value;
    do value = Math.floor(Math.random() * 199) + 1;
    while (allValues.has(value));

    runInsert(value, true);
  };

  const onClearAll = () => {
    clearSearch();
    stopTraversal();

    const frames = buildTimeline({
      beforeRoot: root,
      path: [],
      traceFrames: [{ root: null, label: "Cleared tree", focus: [], kind: "delete", explanation: "All nodes removed." }],
      afterRoot: null,
      actionLabel: "Clear",
    });

    onRoot(null);
    onHistory([]);
    registerOperation({
      title: "Clear tree",
      summary: "All nodes removed from the tree.",
      frames,
    });
    setOk("Tree cleared.");
  };

  const startTraversal = (name, runner) => {
    if (isTimelinePlaying) return;

    const sequence = runner(root);
    if (!sequence.length) return setError("Tree is empty.");

    clearSearch();
    stopTraversal();

    setTraversal({ name, values: sequence, index: 0 });

    let idx = 0;
    traversalTimerRef.current = setInterval(() => {
      idx += 1;
      if (idx >= sequence.length) {
        clearInterval(traversalTimerRef.current);
        traversalTimerRef.current = null;
        setTraversal((prev) => ({ ...prev, index: sequence.length }));
      } else {
        setTraversal((prev) => ({ ...prev, index: idx }));
      }
    }, 620);
  };

  const timelineBack = () => {
    if (!timelineHasFrames) return;
    setTimelineState((prev) => ({
      ...prev,
      playing: false,
      index: clamp(prev.index - 1, 0, prev.frames.length - 1),
    }));
  };

  const timelineNext = () => {
    if (!timelineHasFrames) return;
    setTimelineState((prev) => ({
      ...prev,
      playing: false,
      index: clamp(prev.index + 1, 0, prev.frames.length - 1),
    }));
  };

  const toggleTimelinePlay = () => {
    if (!timelineHasFrames) return;

    setTimelineState((prev) => {
      if (prev.index >= prev.frames.length - 1) {
        return { ...prev, index: 0, playing: true };
      }
      return { ...prev, playing: !prev.playing };
    });
  };

  const replayTimeline = () => {
    if (!timelineHasFrames) return;
    setTimelineState((prev) => ({ ...prev, index: 0, playing: prev.frames.length > 1 }));
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

  const getNodePalette = (nodeMeta) => {
    const value = nodeMeta.value;
    const node = nodeMeta.node;

    if (foundValue === value) return { fill: "#FACC15", stroke: "#A16207", text: "#1F1302" };
    if (pathSet.has(value)) return { fill: "#FDE68A", stroke: "#B45309", text: "#6B3410" };
    if (currentTraversalValue === value) return { fill: "#818CF8", stroke: "#3730A3", text: "#FFFFFF" };
    if (visitedTraversalValues.has(value)) return { fill: "#C7D2FE", stroke: "#4338CA", text: "#1E1B4B" };

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

  const extraMetric = config.extraMetric(root);
  return (
    <section className="workspace">
      <div
        className={`workspace-layout ${leftSidebarOpen ? "" : "left-sidebar-collapsed"} ${
          rightSidebarOpen ? "" : "right-sidebar-collapsed"
        }`.trim()}
      >
        <aside className={`control-sidebar ${leftSidebarOpen ? "" : "collapsed"}`.trim()} aria-label="Control panel">
          <section className="sidebar-section">
            <div className="section-heading-row">
              <h2>Actions</h2>
            </div>

            <label htmlFor="tree-value-input" className="input-label">Value</label>
            <input
              id="tree-value-input"
              value={input}
              type="number"
              placeholder="integer"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && onInsert()}
              className="value-input"
              disabled={isTimelinePlaying}
            />

            <div className="action-grid">
              <ActionButton variant="success" onClick={onInsert} disabled={isTimelinePlaying} icon={Plus}>Insert</ActionButton>
              <ActionButton variant="danger" onClick={onDelete} disabled={isTimelinePlaying} icon={Trash2}>Delete</ActionButton>
              <ActionButton onClick={onSearch} disabled={isTimelinePlaying} icon={Search}>Search</ActionButton>
              <ActionButton onClick={onClearAll} disabled={isTimelinePlaying} icon={Trash}>Clear All</ActionButton>
            </div>

            <details className="secondary-actions sidebar-secondary">
              <summary>More actions</summary>
              <div className="secondary-actions-body">
                <ActionButton
                  onClick={() =>
                    treeMin(root) === null
                      ? setError("Tree is empty.")
                      : setOk(`Minimum: ${treeMin(root)}`)
                  }
                  disabled={isTimelinePlaying}
                  icon={ArrowDownToLine}
                >
                  Min
                </ActionButton>
                <ActionButton
                  onClick={() =>
                    treeMax(root) === null
                      ? setError("Tree is empty.")
                      : setOk(`Maximum: ${treeMax(root)}`)
                  }
                  disabled={isTimelinePlaying}
                  icon={ArrowUpToLine}
                >
                  Max
                </ActionButton>
                <ActionButton onClick={onRandomInsert} disabled={isTimelinePlaying} icon={Dices}>Random</ActionButton>
                <ActionButton onClick={clearSearch} icon={Eraser}>Clear Highlight</ActionButton>
              </div>
            </details>

            <span className={`status-pill ${message.ok ? "good" : "bad"}`}>{message.text}</span>
          </section>

          <section className="sidebar-section">
            <div className="section-heading-row">
              <h2>Traverse</h2>
            </div>

            <div className="traverse-grid">
              {TRAVERSALS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => startTraversal(option.label, option.run)}
                  className={`chip ${traversal.name === option.label ? "active" : ""}`}
                  disabled={isTimelinePlaying}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {traversal.values.length > 0 && (
              <span className="sequence-readout sidebar-readout">
                {traversal.name}:{" "}
                {traversal.values.map((value, idx) => (idx === traversal.index ? `[${value}]` : value)).join(", ")}
              </span>
            )}
          </section>

          <section className="sidebar-section legend-section">
             <div className="section-heading-row legend-heading-row">
              <h2>Legend</h2>
            </div>
            <div className="legend-list">
              <span className="legend-group-label">Node Colors</span>
              {typeLegend.map((entry) => (
                <LegendDot key={entry.label} fill={entry.fill} stroke={entry.stroke} label={entry.label} />
              ))}

              <span className="legend-group-label legend-group-separator">Search / Traversal</span>
              <LegendDot fill="#FDE68A" stroke="#B45309" label="Search path" />
              <LegendDot fill="#FACC15" stroke="#A16207" label="Search hit" />
              <LegendDot fill="#C7D2FE" stroke="#4338CA" label="Traversal visited" />
              <LegendDot fill="#818CF8" stroke="#3730A3" label="Traversal current" />

              <span className="legend-group-label legend-group-separator">Timeline Highlights</span>
              <LegendDot fill="#dbeafe" stroke="#1d4ed8" ring="#2563eb" label="Rotation focus" />
              <LegendDot fill="#ede9fe" stroke="#6d28d9" ring="#7c3aed" label="Case detection" />
              <LegendDot fill="#fee2e2" stroke="#b91c1c" ring="#dc2626" label="Color flip / recolor" />
              <LegendDot fill="#dcfce7" stroke="#065f46" ring="#16a34a" label="Insert / complete" />
              <LegendDot fill="#fef3c7" stroke="#92400e" ring="#d97706" label="Delete / replace" />
            </div>
          </section>
        </aside>

        <section className="canvas-stage" aria-label="Tree visualization">
          <div className="canvas-overlay stats-overlay-group">
            <button
              type="button"
              className="sidebar-toggle-btn canvas-top-btn icon-toggle"
              aria-label={leftSidebarOpen ? "Hide left sidebar" : "Show left sidebar"}
              aria-expanded={leftSidebarOpen}
              onClick={() => setLeftSidebarOpen((value) => !value)}
            >
              <span aria-hidden="true" className="toggle-icon">
                {leftSidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
              </span>
            </button>

            <div className="stats-overlay" aria-label="Tree statistics">
              <span>Nodes: <b>{treeSize(root)}</b></span>
              <span>Leaves: <b>{treeLeavesCount(root)}</b></span>
              <span>Internal: <b>{treeInternalNodesCount(root)}</b></span>
              <span>Height: <b>{treeHeight(root)}</b></span>
              <span>Min: <b>{treeMin(root) ?? "-"}</b></span>
              <span>Max: <b>{treeMax(root) ?? "-"}</b></span>
              {extraMetric && <span>{extraMetric}</span>}
            </div>
          </div>

          <div className="canvas-overlay right-sidebar-overlay">
            <button
              type="button"
              className="sidebar-toggle-btn canvas-top-btn icon-toggle"
              aria-label={rightSidebarOpen ? "Hide right sidebar" : "Show right sidebar"}
              aria-expanded={rightSidebarOpen}
              onClick={() => setRightSidebarOpen((value) => !value)}
            >
              <span aria-hidden="true" className="toggle-icon">
                {rightSidebarOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
              </span>
            </button>
          </div>

          <div className="zoom-controls vertical" role="group" aria-label="Zoom controls">
            <button
              type="button"
              onClick={() => setZoom((value) => snapZoomValue(value * 1.2))}
              aria-label="Zoom in"
            >
              <ZoomIn size={14} className="btn-icon" />
            </button>
            <span>{Math.round(renderedZoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((value) => snapZoomValue(value / 1.2))}
              aria-label="Zoom out"
            >
              <ZoomOut size={14} className="btn-icon" />
            </button>
            <button type="button" onClick={fitCanvas} aria-label="Fit tree to canvas">
              <Maximize size={14} className="btn-icon" />
            </button>
          </div>

          <div className="canvas-shell">
            {!visualRoot && <div className="empty-state">Tree is empty. Insert a value to start.</div>}

            <svg
              ref={canvasRef}
              width="100%"
              height="100%"
              className="tree-canvas"
              onMouseDown={(event) => {
                dragRef.current = {
                  active: true,
                  startX: event.clientX,
                  startY: event.clientY,
                  panX: pan.x,
                  panY: pan.y,
                };
                setIsDragging(true);
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
                setIsDragging(false);
              }}
              onMouseLeave={() => {
                dragRef.current.active = false;
                setIsDragging(false);
              }}
            >
              <g
                className={`canvas-zoom-layer ${isDragging || isResizing ? "dragging" : ""}`}
                transform={`translate(${renderedPan.x},${renderedPan.y}) scale(${renderedZoom})`}
              >
                {animatedGraph?.edges.map((edge) => {
                  const dx = edge.to.x - edge.from.x;
                  const dy = edge.to.y - edge.from.y;
                  const distance = Math.hypot(dx, dy);
                  const nx = dx / distance;
                  const ny = dy / distance;
                  const isFocusEdge = focusEdgeKeys.has(edge.key);

                  return (
                    <line
                      key={edge.key}
                      x1={edge.from.x + nx * NODE_RADIUS}
                      y1={edge.from.y + ny * NODE_RADIUS}
                      x2={edge.to.x - nx * NODE_RADIUS}
                      y2={edge.to.y - ny * NODE_RADIUS}
                      className={`tree-edge ${isFocusEdge ? `tone-${frameKindMeta.tone}` : ""}`}
                      strokeWidth={isFocusEdge ? 2.7 : 1.5}
                      opacity={edge.opacity}
                    />
                  );
                })}

                {focusConnector && (
                  <line
                    x1={focusConnector.from.x}
                    y1={focusConnector.from.y}
                    x2={focusConnector.to.x}
                    y2={focusConnector.to.y}
                    className={`focus-link tone-${frameKindMeta.tone}`}
                  />
                )}

                {animatedGraph?.nodes.map((nodeMeta) => {
                  const palette = getNodePalette(nodeMeta);
                  const bf = type === "AVL" ? (nodeMeta.node.left?.h ?? 0) - (nodeMeta.node.right?.h ?? 0) : null;
                  const focusIdx = frameFocusIndex.get(nodeMeta.value);
                  const isFocused = frameFocusSet.has(nodeMeta.value);
                  const isPrimary = focusIdx === 0;
                  const kind = timelineFrame?.kind;

                  // Determine ring color per frame kind for more accurate highlighting
                  const ringColor = isFocused ? (
                    kind === "rotation" || kind === "rotation-result" ? "#2563eb" :
                    kind === "case" ? "#7c3aed" :
                    kind === "color-flip" || kind === "color-flip-result" ? "#dc2626" :
                    kind === "root-recolor" ? "#dc2626" :
                    kind === "insert" ? "#16a34a" :
                    kind === "delete" || kind === "replace" ? "#d97706" :
                    kind === "visit" ? "#64748b" :
                    kind === "done" ? "#16a34a" :
                    "#64748b"
                  ) : null;

                  return (
                    <g key={nodeMeta.value} opacity={nodeMeta.opacity}>
                      {/* Outer glow halo for PRIMARY focused node */}
                      {isFocused && isPrimary && (
                        <circle
                          cx={nodeMeta.x}
                          cy={nodeMeta.y}
                          r={NODE_RADIUS + 14}
                          fill="none"
                          stroke={ringColor}
                          strokeWidth="1.2"
                          opacity="0.3"
                          className="focus-halo"
                        />
                      )}

                      {/* Main focus ring */}
                      {isFocused && (
                        <circle
                          cx={nodeMeta.x}
                          cy={nodeMeta.y}
                          r={isPrimary ? NODE_RADIUS + 9 : NODE_RADIUS + 7}
                          fill="none"
                          stroke={ringColor}
                          className={`focus-ring tone-${frameKindMeta.tone}`}
                        />
                      )}

                      {currentTraversalValue === nodeMeta.value && (
                        <circle
                          cx={nodeMeta.x}
                          cy={nodeMeta.y}
                          r={NODE_RADIUS + 5}
                          fill="none"
                          stroke="#6366F1"
                          strokeWidth="2.4"
                          opacity="0.8"
                        />
                      )}

                      <circle
                        cx={nodeMeta.x}
                        cy={nodeMeta.y}
                        r={NODE_RADIUS}
                        fill={palette.fill}
                        stroke={palette.stroke}
                        strokeWidth="1.6"
                        className="tree-node"
                      />

                      <text
                        x={nodeMeta.x}
                        y={bf === null ? nodeMeta.y : nodeMeta.y - 5}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="node-label"
                        fill={palette.text}
                      >
                        {nodeMeta.value}
                      </text>

                      {bf !== null && (
                        <text
                          x={nodeMeta.x}
                          y={nodeMeta.y + 10}
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="node-sub-label"
                          fill={palette.stroke}
                        >
                          {bf > 0 ? "+" : ""}
                          {bf}
                        </text>
                      )}

                      {/* Invisible larger hit-area for hover */}
                      <circle
                        cx={nodeMeta.x}
                        cy={nodeMeta.y}
                        r={NODE_RADIUS + 6}
                        fill="transparent"
                        stroke="none"
                        style={{ cursor: "pointer" }}
                        onMouseEnter={() => {
                          if (isDragging) return;
                          setHoveredNode({
                            value: nodeMeta.value,
                            node: nodeMeta.node,
                            x: nodeMeta.x,
                            y: nodeMeta.y,
                          });
                        }}
                        onMouseLeave={() => setHoveredNode(null)}
                      />
                    </g>
                  );
                })}
              </g>
            </svg>

            <NodeTooltip
              hoveredNode={hoveredNode}
              treeType={type}
              timelineFrame={timelineFrame}
              frameFocusSet={frameFocusSet}
              pathSet={pathSet}
              foundValue={foundValue}
              traversal={traversal}
              pan={renderedPan}
              zoom={renderedZoom}
              canvasRef={canvasRef}
            />
          </div>

          <div className="playback-dock" role="group" aria-label="Timeline playback controls">
            <div className="timeline-slider-row">
              <div
                className="timeline-splits timeline-splits-track"
                role="group"
                aria-label="Timeline frame segments"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(1, timelineState.frames.length)}, minmax(10px, 1fr))`,
                }}
              >
                {timelineHasFrames ? (
                  timelineState.frames.map((frame, index) => (
                    <button
                      key={`${frame.label}-${index}`}
                      type="button"
                      className={`timeline-split ${
                        index === timelineState.index ? "active" : index < timelineState.index ? "past" : ""
                      }`}
                      onClick={() => jumpToFrame(index)}
                      onMouseEnter={(event) =>
                        showTimelineSegmentTooltip({
                          frame,
                          index,
                          clientX: event.clientX,
                          clientY: event.clientY,
                        })
                      }
                      onMouseMove={(event) =>
                        showTimelineSegmentTooltip({
                          frame,
                          index,
                          clientX: event.clientX,
                          clientY: event.clientY,
                        })
                      }
                      onMouseLeave={hideTimelineSegmentTooltip}
                      onFocus={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        showTimelineSegmentTooltip({
                          frame,
                          index,
                          clientX: rect.left + rect.width / 2,
                          clientY: rect.top,
                        });
                      }}
                      onBlur={hideTimelineSegmentTooltip}
                      aria-label={`Go to frame ${index + 1}: ${frame.label}`}
                      title={`Frame ${index + 1}: ${frame.label}`}
                    />
                  ))
                ) : (
                  <span className="timeline-split inactive" aria-hidden="true" />
                )}
              </div>
            </div>

            <TimelineSegmentTooltip hoveredSegment={hoveredTimelineSegment} />

            <div className="playback-controls-row">
              <ActionButton onClick={timelineBack} disabled={!timelineHasFrames} icon={SkipBack}>Prev</ActionButton>
              <ActionButton onClick={toggleTimelinePlay} disabled={!timelineHasFrames} icon={timelineState.playing ? Pause : Play}>
                {timelineState.playing ? "Pause" : "Play"}
              </ActionButton>
              <ActionButton onClick={timelineNext} disabled={!timelineHasFrames} icon={SkipForward}>Next</ActionButton>
              <ActionButton onClick={replayTimeline} disabled={!timelineHasFrames} icon={RotateCcw}>Replay</ActionButton>

              <div className="speed-dropdown-wrap" ref={speedMenuRef}>
                <span className="speed-label">Speed</span>
                <button
                  type="button"
                  className="speed-dropdown-btn"
                  onClick={() => setSpeedMenuOpen((open) => !open)}
                  aria-expanded={speedMenuOpen}
                  aria-haspopup="listbox"
                  aria-label="Select timeline speed"
                >
                  <span>{timelineSpeed}x</span>
                  <span className="speed-caret" aria-hidden="true"><ChevronDown size={14} /></span>
                </button>
                {speedMenuOpen && (
                  <ul className="speed-dropdown-menu" role="listbox" aria-label="Timeline speed options">
                    {SPEED_OPTIONS.map((speed) => (
                      <li key={speed}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={timelineSpeed === speed}
                          className={`speed-option-btn ${timelineSpeed === speed ? "active" : ""}`}
                          onClick={() => {
                            setTimelineSpeed(speed);
                            setSpeedMenuOpen(false);
                          }}
                        >
                          {speed}x
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <span className="sequence-readout compact">
                {timelineHasFrames
                  ? `Frame ${timelineState.index + 1}/${timelineState.frames.length}`
                  : "No modification timeline yet."}
              </span>
            </div>
          </div>
        </section>

        <aside className={`replay-sidebar ${rightSidebarOpen ? "" : "collapsed"}`.trim()} aria-label="Timeline and operation history">
          <section className="sidebar-section timeline-details">
            <div className="section-heading-row">
              <h2>Timeline</h2>
              <span className="section-meta">
                {timelineHasFrames
                  ? `Frame ${timelineState.index + 1}/${timelineState.frames.length}`
                  : "No replay yet"}
              </span>
            </div>
            <div className="timeline-topline">
              <span className={`frame-kind-badge tone-${frameKindMeta.tone}`}>{frameKindMeta.label}</span>
              <span className="frame-title">{timelineFrame?.label ?? "Awaiting first operation..."}</span>
            </div>
            {timelineFrame?.focus?.length > 0 && (
              <span className="focus-readout">Focus nodes: {timelineFrame.focus.join(" -> ")}</span>
            )}
            <p className="frame-explanation">{frameExplanation}</p>
          </section>

          <section className="sidebar-section history-sidebar" id="operation-history-list">
            <div className="history-header">
              <span>Operation History ({operationHistory.length})</span>
              <button
                type="button"
                className="history-replay-btn"
                onClick={() => selectedOperation && loadOperation(selectedOperation.id, true)}
                disabled={!selectedOperation}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <RotateCcw size={14} /> Replay
              </button>
            </div>

            {operationHistory.length === 0 ? (
              <p className="history-empty">Insert or delete nodes to build a replayable history.</p>
            ) : (
              <div className="history-list">
                {operationHistory.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`history-item ${selectedOperationId === entry.id ? "active" : ""}`}
                    onClick={() => loadOperation(entry.id, false)}
                  >
                    <span className="history-item-title">{entry.title}</span>
                    <span className="history-item-meta">{entry.timeLabel} | {entry.frames.length} frames</span>
                    <span className="history-item-summary">{entry.summary}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}

export default function App() {
  const persistedRef = useRef(readPersistedState());
  const headerRowRef = useRef(null);
  const headerSwitcherRef = useRef(null);
  const aboutBtnRef = useRef(null);
  const titleRef = useRef(null);

  const [activeTab, setActiveTab] = useState(persistedRef.current.app.activeTab);
  const [treeType, setTreeType] = useState(persistedRef.current.app.treeType);
  const [history, setHistory] = useState(persistedRef.current.app.history);
  const [root, setRoot] = useState(() =>
    buildTree(persistedRef.current.app.history, TREE_CONFIG[persistedRef.current.app.treeType].insert),
  );
  const [sessionsByType, setSessionsByType] = useState(persistedRef.current.sessionsByType);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [useCompactTitle, setUseCompactTitle] = useState(false);

  useEffect(() => {
    writePersistedState({
      version: STORAGE_VERSION,
      app: {
        activeTab,
        treeType,
        history,
      },
      sessionsByType,
    });
  }, [activeTab, treeType, history, sessionsByType]);

  const updateCurrentSession = useCallback(
    (nextSession) => {
      setSessionsByType((prev) => ({
        ...prev,
        [treeType]: sanitizePersistedSession(nextSession),
      }));
    },
    [treeType],
  );

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

  const recalculateHeaderTitle = useCallback(() => {
    const row = headerRowRef.current;
    const switcher = headerSwitcherRef.current;
    const aboutButton = aboutBtnRef.current;
    const titleElement = titleRef.current;

    if (!row || !switcher || !aboutButton || !titleElement) return;

    const rowWidth = row.getBoundingClientRect().width;
    const switcherWidth = Math.max(330, switcher.getBoundingClientRect().width, switcher.scrollWidth);
    const aboutWidth = aboutButton.getBoundingClientRect().width;

    const style = window.getComputedStyle(titleElement);
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    let fullTitleWidth = titleElement.scrollWidth;
    if (context) {
      context.font = font;
      fullTitleWidth = Math.ceil(context.measureText(APP_TITLE_FULL).width);
    }

    const spacingAllowance = 60;
    const requiredWidth = switcherWidth + aboutWidth + fullTitleWidth + spacingAllowance;

    setUseCompactTitle(requiredWidth > rowWidth);
  }, []);

  useEffect(() => {
    recalculateHeaderTitle();

    const observer = new ResizeObserver(() => {
      recalculateHeaderTitle();
    });

    if (headerRowRef.current) observer.observe(headerRowRef.current);
    if (headerSwitcherRef.current) observer.observe(headerSwitcherRef.current);
    if (aboutBtnRef.current) observer.observe(aboutBtnRef.current);

    window.addEventListener("resize", recalculateHeaderTitle);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recalculateHeaderTitle);
    };
  }, [recalculateHeaderTitle]);

  return (
    <>
      <a href="#maincontent" className="skip-link">Skip to main content</a>

      <main id="maincontent" className="app-shell" tabIndex={-1}>
        <header className="app-header">
          <div className="app-header-row" ref={headerRowRef}>
            <div className="app-header-main">
              <h1 ref={titleRef}>{useCompactTitle ? APP_TITLE_COMPACT : APP_TITLE_FULL}</h1>
              <div ref={headerSwitcherRef} className="app-header-switcher-wrap">
                <ConceptSwitcher
                  tabs={tabs}
                  activeTab={activeTab}
                  onSwitchTab={switchTab}
                  className="app-header-switcher"
                />
              </div>
            </div>
            <button
              type="button"
              className="about-btn"
              ref={aboutBtnRef}
              onClick={() => setAboutOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={aboutOpen}
            >
              <Info size={14} /> About
            </button>
          </div>
        </header>

        {activeTab === "learn" ? (
          <section id="panel-learn" role="tabpanel" aria-labelledby="switch-learn" className="learn-panel-shell">
            <LearnPanel />
          </section>
        ) : (
          <section
            id={`panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`switch-${activeTab}`}
            className="tree-panel"
          >
            <TreeWorkspace
              type={treeType}
              root={root}
              onRoot={setRoot}
              onHistory={setHistory}
              history={history}
              session={sessionsByType[treeType]}
              onSessionChange={updateCurrentSession}
            />
          </section>
        )}
      </main>

      {aboutOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setAboutOpen(false)}>
          <section
            className="about-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="about-modal-title">About this playground</h2>
            <p>
              Explore BST, AVL, and Red-Black trees through interactive operations, traversal highlights, and replayable
              structural timelines.
            </p>
            <button type="button" className="btn" onClick={() => setAboutOpen(false)}>Close</button>
          </section>
        </div>
      )}
    </>
  );
}
