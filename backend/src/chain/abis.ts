import { parseAbi } from 'viem';

// Mirrors contracts/src/CredentialRegistry.sol (as implemented).
export const credentialRegistryAbi = parseAbi([
  'struct Credential { address issuer; address holder; bytes32 credentialType; bytes32 dataHash; uint64 issuedAt; uint64 expiryTimestamp; bool revoked; }',
  'struct CredentialRequest { address holder; bytes32 credentialType; bytes32 dataHash; uint256 expiryTimestamp; uint256 nonce; uint256 deadline; }',
  'function nonceUsed(address signer, uint256 nonce) view returns (bool)',
  'function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)',
  'function isAuthorizedIssuer(address issuer) view returns (bool)',
  'function verifyCredential(bytes32 id) view returns (bool valid)',
  'function getCredential(bytes32 id) view returns (Credential credential)',
  'function issueCredentialWithSig(CredentialRequest request, bytes signature) returns (bytes32 id)',
  'error NotAuthorizedIssuer(address caller)',
  'error CredentialAlreadyExists(bytes32 id)',
  'error CredentialNotFound(bytes32 id)',
  'error InvalidExpiry(uint256 expiry)',
  'error SignatureExpired(uint256 deadline)',
  'error InvalidHolder()',
]);

export const CREDENTIAL_REQUEST_TYPES = {
  CredentialRequest: [
    { name: 'holder', type: 'address' },
    { name: 'credentialType', type: 'bytes32' },
    { name: 'dataHash', type: 'bytes32' },
    { name: 'expiryTimestamp', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;
