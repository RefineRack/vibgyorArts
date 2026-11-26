import type { ArtworkConfig } from "@/lib/artwork/config";
import { FirebaseObjectStorage } from "@/lib/artwork/storage/firebase-storage";
import { LocalObjectStorage, MemoryObjectStorage, type ObjectStorage } from "@/lib/artwork/storage/object-storage";

export * from "@/lib/artwork/storage/object-storage";
export { FirebaseObjectStorage } from "@/lib/artwork/storage/firebase-storage";

export function createObjectStorage(config: ArtworkConfig): ObjectStorage {
  const { driver, localRoot, bucket, prefix } = config.storage;
  if (driver === "memory") return new MemoryObjectStorage();
  if (driver === "local") return new LocalObjectStorage(localRoot);
  if (!bucket) throw new Error("Set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET or ARTWORK_STORAGE_BUCKET for Firebase Storage.");
  return new FirebaseObjectStorage(bucket, prefix);
}
