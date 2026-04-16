import { createNode, minNode } from "./baseTree";

const height = (node) => node?.h ?? 0;

const withHeight = (node) => ({
  ...node,
  h: 1 + Math.max(height(node.left), height(node.right)),
});

const balanceFactor = (node) => (node ? height(node.left) - height(node.right) : 0);

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
    if (balanceFactor(next.left) < 0) next = { ...next, left: rotateLeft(next.left) };
    return rotateRight(next);
  }

  if (bf < -1) {
    if (balanceFactor(next.right) > 0) next = { ...next, right: rotateRight(next.right) };
    return rotateLeft(next);
  }

  return next;
};

export const avlInsert = (root, value) => {
  if (!root) return createNode(value, { h: 1 });
  if (value < root.val) return rebalance({ ...root, left: avlInsert(root.left, value) });
  if (value > root.val) return rebalance({ ...root, right: avlInsert(root.right, value) });
  return root;
};

export const avlDelete = (root, value) => {
  if (!root) return null;

  if (value < root.val) return rebalance({ ...root, left: avlDelete(root.left, value) });
  if (value > root.val) return rebalance({ ...root, right: avlDelete(root.right, value) });

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

const treeSignature = (node) =>
  !node ? "#" : `${node.val}:${node.h}|${treeSignature(node.left)}|${treeSignature(node.right)}`;

const rebuildFromTrail = (subtree, trail) => {
  let next = subtree;
  for (let i = trail.length - 1; i >= 0; i -= 1) {
    const { node, dir } = trail[i];
    next = dir === "left" ? { ...node, left: next } : { ...node, right: next };
  }
  return next;
};

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
  const signature = treeSignature(root);
  const previous = frames[frames.length - 1];
  if (previous && previous.signature === signature && previous.label === label) return;
  frames.push({ label, root, focus, explanation, kind, signature });
};

const rebalanceWithTrace = (node, trail, frames) => {
  let next = withHeight(node);
  const bf = balanceFactor(next);

  if (bf > 1) {
    const leftChild = next.left;
    const leftBf = balanceFactor(leftChild);

    pushTraceFrame(frames, {
      label: leftBf < 0 ? `AVL case LR at ${next.val}` : `AVL case LL at ${next.val}`,
      root: rebuildFromTrail(next, trail),
      focus: [next.val, leftChild?.val].filter(Boolean),
      explanation:
        leftBf < 0
          ? `Node ${next.val} is left-heavy, but its left child ${leftChild?.val} is right-heavy. Perform double rotation (left then right).`
          : `Node ${next.val} is left-heavy with a left-heavy child ${leftChild?.val}. Perform a single right rotation.`,
      kind: "case",
    });

    if (leftBf < 0 && leftChild) {
      pushTraceFrame(frames, {
        label: `Rotate left at ${leftChild.val} (prep)`,
        root: rebuildFromTrail(next, trail),
        focus: [leftChild.val, leftChild.right?.val].filter(Boolean),
        explanation: `First step of LR case: rotate left at child ${leftChild.val} so the heavier branch moves up.`,
        kind: "rotation",
      });
      next = { ...next, left: rotateLeft(leftChild) };
      pushTraceFrame(frames, {
        label: `After prep rotation at ${leftChild.val}`,
        root: rebuildFromTrail(next, trail),
        focus: [next.val, next.left?.val].filter(Boolean),
        explanation: "Preparation complete. Now root and its new left child are ready for the final rotation.",
        kind: "rotation-result",
      });
    }

    const pivot = next.left?.val;
    pushTraceFrame(frames, {
      label: `Rotate right at ${next.val}`,
      root: rebuildFromTrail(next, trail),
      focus: [next.val, pivot].filter(Boolean),
      explanation: `Main balancing step: rotate right around ${next.val} with pivot ${pivot}.`,
      kind: "rotation",
    });

    const rotated = rotateRight(next);
    pushTraceFrame(frames, {
      label: `After right rotation at ${next.val}`,
      root: rebuildFromTrail(rotated, trail),
      focus: [rotated.val, rotated.right?.val].filter(Boolean),
      explanation: `Subtree rooted at ${next.val} is now balanced after right rotation.`,
      kind: "rotation-result",
    });

    return rotated;
  }

  if (bf < -1) {
    const rightChild = next.right;
    const rightBf = balanceFactor(rightChild);

    pushTraceFrame(frames, {
      label: rightBf > 0 ? `AVL case RL at ${next.val}` : `AVL case RR at ${next.val}`,
      root: rebuildFromTrail(next, trail),
      focus: [next.val, rightChild?.val].filter(Boolean),
      explanation:
        rightBf > 0
          ? `Node ${next.val} is right-heavy, but child ${rightChild?.val} is left-heavy. Perform double rotation (right then left).`
          : `Node ${next.val} is right-heavy with right-heavy child ${rightChild?.val}. Perform a single left rotation.`,
      kind: "case",
    });

    if (rightBf > 0 && rightChild) {
      pushTraceFrame(frames, {
        label: `Rotate right at ${rightChild.val} (prep)`,
        root: rebuildFromTrail(next, trail),
        focus: [rightChild.val, rightChild.left?.val].filter(Boolean),
        explanation: `First step of RL case: rotate right at child ${rightChild.val}.`,
        kind: "rotation",
      });
      next = { ...next, right: rotateRight(rightChild) };
      pushTraceFrame(frames, {
        label: `After prep rotation at ${rightChild.val}`,
        root: rebuildFromTrail(next, trail),
        focus: [next.val, next.right?.val].filter(Boolean),
        explanation: "Preparation complete for final left rotation at the root of this subtree.",
        kind: "rotation-result",
      });
    }

    const pivot = next.right?.val;
    pushTraceFrame(frames, {
      label: `Rotate left at ${next.val}`,
      root: rebuildFromTrail(next, trail),
      focus: [next.val, pivot].filter(Boolean),
      explanation: `Main balancing step: rotate left around ${next.val} with pivot ${pivot}.`,
      kind: "rotation",
    });

    const rotated = rotateLeft(next);
    pushTraceFrame(frames, {
      label: `After left rotation at ${next.val}`,
      root: rebuildFromTrail(rotated, trail),
      focus: [rotated.val, rotated.left?.val].filter(Boolean),
      explanation: `Subtree rooted at ${next.val} is now balanced after left rotation.`,
      kind: "rotation-result",
    });

    return rotated;
  }

  return next;
};

