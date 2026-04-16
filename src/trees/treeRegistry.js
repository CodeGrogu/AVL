import { bstDelete, bstInsert } from "./baseTree";
import {
  avlDelete,
  avlDeleteTrace,
  avlInsert,
  avlInsertTrace,
  avlRootBalance,
} from "./avlTree";
import {
  rbBlackHeight,
  rbDelete,
  rbDeleteTrace,
  rbInsert,
  rbInsertTrace,
} from "./rbTree";

export const TREE_CONFIG = {
  BST: {
    key: "BST",
    tab: "bst",
    title: "Binary Search Tree",
    shortLabel: "BST",
    summary: "Simple ordered tree. Fast on average, but can degrade if unbalanced.",
    insert: bstInsert,
    remove: bstDelete,
    traceInsert: (root, value) => {
      const next = bstInsert(root, value);
      return {
        root: next,
        frames: [
          {
            root: next,
            label: `BST link update for ${value}`,
            focus: [value],
            kind: "insert",
            explanation: "BST insertion updates links only; no balancing rotations are applied.",
          },
        ],
      };
    },
    traceRemove: (root, value) => {
      const next = bstDelete(root, value);
      return {
        root: next,
        frames: [
          {
            root: next,
            label: `BST link update for ${value}`,
            focus: [value],
            kind: "delete",
            explanation: "BST deletion rewires local links but does not rebalance tree height.",
          },
        ],
      };
    },
    extraMetric: () => null,
  },
  AVL: {
    key: "AVL",
    tab: "avl",
    title: "AVL Tree",
    shortLabel: "AVL",
    summary: "BST with strict height balancing using rotations.",
    insert: avlInsert,
    remove: avlDelete,
    traceInsert: avlInsertTrace,
    traceRemove: avlDeleteTrace,
    extraMetric: (root) => (root ? `Root BF: ${avlRootBalance(root) > 0 ? "+" : ""}${avlRootBalance(root)}` : null),
  },
  RB: {
    key: "RB",
    tab: "rb",
    title: "Red-Black Tree",
    shortLabel: "Red-Black",
    summary: "BST with color rules that guarantee logarithmic height.",
    insert: rbInsert,
    remove: rbDelete,
    traceInsert: rbInsertTrace,
    traceRemove: rbDeleteTrace,
    extraMetric: (root) => (root ? `Black-height: ${rbBlackHeight(root)}` : null),
  },
};

export const TREE_TYPE_ORDER = ["BST", "AVL", "RB"];

export const TAB_TO_TYPE = {
  bst: "BST",
  avl: "AVL",
  rb: "RB",
};

export const TYPE_TO_TAB = {
  BST: "bst",
  AVL: "avl",
  RB: "rb",
};
