/**
 * Client-side cancellation and last-request-wins semantics for GEE hydrology.
 *
 * Aborting a browser request does not necessarily stop work already running in
 * Google Earth Engine. Callers must also check isCurrent before setting state.
 */
export class HydroRequestGuard {
  private active: AbortController | null = null;

  start(): AbortController {
    this.cancel();
    const controller = new AbortController();
    this.active = controller;
    return controller;
  }

  isCurrent(controller: AbortController): boolean {
    return this.active === controller && !controller.signal.aborted;
  }

  finish(controller: AbortController): boolean {
    const current = this.isCurrent(controller);
    if (this.active === controller) this.active = null;
    return current;
  }

  cancel(): boolean {
    const controller = this.active;
    this.active = null;
    controller?.abort();
    return controller !== null;
  }
}
