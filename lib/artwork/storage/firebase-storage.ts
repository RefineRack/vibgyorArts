import type { ObjectStorage, PutOptions } from "@/lib/artwork/storage/object-storage";
import { assertKey } from "@/lib/artwork/storage/object-storage";

// Firebase Storage adapter (server only). Uses the Admin SDK so Storage rules
// can stay closed to browsers. Credentials come from FIREBASE_SERVICE_ACCOUNT_JSON
// or Application Default Credentials; never from the repo.
// TODO(Q1): confirm Firebase Storage is where generated assets should live.

type Bucket = {
  file(name: string): {
    save(data: Uint8Array, options: { contentType?: string; metadata?: { metadata?: Record<string, string> } }): Promise<unknown>;
    download(): Promise<[Uint8Array]>;
    exists(): Promise<[boolean]>;
    delete(options?: { ignoreNotFound?: boolean }): Promise<unknown>;
  };
  getFiles(options: { prefix: string }): Promise<[{ name: string }[]]>;
};

const APP_NAME = "vibgyor-artwork-pipeline";

async function defaultBucket(bucketName: string): Promise<Bucket> {
  const { cert, applicationDefault, getApps, initializeApp } = await import("firebase-admin/app");
  const { getStorage } = await import("firebase-admin/storage");
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const app =
    getApps().find((item) => item.name === APP_NAME) ??
    initializeApp(
      {
        credential: json ? cert(JSON.parse(json)) : applicationDefault(),
        storageBucket: bucketName,
      },
      APP_NAME,
    );
  return getStorage(app).bucket(bucketName) as unknown as Bucket;
}

export class FirebaseObjectStorage implements ObjectStorage {
  private bucketPromise: Promise<Bucket> | null = null;

  constructor(
    private readonly bucketName: string,
    private readonly prefix: string,
    private readonly bucketFactory: (name: string) => Promise<Bucket> = defaultBucket,
  ) {}

  private bucket() {
    this.bucketPromise ??= this.bucketFactory(this.bucketName);
    return this.bucketPromise;
  }

  private name(key: string) {
    assertKey(key);
    return `${this.prefix}/${key}`;
  }

  async put(key: string, data: Uint8Array | string, options: PutOptions = {}) {
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    await (await this.bucket())
      .file(this.name(key))
      .save(bytes, { contentType: options.contentType, metadata: { metadata: options.metadata } });
  }

  async get(key: string) {
    const file = (await this.bucket()).file(this.name(key));
    const [found] = await file.exists();
    if (!found) return null;
    const [data] = await file.download();
    return new Uint8Array(data);
  }

  async exists(key: string) {
    const [found] = await (await this.bucket()).file(this.name(key)).exists();
    return found;
  }

  async list(prefix: string) {
    const [files] = await (await this.bucket()).getFiles({ prefix: `${this.prefix}/${prefix}` });
    return files.map((file) => file.name.slice(this.prefix.length + 1)).sort();
  }

  async delete(key: string) {
    await (await this.bucket()).file(this.name(key)).delete({ ignoreNotFound: true });
  }
}
