/** Earth Engine uses half-open date intervals: [start, end). */
function validDate(value: string): boolean {
  const time = Date.parse(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(time)
    && new Date(time).toISOString().slice(0, 10) === value;
}
export function validateFirePeriods(postStart: string, postEnd: string, preStart: string, preEnd: string): string | null {
  if (![postStart, postEnd, preStart, preEnd].every(validDate)) return "Preencha as quatro datas dos períodos pré e pós-incêndio.";
  if (postStart >= postEnd) return "O início pós-incêndio deve ser anterior ao fim.";
  if (preStart >= preEnd) return "O início pré-incêndio deve ser anterior ao fim.";
  if (preEnd > postStart) return "Os períodos sobrepõem-se: o fim pré-incêndio deve ser anterior ou igual ao início pós-incêndio.";
  return null;
}
export function precedingFirePeriod(start: string, end: string): { start: string; end: string } | null {
  if (!validDate(start) || !validDate(end) || start >= end) return null;
  const duration = Date.parse(end) - Date.parse(start);
  return { start: new Date(Date.parse(start) - duration).toISOString().slice(0, 10), end: start };
}
