import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * The CredentialRegistry only stores a hash of the credential payload (`dataHash`), so the
 * human-readable type and metadata URI live here. Each record is re-verified against the
 * on-chain hash before being served, so a corrupted/edited store cannot forge metadata.
 *
 * File-backed JSON for now; swap for Prisma/Postgres by implementing this interface.
 */
export interface CredentialRecord {
  credentialId: `0x${string}`;
  issuer: string;
  subject: string;
  credentialType: string;
  metadataUri: string;
  dataHash: `0x${string}`;
  txHash: `0x${string}`;
  createdAt: number;
}

export interface CredentialStore {
  put(record: CredentialRecord): Promise<void>;
  get(credentialId: string): Promise<CredentialRecord | undefined>;
  remove(credentialId: string): Promise<void>;
  listBySubject(subject: string): Promise<CredentialRecord[]>;
}

export class FileCredentialStore implements CredentialStore {
  private records = new Map<string, CredentialRecord>();
  private loaded?: Promise<void>;
  private writeChain: Promise<void> = Promise.resolve();
  private readonly file: string;

  constructor(dir: string) {
    this.file = path.resolve(dir, 'credentials.json');
  }

  private load(): Promise<void> {
    this.loaded ??= (async () => {
      try {
        const raw = JSON.parse(await readFile(this.file, 'utf8')) as CredentialRecord[];
        for (const r of raw) this.records.set(r.credentialId.toLowerCase(), r);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.error(`Could not read credential store ${this.file}: ${(err as Error).message}`);
          throw err;
        }
      }
    })();
    return this.loaded;
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify([...this.records.values()], null, 2);
    // Serialise writes; write to a temp file then rename so a crash never leaves a half-written file.
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, snapshot, { mode: 0o600 });
      await rename(tmp, this.file);
    });
    return this.writeChain;
  }

  async put(record: CredentialRecord): Promise<void> {
    await this.load();
    this.records.set(record.credentialId.toLowerCase(), record);
    await this.persist();
  }

  async get(credentialId: string): Promise<CredentialRecord | undefined> {
    await this.load();
    return this.records.get(credentialId.toLowerCase());
  }

  async remove(credentialId: string): Promise<void> {
    await this.load();
    if (this.records.delete(credentialId.toLowerCase())) await this.persist();
  }

  async listBySubject(subject: string): Promise<CredentialRecord[]> {
    await this.load();
    const s = subject.toLowerCase();
    return [...this.records.values()].filter((r) => r.subject.toLowerCase() === s);
  }
}

export const credentialStore: CredentialStore = new FileCredentialStore(config.dataDir);
