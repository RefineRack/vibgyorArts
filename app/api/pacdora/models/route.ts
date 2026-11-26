import { englishNames } from "@/lib/english-names";
import { toBoxModel } from "@/lib/pacdora-models";
import { PacdoraRequestError, pacdoraGet } from "@/lib/pacdora-server";

const PAGE_SIZE = 24;

export async function GET(request: Request) {
  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
  if (!Number.isInteger(page) || page < 1 || page > 500) {
    return Response.json({ error: "Bad page" }, { status: 400 });
  }

  try {
    const body = await pacdoraGet("/open/v2/models", {
      mockupNameKey: "box-mockups",
      current: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (!Array.isArray(body.data)) {
      return Response.json({ error: "Pacdora rejected the request" }, { status: 502 });
    }
    let names = new Map<string, string>();
    try {
      names = await englishNames();
    } catch (error) {
      console.error("[english-names]", error instanceof Error ? error.message : "unavailable");
    }
    const models = body.data
      .map((item) => toBoxModel(item as Parameters<typeof toBoxModel>[0]))
      .filter((item) => item !== null)
      .map((model) => {
        const english = names.get(model.modelId);
        return english ? { ...model, name: english } : model;
      });
    return Response.json({
      models,
      page,
      pageSize: PAGE_SIZE,
      total: typeof body.total === "number" ? body.total : models.length,
    });
  } catch (error) {
    const status = error instanceof PacdoraRequestError ? error.status : 502;
    const message = error instanceof PacdoraRequestError ? error.message : "Pacdora is unavailable";
    return Response.json({ error: message }, { status });
  }
}
