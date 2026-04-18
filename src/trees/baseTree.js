export const createNode = (value, extra = {}) => ({
  val: value,
  left: null,
  right: null,
  ...extra,
});

export const minNode = (root) => {
  if (!root) return null;
  let node = root;
  while (node.left) node = node.left;
  return node;
};

export const maxNode = (root) => {
  if (!root) return null;
  let node = root;
  while (node.right) node = node.right;
  return node;
};

export const treeMin = (root) => minNode(root)?.val ?? null;

export const treeMax = (root) => maxNode(root)?.val ?? null;

// Iterative treeSize — avoids stack overflow and call-frame overhead on deep trees
export const treeSize = (root) => {
  if (!root) return 0;
  let count = 0;
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    count += 1;
    if (node.right) stack.push(node.right);
    if (node.left) stack.push(node.left);
  }
  return count;
};

// Iterative treeHeight — uses explicit stack with depth tracking
export const treeHeight = (root) => {
  if (!root) return 0;
  let maxDepth = 0;
  // Stack stores [node, depth] pairs
  const stack = [[root, 1]];
  while (stack.length) {
    const entry = stack.pop();
    const node = entry[0];
    const depth = entry[1];
    if (!node.left && !node.right) {
      if (depth > maxDepth) maxDepth = depth;
    } else {
      if (node.right) stack.push([node.right, depth + 1]);
      if (node.left) stack.push([node.left, depth + 1]);
    }
  }
  return maxDepth;
};

// Iterative treeLeavesCount
export const treeLeavesCount = (root) => {
  if (!root) return 0;
  let count = 0;
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node.left && !node.right) {
      count += 1;
    } else {
      if (node.right) stack.push(node.right);
      if (node.left) stack.push(node.left);
    }
  }
  return count;
};

// Iterative treeInternalNodesCount
export const treeInternalNodesCount = (root) => {
  if (!root) return 0;
  let count = 0;
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (node.left || node.right) {
      count += 1;
      if (node.right) stack.push(node.right);
      if (node.left) stack.push(node.left);
    }
  }
  return count;
};

/**
 * Compute all tree stats in a single iterative pass.
 * Returns { size, height, leaves, internal, min, max }.
 * This avoids 6 separate full-tree traversals.
 */
export const treeStats = (root) => {
  if (!root) {
    return { size: 0, height: 0, leaves: 0, internal: 0, min: null, max: null };
  }

  let size = 0;
  let leaves = 0;
  let internal = 0;
  let maxDepth = 0;
  let minVal = root.val;
  let maxVal = root.val;

  // Stack of [node, depth]
  const stack = [[root, 1]];
  while (stack.length) {
    const entry = stack.pop();
    const node = entry[0];
    const depth = entry[1];
    size += 1;

    if (node.val < minVal) minVal = node.val;
    if (node.val > maxVal) maxVal = node.val;

    const hasChildren = node.left || node.right;
    if (!hasChildren) {
      leaves += 1;
      if (depth > maxDepth) maxDepth = depth;
    } else {
      internal += 1;
      if (node.right) stack.push([node.right, depth + 1]);
      if (node.left) stack.push([node.left, depth + 1]);
    }
  }

  return { size, height: maxDepth, leaves, internal, min: minVal, max: maxVal };
};

export const searchPath = (root, value) => {
  const path = [];
  let node = root;
  while (node) {
    path.push(node.val);
    if (node.val === value) return { found: true, path };
    node = value < node.val ? node.left : node.right;
  }
  return { found: false, path };
};

export const predecessor = (root, value) => {
  let result = null;
  let node = root;
  while (node) {
    if (value > node.val) {
      result = node.val;
      node = node.right;
    } else node = node.left;
  }
  return result;
};

export const successor = (root, value) => {
  let result = null;
  let node = root;
  while (node) {
    if (value < node.val) {
      result = node.val;
      node = node.left;
    } else node = node.right;
  }
  return result;
};

const defaultNodeFactory = (value) => createNode(value);

export const bstInsert = (root, value, nodeFactory = defaultNodeFactory) => {
  if (!root) return nodeFactory(value);
  if (value < root.val) return { ...root, left: bstInsert(root.left, value, nodeFactory) };
  if (value > root.val) return { ...root, right: bstInsert(root.right, value, nodeFactory) };
  return root;
};

export const bstDelete = (root, value) => {
  if (!root) return null;
  if (value < root.val) return { ...root, left: bstDelete(root.left, value) };
  if (value > root.val) return { ...root, right: bstDelete(root.right, value) };
  if (!root.left) return root.right;
  if (!root.right) return root.left;
  const next = minNode(root.right);
  return { ...root, val: next.val, right: bstDelete(root.right, next.val) };
};

export const preOrder = (root, out = []) => {
  if (!root) return out;
  out.push(root.val);
  preOrder(root.left, out);
  preOrder(root.right, out);
  return out;
};

export const inOrder = (root, out = []) => {
  if (!root) return out;
  inOrder(root.left, out);
  out.push(root.val);
  inOrder(root.right, out);
  return out;
};

export const postOrder = (root, out = []) => {
  if (!root) return out;
  postOrder(root.left, out);
  postOrder(root.right, out);
  out.push(root.val);
  return out;
};

// Optimized levelOrder — uses index pointer instead of expensive Array.shift()
export const levelOrder = (root) => {
  if (!root) return [];
  const queue = [root];
  const out = [];
  let head = 0;
  while (head < queue.length) {
    const node = queue[head];
    head += 1;
    out.push(node.val);
    if (node.left) queue.push(node.left);
    if (node.right) queue.push(node.right);
  }
  return out;
};

export const inOrderValues = (root) => inOrder(root, []);

export const buildTree = (values, insertFn) => values.reduce((acc, value) => insertFn(acc, value), null);

// Cached slotCount using a WeakMap — avoids recomputing the same subtree multiple times
const _slotCache = new WeakMap();
const slotCount = (node) => {
  if (!node) return 1;
  const cached = _slotCache.get(node);
  if (cached !== undefined) return cached;
  const result = !node.left && !node.right ? 1 : slotCount(node.left) + slotCount(node.right);
  _slotCache.set(node, result);
  return result;
};

export const layoutTree = (
  root,
  {
    nodeRadius = 24,
    verticalGap = 62,
    padding = 42,
    horizontalSlot = nodeRadius * 2 + 14,
  } = {},
) => {
  if (!root) return null;

  const nodeMap = new Map();
  const edges = [];
  let maxDepth = 0;
  const rowHeight = nodeRadius * 2 + verticalGap;

  const place = (node, startSlot, depth) => {
    if (!node) return;
    if (depth > maxDepth) maxDepth = depth;
    const widthSlots = slotCount(node);
    const x = padding + (startSlot + widthSlots / 2) * horizontalSlot;
    const y = padding + depth * rowHeight + nodeRadius;

    nodeMap.set(node.val, { value: node.val, node, x, y, depth });

    if (node.left) edges.push({ from: node.val, to: node.left.val, key: `${node.val}->${node.left.val}` });
    if (node.right) edges.push({ from: node.val, to: node.right.val, key: `${node.val}->${node.right.val}` });

    const leftSlots = slotCount(node.left);
    place(node.left, startSlot, depth + 1);
    place(node.right, startSlot + leftSlots, depth + 1);
  };
  place(root, 0, 0);

  return {
    root,
    nodeMap,
    edges,
    width: slotCount(root) * horizontalSlot + padding * 2,
    height: (maxDepth + 1) * rowHeight - verticalGap + nodeRadius * 2 + padding * 2,
  };
};
