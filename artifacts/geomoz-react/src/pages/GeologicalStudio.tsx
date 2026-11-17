import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Layers3, Play, Download, FolderOpen } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProject } from "@/context/ProjectContext";
import { useGeoMozPreferences } from "@/hooks/useGeoMozPreferences";
import ProjectWorkspaceModal from "@/components/ProjectWorkspaceModal";
import GeologicalViewer from "@/components/geology/GeologicalViewer";
import { mozambiqueAOI } from "@/lib/aoi";
import { apiFetch } from "@/lib/api";
import {
  activeJob,
  downloadGeology,
  geologyCsv,
  parseGeologicalModel,
  parseGeologicalResult,
  parseGeologyCsv,
  type GeologicalModel,
  type GeologicalResult,
  type GeologicalJob,
} from "@/lib/geological-model";
import "@/components/geology/geological-studio.css";
type Capabilities = {
  configured: boolean;
  canCompute: boolean;
  entitled: boolean;
  monthlyLimit: number;
};
const palette = [
  "#edb769",
  "#62b9ad",
  "#ac91db",
  "#ef6b73",
  "#82b4e7",
  "#d89c9c",
  "#90ba70",
  "#bca982",
];
async function request<T>(
  path: string,
  signal: AbortSignal,
  options: RequestInit = {},
): Promise<T> {
  const response = await apiFetch("/geomoz-api/geology" + path, {
    ...options,
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : `HTTP ${response.status}`,
    );
  return data;
}
export default function GeologicalStudio() {
  const { user } = useAuth();
  const { activeProject } = useProject();
  return <Studio key={`${user?.uid}/${activeProject?.id ?? "none"}`} />;
}
function Studio() {
  const { language } = useGeoMozPreferences(),
    pt = language.toLowerCase().startsWith("pt"),
    t = (a: string, b: string) => (pt ? a : b);
  const { activeProject, projects, setActiveProjectId } = useProject();
  const [projectModal, setProjectModal] = useState(false),
    [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [model, setModel] = useState<GeologicalModel | null>(null),
    [contacts, setContacts] = useState(""),
    [orientations, setOrientations] = useState("");
  const [job, setJob] = useState<GeologicalJob | null>(null),
    [history, setHistory] = useState<GeologicalJob[]>([]),
    [result, setResult] = useState<GeologicalResult | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [deleting, setDeleting] = useState<string | null>(null);
  const lifecycle = useRef<AbortController | null>(null),
    idempotency = useRef<{ body: string; key: string } | null>(null);
  const signal = () => {
    if (!lifecycle.current) lifecycle.current = new AbortController();
    return lifecycle.current.signal;
  };
  const install = (data: GeologicalModel) => {
    setModel(data);
    setContacts(geologyCsv(data.contacts, "contacts"));
    setOrientations(geologyCsv(data.orientations, "orientations"));
  };
  const reloadHistory = async () => {
    if (activeProject) {
      const data = await request<GeologicalJob[]>(
        `/jobs?project_id=${encodeURIComponent(activeProject.id)}`,
        signal(),
      );
      if (!signal().aborted) setHistory(data);
    }
  };
  useEffect(() => {
    const abort = new AbortController();
    lifecycle.current = abort;
    void request<Capabilities>("/capabilities", abort.signal)
      .then((data) => {
        if (!abort.signal.aborted) setCapabilities(data);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    void request<GeologicalModel>("/examples/strata", abort.signal)
      .then((data) => {
        if (!abort.signal.aborted) install(parseGeologicalModel(data));
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    void reloadHistory().catch((e) => {
      if (!abort.signal.aborted) setError(e.message);
    });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    if (!activeJob(job)) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await request<GeologicalJob>(
          `/jobs/${job!.id}`,
          abort.signal,
        );
        if (abort.signal.aborted) return;
        if (next.status === "succeeded") {
          const output = parseGeologicalResult(
            await request(`/jobs/${next.id}/result`, abort.signal),
          );
          if (abort.signal.aborted) return;
          setResult(output);
          setNotice(
            t("Modelo guardado no projecto.", "Model saved to project."),
          );
        }
        setJob(next);
        if (!activeJob(next)) {
          if (next.error) setError(next.error);
          void reloadHistory().catch(() => {});
          return;
        }
      } catch (e) {
        if (abort.signal.aborted) return;
        setError((e as Error).message);
      }
      timer = setTimeout(poll, 3000);
    };
    timer = setTimeout(poll, 1200);
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [job?.id, job?.status]);
  useEffect(() => {
    if (
      result &&
      model &&
      (JSON.stringify(model) !== JSON.stringify(result.input) ||
        contacts !== geologyCsv(result.input.contacts, "contacts") ||
        orientations !== geologyCsv(result.input.orientations, "orientations"))
    )
      setResult(null);
  }, [model, contacts, orientations, result]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      if (!signal().aborted) setError((e as Error).message);
    } finally {
      if (!signal().aborted) setBusy(false);
    }
  };
  const spec = () => {
    if (!model) throw new Error(t("Carregue um modelo.", "Load a model."));
    return parseGeologicalModel({
      ...model,
      contacts: parseGeologyCsv(contacts, "contacts"),
      orientations: parseGeologyCsv(orientations, "orientations"),
    });
  };
  const changeContacts = (text: string) => {
    setContacts(text);
    try {
      const names = [
        ...new Set(parseGeologyCsv(text, "contacts").map((p) => p.formation)),
      ];
      setModel((old) =>
        old
          ? {
              ...old,
              interfaces: [
                ...old.interfaces.filter((u) => names.includes(u.name)),
                ...names
                  .filter(
                    (name) => !old.interfaces.some((u) => u.name === name),
                  )
                  .map((name, i) => ({
                    name,
                    kind: "layer" as const,
                    color: palette[i % palette.length],
                  })),
              ],
            }
          : old,
      );
    } catch {
      /* Report validation before compute; keep editable text. */
    }
  };
  const loadFile = async (
    file: File | undefined,
    kind: "contacts" | "orientations" | "project",
  ) => {
    if (!file) return;
    await run(async () => {
      if (file.size > (kind === "project" ? 16000000 : 1000000))
        throw new Error(t("Ficheiro demasiado grande.", "File too large."));
      const text = await file.text();
      if (signal().aborted) return;
      if (kind === "project") {
        const data = JSON.parse(text);
        if (data.grid) {
          const output = parseGeologicalResult(data);
          install(output.input);
          setResult(output);
        } else {
          install(parseGeologicalModel(data));
          setResult(null);
        }
        setJob(null);
      } else if (kind === "contacts") {
        parseGeologyCsv(text, "contacts");
        changeContacts(text);
        setResult(null);
        setJob(null);
      } else {
        parseGeologyCsv(text, "orientations");
        setOrientations(text);
        setResult(null);
        setJob(null);
      }
    });
  };
  const compute = () =>
    run(async () => {
      if (!activeProject)
        throw new Error(t("Seleccione um projecto.", "Select a project."));
      const input = spec(),
        body = JSON.stringify(input);
      install(input);
      setResult(null);
      if (idempotency.current?.body !== body)
        idempotency.current = { body, key: crypto.randomUUID() };
      const next = await request<GeologicalJob>(
        `/jobs?project_id=${encodeURIComponent(activeProject.id)}`,
        signal(),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotency.current.key,
          },
          body,
        },
      );
      if (signal().aborted) return;
      setJob(next);
      if (!activeJob(next)) idempotency.current = null;
      if (next.status === "succeeded")
        setResult(
          parseGeologicalResult(
            await request(`/jobs/${next.id}/result`, signal()),
          ),
        );
      await reloadHistory();
    });
  const reopen = (item: GeologicalJob) =>
    run(async () => {
      const input = parseGeologicalModel(
        await request(`/jobs/${item.id}/input`, signal()),
      );
      const output =
        item.status === "succeeded"
          ? parseGeologicalResult(
              await request(`/jobs/${item.id}/result`, signal()),
            )
          : null;
      if (signal().aborted) return;
      install(input);
      setResult(output);
      setJob(item);
      idempotency.current = null;
    });
  const editing = busy || activeJob(job);
  const status = (s: string) =>
    ({
      queued: t("Na fila", "Queued"),
      running: t("A calcular", "Computing"),
      succeeded: t("Concluído", "Completed"),
      failed: t("Falhou", "Failed"),
      cancelled: t("Cancelado", "Cancelled"),
    })[s] ?? s;
  return (
    <main className="geology-studio">
      <header className="geology-header">
        <Link href="/dashboard">
          <ArrowLeft size={18} /> GeoMoz
        </Link>
        <div>
          <span className="geology-eyebrow">
            GEOLOGICAL MODELLING STUDIO · BETA
          </span>
          <h1>{t("Modelação Geológica 3D", "3D Geological Modelling")}</h1>
          <p>
            {t(
              "Dos contactos de campo à interpretação do subsolo.",
              "From field contacts to subsurface interpretation.",
            )}
          </p>
        </div>
        <button onClick={() => setProjectModal(true)}>
          <FolderOpen size={16} />
          {t("Gerir projectos", "Manage projects")}
        </button>
      </header>
      <div className="geology-project">
        <label>
          {t("Projecto activo", "Active project")}
          <select
            value={activeProject?.id ?? ""}
            onChange={(e) => setActiveProjectId(e.target.value)}
          >
            <option value="">
              {t("Seleccione um projecto", "Select a project")}
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <span>
          {t(
            "X/Y/Z em metros · Z = cota, positiva para cima",
            "X/Y/Z in metres · Z = elevation, positive upwards",
          )}
        </span>
      </div>
      {error && (
        <p role="alert" className="geology-alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="geology-notice">
          {notice}
        </p>
      )}
      {capabilities && !capabilities.canCompute && (
        <p className="geology-notice">
          {!capabilities.configured
            ? t(
                "O cálculo na nuvem ainda não está activado. Pode preparar dados e abrir resultados JSON.",
                "Cloud computation is not enabled yet. You can prepare data and open JSON results.",
              )
            : t(
                "O seu plano não inclui cálculo na nuvem. Pode preparar e exportar os dados.",
                "Your plan does not include cloud computation. You can prepare and export data.",
              )}
        </p>
      )}
      <div className="geology-layout">
        <aside>
          <section className="geology-card">
            <h2>
              <Layers3 size={18} />{" "}
              {t("1. Dados e modelo", "1. Data and model")}
            </h2>
            <div className="geology-toolbar">
              {(["strata", "fault"] as const).map((name) => (
                <button
                  key={name}
                  disabled={editing}
                  onClick={() =>
                    run(async () => {
                      const data = parseGeologicalModel(
                        await request(`/examples/${name}`, signal()),
                      );
                      if (!signal().aborted) {
                        install(data);
                        setResult(null);
                        setJob(null);
                        idempotency.current = null;
                      }
                    })
                  }
                >
                  {name === "strata"
                    ? t("Exemplo: estratos", "Example: strata")
                    : t("Exemplo: falha", "Example: fault")}
                </button>
              ))}
            </div>
            <p className="geology-hint">
              {t(
                "Exemplos sintéticos em coordenadas locais. Não representam uma área real.",
                "Synthetic examples in local coordinates. They do not represent a real area.",
              )}
            </p>
            <label className="geology-file">
              {t("Abrir modelo JSON", "Open JSON model")}
              <input
                disabled={editing}
                type="file"
                accept=".json"
                onChange={(e) => {
                  void loadFile(e.target.files?.[0], "project");
                  e.target.value = "";
                }}
              />
            </label>
            {model && (
              <>
                <label className="geology-field">
                  {t("Nome do modelo", "Model name")}
                  <input
                    disabled={editing}
                    value={model.name}
                    maxLength={64}
                    onChange={(e) =>
                      setModel({ ...model, name: e.target.value })
                    }
                  />
                </label>
                <label className="geology-field">
                  {t("Sistema de coordenadas", "Coordinate reference system")}
                  <input
                    disabled={editing}
                    value={model.crs}
                    onChange={(e) =>
                      setModel({ ...model, crs: e.target.value })
                    }
                  />
                </label>
                <p className="geology-hint">
                  {t(
                    "Use um CRS projectado em metros ou LOCAL. A importação não reprojecta coordenadas.",
                    "Use a projected CRS in metres or LOCAL. Import does not reproject coordinates.",
                  )}
                </p>
                <details open>
                  <summary>
                    {t("Contactos geológicos", "Geological contacts")}
                  </summary>
                  <input
                    aria-label={t(
                      "Importar contactos CSV",
                      "Import contacts CSV",
                    )}
                    disabled={editing}
                    type="file"
                    accept=".csv,.txt"
                    onChange={(e) => {
                      void loadFile(e.target.files?.[0], "contacts");
                      e.target.value = "";
                    }}
                  />
                  <textarea
                    aria-label={t("Contactos CSV", "Contacts CSV")}
                    disabled={editing}
                    value={contacts}
                    onChange={(e) => changeContacts(e.target.value)}
                  />
                </details>
                <details>
                  <summary>
                    {t("Orientações estruturais", "Structural orientations")}
                  </summary>
                  <p className="geology-hint">
                    {t(
                      "Azimute = direcção de inclinação, a partir do Norte; não é o rumo. Dip 0–90°, polaridade ±1.",
                      "Azimuth = dip direction clockwise from north, not strike. Dip 0–90°, polarity ±1.",
                    )}
                  </p>
                  <input
                    aria-label={t(
                      "Importar orientações CSV",
                      "Import orientations CSV",
                    )}
                    disabled={editing}
                    type="file"
                    accept=".csv,.txt"
                    onChange={(e) => {
                      void loadFile(e.target.files?.[0], "orientations");
                      e.target.value = "";
                    }}
                  />
                  <textarea
                    aria-label={t("Orientações CSV", "Orientations CSV")}
                    disabled={editing}
                    value={orientations}
                    onChange={(e) => setOrientations(e.target.value)}
                  />
                </details>
              </>
            )}
          </section>
          {model && (
            <section className="geology-card">
              <h2>{t("2. Estrutura e domínio", "2. Structure and domain")}</h2>
              <p className="geology-hint">
                {t(
                  "Interfaces da unidade mais recente à mais antiga. Cada nome identifica a base da unidade; o embasamento é acrescentado abaixo. Uma falha afecta toda a sequência.",
                  "Interfaces from youngest to oldest unit. Each name identifies the unit base; basement is added below. A fault affects the entire sequence.",
                )}
              </p>
              {model.interfaces.map((u, i) => (
                <div key={u.name} className="geology-unit">
                  <input
                    aria-label={`Cor ${u.name}`}
                    type="color"
                    disabled={editing}
                    value={u.color}
                    onChange={(e) =>
                      setModel({
                        ...model,
                        interfaces: model.interfaces.map((a, j) =>
                          j === i ? { ...a, color: e.target.value } : a,
                        ),
                      })
                    }
                  />
                  <span>{u.name}</span>
                  <select
                    aria-label={`Tipo ${u.name}`}
                    disabled={editing}
                    value={u.kind}
                    onChange={(e) =>
                      setModel({
                        ...model,
                        interfaces: model.interfaces.map((a, j) =>
                          j === i
                            ? {
                                ...a,
                                kind: e.target.value as "layer" | "fault",
                              }
                            : a,
                        ),
                      })
                    }
                  >
                    <option value="layer">{t("Camada", "Layer")}</option>
                    <option value="fault">{t("Falha", "Fault")}</option>
                  </select>
                  <button
                    aria-label={`Subir ${u.name}`}
                    disabled={editing || i === 0}
                    onClick={() => {
                      const next = [...model.interfaces];
                      [next[i - 1], next[i]] = [next[i], next[i - 1]];
                      setModel({ ...model, interfaces: next });
                    }}
                  >
                    ↑
                  </button>
                </div>
              ))}
              <div className="geology-bounds">
                {model.extent.map((v, i) => (
                  <label key={i}>
                    {["X min", "X max", "Y min", "Y max", "Z min", "Z max"][i]}{" "}
                    (m)
                    <input
                      disabled={editing}
                      type="number"
                      value={v}
                      onChange={(e) => {
                        const next = [
                          ...model.extent,
                        ] as GeologicalModel["extent"];
                        next[i] = e.target.valueAsNumber;
                        setModel({ ...model, extent: next });
                      }}
                    />
                  </label>
                ))}
              </div>
              <label className="geology-field">
                {t("Resolução da grelha", "Grid resolution")}
                <select
                  disabled={editing}
                  value={model.resolution}
                  onChange={(e) =>
                    setModel({
                      ...model,
                      resolution: Number(e.target.value) as 16 | 24 | 32,
                    })
                  }
                >
                  {[16, 24, 32].map((n) => (
                    <option key={n} value={n}>
                      {n} × {n} × {n}
                    </option>
                  ))}
                </select>
              </label>
              <div className="geology-toolbar">
                <button
                  className="geology-primary"
                  disabled={
                    editing || !capabilities?.canCompute || !activeProject
                  }
                  onClick={compute}
                >
                  <Play size={16} />
                  {t("Guardar e calcular", "Save and compute")}
                </button>
                <button
                  disabled={editing}
                  onClick={() =>
                    run(async () =>
                      downloadGeology(
                        "geomoz-modelo-dados.json",
                        JSON.stringify(spec(), null, 2),
                      ),
                    )
                  }
                >
                  <Download size={16} />
                  {t("Exportar dados", "Export inputs")}
                </button>
              </div>
              <p className="geology-hint">
                {t("Limite mensal", "Monthly limit")}:{" "}
                {capabilities?.monthlyLimit ?? "—"} ·{" "}
                {t(
                  "Uma execução de cada vez; até 100 modelos guardados.",
                  "One concurrent job; up to 100 stored models.",
                )}
              </p>
            </section>
          )}
        </aside>
        <div className="geology-results">
          {job && (
            <div className="geology-status">
              {job.name} · <strong>{status(job.status)}</strong>
              {activeJob(job) && (
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const next = await request<GeologicalJob>(
                        `/jobs/${job.id}/cancel`,
                        signal(),
                        { method: "POST" },
                      );
                      if (!signal().aborted) {
                        setJob(next);
                        idempotency.current = null;
                      }
                      await reloadHistory();
                    })
                  }
                >
                  {t("Cancelar cálculo", "Cancel computation")}
                </button>
              )}
            </div>
          )}
          {result ? (
            <>
              <GeologicalViewer
                key={job?.id ?? result.input.name}
                result={result}
                pt={pt}
              />
              <section className="geology-card">
                <p>
                  {t(
                    "Interpretação calculada a partir dos dados e hipóteses fornecidos. As superfícies interpoladas não são observações directas do subsolo.",
                    "Interpretation computed from supplied data and assumptions. Interpolated surfaces are not direct subsurface observations.",
                  )}
                </p>
                <div className="geology-toolbar">
                  <button
                    onClick={() =>
                      downloadGeology(
                        "geomoz-modelo-resultado.json",
                        JSON.stringify(result),
                      )
                    }
                  >
                    <Download size={16} />
                    {t(
                      "Exportar modelo e resultado",
                      "Export model and result",
                    )}
                  </button>
                  <span className="geology-hint">
                    GemPy {result.engine.gempy} · {result.input.crs}
                  </span>
                </div>
              </section>
            </>
          ) : (
            <section className="geology-card geology-empty">
              <Layers3 size={52} />
              <h2>
                {t(
                  "Construa a interpretação do subsolo",
                  "Build your subsurface interpretation",
                )}
              </h2>
              <p>
                {t(
                  "Carregue contactos e orientações, organize a sequência e execute o modelo. As superfícies 3D e secções aparecerão aqui.",
                  "Load contacts and orientations, organise the sequence and compute. 3D surfaces and sections will appear here.",
                )}
              </p>
              <span>
                {t(
                  "Contactos → Estrutura → Modelo → Secções",
                  "Contacts → Structure → Model → Sections",
                )}
              </span>
            </section>
          )}
          <section className="geology-card">
            <div className="geology-section-title">
              <h2>{t("Modelos do projecto", "Project models")}</h2>
              <button disabled={busy} onClick={() => run(reloadHistory)}>
                {t("Actualizar", "Refresh")}
              </button>
            </div>
            {!history.length && (
              <p className="geology-hint">
                {t(
                  "As execuções ficam guardadas no projecto seleccionado.",
                  "Calculations are saved in the selected project.",
                )}
              </p>
            )}
            {history.map((item) => (
              <div key={item.id} className="geology-history">
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {status(item.status)} ·{" "}
                    {new Date(item.createdAt).toLocaleString(
                      pt ? "pt-PT" : "en-GB",
                    )}
                  </small>
                </div>
                <button disabled={editing} onClick={() => reopen(item)}>
                  {t("Reabrir", "Reopen")}
                </button>
                {!activeJob(item) && (
                  <button disabled={busy} onClick={() => setDeleting(item.id)}>
                    {t("Eliminar", "Delete")}
                  </button>
                )}
                {deleting === item.id && (
                  <div role="alert">
                    <p>
                      {t(
                        "Eliminar os dados e resultados deste modelo? Esta acção é permanente.",
                        "Delete this model's inputs and results? This is permanent.",
                      )}
                    </p>
                    <button onClick={() => setDeleting(null)}>
                      {t("Voltar", "Back")}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await request(`/jobs/${item.id}`, signal(), {
                            method: "DELETE",
                          });
                          setDeleting(null);
                          if (job?.id === item.id) {
                            setJob(null);
                            setResult(null);
                          }
                          await reloadHistory();
                        })
                      }
                    >
                      {t("Confirmar eliminação", "Confirm deletion")}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </section>
          <footer className="geology-hint">
            {t("Motor científico", "Scientific engine")}:{" "}
            <a
              href="https://github.com/gempy-project/gempy"
              target="_blank"
              rel="noreferrer"
            >
              GemPy · EUPL-1.2
            </a>{" "}
            ·{" "}
            <a
              href="https://github.com/heltrakinho07/Geomoz-Explorer/tree/main/services/geomoz-gempy"
              target="_blank"
              rel="noreferrer"
            >
              {t("Código da integração", "Integration source")}
            </a>
          </footer>
        </div>
      </div>
      <ProjectWorkspaceModal
        open={projectModal}
        onOpenChange={setProjectModal}
        currentPlatformAOI={activeProject?.aoi ?? mozambiqueAOI()}
      />
    </main>
  );
}
