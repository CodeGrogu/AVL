import { createNode, minNode } from "./baseTree";

const RED = "R";
const BLACK = "B";

const isRed = (node) => node?.color === RED;

const rotateLeft = (h) => {
  const x = h.right;
  return {
    ...x,
    color: h.color,
    left: { ...h, color: RED, right: x.left },
  };
};

const rotateRight = (h) => {
  const x = h.left;
  return {
    ...x,
    color: h.color,
    right: { ...h, color: RED, left: x.right },
  };
};

const flipColors = (h) => {
  const flip = (color) => (color === RED ? BLACK : RED);
  return {
    ...h,
    color: flip(h.color),
    left: h.left ? { ...h.left, color: flip(h.left.color) } : null,
    right: h.right ? { ...h.right, color: flip(h.right.color) } : null,
  };
};

const fixUp = (h) => {
  let next = h;
  if (isRed(next.right) && !isRed(next.left)) next = rotateLeft(next);
  if (isRed(next.left) && isRed(next.left?.left)) next = rotateRight(next);
  if (isRed(next.left) && isRed(next.right)) next = flipColors(next);
  return next;
};

const moveRedLeft = (h) => {
  let next = flipColors(h);
  if (isRed(next.right?.left)) {
    next = { ...next, right: rotateRight(next.right) };
    next = rotateLeft(next);
    next = flipColors(next);
  }
  return next;
};

const moveRedRight = (h) => {
  let next = flipColors(h);
  if (isRed(next.left?.left)) {
    next = rotateRight(next);
    next = flipColors(next);
  }
  return next;
};

const deleteMin = (h) => {
  if (!h.left) return null;
  let next = h;
  if (!isRed(next.left) && !isRed(next.left.left)) next = moveRedLeft(next);
  return fixUp({ ...next, left: deleteMin(next.left) });
};

export const rbInsert = (root, value) => {
  const insert = (h) => {
    if (!h) return createNode(value, { color: RED });
    if (value < h.val) return fixUp({ ...h, left: insert(h.left) });
    if (value > h.val) return fixUp({ ...h, right: insert(h.right) });
    return h;
  };

  const next = insert(root);
  return next ? { ...next, color: BLACK } : null;
};

export const rbDelete = (root, value) => {
  if (!root) return null;

  const del = (h) => {
    let next = h;

    if (value < next.val) {
      if (!next.left) return next;
      if (!isRed(next.left) && !isRed(next.left.left)) next = moveRedLeft(next);
      return fixUp({ ...next, left: del(next.left) });
    }

    if (isRed(next.left)) next = rotateRight(next);

    if (value === next.val && !next.right) return null;

    if (next.right && !isRed(next.right) && !isRed(next.right.left)) next = moveRedRight(next);

    if (value === next.val) {
      const m = minNode(next.right);
      return fixUp({
        ...next,
        val: m.val,
        right: deleteMin(next.right),
      });
    }

    if (!next.right) return next;

    return fixUp({ ...next, right: del(next.right) });
  };

  const nextRoot = del({ ...root, color: RED });
  return nextRoot ? { ...nextRoot, color: BLACK } : null;
};

export const rbBlackHeight = (node) => {
  // Iterative black-height calculation — avoids recursion
  let bh = 0;
  let current = node;
  while (current) {
    if (current.color === BLACK) bh += 1;
    current = current.left;
  }
  // Count the null sentinel as black
  return bh + 1;
};

// Optimized: rebuild from mutable trail
const rebuildFromTrail = (subtree, trail, trailLen) => {
  let next = subtree;
  for (let i = trailLen - 1; i >= 0; i -= 1) {
    const entry = trail[i];
    next = entry.dir === "left" ? { ...entry.node, left: next } : { ...entry.node, right: next };
  }
  return next;
};

// Counter-based dedup instead of full tree signature hashing
let _rbTraceCounter = 0;
const pushTraceFrame = (
  frames,
  {
    label,
    root,
    focus = [],
    explanation = "",
    kind = "step",
  },
) => {
  const prev = frames[frames.length - 1];
  const focusKey = focus.join(",");
  if (prev && prev.label === label && frames._lastFocusKey === focusKey) return;
  _rbTraceCounter += 1;
  frames._lastFocusKey = focusKey;
  frames.push({ label, root, focus, explanation, kind });
};

const rotateLeftTrace = (node, trail, trailLen, frames, context) => {
  const pivot = node.right?.val;
  pushTraceFrame(frames, {
    label: `Rotate left at ${node.val}`,
    root: rebuildFromTrail(node, trail, trailLen),
    focus: [node.val, pivot].filter(Boolean),
    explanation: `${context} Rotate left so the red link leans left.`,
    kind: "rotation",
  });
  const rotated = rotateLeft(node);
  pushTraceFrame(frames, {
    label: `After left rotation at ${node.val}`,
    root: rebuildFromTrail(rotated, trail, trailLen),
    focus: [rotated.val, rotated.left?.val].filter(Boolean),
    explanation: `Rotation complete. The subtree rooted at ${node.val} was reoriented.`,
    kind: "rotation-result",
  });
  return rotated;
};

