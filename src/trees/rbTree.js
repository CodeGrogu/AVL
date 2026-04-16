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
  if (!node) return 1;
  return node.color === BLACK ? 1 + rbBlackHeight(node.left) : rbBlackHeight(node.left);
};
