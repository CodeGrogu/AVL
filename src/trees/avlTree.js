import { createNode, minNode } from "./baseTree";

const height = (node) => node?.h ?? 0;

const withHeight = (node) => ({
  ...node,
  h: 1 + Math.max(height(node.left), height(node.right)),
});

const balanceFactor = (node) =>
  node ? height(node.left) - height(node.right) : 0;

const rotateRight = (y) => {
  const x = y.left;
  return withHeight({
    ...x,
    right: withHeight({ ...y, left: x.right }),
  });
};

const rotateLeft = (x) => {
  const y = x.right;
  return withHeight({
    ...y,
    left: withHeight({ ...x, right: y.left }),
  });
};

const rebalance = (node) => {
  let next = withHeight(node);
  const bf = balanceFactor(next);

  if (bf > 1) {
    if (balanceFactor(next.left) < 0)
      next = { ...next, left: rotateLeft(next.left) };
    return rotateRight(next);
  }

  if (bf < -1) {
    if (balanceFactor(next.right) > 0)
      next = { ...next, right: rotateRight(next.right) };
    return rotateLeft(next);
  }

  return next;
};

export const avlInsert = (root, value) => {
  if (!root) return createNode(value, { h: 1 });
  if (value < root.val)
    return rebalance({ ...root, left: avlInsert(root.left, value) });
  if (value > root.val)
    return rebalance({ ...root, right: avlInsert(root.right, value) });
  return root;
};

export const avlDelete = (root, value) => {
  if (!root) return null;

  if (value < root.val)
    return rebalance({ ...root, left: avlDelete(root.left, value) });
  if (value > root.val)
    return rebalance({ ...root, right: avlDelete(root.right, value) });

  if (!root.left) return root.right;
  if (!root.right) return root.left;

  const next = minNode(root.right);
  return rebalance({
    ...root,
    val: next.val,
    right: avlDelete(root.right, next.val),
  });
};

export const avlBalanceFactor = (node) => balanceFactor(node);

export const avlRootBalance = (root) => (root ? balanceFactor(root) : null);

// Optimized: rebuild from mutable trail (avoids per-call array copy)
const rebuildFromTrail = (subtree, trail, trailLen) => {
  let next = subtree;
  for (let i = trailLen - 1; i >= 0; i -= 1) {
    const entry = trail[i];
    next =
      entry.dir === "left"
        ? { ...entry.node, left: next }
        : { ...entry.node, right: next };
  }
  return next;
};

// Optimized: counter-based dedup instead of expensive full-tree signature.
// Only skips when consecutive frames have the same label AND the same focus set,
// which covers the redundant duplicate case without O(n) tree hashing.
let _traceCounter = 0;
const pushTraceFrame = (
  frames,
  { label, root, focus = [], explanation = "", kind = "step" },
) => {
  const prev = frames[frames.length - 1];
  if (prev && prev.label === label && prev._focusKey === focus.join(","))
    return;
  _traceCounter += 1;
  frames.push({
    label,
    root,
    focus,
    explanation,
    kind,
    _focusKey: focus.join(","),
    _id: _traceCounter,
  });
};

