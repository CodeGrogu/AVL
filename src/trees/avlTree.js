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
