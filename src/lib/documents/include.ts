export const documentInclude = {
  parameters: { orderBy: [{ order: "asc" as const }, { id: "asc" as const }] },
  headers: { orderBy: [{ order: "asc" as const }, { id: "asc" as const }] },
  requestBody: true,
  responses: { orderBy: [{ order: "asc" as const }, { id: "asc" as const }] },
};
