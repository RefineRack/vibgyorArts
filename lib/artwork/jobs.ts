import { randomUUID } from "node:crypto";
import type { ArtworkRepository } from "@/lib/artwork/records/repository";
import type { Job, JobBrief } from "@/lib/artwork/types";

export async function createJob(
  repo: ArtworkRepository,
  input: { boxId: string; customerName: string; brandName: string; brief: JobBrief },
  now: () => Date = () => new Date(),
): Promise<Job> {
  if (!(await repo.getBox(input.boxId))) throw new Error(`Box ${input.boxId} is not registered.`);
  const stamp = now().toISOString();
  const job: Job = { id: randomUUID(), ...input, status: "draft", createdAt: stamp, updatedAt: stamp };
  await repo.saveJob(job);
  return job;
}
