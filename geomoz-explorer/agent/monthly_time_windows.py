from datetime import date


def month_slices(start, end):
    first, last = date.fromisoformat(start), date.fromisoformat(end)
    if first >= last:
        raise ValueError('Intervalo mensal inválido.')
    rows = []
    while first < last:
        next_month = (date(first.year + 1, 1, 1) if first.month == 12
                      else date(first.year, first.month + 1, 1))
        finish = min(last, next_month)
        rows.append({'month': first.strftime('%Y-%m'), 'startDate': first.isoformat(),
                     'endDate': finish.isoformat()})
        first = finish
    return rows