const rotateRightTrace = (node, trail, trailLen, frames, context) => {
  const pivot = node.left?.val;
  pushTraceFrame(frames, {
    label: `Rotate right at ${node.val}`,
    root: rebuildFromTrail(node, trail, trailLen),
    focus: [node.val, pivot].filter(Boolean),
    explanation: `${context} Rotate right to resolve consecutive left red links.`,
    kind: "rotation",
  });
  const rotated = rotateRight(node);
  pushTraceFrame(frames, {
    label: `After right rotation at ${node.val}`,
    root: rebuildFromTrail(rotated, trail, trailLen),
    focus: [rotated.val, rotated.right?.val].filter(Boolean),
    explanation: `Rotation complete. Subtree rooted at ${node.val} now satisfies local red-link constraints.`,
    kind: "rotation-result",
  });
  return rotated;
};

const colorFlipTrace = (node, trail, trailLen, frames, context) => {
  pushTraceFrame(frames, {
    label: `Color flip at ${node.val}`,
    root: rebuildFromTrail(node, trail, trailLen),
    focus: [node.val, node.left?.val, node.right?.val].filter(Boolean),
    explanation: `${context} Flip colors to split/join a temporary 4-node.`,
    kind: "color-flip",
  });
  const flipped = flipColors(node);
  pushTraceFrame(frames, {
    label: `After color flip at ${node.val}`,
    root: rebuildFromTrail(flipped, trail, trailLen),
    focus: [flipped.val, flipped.left?.val, flipped.right?.val].filter(Boolean),
    explanation: "Color flip complete.",
    kind: "color-flip-result",
  });
  return flipped;
};

const fixUpTrace = (node, trail, trailLen, frames, context) => {
  let next = node;

  if (isRed(next.right) && !isRed(next.left)) {
    next = rotateLeftTrace(next, trail, trailLen, frames, context);
  }

  if (isRed(next.left) && isRed(next.left?.left)) {
    next = rotateRightTrace(next, trail, trailLen, frames, context);
  }

  if (isRed(next.left) && isRed(next.right)) {
    next = colorFlipTrace(next, trail, trailLen, frames, context);
  }

  return next;
};

const moveRedLeftTrace = (node, trail, trailLen, frames) => {
  pushTraceFrame(frames, {
    label: `Case move-red-left at ${node.val}`,
    root: rebuildFromTrail(node, trail, trailLen),
    focus: [node.val, node.left?.val, node.right?.val].filter(Boolean),
    explanation:
      "Need a red link on the left path before descending. Prepare by pushing red downward.",
    kind: "case",
  });

  let next = colorFlipTrace(node, trail, trailLen, frames, "Preparation:");

  if (isRed(next.right?.left)) {
    pushTraceFrame(frames, {
      label: `Inner red-right-left at ${next.val}`,
      root: rebuildFromTrail(next, trail, trailLen),
      focus: [next.val, next.right?.val, next.right?.left?.val].filter(Boolean),
      explanation: "Right child has an inner red link; perform double rotation sequence.",
      kind: "case",
    });

    // Push trail entry for right child context
    trail.push({ node: next, dir: "right" });
    const rightRotated = rotateRightTrace(
      next.right,
      trail,
      trailLen + 1,
      frames,
      "Prep step:",
    );
    trail.length = trailLen;

    next = { ...next, right: rightRotated };
    next = rotateLeftTrace(next, trail, trailLen, frames, "Prep step:");
    next = colorFlipTrace(next, trail, trailLen, frames, "Finalize move-red-left:");
  }

  return next;
};

const moveRedRightTrace = (node, trail, trailLen, frames) => {
  pushTraceFrame(frames, {
    label: `Case move-red-right at ${node.val}`,
    root: rebuildFromTrail(node, trail, trailLen),
    focus: [node.val, node.left?.val, node.right?.val].filter(Boolean),
    explanation:
      "Need a red link on the right path before descending. Prepare by pushing red downward.",
    kind: "case",
  });

  let next = colorFlipTrace(node, trail, trailLen, frames, "Preparation:");

  if (isRed(next.left?.left)) {
    pushTraceFrame(frames, {
      label: `Inner red-left-left at ${next.val}`,
      root: rebuildFromTrail(next, trail, trailLen),
      focus: [next.val, next.left?.val, next.left?.left?.val].filter(Boolean),
      explanation: "Left subtree carries extra red height; rotate right and recolor.",
      kind: "case",
    });
    next = rotateRightTrace(next, trail, trailLen, frames, "Prep step:");
    next = colorFlipTrace(next, trail, trailLen, frames, "Finalize move-red-right:");
  }

  return next;
};

