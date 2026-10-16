/** Stand-in for react-native's primitives, so components can be rendered with react-test-renderer in Node. */
import React from 'react';

type P = Record<string, unknown> & { children?: React.ReactNode };
export const View = (p: P) => React.createElement('View', p, p.children);
export const Text = (p: P) => React.createElement('Text', p, p.children);
export const Pressable = (p: P) => React.createElement('Pressable', p, p.children);
export const FlatList = (p: { data: unknown[]; renderItem: (a: { item: unknown; index: number }) => React.ReactNode; keyExtractor?: (i: unknown) => string }) =>
  React.createElement('FlatList', null, p.data.map((item, index) => React.createElement(React.Fragment, { key: p.keyExtractor ? p.keyExtractor(item) : index }, p.renderItem({ item, index }))));
