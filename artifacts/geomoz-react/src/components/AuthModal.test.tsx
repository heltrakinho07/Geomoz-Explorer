import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AuthModal from "@/components/AuthModal";

const authMocks = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(),
  signInWithEmail: vi.fn(),
  registerWithEmail: vi.fn(),
  resetPassword: vi.fn(),
  continueAsGuest: vi.fn(),
  clearError: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
    isGuest: false,
    error: null,
    ...authMocks,
  }),
}));
vi.mock("@/lib/firebase", () => ({
  auth: { currentUser: null },
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/", authMocks.navigate],
}));

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.signInWithEmail.mockResolvedValue(undefined);
  authMocks.registerWithEmail.mockResolvedValue(undefined);
  authMocks.signInWithGoogle.mockResolvedValue(undefined);
  authMocks.resetPassword.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe("GeoMoz authentication modal", () => {
  it("provides accessible login and registration tabs with labelled fields", () => {
    render(<AuthModal isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId("geomoz-auth-dialog")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Iniciar Sessão" })).toHaveAttribute(
      "aria-selected", "true",
    );
    expect(screen.getByLabelText("Endereço de E-mail")).toHaveAttribute(
      "autocomplete", "email",
    );
    expect(screen.getByLabelText("Palavra-passe")).toHaveAttribute(
      "autocomplete", "current-password",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Criar Nova Conta" }));
    expect(screen.getByRole("tab", { name: "Criar Nova Conta" })).toHaveAttribute(
      "aria-selected", "true",
    );
    expect(screen.getByLabelText("Nome Completo")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirmar Palavra-passe")).toHaveAttribute(
      "autocomplete", "new-password",
    );
  });

  it("does not submit a registration with mismatched passwords", async () => {
    render(<AuthModal isOpen onClose={vi.fn()} initialMode="register" />);
    fireEvent.change(screen.getByLabelText("Endereço de E-mail"), {
      target: { value: "ana@example.org" },
    });
    fireEvent.change(screen.getByLabelText("Palavra-passe"), {
      target: { value: "abcdef12" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar Palavra-passe"), {
      target: { value: "zzzzzz12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Registar e Começar/ }));
    await waitFor(() => {
      expect(screen.getByText(/palavras-passe introduzidas não coincidem/i)).toBeInTheDocument();
    });
    expect(authMocks.registerWithEmail).not.toHaveBeenCalled();
  });

  it("passes verified registration data to the authentication service", async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    render(<AuthModal isOpen onClose={onClose} onSuccess={onSuccess} initialMode="register" />);
    fireEvent.change(screen.getByLabelText("Nome Completo"), {
      target: { value: "Ana Silva" },
    });
    fireEvent.change(screen.getByLabelText("Endereço de E-mail"), {
      target: { value: "ana@example.org" },
    });
    fireEvent.change(screen.getByLabelText("Palavra-passe"), {
      target: { value: "abcdef12" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar Palavra-passe"), {
      target: { value: "abcdef12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Registar e Começar/ }));

    await waitFor(() => expect(authMocks.registerWithEmail).toHaveBeenCalledWith(
      "ana@example.org", "abcdef12", "Ana Silva",
    ));
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sends a password reset without exposing a password field", async () => {
    render(<AuthModal isOpen onClose={vi.fn()} initialMode="forgot" />);
    expect(screen.queryByLabelText("Palavra-passe")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Endereço de E-mail"), {
      target: { value: "utilizador@example.org" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Enviar E-mail de Recuperação/ }));
    await waitFor(() => expect(authMocks.resetPassword).toHaveBeenCalledWith(
      "utilizador@example.org",
    ));
    expect(await screen.findByText("E-mail enviado!")).toBeInTheDocument();
  });

  it("opens guest mode without pretending Firebase authentication succeeded", () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    render(<AuthModal isOpen onClose={onClose} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: /Continuar como Convidado/ }));
    expect(authMocks.continueAsGuest).toHaveBeenCalledTimes(1);
    expect(authMocks.navigate).toHaveBeenCalledWith("/app");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("executes the Google sign-in action without storing a credential in the form", async () => {
    const onClose = vi.fn();
    render(<AuthModal isOpen onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Continuar com Google/ }));
    await waitFor(() => expect(authMocks.signInWithGoogle).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