const deleteMinTrace = (node, trail, trailLen, frames) => {
  if (!node.left) {
    pushTraceFrame(frames, {
      label: `Delete minimum node ${node.val}`,
      root: rebuildFromTrail(null, trail, trailLen),
      focus: [node.val],
      explanation: `Reached leftmost node ${node.val}; remove it.`,
      kind: "delete",
    });
    return null;
  }

  let next = node;
  if (!isRed(next.left) && !isRed(next.left.left)) {
    next = moveRedLeftTrace(next, trail, trailLen, frames);
  }

  trail.push({ node: next, dir: "left" });
  const leftResult = deleteMinTrace(next.left, trail, trailLen + 1, frames);
  trail.length = trailLen;

  next = { ...next, left: leftResult };
  return fixUpTrace(next, trail, trailLen, frames, "Fix-up after delete-min:");
};

export const rbInsertTrace = (root, value) => {
  const frames = [];
  const trail = [];

  const insert = (node) => {
    const trailLen = trail.length;

    if (!node) {
      const created = createNode(value, { color: RED });
      pushTraceFrame(frames, {
        label: `Inserted ${value} as red node`,
        root: rebuildFromTrail(created, trail, trailLen),
        focus: [value],
        explanation: "New Red-Black insertions start as red to preserve black-height.",
        kind: "insert",
      });
      return created;
    }

    let next = node;
    if (value < next.val) {
      trail.push({ node: next, dir: "left" });
      next = { ...next, left: insert(next.left) };
      trail.length = trailLen;
    } else if (value > next.val) {
      trail.push({ node: next, dir: "right" });
      next = { ...next, right: insert(next.right) };
      trail.length = trailLen;
    } else {
      return next;
    }

    return fixUpTrace(next, trail, trailLen, frames, "Insert fix-up:");
  };

  let nextRoot = insert(root);
  if (nextRoot?.color !== BLACK) {
    pushTraceFrame(frames, {
      label: `Recolor root ${nextRoot.val} to black`,
      root: nextRoot,
      focus: [nextRoot.val],
      explanation: "Root must always be black in a Red-Black tree.",
      kind: "root-recolor",
    });
  }
  nextRoot = nextRoot ? { ...nextRoot, color: BLACK } : null;

  pushTraceFrame(frames, {
    label: `Done inserting ${value}`,
    root: nextRoot,
    focus: [value],
    explanation: "Insertion complete with all Red-Black invariants restored.",
    kind: "done",
  });

  return {
    root: nextRoot,
    frames,
  };
};

export const rbDeleteTrace = (root, value) => {
  if (!root) return { root: null, frames: [] };

  const frames = [];
  const trail = [];

  const del = (node) => {
    let next = node;
    const trailLen = trail.length;

    if (value < next.val) {
      if (!next.left) return next;
      if (!isRed(next.left) && !isRed(next.left.left)) {
        next = moveRedLeftTrace(next, trail, trailLen, frames);
      }
      trail.push({ node: next, dir: "left" });
      next = { ...next, left: del(next.left) };
      trail.length = trailLen;
      return fixUpTrace(next, trail, trailLen, frames, "Delete fix-up:");
    }

    if (isRed(next.left)) {
      next = rotateRightTrace(next, trail, trailLen, frames, "Delete prep:");
    }

    if (value === next.val && !next.right) {
      pushTraceFrame(frames, {
        label: `Delete leaf ${value}`,
        root: rebuildFromTrail(null, trail, trailLen),
        focus: [value],
        explanation: "Target node has no right child; remove directly.",
        kind: "delete",
      });
      return null;
    }

    if (next.right && !isRed(next.right) && !isRed(next.right.left)) {
      next = moveRedRightTrace(next, trail, trailLen, frames);
    }

    if (value === next.val) {
      const successor = minNode(next.right);

      trail.push({ node: next, dir: "right" });
      const rightAfterDelMin = deleteMinTrace(next.right, trail, trailLen + 1, frames);
      trail.length = trailLen;

      const replaced = {
        ...next,
        val: successor.val,
        right: rightAfterDelMin,
      };

      pushTraceFrame(frames, {
        label: `Replace ${value} with successor ${successor.val}`,
        root: rebuildFromTrail(replaced, trail, trailLen),
        focus: [value, successor.val],
        explanation: "For two-child delete, replace with in-order successor and then rebalance.",
        kind: "replace",
      });

      return fixUpTrace(replaced, trail, trailLen, frames, "Delete fix-up:");
    }

    if (!next.right) return next;

    trail.push({ node: next, dir: "right" });
    next = { ...next, right: del(next.right) };
    trail.length = trailLen;
    return fixUpTrace(next, trail, trailLen, frames, "Delete fix-up:");
  };

  let nextRoot = del({ ...root, color: RED });
  if (nextRoot?.color !== BLACK) {
    pushTraceFrame(frames, {
      label: `Recolor root ${nextRoot.val} to black`,
      root: nextRoot,
      focus: [nextRoot.val],
      explanation: "Root must always be black after deletion.",
      kind: "root-recolor",
    });
  }
  nextRoot = nextRoot ? { ...nextRoot, color: BLACK } : null;

  pushTraceFrame(frames, {
    label: `Done deleting ${value}`,
    root: nextRoot,
    focus: [value],
    explanation: "Deletion complete with Red-Black invariants restored.",
    kind: "done",
  });

  return {
    root: nextRoot,
    frames,
  };
};
