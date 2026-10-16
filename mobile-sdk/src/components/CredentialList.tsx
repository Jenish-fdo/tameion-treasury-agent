import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import type { Credential, CredentialStatus } from '../types';
import { defaultTheme, type CredentiaTheme } from './theme';

export interface CredentialListProps {
  credentials: Credential[];
  onCredentialPress?: (credential: Credential) => void;
  emptyMessage?: string;
  theme?: Partial<CredentiaTheme>;
}

const STATUS: Record<CredentialStatus, { text: string; symbol: string }> = {
  ACTIVE: { text: 'ACTIVE', symbol: '●' },
  EXPIRED: { text: 'EXPIRED', symbol: '◌' },
  REVOKED: { text: 'REVOKED', symbol: '✕' },
  NOT_FOUND: { text: 'NOT FOUND', symbol: '?' },
};
const short = (v: string) => (v.length > 12 ? `${v.slice(0, 6)}…${v.slice(-4)}` : v);
const expiry = (c: Credential) => (c.expiresAt ? `Expires ${new Date(c.expiresAt * 1000).toISOString().slice(0, 10)}` : 'No expiry');

/** Credentials as rows: type, issuer, status (text + symbol) and expiry. Loading and error states belong to the parent hook. */
export function CredentialList({ credentials, onCredentialPress, emptyMessage = 'No credentials found.', theme }: CredentialListProps) {
  const t = { ...defaultTheme, ...theme };
  if (credentials.length === 0) {
    return (
      <View accessible accessibilityLabel={emptyMessage}>
        <Text style={{ color: t.mutedText }}>{emptyMessage}</Text>
      </View>
    );
  }
  return (
    <FlatList
      data={credentials}
      keyExtractor={(c: Credential) => c.id}
      renderItem={({ item }: { item: Credential }) => {
        const s = STATUS[item.status];
        const label = `${item.type}, issued by ${short(item.issuer) || 'unknown issuer'}, status ${s.text}, ${expiry(item)}`;
        const row = (
          <View style={{ borderBottomWidth: 1, borderColor: t.border, paddingVertical: 8 }}>
            <Text style={{ color: t.text, fontWeight: '700' }}>{item.type}</Text>
            <Text style={{ color: t.mutedText }}>{`Issuer ${short(item.issuer) || 'unknown'}`}</Text>
            <Text style={{ color: t.text }}>{`${s.symbol} ${s.text}`}</Text>
            <Text style={{ color: t.mutedText, fontSize: 12 }}>{expiry(item)}</Text>
          </View>
        );
        return onCredentialPress ? (
          <Pressable onPress={() => onCredentialPress(item)} accessibilityRole="button" accessibilityLabel={label}>
            {row}
          </Pressable>
        ) : (
          <View accessible accessibilityLabel={label}>
            {row}
          </View>
        );
      }}
    />
  );
}
