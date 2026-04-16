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
  !node
    ? "#"
    : `${node.val}:${node.h}|${treeSignature(node.left)}|${treeSignature(node.right)}`;

const rebuildFromTrail = (subtree, trail) => {
  let next = subtree;
  for (let i = trail.length - 1; i >= 0; i -= 1) {
    const { node, dir } = trail[i];
    next = dir === "left" ? { ...node, left: next } : { ...node, right: next };
  }
  return next;
};

const rebalanceWithAction = (node) => {
  let next = withHeight(node);
  const bf = balanceFactor(next);

  if (bf > 1) {
    if (balanceFactor(next.left) < 0) {
      next = { ...next, left: rotateLeft(next.left) };
      return { node: rotateRight(next), action: `Left-right rotation at ${node.val}`, focus: [node.val] };
    }
    return { node: rotateRight(next), action: `Right rotation at ${node.val}`, focus: [node.val] };
  }

  if (bf < -1) {
    if (balanceFactor(next.right) > 0) {
      next = { ...next, right: rotateRight(next.right) };
      return { node: rotateLeft(next), action: `Right-left rotation at ${node.val}`, focus: [node.val] };
    }
    return { node: rotateLeft(next), action: `Left rotation at ${node.val}`, focus: [node.val] };
  }

  return { node: next, action: null, focus: null };
};

const pushTraceFrame = (frames, label, root, focus = null) => {
  const signature = treeSignature(root);
  const previous = frames[frames.length - 1];
  if (previous && previous.signature === signature && previous.label === label) return;
  frames.push({ label, root, focus, signature });
};

export const avlInsertTrace = (root, value) => {
  const frames = [];

  const insert = (node, trail) => {
    if (!node) {
      const created = createNode(value, { h: 1 });
      pushTraceFrame(frames, `Inserted ${value}`, rebuildFromTrail(created, trail), [value]);
      return created;
    }

    if (value < node.val) {
      const left = insert(node.left, [...trail, { node, dir: "left" }]);
      const { node: rebalanced, action, focus } = rebalanceWithAction({ ...node, left });
      if (action) pushTraceFrame(frames, action, rebuildFromTrail(rebalanced, trail), focus);
      return rebalanced;
    }

    if (value > node.val) {
      const right = insert(node.right, [...trail, { node, dir: "right" }]);
      const { node: rebalanced, action, focus } = rebalanceWithAction({ ...node, right });
      if (action) pushTraceFrame(frames, action, rebuildFromTrail(rebalanced, trail), focus);
      return rebalanced;
    }

    return node;
  };

  const nextRoot = insert(root, []);
  pushTraceFrame(frames, `Done inserting ${value}`, nextRoot, [value]);

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
      const { node: rebalanced, action, focus } = rebalanceWithAction({ ...node, left });
      if (action) pushTraceFrame(frames, action, rebuildFromTrail(rebalanced, trail), focus);
      return rebalanced;
    }

    if (value > node.val) {
      const right = remove(node.right, [...trail, { node, dir: "right" }]);
      const { node: rebalanced, action, focus } = rebalanceWithAction({ ...node, right });
      if (action) pushTraceFrame(frames, action, rebuildFromTrail(rebalanced, trail), focus);
      return rebalanced;
    }

    if (!node.left) {
      pushTraceFrame(frames, `Removed ${value}`, rebuildFromTrail(node.right, trail), [value]);
      return node.right;
    }

    if (!node.right) {
      pushTraceFrame(frames, `Removed ${value}`, rebuildFromTrail(node.left, trail), [value]);
      return node.left;
    }

    const successor = minNode(node.right);
    const replaced = { ...node, val: successor.val, right: remove(node.right, [...trail, { node, dir: "right" }]) };
    pushTraceFrame(
      frames,
      `Replaced ${value} with successor ${successor.val}`,
      rebuildFromTrail(replaced, trail),
      [successor.val],
    );

    const { node: rebalanced, action, focus } = rebalanceWithAction(replaced);
    if (action) pushTraceFrame(frames, action, rebuildFromTrail(rebalanced, trail), focus);
    return rebalanced;
  };

  const nextRoot = remove(root, []);
  pushTraceFrame(frames, `Done deleting ${value}`, nextRoot, [value]);

  return {
    root: nextRoot,
    frames: frames.map(({ signature, ...frame }) => frame),
  };
};
