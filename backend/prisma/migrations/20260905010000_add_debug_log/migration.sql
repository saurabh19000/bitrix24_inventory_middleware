CREATE TABLE "DebugLog" (
    "id" UUID NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "source" TEXT NOT NULL DEFAULT 'SYSTEM',
    "message" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DebugLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DebugLog_level_idx" ON "DebugLog"("level");
CREATE INDEX "DebugLog_source_idx" ON "DebugLog"("source");
CREATE INDEX "DebugLog_createdAt_idx" ON "DebugLog"("createdAt");
