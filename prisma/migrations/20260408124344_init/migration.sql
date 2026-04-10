-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "baseUrl" TEXT NOT NULL DEFAULT '',
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Folder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiEndpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'GET',
    "path" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "projectId" TEXT NOT NULL,
    "folderId" TEXT,
    "createdById" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApiEndpoint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApiEndpoint_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ApiEndpoint_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EndpointParam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpointId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'string',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL DEFAULT '',
    "example" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT 'query',
    CONSTRAINT "EndpointParam_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "ApiEndpoint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EndpointHeader" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpointId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "required" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "EndpointHeader_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "ApiEndpoint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RequestBody" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpointId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'application/json',
    "schema" TEXT NOT NULL DEFAULT '{}',
    "example" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "RequestBody_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "ApiEndpoint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EndpointResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpointId" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "contentType" TEXT NOT NULL DEFAULT 'application/json',
    "schema" TEXT NOT NULL DEFAULT '{}',
    "example" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "EndpointResponse_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "ApiEndpoint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GlobalHeader" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "GlobalHeader_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GlobalParam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT 'query',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "GlobalParam_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "variables" TEXT NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Environment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_userId_organizationId_key" ON "OrganizationMember"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "RequestBody_endpointId_key" ON "RequestBody"("endpointId");
