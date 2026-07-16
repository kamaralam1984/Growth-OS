-- CreateEnum
CREATE TYPE "MemorySourceKind" AS ENUM ('MEETING', 'DEAL', 'PROPOSAL', 'PROJECT', 'TASK', 'MANUAL');

-- CreateEnum
CREATE TYPE "MemoryEventType" AS ENUM ('CREATED', 'EDITED', 'PINNED', 'UNPINNED', 'ARCHIVED', 'RESTORED', 'DELETED');

-- CreateEnum
CREATE TYPE "KnowledgeArticleKind" AS ENUM ('ARTICLE', 'FAQ', 'POLICY', 'PROCEDURE', 'PLAYBOOK', 'TEMPLATE', 'MEETING_NOTES', 'SOP', 'TECHNICAL_DOC', 'SALES_DOC', 'HR_DOC', 'FINANCE_DOC');

-- CreateEnum
CREATE TYPE "KnowledgeArticleStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KnowledgeArticleVisibility" AS ENUM ('PRIVATE', 'ORG');

-- CreateEnum
CREATE TYPE "IngestedDocumentSourceKind" AS ENUM ('UPLOAD', 'KNOWLEDGE_ARTICLE', 'DEAL', 'PROJECT', 'MEETING', 'PROPOSAL');

