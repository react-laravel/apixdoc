import type { Endpoint, Environment } from "@/lib/types";
export interface SpecificationSource {
  id: string;
  name: string;
  format: string;
  version: string;
  document: string;
  pointers: string;
  createdAt?: string | Date;
}
export interface ImportedEndpoint extends Omit<Endpoint, "id" | "folderId"> {
  folderPath: string[];
  sourcePointer: string;
  sourceDefinition: string;
  sourceBaseline: string;
  serverUrl: string;
  auth: string;
}
export interface ImportPlan {
  format: "openapi" | "postman";
  version: string;
  name: string;
  description: string;
  document: string;
  endpoints: ImportedEndpoint[];
  warnings: string[];
  environments: Environment[];
}