const rebalanceWithTrace = (node, trail, trailLen, frames) => {
  let next = withHeight(node);
  const bf = balanceFactor(next);

  if (bf > 1) {
    const leftChild = next.left;
    const leftBf = balanceFactor(leftChild);

    pushTraceFrame(frames, {
      label:
        leftBf < 0
          ? `AVL case LR at ${next.val}`
          : `AVL case LL at ${next.val}`,
      root: rebuildFromTrail(next, trail, trailLen),
      focus: leftChild != null ? [next.val, leftChild.val] : [next.val],
      explanation:
        leftBf < 0
          ? `Node ${next.val} is left-heavy, but its left child ${leftChild?.val} is right-heavy. Perform double rotation (left then right).`
          : `Node ${next.val} is left-heavy with a left-heavy child ${leftChild?.val}. Perform a single right rotation.`,
      kind: "case",
    });

    if (leftBf < 0 && leftChild) {
      pushTraceFrame(frames, {
        label: `Rotate left at ${leftChild.val} (prep)`,
        root: rebuildFromTrail(next, trail, trailLen),
        focus:
          leftChild.right != null
            ? [leftChild.val, leftChild.right.val]
            : [leftChild.val],
        explanation: `First step of LR case: rotate left at child ${leftChild.val} so the heavier branch moves up.`,
        kind: "rotation",
      });
      next = { ...next, left: rotateLeft(leftChild) };
      pushTraceFrame(frames, {
        label: `After prep rotation at ${leftChild.val}`,
        root: rebuildFromTrail(next, trail, trailLen),
        focus: next.left != null ? [next.val, next.left.val] : [next.val],
        explanation:
          "Preparation complete. Now root and its new left child are ready for the final rotation.",
        kind: "rotation-result",
      });
    }

    const pivot = next.left?.val;
    pushTraceFrame(frames, {
      label: `Rotate right at ${next.val}`,
      root: rebuildFromTrail(next, trail, trailLen),
      focus: pivot != null ? [next.val, pivot] : [next.val],
      explanation: `Main balancing step: rotate right around ${next.val} with pivot ${pivot}.`,
      kind: "rotation",
    });

    const rotated = rotateRight(next);
    pushTraceFrame(frames, {
      label: `After right rotation at ${next.val}`,
      root: rebuildFromTrail(rotated, trail, trailLen),
      focus:
        rotated.right != null
          ? [rotated.val, rotated.right.val]
          : [rotated.val],
      explanation: `Subtree rooted at ${next.val} is now balanced after right rotation.`,
      kind: "rotation-result",
    });

    return rotated;
  }

  if (bf < -1) {
    const rightChild = next.right;
    const rightBf = balanceFactor(rightChild);

    pushTraceFrame(frames, {
      label:
        rightBf > 0
          ? `AVL case RL at ${next.val}`
          : `AVL case RR at ${next.val}`,
      root: rebuildFromTrail(next, trail, trailLen),
      focus: rightChild != null ? [next.val, rightChild.val] : [next.val],
      explanation:
        rightBf > 0
          ? `Node ${next.val} is right-heavy, but child ${rightChild?.val} is left-heavy. Perform double rotation (right then left).`
          : `Node ${next.val} is right-heavy with right-heavy child ${rightChild?.val}. Perform a single left rotation.`,
      kind: "case",
    });

    if (rightBf > 0 && rightChild) {
      pushTraceFrame(frames, {
        label: `Rotate right at ${rightChild.val} (prep)`,
        root: rebuildFromTrail(next, trail, trailLen),
        focus:
          rightChild.left != null
            ? [rightChild.val, rightChild.left.val]
            : [rightChild.val],
        explanation: `First step of RL case: rotate right at child ${rightChild.val}.`,
        kind: "rotation",
      });
      next = { ...next, right: rotateRight(rightChild) };
      pushTraceFrame(frames, {
        label: `After prep rotation at ${rightChild.val}`,
        root: rebuildFromTrail(next, trail, trailLen),
        focus: next.right != null ? [next.val, next.right.val] : [next.val],
        explanation:
          "Preparation complete for final left rotation at the root of this subtree.",
        kind: "rotation-result",
      });
    }

    const pivot = next.right?.val;
    pushTraceFrame(frames, {
      label: `Rotate left at ${next.val}`,
      root: rebuildFromTrail(next, trail, trailLen),
      focus: pivot != null ? [next.val, pivot] : [next.val],
      explanation: `Main balancing step: rotate left around ${next.val} with pivot ${pivot}.`,
      kind: "rotation",
    });

    const rotated = rotateLeft(next);
    pushTraceFrame(frames, {
      label: `After left rotation at ${next.val}`,
      root: rebuildFromTrail(rotated, trail, trailLen),
      focus:
        rotated.left != null ? [rotated.val, rotated.left.val] : [rotated.val],
      explanation: `Subtree rooted at ${next.val} is now balanced after left rotation.`,
      kind: "rotation-result",
    });

    return rotated;
  }

  return next;
};

