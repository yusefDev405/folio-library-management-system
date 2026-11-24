export function parsePagination(query, { maxLimit = 50, defaultLimit = 20 } = {}) {
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const rawLimit = Number.parseInt(query.limit ?? String(defaultLimit), 10) || defaultLimit;
  const limit = Math.min(maxLimit, Math.max(1, rawLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function paginatedEnvelope(data, { page, limit, total }) {
  return {
    data,
    meta: {
      page,
      limit,
      total: Number(total || 0),
    },
  };
}
