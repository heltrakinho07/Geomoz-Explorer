/** Cloud restore permission and current source availability are independent.
 * Removing/replacing an unavailable raster can re-enable saves, but must never
 * re-enable a workspace whose cloud restore failed. */
export function canSyncGISWorkspaceToCloud(
  cloudRestoreSucceeded: boolean,
  rasters: ReadonlyArray<{ file?: File; remoteUrl?: string }>,
): boolean {
  return cloudRestoreSucceeded && rasters.every(
    (raster) => raster.file instanceof File || Boolean(raster.remoteUrl),
  );
}
