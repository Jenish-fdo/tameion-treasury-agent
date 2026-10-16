import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { TrustScore, TrustScoreCategory } from '../types';
import { defaultTheme, type CredentiaTheme } from './theme';

export interface TrustScoreBadgeProps {
  score: TrustScore;
  compact?: boolean;
  onPress?: () => void;
  theme?: Partial<CredentiaTheme>;
}

const LABEL: Record<TrustScoreCategory, string> = { LOW: 'LOW TRUST', LIMITED: 'LIMITED EVIDENCE', STRONGER: 'STRONGER EVIDENCE', UNKNOWN: 'NO TRUST DATA' };
const SYMBOL: Record<TrustScoreCategory, string> = { LOW: '▼', LIMITED: '◆', STRONGER: '▲', UNKNOWN: '?' };
export const BADGE_DISCLAIMER = 'A trust score is a signal, not a guarantee of safety.';

/** Score + category as text and a symbol (colour is only an extra). Demo data is labelled as such. */
export function TrustScoreBadge({ score, compact = false, onPress, theme }: TrustScoreBadgeProps) {
  const t = { ...defaultTheme, ...theme };
  const color = { LOW: t.low, LIMITED: t.limited, STRONGER: t.stronger, UNKNOWN: t.unknown }[score.category];
  const value = score.category === 'UNKNOWN' ? '—' : `${Math.round(score.score)}/100`;
  const label = `${LABEL[score.category]}${score.category === 'UNKNOWN' ? '' : `, trust score ${Math.round(score.score)} out of 100`}${score.source === 'demo' ? ', demo data' : ''}. ${BADGE_DISCLAIMER}`;

  const body = (
    <View style={{ borderWidth: 1, borderColor: color, borderLeftWidth: 4, backgroundColor: t.background, padding: compact ? 6 : 12, borderRadius: 4 }}>
      <Text style={{ color: t.text, fontWeight: '700' }}>{`${SYMBOL[score.category]} ${LABEL[score.category]}  ${value}`}</Text>
      {score.source === 'demo' ? <Text style={{ color: t.mutedText, fontSize: 11 }}>DEMO DATA</Text> : null}
      {compact ? null : <Text style={{ color: t.mutedText, fontSize: 12, marginTop: 4 }}>{BADGE_DISCLAIMER}</Text>}
    </View>
  );

  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {body}
    </Pressable>
  ) : (
    <View accessible accessibilityRole="text" accessibilityLabel={label}>
      {body}
    </View>
  );
}
