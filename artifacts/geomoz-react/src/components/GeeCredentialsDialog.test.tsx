import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import GeeCredentialsDialog from "@/components/GeeCredentialsDialog";

const mocks = vi.hoisted(() => ({
  connectGee: vi.fn(),
  disconnectGee: vi.fn(),
  refreshStatus: vi.fn(),
  diagnose: vi.fn(),
  connected: false,
  oauthReady: true,
  loading: false,
  error: null as string | null,
}));

vi.mock("../hooks/useGeeAuth", () => ({
  useGeeAuth: () => ({
    geeConnected: mocks.connected,
    oauthReady: mocks.oauthReady,
    loading: mocks.loading,
    error: mocks.error,
    connectGee: mocks.connectGee,
    disconnectGee: mocks.disconnectGee,
    refreshStatus: mocks.refreshStatus,
  }),
}));
vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: { email: "cientista@example.org" } }),
}));
vi.mock("@/lib/gee-connection-diagnostics", () => ({
  diagnoseGeeApi: (...args: unknown[]) => mocks.diagnose(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connected = false;
  mocks.oauthReady = true;
  mocks.loading = false;
  mocks.error = null;
  mocks.connectGee.mockResolvedValue(undefined);
  mocks.refreshStatus.mockResolvedValue(undefined);
  mocks.diagnose.mockResolvedValue({
    connected: true,
    apiOnline: true,
    message: "API disponível",
  });
});
afterEach(() => cleanup());

describe("GeoMoz Google Earth Engine dialog", () => {
  it("binds the project ID field to its visible label and passes it to OAuth", async () => {
    const onOpenChange = vi.fn();
    render(<GeeCredentialsDialog open onOpenChange={onOpenChange} />);
    expect(screen.getByTestId("geomoz-gee-credentials-dialog")).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: /GCP Project ID/ });
    expect(input).toHaveAttribute("id", "geomoz-gee-project-id");
    fireEvent.change(input, { target: { value: "  projecto-teste-gee  " } });
    fireEvent.click(screen.getByRole("button", { name: /Ligar com a Conta Google/ }));
    await waitFor(() => expect(mocks.connectGee).toHaveBeenCalledWith("projecto-teste-gee"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("diagnoses the GEE API and updates the visible diagnostic state", async () => {
    render(<GeeCredentialsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Voltar a verificar a API/ }));
    await waitFor(() => expect(mocks.diagnose).toHaveBeenCalledOnce());
    expect(await screen.findByRole("status")).toHaveTextContent("API disponível");
    await waitFor(() => expect(mocks.refreshStatus).toHaveBeenCalledOnce());
  });

  it("displays connection failures as accessible alerts", () => {
    mocks.error = "OAuth indisponível";
    render(<GeeCredentialsDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("OAuth indisponível");
  });

  it("shows the existing account and disconnect action when GEE is connected", () => {
    mocks.connected = true;
    render(<GeeCredentialsDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByText("Earth Engine Ligado")).toBeInTheDocument();
    expect(screen.getByText("cientista@example.org")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Terminar Sessão/ }));
    expect(mocks.disconnectGee).toHaveBeenCalledOnce();
  });
});