-- CreateEnum
CREATE TYPE "IngestedDocumentStatus" AS ENUM ('PENDING', 'PARSING', 'CHUNKING', 'EMBEDDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "EmbeddingProvider" AS ENUM ('OPENAI', 'VOYAGE', 'COHERE', 'BGE', 'JINA');

-- CreateEnum
CREATE TYPE "EmbeddingSourceType" AS ENUM ('KNOWLEDGE_ARTICLE', 'AGENT_MEMORY', 'DOCUMENT_CHUNK');

-- CreateEnum
CREATE TYPE "GraphEntityType" AS ENUM ('CLIENT', 'COMPANY', 'PROJECT', 'EMPLOYEE', 'MEETING', 'TASK', 'DOCUMENT', 'EMAIL', 'DEAL', 'AI_DECISION', 'KNOWLEDGE_ARTICLE');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('WORKS_ON', 'OWNS', 'BELONGS_TO', 'ATTENDED', 'MENTIONS', 'RELATED_TO', 'DECIDED_IN', 'ASSIGNED_TO', 'AUTHORED');

-- CreateEnum
CREATE TYPE "BookmarkKind" AS ENUM ('BOOKMARK', 'FAVORITE');

-- CreateEnum
CREATE TYPE "BookmarkableType" AS ENUM ('KNOWLEDGE_ARTICLE', 'DEAL', 'PROJECT', 'COMPANY', 'CONTACT', 'DOCUMENT', 'MEETING');

-- AlterEnum
ALTER TYPE "CommentDocKind" ADD VALUE 'KNOWLEDGE_ARTICLE';

-- AlterTable
ALTER TABLE "AgentMemory" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceKind" "MemorySourceKind";

-- AlterTable
ALTER TABLE "KnowledgeArticle" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "kind" "KnowledgeArticleKind" NOT NULL DEFAULT 'ARTICLE',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByUserId" TEXT,
ADD COLUMN     "status" "KnowledgeArticleStatus" NOT NULL DEFAULT 'PUBLISHED',
ADD COLUMN     "visibility" "KnowledgeArticleVisibility" NOT NULL DEFAULT 'ORG';

-- CreateTable
CREATE TABLE "AgentMemoryEvent" (
    "id" TEXT NOT NULL,
    "memoryId" TEXT,
    "agentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventType" "MemoryEventType" NOT NULL,
    "contentSnapshot" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMemoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeTag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticleVersion" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "editedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeArticleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeAttachment" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestedDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceKind" "IngestedDocumentSourceKind" NOT NULL,
    "sourceId" TEXT,
    "originalFilename" TEXT,
    "mimeType" TEXT,
    "storageKey" TEXT,
    "status" "IngestedDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "ingestedDocumentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Embedding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceType" "EmbeddingSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "provider" "EmbeddingProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "vector" DOUBLE PRECISION[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Embedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeGraphNode" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" "GraphEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeGraphNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relationship" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "type" "RelationshipType" NOT NULL,
    "weight" DOUBLE PRECISION DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Citation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "sourceType" "EmbeddingSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "relevanceScore" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchHistory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "isSemanticSearch" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "BookmarkKind" NOT NULL,
    "targetType" "BookmarkableType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ArticleTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ArticleTags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "AgentMemoryEvent_organizationId_agentId_idx" ON "AgentMemoryEvent"("organizationId", "agentId");

-- CreateIndex
CREATE INDEX "AgentMemoryEvent_memoryId_idx" ON "AgentMemoryEvent"("memoryId");

-- CreateIndex
CREATE INDEX "KnowledgeCategory_organizationId_parentId_idx" ON "KnowledgeCategory"("organizationId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeCategory_organizationId_slug_key" ON "KnowledgeCategory"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "KnowledgeTag_organizationId_idx" ON "KnowledgeTag"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeTag_organizationId_slug_key" ON "KnowledgeTag"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "KnowledgeArticleVersion_articleId_idx" ON "KnowledgeArticleVersion"("articleId");

-- CreateIndex
CREATE INDEX "KnowledgeAttachment_articleId_idx" ON "KnowledgeAttachment"("articleId");

-- CreateIndex
CREATE INDEX "IngestedDocument_organizationId_status_idx" ON "IngestedDocument"("organizationId", "status");

-- CreateIndex
CREATE INDEX "DocumentChunk_ingestedDocumentId_idx" ON "DocumentChunk"("ingestedDocumentId");

-- CreateIndex
CREATE INDEX "DocumentChunk_organizationId_idx" ON "DocumentChunk"("organizationId");

-- CreateIndex
CREATE INDEX "Embedding_organizationId_sourceType_idx" ON "Embedding"("organizationId", "sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "Embedding_sourceType_sourceId_provider_key" ON "Embedding"("sourceType", "sourceId", "provider");

-- CreateIndex
CREATE INDEX "KnowledgeGraphNode_organizationId_entityType_idx" ON "KnowledgeGraphNode"("organizationId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeGraphNode_organizationId_entityType_entityId_key" ON "KnowledgeGraphNode"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Relationship_organizationId_idx" ON "Relationship"("organizationId");

-- CreateIndex
CREATE INDEX "Relationship_fromNodeId_idx" ON "Relationship"("fromNodeId");

-- CreateIndex
CREATE INDEX "Relationship_toNodeId_idx" ON "Relationship"("toNodeId");

-- CreateIndex
CREATE INDEX "Citation_organizationId_queryId_idx" ON "Citation"("organizationId", "queryId");

-- CreateIndex
CREATE INDEX "SearchHistory_organizationId_userId_idx" ON "SearchHistory"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "SearchHistory_organizationId_createdAt_idx" ON "SearchHistory"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Bookmark_organizationId_userId_idx" ON "Bookmark"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_userId_kind_targetType_targetId_key" ON "Bookmark"("userId", "kind", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "_ArticleTags_B_index" ON "_ArticleTags"("B");

-- CreateIndex
CREATE INDEX "AgentMemory_agentId_pinned_idx" ON "AgentMemory"("agentId", "pinned");

-- CreateIndex
CREATE INDEX "AgentMemory_agentId_archivedAt_idx" ON "AgentMemory"("agentId", "archivedAt");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_categoryId_idx" ON "KnowledgeArticle"("categoryId");

-- AddForeignKey
ALTER TABLE "AgentMemoryEvent" ADD CONSTRAINT "AgentMemoryEvent_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "AgentMemory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMemoryEvent" ADD CONSTRAINT "AgentMemoryEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCategory" ADD CONSTRAINT "KnowledgeCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCategory" ADD CONSTRAINT "KnowledgeCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeTag" ADD CONSTRAINT "KnowledgeTag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleVersion" ADD CONSTRAINT "KnowledgeArticleVersion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleVersion" ADD CONSTRAINT "KnowledgeArticleVersion_editedByUserId_fkey" FOREIGN KEY ("editedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeAttachment" ADD CONSTRAINT "KnowledgeAttachment_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeAttachment" ADD CONSTRAINT "KnowledgeAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestedDocument" ADD CONSTRAINT "IngestedDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestedDocument" ADD CONSTRAINT "IngestedDocument_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_ingestedDocumentId_fkey" FOREIGN KEY ("ingestedDocumentId") REFERENCES "IngestedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embedding" ADD CONSTRAINT "Embedding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeGraphNode" ADD CONSTRAINT "KnowledgeGraphNode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "KnowledgeGraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "KnowledgeGraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchHistory" ADD CONSTRAINT "SearchHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchHistory" ADD CONSTRAINT "SearchHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ArticleTags" ADD CONSTRAINT "_ArticleTags_A_fkey" FOREIGN KEY ("A") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ArticleTags" ADD CONSTRAINT "_ArticleTags_B_fkey" FOREIGN KEY ("B") REFERENCES "KnowledgeTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
