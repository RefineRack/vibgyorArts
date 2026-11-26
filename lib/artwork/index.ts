// Packdora artwork pipeline (phases 0–2): dieline library, prompt composer and
// per-panel generation. Server-side only.
export * from "@/lib/artwork/types";
export * from "@/lib/artwork/config";
export * from "@/lib/artwork/storage";
export * from "@/lib/artwork/records/repository";
export * from "@/lib/artwork/dieline/geometry";
export * from "@/lib/artwork/dieline/parse";
export * from "@/lib/artwork/dieline/register";
export * from "@/lib/artwork/dieline/pacdora";
export * from "@/lib/artwork/prompt/template";
export * from "@/lib/artwork/prompt/layout";
export * from "@/lib/artwork/prompt/compose-prompt";
export * from "@/lib/artwork/generate/sizing";
export * from "@/lib/artwork/generate/image-generator";
export * from "@/lib/artwork/generate/image-info";
export * from "@/lib/artwork/generate/fake-generator";
export * from "@/lib/artwork/generate/gemini";
export * from "@/lib/artwork/generate/runner";
export * from "@/lib/artwork/brief";
export * from "@/lib/artwork/assets";
export * from "@/lib/artwork/jobs";
