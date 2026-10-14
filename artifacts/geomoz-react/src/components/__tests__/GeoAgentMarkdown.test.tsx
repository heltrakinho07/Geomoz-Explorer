import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GeoAgentMarkdown } from "../GeoAgentMarkdown";

describe("GeoAgentMarkdown", () => {
  it("renders bold, headings, lists and tables without printing markdown syntax", () => {
    const html = renderToStaticMarkup(<GeoAgentMarkdown text={"### Mapa geológico\n\n**Litologia:** Migmatitic paragneiss\n\n- Granito\n- Gnaisse\n\n| Unidade | Área |\n| --- | --- |\n| Granito | 10 km² |"} />);
    expect(html).toContain("<strong");
    expect(html).toContain("Litologia:");
    expect(html).toContain("<h4");
    expect(html).toContain("<ul");
    expect(html).toContain("<table");
    expect(html).not.toContain("**Litologia:**");
  });
  it("escapes HTML injected as geologic attribute labels", () => {
    const html = renderToStaticMarkup(<GeoAgentMarkdown text={"**Unidade:** <img src=x onerror=alert(1)>"} />);
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });
});
