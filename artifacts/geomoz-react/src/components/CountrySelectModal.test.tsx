import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CountrySelectModal from "@/components/CountrySelectModal";

afterEach(() => cleanup());

describe("GeoMoz country selector", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exposes a named modal dialog and focuses the country search", async () => {
    const origin = document.createElement("button");
    origin.textContent = "Abrir países";
    document.body.append(origin);
    origin.focus();
    const onClose = vi.fn();
    const { rerender, unmount } = render(
      <CountrySelectModal isOpen onClose={onClose} onSelect={vi.fn()} />,
    );
    const dialog = screen.getByRole("dialog", { name: /Selecionar País do Mundo/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-describedby", "geomoz-country-description");
    await waitFor(() => expect(screen.getByRole("searchbox", {
      name: "Pesquisar países",
    })).toHaveFocus());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<CountrySelectModal isOpen={false} onClose={onClose} onSelect={vi.fn()} />);
    await waitFor(() => expect(origin).toHaveFocus());
    unmount();
    origin.remove();
  });

  it("filters by country and selects an ISO-coded result", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<CountrySelectModal isOpen onClose={onClose} onSelect={onSelect} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Pesquisar países" }), {
      target: { value: "MOZ" },
    });
    const dialog = screen.getByTestId("geomoz-country-select-dialog");
    const matches = Array.from(dialog.querySelectorAll("button")).filter(
      button => button.textContent?.includes("MOZ"),
    );
    expect(matches.length).toBeGreaterThan(0);
    fireEvent.click(matches[matches.length - 1]);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ code: "MOZ" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("provides pressed-state feedback for continent chips", () => {
    render(<CountrySelectModal isOpen onClose={vi.fn()} onSelect={vi.fn()} />);
    const africa = screen.getByRole("button", { name: "África" });
    fireEvent.click(africa);
    expect(africa).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Todos" })).toHaveAttribute(
      "aria-pressed", "false",
    );
  });
});