export const avlInsertTrace = (root, value) => {
  const frames = [];
  // Mutable trail — push/pop instead of spreading a new array each recursion
  const trail = [];

  const insert = (node) => {
    const trailLen = trail.length;

    if (!node) {
      const created = createNode(value, { h: 1 });
      pushTraceFrame(frames, {
        label: `Inserted ${value}`,
        root: rebuildFromTrail(created, trail, trailLen),
        focus: [value],
        explanation: `Create new AVL node ${value} at the insertion point.`,
        kind: "insert",
      });
      return created;
    }

    if (value < node.val) {
      trail.push({ node, dir: "left" });
      const left = insert(node.left);
      trail.length = trailLen; // pop back
      return rebalanceWithTrace({ ...node, left }, trail, trailLen, frames);
    }

    if (value > node.val) {
      trail.push({ node, dir: "right" });
      const right = insert(node.right);
      trail.length = trailLen; // pop back
      return rebalanceWithTrace({ ...node, right }, trail, trailLen, frames);
    }

    return node;
  };

  const nextRoot = insert(root);
  pushTraceFrame(frames, {
    label: `Done inserting ${value}`,
    root: nextRoot,
    focus: [value],
    explanation: `Insertion of ${value} complete. AVL constraints are restored.`,
    kind: "done",
  });

  // Strip internal dedup metadata before returning
  return {
    root: nextRoot,
    frames,
  };
};

export const avlDeleteTrace = (root, value) => {
  const frames = [];
  const trail = [];

  const remove = (node, target) => {
    if (!node) return null;
    const trailLen = trail.length;

    if (target < node.val) {
      trail.push({ node, dir: "left" });
      const left = remove(node.left, target);
      trail.length = trailLen;
      return rebalanceWithTrace({ ...node, left }, trail, trailLen, frames);
    }

    if (target > node.val) {
      trail.push({ node, dir: "right" });
      const right = remove(node.right, target);
      trail.length = trailLen;
      return rebalanceWithTrace({ ...node, right }, trail, trailLen, frames);
    }

    if (!node.left) {
      pushTraceFrame(frames, {
        label: `Removed ${target}`,
        root: rebuildFromTrail(node.right, trail, trailLen),
        focus: [target],
        explanation: `Node ${target} removed. It had no left child, so its right subtree moved up.`,
        kind: "delete",
      });
      return node.right;
    }

    if (!node.right) {
      pushTraceFrame(frames, {
        label: `Removed ${target}`,
        root: rebuildFromTrail(node.left, trail, trailLen),
        focus: [target],
        explanation: `Node ${target} removed. It had no right child, so its left subtree moved up.`,
        kind: "delete",
      });
      return node.left;
    }

    const successor = minNode(node.right);
    trail.push({ node, dir: "right" });
    const replacedRight = remove(node.right, successor.val);
    trail.length = trailLen;

    const replaced = {
      ...node,
      val: successor.val,
      right: replacedRight,
    };
    pushTraceFrame(frames, {
      label: `Replace ${value} with successor ${successor.val}`,
      root: rebuildFromTrail(replaced, trail, trailLen),
      focus: [value, successor.val],
      explanation: `Node ${value} has two children. Use in-order successor ${successor.val} to preserve ordering.`,
      kind: "replace",
    });

    return rebalanceWithTrace(replaced, trail, trailLen, frames);
  };

  const nextRoot = remove(root, value);
  pushTraceFrame(frames, {
    label: `Done deleting ${value}`,
    root: nextRoot,
    focus: [value],
    explanation: `Deletion of ${value} complete. AVL constraints are restored.`,
    kind: "done",
  });

  return {
    root: nextRoot,
    frames,
  };
};
