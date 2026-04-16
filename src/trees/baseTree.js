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

export const treeSize = (root) => (!root ? 0 : 1 + treeSize(root.left) + treeSize(root.right));

export const treeHeight = (root) => (!root ? 0 : 1 + Math.max(treeHeight(root.left), treeHeight(root.right)));

export const treeLeavesCount = (root) => {
  if (!root) return 0;
  if (!root.left && !root.right) return 1;
  return treeLeavesCount(root.left) + treeLeavesCount(root.right);
};

export const treeInternalNodesCount = (root) => {
  if (!root) return 0;
  if (!root.left && !root.right) return 0;
  return 1 + treeInternalNodesCount(root.left) + treeInternalNodesCount(root.right);
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

export const levelOrder = (root) => {
  if (!root) return [];
  const queue = [root];
  const out = [];
  while (queue.length) {
    const node = queue.shift();
    out.push(node.val);
    if (node.left) queue.push(node.left);
    if (node.right) queue.push(node.right);
  }
  return out;
};

export const inOrderValues = (root) => inOrder(root, []);

export const buildTree = (values, insertFn) => values.reduce((acc, value) => insertFn(acc, value), null);

const slotCount = (node) =>
  !node ? 1 : !node.left && !node.right ? 1 : slotCount(node.left) + slotCount(node.right);

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
  const place = (node, startSlot, depth) => {
    if (!node) return;
    maxDepth = Math.max(maxDepth, depth);
    const widthSlots = slotCount(node);
    const x = padding + (startSlot + widthSlots / 2) * horizontalSlot;
    const y = padding + depth * (nodeRadius * 2 + verticalGap) + nodeRadius;

    const nodeMeta = {
      value: node.val,
      node,
      x,
      y,
      depth,
    };

    nodeMap.set(node.val, nodeMeta);

    if (node.left) edges.push({ from: node.val, to: node.left.val, key: `${node.val}->${node.left.val}` });
    if (node.right) edges.push({ from: node.val, to: node.right.val, key: `${node.val}->${node.right.val}` });

    place(node.left, startSlot, depth + 1);
    place(node.right, startSlot + slotCount(node.left), depth + 1);
  };
  place(root, 0, 0);

  return {
    root,
    nodeMap,
    nodes: Array.from(nodeMap.values()),
    edges,
    width: slotCount(root) * horizontalSlot + padding * 2,
    height: (maxDepth + 1) * (nodeRadius * 2 + verticalGap) - verticalGap + nodeRadius * 2 + padding * 2,
  };
};
