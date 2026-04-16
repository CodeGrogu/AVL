import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildTree,
  inOrder,
  inOrderValues,
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
const NODE_RADIUS = 24;

const TRAVERSALS = [
  { key: "pre", label: "Pre-order", run: (root) => preOrder(root) },
  { key: "in", label: "In-order", run: (root) => inOrder(root) },
  { key: "post", label: "Post-order", run: (root) => postOrder(root) },
  { key: "level", label: "Level-order", run: (root) => levelOrder(root) },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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
    focus: value !== undefined ? [value] : [],
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

  const fromEdges = new Set((fromLayout?.edges ?? []).map((edge) => edge.key));
  const toEdges = new Set((toLayout?.edges ?? []).map((edge) => edge.key));
  const edgeKeys = new Set([...fromEdges, ...toEdges]);

  const edges = [];
  for (const key of edgeKeys) {
    const [fromValueRaw, toValueRaw] = key.split("->");
    const fromValue = Number(fromValueRaw);
    const toValue = Number(toValueRaw);

    const source = nodeMap.get(fromValue);
    const target = nodeMap.get(toValue);
    if (!source || !target) continue;

    const opacity = fromEdges.has(key) && toEdges.has(key) ? 1 : fromEdges.has(key) ? 1 - progress : progress;
    edges.push({ key, from: source, to: target, opacity });
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

function ActionButton({ children, onClick, variant = "neutral", disabled = false }) {
  return (
    <button type="button" className={`btn ${variant}`} onClick={onClick} disabled={disabled}>
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
        "One canonical binary node contract (value + left/right).",
        "Search path, traversals, min/max, predecessor/successor are shared.",
        "BST insert/delete form the foundation layer.",
      ],
    },
    {
      title: "AVL Layer",
      points: [
        "Adds only height metadata and rebalancing rotations.",
        "Trace frames expose where each rotation occurs.",
        "Great for strict balancing visualization.",
      ],
    },
    {
      title: "Red-Black Layer",
      points: [
        "Adds color metadata and color/rotation constraints.",
        "Preserves logarithmic height with fewer rotations on average.",
        "Runs on the same base node model.",
      ],
    },
    {
      title: "Animation Controls",
      points: [
        "All structural modifications produce a timeline.",
        "Step forward/backward, pause/play, replay, and change speed.",
        "Smooth interpolation prevents instant visual jumps.",
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
  const [traversal, setTraversal] = useState({ name: "", values: [], index: -1 });

  const [timelineState, setTimelineState] = useState({
    frames: [],
    index: 0,
    playing: false,
  });
  const [timelineSpeed, setTimelineSpeed] = useState(1);
  const [operationHistory, setOperationHistory] = useState([]);
  const [selectedOperationId, setSelectedOperationId] = useState(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const dragRef = useRef({ active: false, startX: 0, startY: 0, panX: 0, panY: 0 });
  const canvasRef = useRef(null);
  const traversalTimerRef = useRef(null);
  const previousLayoutRef = useRef(null);
  const transitionRafRef = useRef(null);
  const operationIdRef = useRef(1);

  const [transitionState, setTransitionState] = useState(null);

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

  const replaySteps = useMemo(
    () =>
      timelineState.frames
        .map((frame, index) => ({ frame, index }))
        .filter(({ frame }) => frame.kind !== "visit"),
    [timelineState.frames],
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
    const svgHeight = 428;

    const nextZoom = parseFloat(
      Math.min(1.45, (svgWidth - 24) / currentLayout.width, (svgHeight - 24) / currentLayout.height).toFixed(3),
    );

    setZoom(nextZoom);
    setPan({
      x: Math.max(0, (svgWidth - currentLayout.width * nextZoom) / 2),
      y: 14,
    });
  }, [currentLayout]);

  useEffect(() => {
    fitCanvas();
  }, [fitCanvas]);

  useEffect(
    () => () => {
      if (traversalTimerRef.current) clearInterval(traversalTimerRef.current);
      if (transitionRafRef.current) cancelAnimationFrame(transitionRafRef.current);
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
    setPathSet(new Set());
    setFoundValue(null);
    setTraversal({ name: "", values: [], index: -1 });
    setTimelineState({ frames: [], index: 0, playing: false });
    setOperationHistory([]);
    setSelectedOperationId(null);
  }, [type]);

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
    const allValues = new Set(inOrderValues(root));
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
    if (frameFocusSet.has(value)) return { fill: "#BAE6FD", stroke: "#0369A1", text: "#0C4A6E" };

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
      <div className="toolbar-row">
        <input
          value={input}
          type="number"
          placeholder="integer"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && onInsert()}
          className="value-input"
          disabled={isTimelinePlaying}
        />

        <ActionButton variant="success" onClick={onInsert} disabled={isTimelinePlaying}>Insert</ActionButton>
        <ActionButton variant="danger" onClick={onDelete} disabled={isTimelinePlaying}>Delete</ActionButton>
        <ActionButton onClick={onSearch} disabled={isTimelinePlaying}>Search</ActionButton>
        <ActionButton
          onClick={() =>
            treeMin(root) === null
              ? setError("Tree is empty.")
              : setOk(`Minimum: ${treeMin(root)}`)
          }
          disabled={isTimelinePlaying}
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
        >
          Max
        </ActionButton>
        <ActionButton onClick={onRandomInsert} disabled={isTimelinePlaying}>Random</ActionButton>
        <ActionButton onClick={clearSearch}>Clear Highlight</ActionButton>
        <ActionButton onClick={onClearAll} disabled={isTimelinePlaying}>Clear All</ActionButton>

        <span className={`status-pill ${message.ok ? "good" : "bad"}`}>{message.text}</span>
      </div>

      <div className="toolbar-row playback-row">
        <span className="toolbar-label">Modification Playback</span>

        <ActionButton onClick={timelineBack} disabled={!timelineHasFrames}>Prev</ActionButton>
        <ActionButton onClick={toggleTimelinePlay} disabled={!timelineHasFrames}>
          {timelineState.playing ? "Pause" : "Play"}
        </ActionButton>
        <ActionButton onClick={timelineNext} disabled={!timelineHasFrames}>Next</ActionButton>
        <ActionButton onClick={replayTimeline} disabled={!timelineHasFrames}>Replay</ActionButton>

        <label className="speed-label" htmlFor="timeline-speed">Speed</label>
        <select
          id="timeline-speed"
          value={timelineSpeed}
          onChange={(event) => setTimelineSpeed(Number(event.target.value))}
          className="speed-select"
        >
          {[0.5, 0.75, 1, 1.25, 1.5, 2, 3].map((speed) => (
            <option key={speed} value={speed}>{speed}x</option>
          ))}
        </select>

        <span className="sequence-readout">
          {timelineHasFrames
            ? `Frame ${timelineState.index + 1}/${timelineState.frames.length} | ${timelineFrame?.label ?? ""}`
            : "No modification timeline yet."}
        </span>
      </div>

      <div className="timeline-inspector">
        <div className="timeline-topline">
          <span className={`frame-kind-badge tone-${frameKindMeta.tone}`}>{frameKindMeta.label}</span>
          <span className="frame-title">{timelineFrame?.label ?? "Awaiting first operation..."}</span>
        </div>
        <p className="frame-explanation">{frameExplanation}</p>
        {timelineFrame?.focus?.length > 0 && (
          <span className="focus-readout">Focus nodes: {timelineFrame.focus.join(" -> ")}</span>
        )}

        <div className="timeline-slider-row">
          <input
            type="range"
            min={0}
            max={Math.max(0, timelineState.frames.length - 1)}
            value={timelineState.frames.length ? timelineState.index : 0}
            onChange={(event) => jumpToFrame(Number(event.target.value))}
            disabled={!timelineHasFrames}
          />
        </div>

        {replaySteps.length > 0 && (
          <div className="step-chip-row">
            {replaySteps.map(({ frame, index }) => (
              <button
                key={`${frame.label}-${index}`}
                type="button"
                className={`step-chip ${timelineState.index === index ? "active" : ""}`}
                onClick={() => jumpToFrame(index)}
              >
                {index + 1}. {frame.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="toolbar-row secondary">
        <span className="toolbar-label">Traverse</span>

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

        {traversal.values.length > 0 && (
          <span className="sequence-readout">
            {traversal.name}:{" "}
            {traversal.values.map((value, idx) => (idx === traversal.index ? `[${value}]` : value)).join(", ")}
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
        {!visualRoot && <div className="empty-state">Tree is empty. Insert a value to start.</div>}

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

              return (
                <g key={nodeMeta.value} opacity={nodeMeta.opacity}>
                  {frameFocusSet.has(nodeMeta.value) && (
                    <circle
                      cx={nodeMeta.x}
                      cy={nodeMeta.y}
                      r={focusIdx === 0 ? NODE_RADIUS + 9 : NODE_RADIUS + 7}
                      fill="none"
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
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="history-panel">
        <div className="history-header">
          <span>Operation History</span>
          <span>{operationHistory.length} recorded</span>
          <button
            type="button"
            className="history-replay-btn"
            onClick={() => selectedOperation && loadOperation(selectedOperation.id, true)}
            disabled={!selectedOperation}
          >
            Replay selected
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
      </div>

      <div className="legend-row">
        {typeLegend.map((entry) => (
          <LegendDot key={entry.label} fill={entry.fill} stroke={entry.stroke} label={entry.label} />
        ))}

        <LegendDot fill="#FDE68A" stroke="#B45309" label="Search path" />
        <LegendDot fill="#FACC15" stroke="#A16207" label="Search hit" />
        <LegendDot fill="#C7D2FE" stroke="#4338CA" label="Traversal visited" />
        <LegendDot fill="#818CF8" stroke="#3730A3" label="Traversal current" />
        <LegendDot fill="#BAE6FD" stroke="#0369A1" label="Timeline focus" />

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

    const sourceValues = nextType === "BST" ? history : inOrderValues(root);
    const rebuiltRoot = buildTree(sourceValues, TREE_CONFIG[nextType].insert);

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
          One shared BST foundation, layered AVL/RB behavior, and full operation playback with smooth transitions.
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

          <TreeWorkspace type={treeType} root={root} onRoot={setRoot} onHistory={setHistory} />
        </section>
      )}
    </main>
  );
}
