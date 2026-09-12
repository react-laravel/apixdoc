import type { ProjectPermissions } from "@/lib/permissions";
// ---- Core domain types ----

export interface Folder {
  id: string;
  name: string;
  parentId?: string | null;
  endpoints?: Endpoint[];
  children?: Folder[];
}

export interface Endpoint {
  projectId?: string;
  order?: number;
  saveMerged?: boolean;
  restoreNotice?: string;
  version?: number;
  deletedAt?: string | Date | null;
  projectLayoutVersion?: number;
  sourceImportId?: string | null;
  sourcePointer?: string;
  sourceDefinition?: string;
  sourceBaseline?: string;
  serverUrl?: string;
  auth?: string;
  id: string;
  name: string;
  method: string;
  path: string;
  description: string;
  folderId: string | null;
  parameters?: EndpointParam[];
  headers?: EndpointHeader[];
  requestBody?: RequestBody | null;
  responses?: EndpointResponse[];
}

export interface EndpointParam {
  schema?: string;
  id?: string;
  name: string;
  type: string;
  required: boolean;
  location: string;
  description: string;
  example: string;
}

export interface EndpointHeader {
  id?: string;
  key: string;
  value: string;
  description?: string;
  required?: boolean;
}

export interface RequestBody {
  content?: string;
  id?: string;
  contentType: string;
  schema: string;
  example: string;
}

export interface EndpointResponse {
  statusKey?: string;
  schema?: string;
  id?: string;
  statusCode: number;
  description: string;
  contentType: string;
  example: string;
}

export interface Project {
  settingsVersion?: number;
  settingsMerged?: boolean;
  publicationVersion?: number;
  publishedDocumentId?: string | null;
  publication?: {
    id: string;
    number: number;
    title: string;
    createdAt: string;
  };
  isDraftPreview?: boolean;
  isPublicationPreview?: boolean;
  publicationRevoked?: boolean;
  layoutVersion?: number;
  specificationImports?: import("@/lib/specification/types").SpecificationSource[];
  documentationVersion?: string;
  documentationSchemas?: Record<string, string>;
  permissions?: ProjectPermissions;
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
  isDefault?: boolean;
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
  teamVersion?: number;
  currentRole?: import("@/lib/team/roles").TeamRole;
  currentUserId?: string;
  invitations?: {
    id: string;
    email: string;
    role: import("@/lib/team/roles").InvitedRole;
    createdAt: string;
    expiresAt: string;
  }[];
  events?: {
    id: string;
    actorName: string;
    action: string;
    target: string;
    detail: string;
    createdAt: string;
  }[];
  permissions?: ProjectPermissions;
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
  { type: "folder"; id: string } | { type: "endpoint"; id: string };

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
  canReadAudit?: boolean;
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
  projectId?: string;
  saveMerged?: boolean;
  restoreNotice?: string;
  version?: number;
  deletedAt?: string | Date | null;
  folderId?: string | null;
  order?: number;
  projectLayoutVersion?: number;
  sourceImportId?: string | null;
  sourcePointer?: string;
  sourceDefinition?: string;
  sourceBaseline?: string;
  serverUrl?: string;
  auth?: string;
  id: string;
  name: string;
  method: string;
  path: string;
  description: string;
  parameters?: EndpointParam[];
  headers?: EndpointHeader[];
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