export const avlInsertTrace = (root, value) => {
  const frames = [];

  const insert = (node, trail) => {
    if (!node) {
      const created = createNode(value, { h: 1 });
      pushTraceFrame(frames, {
        label: `Inserted ${value}`,
        root: rebuildFromTrail(created, trail),
        focus: [value],
        explanation: `Create new AVL node ${value} at the insertion point.`,
        kind: "insert",
      });
      return created;
    }

    if (value < node.val) {
      const left = insert(node.left, [...trail, { node, dir: "left" }]);
      const rebalanced = rebalanceWithTrace({ ...node, left }, trail, frames);
      return rebalanced;
    }

    if (value > node.val) {
      const right = insert(node.right, [...trail, { node, dir: "right" }]);
      const rebalanced = rebalanceWithTrace({ ...node, right }, trail, frames);
      return rebalanced;
    }

    return node;
  };

  const nextRoot = insert(root, []);
  pushTraceFrame(frames, {
    label: `Done inserting ${value}`,
    root: nextRoot,
    focus: [value],
    explanation: `Insertion of ${value} complete. AVL constraints are restored.`,
    kind: "done",
  });

  return {
    root: nextRoot,
    frames: frames.map(({ signature, ...frame }) => frame),
  };
};

export const avlDeleteTrace = (root, value) => {
  const frames = [];

  const remove = (node, trail) => {
    if (!node) return null;

    if (value < node.val) {
      const left = remove(node.left, [...trail, { node, dir: "left" }]);
      const rebalanced = rebalanceWithTrace({ ...node, left }, trail, frames);
      return rebalanced;
    }

    if (value > node.val) {
      const right = remove(node.right, [...trail, { node, dir: "right" }]);
      const rebalanced = rebalanceWithTrace({ ...node, right }, trail, frames);
      return rebalanced;
    }

    if (!node.left) {
      pushTraceFrame(frames, {
        label: `Removed ${value}`,
        root: rebuildFromTrail(node.right, trail),
        focus: [value],
        explanation: `Node ${value} removed. It had no left child, so its right subtree moved up.`,
        kind: "delete",
      });
      return node.right;
    }

    if (!node.right) {
      pushTraceFrame(frames, {
        label: `Removed ${value}`,
        root: rebuildFromTrail(node.left, trail),
        focus: [value],
        explanation: `Node ${value} removed. It had no right child, so its left subtree moved up.`,
        kind: "delete",
      });
      return node.left;
    }

    const successor = minNode(node.right);
    const replaced = { ...node, val: successor.val, right: remove(node.right, [...trail, { node, dir: "right" }]) };
    pushTraceFrame(frames, {
      label: `Replace ${value} with successor ${successor.val}`,
      root: rebuildFromTrail(replaced, trail),
      focus: [value, successor.val],
      explanation: `Node ${value} has two children. Use in-order successor ${successor.val} to preserve ordering.`,
      kind: "replace",
    });

    const rebalanced = rebalanceWithTrace(replaced, trail, frames);
    return rebalanced;
  };

  const nextRoot = remove(root, []);
  pushTraceFrame(frames, {
    label: `Done deleting ${value}`,
    root: nextRoot,
    focus: [value],
    explanation: `Deletion of ${value} complete. AVL constraints are restored.`,
    kind: "done",
  });

  return {
    root: nextRoot,
    frames: frames.map(({ signature, ...frame }) => frame),
  };
};
