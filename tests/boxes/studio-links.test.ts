import { describe, expect, it } from "vitest";
import { studioModelHref, studioSavedHref } from "@/app/components/boxes/studio-links";

describe("studio links", () => {
  it("points a saved box at the studio with its id", () => {
    expect(studioSavedHref("demo-box1")).toBe("/studio?saved=demo-box1");
    expect(studioSavedHref("a b")).toBe("/studio?saved=a%20b");
  });

  it("carries catalogue size and identity into the studio", () => {
    const href = studioModelHref({
      modelId: "100010",
      name: "Cardboard gable box mockup",
      image: "https://cdn.example/box.jpg",
      length: 302,
      width: 152,
      height: 182,
      thickness: 0.4,
    });
    const url = new URL(href, "https://vibgyor.art");
    expect(url.pathname).toBe("/studio");
    expect(url.searchParams.get("modelId")).toBe("100010");
    expect(url.searchParams.get("name")).toBe("Cardboard gable box mockup");
    expect(url.searchParams.get("length")).toBe("302");
    expect(url.searchParams.get("width")).toBe("152");
    expect(url.searchParams.get("height")).toBe("182");
    expect(url.searchParams.get("image")).toBe("https://cdn.example/box.jpg");
  });
});
