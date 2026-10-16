import { Address, Banner, Box, Divider, Heading, Row, Section, Text } from '@metamask/snaps-sdk/jsx';
import type { SnapComponent } from '@metamask/snaps-sdk/jsx';
import type { TrustProfile, UnavailableReason } from '../types/trust';
import { CATEGORY_MESSAGE, CATEGORY_TITLE, DISCLAIMER } from '../utils/score';

const isoOrNone = (sec?: number): string => (sec ? new Date(sec * 1000).toISOString().replace('.000Z', 'Z') : 'not recorded');

const UNAVAILABLE_TEXT: Record<UnavailableReason, string> = {
  not_configured: 'The Credentia API is not configured for this Snap.',
  timeout: 'The Credentia API did not respond in time.',
  network: 'The Credentia API could not be reached.',
  auth: 'The Credentia API rejected this Snap’s credentials.',
  rate_limited: 'The Credentia API is rate limiting requests.',
  server: 'The Credentia API reported a problem.',
  bad_response: 'The Credentia API returned an unexpected response.',
};

/** Shown whenever there is no usable data. It deliberately carries no score and no trust wording. */
export const UnavailableInsight = ({ reason, network }: { reason: UnavailableReason; network: string }): SnapComponent => (
  <Box>
    <Heading>CREDENTIA / NO TRUST DATA</Heading>
    <Text>{UNAVAILABLE_TEXT[reason]}</Text>
    <Row label="Network"><Text>{network}</Text></Row>
    <Text>Credentia could not check this recipient. That is not a sign the recipient is safe: verify the recipient before signing.</Text>
    <Text>{DISCLAIMER}</Text>
  </Box>
);

export const UnsupportedNetworkInsight = (): SnapComponent => (
  <Box>
    <Heading>CREDENTIA</Heading>
    <Text>Credentia trust lookup is unavailable for this network.</Text>
    <Text>{DISCLAIMER}</Text>
  </Box>
);

export const NoRecipientInsight = ({ reason }: { reason: string }): SnapComponent => (
  <Box>
    <Heading>CREDENTIA</Heading>
    <Text>{reason}</Text>
    <Text>{DISCLAIMER}</Text>
  </Box>
);

export const TrustInsight = ({ profile, network, viaToken }: { profile: TrustProfile; network: string; viaToken: boolean }): SnapComponent => (
  <Box>
    <Heading>{`CREDENTIA / ${CATEGORY_TITLE[profile.category]}`}</Heading>
    {profile.source === 'demo' ? <Banner title="DEMO DATA" severity="warning"><Text>Not read from Credentia. For testing only.</Text></Banner> : null}
    <Section>
      <Row label="Recipient"><Address address={profile.address as `0x${string}`} /></Row>
      <Row label="Trust score"><Text>{`${Math.round(profile.score)} / 100`}</Text></Row>
      <Row label="Active credentials"><Text>{profile.activeCredentialCount === null ? 'unavailable' : String(profile.activeCredentialCount)}</Text></Row>
      <Row label="Network"><Text>{network}</Text></Row>
      <Row label="Data timestamp"><Text>{isoOrNone(profile.updatedAt)}</Text></Row>
      {profile.lastActivityAt ? <Row label="Last activity"><Text>{isoOrNone(profile.lastActivityAt)}</Text></Row> : null}
    </Section>
    {viaToken ? <Text>Token transfer: the recipient was read from the transaction data.</Text> : null}
    {profile.credentials && profile.credentials.length > 0 ? (
      <Box>
        <Divider />
        <Text>Credential summary</Text>
        {profile.credentials.slice(0, 5).map((c) => (
          <Text>{`${c.type} (${c.status})`}</Text>
        ))}
      </Box>
    ) : null}
    <Divider />
    {CATEGORY_MESSAGE[profile.category].map((line) => (
      <Text>{line}</Text>
    ))}
    <Text>{DISCLAIMER}</Text>
  </Box>
);
