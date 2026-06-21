// ---- Core domain types ----

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

// ---- Organization & User types ----

export interface Organization {
  id: string;
  name: string;
  description: string;
  members: OrganizationMember[];
  _count?: { projects: number; members: number };
}

export interface OrganizationMember {
  id: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
  role: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

// ---- Sidebar types ----

export interface SidebarEndpoint {
  id: string;
  name: string;
  method: string;
  path: string;
  folderId: string | null;
}

export interface SidebarFolder {
  id: string;
  name: string;
  parentId?: string | null;
}

export type DragItem =
  | { type: "folder"; id: string }
  | { type: "endpoint"; id: string };

export type DropTarget =
  | { type: "folder"; id: string; position: "before" | "after" | "inside" }
  | { type: "endpoint"; id: string; position: "before" | "after" }
  | { type: "root" };

// ---- Reorder payloads ----

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

// ---- Test panel types ----

export interface SendRequestResult {
  status: number;
  headers: Record<string, string>;
  body: string;
  duration: number;
}

// ---- Dashboard nav ----

export interface DashboardNavUser {
  name: string;
  email: string;
  role: string;
}

export interface DashboardNavProps {
  user?: DashboardNavUser;
  projectName?: string;
}

// ---- Project list ----

export interface ProjectListItem {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  createdAt: string;
  organization: Organization;
  _count: {
    endpoints: number;
    folders: number;
  };
}

// ---- Detail view types (for endpoint-detail) ----

export interface EndpointDetailData {
  id: string;
  name: string;
  method: string;
  path: string;
  description: string;
  parameters?: EndpointParam[];
  requestBody?: RequestBody | null;
  responses?: EndpointResponse[];
}

export interface EndpointDetailProps {
  endpoint: EndpointDetailData;
  projectBaseUrl: string;
  globalHeaders: GlobalHeader[];
  globalParams: GlobalParam[];
  onSave: (data: Partial<EndpointDetailData>) => void;
}
