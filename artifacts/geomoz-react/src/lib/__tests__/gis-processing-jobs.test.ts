import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGISHeavyJob,
  downloadGISHeavyJobResult,
  getGISHeavyJob,
  waitForGISHeavyJob,
} from "../gis-processing-jobs";

describe("GIS heavy processing client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates multipart backend jobs with tool, parameters and file", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      const body = init?.body as FormData;
      expect(body.get("tool")).toBe("hillshade");
      expect(body.get("parameters")).toBe('{"azimuth":300}');
      const file = body.get("input_file") as File;
      expect(file.name).toBe("dem.tif");

      return new Response(
        JSON.stringify({
          job: {
            id: "job-1",
            tool: "hillshade",
            status: "queued",
            created_at: 1,
            updated_at: 1,
            input_name: "dem.tif",
            progress: 0,
            message: "Job recebido.",
            parameters: { azimuth: 300 },
          },
          status_url: "/geomoz-api/processing/jobs/job-1",
          result_url: "/geomoz-api/processing/jobs/job-1/result",
        }),
        { status: 202, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createGISHeavyJob({
      tool: "hillshade",
      file: new File([new Uint8Array([1, 2, 3])], "dem.tif", {
        type: "image/tiff",
      }),
      parameters: { azimuth: 300 },
    });

    expect(result.job.id).toBe("job-1");
    expect(result.job.status).toBe("queued");
  });

  it("reads job status and returns completed job immediately from poller", async () => {
    const completed = {
      id: "job-2",
      tool: "slope",
      status: "completed",
      created_at: 1,
      updated_at: 2,
      input_name: "dem.tif",
      output_name: "slope.tif",
      progress: 100,
      message: "Processamento concluído.",
      parameters: {},
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ job: completed }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    expect((await getGISHeavyJob("job-2")).status).toBe("completed");

    const progress = vi.fn();
    const result = await waitForGISHeavyJob({
      jobId: "job-2",
      onProgress: progress,
    });

    expect(result.status).toBe("completed");
    expect(progress).toHaveBeenCalledOnce();
  });

  it("downloads GeoTIFF results as File", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(new Uint8Array([9, 8, 7]), {
          status: 200,
          headers: {
            "Content-Type": "image/tiff",
            "Content-Disposition": 'attachment; filename="hillshade.tif"',
          },
        })
      )
    );

    const file = await downloadGISHeavyJobResult("job-3");
    expect(file.name).toBe("hillshade.tif");
    expect(file.type).toBe("image/tiff");
    expect(file.size).toBe(3);
  });

  it("surfaces backend detail errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: "Ferramenta inválida" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    await expect(
      createGISHeavyJob({
        tool: "aspect",
        file: new File([new Uint8Array([1])], "dem.tif", {
          type: "image/tiff",
        }),
      })
    ).rejects.toThrow("Ferramenta inválida");
  });
});
