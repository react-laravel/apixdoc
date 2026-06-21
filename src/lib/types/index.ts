export interface Folder {
  id: string;
  name: string;
  parentId?: string | null;
  endpoints?: Endpoint[];
  children?: Folder[];
}

export interface Endpoint {
  id: string;
  name: string;
  method: string;
  path: string;
  description: string;
  folderId: string | null;
  parameters?: EndpointParam[];
  requestBody?: RequestBody | null;
  responses?: EndpointResponse[];
}

export interface EndpointParam {
  id?: string;
  name: string;
  type: string;
  required: boolean;
  location: string;
  description: string;
  example: string;
}

export interface RequestBody {
  id?: string;
  contentType: string;
  schema: string;
  example: string;
}

export interface EndpointResponse {
  id?: string;
  statusCode: number;
  description: string;
  contentType: string;
  example: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  isPublic: boolean;
  environments: Environment[];
  globalHeaders: GlobalHeader[];
  globalParams: GlobalParam[];
  folders: Folder[];
  endpoints: Endpoint[];
}

export interface Environment {
  id?: string;
  name: string;
  baseUrl: string;
  variables: string;
}

export interface GlobalHeader {
  id?: string;
  key: string;
  value: string;
  description: string;
  enabled: boolean;
}

export interface GlobalParam {
  id?: string;
  name: string;
  value: string;
  location: string;
  description: string;
  enabled: boolean;
}

export type FolderUpdate = {
  id: string;
  order: number;
  parentId?: string | null;
};

export type EndpointUpdate = {
  id: string;
  order: number;
  folderId: string | null;
};
